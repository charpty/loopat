export const DEFAULT_PROVIDER_PRESETS: Array<{ name: string; baseUrl: string; runtime?: "claude" | "codex"; models: Array<string | { id: string; tier?: "opus" | "sonnet" | "haiku"; maxContextTokens?: number }> }> = [
  { name: "Codex", baseUrl: "https://api.openai.com/v1", runtime: "codex",
    models: [
      { id: "gpt-5-codex", maxContextTokens: 20_000_000 },
    ]},
  { name: "Anthropic", baseUrl: "https://api.anthropic.com",
    models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-7-20251101",
      "claude-haiku-4-5-20251001",
    ]},
  { name: "DeepSeek",  baseUrl: "https://api.deepseek.com/anthropic",
    models: [
      { id: "deepseek-v4-pro[1m]", tier: "opus", maxContextTokens: 1_000_000 },
      { id: "deepseek-v4-flash[1m]", tier: "haiku", maxContextTokens: 1_000_000 },
    ]},
  { name: "Kimi",      baseUrl: "https://api.moonshot.cn/anthropic",
    models: [
      { id: "kimi-k2.6", tier: "sonnet", maxContextTokens: 1_000_000 },
    ]},
  { name: "MiniMax",   baseUrl: "https://api.minimaxi.com/anthropic",
    models: [
      { id: "MiniMax-M2.7", tier: "sonnet", maxContextTokens: 1_000_000 },
    ]},
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "anthropic/claude-sonnet-4", tier: "sonnet" },
      { id: "openai/gpt-4o", tier: "opus", maxContextTokens: 128_000 },
      { id: "google/gemini-2.5-flash", tier: "haiku", maxContextTokens: 1_000_000 },
    ]},
]

export const DEFAULT_MISE_TOOL_PRESETS: Array<{ name: string; suggestedVersion: string; description?: string; backend?: string }> = [
  { name: "node",       suggestedVersion: "22",      description: "Node.js runtime" },
  { name: "python",     suggestedVersion: "3.12",    description: "Python runtime" },
  { name: "go",         suggestedVersion: "1.22",    description: "Go programming language" },
  { name: "rust",       suggestedVersion: "stable",  description: "Rust programming language" },
  { name: "bun",        suggestedVersion: "latest",  description: "Bun all-in-one runtime" },
  { name: "java",       suggestedVersion: "21",      description: "Java Development Kit" },
  { name: "terraform",  suggestedVersion: "1.9",     description: "Infrastructure as code", backend: "aqua:hashicorp/terraform" },
  { name: "lua",        suggestedVersion: "5.1",     description: "Lua scripting language" },
  { name: "zig",        suggestedVersion: "0.13",    description: "Zig general-purpose language" },
  { name: "ripgrep",    suggestedVersion: "14.1",    description: "Line-oriented search tool", backend: "aqua:BurntSushi/ripgrep" },
  { name: "fd",         suggestedVersion: "10.2",    description: "Fast file finder", backend: "aqua:sharkdp/fd" },
  { name: "jq",         suggestedVersion: "1.7",     description: "Command-line JSON processor", backend: "aqua:jqlang/jq" },
]
