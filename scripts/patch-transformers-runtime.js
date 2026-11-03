const fs = require("fs");
const path = require("path");

const runtimePath = path.resolve(__dirname, "..", "vendor", "transformers", "transformers.min.js");
let source = fs.readFileSync(runtimePath, "utf8");

const webGpuProbe = 'M?.webgpu&&(M.webgpu.powerPreference="high-performance")';
const webGpuReplacement = "M?.webgpu&&0";
const marianWarning = 'console.warn(\'WARNING: `MarianTokenizer` is not yet supported by Hugging Face\\\'s "fast" tokenizers library. Therefore, you may experience slightly inaccurate results.\')';

function replaceExactlyOnce(pattern, replacement, label) {
  const occurrences = source.split(pattern).length - 1;
  if (occurrences === 0 && source.includes(replacement)) return;
  if (occurrences !== 1) throw new Error(`${label}: expected exactly one occurrence, found ${occurrences}`);
  source = source.replace(pattern, replacement);
}

replaceExactlyOnce(webGpuProbe, webGpuReplacement, "WebGPU probe");
replaceExactlyOnce(marianWarning, "void 0", "MarianTokenizer warning");
fs.writeFileSync(runtimePath, source);
console.log("Transformers.js runtime patches applied");
