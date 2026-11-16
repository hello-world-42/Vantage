// Runs every backend test file: tests/**/*.test.ts and src/**/*.test.ts.
// Finds the files itself so `npm test` works the same on Windows, macOS and Linux
// (shells disagree on ** globs, and Node 20 can't expand them for --test).
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("..", import.meta.url));

const files = ["tests", "src"]
  .flatMap((dir) => readdirSync(join(backendDir, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => relative(backendDir, join(entry.parentPath ?? entry.path, entry.name))))
  .sort();

if (files.length === 0) {
  console.error("No backend test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: backendDir,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
