export type ProviderKind = "cloud" | "local";

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow?: number;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface SessionSummary {
  id: string;
  title: string;
  agentModeId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ToolDefinition {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  serverId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatRequest {
  sessionId: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  abortSignal?: AbortSignal;
}

export type ChatChunk =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "done" };

export interface ChatTranscriptEvent {
  id: string;
  sessionId: string;
  kind: "user-message" | "assistant-delta" | "tool-call" | "tool-result" | "final";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;
}

export interface SendMessageResponse {
  sessionId: string;
  events: ChatTranscriptEvent[];
}

export interface ProviderSummary {
  id: string;
  displayName: string;
  kind: ProviderKind;
  supportsTools: boolean;
  supportsVision: boolean;
  baseUrl?: string;
  defaultModel?: string;
  apiKeyConfigured?: boolean;
}

export interface AppSnapshot {
  providers: ProviderSummary[];
  tools: ToolDefinition[];
  toolCatalog: ToolDefinition[];
  sessions: SessionSummary[];
  runtimeConfig: RuntimeConfig;
  promptPresets: PromptPreset[];
  agentModes: AgentMode[];
}

export interface RuntimeConfig {
  systemPrompt: string;
  activeAgentModeId: string;
  workspaceRoot: string;
  toolDescriptions: Record<string, string>;
  toolEnabled: Record<string, boolean>;
  customTools: CustomHttpToolConfig[];
}

export interface UpdateRuntimeConfigRequest {
  systemPrompt: string;
  activeAgentModeId: string;
  workspaceRoot: string;
  toolDescriptions: Record<string, string>;
  toolEnabled: Record<string, boolean>;
  customTools: CustomHttpToolConfig[];
}

export interface UpdateProviderConfigRequest {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface CustomHttpToolConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  method: "GET" | "POST";
  url: string;
  inputSchema: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  defaultToolEnabled: Record<string, boolean>;
}

export interface CreateSessionRequest {
  title?: string;
  agentModeId?: string;
}

export interface CreateSessionResponse {
  session: SessionSummary;
}

export interface GetSessionMessagesRequest {
  sessionId: string;
}

export interface GetSessionMessagesResponse {
  sessionId: string;
  messages: ChatMessage[];
}

export interface UpdateSessionRequest {
  sessionId: string;
  title?: string;
  agentModeId?: string;
}
