import { spawn } from "node:child_process";
const run = (args) => spawn(process.execPath, args, { stdio: "inherit" });
const build = run(["../node_modules/typescript/bin/tsc"]);
build.on("exit", (code) => {
  if (code) process.exit(code);
  const compiler = run([
    "../node_modules/typescript/bin/tsc",
    "--watch",
    "--preserveWatchOutput",
  ]);
  const server = run(["--watch", "dist/src/main.js"]);
  const stop = () => {
    compiler.kill();
    server.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", stop);
});
