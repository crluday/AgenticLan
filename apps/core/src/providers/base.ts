import type {
  ChatChunk,
  ChatRequest,
  ModelInfo,
  ProviderKind
} from "@agenticlan/shared-types";

export interface LLMProvider {
  id: string;
  displayName: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
  apiKeyConfigured?: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  listModels(): Promise<ModelInfo[]>;
  chatCompletion(request: ChatRequest): AsyncIterable<ChatChunk>;
  healthCheck(): Promise<boolean>;
}

export interface ProviderConfig {
  id: string;
  displayName: string;
  adapter: "openai-compatible";
  baseUrl: string;
  apiKey?: string;
  kind: ProviderKind;
  defaultModel: string;
}
