import { env, pipeline } from "../vendor/transformers/transformers.min.js";
const result = document.querySelector("#result");
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = "/vendor/transformers/";
env.backends.onnx.wasm.numThreads = 1;
try {
  const translator = await pipeline("translation", "opus-mt-en-zh", { device: "wasm", dtype: "q8", local_files_only: true });
  const output = await translator("This offline translation model can translate a complete English sentence into Chinese.");
  result.textContent = `PASS\n${output[0].translation_text}`;
} catch (error) {
  result.textContent = `FAIL\n${error.stack || error.message}`;
}
