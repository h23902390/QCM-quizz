// Splits the "120 ECOS" bundle entry of src/ecosBuiltInRaw.js into ~120 individual entries.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'src', 'ecosBuiltInRaw.js');

const mod = await import(`file://${OUT.replace(/\\/g, '/')}`);
const arr = mod.ECOS_BUILTIN_RAW;

const bundleIdx = arr.findIndex((e) => /120 ECOS/i.test(e.filename));
if (bundleIdx < 0) throw new Error('Bundle entry not found');
const bundle = arr[bundleIdx];
const text = bundle.rawText;
console.log('Bundle text length:', text.length);

// Detect headers. We saw lines like "Constipation - Situation de départ n° 1" which appear in TOC.
// Real case starts probably begin after TOC. Find ALL "Situation de départ n° N" with their indices,
// then group: first occurrence in TOC (clustered together near start), subsequent occurrences for case bodies.
const re = /Situation de d[ée]part n°\s*(\d+)/gi;
const all = [...text.matchAll(re)].map((m) => ({ idx: m.index, num: parseInt(m[1], 10), match: m[0] }));
console.log('Total markers:', all.length);

// Histogram per number
const byNum = new Map();
for (const m of all) {
  if (!byNum.has(m.num)) byNum.set(m.num, []);
  byNum.get(m.num).push(m.idx);
}
const nums = [...byNum.keys()].sort((a, b) => a - b);
console.log('Distinct numbers:', nums.length, 'min:', nums[0], 'max:', nums[nums.length - 1]);

// Strategy: for each case number N, the FIRST occurrence belongs to the TOC; the case body
// starts at a LATER occurrence. We pick, for each N, the LAST occurrence whose start index
// is followed by enough body before the next-different-number marker.
// Simpler: take the LAST occurrence of each N. Sort by index, slice between them.
const lastByNum = nums.map((n) => ({ num: n, idx: byNum.get(n).slice(-1)[0] }));
// Sort by idx
lastByNum.sort((a, b) => a.idx - b.idx);

// Sanity: indices should be strictly increasing and roughly ordered like 1,2,3,... or close.
console.log('Order of numbers by idx (first 20):', lastByNum.slice(0, 20).map((x) => x.num));
console.log('(last 10):', lastByNum.slice(-10).map((x) => x.num));

const cases = [];
for (let i = 0; i < lastByNum.length; i++) {
  const start = lastByNum[i].idx;
  const end = i + 1 < lastByNum.length ? lastByNum[i + 1].idx : text.length;
  const body = text.slice(start, end).trim();
  cases.push({ num: lastByNum[i].num, body });
}

// Filter: drop tiny bodies (< 500 chars) which are likely still TOC entries
const real = cases.filter((c) => c.body.length >= 500);
console.log('Cases >=500 chars:', real.length);
console.log('Avg body len:', Math.round(real.reduce((s, c) => s + c.body.length, 0) / real.length));

if (real.length < 100 || real.length > 130) {
  console.warn('WARN: count out of [100,130], inspecting...');
}

// Replace bundle entry
// Sequential renumbering by order of appearance — original `c.num` values are polluted
// by concatenated page numbers in the PDF text extraction, so they aren't trustworthy.
const newEntries = real.map((c, i) => ({
  filename: `120 ECOS - cas ${String(i + 1).padStart(3, '0')}`,
  rawText: c.body,
}));

const newArr = [...arr.slice(0, bundleIdx), ...newEntries, ...arr.slice(bundleIdx + 1)];

const header = `// Auto-généré par scripts/buildEcosFromPdfs.mjs — ne pas éditer à la main\n// ${newArr.length} ECOS extraits depuis le dossier ECOS/\nexport const ECOS_BUILTIN_RAW = `;
await writeFile(OUT, header + JSON.stringify(newArr, null, 2) + ';\n', 'utf8');
console.log(`Wrote ${OUT} with ${newArr.length} entries`);
