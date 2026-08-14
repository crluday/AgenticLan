export type MCPTransportConfig =
  | {
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      transport: "sse" | "http";
      url: string;
      headers?: Record<string, string>;
    };

export type ToolPermission = "always" | "ask" | "deny";

export type MCPServerConfig = MCPTransportConfig & {
  enabled: boolean;
  permission: ToolPermission;
};

export interface MCPServersFile {
  mcpServers: Record<string, MCPServerConfig>;
}
