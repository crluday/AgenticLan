import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CustomHttpToolConfig, ToolCall, ToolDefinition } from "@agenticlan/shared-types";

const execFileAsync = promisify(execFile);
const maxToolOutputChars = 18000;

export interface ToolResult {
  content: string;
  raw?: unknown;
}

export interface MCPHost {
  getAvailableTools(): Promise<ToolDefinition[]>;
  callTool(toolCall: ToolCall): Promise<ToolResult>;
}

export class EmptyMCPHost implements MCPHost {
  async getAvailableTools(): Promise<ToolDefinition[]> {
    return [];
  }

  async callTool(toolCall: ToolCall): Promise<ToolResult> {
    throw new Error(`No MCP server is registered for ${toolCall.serverId}.${toolCall.name}.`);
  }
}

export class BuiltinMCPHost implements MCPHost {
  private readonly baseTools: ToolDefinition[] = [
    {
      serverId: "system",
      name: "get_current_time",
      description:
        "Get the real current date and time. Use this whenever the user asks for the current time, today's date, or now.",
      inputSchema: {
        type: "object",
        properties: {
          timeZone: {
            type: "string",
            description: "IANA time zone. Defaults to Asia/Calcutta."
          }
        },
        additionalProperties: false
      }
    },
    {
      serverId: "workspace",
      name: "list_files",
      description:
        "List files under the configured AgenticLAN workspace. Use this to discover project structure before reading specific files.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Workspace-relative directory. Defaults to the workspace root."
          },
          maxDepth: {
            type: "number",
            description: "Maximum recursive depth. Defaults to 2."
          },
          maxFiles: {
            type: "number",
            description: "Maximum files/directories to return. Defaults to 200."
          }
        },
        additionalProperties: false
      }
    },
    {
      serverId: "filesystem",
      name: "read_file",
      description:
        "Read a text file from the configured AgenticLAN workspace. Use this before explaining or changing code.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative file path."
          },
          startLine: {
            type: "number",
            description: "1-based first line to read. Defaults to 1."
          },
          maxLines: {
            type: "number",
            description: "Maximum lines to return. Defaults to 220."
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    },
    {
      serverId: "filesystem",
      name: "search_text",
      description:
        "Search workspace text files for a literal or regex pattern. Prefer this over guessing where code lives.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text or regex pattern to search for."
          },
          directory: {
            type: "string",
            description: "Workspace-relative directory. Defaults to the workspace root."
          },
          caseSensitive: {
            type: "boolean",
            description: "Whether the search should be case-sensitive. Defaults to false."
          },
          maxResults: {
            type: "number",
            description: "Maximum matches to return. Defaults to 80."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    },
    {
      serverId: "shell",
      name: "run",
      description:
        "Run a PowerShell command in the configured AgenticLAN workspace. Disabled by default; enable only for trusted coding tasks.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "PowerShell command to run."
          },
          timeoutMs: {
            type: "number",
            description: "Timeout in milliseconds. Defaults to 10000, maximum 60000."
          }
        },
        required: ["command"],
        additionalProperties: false
      }
    }
  ];
  private toolDescriptions: Record<string, string> = {};
  private toolEnabled: Record<string, boolean> = {};
  private customTools: CustomHttpToolConfig[] = [];
  private workspaceRoot = process.cwd();

  async getAvailableTools(): Promise<ToolDefinition[]> {
    const builtins = this.baseTools
      .filter((tool) => this.isEnabled(tool.serverId, tool.name))
      .map((tool) => ({
        ...tool,
        description: this.toolDescriptions[getToolKey(tool.serverId, tool.name)] ?? tool.description
      }));
    const custom = this.customTools
      .filter(
        (tool) =>
          tool.enabled &&
          isValidToolName(tool.name) &&
          tool.url &&
          this.isEnabled("custom", tool.name)
      )
      .map((tool) => ({
        serverId: "custom",
        name: tool.name,
        description:
          this.toolDescriptions[getToolKey("custom", tool.name)] || tool.description,
        inputSchema: tool.inputSchema
      }));

    return [...builtins, ...custom];
  }

  async getToolCatalog(): Promise<ToolDefinition[]> {
    const builtins = this.baseTools.map((tool) => ({
      ...tool,
      description: this.toolDescriptions[getToolKey(tool.serverId, tool.name)] ?? tool.description
    }));
    const custom = this.customTools
      .filter((tool) => isValidToolName(tool.name))
      .map((tool) => ({
        serverId: "custom",
        name: tool.name,
        description:
          this.toolDescriptions[getToolKey("custom", tool.name)] || tool.description,
        inputSchema: tool.inputSchema
      }));

    return [...builtins, ...custom];
  }

  setToolDescriptions(toolDescriptions: Record<string, string>): void {
    this.toolDescriptions = { ...toolDescriptions };
  }

  setToolEnabled(toolEnabled: Record<string, boolean>): void {
    this.toolEnabled = { ...toolEnabled };
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = path.resolve(workspaceRoot || process.cwd());
  }

  setCustomTools(customTools: CustomHttpToolConfig[]): void {
    this.customTools = [...customTools];
  }

  async callTool(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.isEnabled(toolCall.serverId, toolCall.name)) {
      throw new Error(`Tool is disabled: ${toolCall.serverId}.${toolCall.name}`);
    }

    if (toolCall.serverId === "system" && toolCall.name === "get_current_time") {
      const timeZone =
        typeof toolCall.arguments.timeZone === "string"
          ? toolCall.arguments.timeZone
          : process.env.AGENTICLAN_TIME_ZONE ?? "Asia/Calcutta";
      const date = new Date();
      const formatted = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone
      }).format(date);

      return {
        content: JSON.stringify(
          {
            iso: date.toISOString(),
            timeZone,
            formatted
          },
          null,
          2
        )
      };
    }

    if (toolCall.serverId === "workspace" && toolCall.name === "list_files") {
      return listWorkspaceFiles(this.workspaceRoot, toolCall.arguments);
    }

    if (toolCall.serverId === "filesystem" && toolCall.name === "read_file") {
      return readWorkspaceFile(this.workspaceRoot, toolCall.arguments);
    }

    if (toolCall.serverId === "filesystem" && toolCall.name === "search_text") {
      return searchWorkspaceText(this.workspaceRoot, toolCall.arguments);
    }

    if (toolCall.serverId === "shell" && toolCall.name === "run") {
      return runShellCommand(this.workspaceRoot, toolCall.arguments);
    }

    if (toolCall.serverId === "custom") {
      const tool = this.customTools.find(
        (candidate) => candidate.enabled && candidate.name === toolCall.name
      );
      if (!tool) {
        throw new Error(`Custom tool is not configured or enabled: ${toolCall.name}`);
      }

      return callCustomHttpTool(tool, toolCall.arguments);
    }

    throw new Error(`No MCP server is registered for ${toolCall.serverId}.${toolCall.name}.`);
  }

  private isEnabled(serverId: string, toolName: string): boolean {
    const key = getToolKey(serverId, toolName);
    if (key in this.toolEnabled) {
      return this.toolEnabled[key] !== false;
    }
    return key !== "shell.run";
  }
}

