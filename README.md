# Teacher Tools

The manifest-driven gallery for `https://andrewandrade.ca/teacher-tools/`, plus a browser-only QR generator and authenticated short-link proposal flow.

## Add a gallery card

Edit [`site/tools.json`](site/tools.json). Each entry needs an `id`, `name`, one-line `description`, `url`, screenshot `image`, and optional `tag`. The layout is rendered from that one manifest; no HTML changes are required.

Refresh all standardized 960×540 tool screenshots with:

```sh
npm run capture:screenshots
```

Relative tool URLs use the live Teacher Tools site by default. Set `TOOL_SCREENSHOT_BASE_URL` to a local preview URL when capturing an unpublished local tool.

## Local development

```sh
npm ci
npm run test:all
```

`npm run build` creates `dist/` and vendors the pinned `qr-code-styling` browser bundle. QR codes use error correction level H, a 24 px quiet zone, optional constrained centre logos, and optional readable URL captions. Browser tests decode the exported PNG both with and without a logo.

The interface reuses the locally hosted Source Sans 3 and Source Code Pro files and the core palette documented by Technological Education Resources.

## Pull-request integration

Short-link mappings are maintained in `go/redirects.csv`; the `go` build generates the public JSON used by this page. The static site never receives a GitHub token. `worker/` contains the server-side OAuth and GitHub API integration that proposes CSV changes; see [`worker/README.md`](worker/README.md) for the remaining live Cloudflare and OAuth setup. Until `site/config.js` has a deployed `prApiBase`, the page clearly reports that PR creation is not configured while QR creation remains fully available.

## Initial Pages setup

In GitHub, open **Settings → Pages → Build and deployment** and select **GitHub Actions**. The account site owns `andrewandrade.ca`, so this project publishes at `/teacher-tools/` without a project-level `CNAME`.

