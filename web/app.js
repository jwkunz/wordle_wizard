const FEEDBACK_SEQUENCE = ["miss", "present", "correct"];
const FEEDBACK_SYMBOL = {
  miss: "m",
  present: "p",
  correct: "c",
};
const CACHE_STORAGE_KEY = "wordle-wizard.remote-dictionaries.v2";

function normalizeWordList(rawWords) {
  const unique = new Set();

  for (const line of rawWords.split(/\r?\n/u)) {
    const normalized = line.trim().toLowerCase();
    if (/^[a-z]{5}$/u.test(normalized)) {
      unique.add(normalized);
    }
  }

  return {
    filteredWords: [...unique].sort().join("\n"),
    wordCount: unique.size,
  };
}

function slugFromUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  }
}

export function bootApp({ init, WasmSolver, wasmSource }) {
  const elements = {
    guessForm: document.querySelector("#guess-form"),
    guessInput: document.querySelector("#guess-input"),
    feedbackEditor: document.querySelector("#feedback-editor"),
    engineStatusBar: document.querySelector("#engine-status-bar"),
    engineStatusLabel: document.querySelector("#engine-status-label"),
    engineStatusDetail: document.querySelector("#engine-status-detail"),
    resetButton: document.querySelector("#reset-button"),
    dictionarySelect: document.querySelector("#dictionary-select"),
    candidateOnlyToggle: document.querySelector("#candidate-only-toggle"),
    remoteDictionaryForm: document.querySelector("#remote-dictionary-form"),
    remoteDictionaryUrl: document.querySelector("#remote-dictionary-url"),
    reloadCachedButton: document.querySelector("#reload-cached-button"),
    clearAllCacheButton: document.querySelector("#clear-all-cache-button"),
    historyList: document.querySelector("#history-list"),
    candidateList: document.querySelector("#candidate-list"),
    candidateCount: document.querySelector("#candidate-count"),
    roundLabel: document.querySelector("#round-label"),
    diagnostics: document.querySelector("#diagnostics-panel"),
    recommendationsBody: document.querySelector("#recommendations-body"),
    remainingAnswersStat: document.querySelector("#remaining-answers-stat"),
    allowedGuessesStat: document.querySelector("#allowed-guesses-stat"),
    dictionarySourceStat: document.querySelector("#dictionary-source-stat"),
    cacheList: document.querySelector("#cache-list"),
    cacheCountLabel: document.querySelector("#cache-count-label"),
    tabButtons: [...document.querySelectorAll("[data-tab]")],
    tabPanels: [...document.querySelectorAll("[data-tab-panel]")],
  };

  let solver;
  let activeDictionaryKey = null;

  function setEngineStatus(state, detail) {
    elements.engineStatusBar.dataset.state = state;
    elements.engineStatusLabel.textContent =
      state === "working" ? "Working" : state === "error" ? "Error" : "Idle";
    elements.engineStatusDetail.textContent = detail;
  }

  function setIdle(detail = "Engine ready for new commands.") {
    setEngineStatus("idle", detail);
  }

  function setWorking(detail) {
    setEngineStatus("working", detail);
  }

  function setError(detail) {
    setEngineStatus("error", detail);
  }

  async function runWithStatus(detail, action, successDetail = "Engine ready for new commands.") {
    setWorking(detail);
    try {
      const result = await action();
      setIdle(successDetail);
      return result;
    } catch (error) {
      setError(String(error));
      throw error;
    }
  }

  function readCacheStore() {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) {
      return { activeKey: null, entries: [] };
    }

    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return {
        activeKey: typeof parsed.activeKey === "string" ? parsed.activeKey : null,
        entries,
      };
    } catch {
      localStorage.removeItem(CACHE_STORAGE_KEY);
      return { activeKey: null, entries: [] };
    }
  }

  function writeCacheStore(store) {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(store));
  }

  function getCachedEntry(key) {
    return readCacheStore().entries.find((entry) => entry.key === key) ?? null;
  }

  function getActiveCachedEntry() {
    const store = readCacheStore();
    if (store.activeKey) {
      const activeEntry = store.entries.find((entry) => entry.key === store.activeKey);
      if (activeEntry) {
        return activeEntry;
      }
    }

    return store.entries[0] ?? null;
  }

  function upsertCachedDictionary(url, rawWords) {
    const { filteredWords, wordCount } = normalizeWordList(rawWords);
    if (!filteredWords) {
      throw new Error("The fetched source did not contain any valid 5-letter alphabetic words.");
    }

    const store = readCacheStore();
    const key = slugFromUrl(url);
    const entry = {
      key,
      url,
      words: filteredWords,
      wordCount,
      savedAt: new Date().toISOString(),
    };

    const nextEntries = store.entries.filter((item) => item.key !== key);
    nextEntries.unshift(entry);

    const nextStore = {
      activeKey: key,
      entries: nextEntries,
    };

    writeCacheStore(nextStore);
    return entry;
  }

  function setActiveCacheKey(key) {
    const store = readCacheStore();
    writeCacheStore({
      activeKey: key,
      entries: store.entries,
    });
    activeDictionaryKey = key;
  }

  function removeCachedDictionary(key) {
    const store = readCacheStore();
    const nextEntries = store.entries.filter((entry) => entry.key !== key);
    const nextActiveKey =
      store.activeKey === key ? (nextEntries[0]?.key ?? null) : store.activeKey;
    writeCacheStore({
      activeKey: nextActiveKey,
      entries: nextEntries,
    });
    activeDictionaryKey = nextActiveKey;
  }

  function clearAllCachedDictionaries() {
    localStorage.removeItem(CACHE_STORAGE_KEY);
    activeDictionaryKey = null;
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function renderCacheList() {
    const store = readCacheStore();
    elements.cacheList.replaceChildren();
    elements.cacheCountLabel.textContent = `${store.entries.length} cached`;

    if (store.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cache-entry";
      empty.textContent = "No cached remote dictionaries yet.";
      elements.cacheList.append(empty);
      return;
    }

    for (const entry of store.entries) {
      const card = document.createElement("div");
      card.className = "cache-entry";
      if (store.activeKey === entry.key) {
        card.classList.add("is-active");
      }
      card.innerHTML = `
        <strong>${entry.url}</strong>
        <div class="cache-meta">
          ${entry.wordCount} filtered words | saved ${formatDate(entry.savedAt)}
        </div>
        <div class="cache-actions">
          <button type="button" data-action="activate" data-key="${entry.key}">Use This Dictionary</button>
          <button type="button" data-action="remove" data-key="${entry.key}">Remove From Cache</button>
        </div>
      `;
      elements.cacheList.append(card);
    }
  }

  function currentFeedback() {
    return [...elements.feedbackEditor.querySelectorAll(".tile")]
      .map((tile) => FEEDBACK_SYMBOL[tile.dataset.state])
      .join("");
  }

  function syncEditorLetters() {
    const guess = elements.guessInput.value.trim().toUpperCase();
    [...elements.feedbackEditor.querySelectorAll(".tile")].forEach((tile, index) => {
      tile.textContent = guess[index] ?? " ";
    });
  }

  function renderHistory(snapshot) {
    elements.historyList.replaceChildren();

    if (snapshot.history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent =
        "No guesses recorded yet. Start a new puzzle by entering your first guess and setting its feedback tiles.";
      elements.historyList.append(empty);
      elements.roundLabel.textContent = "No guesses yet";
      return;
    }

    for (const [word, feedback] of snapshot.history) {
      const row = document.createElement("div");
      row.className = "tile-row";

      [...word].forEach((letter, index) => {
        const tile = document.createElement("div");
        tile.className = "tile";
        const stateSymbol = feedback[index];
        tile.dataset.state =
          stateSymbol === "c" ? "correct" : stateSymbol === "p" ? "present" : "miss";
        tile.textContent = letter.toUpperCase();
        row.append(tile);
      });

      elements.historyList.append(row);
    }

    elements.roundLabel.textContent = `Next input: Round ${snapshot.history.length + 1}`;
  }

  function renderRecommendations(recommendations) {
    elements.recommendationsBody.replaceChildren();

    for (const recommendation of recommendations) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${recommendation.word}</td>
        <td>${recommendation.score.toFixed(3)}</td>
        <td>${recommendation.is_candidate ? "candidate" : "probe"}</td>
      `;
      elements.recommendationsBody.append(row);
    }
  }

  function renderCandidates(candidates) {
    elements.candidateList.replaceChildren();
    elements.candidateCount.textContent = `${candidates.total} answers`;

    for (const word of candidates.words) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = word;
      elements.candidateList.append(pill);
    }
  }

  function renderPendingNewGameUi() {
    elements.historyList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Starting a fresh puzzle. Recommendations will repopulate when the engine finishes recalculating.";
    elements.historyList.append(empty);

    elements.roundLabel.textContent = "No guesses yet";
    elements.candidateList.replaceChildren();
    elements.candidateCount.textContent = "Recomputing candidates...";
    elements.recommendationsBody.replaceChildren();
    elements.remainingAnswersStat.textContent = "...";
    elements.allowedGuessesStat.textContent = "...";
  }

  function createBundledSolver() {
    activeDictionaryKey = null;
    return new WasmSolver();
  }

  function createRemoteSolver(words) {
    return WasmSolver.fromWordLists(words, words);
  }

  async function refresh() {
    const snapshot = await solver.snapshot();
    const recommendations = await solver.topRecommendations(
      12,
      elements.candidateOnlyToggle.checked,
    );
    const candidates = await solver.remainingCandidates(24);
    const dictionary = await solver.dictionaryStatus();

    elements.remainingAnswersStat.textContent = String(snapshot.remaining_answers);
    elements.allowedGuessesStat.textContent = String(snapshot.remaining_guesses);
    elements.dictionarySourceStat.textContent = dictionary.guesses_source;
    elements.diagnostics.textContent = JSON.stringify(
      {
        snapshot,
        dictionary,
        activeDictionaryKey,
        cacheStore: readCacheStore(),
        feedbackPreview: currentFeedback(),
      },
      null,
      2,
    );

    renderHistory(snapshot);
    renderRecommendations(recommendations);
    renderCandidates(candidates);
    renderCacheList();
  }

  function resetFeedbackEditor() {
    elements.guessInput.value = "";
    [...elements.feedbackEditor.querySelectorAll(".tile")].forEach((tile) => {
      tile.dataset.state = "miss";
      tile.textContent = "";
    });
  }

  async function yieldForPaint() {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function activateBundledDictionary() {
    await runWithStatus(
      "Loading bundled dictionary and recomputing recommendations...",
      async () => {
        solver = createBundledSolver();
        elements.dictionarySelect.value = "bundled";
        resetFeedbackEditor();
        await refresh();
      },
      "Idle. Bundled dictionary loaded.",
    );
  }

  async function activateCachedEntry(entry) {
    await runWithStatus(
      `Loading cached dictionary from ${entry.url}...`,
      async () => {
        solver = createRemoteSolver(entry.words);
        activeDictionaryKey = entry.key;
        setActiveCacheKey(entry.key);
        elements.dictionarySelect.value = "remote";
        elements.remoteDictionaryUrl.value = entry.url;
        resetFeedbackEditor();
        await refresh();
      },
      `Idle. Loaded cached dictionary from ${entry.url}.`,
    );
  }

  async function boot() {
    await runWithStatus(
      "Initializing WASM engine...",
      async () => {
        if (wasmSource === undefined) {
          await init();
        } else {
          await init(wasmSource);
        }

        syncEditorLetters();
        renderCacheList();

        const cachedEntry = getActiveCachedEntry();
        if (cachedEntry) {
          await activateCachedEntry(cachedEntry);
          return;
        }

        solver = createBundledSolver();
        await refresh();
      },
      "Idle. Engine initialized and ready.",
    );
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;
      elements.tabButtons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      elements.tabPanels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== targetTab;
      });
    });
  });

  elements.guessInput.addEventListener("input", syncEditorLetters);

  elements.feedbackEditor.addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile) {
      return;
    }

    const currentIndex = FEEDBACK_SEQUENCE.indexOf(tile.dataset.state);
    const nextIndex = (currentIndex + 1) % FEEDBACK_SEQUENCE.length;
    tile.dataset.state = FEEDBACK_SEQUENCE[nextIndex];
  });

  elements.guessForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await runWithStatus(
        "Applying feedback and recomputing recommendations...",
        async () => {
          await solver.applyFeedback(elements.guessInput.value.trim(), currentFeedback());
          resetFeedbackEditor();
          await refresh();
        },
        "Idle. Feedback applied.",
      );
    } catch (error) {
      setError(String(error));
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    try {
      resetFeedbackEditor();
      renderPendingNewGameUi();
      setWorking("Starting a new game and recomputing recommendations...");
      await yieldForPaint();

      await runWithStatus(
        "Resetting current session...",
        async () => {
          const activeEntry = activeDictionaryKey ? getCachedEntry(activeDictionaryKey) : null;
          if (activeEntry) {
            solver = createRemoteSolver(activeEntry.words);
            elements.dictionarySelect.value = "remote";
            elements.remoteDictionaryUrl.value = activeEntry.url;
          } else {
            solver = createBundledSolver();
            elements.dictionarySelect.value = "bundled";
          }
          await refresh();
        },
        "Idle. New game ready.",
      );
    } catch (error) {
      setError(String(error));
    }
  });

  elements.candidateOnlyToggle.addEventListener("change", async () => {
    try {
      await runWithStatus(
        "Updating recommendation ranking...",
        refresh,
        "Idle. Recommendation ranking updated.",
      );
    } catch (error) {
      setError(String(error));
    }
  });

  elements.dictionarySelect.addEventListener("change", async () => {
    if (elements.dictionarySelect.value === "bundled") {
      await activateBundledDictionary();
      return;
    }

    const entry = getActiveCachedEntry();
    if (!entry) {
      elements.dictionarySelect.value = "bundled";
      setError("No cached remote dictionaries found. Fetch one first.");
      return;
    }

    await activateCachedEntry(entry);
  });

  elements.remoteDictionaryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const url = elements.remoteDictionaryUrl.value.trim();
    if (!url) {
      setError("Enter a remote dictionary URL.");
      return;
    }

    try {
      await runWithStatus(
        `Fetching remote dictionary from ${url}...`,
        async () => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const entry = upsertCachedDictionary(url, await response.text());
          await activateCachedEntry(entry);
        },
        `Idle. Remote dictionary fetched and cached from ${url}.`,
      );
    } catch (error) {
      setError(`Failed to load remote dictionary: ${error}`);
    }
  });

  elements.reloadCachedButton.addEventListener("click", async () => {
    const entry = getActiveCachedEntry();
    if (!entry) {
      setError("No cached remote dictionaries found.");
      return;
    }

    await activateCachedEntry(entry);
  });

  elements.clearAllCacheButton.addEventListener("click", async () => {
    try {
      await runWithStatus(
        "Clearing cached dictionaries...",
        async () => {
          clearAllCachedDictionaries();
          solver = createBundledSolver();
          elements.dictionarySelect.value = "bundled";
          resetFeedbackEditor();
          await refresh();
        },
        "Idle. Cleared all cached dictionaries.",
      );
    } catch (error) {
      setError(String(error));
    }
  });

  elements.cacheList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const { action, key } = button.dataset;
    if (!key) {
      return;
    }

    if (action === "activate") {
      const entry = getCachedEntry(key);
      if (!entry) {
        setError("That cached dictionary no longer exists.");
        renderCacheList();
        return;
      }

      await activateCachedEntry(entry);
      return;
    }

    if (action === "remove") {
      try {
        await runWithStatus(
          "Removing cached dictionary...",
          async () => {
            const wasActive = activeDictionaryKey === key;
            removeCachedDictionary(key);
            if (wasActive) {
              const nextEntry = getActiveCachedEntry();
              if (nextEntry) {
                solver = createRemoteSolver(nextEntry.words);
                activeDictionaryKey = nextEntry.key;
                setActiveCacheKey(nextEntry.key);
                elements.dictionarySelect.value = "remote";
                elements.remoteDictionaryUrl.value = nextEntry.url;
              } else {
                solver = createBundledSolver();
                elements.dictionarySelect.value = "bundled";
              }
              resetFeedbackEditor();
              await refresh();
            } else {
              renderCacheList();
            }
          },
          "Idle. Cached dictionary removed.",
        );
      } catch (error) {
        setError(String(error));
      }
    }
  });

  boot().catch((error) => {
    setError(`Failed to initialize WASM engine: ${error}`);
  });
}
