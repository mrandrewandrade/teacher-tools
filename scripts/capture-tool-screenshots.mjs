import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "site", "tools.json"), "utf8"));
const localBase = process.env.TOOL_SCREENSHOT_BASE_URL || "https://andrewandrade.ca/teacher-tools/";
const outputDirectory = path.join(root, "site", "assets", "screenshots");
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
try {
  for (const tool of manifest.tools) {
    const page = await context.newPage();
    const target = new URL(tool.url, localBase).href;
    await page.goto(target, { waitUntil: "networkidle", timeout: 45_000 });
    await page.screenshot({
      path: path.join(root, "site", tool.image.replace(/^\.\//, "")),
      fullPage: false,
      animations: "disabled",
    });
    await page.close();
    console.log(`Captured ${tool.id}: ${target}`);
  }
} finally {
  await browser.close();
}
