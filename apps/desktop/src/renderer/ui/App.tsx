import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Bot,
  Cable,
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
  Send,
  Settings,
  TerminalSquare,
  Trash2,
  Wrench
} from "lucide-react";
import type {
  AgentMode,
  AppSnapshot,
  ChatMessage,
  ChatTranscriptEvent,
  CustomHttpToolConfig,
  SessionSummary,
  ToolCall
} from "@agenticlan/shared-types";

type View = "session" | "tool-calls" | "settings";

interface ToolLogItem {
  id: string;
  toolCall: ToolCall;
  result?: string;
  createdAt: string;
}

const now = () => new Date().toISOString();
const messageId = () => `local_${crypto.randomUUID()}`;
const defaultModeId = "build";
const initialSnapshot: AppSnapshot = {
  providers: [],
  tools: [],
  toolCatalog: [],
  sessions: [],
  runtimeConfig: {
    systemPrompt: "",
    activeAgentModeId: defaultModeId,
    workspaceRoot: "",
    toolDescriptions: {},
    toolEnabled: {},
    customTools: []
  },
  promptPresets: [],
  agentModes: []
};

export function App() {
  const [activeView, setActiveView] = useState<View>("session");
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initialSnapshot);
  const [activeSessionId, setActiveSessionId] = useState("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolLog, setToolLog] = useState<ToolLogItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.agenticlan) {
      setError("Desktop bridge did not load. Restart the app from the VS Code terminal.");
      return;
    }

    window.agenticlan
      .getSnapshot()
      .then(async (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        const firstSession = nextSnapshot.sessions[0]?.id ?? "default";
        setActiveSessionId(firstSession);
        await loadSessionMessages(firstSession);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  async function refreshSnapshot() {
    if (!window.agenticlan) {
      return;
    }
    setSnapshot(await window.agenticlan.getSnapshot());
  }

  async function loadSessionMessages(sessionId: string) {
    if (!window.agenticlan) {
      return;
    }
    const response = await window.agenticlan.getSessionMessages({ sessionId });
    setMessages(
      response.messages.length > 0
        ? response.messages
        : [
            {
              id: "welcome",
              role: "assistant",
              content: "AgenticLAN is ready. Choose a mode, inspect the workspace, or add tools in Settings.",
              createdAt: now()
            }
          ]
    );
  }

  const activeProvider = snapshot.providers[0];
  const activeSession = snapshot.sessions.find((session) => session.id === activeSessionId);
  const activeMode = snapshot.agentModes.find(
    (mode) => mode.id === (activeSession?.agentModeId ?? snapshot.runtimeConfig.activeAgentModeId)
  );
  const statusText = useMemo(() => {
    if (!activeProvider) {
      return "No provider configured";
    }
    return `${activeProvider.displayName} - ${activeProvider.kind}`;
  }, [activeProvider]);

  async function handleCreateSession() {
    if (!window.agenticlan) {
      return;
    }
    setError(null);
    const response = await window.agenticlan.createSession({
      agentModeId: snapshot.runtimeConfig.activeAgentModeId
    });
    setActiveSessionId(response.session.id);
    setMessages([]);
    await refreshSnapshot();
    await loadSessionMessages(response.session.id);
  }

  async function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setActiveView("session");
    setError(null);
    await loadSessionMessages(sessionId);
  }

  async function handleModeChange(agentModeId: string) {
    if (!window.agenticlan) {
      return;
    }
    setError(null);
    const nextSnapshot = await window.agenticlan.updateSession({
      sessionId: activeSessionId,
      agentModeId
    });
    setSnapshot(nextSnapshot);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }

    setDraft("");
    setError(null);
    setIsSending(true);
    setActiveView("session");

    if (!window.agenticlan) {
      setError("Desktop bridge did not load. Restart the app from the VS Code terminal.");
      setIsSending(false);
      return;
    }

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      content,
      createdAt: now()
    };
    setMessages((current) => stripWelcome(current).concat(userMessage));

    try {
      const response = await window.agenticlan.sendMessage({ sessionId: activeSessionId, content });
      const final = findLastEvent(response.events, "final")?.payload.message;
      const nextToolLogs = getToolLogs(response.events);

      if (nextToolLogs.length > 0) {
        setToolLog((current) => [...nextToolLogs, ...current]);
      }

      if (isChatMessage(final)) {
        setMessages((current) => [...stripWelcome(current), final]);
      }
      await refreshSnapshot();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setMessages((current) => [
        ...stripWelcome(current),
        {
          id: messageId(),
          role: "assistant",
          content: `I could not reach the active provider yet. ${message}`,
          createdAt: now()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSaveRuntimeConfig(
    systemPrompt: string,
    activeAgentModeId: string,
    workspaceRoot: string,
    toolDescriptions: Record<string, string>,
    toolEnabled: Record<string, boolean>,
    customTools: CustomHttpToolConfig[]
  ) {
    if (!window.agenticlan) {
      setError("Desktop bridge did not load. Restart the app from the VS Code terminal.");
      return;
    }

    setError(null);
    setSettingsStatus("Saving...");

    try {
      const nextSnapshot = await window.agenticlan.updateRuntimeConfig({
        systemPrompt,
        activeAgentModeId,
        workspaceRoot,
        toolDescriptions,
        toolEnabled,
        customTools
      });
      setSnapshot(nextSnapshot);
      setSettingsStatus("Saved");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setSettingsStatus(null);
    }
  }

  async function handleSaveProviderConfig(baseUrl: string, model: string, apiKey: string) {
    if (!window.agenticlan) {
      setError("Desktop bridge did not load. Restart the app from the VS Code terminal.");
      return;
    }

    setError(null);
    setProviderStatus("Saving...");

    try {
      const nextSnapshot = await window.agenticlan.updateProviderConfig({
        baseUrl,
        model,
        ...(apiKey ? { apiKey } : {})
      });
      setSnapshot(nextSnapshot);
      setProviderStatus("Saved");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setProviderStatus(null);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Cable size={22} />
          </div>
          <div>
            <h1>AgenticLAN</h1>
            <p>Local-first agent desktop</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <NavButton active={activeView === "session"} icon={<MessageSquare size={18} />} onClick={() => setActiveView("session")}>
            Session
          </NavButton>
          <NavButton
            active={activeView === "tool-calls"}
            icon={<TerminalSquare size={18} />}
            onClick={() => setActiveView("tool-calls")}
          >
            Tool Calls
          </NavButton>
          <NavButton active={activeView === "settings"} icon={<Settings size={18} />} onClick={() => setActiveView("settings")}>
            Settings
          </NavButton>
        </nav>

        <section className="session-panel" aria-label="Sessions">
          <div className="sidebar-heading">
            <span>Sessions</span>
            <button aria-label="New session" className="icon-action dark" onClick={() => void handleCreateSession()} type="button">
              <Plus size={16} />
            </button>
          </div>
          <div className="session-list">
            {snapshot.sessions.map((session) => (
              <button
                className={`session-item ${session.id === activeSessionId ? "active" : ""}`}
                key={session.id}
                onClick={() => void handleSelectSession(session.id)}
                type="button"
              >
                <span>{session.title}</span>
                <small>{getModeName(snapshot.agentModes, session.agentModeId)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="status-panel" aria-label="Runtime status">
          <div className="status-row">
            <Bot size={17} />
            <span>{statusText}</span>
          </div>
          <div className="status-row">
            <Wrench size={17} />
            <span>{snapshot.tools.length} enabled tools</span>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeSession?.title ?? "Default Session"}</p>
            <h2>{getViewTitle(activeView)}</h2>
          </div>
          <div className="topbar-actions">
            <label className="mode-select">
              <span>Mode</span>
              <select value={activeMode?.id ?? defaultModeId} onChange={(event) => void handleModeChange(event.target.value)}>
                {snapshot.agentModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="connection-chip">{snapshot.tools.length > 0 ? "Tools ready" : "Chat only"}</div>
          </div>
        </header>

        {activeView === "session" ? (
          <SessionView messages={messages} isSending={isSending} />
        ) : activeView === "tool-calls" ? (
          <ToolCallsView toolLog={toolLog} tools={snapshot.tools} catalog={snapshot.toolCatalog} />
        ) : (
          <SettingsView
            onSaveProvider={handleSaveProviderConfig}
            onSave={handleSaveRuntimeConfig}
            providerStatus={providerStatus}
            settingsStatus={settingsStatus}
            snapshot={snapshot}
          />
        )}

        {error ? <div className="error-banner">{error}</div> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask AgenticLAN to inspect files, reason, or use tools..."
            rows={3}
          />
          <button aria-label="Send message" disabled={isSending || draft.trim().length === 0} type="submit">
            <Send size={20} />
          </button>
        </form>
      </main>
    </div>
  );
}

function NavButton({
  active,
  children,
  icon,
  onClick
}: {
  active: boolean;
  children: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  );
}

function findLastEvent(events: ChatTranscriptEvent[], kind: ChatTranscriptEvent["kind"]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.kind === kind) {
      return events[index];
    }
  }

  return undefined;
}

function SessionView({ isSending, messages }: { isSending: boolean; messages: ChatMessage[] }) {
  return (
    <section className="conversation" aria-live="polite">
      {messages.map((message) => (
        <article className={`message ${message.role}`} key={message.id}>
          <div className="message-role">{message.role}</div>
          <p>{message.content}</p>
        </article>
      ))}
      {isSending ? (
        <article className="message assistant pending">
          <div className="message-role">assistant</div>
          <p>Thinking...</p>
        </article>
      ) : null}
    </section>
  );
}

function ToolCallsView({
  catalog,
  toolLog,
  tools
}: {
  catalog: AppSnapshot["toolCatalog"];
  toolLog: ToolLogItem[];
  tools: AppSnapshot["tools"];
}) {
  const enabled = new Set(tools.map((tool) => `${tool.serverId}.${tool.name}`));
  return (
    <section className="content-view">
      <div className="section-header">
        <h3>Tool Catalog</h3>
        <span>{tools.length} enabled</span>
      </div>
      <div className="tool-grid">
        {catalog.map((tool) => {
          const key = `${tool.serverId}.${tool.name}`;
          return (
            <article className={`tool-card ${enabled.has(key) ? "" : "disabled"}`} key={key}>
              <div className="tool-card-title">
                <Wrench size={16} />
                <strong>{key}</strong>
                <span>{enabled.has(key) ? "on" : "off"}</span>
              </div>
              <p>{tool.description}</p>
            </article>
          );
        })}
      </div>

      <div className="section-header">
        <h3>Invocation Log</h3>
        <span>{toolLog.length}</span>
      </div>
      <div className="log-list">
        {toolLog.length === 0 ? (
          <p className="empty-state">Tool calls will appear here after the model uses one.</p>
        ) : (
          toolLog.map((item) => (
            <article className="log-item" key={item.id}>
              <div className="log-item-title">
                <CheckCircle2 size={16} />
                <strong>
                  {item.toolCall.serverId}.{item.toolCall.name}
                </strong>
                <time>{new Date(item.createdAt).toLocaleTimeString()}</time>
              </div>
              <pre>{JSON.stringify(item.toolCall.arguments, null, 2)}</pre>
              {item.result ? <pre>{item.result}</pre> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SettingsView({
  onSaveProvider,
  onSave,
  providerStatus,
  settingsStatus,
  snapshot
}: {
  onSaveProvider: (baseUrl: string, model: string, apiKey: string) => Promise<void>;
  onSave: (
    systemPrompt: string,
    activeAgentModeId: string,
    workspaceRoot: string,
    toolDescriptions: Record<string, string>,
    toolEnabled: Record<string, boolean>,
    customTools: CustomHttpToolConfig[]
  ) => Promise<void>;
  providerStatus: string | null;
  settingsStatus: string | null;
  snapshot: AppSnapshot;
}) {
  const provider = snapshot.providers[0];
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [model, setModel] = useState(provider?.defaultModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(snapshot.runtimeConfig.systemPrompt);
  const [activeAgentModeId, setActiveAgentModeId] = useState(snapshot.runtimeConfig.activeAgentModeId);
  const [workspaceRoot, setWorkspaceRoot] = useState(snapshot.runtimeConfig.workspaceRoot);
  const [toolDescriptions, setToolDescriptions] = useState(snapshot.runtimeConfig.toolDescriptions);
  const [toolEnabled, setToolEnabled] = useState(snapshot.runtimeConfig.toolEnabled);
  const [customTools, setCustomTools] = useState(snapshot.runtimeConfig.customTools);

  useEffect(() => {
    setBaseUrl(provider?.baseUrl ?? "");
    setModel(provider?.defaultModel ?? "");
    setApiKey("");
    setSystemPrompt(snapshot.runtimeConfig.systemPrompt);
    setActiveAgentModeId(snapshot.runtimeConfig.activeAgentModeId);
    setWorkspaceRoot(snapshot.runtimeConfig.workspaceRoot);
    setToolDescriptions(snapshot.runtimeConfig.toolDescriptions);
    setToolEnabled(snapshot.runtimeConfig.toolEnabled);
    setCustomTools(snapshot.runtimeConfig.customTools);
  }, [provider?.baseUrl, provider?.defaultModel, snapshot.runtimeConfig]);

  return (
    <section className="content-view">
      <div className="section-header">
        <h3>Provider</h3>
        <span>{provider?.apiKeyConfigured ? "API key set" : "No API key"}</span>
      </div>
      <div className="settings-list editable-settings">
        <SettingsRow label="Name" value={provider?.displayName ?? "Not configured"} />
        <label className="settings-row field-row">
          <span>Base URL</span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label className="settings-row field-row">
          <span>Model</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label className="settings-row field-row">
          <span>API Key</span>
          <input
            placeholder={provider?.apiKeyConfigured ? "Leave blank to keep current key" : "Optional for local providers"}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <SettingsRow label="Tool Support" value={provider?.supportsTools ? "Enabled" : "Disabled"} />
      </div>
      <div className="settings-actions">
        <button
          className="primary-action"
          onClick={() => void onSaveProvider(baseUrl, model, apiKey)}
          type="button"
        >
          <Settings size={18} />
          Save Provider
        </button>
        {providerStatus ? (
          <span className="save-status">
            <Clock size={15} />
            {providerStatus}
          </span>
        ) : null}
      </div>

      <div className="section-header">
        <h3>Agent Modes</h3>
        <span>{snapshot.agentModes.length}</span>
      </div>
      <div className="mode-grid">
        {snapshot.agentModes.map((mode) => (
          <article className={`preset-card ${mode.id === activeAgentModeId ? "selected" : ""}`} key={mode.id}>
            <div>
              <strong>{mode.name}</strong>
              <p>{mode.description}</p>
            </div>
            <button
              className="compact-action"
              onClick={() => {
                setActiveAgentModeId(mode.id);
                setToolEnabled((current) => ({ ...current, ...mode.defaultToolEnabled }));
              }}
              type="button"
            >
              Use
            </button>
          </article>
        ))}
      </div>

      <div className="section-header">
        <h3>Workspace</h3>
        <span>Tool root</span>
      </div>
      <label className="settings-row field-row single-field">
        <span>Path</span>
        <input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} />
      </label>

      <div className="section-header">
        <h3>System Prompt</h3>
        <span>{systemPrompt.length} chars</span>
      </div>
      <div className="preset-grid">
        {snapshot.promptPresets.map((preset) => (
          <article className="preset-card" key={preset.id}>
            <div>
              <strong>{preset.name}</strong>
              <p>{preset.description}</p>
            </div>
            <button className="compact-action" onClick={() => setSystemPrompt(preset.systemPrompt)} type="button">
              Apply
            </button>
          </article>
        ))}
      </div>
      <textarea
        className="settings-textarea"
        value={systemPrompt}
        onChange={(event) => setSystemPrompt(event.target.value)}
      />

      <div className="section-header">
        <h3>Tool Capability Settings</h3>
        <span>{snapshot.toolCatalog.length} known</span>
      </div>
      <div className="tool-editor-list">
        {snapshot.toolCatalog.map((tool) => {
          const key = `${tool.serverId}.${tool.name}`;
          const enabled = toolEnabled[key] !== false;
          return (
            <article className="tool-editor" key={key}>
              <div className="tool-editor-header">
                <label>
                  <input
                    checked={enabled}
                    type="checkbox"
                    onChange={(event) =>
                      setToolEnabled((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                  <span>{key}</span>
                </label>
              </div>
              <textarea
                value={toolDescriptions[key] ?? tool.description ?? ""}
                onChange={(event) =>
                  setToolDescriptions((current) => ({
                    ...current,
                    [key]: event.target.value
                  }))
                }
              />
            </article>
          );
        })}
      </div>

      <div className="section-header">
        <h3>Custom HTTP Tools</h3>
        <button className="compact-action" onClick={() => setCustomTools((current) => [...current, createCustomTool()])} type="button">
          <Plus size={16} />
          Add
        </button>
      </div>
      <div className="custom-tool-list">
        {customTools.length === 0 ? (
          <p className="empty-state">Add an HTTP tool to expose your own endpoint to the model.</p>
        ) : (
          customTools.map((tool, index) => (
            <article className="custom-tool-editor" key={tool.id}>
              <div className="custom-tool-header">
                <label>
                  <span>Enabled</span>
                  <input
                    checked={tool.enabled}
                    type="checkbox"
                    onChange={(event) => updateCustomTool(index, { enabled: event.target.checked }, setCustomTools)}
                  />
                </label>
                <button
                  aria-label="Remove custom tool"
                  className="icon-action"
                  onClick={() => setCustomTools((current) => current.filter((item) => item.id !== tool.id))}
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <label className="field-stack">
                <span>Name</span>
                <input
                  value={tool.name}
                  onChange={(event) => updateCustomTool(index, { name: sanitizeToolName(event.target.value) }, setCustomTools)}
                />
              </label>
              <label className="field-stack">
                <span>Description</span>
                <textarea
                  value={tool.description}
                  onChange={(event) => updateCustomTool(index, { description: event.target.value }, setCustomTools)}
                />
              </label>
              <div className="tool-row">
                <label className="field-stack">
                  <span>Method</span>
                  <select
                    value={tool.method}
                    onChange={(event) =>
                      updateCustomTool(index, { method: event.target.value as CustomHttpToolConfig["method"] }, setCustomTools)
                    }
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </label>
                <label className="field-stack">
                  <span>URL</span>
                  <input
                    value={tool.url}
                    onChange={(event) => updateCustomTool(index, { url: event.target.value }, setCustomTools)}
                  />
                </label>
              </div>
              <label className="field-stack">
                <span>Input Schema JSON</span>
                <textarea
                  value={JSON.stringify(tool.inputSchema, null, 2)}
                  onChange={(event) =>
                    updateCustomTool(index, { inputSchema: parseSchemaDraft(event.target.value, tool.inputSchema) }, setCustomTools)
                  }
                />
              </label>
            </article>
          ))
        )}
      </div>

      <div className="settings-actions">
        <button
          className="primary-action"
          onClick={() =>
            void onSave(systemPrompt, activeAgentModeId, workspaceRoot, toolDescriptions, toolEnabled, customTools)
          }
          type="button"
        >
          <Settings size={18} />
          Save Runtime Config
        </button>
        {settingsStatus ? (
          <span className="save-status">
            <Clock size={15} />
            {settingsStatus}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getViewTitle(view: View): string {
  if (view === "tool-calls") {
    return "Tool Calls";
  }

  if (view === "settings") {
    return "Settings";
  }

  return "Agent Console";
}

function getModeName(modes: AgentMode[], modeId: string): string {
  return modes.find((mode) => mode.id === modeId)?.name ?? modeId;
}

function stripWelcome(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.id !== "welcome");
}

function createCustomTool(): CustomHttpToolConfig {
  return {
    id: crypto.randomUUID(),
    name: "my_tool",
    description: "Describe when the model should use this tool.",
    enabled: true,
    method: "GET",
    url: "http://127.0.0.1:3000/tool",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  };
}

function updateCustomTool(
  index: number,
  patch: Partial<CustomHttpToolConfig>,
  setCustomTools: Dispatch<SetStateAction<CustomHttpToolConfig[]>>
) {
  setCustomTools((current) =>
    current.map((tool, currentIndex) => (currentIndex === index ? { ...tool, ...patch } : tool))
  );
}

function sanitizeToolName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function parseSchemaDraft(value: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function getToolLogs(events: ChatTranscriptEvent[]): ToolLogItem[] {
  const calls = new Map<string, ToolLogItem>();

  for (const event of events) {
    if (event.kind === "tool-call" && isToolCall(event.payload.toolCall)) {
      calls.set(event.payload.toolCall.id, {
        id: event.id,
        toolCall: event.payload.toolCall,
        createdAt: event.createdAt
      });
    }

    if (event.kind === "tool-result" && isToolCall(event.payload.toolCall)) {
      const existing = calls.get(event.payload.toolCall.id);
      if (existing) {
        existing.result = getResultText(event.payload.result);
      }
    }
  }

  return [...calls.values()];
}

function getResultText(value: unknown): string {
  if (typeof value === "object" && value !== null && "content" in value) {
    return String(value.content);
  }

  return String(value);
}

function isToolCall(value: unknown): value is ToolCall {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "serverId" in value &&
    "name" in value &&
    "arguments" in value
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "role" in value &&
    "content" in value &&
    "createdAt" in value
  );
}

function getSessionSortLabel(session: SessionSummary): string {
  return new Date(session.updatedAt).toLocaleString();
}
