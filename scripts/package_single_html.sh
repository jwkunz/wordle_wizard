#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PKG_JS="$ROOT_DIR/pkg/wordle_wizard.js"
PKG_WASM="$ROOT_DIR/pkg/wordle_wizard_bg.wasm"
APP_JS="$ROOT_DIR/web/app.js"
WORKER_CORE_JS="$ROOT_DIR/web/engine_worker_core.js"
INDEX_HTML="$ROOT_DIR/web/index.html"
OUTPUT_HTML="$DIST_DIR/wordle_wizard_single_file.html"

"$ROOT_DIR/scripts/build_wasm.sh"

mkdir -p "$DIST_DIR"

node - <<'NODE' "$INDEX_HTML" "$PKG_JS" "$APP_JS" "$WORKER_CORE_JS" "$PKG_WASM" "$OUTPUT_HTML"
const fs = require("fs");

const [, , indexPath, pkgPath, appPath, workerCorePath, wasmPath, outputPath] = process.argv;

const html = fs.readFileSync(indexPath, "utf8");
const pkgSource = fs.readFileSync(pkgPath, "utf8");
const appSource = fs.readFileSync(appPath, "utf8");
const workerCoreSource = fs.readFileSync(workerCorePath, "utf8");
const wasmBase64 = fs.readFileSync(wasmPath).toString("base64");

const inlineModule = `
const appSource = ${JSON.stringify(appSource)};
const workerModuleSource = ${JSON.stringify(`
${pkgSource}
${workerCoreSource}

const wasmBase64 = "${wasmBase64}";
const wasmBytes = Uint8Array.from(atob(wasmBase64), (char) => char.charCodeAt(0));

setupWorker({ init: __wbg_init, WasmSolver, wasmSource: wasmBytes });
`)};

function createWorkerEngine(workerUrl) {
  const worker = new Worker(workerUrl, { type: "module" });
  let nextId = 1;
  const pending = new Map();

  worker.addEventListener("message", (event) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) {
      return;
    }

    pending.delete(id);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(error));
    }
  });

  function request(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    });
  }

  return {
    init() {
      return request("init");
    },
    loadBundled(payload) {
      return request("loadBundled", payload);
    },
    loadRemote(payload) {
      return request("loadRemote", payload);
    },
    newGame(payload) {
      return request("newGame", payload);
    },
    applyFeedback(payload) {
      return request("applyFeedback", payload);
    },
    refresh(payload) {
      return request("refresh", payload);
    },
  };
}

const appUrl = URL.createObjectURL(new Blob([appSource], { type: "text/javascript" }));
const workerUrl = URL.createObjectURL(new Blob([workerModuleSource], { type: "text/javascript" }));

try {
  const { bootApp } = await import(appUrl);
  bootApp({ engine: createWorkerEngine(workerUrl) });
} finally {
  URL.revokeObjectURL(appUrl);
}
`.trim();

const output = html.replace(
  '<script type="module" src="./main.js"></script>',
  `<script type="module">\n${inlineModule.replaceAll("</script>", "<\\/script>")}\n</script>`,
);

fs.writeFileSync(outputPath, output);
NODE

echo "Built single-file distribution at $OUTPUT_HTML"
