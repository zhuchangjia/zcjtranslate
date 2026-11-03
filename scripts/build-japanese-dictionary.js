/* Build-time only: normalize the Unlicense Japanese-Chinese thesaurus. */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, ".tmp-japanese", "final.json"), "utf8"));
const dictionary = Object.create(null);
let aliases = 0;

for (const [rawWord, rawValue] of Object.entries(source)) {
  const word = normalizeWord(rawWord);
  if (!word || word.length > 40 || !/[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u.test(word)) continue;
  const parsed = parseValue(String(rawValue || "").trim());
  if (!parsed.meaning) continue;
  const entry = { r: parsed.reading, p: parsed.part, m: parsed.meaning };
  dictionary[word] = entry;
  if (parsed.reading && /^[\u3040-\u30ffー・]+$/u.test(parsed.reading) && !dictionary[parsed.reading]) {
    dictionary[parsed.reading] = entry;
    aliases++;
  }
}

function normalizeWord(value) {
  return String(value).trim().replace(/^[\s「『【]+|[\s」』】。、！？]+$/gu, "");
}

function parseValue(value) {
  const match = value.match(/^\s*[（(]([^）)]+)[）)]\s*[⓪①②③④⑤⑥⑦⑧⑨0-9]*\s*(?:【([^】]+)】)?\s*(.*)$/u);
  if (!match) return { reading: "", part: "", meaning: value };
  let [, reading, part = "", meaning] = match;
  if (!part) {
    const plainPart = meaning.match(/^(名词|动词|形容词|形容动词|副词|助词|助动词|连体词|接续词|感叹词|惯用语|代词|数量词)\s*/u);
    if (plainPart) { part = plainPart[1]; meaning = meaning.slice(plainPart[0].length); }
  }
  return { reading: reading.trim(), part: part.trim(), meaning: meaning.trim() || value };
}

const ordered = Object.fromEntries(Object.keys(dictionary).sort().map((key) => [key, dictionary[key]]));
fs.writeFileSync(path.join(root, "data", "japanese-dictionary.json"), JSON.stringify(ordered), "utf8");
fs.writeFileSync(path.join(root, "data", "japanese-metadata.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), sourceEntries: Object.keys(source).length,
  indexedEntries: Object.keys(ordered).length, readingAliases: aliases
}, null, 2), "utf8");
console.log(JSON.stringify({ sourceEntries: Object.keys(source).length, indexedEntries: Object.keys(ordered).length, aliases }));
