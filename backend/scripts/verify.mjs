import { spawnSync } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tasks = [
  ["run", "db:generate"],
  ["run", "db:migrate"],
  ["run", "db:seed"],
  ["run", "check"],
  ["test"],
  ["--prefix", "../frontend", "run", "build"],
  ["--prefix", "../frontend", "run", "test:e2e"],
  ["audit", "--omit=dev"],
  ["--prefix", "../frontend", "audit", "--omit=dev"],
];
for (const args of tasks) {
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
