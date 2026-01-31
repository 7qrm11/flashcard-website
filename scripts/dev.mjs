import { spawn } from "node:child_process";

const args = process.argv.slice(2);

const child = spawn("next", ["dev", ...args], {
  stdio: "inherit",
  env: process.env,
});

function shutdown(signal) {
  if (child.killed) {
    return;
  }
  child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(typeof code === "number" ? code : 1);
});
