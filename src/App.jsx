import React, { useState, useEffect, useRef, useMemo } from 'react';

// ============================================================
//  EXTRACTEUR & QUIZ DE QCM/QROC — V2
//  - Charge un PDF de cours corrigé
//  - Détecte automatiquement les bonnes réponses (couleur verte)
//  - Mode quiz interactif avec correction
//  - Évaluation IA (OpenAI) pour les QROC
// ============================================================

// ---------- Helpers ----------
const normalize = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const c = a[j - 1] === b[i - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + c);
    }
  }
  return m[b.length][a.length];
};

const isGreenPixel = (r, g, b) =>
  g > r + 18 && g > b + 18 && g > 80 && g < 230;

// ---------- Component ----------
export default function App() {
  // App state
  const [mode, setMode] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [libsReady, setLibsReady] = useState(false);
  const [libsError, setLibsError] = useState(null);

  // Document & questions
  const [filename, setFilename] = useState('');
  const [questions, setQuestions] = useState([]);
  const [pages, setPages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [error, setError] = useState(null);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [results, setResults] = useState([]);

  // Settings — restaure depuis localStorage à l'init (synchrone)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_key') || '');
  const [model, setModel] = useState(() => localStorage.getItem('openai_model') || 'gpt-5.4-mini');
  const [useAI, setUseAI] = useState(() => {
    const v = localStorage.getItem('use_ai');
    return v === null ? true : v === 'true';
  });
  const [showKey, setShowKey] = useState(false);

  // Drop zone
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ---------- Charge libs PDF/jsPDF depuis CDN ----------
  useEffect(() => {
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Échec : ' + src));
      document.head.appendChild(s);
    });
    (async () => {
      try {
        if (!window.pdfjsLib) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        setLibsReady(true);
      } catch (e) { setLibsError(e.message); }
    })();
  }, []);

  const persistKey = (k) => {
    setApiKey(k);
    try { localStorage.setItem('openai_key', k); } catch {}
  };
  const persistModel = (m) => {
    setModel(m);
    try { localStorage.setItem('openai_model', m); } catch {}
  };
  const persistUseAI = (v) => {
    setUseAI(v);
    try { localStorage.setItem('use_ai', String(v)); } catch {}
  };

  // ---------- Reconstruction texte d'une page ----------
  const reconstructText = (textContent) => {
    if (!textContent.items.length) return { text: '', items: [] };
    const items = textContent.items.map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: it.height || 12,
    }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    let current = []; let lastY = null;
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) <= 3) current.push(it);
      else { if (current.length) lines.push(current); current = [it]; }
      lastY = it.y;
    }
    if (current.length) lines.push(current);
    const text = lines.map(line =>
      line.sort((a, b) => a.x - b.x).map(it => it.str).join('').replace(/\s+/g, ' ').trim()
    ).filter(Boolean).join('\n');
    return { text, items, lines };
  };

  // ---------- Détection permissive des marqueurs d'options ----------
  // Trouve les positions des marqueurs A./B)/C-/D:/E… dans un texte.
  // Tolère: minuscules, espaces avant, ponctuation variée (. ) - : /), options
  // sur la même ligne ou sur des lignes différentes. Ne garde que les lettres
  // qui se suivent dans l'ordre A → B → C → D → E (évite les faux positifs
  // type « 3) Question A propos de … »).
  const findOptionMarkers = (text) => {
    const re = /(^|[\n\s\(\[])([A-Ea-e])\s*[\.\)\-:\/]\s+(?=\S)/g;
    const all = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      all.push({
        letter: m[2].toUpperCase(),
        startIdx: m.index + m[1].length,
        contentIdx: m.index + m[0].length,
      });
    }
    const order = ['A', 'B', 'C', 'D', 'E'];
    const out = [];
    let next = 0;
    for (const f of all) {
      if (f.letter === order[next]) {
        out.push(f);
        next++;
        if (next >= order.length) break;
      }
    }
    return out;
  };

  // ---------- Classification d'une page ----------
  const classifyPage = (text) => {
    const t = text.trim();
    if (t.length < 15) return 'empty';
    const low = t.toLowerCase();
    if (low.length < 60 && (low.includes('chargement') || low.includes('loading'))) return 'loading';
    const hasQLabel = /\bquestion\s*\d+/i.test(t);
    const markers = findOptionMarkers(t);
    const hasQMark = /\?/.test(t);
    if (markers.length >= 2) return 'qcm';
    if (hasQLabel && hasQMark) return 'qroc';
    if (hasQLabel && t.length < 80) return 'qroc';
    if (t.length > 120 && markers.length === 0 && !hasQLabel) return 'context';
    return 'correction';
  };

  // ---------- Détection des bonnes réponses (couleur) ----------
  const detectGreenOptions = async (page, items, lines) => {
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const W = canvas.width;

    const sampleColor = (item) => {
      const [cx, cy] = viewport.convertToViewportPoint(item.x, item.y);
      let greenCount = 0, totalCount = 0;
      const wPx = Math.max(item.w * scale, 30);
      const hPx = Math.max(item.h * scale, 10);
      for (let dx = 0; dx < wPx; dx += 4) {
        for (let dy = -hPx * 0.7; dy < 0; dy += 3) {
          const px = Math.round(cx + dx);
          const py = Math.round(cy + dy);
          if (px < 0 || px >= W || py < 0 || py >= canvas.height) continue;
          const i = (py * W + px) * 4;
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
          if (r > 240 && g > 240 && b > 240) continue;
          totalCount++;
          if (isGreenPixel(r, g, b)) greenCount++;
        }
      }
      return totalCount > 0 && greenCount / totalCount > 0.3;
    };

    const correctLetters = new Set();
    for (const line of lines) {
      const lineText = line.sort((a, b) => a.x - b.x).map(it => it.str).join('').trim();
      const m = lineText.match(/^\s*([A-Ea-e])\s*[\.\)\-:\/]?\s+\S/);
      if (!m) continue;
      const textItems = line.filter(it => it.str.trim().length > 0);
      if (textItems.length === 0) continue;
      const isGreen = textItems.some(sampleColor);
      if (isGreen) correctLetters.add(m[1].toUpperCase());
    }

    canvas.width = 0; canvas.height = 0;
    return correctLetters;
  };

  const parseOptions = (text, correctSet) => {
    const markers = findOptionMarkers(text);
    if (markers.length === 0) return [];
    const opts = [];
    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].contentIdx;
      const end = i + 1 < markers.length ? markers[i + 1].startIdx : text.length;
      const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
      opts.push({
        letter: markers[i].letter,
        text: raw,
        correct: correctSet.has(markers[i].letter),
      });
    }
    return opts;
  };

  const parseQCMEnonce = (text) => {
    const markers = findOptionMarkers(text);
    if (markers.length === 0) return text.trim();
    return text.slice(0, markers[0].startIdx).trim();
  };

  const parseQROC = (text) => {
    const idx = text.lastIndexOf('?');
    if (idx === -1) return { enonce: text.trim(), expected: '', variants: [] };
    const enonce = text.slice(0, idx + 1).trim();
    const rest = text.slice(idx + 1).trim();
    if (!rest) return { enonce, expected: '', variants: [] };
    const restLines = rest.split('\n').map(l => l.trim()).filter(Boolean);
    let expected = restLines[0] || '';
    let variants = [];
    if (restLines.length > 1) {
      for (const l of restLines.slice(1)) {
        const parts = l.split(/[;,]/).map(p => p.trim()).filter(Boolean);
        variants.push(...parts);
      }
    }
    if (expected.includes(';')) {
      const parts = expected.split(';').map(p => p.trim()).filter(Boolean);
      expected = parts[0];
      variants.push(...parts.slice(1));
    }
    return { enonce, expected, variants };
  };

  const handleFile = async (f) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setError('Seul le format PDF est supporté pour l\'instant.'); return; }
    if (!libsReady) { setError('Bibliothèques en cours de chargement, réessaie.'); return; }
    setError(null);
    setQuestions([]); setPages([]); setResults([]);
    setFilename(f.name.replace(/\.pdf$/i, ''));
    setProcessing(true);
    setProgress({ current: 0, total: 0, label: 'Lecture du PDF…' });

    try {
      const buf = await f.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const total = pdf.numPages;
      setProgress({ current: 0, total, label: 'Extraction du texte…' });

      const rawPages = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const { text, items, lines } = reconstructText(tc);
        const type = classifyPage(text);
        rawPages.push({ pageNum: i, text, type, _page: page, _items: items, _lines: lines });
        setProgress({ current: i, total, label: `Extraction texte ${i}/${total}` });
      }

      const qcmPages = rawPages.filter(p => p.type === 'qcm');
      let qcmIdx = 0;
      for (const p of qcmPages) {
        qcmIdx++;
        setProgress({ current: qcmIdx, total: qcmPages.length, label: `Détection des bonnes réponses ${qcmIdx}/${qcmPages.length}` });
        try {
          p.correctSet = await detectGreenOptions(p._page, p._items, p._lines);
        } catch (e) {
          p.correctSet = new Set();
          p.detectionError = true;
        }
      }

      const bank = [];
      let currentContext = null;
      for (const p of rawPages) {
        if (p.type === 'context') {
          currentContext = p.text;
          continue;
        }
        if (p.type === 'qcm') {
          const enonce = parseQCMEnonce(p.text);
          const options = parseOptions(p.text, p.correctSet);
          if (options.length >= 2) {
            bank.push({
              id: `p${p.pageNum}`,
              pageNum: p.pageNum,
              type: 'qcm',
              context: currentContext,
              enonce,
              options,
              detectionError: !!p.detectionError,
              hasNoCorrect: options.every(o => !o.correct),
            });
          }
        } else if (p.type === 'qroc') {
          const { enonce, expected, variants } = parseQROC(p.text);
          bank.push({
            id: `p${p.pageNum}`,
            pageNum: p.pageNum,
            type: 'qroc',
            context: currentContext,
            enonce,
            expected,
            variants,
            hasNoAnswer: !expected,
          });
        }
      }

      rawPages.forEach(p => { delete p._page; delete p._items; delete p._lines; });

      setPages(rawPages.map(({ _page, _items, _lines, correctSet, ...rest }) => rest));
      setQuestions(bank);
      setMode('extract');
    } catch (e) {
      console.error(e);
      setError('Erreur de traitement : ' + e.message);
    } finally {
      setProcessing(false);
      setProgress({ current: 0, total: 0, label: '' });
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  };

  const toggleCorrect = (qId, letter) => {
    setQuestions(qs => qs.map(q => {
      if (q.id !== qId || q.type !== 'qcm') return q;
      return {
        ...q,
        options: q.options.map(o => o.letter === letter ? { ...o, correct: !o.correct } : o),
        hasNoCorrect: q.options.filter(o => o.letter === letter ? !o.correct : o.correct).length === 0,
      };
    }));
  };
  const setQROCAnswer = (qId, val) => {
    setQuestions(qs => qs.map(q => q.id === qId ? { ...q, expected: val, hasNoAnswer: !val } : q));
  };

  const startQuiz = (shuffle) => {
    let qs = questions.filter(q => {
      if (q.type === 'qcm') return q.options.length >= 2 && !q.hasNoCorrect;
      if (q.type === 'qroc') return !q.hasNoAnswer;
      return false;
    });
    if (shuffle) qs = [...qs].sort(() => Math.random() - 0.5);
    setQuizQuestions(qs);
    setQuizIdx(0);
    setUserAnswer({});
    setFeedback(null);
    setResults([]);
    setMode('quiz');
  };

  const evaluateQROCWithAI = async (q, userText) => {
    const expectedAll = [q.expected, ...q.variants].filter(Boolean).join(' / ');
    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un correcteur d\'examen médical français rigoureux. Tu évalues les réponses courtes (QROC) en comparant la réponse de l\'étudiant à la réponse de référence. Réponds STRICTEMENT en JSON avec les clés "verdict" (correct|partiel|incorrect), "score" (0-100), "explanation" (1-2 phrases en français, sans préambule).',
        },
        {
          role: 'user',
          content: `Question : ${q.enonce}\n\nRéponse de référence (et variantes acceptées) : ${expectedAll}\n\nRéponse de l'étudiant : ${userText}\n\nÉvalue.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI ${resp.status} : ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(raw);
      return {
        verdict: parsed.verdict || 'incorrect',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        explanation: parsed.explanation || '',
      };
    } catch {
      return { verdict: 'incorrect', score: 0, explanation: 'Réponse IA non parsable.' };
    }
  };

  const submitAnswer = async () => {
    const q = quizQuestions[quizIdx];
    if (!q) return;
    let fb;
    if (q.type === 'qcm') {
      const userSet = userAnswer.set || new Set();
      const correctSet = new Set(q.options.filter(o => o.correct).map(o => o.letter));
      const isCorrect = userSet.size === correctSet.size && [...userSet].every(l => correctSet.has(l));
      fb = {
        verdict: isCorrect ? 'correct' : 'incorrect',
        score: isCorrect ? 100 : 0,
        explanation: isCorrect
          ? 'Bonne réponse.'
          : `Réponse(s) attendue(s) : ${[...correctSet].sort().join(', ')}`,
        expected: [...correctSet].sort().join(', '),
        userValue: [...userSet].sort().join(', ') || '(aucune)',
      };
    } else {
      const userText = (userAnswer.text || '').trim();
      if (!userText) {
        fb = { verdict: 'incorrect', score: 0, explanation: 'Aucune réponse fournie.', expected: q.expected, userValue: '(vide)' };
      } else {
        const userN = normalize(userText);
        const allRefs = [q.expected, ...q.variants].filter(Boolean).map(normalize);
        let matched = false;
        for (const ref of allRefs) {
          if (userN === ref) { matched = true; break; }
          const tol = Math.max(1, Math.floor(ref.length * 0.15));
          if (levenshtein(userN, ref) <= tol) { matched = true; break; }
        }
        if (matched) {
          fb = {
            verdict: 'correct', score: 100,
            explanation: 'Réponse correcte (ou très proche).',
            expected: q.expected, userValue: userText,
          };
        } else if (useAI && apiKey) {
          setEvaluating(true);
          try {
            const aiRes = await evaluateQROCWithAI(q, userText);
            fb = { ...aiRes, expected: q.expected, userValue: userText };
          } catch (e) {
            fb = {
              verdict: 'incorrect', score: 0,
              explanation: `Comparaison stricte : non. IA indisponible (${e.message}). Réponse attendue : ${q.expected}.`,
              expected: q.expected, userValue: userText,
            };
          } finally { setEvaluating(false); }
        } else {
          fb = {
            verdict: 'incorrect', score: 0,
            explanation: `Réponse attendue : ${q.expected}${q.variants.length ? ` (variantes : ${q.variants.join(', ')})` : ''}`,
            expected: q.expected, userValue: userText,
          };
        }
      }
    }
    setFeedback(fb);
    setResults(r => [...r, { question: q, userAnswer, feedback: fb }]);
  };

  const nextQuestion = () => {
    if (quizIdx + 1 >= quizQuestions.length) {
      setMode('results');
    } else {
      setQuizIdx(quizIdx + 1);
      setUserAnswer({});
      setFeedback(null);
    }
  };

  const reset = () => {
    setMode('home'); setQuestions([]); setPages([]); setQuizQuestions([]);
    setQuizIdx(0); setUserAnswer({}); setFeedback(null); setResults([]);
    setFilename(''); setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stats = useMemo(() => ({
    total: questions.length,
    qcm: questions.filter(q => q.type === 'qcm').length,
    qroc: questions.filter(q => q.type === 'qroc').length,
    badQcm: questions.filter(q => q.type === 'qcm' && q.hasNoCorrect).length,
    badQroc: questions.filter(q => q.type === 'qroc' && q.hasNoAnswer).length,
  }), [questions]);

  const quizStats = useMemo(() => {
    const correct = results.filter(r => r.feedback?.verdict === 'correct').length;
    const partial = results.filter(r => r.feedback?.verdict === 'partiel').length;
    const incorrect = results.filter(r => r.feedback?.verdict === 'incorrect').length;
    return { correct, partial, incorrect, total: results.length };
  }, [results]);

  return (
    <div className="min-h-screen w-full" style={{
      background: '#f6f3ec', color: '#1a1a1a',
      fontFamily: "'Public Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400&display=swap');
        .display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .scrollbar::-webkit-scrollbar { width: 8px; }
        .scrollbar::-webkit-scrollbar-thumb { background: #d6d0c1; border-radius: 4px; }
        .scrollbar::-webkit-scrollbar-thumb:hover { background: #b8b09c; }
        .btn-primary { background: #1a1a1a; color: #f6f3ec; transition: all .15s; }
        .btn-primary:hover:not(:disabled) { background: #b54125; }
        .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
        .btn-secondary { background: transparent; color: #1a1a1a; border: 1px solid #1a1a1a; transition: all .15s; }
        .btn-secondary:hover:not(:disabled) { background: #1a1a1a; color: #f6f3ec; }
        .btn-secondary:disabled { opacity: .4; cursor: not-allowed; }
        .input-field {
          background: #fff; border: 1px solid #d6d0c1; padding: 10px 14px;
          border-radius: 2px; outline: none; transition: border-color .15s;
          font-family: inherit; font-size: 14px;
        }
        .input-field:focus { border-color: #1a1a1a; }
        .qcm-option {
          display: flex; gap: 12px; padding: 14px 16px; border: 1px solid #d6d0c1;
          background: #fff; cursor: pointer; transition: all .12s; align-items: flex-start;
        }
        .qcm-option:hover { background: #ece7d8; }
        .qcm-option.selected { background: #1a1a1a; color: #f6f3ec; border-color: #1a1a1a; }
        .qcm-option.correct { background: #e6f3e0; border-color: #6b9d4d; color: #2d5a1a; }
        .qcm-option.incorrect-selected { background: #f8e0d6; border-color: #b54125; color: #6b1f0a; }
        .qcm-option.missed { background: #fff8e0; border-color: #c4a84d; color: #5a4a10; }
      `}</style>

      <header className="border-b" style={{ borderColor: '#d6d0c1' }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-4 cursor-pointer" onClick={() => mode !== 'quiz' && reset()}>
            <h1 className="display text-2xl md:text-3xl" style={{ fontWeight: 600 }}>QCM&nbsp;/ QROC</h1>
            {mode !== 'home' && filename && (
              <span className="mono text-xs" style={{ color: '#5a5a5a' }}>{filename}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'home' && mode !== 'quiz' && (
              <button onClick={reset} className="btn-secondary px-3 py-1.5 text-xs">Nouveau</button>
            )}
            <button onClick={() => setShowSettings(true)} className="btn-secondary px-3 py-1.5 text-xs">
              ⚙ Réglages
            </button>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.5)' }}
             onClick={() => setShowSettings(false)}>
          <div className="bg-white p-8 max-w-lg w-full mx-4" style={{ borderRadius: 4 }} onClick={e => e.stopPropagation()}>
            <h2 className="display text-2xl mb-4" style={{ fontWeight: 600 }}>Réglages</h2>
            <p className="text-sm mb-6" style={{ color: '#5a5a5a' }}>
              La clé reste stockée localement dans ton navigateur et n'est envoyée qu'à OpenAI.
            </p>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Clé API OpenAI</label>
            <div className="flex gap-2 mb-5">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => persistKey(e.target.value)}
                placeholder="sk-..." className="input-field flex-1" />
              <button onClick={() => setShowKey(!showKey)} className="btn-secondary px-3 text-xs">
                {showKey ? 'Cacher' : 'Voir'}
              </button>
            </div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Modèle</label>
            <input type="text" value={model} onChange={e => persistModel(e.target.value)} className="input-field w-full mb-2" />
            <p className="text-xs mb-5" style={{ color: '#8a8a8a' }}>
              Suggestions : <code className="mono">gpt-5.4-mini</code> (recommandé, ~0,07 ¢/QROC) · <code className="mono">gpt-5.4-nano</code> (5× moins cher) · <code className="mono">gpt-5.5</code> (max qualité)
            </p>
            <label className="flex items-center gap-2 mb-6 cursor-pointer">
              <input type="checkbox" checked={useAI} onChange={e => persistUseAI(e.target.checked)} />
              <span className="text-sm">Utiliser l'IA pour évaluer les QROC quand la comparaison stricte échoue</span>
            </label>
            <div className="flex justify-end">
              <button onClick={() => setShowSettings(false)} className="btn-primary px-5 py-2 text-sm">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {!libsReady && !libsError && (
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs mono" style={{ color: '#8a8a8a' }}>
          Chargement des bibliothèques PDF…
        </div>
      )}
      {libsError && (
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs mono" style={{ color: '#b54125' }}>
          Erreur de chargement des bibliothèques : {libsError}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">

        {mode === 'home' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-sm border-2 border-dashed flex flex-col items-center justify-center text-center"
              style={{
                borderColor: dragOver ? '#b54125' : '#b8b09c',
                background: dragOver ? '#ece7d8' : 'transparent',
                padding: '64px 32px', minHeight: '280px',
              }}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
              <div className="display text-2xl md:text-3xl mb-2" style={{ fontWeight: 500 }}>
                {processing ? 'Extraction en cours…' : 'Dépose un PDF de cours corrigé'}
              </div>
              <div className="text-sm" style={{ color: '#5a5a5a' }}>
                {processing
                  ? `${progress.label} (${progress.current}/${progress.total})`
                  : 'Détection automatique des bonnes réponses + mode quiz interactif'}
              </div>
              {processing && progress.total > 0 && (
                <div className="w-full max-w-md mt-6 h-1" style={{ background: '#d6d0c1' }}>
                  <div className="h-full transition-all" style={{
                    background: '#b54125',
                    width: `${(progress.current / progress.total) * 100}%`,
                  }} />
                </div>
              )}
              {error && <div className="text-sm mt-4" style={{ color: '#b54125' }}>{error}</div>}
            </div>

            <div className="grid md:grid-cols-3 gap-6 mt-10">
              {[
                { t: 'Auto-correction', d: 'Détection des bonnes réponses par analyse de la couleur du texte (vert = correct).' },
                { t: 'Quiz interactif', d: 'Tu réponds, l\'app corrige immédiatement. Score, erreurs, et possibilité de revoir.' },
                { t: 'Évaluation IA', d: 'Pour les QROC, OpenAI évalue ta réponse même si elle ne matche pas exactement la référence.' },
              ].map((c, i) => (
                <div key={i} className="p-5 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                  <div className="display text-lg mb-1" style={{ fontWeight: 600 }}>{c.t}</div>
                  <div className="text-sm" style={{ color: '#5a5a5a' }}>{c.d}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'extract' && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6 pb-4 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div>
                <h2 className="display text-2xl mb-1" style={{ fontWeight: 600 }}>Vérification</h2>
                <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                  {stats.total} questions extraites · {stats.qcm} QCM · {stats.qroc} QROC
                  {(stats.badQcm + stats.badQroc) > 0 && (
                    <span style={{ color: '#b54125' }}> · {stats.badQcm + stats.badQroc} sans réponse détectée</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startQuiz(false)}
                  disabled={stats.total - stats.badQcm - stats.badQroc === 0}
                  className="btn-secondary px-4 py-2 text-sm">Quiz dans l'ordre</button>
                <button onClick={() => startQuiz(true)}
                  disabled={stats.total - stats.badQcm - stats.badQroc === 0}
                  className="btn-primary px-4 py-2 text-sm">Quiz en aléatoire →</button>
              </div>
            </div>

            <p className="text-sm mb-4" style={{ color: '#5a5a5a' }}>
              Vérifie rapidement les bonnes réponses détectées. Tu peux corriger directement en cliquant.
              Les questions <span style={{ color: '#b54125' }}>sans réponse détectée</span> sont exclues du quiz tant que tu ne les complètes pas.
            </p>

            <div className="space-y-6">
              {questions.map((q) => (
                <div key={q.id} className="p-5 border" style={{
                  borderColor: (q.hasNoCorrect || q.hasNoAnswer) ? '#b54125' : '#d6d0c1',
                  background: '#fff',
                }}>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs px-2 py-0.5" style={{
                        background: q.type === 'qcm' ? '#fce8e1' : '#ebe1f5',
                        color: q.type === 'qcm' ? '#b54125' : '#7a4fb5',
                      }}>{q.type.toUpperCase()}</span>
                      <span className="mono text-xs" style={{ color: '#8a8a8a' }}>p.{q.pageNum}</span>
                      {q.detectionError && <span className="text-xs" style={{ color: '#b54125' }}>⚠ détection couleur échouée</span>}
                    </div>
                    {(q.hasNoCorrect || q.hasNoAnswer) && (
                      <span className="text-xs" style={{ color: '#b54125' }}>⚠ aucune réponse</span>
                    )}
                  </div>

                  {q.context && (
                    <div className="mb-3 p-3 text-xs italic" style={{
                      background: '#f6f3ec', color: '#5a5a5a', borderLeft: '2px solid #b8b09c',
                    }}>{q.context}</div>
                  )}

                  <div className="text-base mb-3" style={{ whiteSpace: 'pre-wrap' }}>{q.enonce}</div>

                  {q.type === 'qcm' && (
                    <div className="space-y-2">
                      {q.options.map(o => (
                        <div key={o.letter} onClick={() => toggleCorrect(q.id, o.letter)}
                          className={`qcm-option ${o.correct ? 'correct' : ''}`}>
                          <span className="mono font-bold">{o.letter}.</span>
                          <span className="flex-1">{o.text}</span>
                          {o.correct && <span className="text-xs">✓ correcte</span>}
                        </div>
                      ))}
                      <div className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                        Clic sur une option pour corriger sa marque « bonne réponse ».
                      </div>
                    </div>
                  )}

                  {q.type === 'qroc' && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Réponse attendue</label>
                      <input type="text" value={q.expected}
                        onChange={e => setQROCAnswer(q.id, e.target.value)}
                        className="input-field w-full" placeholder="(à compléter)" />
                      {q.variants.length > 0 && (
                        <div className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                          Variantes acceptées : {q.variants.join(' · ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'quiz' && quizQuestions.length > 0 && (() => {
          const q = quizQuestions[quizIdx];
          if (!q) return null;
          const totalQuiz = quizQuestions.length;
          return (
            <>
              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                    Question {quizIdx + 1} / {totalQuiz}
                  </div>
                  <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                    <span style={{ color: '#6b9d4d' }}>✓ {quizStats.correct}</span>
                    <span className="mx-2" style={{ color: '#b54125' }}>✗ {quizStats.incorrect}</span>
                    <button onClick={() => { if (confirm('Quitter le quiz ?')) setMode('extract'); }}
                      className="ml-3 underline">Quitter</button>
                  </div>
                </div>
                <div className="h-1" style={{ background: '#d6d0c1' }}>
                  <div className="h-full" style={{
                    background: '#1a1a1a', width: `${((quizIdx + (feedback ? 1 : 0)) / totalQuiz) * 100}%`,
                    transition: 'width .3s',
                  }} />
                </div>
              </div>

              <div className="p-8 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="mono text-xs px-2 py-0.5" style={{
                    background: q.type === 'qcm' ? '#fce8e1' : '#ebe1f5',
                    color: q.type === 'qcm' ? '#b54125' : '#7a4fb5',
                  }}>{q.type.toUpperCase()}</span>
                  <span className="mono text-xs" style={{ color: '#8a8a8a' }}>p.{q.pageNum}</span>
                </div>

                {q.context && (
                  <div className="mb-5 p-4 text-sm italic" style={{
                    background: '#f6f3ec', color: '#3a3a3a', borderLeft: '3px solid #b8b09c',
                  }}>{q.context}</div>
                )}

                <div className="display text-xl mb-6" style={{ fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {q.enonce}
                </div>

                {q.type === 'qcm' && (
                  <div className="space-y-2 mb-6">
                    {q.options.map(o => {
                      const sel = (userAnswer.set || new Set()).has(o.letter);
                      let cls = 'qcm-option';
                      if (feedback) {
                        if (o.correct && sel) cls += ' correct';
                        else if (o.correct && !sel) cls += ' missed';
                        else if (!o.correct && sel) cls += ' incorrect-selected';
                      } else if (sel) cls += ' selected';
                      return (
                        <div key={o.letter} className={cls}
                          onClick={() => {
                            if (feedback) return;
                            setUserAnswer(prev => {
                              const set = new Set(prev.set || []);
                              if (set.has(o.letter)) set.delete(o.letter);
                              else set.add(o.letter);
                              return { set };
                            });
                          }}>
                          <span className="mono font-bold">{o.letter}.</span>
                          <span className="flex-1">{o.text}</span>
                          {feedback && o.correct && <span className="text-xs">✓</span>}
                          {feedback && !o.correct && sel && <span className="text-xs">✗</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === 'qroc' && (
                  <div className="mb-6">
                    <textarea
                      value={userAnswer.text || ''}
                      onChange={e => setUserAnswer({ text: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !feedback) submitAnswer();
                      }}
                      disabled={!!feedback}
                      placeholder="Ta réponse… (Ctrl/Cmd + Entrée pour valider)"
                      className="input-field w-full"
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                )}

                {feedback && (
                  <div className="p-4 mb-6" style={{
                    background: feedback.verdict === 'correct' ? '#e6f3e0'
                              : feedback.verdict === 'partiel' ? '#fff8e0'
                              : '#f8e0d6',
                    color: feedback.verdict === 'correct' ? '#2d5a1a'
                         : feedback.verdict === 'partiel' ? '#5a4a10'
                         : '#6b1f0a',
                    borderLeft: `3px solid ${feedback.verdict === 'correct' ? '#6b9d4d' : feedback.verdict === 'partiel' ? '#c4a84d' : '#b54125'}`,
                  }}>
                    <div className="flex items-baseline justify-between mb-1">
                      <strong style={{ fontSize: 14 }}>
                        {feedback.verdict === 'correct' ? '✓ Correct' : feedback.verdict === 'partiel' ? '~ Partiel' : '✗ Incorrect'}
                      </strong>
                      {typeof feedback.score === 'number' && (
                        <span className="mono text-xs">{feedback.score}/100</span>
                      )}
                    </div>
                    <div className="text-sm">{feedback.explanation}</div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  {!feedback && (
                    <button onClick={submitAnswer}
                      disabled={evaluating || (q.type === 'qcm' ? !(userAnswer.set?.size) : !(userAnswer.text || '').trim())}
                      className="btn-primary px-6 py-2.5 text-sm">
                      {evaluating ? 'Évaluation IA…' : 'Valider'}
                    </button>
                  )}
                  {feedback && (
                    <button onClick={nextQuestion} className="btn-primary px-6 py-2.5 text-sm">
                      {quizIdx + 1 >= totalQuiz ? 'Voir les résultats →' : 'Suivante →'}
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {mode === 'results' && (
          <>
            <div className="text-center py-8 mb-8 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div className="display text-5xl mb-2" style={{ fontWeight: 600 }}>
                {quizStats.correct} / {quizStats.total}
              </div>
              <div className="text-sm" style={{ color: '#5a5a5a' }}>
                {Math.round((quizStats.correct / quizStats.total) * 100)} % de bonnes réponses
              </div>
              <div className="flex justify-center gap-4 mt-4 mono text-sm">
                <span style={{ color: '#6b9d4d' }}>✓ {quizStats.correct} correctes</span>
                {quizStats.partial > 0 && <span style={{ color: '#c4a84d' }}>~ {quizStats.partial} partielles</span>}
                <span style={{ color: '#b54125' }}>✗ {quizStats.incorrect} incorrectes</span>
              </div>
              <div className="flex justify-center gap-2 mt-6">
                <button onClick={() => startQuiz(true)} className="btn-secondary px-4 py-2 text-sm">Refaire (aléatoire)</button>
                <button onClick={() => {
                  const errs = results.filter(r => r.feedback?.verdict !== 'correct').map(r => r.question);
                  if (errs.length === 0) return;
                  setQuizQuestions([...errs].sort(() => Math.random() - 0.5));
                  setQuizIdx(0); setUserAnswer({}); setFeedback(null); setResults([]);
                  setMode('quiz');
                }} disabled={quizStats.incorrect + quizStats.partial === 0}
                  className="btn-primary px-4 py-2 text-sm">Refaire les erreurs ({quizStats.incorrect + quizStats.partial})</button>
              </div>
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Détail</h3>
            <div className="space-y-3">
              {results.map((r, i) => (
                <div key={i} className="p-4 border" style={{
                  borderColor: '#d6d0c1', background: '#fff',
                  borderLeftWidth: 3,
                  borderLeftColor: r.feedback?.verdict === 'correct' ? '#6b9d4d'
                                 : r.feedback?.verdict === 'partiel' ? '#c4a84d' : '#b54125',
                }}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="mono text-xs" style={{ color: '#8a8a8a' }}>
                      {i + 1}. {r.question.type.toUpperCase()} · p.{r.question.pageNum}
                    </span>
                    <span className="text-xs">
                      {r.feedback?.verdict === 'correct' ? '✓' : r.feedback?.verdict === 'partiel' ? '~' : '✗'}
                    </span>
                  </div>
                  <div className="text-sm mb-2" style={{ whiteSpace: 'pre-wrap' }}>{r.question.enonce}</div>
                  <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><strong>Ta réponse :</strong> {r.feedback?.userValue}</div>
                    <div><strong>Attendue :</strong> {r.feedback?.expected}</div>
                  </div>
                  {r.feedback?.explanation && r.feedback.verdict !== 'correct' && (
                    <div className="text-xs mt-2 italic" style={{ color: '#5a5a5a' }}>{r.feedback.explanation}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 text-xs border-t" style={{ color: '#8a8a8a', borderColor: '#d6d0c1' }}>
        Tout tourne dans le navigateur. Ta clé OpenAI est stockée localement et n'est envoyée qu'à api.openai.com.
        Les PDF ne quittent jamais ta machine.
      </footer>
    </div>
  );
}
