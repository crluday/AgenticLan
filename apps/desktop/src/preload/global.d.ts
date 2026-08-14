import type {
  AppSnapshot,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionMessagesRequest,
  GetSessionMessagesResponse,
  SendMessageRequest,
  SendMessageResponse,
  UpdateProviderConfigRequest,
  UpdateRuntimeConfigRequest,
  UpdateSessionRequest
} from "@agenticlan/shared-types";

declare global {
  interface Window {
    agenticlan?: {
      getSnapshot(): Promise<AppSnapshot>;
      createSession(request: CreateSessionRequest): Promise<CreateSessionResponse>;
      getSessionMessages(request: GetSessionMessagesRequest): Promise<GetSessionMessagesResponse>;
      sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>;
      updateSession(request: UpdateSessionRequest): Promise<AppSnapshot>;
      updateProviderConfig(request: UpdateProviderConfigRequest): Promise<AppSnapshot>;
      updateRuntimeConfig(request: UpdateRuntimeConfigRequest): Promise<AppSnapshot>;
    };
  }
}

export {};
