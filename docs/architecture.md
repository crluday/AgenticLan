# AgenticLAN Architecture Notes

The application is organized around three boundaries:

1. The desktop shell owns UI, local IPC, and user approval flows.
2. The application core owns sessions, orchestration, provider selection, and tool routing.
3. Provider adapters and MCP servers provide model and tool capabilities behind stable contracts.

The agent core should never import provider SDKs or MCP transport details directly. It receives an `LLMProvider` and an `MCPHost`, asks the provider for streamed chat chunks, routes tool requests through the host, and persists session state through storage abstractions.
