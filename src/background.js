const DEFAULTS = {
  sourceLanguage: "auto",
  targetLanguage: "auto",
  trigger: "selection",
  hoverTranslation: true,
  preloadOfflineResources: true,
  autoSpeak: false
};
const ENGLISH_GLOSSARY_STOP_WORDS = new Set([
  "a", "an", "the", "for", "of", "to", "in", "on", "at", "by", "from", "with",
  "and", "or", "but", "as", "if", "than", "that", "this", "these", "those", "it", "its",
  "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "have", "has", "had",
  "any", "then", "all", "some", "many", "much", "more", "most", "other", "another", "each", "every",
  "one", "two", "first", "last", "new", "old", "good", "same", "such", "only", "also", "very", "just",
  "now", "here", "there", "when", "where", "which", "who", "what", "how", "can", "could", "may", "might",
  "will", "would", "shall", "should", "must", "not", "no", "yes", "we", "you", "they", "he", "she", "i"
]);
const JAPANESE_GLOSSARY_STOP_WORDS = new Set([
  "は", "が", "を", "に", "へ", "と", "で", "の", "も", "や", "か", "ね", "よ"
]);
let dictionaryPromise;
let commonSupplementPromise;
let ecdictFallbackPromise;
let japaneseDictionaryPromise;
let offscreenDocumentPromise;
let prewarmPromise;

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set(saved);
  chrome.contextMenus.create({
    id: "zcj-translate",
    title: "用指译翻译“%s”",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "zcj-translate" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_TEXT", text: info.selectionText });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "translate-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_SELECTION" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "LOOKUP") {
    lookup(message.text, message.pageLanguage).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message || "翻译失败" });
    });
    return true;
  }
  if (message.type === "SPEAK") {
    speakWithSystemVoice(message.text, message.language).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message || "播放失败" });
    });
    return true;
  }
  if (message.type === "LOCAL_MODEL_TRANSLATE") {
    translateWithLocalModel(message.text).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message || "本地模型翻译失败" });
    });
    return true;
  }
  if (message.type === "PREWARM_OFFLINE_RESOURCES") {
    prewarmOfflineResources().then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message || "离线资源预加载失败" });
    });
    return true;
  }
  return false;
});

async function lookup(rawText, pageLanguage = "") {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const text = String(rawText || "").trim().replace(/\s+/g, " ");
  if (!text) throw new Error("没有选中文字");

  const target = settings.targetLanguage === "auto"
    ? targetFromUiLanguage(chrome.i18n.getUILanguage())
    : settings.targetLanguage;

  if (looksJapanese(text, pageLanguage)) return lookupJapanese(text, target);
  if (text.includes(" ")) return translateEnglishOffline(text, target);
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(text)) {
    if (/[A-Za-z]/.test(text)) return translateEnglishOffline(text, target);
    throw new Error("请选择一个英文或日文词语");
  }
  const entry = await findLocalEntry(text);
  if (!entry) return unknownEnglishWord(text, target);
  return {
    ok: true,
    kind: "word",
    text,
    source: "en",
    target,
    translation: entry.m.join("；"),
    phonetic: entry.p ? `/${entry.p.replace(/^\/+|\/+$/g, "")}/` : "",
    meanings: entry.m.map((definition) => ({ partOfSpeech: "", definition })),
    levels: entry.l,
    offline: true
  };
}

async function lookupJapanese(rawText, target) {
  const text = rawText.replace(/^[\s「『【]+|[\s」』】。、！？]+$/gu, "");
  if (!text) throw new Error("没有选中文字");
  const dictionary = await loadJapaneseDictionary();
  const entry = dictionary[text];
  if (!entry || looksLikeJapaneseSentence(text)) {
    return translateJapaneseOffline(text, target);
  }
  return {
    ok: true,
    kind: "word",
    text,
    source: "ja",
    target,
    translation: entry.m,
    phonetic: entry.r || "",
    partOfSpeech: entry.p || "",
    meanings: [],
    levels: ["JA-COMMON"],
    offline: true
  };
}

