/* Build-time only: create a compact, offline general dictionary from ECDICT. */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const root = path.resolve(__dirname, "..");
const sourceFile = path.join(root, ".tmp-ecdict", "ecdict.csv");
const mainFile = path.join(root, "data", "dictionary.json");
const supplementFile = path.join(root, "data", "common-supplement.json");
const outputFile = path.join(root, "data", "ecdict-fallback.json");
const metadataFile = path.join(root, "data", "ecdict-metadata.json");
const main = JSON.parse(fs.readFileSync(mainFile, "utf8"));
const supplement = JSON.parse(fs.readFileSync(supplementFile, "utf8"));
const fallback = Object.create(null);
let sourceRows = 0;
let rejected = 0;
let filledPhonetics = 0;
let fallbackMissingPhonetics = 0;

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(value); value = "";
    } else value += char;
  }
  fields.push(value);
  return fields;
}

function cleanMeanings(value) {
  return String(value || "")
    .split(/\\n|\r?\n/u)
    .map((item) => item.trim())
    .filter((item) => item && /[\u3400-\u9fff]/u.test(item))
    .slice(0, 6)
    .map((item) => item.slice(0, 300));
}

(async () => {
  const lines = readline.createInterface({ input: fs.createReadStream(sourceFile, "utf8"), crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) { first = false; continue; }
    sourceRows++;
    const row = parseCsvLine(line);
    const word = String(row[0] || "").trim().toLowerCase();
    const phonetic = String(row[1] || "").trim();
    const meanings = cleanMeanings(row[3]);
    if (!/^[a-z][a-z'-]{0,63}$/.test(word) || !meanings.length) { rejected++; continue; }

    const existing = supplement[word] || main[word];
    if (existing) {
      if (!existing.p) { existing.p = phonetic; filledPhonetics++; }
      continue;
    }
    if (!phonetic) fallbackMissingPhonetics++;
    fallback[word] = { p: phonetic, m: meanings, l: ["ECDICT"] };
  }

  const ordered = Object.fromEntries(Object.keys(fallback).sort().map((word) => [word, fallback[word]]));
  fs.writeFileSync(mainFile, JSON.stringify(main), "utf8");
  fs.writeFileSync(supplementFile, JSON.stringify(supplement, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputFile, JSON.stringify(ordered), "utf8");
  const report = {
    generatedAt: new Date().toISOString(), sourceRows, rejected,
    existingEntries: Object.keys(main).length + Object.keys(supplement).length,
    fallbackEntries: Object.keys(ordered).length, filledPhonetics, fallbackMissingPhonetics
  };
  fs.writeFileSync(metadataFile, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error); process.exitCode = 1; });
