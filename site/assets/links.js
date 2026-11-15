const config = window.TEACHER_TOOLS_CONFIG || {};
const form = document.querySelector("#link-form");
const destinationInput = document.querySelector("#destination");
const slugInput = document.querySelector("#slug");
const logoInput = document.querySelector("#logo");
const includeLabelInput = document.querySelector("#include-label");
const shortUrlOutput = document.querySelector("#short-url");
const mappingStatus = document.querySelector("#mapping-status");
const formError = document.querySelector("#form-error");
const qrCodeElement = document.querySelector("#qr-code");
const qrEmpty = document.querySelector("#qr-empty");
const qrLabel = document.querySelector("#qr-label");
const qrMessage = document.querySelector("#qr-message");
const copyButton = document.querySelector("#copy-url");
const svgButton = document.querySelector("#download-svg");
const pngButton = document.querySelector("#download-png");
const authStatus = document.querySelector("#auth-status");
const authorizeLink = document.querySelector("#authorize");
const openPrButton = document.querySelector("#open-pr");
const prResult = document.querySelector("#pr-result");

const RESERVED_SLUGS = new Set(["404", "assets", "favicon", "health", "index", "redirects", "robots"]);
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const shortBaseUrl = new URL(config.shortBaseUrl || "https://andrewandrade.ca/go/");

const state = {
  manifest: { links: {} },
  qr: null,
  logoDataUrl: "",
  generated: null,
  csrfToken: "",
  authLogin: "",
};

function normalizedSlug() {
  return slugInput.value.trim().toLowerCase().replace(/\s+/g, "-");
}

function shortUrlFor(slug) {
  return new URL(`${encodeURIComponent(slug || "your-slug")}/`, shortBaseUrl).href;
}

function setFieldValidity(input, message) {
  input.setCustomValidity(message);
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function validateInputs() {
  const slug = normalizedSlug();
  let destination;
  let slugError = "";
  let destinationError = "";

  if (!slug) slugError = "Enter a readable slug.";
  else if (!SLUG_PATTERN.test(slug) || slug.includes("--")) slugError = "Use lowercase letters, numbers, and single hyphens without a leading or trailing hyphen.";
  else if (RESERVED_SLUGS.has(slug)) slugError = "That slug is reserved by the short-link site.";

  try {
    destination = new URL(destinationInput.value.trim());
    if (!["http:", "https:"].includes(destination.protocol)) destinationError = "The destination must use HTTP or HTTPS.";
    else if (destination.username || destination.password) destinationError = "The destination cannot contain URL credentials.";
    else if (destination.href.length > 2048) destinationError = "The destination is too long.";
    else if (destination.origin === shortBaseUrl.origin && destination.pathname.startsWith(shortBaseUrl.pathname)) destinationError = "The destination cannot point back into the short-link site.";
  } catch {
    destinationError = "Enter a complete destination URL, including https://";
  }

  setFieldValidity(slugInput, slugError);
  setFieldValidity(destinationInput, destinationError);
  const errors = [destinationError, slugError].filter(Boolean);
  formError.hidden = errors.length === 0;
  formError.textContent = errors.join(" ");
  return errors.length ? null : { slug, destination: destination.href, shortUrl: shortUrlFor(slug) };
}

function updatePreview() {
  const slug = normalizedSlug();
  shortUrlOutput.textContent = shortUrlFor(slug);
  const current = state.manifest.links?.[slug];
  if (!slug) mappingStatus.textContent = "Enter a slug to check whether it is already published.";
  else if (current) mappingStatus.textContent = `Published slug. A proposal will update its current destination: ${current}`;
  else mappingStatus.textContent = "Available in the published manifest. A proposal will create it.";
  prResult.hidden = true;
}

async function readLogo() {
  const file = logoInput.files?.[0];
  if (!file) {
    state.logoDataUrl = "";
    return;
  }
  if (file.size > 1_000_000) throw new Error("Logo files must be 1 MB or smaller.");
  if (!new Set(["image/png", "image/jpeg", "image/svg+xml"]).has(file.type)) throw new Error("Use a PNG, JPG, or SVG logo.");
  state.logoDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The logo could not be read."));
    reader.readAsDataURL(file);
  });
}

function qrOptions(details) {
  const options = {
    width: 320,
    height: 320,
    type: "svg",
    data: details.shortUrl,
    margin: 24,
    qrOptions: { errorCorrectionLevel: "H" },
    dotsOptions: { color: "#000000", type: "square" },
    cornersSquareOptions: { color: "#000000", type: "square" },
    cornersDotOptions: { color: "#000000", type: "square" },
    backgroundOptions: { color: "#ffffff" },
  };
  if (state.logoDataUrl) {
    options.image = state.logoDataUrl;
    options.imageOptions = {
      crossOrigin: "anonymous",
      hideBackgroundDots: true,
      imageSize: 0.16,
      margin: 6,
    };
  }
  return options;
}

async function generateQr(details) {
  if (typeof window.QRCodeStyling !== "function") throw new Error("The QR generator did not load. Refresh the page and try again.");
  await readLogo();
  qrCodeElement.replaceChildren();
  state.qr = new window.QRCodeStyling(qrOptions(details));
  state.qr.append(qrCodeElement);
  state.generated = details;
  qrEmpty.hidden = true;
  qrLabel.hidden = !includeLabelInput.checked;
  qrLabel.textContent = details.shortUrl;
  for (const button of [copyButton, svgButton, pngButton]) button.disabled = false;
  qrMessage.textContent = state.logoDataUrl
    ? "Generated with high error correction, a 24 px quiet zone, and a small centre logo."
    : "Generated with high error correction and a 24 px quiet zone.";
}

