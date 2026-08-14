import { spawn } from "node:child_process";
import { once } from "node:events";
import dotenv from "dotenv";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import waitOn from "wait-on";

const workspaceDir = process.cwd();
const repoRoot = path.resolve(workspaceDir, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const env = { ...process.env };
env.AGENTICLAN_CONFIG_PATH = path.join(repoRoot, "config", "runtime.local.json");
const port = await findAvailablePort(5173);
const viteUrl = `http://127.0.0.1:${port}`;
env.VITE_DEV_SERVER_URL = viteUrl;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
    ...options
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
}

const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");

const build = run(process.execPath, [tscBin, "-p", "tsconfig.electron.json"]);
const [buildCode] = await once(build, "exit");
if (buildCode !== 0) {
  process.exit(Number(buildCode));
}

const vite = run(process.execPath, [
  viteBin,
  "--host",
  "127.0.0.1",
  "--port",
  String(port),
  "--strictPort"
]);
await waitOn({ resources: [viteUrl], timeout: 30_000 });

const electronEnv = { ...env };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const electron = run(process.execPath, [electronCli, "."], {
  cwd: workspaceDir,
  env: electronEnv
});

function shutdown() {
  vite.kill();
  electron.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const [electronCode] = await once(electron, "exit");
vite.kill();
process.exit(Number(electronCode ?? 0));

async function findAvailablePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 100; candidate += 1) {
    if (await canBind(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find an available dev server port starting at ${startPort}.`);
}

function canBind(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(portToCheck, "127.0.0.1");
  });
}
