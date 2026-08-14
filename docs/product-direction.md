# AgenticLAN Product Direction

AgenticLAN is intended to become a full Codex-style desktop application clone with one major extension: tools are first-class and user-configurable.

Core product goals:

- Codex-style session UI with agentic task execution.
- Provider-agnostic model layer for local and cloud models.
- MCP-native tool system with easy expansion.
- Editable global system prompt.
- Prompt presets for specialized work modes, including a Reverse Engineering Analyst mode for lawful source/log/artifact analysis.
- Editable descriptions/instructions for every exposed tool, so users can shape how the model understands and chooses tools.
- Future support for richer tool capability management, permissions, custom MCP servers, and plugin-style tool packs.

The orchestrator must treat the configured system prompt and tool descriptions as runtime configuration, not hardcoded constants.

Reverse-engineering workflows should prefer open-source repositories, logs, schemas, and explicit user-provided analysis artifacts. AgenticLAN should not depend on copying proprietary binaries, installer internals, or third-party assets.
