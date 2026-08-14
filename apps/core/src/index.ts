import type {
  AppSnapshot,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionMessagesRequest,
  GetSessionMessagesResponse,
  RuntimeConfig,
  SendMessageRequest,
  SendMessageResponse,
  UpdateProviderConfigRequest,
  UpdateRuntimeConfigRequest,
  UpdateSessionRequest
} from "@agenticlan/shared-types";
import { agentModes, defaultSystemPrompt, promptPresets } from "./config/prompt-presets.js";
import {
  getSessionStorePath,
  loadLocalConfig,
  saveLocalConfig,
  type ProviderRuntimeConfig
} from "./config/local-config.js";
import { BuiltinMCPHost } from "./mcp/host.js";
import { AgentOrchestrator } from "./orchestrator/agent-orchestrator.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";
import { ProviderRegistry } from "./providers/registry.js";
import { JsonSessionStore } from "./session/json-session-store.js";

export interface AgenticLANCore {
  getSnapshot(): Promise<AppSnapshot>;
  createSession(request: CreateSessionRequest): Promise<CreateSessionResponse>;
  getSessionMessages(request: GetSessionMessagesRequest): Promise<GetSessionMessagesResponse>;
  sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>;
  updateSession(request: UpdateSessionRequest): Promise<AppSnapshot>;
  updateProviderConfig(request: UpdateProviderConfigRequest): Promise<AppSnapshot>;
  updateRuntimeConfig(request: UpdateRuntimeConfigRequest): Promise<AppSnapshot>;
}

export function createCore(): AgenticLANCore {
  const providers = new ProviderRegistry();
  const mcpHost = new BuiltinMCPHost();
  const defaultAgentModeId = "build";
  const localConfig = loadLocalConfig({
    runtimeConfig: {
      systemPrompt: process.env.AGENTICLAN_SYSTEM_PROMPT ?? defaultSystemPrompt,
      activeAgentModeId: defaultAgentModeId,
      workspaceRoot: process.env.AGENTICLAN_WORKSPACE_ROOT ?? process.cwd(),
      toolDescriptions: {},
      toolEnabled: defaultToolEnabled(defaultAgentModeId),
      customTools: []
    },
    provider: {
      baseUrl: process.env.AGENTICLAN_BASE_URL ?? "http://localhost:1234/v1",
      apiKey: process.env.AGENTICLAN_API_KEY,
      model: process.env.AGENTICLAN_MODEL ?? "local-model"
    }
  });
  const runtimeConfig: RuntimeConfig = localConfig.runtimeConfig;
  const providerConfig: ProviderRuntimeConfig = localConfig.provider;
  const sessions = new JsonSessionStore(getSessionStorePath(), runtimeConfig.activeAgentModeId);

  const registerProvider = () => {
    providers.register(
      new OpenAICompatibleProvider({
        id: "local-openai-compatible",
        displayName: "Local OpenAI-compatible",
        adapter: "openai-compatible",
        baseUrl: providerConfig.baseUrl,
        apiKey: providerConfig.apiKey,
        kind: "local",
        defaultModel: providerConfig.model
      }),
      { setDefault: true }
    );
  };
  const persist = () => saveLocalConfig({ runtimeConfig, provider: providerConfig });
  const snapshot = async (): Promise<AppSnapshot> => {
    mcpHost.setToolDescriptions(runtimeConfig.toolDescriptions);
    mcpHost.setToolEnabled(runtimeConfig.toolEnabled);
    mcpHost.setWorkspaceRoot(runtimeConfig.workspaceRoot);
    mcpHost.setCustomTools(runtimeConfig.customTools);
    return {
      providers: providers.list(),
      tools: await mcpHost.getAvailableTools(),
      toolCatalog: await mcpHost.getToolCatalog(),
      sessions: sessions.listSessions(),
      runtimeConfig,
      promptPresets,
      agentModes
    };
  };

  registerProvider();

  const orchestrator = new AgentOrchestrator(
    providers,
    mcpHost,
    sessions,
    (sessionId) => buildSystemPrompt(runtimeConfig.systemPrompt, sessions.getSession(sessionId).agentModeId)
  );

  return {
    getSnapshot(): Promise<AppSnapshot> {
      return snapshot();
    },
    async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
      return {
        session: sessions.createSession({
          title: request.title,
          agentModeId: request.agentModeId ?? runtimeConfig.activeAgentModeId
        })
      };
    },
    async getSessionMessages(
      request: GetSessionMessagesRequest
    ): Promise<GetSessionMessagesResponse> {
      return {
        sessionId: request.sessionId,
        messages: sessions.listMessages(request.sessionId)
      };
    },
    sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
      mcpHost.setToolDescriptions(runtimeConfig.toolDescriptions);
      mcpHost.setToolEnabled(runtimeConfig.toolEnabled);
      mcpHost.setWorkspaceRoot(runtimeConfig.workspaceRoot);
      mcpHost.setCustomTools(runtimeConfig.customTools);
      return orchestrator.sendMessage(request);
    },
    async updateSession(request: UpdateSessionRequest): Promise<AppSnapshot> {
      sessions.updateSession(request.sessionId, {
        title: request.title,
        agentModeId: request.agentModeId
      });
      return snapshot();
    },
    async updateProviderConfig(request: UpdateProviderConfigRequest): Promise<AppSnapshot> {
      providerConfig.baseUrl = request.baseUrl;
      providerConfig.model = request.model;
      if (request.apiKey !== undefined) {
        providerConfig.apiKey = request.apiKey;
      }
      registerProvider();
      persist();
      return snapshot();
    },
    async updateRuntimeConfig(request: UpdateRuntimeConfigRequest): Promise<AppSnapshot> {
      runtimeConfig.systemPrompt = request.systemPrompt;
      runtimeConfig.activeAgentModeId = request.activeAgentModeId;
      runtimeConfig.workspaceRoot = request.workspaceRoot;
      runtimeConfig.toolDescriptions = { ...request.toolDescriptions };
      runtimeConfig.toolEnabled = { ...request.toolEnabled };
      runtimeConfig.customTools = [...request.customTools];
      mcpHost.setToolDescriptions(runtimeConfig.toolDescriptions);
      mcpHost.setToolEnabled(runtimeConfig.toolEnabled);
      mcpHost.setWorkspaceRoot(runtimeConfig.workspaceRoot);
      mcpHost.setCustomTools(runtimeConfig.customTools);
      persist();
      return snapshot();
    }
  };
}

function buildSystemPrompt(systemPrompt: string, agentModeId: string): string {
  const mode = agentModes.find((candidate) => candidate.id === agentModeId) ?? agentModes[0];
  return `${systemPrompt.trim()}\n\nActive AgenticLAN mode: ${mode.name}\n${mode.systemPrompt}`.trim();
}

function defaultToolEnabled(agentModeId: string): Record<string, boolean> {
  return {
    ...(agentModes.find((mode) => mode.id === agentModeId)?.defaultToolEnabled ?? {})
  };
}

export * from "./mcp/host.js";
export * from "./mcp/registry.js";
export * from "./orchestrator/agent-orchestrator.js";
export * from "./providers/base.js";
export * from "./providers/openai-compatible.js";
export * from "./providers/registry.js";
export * from "./session/json-session-store.js";