export function getToolKey(serverId: string, toolName: string): string {
  return `${serverId}.${toolName}`;
}

function isValidToolName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}

async function callCustomHttpTool(
  tool: CustomHttpToolConfig,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const headers = {
    ...(tool.method === "POST" ? { "content-type": "application/json" } : {}),
    ...tool.headers
  };
  const requestUrl = new URL(tool.url);
  const init: RequestInit = {
    method: tool.method,
    headers
  };

  if (tool.method === "GET") {
    for (const [key, value] of Object.entries(args)) {
      requestUrl.searchParams.set(key, stringifyArgument(value));
    }
  } else {
    init.body = JSON.stringify(args);
  }

  const response = await fetch(requestUrl, init);
  const text = await response.text();

  return {
    content: JSON.stringify(
      {
        status: response.status,
        ok: response.ok,
        url: requestUrl.toString(),
        body: tryParseJson(text)
      },
      null,
      2
    )
  };
}

function stringifyArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function listWorkspaceFiles(
  workspaceRoot: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const directory = typeof args.directory === "string" ? args.directory : ".";
  const maxDepth = clampNumber(args.maxDepth, 2, 0, 8);
  const maxFiles = clampNumber(args.maxFiles, 200, 1, 1000);
  const root = resolveWorkspacePath(workspaceRoot, directory);
  const files: string[] = [];

  await walk(root, workspaceRoot, 0, maxDepth, maxFiles, files);

  return jsonResult({
    workspaceRoot,
    directory: path.relative(workspaceRoot, root) || ".",
    count: files.length,
    files
  });
}

