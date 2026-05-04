// Extrait le texte des PDF du dossier ECOS/ et génère src/ecosBuiltInRaw.js
// Usage: node scripts/buildEcosFromPdfs.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ECOS_DIR = path.join(ROOT, 'ECOS');
const OUT = path.join(ROOT, 'src', 'ecosBuiltInRaw.js');

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

async function extractPdfText(filePath) {
  const data = new Uint8Array(await readFile(filePath));
  const loadingTask = getDocument({ data, disableWorker: true, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    // Reconstruction simple ligne par ligne via coordonnées Y
    const items = tc.items.map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
    }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    let cur = []; let lastY = null;
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) <= 3) cur.push(it);
      else { if (cur.length) lines.push(cur); cur = [it]; }
      lastY = it.y;
    }
    if (cur.length) lines.push(cur);
    const text = lines.map(l => l.sort((a, b) => a.x - b.x).map(it => it.str).join('').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    pages.push(text);
  }
  return pages.join('\n\n');
}

const files = (await readdir(ECOS_DIR)).filter(f => /\.pdf$/i.test(f)).sort();
const out = [];
for (const f of files) {
  process.stdout.write(`  Extraction ${f}… `);
  try {
    const rawText = await extractPdfText(path.join(ECOS_DIR, f));
    out.push({ filename: f, rawText });
    console.log(`${rawText.length} chars`);
  } catch (e) {
    console.log(`ERREUR: ${e.message}`);
  }
}

const header = `// Auto-généré par scripts/buildEcosFromPdfs.mjs — ne pas éditer à la main\n// ${out.length} ECOS extraits depuis le dossier ECOS/\nexport const ECOS_BUILTIN_RAW = `;
await writeFile(OUT, header + JSON.stringify(out, null, 2) + ';\n', 'utf8');
console.log(`\nGénéré : ${OUT} (${out.length} cas)`);
