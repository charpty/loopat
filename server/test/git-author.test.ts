import { describe, expect, test } from "bun:test"
import { selectGitAuthor } from "../src/git-author"

describe("personal repository git author", () => {
  test("uses platform identity before admin and host defaults", () => {
    expect(selectGitAuthor({
      preferred: { name: "Alice", email: "alice@example.com" },
      configured: { name: "Admin", email: "admin@example.com" },
      existing: { name: "Host", email: "host@example.com" },
    })).toEqual({ name: "Alice", email: "alice@example.com" })
  })

  test("uses administrator override when the provider omits email", () => {
    expect(selectGitAuthor({
      preferred: { name: "Alice" },
      configured: { email: "alice@example.com" },
      existing: { name: "Host", email: "host@example.com" },
    })).toEqual({ name: "Alice", email: "alice@example.com" })
  })

  test("preserves the repository or host git identity before local fallback", () => {
    expect(selectGitAuthor({
      preferred: { name: "Alice" },
      existing: { name: "Host", email: "alice@example.com" },
    })).toEqual({ name: "Alice", email: "alice@example.com" })
  })
})
