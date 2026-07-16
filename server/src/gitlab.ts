/**
 * GitLab-compatible integration for loopat personal storage.
 *
 * `baseUrl` is the human-facing site root by default (for example
 * https://gitlab.com or https://gitlab.example.com). API calls derive
 * `${baseUrl}/api/v4`; callers may also pass a full `/api/v4` URL for older
 * configs and we will recover the site root for links / clone URLs.
 */
import { registerProvider, type DirectRepo, type GitHostProvider } from "./git-host"

export type GitlabClient = {
  token: string
  webBaseUrl: string
  apiBaseUrl: string
}

export type GitlabViewer = {
  /** Account namespace when available; `oauth2` is the git-auth fallback. */
  login: string
  namespaceLogin?: string
  id?: number | string
  email?: string
}

const DEFAULT_GITLAB_BASE_URL = process.env.LOOPAT_GITLAB_BASE_URL || "https://gitlab.com"

type JsonObject = Record<string, unknown>

type GitlabProject = {
  id?: number | string
  name?: string
  web_url?: string
  http_url_to_repo?: string
  path_with_namespace?: string
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "")
}

function normalizeGitlabUrls(baseUrl = DEFAULT_GITLAB_BASE_URL): { webBaseUrl: string; apiBaseUrl: string } {
  const raw = trimSlash(baseUrl.trim() || DEFAULT_GITLAB_BASE_URL)
  if (/\/api\/v4$/i.test(raw)) {
    return { webBaseUrl: raw.replace(/\/api\/v4$/i, ""), apiBaseUrl: raw }
  }
  return { webBaseUrl: raw, apiBaseUrl: `${raw}/api/v4` }
}

export function gitlabClient(token: string, baseUrl = DEFAULT_GITLAB_BASE_URL): GitlabClient {
  return { token, ...normalizeGitlabUrls(baseUrl) }
}

type GitlabResponse<T> = {
  status: number
  data: T
  contentType: string
}

export type GitlabAuthMode = "query" | "private-token" | "bearer"

export function gitlabAuthModes(): GitlabAuthMode[] {
  return ["private-token", "bearer", "query"]
}

export function gitlabRequestUrl(c: GitlabClient, path: string, authMode: GitlabAuthMode): string {
  const url = new URL(`${c.apiBaseUrl}${path}`)
  if (authMode === "query") url.searchParams.set("private_token", c.token)
  return url.toString()
}

async function glRequest<T = unknown>(
  c: GitlabClient,
  method: string,
  path: string,
  authMode: GitlabAuthMode,
  body?: unknown,
): Promise<GitlabResponse<T>> {
  const res = await fetch(gitlabRequestUrl(c, path, authMode), {
    method,
    headers: {
      ...(authMode === "private-token"
        ? { "PRIVATE-TOKEN": c.token }
        : authMode === "bearer"
          ? { Authorization: `Bearer ${c.token}` }
          : {}),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  })
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  return {
    status: res.status,
    data: data as T,
    contentType: res.headers.get("content-type") ?? "",
  }
}

function shouldRetryAuth(r: GitlabResponse<unknown>): boolean {
  if ([301, 302, 303, 307, 308, 401, 403].includes(r.status)) return true
  return r.status >= 200 && r.status < 300 &&
    (r.contentType.includes("text/html") || typeof r.data === "string")
}

async function gl<T = unknown>(
  c: GitlabClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<GitlabResponse<T>> {
  let last: GitlabResponse<T> | null = null
  for (const authMode of gitlabAuthModes()) {
    last = await glRequest<T>(c, method, path, authMode, body)
    if (!shouldRetryAuth(last)) return last
  }
  if (last) return last
  throw new Error("gitlab authentication modes are not configured")
}

function formatMessage(data: unknown): string {
  if (!data) return ""
  if (typeof data === "string") return data.replace(/\s+/g, " ").trim().slice(0, 300)
  const message = asObject(data)?.message
  if (typeof message === "string") return message
  if (message) {
    try { return JSON.stringify(message) } catch { return String(message) }
  }
  try { return JSON.stringify(data) } catch { return String(data) }
}

function fail(op: string, r: { status: number; data: unknown }): never {
  const msg = formatMessage(r.data)
  throw new Error(`gitlab ${op} failed (${r.status})${msg ? `: ${msg}` : ""}`)
}

function stripGitSuffix(s: string): string {
  return s.replace(/\.git$/i, "")
}

export function repoPathFromInput(input: string, login?: string): string {
  let raw = stripGitSuffix(input.trim())
  if (!raw) {
    if (login) return login
    throw new Error("repo name required")
  }

  const sshMatch = raw.match(/^git@[^:]+:(.+)$/)
  if (sshMatch) raw = sshMatch[1] ?? raw
  else if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      raw = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
    } catch {
      // Leave raw as-is; the validation below will produce a useful error.
    }
  }

  raw = stripGitSuffix(raw).replace(/^\/+/, "").replace(/\/+$/, "")
  if (raw.includes("/")) return raw
  if (!login) {
    throw new Error("gitlab user response has no namespace username; enter repository as namespace/project")
  }
  return `${login}/${raw}`
}