async function translateEnglishOffline(text, target) {
  const dictionaries = await loadEnglishDictionaries();
  const entries = [];
  const seen = new Set();
  for (const match of text.matchAll(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)) {
    const word = match[0];
    const key = word.toLowerCase();
    if (ENGLISH_GLOSSARY_STOP_WORDS.has(key) || seen.has(key)) continue;
    const entry = findEntryInDictionaries(key, dictionaries);
    if (!entry) continue;
    seen.add(key);
    entries.push({ word, entry, order: entries.length, score: englishDifficultyScore(key, entry) });
  }
  const difficultEntries = entries
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, 10);
  const translation = difficultEntries.length
    ? difficultEntries.map(({ word, entry }) => `${word}：${conciseMeaning(entry.m[0])}`).join(" ｜ ")
    : "未找到需要重点解释的难词";
  return {
    ok: true,
    kind: "paragraph",
    text,
    source: "en",
    target,
    translation,
    phonetic: "",
    meanings: [],
    levels: ["WORD-BY-WORD"],
    canOfflineModel: true,
    offline: true
  };
}

async function translateWithLocalModel(text) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ type: "OPUS_TRANSLATE", target: "offscreen", text });
}

async function ensureOffscreenDocument() {
  if (offscreenDocumentPromise) return offscreenDocumentPromise;
  offscreenDocumentPromise = (async () => {
    const offscreenUrl = chrome.runtime.getURL("src/offscreen.html");
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl]
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: "src/offscreen.html",
        reasons: ["WORKERS"],
        justification: "在本机使用内置 OPUS-MT ONNX 模型进行离线整句翻译"
      });
    }
  })();
  try {
    return await offscreenDocumentPromise;
  } catch (error) {
    throw error;
  } finally {
    offscreenDocumentPromise = undefined;
  }
}

async function prewarmOfflineResources() {
  if (prewarmPromise) return prewarmPromise;
  prewarmPromise = (async () => {
    await Promise.all([loadEnglishDictionaries(), loadJapaneseDictionary(), ensureOffscreenDocument()]);
    const result = await chrome.runtime.sendMessage({ type: "OPUS_PRELOAD", target: "offscreen" });
    if (!result?.ok) throw new Error(result?.error || "OPUS-MT 预加载失败");
  })().catch((error) => {
    prewarmPromise = undefined;
    throw error;
  });
  return prewarmPromise;
}

async function translateJapaneseOffline(text, target) {
  const dictionary = await loadJapaneseDictionary();
  const pieces = [];
  const seen = new Set();
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s|[。、！？!?「」『』（）()]/u.test(char)) {
      pieces.push(char);
      index++;
      continue;
    }
    let match = "";
    let entry;
    for (let size = Math.min(16, text.length - index); size > 0; size--) {
      const candidate = text.slice(index, index + size);
      if (dictionary[candidate]) { match = candidate; entry = dictionary[candidate]; break; }
    }
    if (entry) {
      if (!JAPANESE_GLOSSARY_STOP_WORDS.has(match) && !seen.has(match)) {
        pieces.push({ word: match, meaning: conciseMeaning(entry.m), score: japaneseDifficultyScore(match), order: pieces.length });
        seen.add(match);
      }
      index += match.length;
    } else {
      index++;
    }
  }
  return {
    ok: true,
    kind: "paragraph",
    text,
    source: "ja",
    target,
    translation: pieces.length
      ? pieces.sort((left, right) => right.score - left.score || left.order - right.order)
        .slice(0, 10).map(({ word, meaning }) => `${word}：${meaning}`).join(" ｜ ")
      : "未找到需要重点解释的难词",
    phonetic: "",
    meanings: [],
    levels: ["WORD-BY-WORD"],
    offline: true
  };
}

function conciseMeaning(value) {
  const text = String(value || "").replace(/^\s*[（(][^）)]*[）)]\s*/u, "").trim();
  return text.split(/[；;]/u)[0].trim() || text;
}

function englishDifficultyScore(word, entry) {
  const levels = new Set(entry.l || []);
  let levelScore = 45;
  if (levels.has("JUNIOR_HIGH")) levelScore = 10;
  else if (levels.has("SENIOR_HIGH")) levelScore = 20;
  else if (levels.has("CET4")) levelScore = 30;
  else if (levels.has("CET6")) levelScore = 40;
  else if (levels.has("TEM8")) levelScore = 50;
  else if (levels.has("COMMON")) levelScore = 25;
  return levelScore * 100 + Math.min(word.length, 20) * 3 + (/[’-]/u.test(word) ? 2 : 0);
}

function japaneseDifficultyScore(word) {
  const kanjiCount = (word.match(/[\u3400-\u9fff々〆ヵヶ]/gu) || []).length;
  return Math.min(word.length, 20) * 10 + kanjiCount * 4;
}

function looksLikeJapaneseSentence(text) {
  return text.length > 18 || /[。！？!?\n]/u.test(text);
}

