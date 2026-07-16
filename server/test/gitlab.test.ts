import { describe, expect, test } from "bun:test"
import {
  gitlabDirectRepo,
  gitlabAuthModes,
  gitlabClient,
  gitlabRequestUrl,
  parseGitlabViewerPayload,
  repoPathFromInput,
} from "../src/gitlab"

describe("GitLab viewer compatibility", () => {
  test("resolves an administrator-pinned project to host SSH", () => {
    expect(gitlabDirectRepo("https://gitlab.example.com", "team/loopat-personal")).toEqual({
      url: "git@gitlab.example.com:team/loopat-personal.git",
      path: "team/loopat-personal",
      owner: "team",
    })
  })

  test("requires a valid host and qualified project path for host SSH", () => {
    expect(gitlabDirectRepo("https://gitlab.example.com", "loopat-personal")).toBeNull()
    expect(gitlabDirectRepo("file:///tmp/gitlab", "team/loopat-personal")).toBeNull()
    expect(gitlabDirectRepo("https://gitlab.example.com", "team/../loopat-personal")).toBeNull()
  })

  test("parses a standard GitLab user", () => {
    expect(parseGitlabViewerPayload({
      id: 17,
      username: "alice",
      commit_email: "alice@example.com",
    })).toEqual({
      login: "alice",
      namespaceLogin: "alice",
      id: 17,
      email: "alice@example.com",
    })
  })

  test("unwraps enterprise user envelopes and alternate login fields", () => {
    expect(parseGitlabViewerPayload({
      data: { user: { userName: "alice", id: "123" } },
    })).toEqual({
      login: "alice",
      namespaceLogin: "alice",
      id: "123",
      email: undefined,
    })
  })

  test("derives the namespace from email when username is omitted", () => {
    expect(parseGitlabViewerPayload({
      id: 17,
      name: "Alice Example",
      email: "alice@example.com",
    })).toMatchObject({
      login: "alice",
      namespaceLogin: "alice",
    })
  })

  test("uses oauth2 only as transport fallback when no namespace is exposed", () => {
    expect(parseGitlabViewerPayload({ id: 17, name: "Example User" })).toEqual({
      login: "oauth2",
      namespaceLogin: undefined,
      id: 17,
      email: undefined,
    })
  })

  test("keeps a full namespace/project path without a viewer username", () => {
    expect(repoPathFromInput("https://gitlab.example.com/team/loopat-personal.git"))
      .toBe("team/loopat-personal")
  })

  test("requires a full path when the account namespace is unavailable", () => {
    expect(() => repoPathFromInput("loopat-personal"))
      .toThrow("enter repository as namespace/project")
  })

  test("supports private_token query authentication as a fallback", () => {
    const client = gitlabClient("test-token", "https://gitlab.example.com")
    const url = new URL(gitlabRequestUrl(
      client,
      "/projects?membership=true&per_page=1",
      "query",
    ))
    expect(url.searchParams.get("membership")).toBe("true")
    expect(url.searchParams.get("per_page")).toBe("1")
    expect(url.searchParams.get("private_token")).toBe("test-token")
  })

  test("keeps standard GitLab header auth ahead of query auth", () => {
    expect(gitlabAuthModes())
      .toEqual(["private-token", "bearer", "query"])
  })
})
