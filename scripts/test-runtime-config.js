const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "vendor", "transformers", "transformers.min.js"), "utf8");
const offscreen = fs.readFileSync(path.join(root, "src", "offscreen.js"), "utf8");

if (runtime.includes('M?.webgpu&&(M.webgpu.powerPreference="high-performance")')) {
  throw new Error("Unused WebGPU powerPreference probe is still enabled");
}
if (runtime.includes('WARNING: `MarianTokenizer` is not yet supported')) {
  throw new Error("Unconditional MarianTokenizer warning is still enabled");
}
if (!offscreen.includes('device: "wasm"') || !offscreen.includes("env.backends.onnx.wasm.numThreads = 4")) {
  throw new Error("Offline translator is not pinned to four-thread WASM");
}
console.log("Runtime configuration tests passed");
