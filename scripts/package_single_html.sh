#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PKG_JS="$ROOT_DIR/pkg/wordle_wizard.js"
PKG_WASM="$ROOT_DIR/pkg/wordle_wizard_bg.wasm"
APP_JS="$ROOT_DIR/web/app.js"
INDEX_HTML="$ROOT_DIR/web/index.html"
OUTPUT_HTML="$DIST_DIR/wordle_wizard_single_file.html"

"$ROOT_DIR/scripts/build_wasm.sh"

mkdir -p "$DIST_DIR"

node - <<'NODE' "$INDEX_HTML" "$PKG_JS" "$APP_JS" "$PKG_WASM" "$OUTPUT_HTML"
const fs = require("fs");

const [, , indexPath, pkgPath, appPath, wasmPath, outputPath] = process.argv;

const html = fs.readFileSync(indexPath, "utf8");
const pkgSource = fs.readFileSync(pkgPath, "utf8");
const appSource = fs.readFileSync(appPath, "utf8");
const wasmBase64 = fs.readFileSync(wasmPath).toString("base64");

const inlineModule = `
const pkgSource = ${JSON.stringify(pkgSource)};
const appSource = ${JSON.stringify(appSource)};
const wasmBase64 = ${JSON.stringify(wasmBase64)};

const wasmBytes = Uint8Array.from(atob(wasmBase64), (char) => char.charCodeAt(0));
const pkgUrl = URL.createObjectURL(new Blob([pkgSource], { type: "text/javascript" }));
const appUrl = URL.createObjectURL(new Blob([appSource], { type: "text/javascript" }));

try {
  const [{ default: init, WasmSolver }, { bootApp }] = await Promise.all([
    import(pkgUrl),
    import(appUrl),
  ]);

  bootApp({ init, WasmSolver, wasmSource: wasmBytes });
} finally {
  URL.revokeObjectURL(pkgUrl);
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
