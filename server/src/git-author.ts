export type GitAuthor = { name?: string; email?: string }

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim())?.trim()
}

/** Resolve commit identity without replacing a valid host/repository config. */
export function selectGitAuthor(opts: {
  preferred?: GitAuthor
  configured?: GitAuthor
  existing?: GitAuthor
}): Required<GitAuthor> {
  return {
    name: firstNonEmpty(opts.preferred?.name, opts.configured?.name, opts.existing?.name) ?? "loopat",
    email: firstNonEmpty(opts.preferred?.email, opts.configured?.email, opts.existing?.email) ?? "loopat@local",
  }
}
