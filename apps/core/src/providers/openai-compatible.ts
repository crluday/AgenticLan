import OpenAI from "openai";
import type { ChatChunk, ChatMessage, ChatRequest, ModelInfo } from "@agenticlan/shared-types";
import type { LLMProvider, ProviderConfig } from "./base.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from "openai/resources/chat/completions";

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: ProviderConfig["kind"];
  readonly supportsTools = true;
  readonly supportsVision = false;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly apiKeyConfigured: boolean;

  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.kind = config.kind;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.defaultModel;
    this.apiKeyConfigured = Boolean(config.apiKey);
    this.client = new OpenAI({
      apiKey: config.apiKey || "not-needed",
      baseURL: config.baseUrl
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.client.models.list();
    return models.data.map((model) => ({
      id: model.id,
      displayName: model.id
    }));
  }

  async *chatCompletion(request: ChatRequest): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      stream: true,
      messages: request.messages.map(toOpenAIMessage),
      tools: request.tools.map((tool) => ({
        type: "function",
        function: {
          name: `${tool.serverId}__${tool.name}`,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }))
    });

    const toolCallParts = new Map<
      number,
      { id: string; name: string; argumentsText: string }
    >();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text-delta", text: delta.content };
      }

      for (const toolCall of delta?.tool_calls ?? []) {
        const index = toolCall.index;
        const current = toolCallParts.get(index) ?? {
          id: toolCall.id ?? `tool_${crypto.randomUUID()}`,
          name: "",
          argumentsText: ""
        };

        current.id = toolCall.id ?? current.id;
        current.name += toolCall.function?.name ?? "";
        current.argumentsText += toolCall.function?.arguments ?? "";
        toolCallParts.set(index, current);
      }
    }

    for (const part of toolCallParts.values()) {
      const [serverId, ...nameParts] = part.name.split("__");
      const name = nameParts.join("__");
      if (!serverId || !name) {
        continue;
      }

      yield {
        type: "tool-call",
        toolCall: {
          id: part.id,
          serverId,
          name,
          arguments: parseToolArguments(part.argumentsText)
        }
      };
    }

    yield { type: "done" };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

function toOpenAIMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId ?? ""
    };
  }

  return {
    role: message.role,
    content: message.content,
    tool_calls: message.toolCalls?.map(toOpenAIToolCall)
  };
}

function toOpenAIToolCall(toolCall: NonNullable<ChatMessage["toolCalls"]>[number]): ChatCompletionMessageToolCall {
  return {
    id: toolCall.id,
    type: "function",
    function: {
      name: `${toolCall.serverId}__${toolCall.name}`,
      arguments: JSON.stringify(toolCall.arguments)
    }
  };
}

function parseToolArguments(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
