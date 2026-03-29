const RECOMMENDATION_LIMIT = 12;
const CANDIDATE_LIMIT = 24;

export function setupWorker({ init, WasmSolver, wasmSource }) {
  let initialized = false;
  let solver = null;

  async function ensureInitialized() {
    if (initialized) {
      return;
    }

    if (wasmSource === undefined) {
      await init();
    } else {
      await init(wasmSource);
    }

    initialized = true;
  }

  function requireSolver() {
    if (!solver) {
      throw new Error("Engine is not initialized with an active solver.");
    }
    return solver;
  }

  function collectView(candidateOnly) {
    const activeSolver = requireSolver();
    return {
      snapshot: activeSolver.snapshot(),
      recommendations: activeSolver.topRecommendations(
        RECOMMENDATION_LIMIT,
        candidateOnly,
      ),
      candidates: activeSolver.remainingCandidates(CANDIDATE_LIMIT),
      dictionary: activeSolver.dictionaryStatus(),
    };
  }

  async function handleMessage(message) {
    const { type, payload = {} } = message;

    switch (type) {
      case "init":
        await ensureInitialized();
        return { ok: true };
      case "loadBundled":
        await ensureInitialized();
        solver = new WasmSolver();
        return collectView(Boolean(payload.candidateOnly));
      case "loadRemote":
        await ensureInitialized();
        solver = WasmSolver.fromWordLists(payload.words, payload.words);
        return collectView(Boolean(payload.candidateOnly));
      case "newGame":
        await ensureInitialized();
        solver =
          payload.kind === "remote"
            ? WasmSolver.fromWordLists(payload.words, payload.words)
            : new WasmSolver();
        return collectView(Boolean(payload.candidateOnly));
      case "applyFeedback":
        requireSolver().applyFeedback(payload.guess, payload.feedback);
        return collectView(Boolean(payload.candidateOnly));
      case "refresh":
        return collectView(Boolean(payload.candidateOnly));
      default:
        throw new Error(`Unknown worker command: ${type}`);
    }
  }

  self.onmessage = async (event) => {
    const { id, type, payload } = event.data;
    try {
      const result = await handleMessage({ type, payload });
      self.postMessage({ id, ok: true, result });
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
