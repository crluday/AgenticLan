import type { ChatMessage } from "@agenticlan/shared-types";

export class InMemorySessionStore {
  private readonly messages = new Map<string, ChatMessage[]>();

  append(sessionId: string, message: ChatMessage): ChatMessage[] {
    const next = [...(this.messages.get(sessionId) ?? []), message];
    this.messages.set(sessionId, next);
    return next;
  }

  listMessages(sessionId: string): ChatMessage[] {
    return this.messages.get(sessionId) ?? [];
  }
}
