import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  supabase, supabaseEnabled,
  listDecks, saveDeck, updateDeckQuestions, deleteDeck, saveApiKey,
  listEcosCases, upsertEcosCases, deleteEcosCase as deleteEcosCaseRemote,
} from './lib/supabase';
import { ECOS_CASES } from './ecosCases';
import { ECOS_BUILTIN_RAW } from './ecosBuiltInRaw';

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

// Classifie un pixel: 'white' (fond) | 'black' (texte noir/gris neutre) |
// 'green' (vert dominant) | 'other' (autre couleur)
const classifyPixel = (r, g, b) => {
  if (r > 235 && g > 235 && b > 235) return 'white';
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max - min;
  if (sat < 22) return 'black'; // gris ou noir
  if (g > r + 15 && g > b + 15) return 'green';
  return 'other';
};

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
  const [ocrMode, setOcrMode] = useState(() => localStorage.getItem('ocr_mode') || 'auto'); // 'off' | 'auto' | 'force'
  const [showKey, setShowKey] = useState(false);

  // Drop zone
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Auth + decks (Supabase)
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authIsSignup, setAuthIsSignup] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [decks, setDecks] = useState([]);
  const [currentDeckId, setCurrentDeckId] = useState(null);
  const [savingDeck, setSavingDeck] = useState(false);

  // ---------- ECOS state ----------
  const [ecosCase, setEcosCase] = useState(null); // cas sélectionné
  const [ecosMessages, setEcosMessages] = useState([]); // [{role, content}]
  const [ecosInput, setEcosInput] = useState('');
  const [ecosSending, setEcosSending] = useState(false);
  const [ecosRecording, setEcosRecording] = useState(false);
  const [ecosTranscribing, setEcosTranscribing] = useState(false);
  const [ecosEvaluating, setEcosEvaluating] = useState(false);
  const [ecosEvaluation, setEcosEvaluation] = useState(null);
  const [ecosError, setEcosError] = useState(null);
  const [ecosStartedAt, setEcosStartedAt] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const ecosScrollRef = useRef(null);

  // Timer ECOS
  const [ecosTimeLeft, setEcosTimeLeft] = useState(0); // secondes
  const [ecosTimerRunning, setEcosTimerRunning] = useState(false);
  const ecosTimerRef = useRef(null);
  const finishEcosRef = useRef(null);

  // Cas custom (importés depuis PDF, ou convertis depuis les PDF intégrés)
  const [customCases, setCustomCases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ecos_custom_cases') || '[]'); } catch { return []; }
  });
  const [ecosImportOpen, setEcosImportOpen] = useState(false);
  const [ecosImportProcessing, setEcosImportProcessing] = useState(false);
  const [ecosImportError, setEcosImportError] = useState(null);
  const [ecosImportPreview, setEcosImportPreview] = useState(null);
  const [ecosImportFilename, setEcosImportFilename] = useState('');
  const [ecosBuiltInConverting, setEcosBuiltInConverting] = useState(false);
  const [ecosBuiltInProgress, setEcosBuiltInProgress] = useState({ current: 0, total: 0 });
  const ecosImportInputRef = useRef(null);

  const persistCustomCases = (arr) => {
    setCustomCases(arr);
    try { localStorage.setItem('ecos_custom_cases', JSON.stringify(arr)); } catch {}
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.frequency.value = 660; }, 250);
      setTimeout(() => { osc.stop(); ctx.close(); }, 600);
    } catch {}
  };

  useEffect(() => {
    if (ecosScrollRef.current) ecosScrollRef.current.scrollTop = ecosScrollRef.current.scrollHeight;
  }, [ecosMessages, ecosSending]);

  // Timer tick
  useEffect(() => {
    if (!ecosTimerRunning) return;
    const id = setInterval(() => {
      setEcosTimeLeft(t => {
        if (t <= 1) {
          clearInterval(id);
          setEcosTimerRunning(false);
          playBeep();
          if (finishEcosRef.current) {
            try { finishEcosRef.current(); } catch {}
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    ecosTimerRef.current = id;
    return () => clearInterval(id);
  }, [ecosTimerRunning]);

  const startEcos = (c) => {
    setEcosCase(c);
    setEcosMessages([]);
    setEcosInput('');
    setEcosError(null);
    setEcosEvaluation(null);
    setEcosStartedAt(Date.now());
    setEcosTimeLeft((c.duree || 10) * 60);
    setEcosTimerRunning(false);
    setMode('ecos');
  };

  const sendEcosMessage = async (textOverride) => {
    const txt = (textOverride ?? ecosInput).trim();
    if (!txt || !ecosCase || ecosSending) return;
    if (!apiKey) { setEcosError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    setEcosError(null);
    const newMessages = [...ecosMessages, { role: 'user', content: txt }];
    setEcosMessages(newMessages);
    setEcosInput('');
    setEcosSending(true);
    try {
      const body = {
        model,
        messages: [
          { role: 'system', content: ecosCase.briefPatient },
          ...newMessages,
        ],
        temperature: 0.7,
      };
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '...';
      setEcosMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setEcosError(e.message);
      setEcosMessages(m => m.slice(0, -1));
      setEcosInput(txt);
    } finally {
      setEcosSending(false);
    }
  };

  const startRecording = async () => {
    if (!apiKey) { setEcosError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    setEcosError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size === 0) { setEcosError('Enregistrement vide.'); return; }
        setEcosTranscribing(true);
        try {
          const ext = (mr.mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';
          const fd = new FormData();
          fd.append('file', blob, `audio.${ext}`);
          fd.append('model', 'whisper-1');
          fd.append('language', 'fr');
          const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: fd,
          });
          if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`Whisper ${resp.status} : ${t.slice(0, 200)}`);
          }
          const data = await resp.json();
          const text = (data.text || '').trim();
          if (text) {
            setEcosInput(prev => (prev ? prev + ' ' : '') + text);
          }
        } catch (e) {
          setEcosError(e.message);
        } finally {
          setEcosTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setEcosRecording(true);
    } catch (e) {
      setEcosError('Accès micro refusé : ' + e.message);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    setEcosRecording(false);
  };

  const finishEcos = async () => {
    if (!ecosCase || ecosEvaluating) return;
    if (!apiKey) { setEcosError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    if (ecosMessages.length === 0) { setEcosError('Aucune interaction à évaluer.'); return; }
    setEcosTimerRunning(false);
    setEcosError(null);
    setEcosEvaluating(true);
    try {
      const transcript = ecosMessages.map(m => `${m.role === 'user' ? 'CANDIDAT' : 'PATIENT'}: ${m.content}`).join('\n\n');
      const grille = ecosCase.grilleCorrection.map((it, i) => `${i + 1}. [${it.section}] ${it.critere} (/${it.points})`).join('\n');
      const totalPoints = ecosCase.grilleCorrection.reduce((s, it) => s + it.points, 0);
      const body = {
        model,
        messages: [
          {
            role: 'system',
            content: `Tu es un examinateur ECOS rigoureux mais bienveillant en médecine. Tu évalues la performance d'un candidat sur un cas clinique simulé. Réponds STRICTEMENT en JSON valide avec la structure : {"items":[{"section":"...","critere":"...","pointsMax":n,"pointsObtenus":n,"commentaire":"..."},...],"feedbackGlobal":"...","pointsForts":["..."],"axesAmelioration":["..."]}. Sois juste : note 0 si critère non abordé, note partielle si abordé incomplètement, note maxi si bien fait. Total /${totalPoints}, à ramener à /20.`,
          },
          {
            role: 'user',
            content: `CAS : ${ecosCase.titre} (${ecosCase.specialite})\n\nCONSIGNE CANDIDAT :\n${ecosCase.consigneCandidat}\n\nGRILLE DE CORRECTION (total ${totalPoints} points) :\n${grille}\n\nTRANSCRIPT DE LA CONSULTATION :\n${transcript}\n\nÉvalue chaque item de la grille en justifiant brièvement, puis fournis un feedback global, points forts et axes d'amélioration.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      };
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);
      setEcosEvaluation(parsed);
      setMode('ecos-results');
    } catch (e) {
      setEcosError('Erreur évaluation : ' + e.message);
    } finally {
      setEcosEvaluating(false);
    }
  };

  // Garder une référence stable vers finishEcos pour le timer
  useEffect(() => { finishEcosRef.current = finishEcos; });

  // ----- Importer un ECOS depuis un PDF -----
  const extractPdfTextFromFile = async (file) => {
    if (!window.pdfjsLib) throw new Error('PDF.js non chargé');
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const { text } = reconstructText(tc);
      out.push(text);
    }
    return out.join('\n\n');
  };

  const convertRawToCaseViaGPT = async (rawText, sourceLabel) => {
    if (!apiKey) throw new Error('Configure ta clé API OpenAI dans les Réglages.');
    const sys = `Tu transformes une grille ECOS extraite d'un PDF (texte brut, parfois bruité) en un objet JSON STRICT conforme au format suivant, utilisé par une application de simulation médicale :
{
  "id": "string-kebab-case-unique",
  "titre": "string court",
  "specialite": "string (ex: 'Cardiologie / Urgences')",
  "duree": number (minutes, défaut 8),
  "consigneCandidat": "string markdown : contexte, mission, durée — ce que voit l'étudiant",
  "briefPatient": "string : prompt système complet pour faire incarner le patient simulé à un LLM (TUTOIE le LLM, donne-lui un dossier détaillé à révéler progressivement, interdit de jouer l'examinateur ou de donner le diagnostic)",
  "grilleCorrection": [{"section":"string","critere":"string","points":number}, ...]
}
Contraintes :
- Les points de grilleCorrection doivent totaliser EXACTEMENT 20.
- Au moins 6 items dans grilleCorrection.
- Si le PDF ne donne pas de "brief patient", invente-le de façon cohérente avec la grille.
- Renvoie UNIQUEMENT l'objet JSON, sans texte autour.`;
    const usr = `Source : ${sourceLabel}\n\nTEXTE BRUT EXTRAIT DU PDF :\n${rawText.slice(0, 18000)}`;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    // Normalise
    if (!parsed.id) parsed.id = 'ecos-imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!parsed.duree) parsed.duree = 8;
    if (!Array.isArray(parsed.grilleCorrection)) parsed.grilleCorrection = [];
    return parsed;
  };

  const handleEcosImportFile = async (f) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setEcosImportError('PDF requis.'); return; }
    if (!apiKey) { setEcosImportError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    setEcosImportError(null);
    setEcosImportPreview(null);
    setEcosImportFilename(f.name);
    setEcosImportProcessing(true);
    try {
      const txt = await extractPdfTextFromFile(f);
      const obj = await convertRawToCaseViaGPT(txt, f.name);
      obj.source = 'perso';
      setEcosImportPreview(obj);
    } catch (e) {
      setEcosImportError(e.message);
    } finally {
      setEcosImportProcessing(false);
    }
  };

  const saveImportedCase = () => {
    if (!ecosImportPreview) return;
    const next = [...customCases, ecosImportPreview];
    persistCustomCases(next);
    if (session) upsertEcosCases([ecosImportPreview]).catch(e => console.warn('upsertEcosCases', e));
    setEcosImportPreview(null);
    setEcosImportFilename('');
    setEcosImportOpen(false);
    if (ecosImportInputRef.current) ecosImportInputRef.current.value = '';
  };

  const deleteCustomCase = (id) => {
    if (!confirm('Supprimer ce cas ?')) return;
    persistCustomCases(customCases.filter(c => c.id !== id));
    if (session) deleteEcosCaseRemote(id).catch(e => console.warn('deleteEcosCase', e));
  };

  const convertBuiltInEcos = async () => {
    if (!apiKey) { setEcosImportError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    if (ecosBuiltInConverting) return;
    setEcosImportError(null);
    setEcosBuiltInConverting(true);
    const existingFlags = new Set(customCases.filter(c => c.source === 'fac').map(c => c.sourceFile));
    const todo = ECOS_BUILTIN_RAW.filter(r => !existingFlags.has(r.filename) && r.rawText && r.rawText.length > 500);
    setEcosBuiltInProgress({ current: 0, total: todo.length });
    let acc = [...customCases];
    let i = 0;
    for (const item of todo) {
      i++;
      setEcosBuiltInProgress({ current: i, total: todo.length });
      try {
        const obj = await convertRawToCaseViaGPT(item.rawText, item.filename);
        obj.source = 'fac';
        obj.sourceFile = item.filename;
        acc = [...acc, obj];
        persistCustomCases(acc);
        if (session) { try { await upsertEcosCases([obj]); } catch (e) { console.warn('upsertEcosCases', e); } }
      } catch (e) {
        console.warn('Échec conversion', item.filename, e.message);
      }
    }
    setEcosBuiltInConverting(false);
  };

  const ecosScore = useMemo(() => {
    if (!ecosEvaluation || !ecosCase) return null;
    const items = ecosEvaluation.items || [];
    const total = ecosCase.grilleCorrection.reduce((s, it) => s + it.points, 0);
    const obtenu = items.reduce((s, it) => s + (Number(it.pointsObtenus) || 0), 0);
    const sur20 = total > 0 ? Math.round((obtenu / total) * 20 * 10) / 10 : 0;
    // Regroupement par section
    const bySection = {};
    items.forEach(it => {
      const k = it.section || 'Autre';
      if (!bySection[k]) bySection[k] = { obtenu: 0, max: 0 };
      bySection[k].obtenu += Number(it.pointsObtenus) || 0;
      bySection[k].max += Number(it.pointsMax) || 0;
    });
    return { obtenu, total, sur20, bySection };
  }, [ecosEvaluation, ecosCase]);

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
        if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js');
        setLibsReady(true);
      } catch (e) { setLibsError(e.message); }
    })();
  }, []);

  // ---------- Session Supabase ----------
  useEffect(() => {
    if (!supabaseEnabled) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // À la connexion: charge la clé API depuis user metadata + la liste des decks
  useEffect(() => {
    if (!session) { setDecks([]); return; }
    // Refresh user from server pour avoir la dernière clé API (sync multi-appareils)
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata || session.user?.user_metadata || {};
      if (meta.openai_key && meta.openai_key !== apiKey) {
        setApiKey(meta.openai_key);
        try { localStorage.setItem('openai_key', meta.openai_key); } catch {}
      } else if (!meta.openai_key && apiKey) {
        // Push la cle locale vers Supabase (cas: cle saisie avant login)
        saveApiKey(apiKey).catch(e => console.warn('saveApiKey push', e));
      }
      if (meta.model && meta.model !== model) {
        setModel(meta.model);
        try { localStorage.setItem('model', meta.model); } catch {}
      }
    }).catch(e => console.warn('getUser', e));
    listDecks().then(setDecks).catch(e => console.warn('listDecks', e));
    // Synchro ECOS : fusion local <-> Supabase
    (async () => {
      try {
        const remote = await listEcosCases();
        const remoteIds = new Set(remote.map(c => c.id));
        const localOnly = customCases.filter(c => c && c.id && !remoteIds.has(c.id));
        if (localOnly.length > 0) {
          try { await upsertEcosCases(localOnly); } catch (e) { console.warn('upsertEcosCases', e); }
        }
        const byId = new Map();
        for (const c of remote) if (c && c.id) byId.set(c.id, c);
        for (const c of localOnly) byId.set(c.id, c);
        const merged = Array.from(byId.values());
        setCustomCases(merged);
        try { localStorage.setItem('ecos_custom_cases', JSON.stringify(merged)); } catch {}
      } catch (e) {
        console.warn('listEcosCases', e);
      }
    })();
  }, [session]);

  const persistKey = (k) => {
    setApiKey(k);
    try { localStorage.setItem('openai_key', k); } catch {}
    if (session) saveApiKey(k).catch(e => console.warn('saveApiKey', e));
  };
  const persistModel = (m) => {
    setModel(m);
    try { localStorage.setItem('openai_model', m); } catch {}
  };
  const persistUseAI = (v) => {
    setUseAI(v);
    try { localStorage.setItem('use_ai', String(v)); } catch {}
  };
  const persistOcrMode = (v) => {
    setOcrMode(v);
    try { localStorage.setItem('ocr_mode', v); } catch {}
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
    // Accepte: A. A) A- A: A/ A] mais aussi simple "A " en début de ligne.
    // Accepte ponctuation suivie d'un retour ligne (option qui commence sur la ligne suivante).
    const re = /(^|[\n\s\(\[])([A-Ea-e])\s*[\.\)\-:\/\]]\s*(?=\S|\n)/g;
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
    const hasQLabel = /\b(question|qcm|qroc|cas\s*clinique)\s*[n°]?\s*\d*/i.test(t);
    const markers = findOptionMarkers(t);
    const hasQMark = /\?/.test(t);
    if (markers.length >= 2) return 'qcm';
    if (markers.length === 1 && (hasQLabel || hasQMark)) return 'qcm';
    if (hasQLabel) return 'qroc';
    if (hasQMark && t.length < 400) return 'qroc';
    if (t.length > 120 && markers.length === 0) return 'context';
    return 'correction';
  };

  // ---------- Détection des bonnes réponses (couleur) ----------
  // Pour chaque ligne d'option (commençant par A/B/C/D/E), calcule la bbox de
  // la ligne, échantillonne tous les pixels colorés, et marque l'option comme
  // « correcte » si les pixels verts dominent (vs. noirs/gris du texte normal).
  const detectGreenOptions = async (page, items, lines) => {
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;

    const analyzeBox = (x0, y0, x1, y1) => {
      let textPx = 0, greenPx = 0, blackPx = 0, otherPx = 0;
      const xs = Math.max(0, Math.floor(x0));
      const xe = Math.min(W, Math.ceil(x1));
      const ys = Math.max(0, Math.floor(y0));
      const ye = Math.min(H, Math.ceil(y1));
      for (let py = ys; py < ye; py += 2) {
        for (let px = xs; px < xe; px += 2) {
          const i = (py * W + px) * 4;
          const cls = classifyPixel(img.data[i], img.data[i + 1], img.data[i + 2]);
          if (cls === 'white') continue;
          textPx++;
          if (cls === 'green') greenPx++;
          else if (cls === 'black') blackPx++;
          else otherPx++;
        }
      }
      return { textPx, greenPx, blackPx, otherPx };
    };

    const correctLetters = new Set();
    for (const line of lines) {
      const sortedLine = [...line].sort((a, b) => a.x - b.x);
      const lineText = sortedLine.map(it => it.str).join('').trim();
      const m = lineText.match(/^\s*([A-Ea-e])\s*[\.\)\-:\/]?\s+\S/);
      if (!m) continue;

      // Bounding box de la ligne en coordonnées canvas
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const it of sortedLine) {
        if (!it.str.trim()) continue;
        const [cx, cy] = viewport.convertToViewportPoint(it.x, it.y);
        const wPx = Math.max(it.w * scale, 4);
        const hPx = Math.max(it.h * scale, 8);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx + wPx);
        minY = Math.min(minY, cy - hPx);          // haut du glyphe
        maxY = Math.max(maxY, cy + hPx * 0.25);   // descender
      }
      if (minX === Infinity) continue;

      const stats = analyzeBox(minX - 2, minY - 2, maxX + 2, maxY + 2);
      if (stats.textPx < 12) continue;

      // Verte si: pixels verts en quantité absolue suffisante,
      // ET (au moins 12% des pixels colorés OU verts > noirs/2)
      const greenRatio = stats.greenPx / stats.textPx;
      const greenVsBlack = stats.blackPx === 0 ? Infinity : stats.greenPx / stats.blackPx;
      const isGreen = stats.greenPx >= 20 && (greenRatio >= 0.12 || greenVsBlack >= 0.5);
      if (isGreen) correctLetters.add(m[1].toUpperCase());
    }

    canvas.width = 0; canvas.height = 0;
    return correctLetters;
  };

  // ---------- OCR (Tesseract.js) — worker partagé, FR ----------
  const ocrWorkerRef = useRef(null);
  const getOcrWorker = async () => {
    if (ocrWorkerRef.current) return ocrWorkerRef.current;
    const w = await window.Tesseract.createWorker('fra');
    ocrWorkerRef.current = w;
    return w;
  };
  const ocrCanvas = async (canvas) => {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas);
    return (data?.text || '').trim();
  };
  // Reconstruit pseudo-items/lines à partir des mots OCR (bbox→x,y,w,h)
  const ocrToItems = (data, viewportH) => {
    const words = data?.words || [];
    const items = words.map(w => ({
      str: w.text,
      x: w.bbox.x0,
      y: viewportH - w.bbox.y1,
      w: w.bbox.x1 - w.bbox.x0,
      h: w.bbox.y1 - w.bbox.y0,
    }));
    return items;
  };

  // ---------- Rendu d'une page en image (pour affichage + extraction visuelle) ----------
  const renderPageImage = async (page, scale = 1.3) => {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.78);
    canvas.width = 0; canvas.height = 0;
    return url;
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

  // ---------- Extraction PPTX (PowerPoint) ----------
  // Pour chaque slide, retourne { pageNum, text, type, correctSet, ... }
  // compatible avec le pipeline PDF en aval. Détection « vert » lue
  // directement depuis les couleurs XML (<a:srgbClr val="..."/>),
  // donc pas de rendu canvas.
  const extractPptxPages = async (f, onProgress) => {
    if (!window.JSZip) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = res; s.onerror = () => rej(new Error('JSZip CDN failed'));
        document.head.appendChild(s);
      });
    }
    const buf = await f.arrayBuffer();
    const zip = await window.JSZip.loadAsync(buf);
    const slideNames = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
        const nb = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
        return na - nb;
      });
    const total = slideNames.length;
    const pages = [];
    for (let i = 0; i < total; i++) {
      onProgress?.({ current: i + 1, total, label: `Slide ${i + 1}/${total}` });
      const xml = await zip.files[slideNames[i]].async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const ps = doc.getElementsByTagNameNS('*', 'p');
      let allText = '';
      const greenLetters = new Set();
      for (let pi = 0; pi < ps.length; pi++) {
        const para = ps[pi];
        const runs = para.getElementsByTagNameNS('*', 'r');
        let lineText = '';
        let greenChars = 0, totalChars = 0;
        for (let ri = 0; ri < runs.length; ri++) {
          const r = runs[ri];
          const tEls = r.getElementsByTagNameNS('*', 't');
          let runText = '';
          for (let ti = 0; ti < tEls.length; ti++) runText += tEls[ti].textContent || '';
          if (!runText) continue;
          let isGreen = false;
          const rPr = r.getElementsByTagNameNS('*', 'rPr')[0];
          if (rPr) {
            const fill = rPr.getElementsByTagNameNS('*', 'solidFill')[0];
            if (fill) {
              const srgb = fill.getElementsByTagNameNS('*', 'srgbClr')[0];
              if (srgb) {
                const hex = srgb.getAttribute('val') || '';
                if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                  const r0 = parseInt(hex.slice(0, 2), 16);
                  const g0 = parseInt(hex.slice(2, 4), 16);
                  const b0 = parseInt(hex.slice(4, 6), 16);
                  if (g0 > r0 + 18 && g0 > b0 + 18 && g0 > 60) isGreen = true;
                }
              }
            }
          }
          lineText += runText;
          totalChars += runText.length;
          if (isGreen) greenChars += runText.length;
        }
        if (lineText.trim()) {
          const isLineGreen = totalChars > 0 && greenChars / totalChars > 0.4;
          const m = lineText.trim().match(/^\s*([A-Ea-e])\s*[\.\)\-:\/]?\s+\S/);
          if (isLineGreen && m) greenLetters.add(m[1].toUpperCase());
          allText += lineText + '\n';
        }
      }
      pages.push({
        pageNum: i + 1,
        text: allText,
        type: classifyPage(allText),
        correctSet: greenLetters,
        ocrUsed: false,
        detectionError: false,
        imageDataUrl: null,
      });
    }
    return pages;
  };

  const handleFile = async (f) => {
    if (!f) return;
    const isPdf = /\.pdf$/i.test(f.name);
    const isPptx = /\.pptx$/i.test(f.name);
    if (!isPdf && !isPptx) { setError('Formats supportés : PDF ou PPTX (PowerPoint).'); return; }
    if (isPdf && !libsReady) { setError('Bibliothèques en cours de chargement, réessaie.'); return; }
    setError(null);
    setQuestions([]); setPages([]); setResults([]);
    setFilename(f.name.replace(/\.(pdf|pptx)$/i, ''));
    setProcessing(true);
    setProgress({ current: 0, total: 0, label: isPptx ? 'Lecture du PPTX…' : 'Lecture du PDF…' });

    try {
      // Branche PPTX : pipeline simplifié (pas de rendu canvas)
      if (isPptx) {
        const rawPages = await extractPptxPages(f, p => setProgress(p));
        const bank = [];
        let currentContext = null;
        for (const p of rawPages) {
          if (p.type === 'context') { currentContext = p.text; continue; }
          if (p.type === 'qcm') {
            const enonce = parseQCMEnonce(p.text);
            const options = parseOptions(p.text, p.correctSet);
            if (options.length >= 2) {
              bank.push({
                id: `s${p.pageNum}`, pageNum: p.pageNum, type: 'qcm',
                context: currentContext, enonce, options,
                imageDataUrl: null, detectionError: false,
                hasNoCorrect: options.every(o => !o.correct),
              });
            }
          } else if (p.type === 'qroc') {
            const { enonce, expected, variants } = parseQROC(p.text);
            bank.push({
              id: `s${p.pageNum}`, pageNum: p.pageNum, type: 'qroc',
              context: currentContext, enonce, expected, variants,
              imageDataUrl: null, hasNoAnswer: !expected,
            });
          }
        }
        setPages(rawPages.map(({ correctSet, ...rest }) => rest));
        setQuestions(bank);
        setMode('extract');
        return;
      }

      // Branche PDF : pipeline existant
      const buf = await f.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const total = pdf.numPages;
      setProgress({ current: 0, total, label: 'Extraction du texte…' });

      const rawPages = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        let { text, items, lines } = reconstructText(tc);
        let ocrUsed = false;
        const needsOcr = ocrMode === 'force' || (ocrMode === 'auto' && text.replace(/\s/g, '').length < 25);
        if (needsOcr && window.Tesseract) {
          setProgress({ current: i, total, label: `OCR page ${i}/${total}…` });
          try {
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const worker = await getOcrWorker();
            const { data } = await worker.recognize(canvas);
            const ocrText = (data?.text || '').trim();
            if (ocrText.length > text.length) {
              text = ocrText;
              const ocrItems = ocrToItems(data, canvas.height).map(it => ({
                ...it, x: it.x / scale, y: it.y / scale, w: it.w / scale, h: it.h / scale,
              }));
              items = ocrItems;
              // Reconstruit lines via reconstructText logique simple
              ocrItems.sort((a, b) => b.y - a.y || a.x - b.x);
              const ll = []; let cur = []; let ly = null;
              for (const it of ocrItems) {
                if (ly === null || Math.abs(it.y - ly) <= 6) cur.push(it);
                else { if (cur.length) ll.push(cur); cur = [it]; }
                ly = it.y;
              }
              if (cur.length) ll.push(cur);
              lines = ll;
              ocrUsed = true;
            }
            canvas.width = 0; canvas.height = 0;
          } catch (e) { console.warn('OCR failed page', i, e); }
        }
        const type = classifyPage(text);
        rawPages.push({ pageNum: i, text, type, ocrUsed, _page: page, _items: items, _lines: lines });
        setProgress({ current: i, total, label: `Extraction texte ${i}/${total}` });
      }

      const qcmPages = rawPages.filter(p => p.type === 'qcm');
      let qcmIdx = 0;
      for (const p of qcmPages) {
        qcmIdx++;
        setProgress({ current: qcmIdx, total: qcmPages.length, label: `Détection des bonnes réponses ${qcmIdx}/${qcmPages.length}` });
        if (p.ocrUsed) { p.correctSet = new Set(); p.detectionError = true; continue; }
        try {
          p.correctSet = await detectGreenOptions(p._page, p._items, p._lines);
        } catch (e) {
          p.correctSet = new Set();
          p.detectionError = true;
        }
      }

      // Rendu d'image pour les pages QCM/QROC (affichage et schémas/figures éventuels)
      const imagedPages = rawPages.filter(p => p.type === 'qcm' || p.type === 'qroc');
      let imgIdx = 0;
      for (const p of imagedPages) {
        imgIdx++;
        setProgress({ current: imgIdx, total: imagedPages.length, label: `Rendu des images ${imgIdx}/${imagedPages.length}` });
        try { p.imageDataUrl = await renderPageImage(p._page, 1.3); }
        catch { p.imageDataUrl = null; }
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
              imageDataUrl: p.imageDataUrl,
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
            imageDataUrl: p.imageDataUrl,
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
    setQuestions(qs => {
      const next = qs.map(q => {
        if (q.id !== qId || q.type !== 'qcm') return q;
        return {
          ...q,
          options: q.options.map(o => o.letter === letter ? { ...o, correct: !o.correct } : o),
          hasNoCorrect: q.options.filter(o => o.letter === letter ? !o.correct : o.correct).length === 0,
        };
      });
      persistQuestionsRemote(next);
      return next;
    });
  };
  const setQROCAnswer = (qId, val) => {
    setQuestions(qs => {
      const next = qs.map(q => q.id === qId ? { ...q, expected: val, hasNoAnswer: !val } : q);
      persistQuestionsRemote(next);
      return next;
    });
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

  // ---------- Auth handlers ----------
  const submitAuth = async () => {
    if (!supabaseEnabled) { setAuthError('Supabase non configuré (VITE_SUPABASE_URL / _ANON_KEY).'); return; }
    setAuthBusy(true); setAuthError(null);
    try {
      const fn = authIsSignup ? supabase.auth.signUp : supabase.auth.signInWithPassword;
      const { error } = await fn.call(supabase.auth, { email: authEmail, password: authPassword });
      if (error) throw error;
      setShowAuth(false); setAuthEmail(''); setAuthPassword('');
    } catch (e) { setAuthError(e.message || String(e)); }
    finally { setAuthBusy(false); }
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentDeckId(null);
  };

  // ---------- Decks: save / load / delete ----------
  const persistQuestionsRemote = async (qs) => {
    if (!session || !currentDeckId) return;
    try { await updateDeckQuestions(currentDeckId, qs); }
    catch (e) { console.warn('updateDeckQuestions', e); }
  };

  const saveCurrentDeck = async () => {
    if (!session) { setShowAuth(true); return; }
    if (!questions.length) return;
    setSavingDeck(true);
    try {
      const name = filename || `Deck ${new Date().toLocaleDateString('fr-FR')}`;
      const deck = await saveDeck(name, questions);
      setCurrentDeckId(deck.id);
      setDecks(d => [{ id: deck.id, name, created_at: deck.created_at, questions }, ...d]);
    } catch (e) { setError('Sauvegarde impossible : ' + e.message); }
    finally { setSavingDeck(false); }
  };

  const loadDeck = (deck) => {
    setQuestions(deck.questions || []);
    setFilename(deck.name);
    setCurrentDeckId(deck.id);
    setPages([]); setResults([]); setError(null);
    setMode('extract');
  };

  const removeDeck = async (id) => {
    if (!confirm('Supprimer ce deck ?')) return;
    try {
      await deleteDeck(id);
      setDecks(d => d.filter(x => x.id !== id));
      if (currentDeckId === id) setCurrentDeckId(null);
    } catch (e) { alert('Suppression impossible : ' + e.message); }
  };

  // ---------- Favoris ----------
  const toggleFavorite = (qId) => {
    setQuestions(qs => {
      const next = qs.map(q => q.id === qId ? { ...q, favorite: !q.favorite } : q);
      persistQuestionsRemote(next);
      return next;
    });
    setQuizQuestions(qs => qs.map(q => q.id === qId ? { ...q, favorite: !q.favorite } : q));
  };

  const startFavoritesQuiz = () => {
    const allFav = decks.flatMap(d => (d.questions || []).filter(q => q.favorite).map(q => ({ ...q, _deck: d.name })));
    if (!allFav.length) { alert('Aucun favori. Étoile les questions à revoir depuis un deck.'); return; }
    const playable = allFav.filter(q => q.type === 'qcm' ? !q.hasNoCorrect : !q.hasNoAnswer);
    if (!playable.length) { alert('Aucun favori jouable (réponses manquantes).'); return; }
    setQuizQuestions([...playable].sort(() => Math.random() - 0.5));
    setQuizIdx(0); setUserAnswer({}); setFeedback(null); setResults([]);
    setMode('quiz');
  };

  const reset = () => {
    setMode('home'); setQuestions([]); setPages([]); setQuizQuestions([]);
    setQuizIdx(0); setUserAnswer({}); setFeedback(null); setResults([]);
    setFilename(''); setError(null); setCurrentDeckId(null);
    setEcosCase(null); setEcosMessages([]); setEcosInput(''); setEcosEvaluation(null); setEcosError(null);
    if (ecosRecording) { try { stopRecording(); } catch {} }
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
            {supabaseEnabled && session && (
              <button onClick={() => setMode('library')} className="btn-secondary px-3 py-1.5 text-xs">
                ★ Mes decks ({decks.length})
              </button>
            )}
            {supabaseEnabled && (session
              ? <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs" title={session.user?.email}>Déconnexion</button>
              : <button onClick={() => setShowAuth(true)} className="btn-secondary px-3 py-1.5 text-xs">Connexion</button>
            )}
            <button onClick={() => setShowSettings(true)} className="btn-secondary px-3 py-1.5 text-xs">
              ⚙ Réglages
            </button>
          </div>
        </div>
      </header>

      {/* Barre de menu — bascule entre les 3 outils */}
      <nav className="border-b" style={{ borderColor: '#d6d0c1', background: '#f6f3ec' }}>
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-0 overflow-x-auto">
          {[
            { key: 'qcm', label: 'QCM / QROC', match: m => m !== 'ecos' && m !== 'analyse' },
            { key: 'ecos', label: 'ECOS', match: m => m === 'ecos' },
            { key: 'analyse', label: 'Analyse partiels', match: m => m === 'analyse' },
          ].map(t => {
            const active = t.match(mode);
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (t.key === 'qcm') {
                    if (mode === 'ecos' || mode === 'analyse') reset();
                  } else if (t.key === 'ecos') {
                    if (mode !== 'ecos') setMode('ecos');
                  } else if (t.key === 'analyse') {
                    if (mode !== 'analyse') setMode('analyse');
                  }
                }}
                className="px-4 py-3 text-sm whitespace-nowrap"
                style={{
                  background: 'transparent',
                  color: active ? '#1a1a1a' : '#5a5a5a',
                  fontWeight: active ? 600 : 400,
                  borderBottom: `2px solid ${active ? '#b54125' : 'transparent'}`,
                  marginBottom: '-1px',
                  transition: 'all .15s',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.5)' }}
             onClick={() => setShowAuth(false)}>
          <div className="bg-white p-8 max-w-md w-full mx-4" style={{ borderRadius: 4 }} onClick={e => e.stopPropagation()}>
            <h2 className="display text-2xl mb-4" style={{ fontWeight: 600 }}>
              {authIsSignup ? 'Créer un compte' : 'Connexion'}
            </h2>
            {!supabaseEnabled && (
              <p className="text-xs mb-4" style={{ color: '#b54125' }}>
                Supabase n'est pas configuré. Définis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY puis exécute supabase-schema.sql.
              </p>
            )}
            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              placeholder="email@exemple.com" className="input-field w-full mb-3" autoFocus />
            <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAuth()}
              placeholder="Mot de passe (min. 6 caractères)" className="input-field w-full mb-3" />
            {authError && <p className="text-xs mb-3" style={{ color: '#b54125' }}>{authError}</p>}
            <div className="flex justify-between items-center">
              <button onClick={() => { setAuthIsSignup(!authIsSignup); setAuthError(null); }}
                className="text-xs underline" style={{ color: '#5a5a5a' }}>
                {authIsSignup ? '← Déjà un compte ? Connexion' : 'Pas de compte ? S\'inscrire →'}
              </button>
              <button onClick={submitAuth} disabled={authBusy || !authEmail || !authPassword}
                className="btn-primary px-5 py-2 text-sm">
                {authBusy ? '…' : (authIsSignup ? 'Créer' : 'Se connecter')}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={useAI} onChange={e => persistUseAI(e.target.checked)} />
              <span className="text-sm">Utiliser l'IA pour évaluer les QROC quand la comparaison stricte échoue</span>
            </label>

            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>OCR (Tesseract.js, FR)</label>
            <select value={ocrMode} onChange={e => persistOcrMode(e.target.value)} className="input-field w-full mb-2">
              <option value="off">Désactivé</option>
              <option value="auto">Automatique (uniquement si page sans texte — recommandé)</option>
              <option value="force">Forcer OCR sur toutes les pages (lent)</option>
            </select>
            <p className="text-xs mb-6" style={{ color: '#8a8a8a' }}>
              Utile pour les PDF scannés. La détection de la couleur verte est désactivée sur les pages OCR — il faudra cocher les bonnes réponses à la main.
            </p>
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

      <main className="max-w-7xl mx-auto px-6 py-8" style={{ display: mode === 'analyse' ? 'none' : '' }}>

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
              <input ref={fileInputRef} type="file"
                accept=".pdf,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
              <div className="display text-2xl md:text-3xl mb-2" style={{ fontWeight: 500 }}>
                {processing ? 'Extraction en cours…' : 'Dépose un PDF ou PPTX de cours corrigé'}
              </div>
              <div className="text-sm" style={{ color: '#5a5a5a' }}>
                {processing
                  ? `${progress.label} (${progress.current}/${progress.total})`
                  : 'Détection automatique des bonnes réponses (texte vert) + mode quiz interactif'}
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

            {supabaseEnabled && session && decks.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3 items-center">
                <button onClick={() => setMode('library')} className="btn-secondary px-4 py-2 text-sm">
                  Ouvrir un deck sauvegardé ({decks.length})
                </button>
                <button onClick={startFavoritesQuiz} className="btn-primary px-4 py-2 text-sm">
                  ★ Quiz sur mes favoris ({decks.reduce((n, d) => n + (d.questions || []).filter(q => q.favorite).length, 0)})
                </button>
              </div>
            )}

            <div
              onClick={() => setMode('ecos')}
              className="cursor-pointer mt-6 p-6 border flex items-center justify-between gap-6"
              style={{ borderColor: '#1a1a1a', background: '#fff' }}
            >
              <div>
                <div className="display text-2xl mb-1" style={{ fontWeight: 600 }}>ECOS — Entraînement</div>
                <div className="text-sm" style={{ color: '#5a5a5a' }}>
                  Examen Clinique Objectif Structuré : patient simulé par IA, dictée vocale, notation détaillée /20.
                </div>
              </div>
              <div className="mono text-sm" style={{ color: '#b54125' }}>→</div>
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

        {mode === 'ecos' && !ecosCase && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6 pb-4 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div>
                <h2 className="display text-2xl mb-1" style={{ fontWeight: 600 }}>ECOS — Choix du cas</h2>
                <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                  Sélectionne un cas clinique. Tu joues le médecin, l'IA joue le patient.
                </div>
              </div>
              <button onClick={() => setMode('home')} className="btn-secondary px-3 py-1.5 text-xs">← Retour</button>
            </div>

            {!apiKey && (
              <div className="p-4 mb-4 text-sm" style={{ background: '#fff8e0', borderLeft: '3px solid #c4a84d', color: '#5a4a10' }}>
                Aucune clé OpenAI configurée. Ouvre les <button onClick={() => setShowSettings(true)} className="underline">Réglages</button> pour la renseigner avant de démarrer un ECOS.
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => { setEcosImportOpen(v => !v); setEcosImportError(null); }}
                className="btn-secondary px-3 py-1.5 text-xs">
                {ecosImportOpen ? 'Fermer l\'import' : '+ Importer un ECOS (PDF)'}
              </button>
              <button onClick={convertBuiltInEcos} disabled={ecosBuiltInConverting || !apiKey}
                className="btn-secondary px-3 py-1.5 text-xs">
                {ecosBuiltInConverting
                  ? `Conversion ${ecosBuiltInProgress.current}/${ecosBuiltInProgress.total}…`
                  : `Convertir les ${ECOS_BUILTIN_RAW.length} ECOS intégrés (Fac)`}
              </button>
            </div>

            {ecosImportOpen && (
              <div className="p-4 mb-4 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Importer un ECOS depuis un PDF</div>
                <input
                  ref={ecosImportInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleEcosImportFile(e.target.files?.[0])}
                  disabled={ecosImportProcessing}
                  className="text-sm"
                />
                {ecosImportFilename && <div className="mono text-xs mt-2" style={{ color: '#5a5a5a' }}>Fichier : {ecosImportFilename}</div>}
                {ecosImportProcessing && <div className="text-xs mt-2 mono" style={{ color: '#5a5a5a' }}>Extraction + génération via GPT…</div>}
                {ecosImportError && <div className="text-xs mt-2" style={{ color: '#b54125' }}>{ecosImportError}</div>}
                {ecosImportPreview && (
                  <div className="mt-3 p-3" style={{ background: '#f6f3ec' }}>
                    <div className="display text-base mb-1" style={{ fontWeight: 600 }}>{ecosImportPreview.titre}</div>
                    <div className="mono text-xs mb-2" style={{ color: '#b54125' }}>{ecosImportPreview.specialite} · {ecosImportPreview.duree} min</div>
                    <div className="text-xs mb-2" style={{ color: '#5a5a5a' }}>
                      Grille : {ecosImportPreview.grilleCorrection.length} items · {ecosImportPreview.grilleCorrection.reduce((s, it) => s + (Number(it.points) || 0), 0)} pts
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer">Aperçu consigne candidat</summary>
                      <div className="mt-2 whitespace-pre-wrap" style={{ color: '#3a3a3a' }}>{ecosImportPreview.consigneCandidat}</div>
                    </details>
                    <div className="mt-3 flex gap-2">
                      <button onClick={saveImportedCase} className="btn-primary px-3 py-1.5 text-xs">Enregistrer dans ma banque</button>
                      <button onClick={() => setEcosImportPreview(null)} className="btn-secondary px-3 py-1.5 text-xs">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {ECOS_CASES.map(c => (
                <div key={c.id} className="p-5 border cursor-pointer" style={{ borderColor: '#d6d0c1', background: '#fff' }}
                  onClick={() => startEcos(c)}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="display text-lg" style={{ fontWeight: 600 }}>{c.titre}</div>
                    <div className="mono text-xs" style={{ color: '#8a8a8a' }}>{c.duree} min</div>
                  </div>
                  <div className="mono text-xs mb-3" style={{ color: '#b54125' }}>{c.specialite}</div>
                  <div className="text-xs" style={{ color: '#5a5a5a' }}>
                    Grille : {c.grilleCorrection.length} items · {c.grilleCorrection.reduce((s, it) => s + it.points, 0)} pts
                  </div>
                </div>
              ))}
              {customCases.map(c => (
                <div key={c.id} className="p-5 border relative" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                  <div onClick={() => startEcos(c)} className="cursor-pointer">
                    <div className="flex items-baseline justify-between mb-2 gap-2">
                      <div className="display text-lg" style={{ fontWeight: 600 }}>{c.titre}</div>
                      <div className="mono text-xs" style={{ color: '#8a8a8a' }}>{c.duree} min</div>
                    </div>
                    <div className="mono text-xs mb-3" style={{ color: '#b54125' }}>{c.specialite}</div>
                    <div className="text-xs mb-2" style={{ color: '#5a5a5a' }}>
                      Grille : {(c.grilleCorrection || []).length} items · {(c.grilleCorrection || []).reduce((s, it) => s + (Number(it.points) || 0), 0)} pts
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="mono text-[10px] px-2 py-0.5" style={{
                      background: c.source === 'fac' ? '#e7eede' : '#fff0d6',
                      color: c.source === 'fac' ? '#3a5a20' : '#7a5210',
                      border: '1px solid ' + (c.source === 'fac' ? '#b8c8a0' : '#dfc88a'),
                    }}>{c.source === 'fac' ? 'Fac' : 'Perso'}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteCustomCase(c.id); }}
                      className="text-xs underline" style={{ color: '#b54125' }}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'ecos' && ecosCase && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4 pb-4 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div>
                <h2 className="display text-2xl mb-1" style={{ fontWeight: 600 }}>{ecosCase.titre}</h2>
                <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                  {ecosCase.specialite} · {ecosCase.duree} min
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {(() => {
                  const mm = String(Math.floor(ecosTimeLeft / 60)).padStart(2, '0');
                  const ss = String(ecosTimeLeft % 60).padStart(2, '0');
                  let color = '#1a1a1a';
                  if (ecosTimeLeft <= 30) color = '#b54125';
                  else if (ecosTimeLeft <= 120) color = '#d97706';
                  return (
                    <div className="flex items-center gap-2">
                      <div className="mono text-xl px-3 py-1" style={{
                        color, fontWeight: 600,
                        background: '#fff', border: '1px solid #d6d0c1',
                        minWidth: 90, textAlign: 'center',
                      }}>{mm}:{ss}</div>
                      <button
                        onClick={() => setEcosTimerRunning(r => !r)}
                        disabled={ecosTimeLeft === 0 || ecosEvaluating}
                        className="btn-secondary px-3 py-1.5 text-xs">
                        {ecosTimerRunning ? '⏸ Pause' : (ecosTimeLeft === (ecosCase.duree || 10) * 60 ? '▶ Démarrer' : '▶ Reprendre')}
                      </button>
                    </div>
                  );
                })()}
                <button onClick={() => { if (confirm('Abandonner cet ECOS ?')) { setEcosTimerRunning(false); setEcosCase(null); setEcosMessages([]); } }}
                  className="btn-secondary px-3 py-1.5 text-xs">Abandonner</button>
                <button onClick={finishEcos} disabled={ecosEvaluating || ecosMessages.length === 0}
                  className="btn-primary px-4 py-1.5 text-xs">
                  {ecosEvaluating ? 'Évaluation…' : 'Terminer l\'ECOS →'}
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-1 p-5 border self-start" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Consigne candidat</div>
                <div className="text-sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ecosCase.consigneCandidat}</div>
              </div>

              <div className="md:col-span-2 border flex flex-col" style={{ borderColor: '#d6d0c1', background: '#fff', minHeight: '60vh' }}>
                <div ref={ecosScrollRef} className="flex-1 overflow-y-auto scrollbar p-4 space-y-3" style={{ maxHeight: '60vh' }}>
                  {ecosMessages.length === 0 && (
                    <div className="text-sm italic" style={{ color: '#8a8a8a' }}>
                      Le patient attend. Commence ton interrogatoire (présentation, motif, anamnèse…).
                    </div>
                  )}
                  {ecosMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[85%] p-3 text-sm" style={{
                        background: m.role === 'user' ? '#1a1a1a' : '#f6f3ec',
                        color: m.role === 'user' ? '#f6f3ec' : '#1a1a1a',
                        borderRadius: 4, whiteSpace: 'pre-wrap',
                      }}>
                        <div className="mono text-xs mb-1" style={{ opacity: 0.6 }}>
                          {m.role === 'user' ? 'Vous (médecin)' : 'Patient'}
                        </div>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {ecosSending && (
                    <div className="flex justify-start">
                      <div className="p-3 text-sm italic" style={{ background: '#f6f3ec', color: '#8a8a8a', borderRadius: 4 }}>
                        Le patient réfléchit…
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t p-3" style={{ borderColor: '#d6d0c1' }}>
                  {ecosError && (
                    <div className="text-xs mb-2" style={{ color: '#b54125' }}>{ecosError}</div>
                  )}
                  {ecosTranscribing && (
                    <div className="text-xs mb-2 mono" style={{ color: '#5a5a5a' }}>Transcription en cours…</div>
                  )}
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={ecosInput}
                      onChange={e => setEcosInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendEcosMessage();
                        }
                      }}
                      placeholder={ecosRecording ? 'Enregistrement…' : 'Pose ta question au patient (Entrée pour envoyer, Maj+Entrée = retour à la ligne)'}
                      rows={2}
                      className="input-field flex-1"
                      disabled={ecosSending || ecosRecording}
                      style={{ resize: 'vertical' }}
                    />
                    <div className="flex flex-col gap-2">
                      {!ecosRecording ? (
                        <button onClick={startRecording} disabled={ecosSending || ecosTranscribing}
                          title="Dicter (Whisper)"
                          className="btn-secondary px-3 py-2 text-sm">🎤</button>
                      ) : (
                        <button onClick={stopRecording}
                          className="px-3 py-2 text-sm" style={{ background: '#b54125', color: '#fff', border: '1px solid #b54125' }}>
                          ■ Stop
                        </button>
                      )}
                      <button onClick={() => sendEcosMessage()}
                        disabled={!ecosInput.trim() || ecosSending || ecosRecording}
                        className="btn-primary px-3 py-2 text-sm">Envoyer</button>
                    </div>
                  </div>
                  {ecosRecording && (
                    <div className="text-xs mt-2 mono flex items-center gap-2" style={{ color: '#b54125' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#b54125' }} />
                      Enregistrement en cours…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'ecos-results' && ecosCase && ecosEvaluation && ecosScore && (
          <>
            <div className="text-center py-8 mb-8 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div className="mono text-xs mb-2" style={{ color: '#8a8a8a' }}>
                {ecosCase.titre} · {ecosCase.specialite}
              </div>
              <div className="display text-5xl mb-2" style={{ fontWeight: 600 }}>
                {ecosScore.sur20} / 20
              </div>
              <div className="text-sm" style={{ color: '#5a5a5a' }}>
                {ecosScore.obtenu} / {ecosScore.total} points · {Math.round((ecosScore.obtenu / ecosScore.total) * 100)} %
              </div>
              <div className="flex justify-center gap-2 mt-6">
                <button onClick={() => { setEcosCase(null); setEcosEvaluation(null); setEcosMessages([]); setMode('ecos'); }}
                  className="btn-secondary px-4 py-2 text-sm">Autre cas</button>
                <button onClick={() => startEcos(ecosCase)} className="btn-primary px-4 py-2 text-sm">Refaire ce cas</button>
              </div>
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Score par section</h3>
            <div className="space-y-3 mb-8">
              {Object.entries(ecosScore.bySection).map(([section, s]) => {
                const pct = s.max > 0 ? (s.obtenu / s.max) * 100 : 0;
                return (
                  <div key={section}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{section}</span>
                      <span className="mono text-xs" style={{ color: '#5a5a5a' }}>{s.obtenu} / {s.max}</span>
                    </div>
                    <div className="h-2" style={{ background: '#d6d0c1' }}>
                      <div className="h-full" style={{
                        width: `${pct}%`,
                        background: pct >= 75 ? '#6b9d4d' : pct >= 50 ? '#c4a84d' : '#b54125',
                        transition: 'width .3s',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {ecosEvaluation.feedbackGlobal && (
              <div className="p-4 mb-6" style={{ background: '#fff', borderLeft: '3px solid #1a1a1a' }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Feedback global</div>
                <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{ecosEvaluation.feedbackGlobal}</div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {Array.isArray(ecosEvaluation.pointsForts) && ecosEvaluation.pointsForts.length > 0 && (
                <div className="p-4" style={{ background: '#e6f3e0', borderLeft: '3px solid #6b9d4d' }}>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#2d5a1a' }}>Points forts</div>
                  <ul className="text-sm space-y-1" style={{ color: '#2d5a1a' }}>
                    {ecosEvaluation.pointsForts.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(ecosEvaluation.axesAmelioration) && ecosEvaluation.axesAmelioration.length > 0 && (
                <div className="p-4" style={{ background: '#f8e0d6', borderLeft: '3px solid #b54125' }}>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6b1f0a' }}>Axes d'amélioration</div>
                  <ul className="text-sm space-y-1" style={{ color: '#6b1f0a' }}>
                    {ecosEvaluation.axesAmelioration.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Détail item par item</h3>
            <div className="space-y-2 mb-8">
              {(ecosEvaluation.items || []).map((it, i) => {
                const max = Number(it.pointsMax) || 0;
                const obt = Number(it.pointsObtenus) || 0;
                const ratio = max > 0 ? obt / max : 0;
                const color = ratio >= 0.75 ? '#6b9d4d' : ratio >= 0.5 ? '#c4a84d' : '#b54125';
                return (
                  <div key={i} className="p-3 border" style={{ borderColor: '#d6d0c1', background: '#fff', borderLeftWidth: 3, borderLeftColor: color }}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm"><strong>{it.section}</strong> — {it.critere}</span>
                      <span className="mono text-xs" style={{ color: '#5a5a5a' }}>{obt} / {max}</span>
                    </div>
                    {it.commentaire && <div className="text-xs italic" style={{ color: '#5a5a5a' }}>{it.commentaire}</div>}
                  </div>
                );
              })}
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Transcript</h3>
            <div className="space-y-2 mb-8">
              {ecosMessages.map((m, i) => (
                <div key={i} className="p-3 text-sm" style={{
                  background: m.role === 'user' ? '#fff' : '#f6f3ec',
                  borderLeft: `3px solid ${m.role === 'user' ? '#1a1a1a' : '#b8b09c'}`,
                  whiteSpace: 'pre-wrap',
                }}>
                  <div className="mono text-xs mb-1" style={{ color: '#8a8a8a' }}>
                    {m.role === 'user' ? 'Candidat' : 'Patient'}
                  </div>
                  {m.content}
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'library' && (
          <>
            <div className="flex items-baseline justify-between mb-6 pb-4 border-b" style={{ borderColor: '#d6d0c1' }}>
              <h2 className="display text-2xl" style={{ fontWeight: 600 }}>Mes decks</h2>
              <button onClick={startFavoritesQuiz} className="btn-primary px-4 py-2 text-sm">
                ★ Quiz sur tous mes favoris
              </button>
            </div>
            {decks.length === 0 && (
              <p className="text-sm" style={{ color: '#5a5a5a' }}>Aucun deck. Importe un PDF puis clique « Sauvegarder ce deck ».</p>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {decks.map(d => {
                const qs = d.questions || [];
                const favCount = qs.filter(q => q.favorite).length;
                return (
                  <div key={d.id} className="p-4 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="display text-lg" style={{ fontWeight: 600 }}>{d.name}</div>
                      <span className="mono text-xs" style={{ color: '#8a8a8a' }}>
                        {new Date(d.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <div className="text-xs mb-3" style={{ color: '#5a5a5a' }}>
                      {qs.length} questions · {qs.filter(q => q.type === 'qcm').length} QCM · {qs.filter(q => q.type === 'qroc').length} QROC
                      {favCount > 0 && <span style={{ color: '#c4a84d' }}> · ★ {favCount}</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => loadDeck(d)} className="btn-primary px-3 py-1.5 text-xs">Ouvrir</button>
                      <button onClick={() => removeDeck(d.id)} className="btn-secondary px-3 py-1.5 text-xs">Supprimer</button>
                    </div>
                  </div>
                );
              })}
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
              <div className="flex gap-2 flex-wrap">
                {supabaseEnabled && !currentDeckId && (
                  <button onClick={saveCurrentDeck} disabled={savingDeck || !questions.length}
                    className="btn-secondary px-4 py-2 text-sm">
                    {savingDeck ? 'Sauvegarde…' : (session ? '💾 Sauvegarder ce deck' : '💾 Sauvegarder (connexion)')}
                  </button>
                )}
                {currentDeckId && (
                  <span className="mono text-xs self-center" style={{ color: '#6b9d4d' }}>● Deck synchronisé</span>
                )}
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
                    <div className="flex items-center gap-2">
                      {(q.hasNoCorrect || q.hasNoAnswer) && (
                        <span className="text-xs" style={{ color: '#b54125' }}>⚠ aucune réponse</span>
                      )}
                      <button onClick={() => toggleFavorite(q.id)} className="text-base" title="Marquer comme favori">
                        <span style={{ color: q.favorite ? '#c4a84d' : '#cfc7b4' }}>{q.favorite ? '★' : '☆'}</span>
                      </button>
                    </div>
                  </div>

                  {q.context && (
                    <div className="mb-3 p-3 text-xs italic" style={{
                      background: '#f6f3ec', color: '#5a5a5a', borderLeft: '2px solid #b8b09c',
                    }}>{q.context}</div>
                  )}

                  <div className="text-base mb-3" style={{ whiteSpace: 'pre-wrap' }}>{q.enonce}</div>

                  {q.imageDataUrl && (
                    <details className="mb-3">
                      <summary className="text-xs cursor-pointer mono" style={{ color: '#8a8a8a' }}>
                        Voir la page d'origine (figures, schémas)
                      </summary>
                      <img src={q.imageDataUrl} alt={`Page ${q.pageNum}`}
                        className="mt-2 max-w-full border" style={{ borderColor: '#d6d0c1' }} />
                    </details>
                  )}

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
                  <button onClick={() => toggleFavorite(q.id)} className="ml-auto text-lg" title="Favori">
                    <span style={{ color: q.favorite ? '#c4a84d' : '#cfc7b4' }}>{q.favorite ? '★' : '☆'}</span>
                  </button>
                </div>

                {q.context && (
                  <div className="mb-5 p-4 text-sm italic" style={{
                    background: '#f6f3ec', color: '#3a3a3a', borderLeft: '3px solid #b8b09c',
                  }}>{q.context}</div>
                )}

                <div className="display text-xl mb-6" style={{ fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {q.enonce}
                </div>

                {q.imageDataUrl && (
                  <details className="mb-5">
                    <summary className="text-xs cursor-pointer mono" style={{ color: '#8a8a8a' }}>
                      Voir la page d'origine (figures, schémas)
                    </summary>
                    <img src={q.imageDataUrl} alt={`Page ${q.pageNum}`}
                      className="mt-2 max-w-full border" style={{ borderColor: '#d6d0c1' }} />
                  </details>
                )}

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

      {mode === 'analyse' && (
        <iframe
          src="/analyse-partiels.html"
          title="Analyse des partiels"
          style={{
            width: '100%',
            height: 'calc(100vh - 130px)',
            border: 'none',
            background: '#F5F0E8',
            display: 'block',
          }}
        />
      )}

      {mode !== 'analyse' && (
        <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 text-xs border-t" style={{ color: '#8a8a8a', borderColor: '#d6d0c1' }}>
          Tout tourne dans le navigateur. Ta clé OpenAI est stockée localement et n'est envoyée qu'à api.openai.com.
          Les PDF ne quittent jamais ta machine.
        </footer>
      )}
    </div>
  );
}
