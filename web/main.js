import init, { WasmSolver } from "../pkg/wordle_wizard.js";
import { bootApp } from "./app.js";

bootApp({ init, WasmSolver });