async function readWorkspaceFile(
  workspaceRoot: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (typeof args.path !== "string" || !args.path.trim()) {
    throw new Error("filesystem.read_file requires a path string.");
  }

  const filePath = resolveWorkspacePath(workspaceRoot, args.path);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${args.path}`);
  }

  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const startLine = clampNumber(args.startLine, 1, 1, Math.max(lines.length, 1));
  const maxLines = clampNumber(args.maxLines, 220, 1, 1000);
  const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);

  return jsonResult({
    path: path.relative(workspaceRoot, filePath),
    startLine,
    endLine: startLine + selected.length - 1,
    totalLines: lines.length,
    content: selected.map((line, index) => `${startLine + index}: ${line}`).join("\n")
  });
}

async function searchWorkspaceText(
  workspaceRoot: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (typeof args.query !== "string" || !args.query.trim()) {
    throw new Error("filesystem.search_text requires a query string.");
  }

  const directory = typeof args.directory === "string" ? args.directory : ".";
  const searchRoot = resolveWorkspacePath(workspaceRoot, directory);
  const caseSensitive = args.caseSensitive === true;
  const maxResults = clampNumber(args.maxResults, 80, 1, 300);
  const flags = ["--line-number", "--no-heading", "--color", "never", "--max-count", String(maxResults)];
  if (!caseSensitive) {
    flags.push("--ignore-case");
  }

  try {
    const { stdout } = await execFileAsync("rg", [...flags, args.query, searchRoot], {
      cwd: workspaceRoot,
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 4
    });
    const results = stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, maxResults)
      .map((line) => line.replace(searchRoot, path.relative(workspaceRoot, searchRoot) || "."));
    return jsonResult({ query: args.query, directory, count: results.length, results });
  } catch (error) {
    const maybeExit = error as { code?: number; stdout?: string };
    if (maybeExit.code === 1) {
      return jsonResult({ query: args.query, directory, count: 0, results: [] });
    }
    return searchWorkspaceTextFallback(workspaceRoot, searchRoot, args.query, caseSensitive, maxResults);
  }
}

async function searchWorkspaceTextFallback(
  workspaceRoot: string,
  searchRoot: string,
  query: string,
  caseSensitive: boolean,
  maxResults: number
): Promise<ToolResult> {
  const files: string[] = [];
  await walk(searchRoot, workspaceRoot, 0, 8, 1500, files);
  const needle = caseSensitive ? query : query.toLowerCase();
  const results: string[] = [];

  for (const relative of files) {
    if (results.length >= maxResults) {
      break;
    }
    const filePath = path.join(workspaceRoot, relative);
    try {
      const text = await fs.readFile(filePath, "utf8");
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
        const haystack = caseSensitive ? lines[index] : lines[index]?.toLowerCase();
        if (haystack?.includes(needle)) {
          results.push(`${relative}:${index + 1}:${lines[index]}`);
        }
      }
    } catch {
      continue;
    }
  }

  return jsonResult({ query, directory: path.relative(workspaceRoot, searchRoot) || ".", count: results.length, results });
}

async function runShellCommand(
  workspaceRoot: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (typeof args.command !== "string" || !args.command.trim()) {
    throw new Error("shell.run requires a command string.");
  }

  const timeoutMs = clampNumber(args.timeoutMs, 10000, 1000, 60000);
  const { stdout, stderr } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", args.command],
    {
      cwd: workspaceRoot,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
      windowsHide: true
    }
  );

  return jsonResult({
    command: args.command,
    cwd: workspaceRoot,
    stdout: truncate(stdout),
    stderr: truncate(stderr)
  });
}

async function walk(
  current: string,
  workspaceRoot: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  output: string[]
): Promise<void> {
  if (output.length >= maxFiles || depth > maxDepth) {
    return;
  }

  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (output.length >= maxFiles || shouldSkip(entry.name)) {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    const relative = path.relative(workspaceRoot, fullPath);
    output.push(entry.isDirectory() ? `${relative}/` : relative);
    if (entry.isDirectory()) {
      await walk(fullPath, workspaceRoot, depth + 1, maxDepth, maxFiles, output);
    }
  }
}

function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the AgenticLAN workspace: ${requestedPath}`);
  }
  return resolved;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function shouldSkip(name: string): boolean {
  return name === "node_modules" || name === ".git" || name === "dist" || name === "dist-electron";
}

function jsonResult(value: unknown): ToolResult {
  return {
    content: truncate(JSON.stringify(value, null, 2))
  };
}

function truncate(value: string): string {
  if (value.length <= maxToolOutputChars) {
    return value;
  }
  return `${value.slice(0, maxToolOutputChars)}\n...truncated`;
}
