import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const exportDirectory = resolve(projectRoot, "out");
const hostingDirectory = resolve(projectRoot, "dist");

if (!existsSync(exportDirectory)) {
  throw new Error("Next.js did not produce the expected static export.");
}

rmSync(hostingDirectory, { force: true, recursive: true });
cpSync(exportDirectory, hostingDirectory, { recursive: true });
