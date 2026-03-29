# Wordle Wizard

Rust rewrite of the legacy `wordle_bot` solver with a planned WASM engine and browser-based Analyst UI.

## Current Layout

- `src/`: Rust solver core.
- `web/`: static HTML shell for the future web app.
- `data/`: bundled word lists for the engine. The shipped default now uses the Tab Atkins Wordle list.
- `original/`: ignored clone of the legacy C++ project used as a reference during the rewrite.

## Near-Term Direction

1. Port solver behavior into the Rust core with tests.
2. Add a WASM-facing API for browser integration.
3. Wire the web UI to the engine.
4. Add a packaging script that emits a single-file distributable HTML app.

## Current Browser Build

The browser shell in [`web/`](./web/) expects a generated ES module in `pkg/`.

To build that module locally:

```bash
./scripts/build_wasm.sh
```

That script currently expects `wasm-bindgen` CLI to be installed:

```bash
cargo install wasm-bindgen-cli
```

To serve the app locally over HTTP:

```bash
./scripts/serve_web.sh
```

Then open `http://127.0.0.1:4173/web/`.

## Single-File Distribution

To build the self-contained HTML distribution:

```bash
./scripts/package_single_html.sh
```

That produces:

- `dist/wordle_wizard_single_file.html`

The single-file build inlines the generated JavaScript module, the WASM binary, and the web app controller into one HTML file. Optional remote dictionary loading still depends on the user-provided URL being reachable from the browser.