/**
 * Some self-hosted GitLab deployments protect the API behind SSO while normal
 * SSH git access remains available. Resolve an administrator-configured full
 * project path to an SSH URL so onboarding can skip the API.
 */
export function gitlabDirectRepo(baseUrl: string | undefined, repoName: string): DirectRepo | null {
  let site: URL
  try {
    site = new URL(normalizeGitlabUrls(baseUrl).webBaseUrl)
  } catch {
    return null
  }
  if (!site.hostname || (site.protocol !== "https:" && site.protocol !== "http:")) return null

  let path: string
  try {
    path = repoPathFromInput(repoName)
  } catch {
    return null
  }
  const parts = path.split("/").filter(Boolean)
  const validPath = parts.length >= 2 && parts.every((part) =>
    part !== "." && part !== ".." && /^[a-zA-Z0-9_.-]+$/.test(part))
  if (!validPath) return null
  return {
    url: `git@${site.hostname.toLowerCase()}:${path}.git`,
    path,
    owner: parts[0]!,
  }
}

function projectName(pathWithNamespace: string): string {
  const parts = pathWithNamespace.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : pathWithNamespace
}

function encodeProjectId(pathWithNamespace: string): string {
  return encodeURIComponent(pathWithNamespace)
}

function recordsInUserEnvelope(data: unknown): JsonObject[] {
  const root = asObject(data)
  if (!root) return []
  const records: JsonObject[] = []
  const queue: Array<{ value: JsonObject; depth: number }> = [
    { value: root, depth: 0 },
  ]
  const seen = new Set<object>()
  const envelopeKeys = ["data", "result", "user", "current_user", "currentUser"]
  while (queue.length > 0) {
    const item = queue.shift()!
    if (seen.has(item.value)) continue
    seen.add(item.value)
    records.push(item.value)
    if (item.depth >= 3) continue
    for (const key of envelopeKeys) {
      const nested = item.value[key]
      const record = asObject(nested)
      if (record) queue.push({ value: record, depth: item.depth + 1 })
    }
  }
  return records
}

function firstString(records: JsonObject[], keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  return undefined
}

function namespaceSafe(value: string | undefined): string | undefined {
  if (!value) return undefined
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value) ? value : undefined
}

/** Parse standard GitLab users and wrapped enterprise responses. */
export function parseGitlabViewerPayload(data: unknown): GitlabViewer | null {
  const records = recordsInUserEnvelope(data)
  if (records.length === 0) return null

  const email = firstString(records, ["commit_email", "public_email", "email", "mail"])
  const explicitLogin = namespaceSafe(firstString(records, [
    "username",
    "login",
    "user_name",
    "userName",
    "login_name",
    "loginName",
    "account",
    "account_name",
    "accountName",
    "emp_id",
    "empId",
    "work_no",
    "workNo",
  ]))
  const emailLogin = namespaceSafe(email?.split("@", 1)[0])
  const nameLogin = namespaceSafe(firstString(records, ["name"]))
  const namespaceLogin = explicitLogin ?? emailLogin ?? nameLogin
  const id = records
    .map((record) => record.id ?? record.user_id ?? record.userId)
    .find((value): value is number | string =>
      typeof value === "number" || (typeof value === "string" && value.trim().length > 0))

  // A successful response can omit username, but it should still contain
  // some identity signal. Do not mistake an HTML/login envelope for a user.
  if (!namespaceLogin && !email && id === undefined) return null
  return {
    login: namespaceLogin ?? "oauth2",
    namespaceLogin,
    id,
    email,
  }
}

function projectItems(value: unknown): GitlabProject[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap((item) => {
    const record = asObject(item)
    return record ? [record as GitlabProject] : []
  })
}

function gitlabProjectItems(data: unknown): GitlabProject[] | null {
  const direct = projectItems(data)
  if (direct) return direct
  const records = recordsInUserEnvelope(data)
  for (const record of records) {
    for (const key of ["data", "result", "projects", "items", "list"]) {
      const items = projectItems(record[key])
      if (items) return items
    }
  }
  return null
}

export async function getGitlabViewer(c: GitlabClient): Promise<GitlabViewer> {
  const r = await gl(c, "GET", "/user")
  if (r.status === 200) {
    const viewer = parseGitlabViewerPayload(r.data)
    if (viewer) return viewer
  }

  // A self-hosted `/user` route can redirect to SSO even when its repository
  // API accepts the token. A successful read-only project-list response proves
  // the token without requiring a profile endpoint. Full namespace/project
  // inputs remain unambiguous.
  const probe = await gl(c, "GET", "/projects?membership=true&simple=true&per_page=1")
  if (probe.status === 200 && gitlabProjectItems(probe.data) !== null) {
    return { login: "oauth2" }
  }

  if (r.status !== 200) fail("authenticate", r)
  if (probe.status !== 200) fail("authenticate", probe)
  throw new Error("gitlab authenticate failed: unrecognized user response")
}

