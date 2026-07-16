import { describe, expect, test } from "bun:test"
import {
  buildCodexEnv,
  buildCodexExecArgs,
  codexCompletedItem,
  codexEventError,
  codexTurnUsage,
  parseCodexEvent,
} from "../src/codex-cli"

describe("Codex CLI adapter", () => {
  test("builds fresh and resumed commands for non-git workspaces", () => {
    expect(buildCodexExecArgs({ workdir: "/tmp/loop" })).toEqual([
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "--cd",
      "/tmp/loop",
      "--skip-git-repo-check",
      "-",
    ])

    expect(buildCodexExecArgs({
      workdir: "/tmp/loop",
      threadId: "thread-id",
      modelArg: "gpt-test",
    })).toEqual([
      "exec",
      "resume",
      "--json",
      "--skip-git-repo-check",
      "-m",
      "gpt-test",
      "thread-id",
      "-",
    ])
  })

  test("builds an ephemeral read-only connection probe", () => {
    expect(buildCodexExecArgs({
      workdir: "/tmp/workspace",
      modelArg: "gpt-test",
      sandbox: "read-only",
      ephemeral: true,
    })).toEqual([
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--cd",
      "/tmp/workspace",
      "--skip-git-repo-check",
      "-m",
      "gpt-test",
      "-",
    ])
  })

  test("builds an isolated provider environment", () => {
    expect(buildCodexEnv({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1/",
    }, { PATH: "/bin" })).toEqual({
      PATH: "/bin",
      CODEX_API_KEY: "test-key",
      OPENAI_API_KEY: "test-key",
      CODEX_BASE_URL: "https://example.test/v1",
      OPENAI_BASE_URL: "https://example.test/v1",
    })
  })

  test("parses completed items and usage", () => {
    const item = parseCodexEvent(JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "done" },
    }))
    expect(item && codexCompletedItem(item)).toEqual({ type: "agent_message", text: "done" })

    const completed = parseCodexEvent(JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 7 },
    }))
    expect(completed && codexTurnUsage(completed)).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cachedInputTokens: 7,
    })
  })

  test("extracts nested API failures from stdout JSONL", () => {
    expect(codexEventError({
      type: "turn.failed",
      error: {
        message: JSON.stringify({
          type: "error",
          status: 400,
          error: { message: "The model requires a newer version of Codex." },
        }),
      },
    })).toBe("The model requires a newer version of Codex.")
    expect(codexEventError({ type: "error", message: "authentication failed" }))
      .toBe("authentication failed")
    expect(codexEventError({ type: "turn.completed" })).toBeNull()
    expect(parseCodexEvent("not json")).toBeNull()
  })
})
