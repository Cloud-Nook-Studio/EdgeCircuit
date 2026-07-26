import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const hostingDirectory = resolve(projectRoot, "dist");
const hostingServerEntry = resolve(hostingDirectory, "server", "index.js");
const vinextServerImplementation = resolve(
  hostingDirectory,
  "server",
  "vinext-index.js",
);
const vinextSsrEntry = resolve(hostingDirectory, "server", "ssr", "index.js");
const hostingConfig = resolve(projectRoot, ".openai", "hosting.json");
const packagedConfigDirectory = resolve(hostingDirectory, ".openai");
const packagedConfig = resolve(packagedConfigDirectory, "hosting.json");
const packagedManifest = resolve(hostingDirectory, "package.json");

if (!existsSync(hostingServerEntry)) {
  throw new Error("vinext did not produce dist/server/index.js.");
}
if (!existsSync(vinextSsrEntry)) {
  throw new Error("vinext did not produce dist/server/ssr/index.js.");
}

renameSync(hostingServerEntry, vinextServerImplementation);
writeFileSync(
  hostingServerEntry,
  [
    'import appHandler from "./vinext-index.js";',
    'export * from "./vinext-index.js";',
    "export default {",
    "  fetch(request, environment, context) {",
    "    return appHandler(request, environment, context);",
    "  },",
    "};",
    "",
  ].join("\n"),
);
writeFileSync(packagedManifest, '{"type":"module"}\n');
mkdirSync(packagedConfigDirectory, { recursive: true });
cpSync(hostingConfig, packagedConfig);
