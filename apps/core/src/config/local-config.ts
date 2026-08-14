import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "@agenticlan/shared-types";

export interface ProviderRuntimeConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface LocalConfigFile {
  runtimeConfig: RuntimeConfig;
  provider: ProviderRuntimeConfig;
}

export function getConfigPath(): string {
  return process.env.AGENTICLAN_CONFIG_PATH ?? path.resolve(process.cwd(), "config", "runtime.local.json");
}

export function getSessionStorePath(): string {
  return process.env.AGENTICLAN_SESSION_PATH ?? path.resolve(process.cwd(), "config", "sessions.local.json");
}

export function loadLocalConfig(defaults: LocalConfigFile): LocalConfigFile {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<LocalConfigFile>;
    return {
      runtimeConfig: {
        ...defaults.runtimeConfig,
        ...parsed.runtimeConfig,
        activeAgentModeId:
          parsed.runtimeConfig?.activeAgentModeId ?? defaults.runtimeConfig.activeAgentModeId,
        workspaceRoot: parsed.runtimeConfig?.workspaceRoot ?? defaults.runtimeConfig.workspaceRoot,
        customTools: parsed.runtimeConfig?.customTools ?? defaults.runtimeConfig.customTools,
        toolEnabled: {
          ...defaults.runtimeConfig.toolEnabled,
          ...parsed.runtimeConfig?.toolEnabled
        },
        toolDescriptions: {
          ...defaults.runtimeConfig.toolDescriptions,
          ...parsed.runtimeConfig?.toolDescriptions
        }
      },
      provider: {
        ...defaults.provider,
        ...parsed.provider
      }
    };
  } catch {
    return defaults;
  }
}

export function saveLocalConfig(config: LocalConfigFile): void {
  const filePath = getConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
