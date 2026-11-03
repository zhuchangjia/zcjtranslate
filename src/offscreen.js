import { env, pipeline } from "../vendor/transformers/transformers.min.js";

// This build of Transformers.js is patched to skip its eager WebGPU
// powerPreference probe. The bundled OPUS-MT model always runs on WASM.
env.allowRemoteModels = false;
env.allowLocalModels = true;
// The model is bundled under chrome-extension:// and is already local. Cache
// Storage cannot store that URL scheme, so avoid a redundant failing write.
env.useBrowserCache = false;
env.localModelPath = chrome.runtime.getURL("models/");
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/transformers/");
env.backends.onnx.wasm.numThreads = 4;
env.backends.onnx.wasm.proxy = false;

let translatorPromise;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === "OPUS_PRELOAD") {
    getTranslator().then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message || "OPUS-MT 预加载失败" });
    });
    return true;
  }
  if (message.type !== "OPUS_TRANSLATE") return false;
  translateParagraph(message.text).then((translation) => {
    sendResponse({ ok: true, translation, provider: "OPUS-MT 量化版" });
  }).catch((error) => {
    sendResponse({ ok: false, error: error.message || "本地模型翻译失败" });
  });
  return true;
});

async function getTranslator() {
  if (!translatorPromise) {
    translatorPromise = pipeline("translation", "opus-mt-en-zh", {
      device: "wasm", dtype: "q8", local_files_only: true
    }).catch((error) => {
      translatorPromise = undefined;
      throw error;
    });
  }
  return translatorPromise;
}

async function translateParagraph(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("没有可翻译的文字");
  const translator = await getTranslator();
  const translated = [];
  for (const chunk of splitForModel(text, 420)) {
    const output = await translator(chunk, { max_new_tokens: 512 });
    const value = output?.[0]?.translation_text?.trim();
    if (!value) throw new Error("模型没有返回译文");
    translated.push(value);
  }
  return translated.join("\n");
}

function splitForModel(text, limit) {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?|\n+/gu) || [text];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const value = sentence.trim();
    if (!value) continue;
    if ((current + " " + value).trim().length <= limit) {
      current = (current + " " + value).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (value.length <= limit) { current = value; continue; }
    current = "";
    for (const word of value.split(/\s+/u)) {
      if (current && `${current} ${word}`.length > limit) { chunks.push(current); current = word; }
      else current = `${current} ${word}`.trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
