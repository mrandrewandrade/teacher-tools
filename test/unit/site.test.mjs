import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("gallery manifest contains every verified tool and unique ids", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "site", "tools.json"), "utf8"));
  const ids = manifest.tools.map((tool) => tool.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  for (const expected of ["short-links", "soundboard", "sos", "plate-builder", "leg-builder", "nice-design"]) {
    assert.ok(ids.includes(expected), `missing ${expected}`);
  }
  for (const tool of manifest.tools) {
    assert.ok(tool.name && tool.description && tool.url && tool.image);
    assert.equal(new URL(tool.url, "https://andrewandrade.ca/teacher-tools/").protocol, "https:");
    const imagePath = path.join(root, "site", tool.image.replace(/^\.\//, ""));
    assert.ok((await fs.stat(imagePath)).size > 10_000, `missing or undersized screenshot for ${tool.id}`);
  }
});

test("Teacher Tools reuses the Tech Ed brand fonts", async () => {
  const css = await fs.readFile(path.join(root, "site", "assets", "site.css"), "utf8");
  assert.match(css, /font-family:\s*"Source Sans 3"/);
  assert.match(css, /font-family:\s*"Source Code Pro"/);
  assert.doesNotMatch(css, /Iowan Old Style|Palatino|Avenir Next/);
  for (const file of [
    "SourceSans3-VariableFont_wght.ttf",
    "SourceSans3-Italic-VariableFont_wght.ttf",
    "SourceCodePro-VariableFont_wght.ttf",
    "SourceCodePro-Italic-VariableFont_wght.ttf",
  ]) {
    assert.ok((await fs.stat(path.join(root, "site", "assets", "fonts", file))).size > 100_000);
  }
});

test("source pages use project-relative assets", async () => {
  const gallery = await fs.readFile(path.join(root, "site", "index.html"), "utf8");
  const links = await fs.readFile(path.join(root, "site", "links", "index.html"), "utf8");
  assert.match(gallery, /href="\.\/assets\/site\.css"/);
  assert.match(gallery, /src="\.\/assets\/gallery\.js"/);
  assert.match(links, /src="\.\.\/assets\/vendor\/qr-code-styling\.js"/);
  assert.match(links, /href="\.\.\/assets\/links\.css"/);
  assert.doesNotMatch(gallery, /(?:href|src)="\/assets\//);
  assert.doesNotMatch(links, /(?:href|src)="\/assets\//);
});

test("static configuration contains no credential or token", async () => {
  const config = await fs.readFile(path.join(root, "site", "config.js"), "utf8");
  assert.match(config, /prApiBase:\s*""/);
  assert.doesNotMatch(config, /clientSecret|accessToken|githubToken|privateKey/i);
});

