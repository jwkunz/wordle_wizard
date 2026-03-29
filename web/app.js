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
    return `${parsed.hostname}${parsed.pathname}`
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  }
}

export function bootApp({ engine }) {
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

    writeCacheStore({
      activeKey: key,
      entries: nextEntries,
    });

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
      tile.textContent = guess[index] ?? "";
    });
  }

  function setGuessFromWord(word) {
    elements.guessInput.value = word.toLowerCase();
    syncEditorLetters();
    elements.guessInput.focus();
    elements.guessInput.setSelectionRange(
      elements.guessInput.value.length,
      elements.guessInput.value.length,
    );
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
      row.className = "clickable-word";
      row.dataset.word = recommendation.word;
      row.title = `Use ${recommendation.word} as the current guess`;
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
      pill.dataset.word = word;
      pill.title = `Use ${word} as the current guess`;
      pill.textContent = word;
      elements.candidateList.append(pill);
    }
  }

  function applyEngineView(view) {
    elements.remainingAnswersStat.textContent = String(view.snapshot.remaining_answers);
    elements.allowedGuessesStat.textContent = String(view.snapshot.remaining_guesses);
    elements.dictionarySourceStat.textContent = view.dictionary.guesses_source;
    elements.diagnostics.textContent = JSON.stringify(
      {
        snapshot: view.snapshot,
        dictionary: view.dictionary,
        activeDictionaryKey,
        cacheStore: readCacheStore(),
        feedbackPreview: currentFeedback(),
      },
      null,
      2,
    );

    renderHistory(view.snapshot);
    renderRecommendations(view.recommendations);
    renderCandidates(view.candidates);
    renderCacheList();
  }

  function resetFeedbackEditor() {
    elements.guessInput.value = "";
    [...elements.feedbackEditor.querySelectorAll(".tile")].forEach((tile) => {
      tile.dataset.state = "miss";
      tile.textContent = "";
    });
  }

  function renderPendingNewGameUi() {
    elements.historyList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      "Starting a fresh puzzle. Recommendations will repopulate when the engine finishes recalculating.";
    elements.historyList.append(empty);

    elements.roundLabel.textContent = "No guesses yet";
    elements.candidateList.replaceChildren();
    elements.candidateCount.textContent = "Recomputing candidates...";
    elements.recommendationsBody.replaceChildren();
    elements.remainingAnswersStat.textContent = "...";
    elements.allowedGuessesStat.textContent = "...";
  }

  async function yieldForPaint() {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function currentCandidateOnly() {
    return elements.candidateOnlyToggle.checked;
  }

  async function activateBundledDictionary() {
    resetFeedbackEditor();
    const view = await runWithStatus(
      "Loading bundled dictionary and recomputing recommendations...",
      () => engine.loadBundled({ candidateOnly: currentCandidateOnly() }),
      "Idle. Bundled dictionary loaded.",
    );
    activeDictionaryKey = null;
    elements.dictionarySelect.value = "bundled";
    applyEngineView(view);
  }

  async function activateCachedEntry(entry) {
    resetFeedbackEditor();
    const view = await runWithStatus(
      `Loading cached dictionary from ${entry.url}...`,
      () =>
        engine.loadRemote({
          words: entry.words,
          candidateOnly: currentCandidateOnly(),
        }),
      `Idle. Loaded cached dictionary from ${entry.url}.`,
    );
    activeDictionaryKey = entry.key;
    setActiveCacheKey(entry.key);
    elements.dictionarySelect.value = "remote";
    elements.remoteDictionaryUrl.value = entry.url;
    applyEngineView(view);
  }

  async function boot() {
    await runWithStatus(
      "Initializing background engine worker...",
      async () => {
        await engine.init();
        syncEditorLetters();
        renderCacheList();

        const cachedEntry = getActiveCachedEntry();
        if (cachedEntry) {
          activeDictionaryKey = cachedEntry.key;
          setActiveCacheKey(cachedEntry.key);
          elements.dictionarySelect.value = "remote";
          elements.remoteDictionaryUrl.value = cachedEntry.url;
          const view = await engine.loadRemote({
            words: cachedEntry.words,
            candidateOnly: currentCandidateOnly(),
          });
          resetFeedbackEditor();
          applyEngineView(view);
          return;
        }

        elements.dictionarySelect.value = "bundled";
        const view = await engine.loadBundled({
          candidateOnly: currentCandidateOnly(),
        });
        resetFeedbackEditor();
        applyEngineView(view);
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

  elements.recommendationsBody.addEventListener("click", (event) => {
    const row = event.target.closest("[data-word]");
    if (!row) {
      return;
    }

    setGuessFromWord(row.dataset.word);
    setIdle(`Idle. Loaded ${row.dataset.word} into the current guess.`);
  });

  elements.candidateList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-word]");
    if (!item) {
      return;
    }

    setGuessFromWord(item.dataset.word);
    setIdle(`Idle. Loaded ${item.dataset.word} into the current guess.`);
  });

  elements.guessForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const view = await runWithStatus(
        "Applying feedback and recomputing recommendations...",
        () =>
          engine.applyFeedback({
            guess: elements.guessInput.value.trim(),
            feedback: currentFeedback(),
            candidateOnly: currentCandidateOnly(),
          }),
        "Idle. Feedback applied.",
      );
      resetFeedbackEditor();
      applyEngineView(view);
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

      const activeEntry = activeDictionaryKey ? getCachedEntry(activeDictionaryKey) : null;
      const view = await runWithStatus(
        "Resetting current puzzle in the background engine...",
        () =>
          engine.newGame({
            kind: activeEntry ? "remote" : "bundled",
            words: activeEntry?.words,
            candidateOnly: currentCandidateOnly(),
          }),
        "Idle. New game ready.",
      );

      if (activeEntry) {
        elements.dictionarySelect.value = "remote";
        elements.remoteDictionaryUrl.value = activeEntry.url;
      } else {
        elements.dictionarySelect.value = "bundled";
      }

      applyEngineView(view);
    } catch (error) {
      setError(String(error));
    }
  });

  elements.candidateOnlyToggle.addEventListener("change", async () => {
    try {
      const view = await runWithStatus(
        "Updating recommendation ranking...",
        () => engine.refresh({ candidateOnly: currentCandidateOnly() }),
        "Idle. Recommendation ranking updated.",
      );
      applyEngineView(view);
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
      const entry = await runWithStatus(
        `Fetching remote dictionary from ${url}...`,
        async () => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return upsertCachedDictionary(url, await response.text());
        },
        `Idle. Remote dictionary fetched and cached from ${url}.`,
      );

      await activateCachedEntry(entry);
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
      clearAllCachedDictionaries();
      await activateBundledDictionary();
      setIdle("Idle. Cleared all cached dictionaries.");
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
        const wasActive = activeDictionaryKey === key;
        removeCachedDictionary(key);

        if (wasActive) {
          const nextEntry = getActiveCachedEntry();
          if (nextEntry) {
            await activateCachedEntry(nextEntry);
          } else {
            await activateBundledDictionary();
            setIdle("Idle. Removed the active cached dictionary and reverted to bundled.");
          }
        } else {
          renderCacheList();
          setIdle("Idle. Cached dictionary removed.");
        }
      } catch (error) {
        setError(String(error));
      }
    }
  });

  boot().catch((error) => {
    setError(`Failed to initialize background engine: ${error}`);
  });
}
