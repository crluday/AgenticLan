import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCore } from "@agenticlan/core";
import type {
  CreateSessionRequest,
  GetSessionMessagesRequest,
  SendMessageRequest,
  UpdateProviderConfigRequest,
  UpdateRuntimeConfigRequest,
  UpdateSessionRequest
} from "@agenticlan/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const core = createCore();

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "AgenticLAN",
    backgroundColor: "#f7f5f0",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.on("did-finish-load", () => {
    console.log(`[desktop] loaded ${window.webContents.getURL()}`);
  });

  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[desktop] failed to load ${url}: ${code} ${description}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[desktop] renderer stopped: ${details.reason}`);
  });

  window.webContents.on("console-message", (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  if (isDev) {
    console.log(`[desktop] loading dev server ${process.env.VITE_DEV_SERVER_URL}`);
    void window.loadURL(process.env.VITE_DEV_SERVER_URL!);
    return;
  }

  const indexPath = path.join(__dirname, "../../dist/index.html");
  console.log(`[desktop] loading production file ${indexPath}`);
  void window.loadFile(indexPath);
}

app.whenReady().then(() => {
  ipcMain.handle("agenticlan:getSnapshot", () => core.getSnapshot());
  ipcMain.handle("agenticlan:createSession", (_event, request: CreateSessionRequest) =>
    core.createSession(request)
  );
  ipcMain.handle("agenticlan:getSessionMessages", (_event, request: GetSessionMessagesRequest) =>
    core.getSessionMessages(request)
  );
  ipcMain.handle("agenticlan:sendMessage", (_event, request: SendMessageRequest) =>
    core.sendMessage(request)
  );
  ipcMain.handle("agenticlan:updateSession", (_event, request: UpdateSessionRequest) =>
    core.updateSession(request)
  );
  ipcMain.handle("agenticlan:updateProviderConfig", (_event, request: UpdateProviderConfigRequest) =>
    core.updateProviderConfig(request)
  );
  ipcMain.handle("agenticlan:updateRuntimeConfig", (_event, request: UpdateRuntimeConfigRequest) =>
    core.updateRuntimeConfig(request)
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
