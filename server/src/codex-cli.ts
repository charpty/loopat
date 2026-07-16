type JsonObject = Record<string, unknown>

export type CodexEvent = JsonObject & { type: string }

export type CodexUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export type CodexCompletedItem = {
  type: string
  text?: string
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function errorMessage(value: unknown): string | null {
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "string") {
      const text = current.trim()
      if (!text) return null
      try {
        current = JSON.parse(text) as unknown
        continue
      } catch {
        return text
      }
    }

    const record = asObject(current)
    if (!record) return null
    const nestedError = asObject(record.error)
    current = nestedError?.message ?? record.message ?? record.error
  }
  return typeof current === "string" && current.trim() ? current.trim() : null
}

export function parseCodexEvent(line: string): CodexEvent | null {
  const text = line.trim()
  if (!text) return null
  try {
    const value = asObject(JSON.parse(text) as unknown)
    return value && typeof value.type === "string"
      ? value as CodexEvent
      : null
  } catch {
    return null
  }
}

/** Codex emits terminal API failures as JSONL events on stdout. */
export function codexEventError(event: unknown): string | null {
  const record = asObject(event)
  if (!record) return null
  if (record.type === "turn.failed") return errorMessage(record.error)
  if (record.type === "error") return errorMessage(record.message ?? record.error)
  return null
}

export function codexThreadId(event: CodexEvent): string | null {
  return event.type === "thread.started" && typeof event.thread_id === "string"
    ? event.thread_id
    : null
}

export function codexCompletedItem(event: CodexEvent): CodexCompletedItem | null {
  if (event.type !== "item.completed") return null
  const item = asObject(event.item)
  if (!item || typeof item.type !== "string") return null
  return {
    type: item.type,
    ...(typeof item.text === "string" ? { text: item.text } : {}),
  }
}

export function codexTurnUsage(event: CodexEvent): CodexUsage | null {
  if (event.type !== "turn.completed") return null
  const usage = asObject(event.usage)
  if (!usage) return null
  return {
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
    cachedInputTokens: typeof usage.cached_input_tokens === "number" ? usage.cached_input_tokens : 0,
  }
}

export function codexBinary(): string {
  return process.env.LOOPAT_CODEX_BIN || "codex"
}

export function buildCodexEnv(opts: {
  apiKey?: string
  baseUrl?: string
}, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  if (opts.apiKey) {
    env.CODEX_API_KEY = opts.apiKey
    env.OPENAI_API_KEY = opts.apiKey
  }
  const baseUrl = opts.baseUrl?.trim().replace(/\/+$/, "")
  if (baseUrl) {
    env.CODEX_BASE_URL = baseUrl
    env.OPENAI_BASE_URL = baseUrl
  }
  return env
}

export function buildCodexExecArgs(opts: {
  workdir: string
  threadId?: string | null
  modelArg?: string
  sandbox?: "read-only" | "workspace-write"
  ephemeral?: boolean
}): string[] {
  const modelArgs = opts.modelArg ? ["-m", opts.modelArg] : []
  if (opts.threadId) {
    return [
      "exec",
      "resume",
      "--json",
      "--skip-git-repo-check",
      ...modelArgs,
      opts.threadId,
      "-",
    ]
  }
  return [
    "exec",
    "--json",
    "--sandbox",
    opts.sandbox ?? "workspace-write",
    ...(opts.ephemeral ? ["--ephemeral"] : []),
    "--cd",
    opts.workdir,
    "--skip-git-repo-check",
    ...modelArgs,
    "-",
  ]
}
