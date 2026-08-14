import { contextBridge, ipcRenderer } from "electron";
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

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("agenticlan:getSnapshot"),
  createSession: (request: CreateSessionRequest): Promise<CreateSessionResponse> =>
    ipcRenderer.invoke("agenticlan:createSession", request),
  getSessionMessages: (
    request: GetSessionMessagesRequest
  ): Promise<GetSessionMessagesResponse> =>
    ipcRenderer.invoke("agenticlan:getSessionMessages", request),
  sendMessage: (request: SendMessageRequest): Promise<SendMessageResponse> =>
    ipcRenderer.invoke("agenticlan:sendMessage", request),
  updateSession: (request: UpdateSessionRequest): Promise<AppSnapshot> =>
    ipcRenderer.invoke("agenticlan:updateSession", request),
  updateProviderConfig: (request: UpdateProviderConfigRequest): Promise<AppSnapshot> =>
    ipcRenderer.invoke("agenticlan:updateProviderConfig", request),
  updateRuntimeConfig: (request: UpdateRuntimeConfigRequest): Promise<AppSnapshot> =>
    ipcRenderer.invoke("agenticlan:updateRuntimeConfig", request)
};

contextBridge.exposeInMainWorld("agenticlan", api);