export async function ensureGitlabProject(
  c: GitlabClient,
  nameOrPath: string,
  opts: { private?: boolean; description?: string } = {},
): Promise<{ created: boolean; httpUrl: string; path: string }> {
  const me = await getGitlabViewer(c)
  const pathWithNamespace = repoPathFromInput(nameOrPath, me.namespaceLogin)
  const existing = await gl<GitlabProject>(c, "GET", `/projects/${encodeProjectId(pathWithNamespace)}`)
  if (existing.status === 200) {
    const webUrl = existing.data.web_url ? `${existing.data.web_url}.git` : ""
    return {
      created: false,
      httpUrl: existing.data.http_url_to_repo || webUrl,
      path: existing.data.path_with_namespace ?? pathWithNamespace,
    }
  }
  if (existing.status !== 404) fail("get project", existing)

  const parts = pathWithNamespace.split("/").filter(Boolean)
  const path = parts.pop()
  const namespacePath = parts.join("/")
  if (!path) throw new Error("repo name required")

  const body: Record<string, unknown> = {
    name: path,
    path,
    visibility: opts.private === false ? "public" : "private",
    description: opts.description ?? "loopat",
  }

  // User namespace creation needs no namespace_id. Group/subgroup creation does.
  if (namespacePath && namespacePath !== me.login) {
    const ns = await gl<{ id?: number | string }>(c, "GET", `/namespaces/${encodeURIComponent(namespacePath)}`)
    if (ns.status !== 200 || !ns.data?.id) fail("get namespace", ns)
    body.namespace_id = ns.data.id
  }

  const r = await gl<GitlabProject>(c, "POST", "/projects", body)
  if (r.status !== 201) fail("create project", r)
  const webUrl = r.data.web_url ? `${r.data.web_url}.git` : ""
  return {
    created: true,
    httpUrl: r.data.http_url_to_repo || webUrl,
    path: r.data.path_with_namespace ?? pathWithNamespace,
  }
}

export const gitlabProvider: GitHostProvider = {
  id: "gitlab",
  label: "GitLab",
  gitAuthMode: "https-token",
  baseUrl: DEFAULT_GITLAB_BASE_URL,
  defaultRepo: "loopat-personal",
  tokenHelp: "Create a personal/private token with api, read_repository, and write_repository scopes.",
  directRepo({ baseUrl, repoName }) {
    return gitlabDirectRepo(baseUrl, repoName)
  },
  async authenticate(cred) {
    return await getGitlabViewer(gitlabClient(cred.token, cred.baseUrl))
  },
  async ensureRepo(cred, name, opts) {
    const r = await ensureGitlabProject(gitlabClient(cred.token, cred.baseUrl), name, { private: opts?.private })
    return { url: r.httpUrl, created: r.created, path: r.path }
  },
  async listRepos(cred) {
    const c = gitlabClient(cred.token, cred.baseUrl)
    const r = await gl(c, "GET", "/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at&sort=desc")
    if (r.status !== 200) fail("list projects", r)
    const items = gitlabProjectItems(r.data) ?? []
    return items.flatMap((project) => {
      const path = project.path_with_namespace || project.name
      if (!path) return []
      return [{ name: project.name || projectName(path), path }]
    })
  },
  async grantAccess(cred, repo, login, level) {
    const c = gitlabClient(cred.token, cred.baseUrl)
    const projectPath = `${repo.owner}/${repo.name}`
    const users = await gl<Array<{ id?: number | string }>>(c, "GET", `/users?username=${encodeURIComponent(login)}`)
    if (users.status !== 200) fail("find user", users)
    const userId = Array.isArray(users.data) ? users.data[0]?.id : undefined
    if (!userId) throw new Error(`gitlab user not found: ${login}`)
    const r = await gl(c, "POST", `/projects/${encodeProjectId(projectPath)}/members`, {
      user_id: userId,
      access_level: level === "write" ? 30 : 20,
    })
    if (r.status !== 201 && r.status !== 409) fail("add member", r)
  },
  async seedDefaults(ctx) {
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const run = promisify(execFile)

    const config = {
      providers: {
        default: "Codex/gpt-5-codex",
        Codex: {
          runtime: "codex",
          model: "gpt-5-codex",
          baseUrl: "https://api.openai.com/v1",
          models: [{ id: "gpt-5-codex", maxContextTokens: 20000000 }],
          enabled: true,
        },
      },
    }
    await fs.mkdir(path.join(ctx.repoDir, ".loopat"), { recursive: true })
    await fs.writeFile(path.join(ctx.repoDir, ".loopat", "config.json"), JSON.stringify(config, null, 2) + "\n")

    const sshDir = path.join(ctx.vaultDir, "mounts", "home", ".ssh")
    await fs.mkdir(sshDir, { recursive: true })
    await run("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", `loopat:${ctx.login}`, "-f", path.join(sshDir, "id_ed25519")])
    await fs.writeFile(path.join(sshDir, "config"), "Host *\n    StrictHostKeyChecking accept-new\n")
  },
}

registerProvider(gitlabProvider)
