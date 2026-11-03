/* Build-time only: convert Qwerty Learner dictionaries into one compact index. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sources = [
  [path.join(root, ".tmp-qwerty", "JUNIOR_HIGH.json"), "JUNIOR_HIGH"],
  [path.join(root, ".tmp-qwerty", "SENIOR_HIGH.json"), "SENIOR_HIGH"]
];
const existingDictionaryFile = path.join(root, "data", "dictionary.json");
const dictionary = fs.existsSync(existingDictionaryFile)
  ? JSON.parse(fs.readFileSync(existingDictionaryFile, "utf8"))
  : Object.create(null);
const sourceCounts = {};

for (const [filename, level] of sources) {
  const rows = JSON.parse(fs.readFileSync(filename, "utf8"));
  sourceCounts[level] = rows.length;
  for (const row of rows) {
    const key = String(row.name || "").trim().toLowerCase();
    if (!key || !/^[a-z][a-z '-]*$/.test(key)) continue;
    const translations = (row.trans || []).map((v) => String(v).trim()).filter(Boolean);
    const current = dictionary[key] || { p: row.usphone || row.ukphone || "", m: [], l: [] };
    for (const meaning of translations) if (!current.m.includes(meaning)) current.m.push(meaning);
    if (!current.p) current.p = row.usphone || row.ukphone || "";
    if (!current.l.includes(level)) current.l.push(level);
    dictionary[key] = current;
  }
}

const ordered = Object.fromEntries(Object.keys(dictionary).sort().map((key) => [key, dictionary[key]]));
const outputDir = path.join(root, "data");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "dictionary.json"), JSON.stringify(ordered), "utf8");
fs.writeFileSync(path.join(outputDir, "metadata.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), sourceCounts, uniqueEntries: Object.keys(ordered).length
}, null, 2), "utf8");
console.log(JSON.stringify({ sourceCounts, uniqueEntries: Object.keys(ordered).length }));
