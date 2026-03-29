import { bootApp } from "./app.js";

function createWorkerEngine() {
  const worker = new Worker(new URL("./engine_worker.js", import.meta.url), {
    type: "module",
  });
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

bootApp({ engine: createWorkerEngine() });
