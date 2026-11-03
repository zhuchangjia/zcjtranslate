const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { TextEncoder } = require("util");
class AbortController { constructor() { this.signal = {}; } abort() {} }
const root = path.resolve(__dirname, "..");
const noopEvent = { addListener() {} };
const context = {
  console,
  URL,
  TextEncoder,
  AbortController,
  setTimeout,
  clearTimeout,
  chrome: {
    runtime: { onInstalled: noopEvent, onMessage: noopEvent, getURL: (value) => value },
    storage: { sync: { get: async (defaults) => defaults, set: async () => {} } },
    contextMenus: { create() {}, onClicked: noopEvent },
    commands: { onCommand: noopEvent },
    tabs: { query: async () => [], sendMessage() {} },
    i18n: { getUILanguage: () => "zh-CN" }
    ,tts: {
      getVoices(callback) { callback([{ voiceName: "Test English", lang: "en-US" }, { voiceName: "Test Japanese", lang: "ja-JP" }]); },
      stop() {},
      speak(_text, _options, callback) { callback(); }
    }
  },
  fetch: async (filename) => String(filename).startsWith("https://") ? ({
    ok: true,
    json: async () => ({ responseData: { translatedText: "在线翻译测试" }, responseStatus: 200 })
  }) : ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"))
  })
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "src", "background.js"), "utf8"), context);

(async () => {
  const englishWord = await context.lookup("abandon", "en");
  const englishParagraph = await context.lookup("We study every day.", "en");
  const japaneseWord = await context.lookup("学校", "ja");
  const japaneseParagraph = await context.lookup("これは日本語の文章です。", "ja");
  const speech = await context.speakWithSystemVoice("hello", "en");
  const longParagraph = await context.lookup(("We study every day. ").repeat(30), "en");
  const probably = await context.lookup("probably", "en");
  const typically = await context.lookup("typically", "en");
  const unknownWord = await context.lookup("zcjunknownword", "en");
  const juniorWord = await context.lookup("probably", "en");
  const elixir = await context.lookup("Elixir", "en");
  const referencer = await context.lookup("Referencer", "en");
  const technicalHeading = await context.lookup("## Elixir Referencer", "en");
  const algorithmic = await context.lookup("algorithmic", "en");
  const virtualization = await context.lookup("virtualization", "en");
  const filteredGlossary = await context.lookup("The source address for a selected network.", "en");
  const rankedGlossary = await context.lookup("Any then algorithmic virtualization referencer elixir typically probably source address network translation processor configuration implementation compatibility environment architecture.", "en");
  if (englishWord.mode || englishWord.source !== "en") throw new Error("English word routing failed");
  if (!englishParagraph.translation || englishParagraph.levels[0] !== "WORD-BY-WORD") throw new Error("English paragraph routing failed");
  if (japaneseWord.mode || japaneseWord.phonetic !== "がっこう") throw new Error("Japanese word routing failed");
  if (!japaneseParagraph.translation || japaneseParagraph.levels[0] !== "WORD-BY-WORD") throw new Error("Japanese paragraph routing failed");
  if (!speech.ok) throw new Error("TTS routing failed");
  if (!longParagraph.translation || longParagraph.text.length <= 300) throw new Error("Unlimited paragraph routing failed");
  if (probably.kind !== "word" || !probably.phonetic || !probably.translation.includes("很可能")) throw new Error("Probably supplement failed");
  if (typically.kind !== "word" || !typically.phonetic || !typically.translation.includes("通常")) throw new Error("Typically supplement failed");
  if (unknownWord.kind !== "word" || unknownWord.levels.includes("WORD-BY-WORD")) throw new Error("Unknown word routing failed");
  if (!juniorWord.phonetic || !juniorWord.levels.includes("JUNIOR_HIGH") || !juniorWord.levels.includes("SENIOR_HIGH")) throw new Error("School vocabulary merge failed");
  if (!elixir.phonetic || !elixir.translation.includes("灵丹妙药")) throw new Error("Elixir supplement failed");
  if (!referencer.phonetic || !referencer.translation.includes("引用工具")) throw new Error("Referencer supplement failed");
  if (!technicalHeading.translation.includes("炼金药剂") || !technicalHeading.translation.includes("引用者")) throw new Error("Technical heading translation failed");
  if (!algorithmic.translation.includes("算法")) throw new Error("General algorithmic fallback failed");
  if (!virtualization.translation.includes("虚拟化")) throw new Error("Virtualization fallback failed");
  if (/\b(?:The|for|a)：/u.test(filteredGlossary.translation)) throw new Error("Common function-word filtering failed");
  if (!filteredGlossary.translation.includes(" ｜ ") || !filteredGlossary.translation.includes("source：")) throw new Error("Glossary separator failed");
  if (/\b(?:Any|then)：/u.test(rankedGlossary.translation)) throw new Error("Basic vocabulary filtering failed");
  if (rankedGlossary.translation.split(" ｜ ").length > 10) throw new Error("Difficult vocabulary TOP 10 limit failed");
  console.log("Background routing tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
