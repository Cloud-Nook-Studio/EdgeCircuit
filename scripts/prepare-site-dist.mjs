import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const hostingDirectory = resolve(projectRoot, "dist");
const vinextServerEntry = resolve(hostingDirectory, "server", "index.mjs");
const hostingServerEntry = resolve(hostingDirectory, "server", "index.js");
const hostingConfig = resolve(projectRoot, ".openai", "hosting.json");
const packagedConfigDirectory = resolve(hostingDirectory, ".openai");
const packagedConfig = resolve(packagedConfigDirectory, "hosting.json");
const packagedManifest = resolve(hostingDirectory, "package.json");

if (!existsSync(vinextServerEntry)) {
  throw new Error("vinext did not produce dist/server/index.mjs.");
}

writeFileSync(
  hostingServerEntry,
  'export { default } from "./index.mjs";\nexport * from "./index.mjs";\n',
);
writeFileSync(packagedManifest, '{"type":"module"}\n');
mkdirSync(packagedConfigDirectory, { recursive: true });
cpSync(hostingConfig, packagedConfig);
