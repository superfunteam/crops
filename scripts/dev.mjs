import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["server/dev.mjs"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((p) => p.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 200).unref();
}
for (const p of children) p.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
