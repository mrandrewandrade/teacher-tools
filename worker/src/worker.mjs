const SESSION_COOKIE = "teacher_tools_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const RESERVED_SLUGS = new Set(["404", "assets", "favicon", "health", "index", "redirects", "robots"]);
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const DEFAULT_SHORT_BASE_URL = "https://andrewandrade.ca/go/";

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    env.CLIENT_ORIGIN,
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ].filter(Boolean));
  return allowed.has(origin) ? origin : "";
}

function corsHeaders(origin) {
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  } : {};
}

function json(body, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

function randomToken(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function safeReturnUrl(value, env) {
  try {
    const url = new URL(value || env.CLIENT_ORIGIN);
    if (url.origin !== new URL(env.CLIENT_ORIGIN).origin) return env.CLIENT_ORIGIN;
    return url.href;
  } catch {
    return env.CLIENT_ORIGIN;
  }
}

function base64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function base64DecodeUtf8(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseRedirectCsv(text, baseUrl = DEFAULT_SHORT_BASE_URL) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("redirects.csv contains an unterminated quoted field.");
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const header = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
  if (!header || header.length !== 2 || header[0] !== "slug" || header[1] !== "destination") {
    throw new Error("redirects.csv must start with exactly: slug,destination");
  }
  const entries = rows
    .filter((values) => !values.every((value) => value.trim() === ""))
    .map((values, index) => {
      if (values.length !== 2) throw new Error(`CSV row ${index + 2} must have exactly two columns.`);
      return [values[0].trim(), values[1].trim()];
    });
  const duplicates = entries.find(([slug], index) => entries.findIndex(([other]) => other.toLowerCase() === slug.toLowerCase()) !== index);
  if (duplicates) throw new Error(`The slug "${duplicates[0]}" appears more than once in redirects.csv.`);
  return { baseUrl, links: Object.fromEntries(entries) };
}

function csvField(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeRedirectCsv(manifest) {
  const rows = [["slug", "destination"], ...Object.entries(manifest.links).sort(([a], [b]) => a.localeCompare(b))];
  return `${rows.map((values) => values.map(csvField).join(",")).join("\n")}\n`;
}

function validateProposal(input, manifest) {
  const errors = [];
  const slug = String(input?.slug || "").trim().toLowerCase();
  const destinationText = String(input?.destination || "").trim();
  if (!SLUG_PATTERN.test(slug) || slug.includes("--")) errors.push("Use a 1-64 character lowercase slug with single hyphens.");
  if (RESERVED_SLUGS.has(slug)) errors.push("That slug is reserved by the short-link site.");
  const collision = Object.keys(manifest.links || {}).find((existing) => existing.toLowerCase() === slug && existing !== slug);
  if (collision) errors.push(`The slug collides with existing mapping \"${collision}\".`);

  let destination;
  try {
    destination = new URL(destinationText);
    if (!["https:", "http:"].includes(destination.protocol)) errors.push("The destination must use HTTP or HTTPS.");
    if (destination.username || destination.password) errors.push("The destination cannot contain URL credentials.");
    if (destination.href.length > 2048) errors.push("The destination is too long.");
    const base = new URL(manifest.baseUrl);
    if (destination.origin === base.origin && destination.pathname.startsWith(base.pathname)) errors.push("The destination cannot point back into the short-link site.");
  } catch {
    errors.push("Enter a valid absolute destination URL.");
  }

  if (errors.length) throw new Error(errors.join(" "));
  return { slug, destination: destination.href };
}

async function githubRequest(path, session, env, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "andrewandrade-teacher-tools",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || `GitHub returned ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function sessionFor(request, env) {
  const id = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!id) return null;
  const session = await env.SESSIONS.get(`session:${id}`, "json");
  return session ? { ...session, id } : null;
}

async function startAuthorization(request, env) {
  const requestUrl = new URL(request.url);
  const state = randomToken();
  const returnTo = safeReturnUrl(requestUrl.searchParams.get("return_to"), env);
  await env.SESSIONS.put(`oauth:${state}`, JSON.stringify({ returnTo }), { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  authorize.searchParams.set("scope", "public_repo");
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize.href, 302);
}

async function finishAuthorization(request, env) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const pending = state && await env.SESSIONS.get(`oauth:${state}`, "json");
  if (!code || !pending) return json({ error: "The authorization request is missing or expired." }, 400);
  await env.SESSIONS.delete(`oauth:${state}`);

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) return json({ error: token.error_description || "GitHub authorization failed." }, 401);

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "andrewandrade-teacher-tools",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const user = await userResponse.json();
  const allowedUsers = new Set(String(env.ALLOWED_GITHUB_USERS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!userResponse.ok || !allowedUsers.has(String(user.login || "").toLowerCase())) {
    return json({ error: "This GitHub account is not authorized to create short-link pull requests." }, 403);
  }

  const sessionId = randomToken();
  const session = { accessToken: token.access_token, login: user.login, csrfToken: randomToken(), createdAt: new Date().toISOString() };
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  const response = Response.redirect(pending.returnTo, 302);
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

async function createPullRequest(request, env, session, origin) {
  if (request.headers.get("X-CSRF-Token") !== session.csrfToken) return json({ error: "The authorization token is missing or expired." }, 403, origin);
  const owner = env.GITHUB_OWNER || "mrandrewandrade";
  const repository = env.GITHUB_REPO || "go";
  const baseBranch = env.GITHUB_BASE_BRANCH || "main";
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

  const content = await githubRequest(`${prefix}/contents/redirects.csv?ref=${encodeURIComponent(baseBranch)}`, session, env);
  const manifest = parseRedirectCsv(base64DecodeUtf8(content.content), env.SHORT_BASE_URL || DEFAULT_SHORT_BASE_URL);
  const proposal = validateProposal(await request.json(), manifest);
  const previous = manifest.links[proposal.slug];
  if (previous === proposal.destination) return json({ error: "That slug already points to this destination; no change is needed." }, 409, origin);

  manifest.links[proposal.slug] = proposal.destination;
  const sortedLinks = Object.fromEntries(Object.entries(manifest.links).sort(([a], [b]) => a.localeCompare(b)));
  manifest.links = sortedLinks;
  const ref = await githubRequest(`${prefix}/git/ref/heads/${encodeURIComponent(baseBranch)}`, session, env);
  const branch = `short-link/${proposal.slug}-${Date.now().toString(36)}`;
  await githubRequest(`${prefix}/git/refs`, session, env, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
  });
  await githubRequest(`${prefix}/contents/redirects.csv`, session, env, {
    method: "PUT",
    body: JSON.stringify({
      message: `${previous ? "Update" : "Add"} short link ${proposal.slug}`,
      content: base64EncodeUtf8(serializeRedirectCsv(manifest)),
      sha: content.sha,
      branch,
    }),
  });
  const pullRequest = await githubRequest(`${prefix}/pulls`, session, env, {
    method: "POST",
    body: JSON.stringify({
      title: `${previous ? "Update" : "Add"} short link: ${proposal.slug}`,
      head: branch,
      base: baseBranch,
      body: previous
        ? `Update \`${proposal.slug}\` while preserving the public URL and existing QR codes.\n\n- Previous: ${previous}\n- New: ${proposal.destination}`
        : `Add \`${proposal.slug}\` → ${proposal.destination}.\n\nCreated from Teacher Tools.`,
    }),
  });
  return json({ number: pullRequest.number, url: pullRequest.html_url, branch, action: previous ? "update" : "create" }, 201, origin);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);

  if (request.method === "OPTIONS") {
    if (!origin) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (url.pathname === "/auth/start" && request.method === "GET") return startAuthorization(request, env);
  if (url.pathname === "/auth/callback" && request.method === "GET") return finishAuthorization(request, env);
  if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });

  if (!origin) return json({ error: "Origin is not allowed." }, 403);
  const session = await sessionFor(request, env);
  if (url.pathname === "/api/me" && request.method === "GET") {
    return session
      ? json({ login: session.login, csrfToken: session.csrfToken }, 200, origin)
      : json({ error: "Authorization required." }, 401, origin);
  }
  if (url.pathname === "/api/pull-requests" && request.method === "POST") {
    if (!session) return json({ error: "Authorization required." }, 401, origin);
    try {
      return await createPullRequest(request, env, session, origin);
    } catch (error) {
      return json({ error: error.message || "The pull request could not be created." }, 400, origin);
    }
  }
  return json({ error: "Not found." }, 404, origin);
}

export default { fetch: handleRequest };