async function rawSvgBlob() {
  if (!state.qr || !state.generated) throw new Error("Generate a QR code first.");
  const raw = await state.qr.getRawData("svg");
  if (!includeLabelInput.checked) return raw;

  const documentNode = new DOMParser().parseFromString(await raw.text(), "image/svg+xml");
  const root = documentNode.documentElement;
  if (root.nodeName.toLowerCase() === "parsererror") throw new Error("The QR SVG could not be prepared for download.");
  const viewBox = (root.getAttribute("viewBox") || "0 0 320 320").split(/\s+/).map(Number);
  const width = viewBox[2] || 320;
  const qrHeight = viewBox[3] || 320;
  const labelHeight = 46;
  root.setAttribute("viewBox", `0 0 ${width} ${qrHeight + labelHeight}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(qrHeight + labelHeight));

  const namespace = "http://www.w3.org/2000/svg";
  const background = documentNode.createElementNS(namespace, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", String(qrHeight));
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(labelHeight));
  background.setAttribute("fill", "#ffffff");
  root.appendChild(background);

  const text = documentNode.createElementNS(namespace, "text");
  text.setAttribute("x", String(width / 2));
  text.setAttribute("y", String(qrHeight + 27));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "ui-monospace, SFMono-Regular, Consolas, monospace");
  text.setAttribute("font-size", "12");
  text.setAttribute("font-weight", "700");
  text.setAttribute("fill", "#000000");
  if (state.generated.shortUrl.length > 42) {
    text.setAttribute("textLength", String(width - 24));
    text.setAttribute("lengthAdjust", "spacingAndGlyphs");
  }
  text.textContent = state.generated.shortUrl;
  root.appendChild(text);
  return new Blob([new XMLSerializer().serializeToString(documentNode)], { type: "image/svg+xml" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(svgBlob) {
  const source = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The QR image could not be rendered."));
      image.src = source;
    });
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The PNG could not be created.")),
      "image/png",
    ));
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function withQrAction(action) {
  try {
    await action();
  } catch (error) {
    qrMessage.textContent = error.message;
  }
}

async function loadManifest() {
  try {
    const response = await fetch(config.redirectsManifestUrl || new URL("redirects.json", shortBaseUrl), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    const manifest = await response.json();
    if (!manifest.links || typeof manifest.links !== "object") throw new Error("Manifest has no links object");
    state.manifest = manifest;
  } catch (error) {
    console.warn("Published redirects are not available yet.", error);
    mappingStatus.textContent = "Published mappings are not available yet; the server will check collisions before opening a pull request.";
  }
  updatePreview();
}

async function refreshAuthorization() {
  const apiBase = String(config.prApiBase || "").replace(/\/$/, "");
  if (!apiBase) {
    authStatus.textContent = "PR service setup is still required. QR generation and downloads work now.";
    authorizeLink.hidden = true;
    openPrButton.disabled = true;
    return;
  }

  authorizeLink.href = `${apiBase}/auth/start?return_to=${encodeURIComponent(location.href)}`;
  try {
    const response = await fetch(`${apiBase}/api/me`, { credentials: "include", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Not authorized");
    const account = await response.json();
    state.csrfToken = account.csrfToken;
    state.authLogin = account.login;
    authStatus.textContent = `Authorized as @${account.login}.`;
    authorizeLink.hidden = true;
    openPrButton.disabled = false;
  } catch {
    state.csrfToken = "";
    state.authLogin = "";
    authStatus.textContent = "Authorize your allowed GitHub account before opening a pull request.";
    authorizeLink.hidden = false;
    openPrButton.disabled = true;
  }
}

async function openPullRequest() {
  const details = validateInputs();
  if (!details) return;
  const apiBase = String(config.prApiBase || "").replace(/\/$/, "");
  openPrButton.disabled = true;
  authStatus.textContent = "Creating a review branch and pull request…";
  prResult.hidden = true;
  try {
    const response = await fetch(`${apiBase}/api/pull-requests`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrfToken,
      },
      body: JSON.stringify({ slug: details.slug, destination: details.destination }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `PR service returned ${response.status}`);
    authStatus.textContent = `Pull request #${result.number} is ready for review.`;
    prResult.href = result.url;
    prResult.hidden = false;
  } catch (error) {
    authStatus.textContent = error.message;
  } finally {
    openPrButton.disabled = !state.authLogin;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  slugInput.value = normalizedSlug();
  const details = validateInputs();
  if (!details) return;
  try {
    await generateQr(details);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

slugInput.addEventListener("input", updatePreview);
slugInput.addEventListener("blur", () => { slugInput.value = normalizedSlug(); updatePreview(); });
destinationInput.addEventListener("input", () => { prResult.hidden = true; });
includeLabelInput.addEventListener("change", () => {
  if (!state.generated) return;
  qrLabel.hidden = !includeLabelInput.checked;
  qrLabel.textContent = state.generated.shortUrl;
});
logoInput.addEventListener("change", () => { qrMessage.textContent = "Generate again to apply the selected logo."; });

copyButton.addEventListener("click", () => withQrAction(async () => {
  await navigator.clipboard.writeText(state.generated.shortUrl);
  qrMessage.textContent = "Short URL copied.";
}));
svgButton.addEventListener("click", () => withQrAction(async () => {
  downloadBlob(await rawSvgBlob(), `${state.generated.slug}-qr.svg`);
  qrMessage.textContent = "SVG downloaded.";
}));
pngButton.addEventListener("click", () => withQrAction(async () => {
  downloadBlob(await svgToPng(await rawSvgBlob()), `${state.generated.slug}-qr.png`);
  qrMessage.textContent = "PNG downloaded.";
}));
openPrButton.addEventListener("click", openPullRequest);

window.__teacherToolsQr = { rawSvgBlob, svgToPng, state };
await Promise.all([loadManifest(), refreshAuthorization()]);

