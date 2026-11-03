import { env, pipeline } from "../vendor/transformers/transformers.min.js";
const output = document.querySelector("#result");
try {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = `${location.origin}/models/`;
  env.backends.onnx.wasm.wasmPaths = `${location.origin}/vendor/transformers/`;
  env.backends.onnx.wasm.numThreads = 1;
  const translator = await pipeline("translation", "opus-mt-en-zh", {
    device: "wasm", dtype: "q8", local_files_only: true
  });
  const result = await translator("I found that this tool works better than I expected.");
  output.textContent = `PASS: ${result[0].translation_text}`;
} catch (error) {
  output.textContent = `FAIL: ${error.stack || error.message}`;
}
