import { spawnSync } from "node:child_process";

const commands = [
  [
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "src/test/unit/services/app/resetService.spec.ts",
      "src/test/unit/pages/AppSettingsPage.reset.spec.ts",
    ],
  ],
  [
    "cargo",
    ["test", "--manifest-path", "src-tauri/Cargo.toml", "reset_runtime"],
  ],
];

for (const [command, args] of commands) {
  const result =
    process.platform === "win32" && command === "pnpm"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], {
          cwd: process.cwd(),
          stdio: "inherit",
        })
      : spawnSync(command, args, {
          cwd: process.cwd(),
          stdio: "inherit",
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
