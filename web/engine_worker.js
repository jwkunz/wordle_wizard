import init, { WasmSolver } from "../pkg/wordle_wizard.js";
import { setupWorker } from "./engine_worker_core.js";

setupWorker({ init, WasmSolver });
