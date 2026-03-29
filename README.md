# Wordle Wizard

Version `1.1.1`

Wordle Wizard is a browser-based Wordle advisor powered by a Rust solver compiled to WebAssembly. It is built to help you play Wordle on another site by entering your guesses and feedback, then inspecting the remaining candidate answers and recommended next guesses.

## Download And Run

The easiest way to use the app is to download the single self-contained HTML file from GitHub Releases:

1. Open the repository's `Releases` page.
2. Download the versioned single-file asset, for example `wordle_wizard_v1.1.1_single_file.html`, from the latest release assets.
3. Open that HTML file in a modern browser.

No separate install step is required for the release build. The HTML file contains the app UI, JavaScript, and bundled WASM engine in one file.

## What The App Does

- Tracks your Wordle guesses and feedback history.
- Filters the remaining possible answers.
- Ranks next guesses by entropy.
- Supports bundled and cached remote dictionaries.
- Stores fetched remote dictionaries in browser local storage.

## How To Use Wordle Wizard

Wordle Wizard is an external Wordle advisor. You play Wordle somewhere else, then use this page to record each guess and the feedback you received. The solver keeps track of the remaining valid answers and ranks good next guesses.

1. Enter the exact 5-letter guess you used in the `Current Guess` box.
2. Click each feedback tile until it matches the game result:
   `miss` for grey, `present` for yellow, `correct` for green.
3. Press `Apply Feedback`.
4. Review the updated history, remaining candidate list, and recommendation table.
5. Repeat until the puzzle is solved.

## Reading The UI

### History

Shows every guess you have entered so far. This is the fastest way to confirm the solver state matches your external game.

### Remaining Candidates

Shows answers still consistent with all previously entered feedback.

### Recommendations

Ranks next guesses by entropy. Enable `Candidate only` if you want the list restricted to words that are still possible answers. Leave it off if you want exploratory probe guesses.

### Diagnostics

Shows a raw view of the current engine state for debugging and validation.

### Engine Status Bar

The status bar at the top reports what the engine is doing right now.

- `Idle` in green means the solver is ready for a new command.
- `Working` in yellow means the app is loading a dictionary, applying feedback, or recomputing recommendations.
- `Error` in red means the last operation failed.

If the solver takes time on a larger dictionary, the status bar is the authoritative place to see whether the app is still processing.

## Privacy

Wordle Wizard does not collect analytics, does not send your guesses or puzzle history to any server, and does not store personal data remotely.

The only persistent storage used by the app is your browser's local storage for cached dictionaries that you explicitly fetch. Those cached dictionaries stay on your device unless you remove them or clear browser storage.

## Starting A New Puzzle

Press `New Game` to clear the current puzzle state while keeping the currently active dictionary.

Use dictionary changes separately if you want to start fresh on a different word list.

## Dictionary Behavior

The bundled default dictionary shipped with the app is based on the Tab Atkins Wordle list.

Remote dictionaries are optional:

- When you fetch a remote word list, the app caches it in browser storage.
- On refresh, the app attempts to restore the active cached remote dictionary automatically.
- The cache panel shows each saved dictionary, how many filtered 5-letter words it contains, and when it was saved.
- You can activate a cached dictionary, remove one cached dictionary, or clear them all.

Only unique lowercase 5-letter alphabetic words are admitted into the solver.

## Local Development

### Prerequisites

- Rust toolchain
- `wasm-bindgen-cli`

Install the CLI with:

```bash
cargo install wasm-bindgen-cli
```

### Build The WASM Package

```bash
./scripts/build_wasm.sh
```

### Serve The App Locally

```bash
./scripts/serve_web.sh
```

Then open:

- `http://127.0.0.1:4173/web/`

### Build The Single-File Distribution

```bash
./scripts/package_single_html.sh
```

This writes:

- `dist/wordle_wizard_v1.1.1_single_file.html`

## Releases

GitHub Actions builds the single-file HTML release asset on version tag pushes from `main`.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

Copyright 2026 Numerius Engineering LLC - MIT License - numerius.engineering@gmail.com
