# Better-BHHB

A Swiss army knife for Burp HTTP history: import, filter, diff, replay, and export, all in the browser.

Built for Burp Suite Community Edition. Runs entirely as a [PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps). Install it, work offline, and keep your data on your device.

➡️ **https://better-bhhb.pages.dev**

[![Screenshot](src/assets/bhhb.png)](https://better-bhhb.pages.dev)

## What problem does this solve?

Burp Suite Community Edition does not include disk-based projects, so HTTP history, sitemap data, and Logger output are lost when a temporary session ends.

CE users can still export records (Ctrl+A → **Save items** in the context menu of **Proxy → HTTP history**, **Target → Sitemap**, or **Logger**) to a Burp XML file. **Better-BHHB** opens those exports and presents them in a fast, filterable UI.

Better-BHHB goes further: a [Burp extension](#burp-suite-extension) can push history directly into the app in seconds, with no manual XML export step. Sessions persist in the browser, support multiple workspaces, and include diffing, replay, and advanced filtering.

Related forum thread: [How do I view items export from Burp's proxy's history?](https://forum.portswigger.net/thread/how-do-i-view-items-export-from-burp-s-proxy-s-history-0ae0f99e)

## Quick start

### Option A: Burp extension (recommended)

1. Install the [Better-BHHB Burp extension](burp-extension/README.md) (pre-built JAR from [Releases](https://github.com/rizakara/better-bhhb/releases?q=burp-extension) or build with `./gradlew jar` in `burp-extension/`).
2. Open Better-BHHB, the live PWA at [better-bhhb.pages.dev](https://better-bhhb.pages.dev) or a local dev server.
3. In Burp, select items in **Proxy → HTTP history**, **Target → Sitemap**, **Logger**, or **Intruder → attack results**, then right-click → **Extensions → Send selected…** (or **Send all…** for proxy history / sitemap).
4. The extension starts a short-lived server on `localhost:19876`–`19886`. The PWA polls automatically and imports within a couple of seconds.

See [burp-extension/README.md](burp-extension/README.md) for install steps, PWA URL configuration, and debugging.

### Option B: Import XML manually

1. Export from Burp via **Save items** (see above).
2. In Better-BHHB, use **Import files…**, drag-and-drop onto the page, or pick a file from **Imported sessions…** (previously opened files are remembered in IndexedDB).

On import you can merge into the current session, replace it, or open a new workspace. Duplicate requests are detected and can be merged or skipped.

## Features

### Import & session management

- **Drag-and-drop** XML import anywhere on the page
- **IndexedDB persistence:** reopen recent exports from **Imported sessions…** without re-picking files
- **Import mode dialog:** merge, replace, or import into a new workspace
- **Duplicate detection** with a merge/skip dialog
- **Session history** dialog with multi-select restore

### Workspaces (multi-tab)

- Multiple named workspaces, each preserving its own file, filters, column layout, and UI state
- Create, rename, switch, and close tabs from the workspace menu
- **Import/export** workspace bundles (`.bhhb-workspace.json`): single workspace or all tabs at once

### Table & filtering

- **Per-column filters** with text modes, value pickers, and active filter chips
- **Column visibility** and **resizable columns:** preferences persist per workspace
- **Sitemap tree view** (`t`): browse requests by host and path
- **Context menu** on cells: filter by value, copy
- **Global search** (`/` or Ctrl+F) across all columns; **Ctrl+Shift+F** clears all filters
- Row navigation with arrow keys, Home/End, Page Up/Down

### Request & response analysis

- Dedicated **request** and **response** panels with in-panel search (`r` / `e`) and match navigation
- **Inspector:** attributes, cookies, request/response headers
- **Diff mode:** side-by-side or unified comparison between two requests
- **Replay mode:** edit and resend requests in-browser; export as **cURL**
- **Per-request comments** (`n`) preserved across export
- Large bodies are **truncated** with one-click expand for performance

### Performance

- **Web Worker** history indexing with progress UI for large exports
- Row parsing service with caching and loading states

### UX

- **Light/dark themes** plus adjustable UI font size, row density, and monospace text size
- Footer **export statistics:** item counts, visible subset, status breakdown, Burp version, export time
- **Filtered export:** save all items or only the currently filtered subset
- Native file picker and async save where the browser supports it

## Burp Suite extension

The Java extension lives in [`burp-extension/`](burp-extension/). It exports Burp XML to a temporary localhost server; the PWA pulls it automatically. CORS is locked to the configured PWA origin.

- **Build:** `cd burp-extension && ./gradlew jar`
- **Releases:** tag `burp-extension-v*` (e.g. `burp-extension-v1.2.0`) triggers CI to publish the JAR and SHA-256 checksum
- **Docs:** [burp-extension/README.md](burp-extension/README.md)

## Development

**Requirements:** Node.js 22 (`nvm use`), npm

```bash
git clone https://github.com/rizakara/better-bhhb.git
cd better-bhhb
npm ci
npm start          # http://localhost:4200
```

```bash
npm run build      # output: dist/burp-http-history-browser/
npm test
```

The app is deployed to [Cloudflare Pages](https://better-bhhb.pages.dev) (build: `npm ci && npm run build`, Node 22).

To point the Burp extension at local dev, set the PWA URL to `http://localhost:4200/` in **Better-BHHB → Configure PWA URL…** (see extension README).

## Disclaimer

This is an independent fork of the original [bhhb](https://github.com/adityatelange/bhhb) project by [Aditya Telange](https://github.com/adityatelange). Better-BHHB is hosted and maintained separately and is **not affiliated** with the original author. Credit for the original idea and source code goes to Aditya Telange.

## License

[MIT](LICENSE). Copyright (c) 2022 Aditya Telange; Copyright (c) 2026 Rıza Kara