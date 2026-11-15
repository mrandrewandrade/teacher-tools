import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/worker.mjs";

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key);
    return type === "json" && value ? JSON.parse(value) : value ?? null;
  }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}

function encode(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function environment() {
  const sessions = new MemoryKv();
  sessions.values.set("session:test-session", JSON.stringify({ accessToken: "server-token", login: "mrandrewandrade", csrfToken: "csrf-value" }));
  return {
    CLIENT_ORIGIN: "https://andrewandrade.ca",
    GITHUB_OWNER: "mrandrewandrade",
    GITHUB_REPO: "go",
    GITHUB_BASE_BRANCH: "main",
    SESSIONS: sessions,
  };
}

function apiRequest(body, overrides = {}) {
  return new Request("https://teacher-tools-api.andrewandrade.ca/api/pull-requests", {
    method: "POST",
    headers: {
      Origin: "https://andrewandrade.ca",
      Cookie: "teacher_tools_session=test-session",
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf-value",
      ...(overrides.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

test("requires an authorized server-side session", async () => {
  const response = await handleRequest(new Request("https://teacher-tools-api.andrewandrade.ca/api/me", {
    headers: { Origin: "https://andrewandrade.ca" },
  }), environment());
  assert.equal(response.status, 401);
});

test("creates a branch, mapping commit, and pull request", async (context) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let committedManifest;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if (String(url).includes("/contents/redirects.json?") && !init.method) {
      return Response.json({ sha: "file-sha", content: encode(JSON.stringify({ baseUrl: "https://andrewandrade.ca/go/", links: {} })) });
    }
    if (String(url).includes("/git/ref/heads/main")) return Response.json({ object: { sha: "base-sha" } });
    if (String(url).endsWith("/git/refs")) return Response.json({ ref: "refs/heads/test" }, { status: 201 });
    if (String(url).endsWith("/contents/redirects.json") && init.method === "PUT") {
      const body = JSON.parse(init.body);
      committedManifest = JSON.parse(decodeURIComponent(escape(atob(body.content))));
      return Response.json({ commit: { sha: "commit-sha" } });
    }
    if (String(url).endsWith("/pulls")) return Response.json({ number: 17, html_url: "https://github.com/mrandrewandrade/go/pull/17" }, { status: 201 });
    return Response.json({ message: "Unexpected mock request" }, { status: 500 });
  };
  context.after(() => { globalThis.fetch = previousFetch; });

  const response = await handleRequest(apiRequest({ slug: "learning-skills-form", destination: "https://example.org/forms/current" }), environment());
  assert.equal(response.status, 201);
  assert.equal((await response.json()).url, "https://github.com/mrandrewandrade/go/pull/17");
  assert.equal(committedManifest.links["learning-skills-form"], "https://example.org/forms/current");
  assert.ok(calls.some((call) => call.method === "POST" && call.url.endsWith("/git/refs")));
  assert.ok(calls.some((call) => call.method === "POST" && call.url.endsWith("/pulls")));
});

test("updates an existing slug rather than changing its permanent URL", async (context) => {
  const previousFetch = globalThis.fetch;
  let committedManifest;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("/contents/redirects.json?") && !init.method) {
      return Response.json({ sha: "file-sha", content: encode(JSON.stringify({
        baseUrl: "https://andrewandrade.ca/go/",
        links: { "learning-skills-form": "https://example.org/forms/old" },
      })) });
    }
    if (String(url).includes("/git/ref/heads/main")) return Response.json({ object: { sha: "base-sha" } });
    if (String(url).endsWith("/git/refs")) return Response.json({}, { status: 201 });
    if (String(url).endsWith("/contents/redirects.json") && init.method === "PUT") {
      const body = JSON.parse(init.body);
      committedManifest = JSON.parse(decodeURIComponent(escape(atob(body.content))));
      return Response.json({});
    }
    if (String(url).endsWith("/pulls")) return Response.json({ number: 18, html_url: "https://github.com/mrandrewandrade/go/pull/18" }, { status: 201 });
    return Response.json({ message: "Unexpected" }, { status: 500 });
  };
  context.after(() => { globalThis.fetch = previousFetch; });

  const response = await handleRequest(apiRequest({ slug: "learning-skills-form", destination: "https://example.org/forms/new" }), environment());
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.action, "update");
  assert.equal(committedManifest.links["learning-skills-form"], "https://example.org/forms/new");
  assert.equal(new URL("learning-skills-form/", committedManifest.baseUrl).href, "https://andrewandrade.ca/go/learning-skills-form/");
});

