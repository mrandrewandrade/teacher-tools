import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const SHORT_URL = "https://andrewandrade.ca/go/learning-skills-form/";

async function prepare(page) {
  await page.route("https://andrewandrade.ca/go/redirects.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ baseUrl: "https://andrewandrade.ca/go/", links: {} }),
  }));
}

async function downloadPng(page, testInfo, name) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  const output = testInfo.outputPath(name);
  await download.saveAs(output);
  const image = PNG.sync.read(await fs.readFile(output));
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height, { inversionAttempts: "dontInvert" });
  expect(decoded?.data).toBe(SHORT_URL);
  return output;
}

test("gallery renders all manifest entries and valid open links", async ({ page }) => {
  const failed = [];
  page.on("requestfailed", (request) => failed.push(request.url()));
  await page.goto("/teacher-tools/");
  await expect(page.getByRole("heading", { name: "Teacher Tools" })).toBeVisible();
  await expect(page.locator(".tool-card")).toHaveCount(6);
  await expect(page.locator(".tool-preview img")).toHaveCount(6);
  await expect.poll(() => page.locator(".tool-preview img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth >= 900))).toBe(true);
  await expect(page.getByText("6 tools")).toBeVisible();
  await expect(page.locator(".open-link")).toHaveCount(6);
  expect(failed).toEqual([]);
});

test("QR SVG and PNG export scan to the stable short URL", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/teacher-tools/links/");
  await page.getByLabel("Destination").fill("https://example.org/forms/first");
  await page.getByLabel("Readable slug").fill("learning-skills-form");
  await page.getByRole("button", { name: "Generate QR code" }).click();
  await expect(page.locator("#qr-code svg")).toBeVisible();
  await expect(page.locator("#qr-label")).toHaveText(SHORT_URL);

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = testInfo.outputPath("learning-skills-form.svg");
  await svgDownload.saveAs(svgPath);
  const svg = await fs.readFile(svgPath, "utf8");
  expect(svg).toContain(SHORT_URL);
  expect(svg).toContain("viewBox");

  await downloadPng(page, testInfo, "learning-skills-form.png");
});

test("exported QR remains scannable with an optional logo", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/teacher-tools/links/");
  await page.getByLabel("Destination").fill("https://example.org/forms/logo");
  await page.getByLabel("Readable slug").fill("learning-skills-form");
  await page.getByLabel("Optional centre logo").setInputFiles({
    name: "aa-logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#e8582b"/><path d="M20 70 48 18l28 52M31 52h34" fill="none" stroke="white" stroke-width="9"/></svg>'),
  });
  await page.getByRole("button", { name: "Generate QR code" }).click();
  await expect(page.getByText(/small centre logo/)).toBeVisible();
  await downloadPng(page, testInfo, "learning-skills-form-logo.png");
});

test("changing a destination keeps the original QR payload", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/teacher-tools/links/");
  await page.getByLabel("Destination").fill("https://example.org/forms/old");
  await page.getByLabel("Readable slug").fill("learning-skills-form");
  await page.getByRole("button", { name: "Generate QR code" }).click();
  await downloadPng(page, testInfo, "before-update.png");

  await page.getByLabel("Destination").fill("https://example.org/forms/new");
  await page.getByRole("button", { name: "Generate QR code" }).click();
  await downloadPng(page, testInfo, "after-update.png");
  await expect(page.locator("#short-url")).toHaveText(SHORT_URL);
});

test("gallery and QR form fit a phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teacher-tools/");
  await expect(page.locator(".tool-card")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await prepare(page);
  await page.goto("/teacher-tools/links/");
  await expect(page.getByRole("heading", { name: "Link details" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

