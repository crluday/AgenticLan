# OpenCode Reference Notes for AgenticLAN

AgenticLAN uses `references/opencode` only as a lawful MIT-licensed architecture reference. The goal is not to copy OpenCode branding or installer internals; the goal is to build AgenticLAN as its own Codex/OpenCode-style desktop coding agent with stronger user-editable tool capability controls.

## What OpenCode Teaches

- Desktop shell: `packages/desktop` runs an Electron app that delegates agent work to a local sidecar/server process.
- Core runtime: `packages/core` owns config, session state, provider routing, tools, permissions, and event projection.
- Sessions: conversations are durable objects with metadata, history, parent/fork fields, tokens, cost, and tool activity.
- Agents/modes: build, plan, explore, and background helper agents have distinct prompts and permission policies.
- Tool registry: built-in tools, plugin tools, MCP tools, and local tool files are normalized behind one schema and filtered before each provider turn.
- Provider boundary: model adapters convert internal messages/tools into provider-specific request payloads.
- Safety boundary: tools are filtered by mode, model support, and permission policy before they are visible to the model.

## AgenticLAN Implemented in This Pass

- Durable JSON-backed sessions in `config/sessions.local.json`.
- Session sidebar with new-session creation and session switching.
- Per-session agent mode selection: Build, Plan, Explore, Reverse Engineering.
- Runtime config now persists:
  - global system prompt
  - active default mode
  - workspace root
  - enabled/disabled tool map
  - tool description overrides
  - custom HTTP tools
- Full tool catalog in Settings, separate from enabled tools sent to the model.
- Built-in workspace tools:
  - `system.get_current_time`
  - `workspace.list_files`
  - `filesystem.read_file`
  - `filesystem.search_text`
  - `shell.run` disabled by default
- Tool calls remain OpenAI-compatible as `server__tool` function names for providers such as LM Studio or local OpenAI-compatible servers.

## Next Clone Milestones

1. Add write/edit/apply-patch tools with a diff preview and approval step.
2. Add MCP stdio/HTTP server connections, discovered tools, and per-server enablement.
3. Add live streaming UI events instead of waiting for the final IPC response.
4. Add permission prompts for shell and file mutation tools.
5. Add workspace file tree, file preview, and generated diff view.
6. Add model/provider catalog management and health checks.
7. Add packaging/update workflow after the runtime is stable.

## Attribution

OpenCode is MIT licensed. If AgenticLAN later copies substantial source code or prompt text directly from `references/opencode`, keep the OpenCode MIT copyright notice with the copied portion. Current changes are independent implementations of architectural ideas.
