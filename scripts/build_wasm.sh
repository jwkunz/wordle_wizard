#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/target/wasm32-unknown-unknown/release"
PKG_DIR="$ROOT_DIR/pkg"

cd "$ROOT_DIR"

cargo build --release --target wasm32-unknown-unknown

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "error: wasm-bindgen CLI is not installed." >&2
  echo "install it with: cargo install wasm-bindgen-cli" >&2
  exit 1
fi

mkdir -p "$PKG_DIR"

wasm-bindgen \
  --target web \
  --out-dir "$PKG_DIR" \
  "$TARGET_DIR/wordle_wizard.wasm"

echo "Built browser package in $PKG_DIR"
