import fs from "node:fs";
import path from "node:path";
import type { ChatMessage, SessionSummary } from "@agenticlan/shared-types";

interface PersistedSession extends SessionSummary {
  messages: ChatMessage[];
}

interface SessionFile {
  sessions: PersistedSession[];
}

const now = () => new Date().toISOString();
const id = () => `ses_${crypto.randomUUID()}`;

export class JsonSessionStore {
  private sessions = new Map<string, PersistedSession>();

  constructor(private readonly filePath: string, private readonly defaultAgentModeId: string) {
    this.load();
    if (this.sessions.size === 0) {
      this.createSession({ id: "default", title: "Default Session", agentModeId: defaultAgentModeId });
    }
  }

  createSession(input: { id?: string; title?: string; agentModeId?: string } = {}): SessionSummary {
    const createdAt = now();
    const session: PersistedSession = {
      id: input.id ?? id(),
      title: input.title?.trim() || "New Session",
      agentModeId: input.agentModeId || this.defaultAgentModeId,
      createdAt,
      updatedAt: createdAt,
      messageCount: 0,
      messages: []
    };
    this.sessions.set(session.id, session);
    this.persist();
    return toSummary(session);
  }

  updateSession(sessionId: string, patch: { title?: string; agentModeId?: string }): SessionSummary {
    const session = this.ensureSession(sessionId);
    if (patch.title !== undefined && patch.title.trim()) {
      session.title = patch.title.trim();
    }
    if (patch.agentModeId !== undefined && patch.agentModeId.trim()) {
      session.agentModeId = patch.agentModeId.trim();
    }
    session.updatedAt = now();
    this.persist();
    return toSummary(session);
  }

  append(sessionId: string, message: ChatMessage): ChatMessage[] {
    const session = this.ensureSession(sessionId);
    session.messages = [...session.messages, message];
    session.messageCount = session.messages.length;
    session.updatedAt = message.createdAt;
    if (session.title === "New Session" && message.role === "user") {
      session.title = createTitle(message.content);
    }
    this.persist();
    return session.messages;
  }

  listMessages(sessionId: string): ChatMessage[] {
    return [...this.ensureSession(sessionId).messages];
  }

  listSessions(): SessionSummary[] {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toSummary);
  }

  getSession(sessionId: string): SessionSummary {
    return toSummary(this.ensureSession(sessionId));
  }

  private ensureSession(sessionId: string): PersistedSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const summary = this.createSession({ id: sessionId, title: "New Session" });
    const created = this.sessions.get(summary.id);
    if (!created) {
      throw new Error(`Unable to create session ${sessionId}.`);
    }
    return created;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<SessionFile>;
      for (const session of parsed.sessions ?? []) {
        if (!session.id) {
          continue;
        }
        this.sessions.set(session.id, {
          ...session,
          title: session.title || "Untitled Session",
          agentModeId: session.agentModeId || this.defaultAgentModeId,
          createdAt: session.createdAt || now(),
          updatedAt: session.updatedAt || session.createdAt || now(),
          messageCount: session.messages?.length ?? session.messageCount ?? 0,
          messages: session.messages ?? []
        });
      }
    } catch {
      this.sessions.clear();
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify({ sessions: [...this.sessions.values()] }, null, 2)}\n`,
      "utf8"
    );
  }
}

function toSummary(session: PersistedSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    agentModeId: session.agentModeId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length
  };
}

function createTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New Session";
  }
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}