async function speakWithSystemVoice(rawText, language) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("没有可播放的文字");
  const lang = language === "ja" ? "ja-JP" : "en-US";
  const voices = await new Promise((resolve) => chrome.tts.getVoices(resolve));
  const voice = voices.find((item) => String(item.lang || "").toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  await new Promise((resolve, reject) => {
    chrome.tts.stop();
    const options = { rate: 0.9, enqueue: false };
    // Some Windows installations can speak with the default voice but silently
    // fail when Chrome is asked to match en-US explicitly.
    if (language === "ja" && voice) {
      options.lang = lang;
      options.voiceName = voice.voiceName;
    }
    chrome.tts.speak(text, options, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve();
    });
  });
  return { ok: true };
}

function looksJapanese(text, pageLanguage) {
  const hasKana = /[\u3040-\u30ffー]/u.test(text);
  const japanesePage = /^ja(?:-|$)/i.test(pageLanguage || "");
  return hasKana || (japanesePage && /[\u3400-\u9fff々〆ヵヶ]/u.test(text));
}

async function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch(chrome.runtime.getURL("data/dictionary.json")).then((response) => {
      if (!response.ok) throw new Error("无法加载本地词库");
      return response.json();
    });
  }
  return dictionaryPromise;
}

async function loadCommonSupplement() {
  if (!commonSupplementPromise) {
    commonSupplementPromise = fetch(chrome.runtime.getURL("data/common-supplement.json")).then((response) => {
      if (!response.ok) throw new Error("无法加载常用词补充库");
      return response.json();
    });
  }
  return commonSupplementPromise;
}

async function loadEcdictFallback() {
  if (!ecdictFallbackPromise) {
    ecdictFallbackPromise = fetch(chrome.runtime.getURL("data/ecdict-fallback.json")).then((response) => {
      if (!response.ok) throw new Error("无法加载通用离线词典");
      return response.json();
    });
  }
  return ecdictFallbackPromise;
}

async function loadEnglishDictionaries() {
  const [dictionary, supplement, fallback] = await Promise.all([
    loadDictionary(), loadCommonSupplement(), loadEcdictFallback()
  ]);
  return [supplement, dictionary, fallback];
}

async function loadJapaneseDictionary() {
  if (!japaneseDictionaryPromise) {
    japaneseDictionaryPromise = fetch(chrome.runtime.getURL("data/japanese-dictionary.json")).then((response) => {
      if (!response.ok) throw new Error("无法加载本地日语词库");
      return response.json();
    });
  }
  return japaneseDictionaryPromise;
}

async function findLocalEntry(word) {
  const dictionaries = await loadEnglishDictionaries();
  const key = word.toLowerCase();
  return findEntryInDictionaries(key, dictionaries);
}

function findEntryInDictionaries(word, dictionaries) {
  const exact = mergeDictionaryEntries(word, dictionaries);
  if (exact) return exact;
  for (const candidate of inflectionCandidates(word)) {
    const inflected = mergeDictionaryEntries(candidate, dictionaries);
    if (inflected) return inflected;
  }
  return null;
}

function mergeDictionaryEntries(word, dictionaries) {
  const entries = dictionaries.map((dictionary) => dictionary[word]).filter(Boolean);
  if (!entries.length) return null;
  return {
    p: entries.find((entry) => entry.p)?.p || "",
    m: [...new Set(entries.flatMap((entry) => entry.m || []))],
    l: [...new Set(entries.flatMap((entry) => entry.l || []))]
  };
}

function unknownEnglishWord(text, target) {
  return {
    ok: true,
    kind: "word",
    text,
    source: "en",
    target,
    translation: "本地词库暂未收录",
    phonetic: "",
    meanings: [],
    levels: [],
    offline: true
  };
}

function inflectionCandidates(word) {
  const values = [];
  if (word.endsWith("ies") && word.length > 4) values.push(word.slice(0, -3) + "y");
  if (word.endsWith("es") && word.length > 3) values.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 2) values.push(word.slice(0, -1));
  if (word.endsWith("ied") && word.length > 4) values.push(word.slice(0, -3) + "y");
  if (word.endsWith("ed") && word.length > 3) values.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith("ing") && word.length > 5) values.push(word.slice(0, -3), word.slice(0, -3) + "e");
  return values;
}

function targetFromUiLanguage(language) {
  const normalized = String(language || "zh-CN").toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  return normalized.split("-")[0];
}
