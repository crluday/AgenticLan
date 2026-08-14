import type {
  ChatMessage,
  ChatTranscriptEvent,
  SendMessageRequest,
  SendMessageResponse,
  ToolCall
} from "@agenticlan/shared-types";
import type { MCPHost } from "../mcp/host.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { JsonSessionStore } from "../session/json-session-store.js";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const maxToolIterations = 5;

export class AgentOrchestrator {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly mcpHost: MCPHost,
    private readonly sessions: JsonSessionStore,
    private getSystemPrompt: (sessionId: string) => string
  ) {}

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const userMessage: ChatMessage = {
      id: id("msg"),
      role: "user",
      content: request.content,
      createdAt: now()
    };

    this.sessions.append(request.sessionId, userMessage);
    const provider = this.providers.get();
    const tools = await this.mcpHost.getAvailableTools();
    const conversation: ChatMessage[] = [
      {
        id: id("msg"),
        role: "system",
        content: this.getSystemPrompt(request.sessionId),
        createdAt: now()
      },
      ...this.sessions.listMessages(request.sessionId)
    ];
    const events: ChatTranscriptEvent[] = [
      {
        id: id("evt"),
        sessionId: request.sessionId,
        kind: "user-message",
        payload: { message: userMessage },
        createdAt: now()
      }
    ];

    for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
      let assistantText = "";
      const toolCalls: ToolCall[] = [];

      for await (const chunk of provider.chatCompletion({
        sessionId: request.sessionId,
        model: "",
        messages: conversation,
        tools
      })) {
        if (chunk.type === "text-delta") {
          assistantText += chunk.text;
          events.push({
            id: id("evt"),
            sessionId: request.sessionId,
            kind: "assistant-delta",
            payload: { text: chunk.text },
            createdAt: now()
          });
        }

        if (chunk.type === "tool-call") {
          toolCalls.push(chunk.toolCall);
          events.push({
            id: id("evt"),
            sessionId: request.sessionId,
            kind: "tool-call",
            payload: { toolCall: chunk.toolCall },
            createdAt: now()
          });
        }
      }

      if (toolCalls.length === 0) {
        const assistantMessage: ChatMessage = {
          id: id("msg"),
          role: "assistant",
          content: assistantText,
          createdAt: now()
        };
        this.sessions.append(request.sessionId, assistantMessage);

        events.push({
          id: id("evt"),
          sessionId: request.sessionId,
          kind: "final",
          payload: { message: assistantMessage },
          createdAt: now()
        });

        return {
          sessionId: request.sessionId,
          events
        };
      }

      conversation.push({
        id: id("msg"),
        role: "assistant",
        content: assistantText,
        toolCalls,
        createdAt: now()
      });

      for (const toolCall of toolCalls) {
        try {
          const result = await this.mcpHost.callTool(toolCall);
          const toolMessage: ChatMessage = {
            id: id("msg"),
            role: "tool",
            content: result.content,
            toolCallId: toolCall.id,
            createdAt: now()
          };

          conversation.push(toolMessage);
          events.push({
            id: id("evt"),
            sessionId: request.sessionId,
            kind: "tool-result",
            payload: { toolCall, result },
            createdAt: now()
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const toolMessage: ChatMessage = {
            id: id("msg"),
            role: "tool",
            content: message,
            toolCallId: toolCall.id,
            createdAt: now()
          };

          conversation.push(toolMessage);
          events.push({
            id: id("evt"),
            sessionId: request.sessionId,
            kind: "tool-result",
            payload: { toolCall, result: { content: message } },
            createdAt: now()
          });
        }
      }
    }

    const assistantMessage: ChatMessage = {
      id: id("msg"),
      role: "assistant",
      content: "I stopped because the tool-call iteration limit was reached.",
      createdAt: now()
    };
    this.sessions.append(request.sessionId, assistantMessage);

    return {
      sessionId: request.sessionId,
      events: [
        ...events,
        {
          id: id("evt"),
          sessionId: request.sessionId,
          kind: "final",
          payload: { message: assistantMessage },
          createdAt: now()
        }
      ]
    };
  }
}
