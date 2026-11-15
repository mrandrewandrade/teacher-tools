import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "site");
const output = path.join(root, "dist");
const vendorCandidates = [
  path.join(root, "node_modules", "qr-code-styling", "lib", "qr-code-styling.js"),
  path.join(root, "node_modules", "qr-code-styling", "lib", "qr-code-styling.common.js"),
];

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next supported package layout.
    }
  }
  throw new Error("Could not find the qr-code-styling browser bundle. Run npm ci and inspect the pinned package layout.");
}

async function validateToolsManifest() {
  const file = path.join(source, "tools.json");
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    throw new Error("site/tools.json must contain a non-empty tools array.");
  }

  const ids = new Set();
  for (const tool of manifest.tools) {
    if (!tool.id || !tool.name || !tool.description || !tool.url) {
      throw new Error("Every gallery entry needs id, name, description, and url.");
    }
    if (ids.has(tool.id)) throw new Error(`Duplicate gallery id: ${tool.id}`);
    ids.add(tool.id);
    const url = new URL(tool.url, "https://andrewandrade.ca/teacher-tools/");
    if (url.protocol !== "https:") throw new Error(`Gallery URL must use HTTPS: ${tool.url}`);
  }
  return manifest;
}

const manifest = await validateToolsManifest();
await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true });
await fs.writeFile(path.join(output, ".nojekyll"), "", "utf8");
await fs.mkdir(path.join(output, "assets", "vendor"), { recursive: true });
await fs.copyFile(await firstExisting(vendorCandidates), path.join(output, "assets", "vendor", "qr-code-styling.js"));
console.log(`Built ${manifest.tools.length} gallery entries in ${output}.`);

