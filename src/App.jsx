import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  supabase, supabaseEnabled,
  listDecks, saveDeck, updateDeckQuestions, deleteDeck, saveApiKey,
  listEcosCases, upsertEcosCases, deleteEcosCase as deleteEcosCaseRemote,
  listEcosAttempts, upsertEcosAttempt,
  uploadEntretien, listEntretiens, updateEntretien, deleteEntretien,
  purgeExpiredEntretiens, downloadEntretienBlob,
} from './lib/supabase';
import { ECOS_CASES } from './ecosCases';
import { ECOS_BUILTIN_RAW } from './ecosBuiltInRaw';

// ============================================================
//  EXTRACTEUR & QUIZ DE QCM/QROC â€” V2
//  - Charge un PDF de cours corrigÃ©
//  - DÃ©tecte automatiquement les bonnes rÃ©ponses (couleur verte)
//  - Mode quiz interactif avec correction
//  - Ã‰valuation IA (OpenAI) pour les QROC
// ============================================================

// ---------- SVG Icons (Lucide stripped) ----------
const Icon = ({ children, size = 16, stroke = 1.75, ...props }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    aria-hidden="true"
    {...props}
  >{children}</svg>
);
const IconCog = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>;
const IconSave = (p) => <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></Icon>;
const IconMic = (p) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></Icon>;
const IconPlay = (p) => <Icon {...p}><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></Icon>;
const IconPause = (p) => <Icon {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></Icon>;
const IconStop = (p) => <Icon {...p}><rect x="5" y="5" width="14" height="14" fill="currentColor" stroke="none"/></Icon>;
const IconStar = ({ filled, ...p }) => <Icon {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={filled ? 'currentColor' : 'none'}/></Icon>;
const IconSend = (p) => <Icon {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Icon>;
const IconArrowRight = (p) => <Icon {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Icon>;
const IconCheck = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>;
const IconX = (p) => <Icon {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>;
const IconPlus = (p) => <Icon {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
const IconEye = (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Icon>;
const IconEyeOff = (p) => <Icon {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></Icon>;
const IconArrowLeft = (p) => <Icon {...p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></Icon>;
const IconWarning = (p) => <Icon {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>;

// ---------- TabBar avec indicateur slide ----------
const TabBar = ({ tabs, activeKey, onSelect }) => {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [bar, setBar] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const el = btnRefs.current[activeKey];
    const container = containerRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setBar({
      left: elRect.left - containerRect.left + container.scrollLeft,
      width: elRect.width,
      ready: true,
    });
  }, [activeKey, tabs.length]);

  return (
    <div ref={containerRef} className="tab-bar max-w-7xl mx-auto px-6 overflow-x-auto" style={{ position: 'relative' }}>
      {tabs.map(t => (
        <button
          key={t.key}
          ref={el => { btnRefs.current[t.key] = el; }}
          onClick={() => onSelect(t.key)}
          className={`tab-btn ${t.key === activeKey ? 'tab-btn--active' : ''}`}
        >
          {t.label}
        </button>
      ))}
      <span
        className="tab-indicator"
        style={{
          left: bar.left,
          width: bar.width,
          opacity: bar.ready ? 1 : 0,
        }}
      />
    </div>
  );
};

// ---------- Confetti (discret, pour les quiz parfaits) ----------
const Confetti = ({ count = 36 }) => {
  const pieces = useMemo(() => {
    const colors = ['#b54125', '#c4a84d', '#6b9d4d', '#1a1a1a', '#7a4fb5'];
    return Array.from({ length: count }).map((_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 350,
      duration: 1800 + Math.random() * 1400,
      color: colors[i % colors.length],
      rot: Math.random() * 360,
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 10,
    }));
  }, [count]);
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 60 }}>
      {pieces.map(p => (
        <span
          key={p.key}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.width,
            height: p.height,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
          }}
        />
      ))}
    </div>
  );
};

// ---------- Helpers ----------
const normalize = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[Ì€-Í¯]/g, '')
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

const cleanMarkdownNoise = (s = '') => s
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/^\s*[-*]\s+/gm, 'â€¢ ')
  .replace(/`{1,3}/g, '')
  .replace(/\*\*/g, '');

const ECOS_ATTEMPTS_LOCAL_KEY = 'ecos_attempts_local';

const readLocalEcosAttempts = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(ECOS_ATTEMPTS_LOCAL_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writeLocalEcosAttempts = (attempts) => {
  try { localStorage.setItem(ECOS_ATTEMPTS_LOCAL_KEY, JSON.stringify(attempts || [])); } catch {}
};

const attemptTimestamp = (attempt) => (
  attempt?.updated_at ||
  attempt?.data?.savedAt ||
  attempt?.data?.finishedAt ||
  attempt?.data?.startedAt ||
  ''
);

const mergeEcosAttempts = (...lists) => {
  const byCase = new Map();
  for (const list of lists) {
    for (const attempt of (list || [])) {
      if (!attempt?.case_id) continue;
      const current = byCase.get(attempt.case_id);
      if (!current || attemptTimestamp(attempt) >= attemptTimestamp(current)) {
        byCase.set(attempt.case_id, attempt);
      }
    }
  }
  return Array.from(byCase.values()).sort((a, b) => attemptTimestamp(b).localeCompare(attemptTimestamp(a)));
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

  // Settings â€” restaure depuis localStorage Ã  l'init (synchrone)
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
  const [ecosCase, setEcosCase] = useState(null); // cas sÃ©lectionnÃ©
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

  // Cas custom (importÃ©s depuis PDF, ou convertis depuis les PDF intÃ©grÃ©s)
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
  const [ecosAttempts, setEcosAttempts] = useState(() => readLocalEcosAttempts());
  const [ecosSaveState, setEcosSaveState] = useState('');
  const [ecosCategory, setEcosCategory] = useState('all');
  const ecosImportInputRef = useRef(null);

  // ---------- Entretien (Ã©coute + restitution IA) ----------
  const [entStep, setEntStep] = useState('idle'); // 'idle' | 'have-audio' | 'transcribing' | 'transcribed' | 'generating' | 'done'
  const [entRecording, setEntRecording] = useState(false);
  const [entRecMs, setEntRecMs] = useState(0);
  const [entAudioBlob, setEntAudioBlob] = useState(null);
  const [entAudioUrl, setEntAudioUrl] = useState(null);
  const [entAudioName, setEntAudioName] = useState('');
  const [entTranscript, setEntTranscript] = useState('');
  const [entNote, setEntNote] = useState('');
  const [entError, setEntError] = useState(null);
  const [entContext, setEntContext] = useState(''); // contexte optionnel saisi par l'Ã©tudiant
  const [entProgress, setEntProgress] = useState({ current: 0, total: 0 });
  const [entRecordId, setEntRecordId] = useState(null); // id de la ligne entretiens en cours
  const [entHistory, setEntHistory] = useState([]); // historique 24h
  const [entHistoryLoading, setEntHistoryLoading] = useState(false);
  const [entUploading, setEntUploading] = useState(false);
  const entMRRef = useRef(null);
  const entChunksRef = useRef([]);
  const entStreamRef = useRef(null);
  const entTimerRef = useRef(null);
  const entFileInputRef = useRef(null);

  // Tick durÃ©e enregistrement
  useEffect(() => {
    if (!entRecording) return;
    const start = Date.now() - entRecMs;
    const id = setInterval(() => setEntRecMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [entRecording]);

  // Auto-stop Ã  30 min
  useEffect(() => {
    if (entRecording && entRecMs >= 30 * 60 * 1000) {
      stopEntRecording();
    }
  }, [entRecMs, entRecording]);

  const fmtMs = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const resetEntretien = () => {
    if (entAudioUrl) { try { URL.revokeObjectURL(entAudioUrl); } catch {} }
    setEntStep('idle');
    setEntRecording(false);
    setEntRecMs(0);
    setEntAudioBlob(null);
    setEntAudioUrl(null);
    setEntAudioName('');
    setEntTranscript('');
    setEntNote('');
    setEntError(null);
    setEntProgress({ current: 0, total: 0 });
    setEntRecordId(null);
    setEntContext('');
    entChunksRef.current = [];
  };

  // Upload Supabase d'un blob audio (auto si connectÃ©)
  const uploadEntretienToSupabase = async (blob, filename, durationMs) => {
    if (!supabaseEnabled || !session) return null;
    setEntUploading(true);
    try {
      const row = await uploadEntretien({ blob, filename, durationMs });
      setEntRecordId(row.id);
      // recharge la liste
      try { setEntHistory(await listEntretiens()); } catch {}
      return row;
    } catch (e) {
      setEntError('Stockage Supabase : ' + e.message);
      return null;
    } finally {
      setEntUploading(false);
    }
  };

  const refreshEntHistory = async () => {
    if (!supabaseEnabled || !session) { setEntHistory([]); return; }
    setEntHistoryLoading(true);
    try {
      try { await purgeExpiredEntretiens(); } catch (e) { console.warn('purge', e); }
      const rows = await listEntretiens();
      setEntHistory(rows);
    } catch (e) {
      console.warn('listEntretiens', e);
    } finally {
      setEntHistoryLoading(false);
    }
  };

  // Charge l'historique quand on entre dans l'onglet Entretien (et qu'on est connectÃ©)
  useEffect(() => {
    if (mode === 'entretien' && supabaseEnabled && session) {
      refreshEntHistory();
    }
  }, [mode, session]);

  const restoreEntretien = async (row) => {
    setEntError(null);
    try {
      if (entAudioUrl) { try { URL.revokeObjectURL(entAudioUrl); } catch {} }
      const blob = await downloadEntretienBlob(row.storage_path);
      const url = URL.createObjectURL(blob);
      setEntAudioBlob(blob);
      setEntAudioUrl(url);
      setEntAudioName(row.filename || 'audio.webm');
      setEntTranscript(row.transcript || '');
      setEntNote(row.note || '');
      setEntContext(row.context || '');
      setEntRecordId(row.id);
      setEntStep(row.note ? 'done' : (row.transcript ? 'transcribed' : 'have-audio'));
    } catch (e) {
      setEntError('Restauration : ' + e.message);
    }
  };

  const deleteEntretienRow = async (row) => {
    try {
      await deleteEntretien(row.id, row.storage_path);
      setEntHistory(h => h.filter(r => r.id !== row.id));
      if (entRecordId === row.id) resetEntretien();
    } catch (e) {
      setEntError('Suppression : ' + e.message);
    }
  };

  const startEntRecording = async () => {
    setEntError(null);
    if (entAudioUrl) { try { URL.revokeObjectURL(entAudioUrl); } catch {} }
    setEntAudioBlob(null);
    setEntAudioUrl(null);
    setEntAudioName('');
    setEntTranscript('');
    setEntNote('');
    setEntRecMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      entStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream);
      entChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) entChunksRef.current.push(e.data); };
      mr.onstop = () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        entStreamRef.current = null;
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(entChunksRef.current, { type });
        if (blob.size === 0) { setEntError('Enregistrement vide.'); setEntRecording(false); return; }
        const url = URL.createObjectURL(blob);
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const fname = `enregistrement.${ext}`;
        setEntAudioBlob(blob);
        setEntAudioUrl(url);
        setEntAudioName(fname);
        setEntStep('have-audio');
        setEntRecording(false);
        // auto-upload Supabase si connectÃ©
        uploadEntretienToSupabase(blob, fname, entRecMs);
      };
      entMRRef.current = mr;
      mr.start();
      setEntRecording(true);
    } catch (e) {
      setEntError('AccÃ¨s micro refusÃ© : ' + e.message);
    }
  };

  const stopEntRecording = () => {
    const mr = entMRRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
  };

  const onEntFilePicked = (file) => {
    if (!file) return;
    setEntError(null);
    const MAX = 100 * 1024 * 1024; // 100 MB hard cap (sera chunkÃ© pour Whisper)
    if (file.size > MAX) {
      setEntError('Fichier trop gros (>100 Mo). Compresse-le ou dÃ©coupe-le.');
      return;
    }
    if (entAudioUrl) { try { URL.revokeObjectURL(entAudioUrl); } catch {} }
    const url = URL.createObjectURL(file);
    setEntAudioBlob(file);
    setEntAudioUrl(url);
    setEntAudioName(file.name);
    setEntTranscript('');
    setEntNote('');
    setEntStep('have-audio');
    setEntRecordId(null);
    uploadEntretienToSupabase(file, file.name, null);
  };

  const transcribeEntChunk = async (blob, filename) => {
    const fd = new FormData();
    fd.append('file', blob, filename);
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
    return (data.text || '').trim();
  };

  const transcribeEntretien = async () => {
    if (!apiKey) { setEntError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
    if (!entAudioBlob) return;
    setEntError(null);
    setEntStep('transcribing');
    setEntTranscript('');
    try {
      const LIMIT = 24 * 1024 * 1024;
      const blob = entAudioBlob;
      const ext = (entAudioName.split('.').pop() || 'webm').toLowerCase();
      const baseType = blob.type || 'audio/webm';
      let finalTxt = '';
      if (blob.size <= LIMIT) {
        setEntProgress({ current: 0, total: 1 });
        finalTxt = await transcribeEntChunk(blob, `audio.${ext}`);
        setEntProgress({ current: 1, total: 1 });
        setEntTranscript(finalTxt);
      } else {
        const total = Math.ceil(blob.size / LIMIT);
        setEntProgress({ current: 0, total });
        for (let i = 0; i < total; i++) {
          const chunk = blob.slice(i * LIMIT, (i + 1) * LIMIT, baseType);
          const txt = await transcribeEntChunk(chunk, `audio_${i + 1}.${ext}`);
          finalTxt += (finalTxt ? ' ' : '') + txt;
          setEntProgress({ current: i + 1, total });
          setEntTranscript(finalTxt);
        }
      }
      // Ã‰tape d'Ã©tiquetage MÃ©decin / Patient via GPT
      setEntProgress({ current: 0, total: 0 });
      setEntStep('labelling');
      try {
        const labelSys = `Tu reÃ§ois la transcription brute (sans Ã©tiquettes) d'un entretien mÃ©dical entre un Ã©tudiant en mÃ©decine (Ã‰TUDIANT) et un patient (PATIENT). Ta tÃ¢che : restituer le dialogue ligne par ligne en attribuant chaque rÃ©plique au bon locuteur. RÃ¨gles :
- Format strict, une rÃ©plique par ligne, prÃ©fixÃ©e par "MÃ©decin :" ou "Patient :".
- L'Ã©tudiant pose les questions et oriente l'entretien (motif, ATCD, examen). Le patient dÃ©crit ses symptÃ´mes, son histoire, ses ressentis.
- Ne reformule PAS le contenu : reprends les mots de la transcription, corrige uniquement les fautes de transcription Ã©videntes et la ponctuation.
- N'invente AUCUNE rÃ©plique. Si un passage est ambigu, fais le choix le plus probable.
- Pas de commentaire, pas d'introduction. Uniquement le dialogue annotÃ©.`;
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: labelSys },
              { role: 'user', content: `Transcription brute :\n\n${finalTxt}` },
            ],
            temperature: 0.2,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const labelled = (data.choices?.[0]?.message?.content || '').trim();
          if (labelled) {
            finalTxt = labelled;
            setEntTranscript(labelled);
          }
        } else {
          console.warn('Ã‰tiquetage Ã©chouÃ©', await resp.text());
        }
      } catch (e) {
        console.warn('Ã‰tiquetage Ã©chouÃ©', e);
      }
      setEntStep('transcribed');
      if (entRecordId) {
        try { await updateEntretien(entRecordId, { transcript: finalTxt }); } catch (e) { console.warn(e); }
      }
    } catch (e) {
      setEntError(e.message);
      setEntStep('have-audio');
    }
  };

  const generateEntNote = async () => {
    if (!apiKey) { setEntError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
    if (!entTranscript.trim()) { setEntError('Aucune transcription Ã  exploiter.'); return; }
    setEntError(null);
    setEntStep('generating');
    setEntNote('');
    try {
      const sys = `Tu es un mÃ©decin senior qui rÃ©dige une observation clinique structurÃ©e Ã  partir de la transcription brute d'un entretien mÃ©dical Ã©tudiantâ€“patient. Ta restitution doit Ãªtre : claire, professionnelle, sans invention (n'ajoute rien qui ne soit pas dans le texte ; mentionne explicitement "non prÃ©cisÃ©" si une rubrique est absente), et structurÃ©e en Markdown avec EXACTEMENT ces sections (titres en ##) :

## Motif de consultation
## Histoire de la maladie actuelle
## AntÃ©cÃ©dents
- MÃ©dicaux
- Chirurgicaux
- Familiaux
- GynÃ©co-obstÃ©tricaux (si pertinent)
- Allergies
## Mode de vie
(tabac, alcool, drogues, profession, contexte social)
## Traitements en cours
## SymptÃ´mes associÃ©s / revue des systÃ¨mes
## Examen clinique
(uniquement si Ã©voquÃ© dans l'entretien)
## SynthÃ¨se
(3-5 lignes : rÃ©sumÃ© du cas, hypothÃ¨ses diagnostiques Ã©voquÃ©es par l'Ã©tudiant ou plausibles, points Ã  creuser)
## Points forts de l'entretien
## Points Ã  amÃ©liorer

Reste fidÃ¨le au contenu, reformule proprement (sans guillemets), corrige les fautes de transcription Ã©videntes. Ne diagnostique pas Ã  la place â€” propose seulement des hypothÃ¨ses si elles aident l'Ã©tudiant.`;
      const userMsg = `Transcription brute de l'entretien :

${entTranscript}

${entContext ? `Contexte fourni par l'Ã©tudiant : ${entContext}` : ''}`;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: userMsg },
          ],
          temperature: 0.3,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const txt = (data.choices?.[0]?.message?.content || '').trim();
      setEntNote(txt);
      setEntStep('done');
      if (entRecordId) {
        try { await updateEntretien(entRecordId, { note: txt, context: entContext || null }); } catch (e) { console.warn(e); }
      }
      try { setEntHistory(await listEntretiens()); } catch {}
    } catch (e) {
      setEntError(e.message);
      setEntStep('transcribed');
    }
  };

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

  const persistEcosAttemptRecord = (record, { remote = true } = {}) => {
    if (!record?.case_id || !record?.data) return;
    const withUpdatedAt = { ...record, updated_at: record.updated_at || record.data.savedAt || new Date().toISOString() };
    setEcosAttempts(prev => {
      const merged = mergeEcosAttempts([withUpdatedAt], prev, readLocalEcosAttempts());
      writeLocalEcosAttempts(merged);
      return merged;
    });
    if (remote && session) {
      upsertEcosAttempt(withUpdatedAt)
        .then(() => setEcosSaveState(withUpdatedAt.data.status === 'finished' ? 'Session enregistrÃ©e' : 'Brouillon enregistrÃ©'))
        .catch(e => {
          console.warn('upsertEcosAttempt', e);
          setEcosSaveState('Sauvegarde locale seulement');
        });
    } else {
      setEcosSaveState('Brouillon local enregistrÃ©');
    }
  };

  const buildEcosAttemptRecord = (status = 'in_progress', overrides = {}) => {
    if (!ecosCase) return null;
    const now = new Date().toISOString();
    return {
      case_id: ecosCase.id,
      data: {
        caseId: ecosCase.id,
        caseTitle: ecosCase.titre,
        specialite: ecosCase.specialite,
        status,
        startedAt: ecosStartedAt ? new Date(ecosStartedAt).toISOString() : now,
        savedAt: now,
        durationSec: ecosStartedAt ? Math.max(0, Math.round((Date.now() - ecosStartedAt) / 1000)) : null,
        timeLeft: ecosTimeLeft,
        messages: ecosMessages,
        input: ecosInput,
        evaluation: ecosEvaluation,
        ...overrides,
      },
      updated_at: now,
    };
  };

  const saveEcosSession = (status = 'in_progress', overrides = {}) => {
    const record = buildEcosAttemptRecord(status, overrides);
    if (record) persistEcosAttemptRecord(record);
  };

  useEffect(() => {
    if (ecosScrollRef.current) ecosScrollRef.current.scrollTop = ecosScrollRef.current.scrollHeight;
  }, [ecosMessages, ecosSending]);

  useEffect(() => {
    if (mode !== 'ecos' || !ecosCase || ecosEvaluation) return;
    if (ecosMessages.length === 0 && !ecosInput.trim()) return;
    const id = setTimeout(() => saveEcosSession('in_progress'), 700);
    return () => clearTimeout(id);
  }, [mode, ecosCase, ecosMessages, ecosInput]);

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
    const saved = ecosAttempts.find(a => a.case_id === c.id && a.data?.status === 'in_progress');
    const d = saved?.data;
    setEcosCase(c);
    setEcosMessages(Array.isArray(d?.messages) ? d.messages : []);
    setEcosInput(d?.input || '');
    setEcosError(null);
    setEcosEvaluation(null);
    setEcosSaveState(d ? 'Session reprise' : '');
    setEcosStartedAt(d?.startedAt ? new Date(d.startedAt).getTime() : Date.now());
    setEcosTimeLeft(Number.isFinite(Number(d?.timeLeft)) ? Number(d.timeLeft) : (c.duree || 10) * 60);
    setEcosTimerRunning(false);
    setMode('ecos');
  };

  const sendEcosMessage = async (textOverride) => {
    const txt = (textOverride ?? ecosInput).trim();
    if (!txt || !ecosCase || ecosSending) return;
    if (!apiKey) { setEcosError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
    setEcosError(null);
    const newMessages = [...ecosMessages, { role: 'user', content: txt }];
    setEcosMessages(newMessages);
    setEcosInput('');
    setEcosSending(true);
    try {
      const body = {
        model,
        messages: [
          { role: 'system', content: `${ecosCase.briefPatient}\n\nRÃˆGLES IMPORTANTES:\n- RÃ©ponds uniquement Ã  la question posÃ©e par le candidat.\n- Sois prÃ©cise et non Ã©vasive sur les symptÃ´mes/antÃ©cÃ©dents quand on te les demande.\n- N'ajoute pas spontanÃ©ment des informations qui n'ont pas Ã©tÃ© demandÃ©es.` },
          ...newMessages,
        ],
        temperature: 0.2,
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
      const repliedMessages = [...newMessages, { role: 'assistant', content: reply }];
      setEcosMessages(repliedMessages);
      persistEcosAttemptRecord({
        case_id: ecosCase.id,
        data: {
          caseId: ecosCase.id,
          caseTitle: ecosCase.titre,
          specialite: ecosCase.specialite,
          status: 'in_progress',
          startedAt: ecosStartedAt ? new Date(ecosStartedAt).toISOString() : new Date().toISOString(),
          savedAt: new Date().toISOString(),
          durationSec: ecosStartedAt ? Math.max(0, Math.round((Date.now() - ecosStartedAt) / 1000)) : null,
          timeLeft: ecosTimeLeft,
          messages: repliedMessages,
          input: '',
          evaluation: null,
        },
      });
    } catch (e) {
      setEcosError(e.message);
      setEcosMessages(m => m.slice(0, -1));
      setEcosInput(txt);
    } finally {
      setEcosSending(false);
    }
  };

  const startRecording = async () => {
    if (!apiKey) { setEcosError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
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
      setEcosError('AccÃ¨s micro refusÃ© : ' + e.message);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    setEcosRecording(false);
  };

  const finishEcos = async () => {
    if (!ecosCase || ecosEvaluating) return;
    if (!apiKey) { setEcosError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
    if (ecosMessages.length === 0) { setEcosError('Aucune interaction Ã  Ã©valuer.'); return; }
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
            content: `Tu es un examinateur ECOS strict, constant et dÃ©terministe. Tu dois noter UNIQUEMENT Ã  partir de la grille fournie et du transcript fourni.
RÃ¨gles impÃ©ratives:
1) Ã‰value TOUS les items de la grille, dans le mÃªme ordre.
2) pointsObtenus est bornÃ© entre 0 et pointsMax.
3) Si un critÃ¨re n'est pas explicitement explorÃ© par le candidat (question/verification active), mettre 0.
4) Pas d'invention: aucune information absente du transcript.
5) Commentaires courts, factuels, citant le comportement observÃ©.
6) Sois sÃ©vÃ¨re: une mention vague sans prÃ©cision clinique = 0 ou score minimal.
7) N'accorde aucun point sur une simple salutation, reformulation, ou hypothÃ¨se non argumentÃ©e.
RÃ©ponds STRICTEMENT en JSON valide:
{"items":[{"section":"...","critere":"...","pointsMax":n,"pointsObtenus":n,"commentaire":"..."}],"feedbackGlobal":"...","pointsForts":["..."],"axesAmelioration":["..."]}.
Total /${totalPoints}, ensuite cohÃ©rent avec une note /20.`,
          },
          {
            role: 'user',
            content: `CAS : ${ecosCase.titre} (${ecosCase.specialite})\n\nCONSIGNE CANDIDAT :\n${ecosCase.consigneCandidat}\n\nGRILLE DE CORRECTION (total ${totalPoints} points) :\n${grille}\n\nTRANSCRIPT DE LA CONSULTATION :\n${transcript}\n\nÃ‰value chaque item de la grille en justifiant briÃ¨vement, puis fournis un feedback global, points forts et axes d'amÃ©lioration.`,
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
      persistEcosAttemptRecord({
        case_id: ecosCase.id,
        data: {
          caseId: ecosCase.id,
          caseTitle: ecosCase.titre,
          specialite: ecosCase.specialite,
          status: 'finished',
          startedAt: ecosStartedAt ? new Date(ecosStartedAt).toISOString() : new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          savedAt: new Date().toISOString(),
          durationSec: ecosStartedAt ? Math.max(0, Math.round((Date.now() - ecosStartedAt) / 1000)) : null,
          timeLeft: ecosTimeLeft,
          messages: ecosMessages,
          input: '',
          evaluation: parsed,
        },
      });
      setMode('ecos-results');
    } catch (e) {
      setEcosError('Erreur Ã©valuation : ' + e.message);
    } finally {
      setEcosEvaluating(false);
    }
  };

  // Garder une rÃ©fÃ©rence stable vers finishEcos pour le timer
  useEffect(() => { finishEcosRef.current = finishEcos; });

  // ----- Importer un ECOS depuis un PDF -----
  const extractPdfTextFromFile = async (file) => {
    if (!window.pdfjsLib) throw new Error('PDF.js non chargÃ©');
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
    if (!apiKey) throw new Error('Configure ta clÃ© API OpenAI dans les RÃ©glages.');
    const sys = `Tu transformes une grille ECOS extraite d'un PDF (texte brut, parfois bruitÃ©) en un objet JSON STRICT conforme au format suivant, utilisÃ© par une application de simulation mÃ©dicale :
{
  "id": "string-kebab-case-unique",
  "titre": "string court",
  "specialite": "string (ex: 'Cardiologie / Urgences')",
  "duree": number (minutes, dÃ©faut 8),
  "consigneCandidat": "string markdown : contexte, mission, durÃ©e â€” ce que voit l'Ã©tudiant",
  "briefPatient": "string : prompt systÃ¨me complet pour faire incarner le patient simulÃ© Ã  un LLM (TUTOIE le LLM, donne-lui un dossier dÃ©taillÃ© Ã  rÃ©vÃ©ler progressivement, interdit de jouer l'examinateur ou de donner le diagnostic)",
  "grilleCorrection": [{"section":"string","critere":"string","points":number}, ...]
}
Contraintes :
- Les points de grilleCorrection doivent totaliser EXACTEMENT 20.
- Au moins 6 items dans grilleCorrection.
- Si le PDF ne donne pas de "brief patient", invente-le de faÃ§on cohÃ©rente avec la grille.
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
    if (!apiKey) { setEcosImportError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
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
    if (!apiKey) { setEcosImportError('Configure ta clÃ© API OpenAI dans les RÃ©glages.'); return; }
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
        console.warn('Ã‰chec conversion', item.filename, e.message);
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
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Ã‰chec : ' + src));
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

  // Ã€ la connexion: charge la clÃ© API depuis user metadata + la liste des decks
  useEffect(() => {
    if (!session) { setDecks([]); return; }
    // Refresh user from server pour avoir la derniÃ¨re clÃ© API (sync multi-appareils)
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
    listEcosAttempts()
      .then(remote => setEcosAttempts(prev => {
        const merged = mergeEcosAttempts(remote, prev, readLocalEcosAttempts());
        writeLocalEcosAttempts(merged);
        return merged;
      }))
      .catch(e => console.warn('listEcosAttempts', e));
  }, [session]);

  const allEcosCases = useMemo(() => [...ECOS_CASES, ...customCases], [customCases]);
  const ecosCategories = useMemo(() => {
    const arr = Array.from(new Set(allEcosCases.map(c => c?.specialite).filter(Boolean)));
    return arr.sort((a, b) => a.localeCompare(b, 'fr'));
  }, [allEcosCases]);
  const visibleEcosCases = useMemo(() => (
    allEcosCases.filter(c => ecosCategory === 'all' ? true : c.specialite === ecosCategory)
  ), [allEcosCases, ecosCategory]);

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

  // ---------- DÃ©tection permissive des marqueurs d'options ----------
  // Trouve les positions des marqueurs A./B)/C-/D:/Eâ€¦ dans un texte.
  // TolÃ¨re: minuscules, espaces avant, ponctuation variÃ©e (. ) - : /), options
  // sur la mÃªme ligne ou sur des lignes diffÃ©rentes. Ne garde que les lettres
  // qui se suivent dans l'ordre A â†’ B â†’ C â†’ D â†’ E (Ã©vite les faux positifs
  // type Â« 3) Question A propos de â€¦ Â»).
  const findOptionMarkers = (text) => {
    // Accepte: A. A) A- A: A/ A] mais aussi simple "A " en dÃ©but de ligne.
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
    const hasQLabel = /\b(question|qcm|qroc|cas\s*clinique)\s*[nÂ°]?\s*\d*/i.test(t);
    const markers = findOptionMarkers(t);
    const hasQMark = /\?/.test(t);
    if (markers.length >= 2) return 'qcm';
    if (markers.length === 1 && (hasQLabel || hasQMark)) return 'qcm';
    if (hasQLabel) return 'qroc';
    if (hasQMark && t.length < 400) return 'qroc';
    if (t.length > 120 && markers.length === 0) return 'context';
    return 'correction';
  };

  // ---------- DÃ©tection des bonnes rÃ©ponses (couleur) ----------
  // Pour chaque ligne d'option (commenÃ§ant par A/B/C/D/E), calcule la bbox de
  // la ligne, Ã©chantillonne tous les pixels colorÃ©s, et marque l'option comme
  // Â« correcte Â» si les pixels verts dominent (vs. noirs/gris du texte normal).
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

      // Bounding box de la ligne en coordonnÃ©es canvas
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

      // Verte si: pixels verts en quantitÃ© absolue suffisante,
      // ET (au moins 12% des pixels colorÃ©s OU verts > noirs/2)
      const greenRatio = stats.greenPx / stats.textPx;
      const greenVsBlack = stats.blackPx === 0 ? Infinity : stats.greenPx / stats.blackPx;
      const isGreen = stats.greenPx >= 20 && (greenRatio >= 0.12 || greenVsBlack >= 0.5);
      if (isGreen) correctLetters.add(m[1].toUpperCase());
    }

    canvas.width = 0; canvas.height = 0;
    return correctLetters;
  };

  // ---------- OCR (Tesseract.js) â€” worker partagÃ©, FR ----------
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
  // Reconstruit pseudo-items/lines Ã  partir des mots OCR (bboxâ†’x,y,w,h)
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
  // compatible avec le pipeline PDF en aval. DÃ©tection Â« vert Â» lue
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
    if (!isPdf && !isPptx) { setError('Formats supportÃ©s : PDF ou PPTX (PowerPoint).'); return; }
    if (isPdf && !libsReady) { setError('BibliothÃ¨ques en cours de chargement, rÃ©essaie.'); return; }
    setError(null);
    setQuestions([]); setPages([]); setResults([]);
    setFilename(f.name.replace(/\.(pdf|pptx)$/i, ''));
    setProcessing(true);
    setProgress({ current: 0, total: 0, label: isPptx ? 'Lecture du PPTXâ€¦' : 'Lecture du PDFâ€¦' });

    try {
      // Branche PPTX : pipeline simplifiÃ© (pas de rendu canvas)
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
      setProgress({ current: 0, total, label: 'Extraction du texteâ€¦' });

      const rawPages = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        let { text, items, lines } = reconstructText(tc);
        let ocrUsed = false;
        const needsOcr = ocrMode === 'force' || (ocrMode === 'auto' && text.replace(/\s/g, '').length < 25);
        if (needsOcr && window.Tesseract) {
          setProgress({ current: i, total, label: `OCR page ${i}/${total}â€¦` });
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
        setProgress({ current: qcmIdx, total: qcmPages.length, label: `DÃ©tection des bonnes rÃ©ponses ${qcmIdx}/${qcmPages.length}` });
        if (p.ocrUsed) { p.correctSet = new Set(); p.detectionError = true; continue; }
        try {
          p.correctSet = await detectGreenOptions(p._page, p._items, p._lines);
        } catch (e) {
          p.correctSet = new Set();
          p.detectionError = true;
        }
      }

      // Rendu d'image pour les pages QCM/QROC (affichage et schÃ©mas/figures Ã©ventuels)
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
          content: 'Tu es un correcteur d\'examen mÃ©dical franÃ§ais rigoureux. Tu Ã©values les rÃ©ponses courtes (QROC) en comparant la rÃ©ponse de l\'Ã©tudiant Ã  la rÃ©ponse de rÃ©fÃ©rence. RÃ©ponds STRICTEMENT en JSON avec les clÃ©s "verdict" (correct|partiel|incorrect), "score" (0-100), "explanation" (1-2 phrases en franÃ§ais, sans prÃ©ambule).',
        },
        {
          role: 'user',
          content: `Question : ${q.enonce}\n\nRÃ©ponse de rÃ©fÃ©rence (et variantes acceptÃ©es) : ${expectedAll}\n\nRÃ©ponse de l'Ã©tudiant : ${userText}\n\nÃ‰value.`,
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
      return { verdict: 'incorrect', score: 0, explanation: 'RÃ©ponse IA non parsable.' };
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
          ? 'Bonne rÃ©ponse.'
          : `RÃ©ponse(s) attendue(s) : ${[...correctSet].sort().join(', ')}`,
        expected: [...correctSet].sort().join(', '),
        userValue: [...userSet].sort().join(', ') || '(aucune)',
      };
    } else {
      const userText = (userAnswer.text || '').trim();
      if (!userText) {
        fb = { verdict: 'incorrect', score: 0, explanation: 'Aucune rÃ©ponse fournie.', expected: q.expected, userValue: '(vide)' };
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
            explanation: 'RÃ©ponse correcte (ou trÃ¨s proche).',
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
              explanation: `Comparaison stricte : non. IA indisponible (${e.message}). RÃ©ponse attendue : ${q.expected}.`,
              expected: q.expected, userValue: userText,
            };
          } finally { setEvaluating(false); }
        } else {
          fb = {
            verdict: 'incorrect', score: 0,
            explanation: `RÃ©ponse attendue : ${q.expected}${q.variants.length ? ` (variantes : ${q.variants.join(', ')})` : ''}`,
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
    if (!supabaseEnabled) { setAuthError('Supabase non configurÃ© (VITE_SUPABASE_URL / _ANON_KEY).'); return; }
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
    if (!allFav.length) { alert('Aucun favori. Ã‰toile les questions Ã  revoir depuis un deck.'); return; }
    const playable = allFav.filter(q => q.type === 'qcm' ? !q.hasNoCorrect : !q.hasNoAnswer);
    if (!playable.length) { alert('Aucun favori jouable (rÃ©ponses manquantes).'); return; }
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

        /* ---------- Design tokens ---------- */
        :root {
          --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
          --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
          --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
          --d-fast: 150ms;
          --d-base: 220ms;
          --d-slow: 380ms;

          /* Couleurs (hierarchisees) */
          --c-bg:        #f6f3ec;
          --c-surface:   #ffffff;
          --c-ink:       #1a1a1a;
          --c-ink-soft:  #5a5a5a;
          --c-ink-mute:  #8a8a8a;
          --c-line:      #d6d0c1;
          --c-line-soft: #ebe5d4;
          --c-accent:    #b54125;
          --c-accent-soft: #f5d9d0;

          /* Radius unifie */
          --r-xs: 3px;
          --r-sm: 6px;
          --r-md: 8px;

          /* Elevation tres subtile */
          --shadow-rest: 0 1px 0 rgba(26,26,26,0.03), 0 1px 2px rgba(26,26,26,0.04);
          --shadow-card: 0 1px 0 rgba(26,26,26,0.03), 0 6px 18px -10px rgba(26,26,26,0.10);
          --shadow-lift: 0 1px 0 rgba(26,26,26,0.04), 0 14px 36px -16px rgba(26,26,26,0.18);
          --shadow-modal: 0 1px 0 rgba(26,26,26,0.04), 0 24px 60px -20px rgba(26,26,26,0.32);
        }

        .display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .scrollbar::-webkit-scrollbar { width: 8px; }
        .scrollbar::-webkit-scrollbar-thumb { background: #d6d0c1; border-radius: 4px; transition: background var(--d-fast) var(--ease-out-quart); }
        .scrollbar::-webkit-scrollbar-thumb:hover { background: #b8b09c; }

        /* ---------- Focus ring global (accessibilite) ---------- */
        *:focus-visible {
          outline: 2px solid var(--c-accent);
          outline-offset: 2px;
          border-radius: var(--r-xs);
        }
        button:focus-visible { outline-offset: 3px; }

        /* ---------- Buttons ---------- */
        .btn-primary {
          background: var(--c-ink); color: var(--c-bg);
          border-radius: var(--r-sm);
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          transition: background var(--d-fast) var(--ease-out-quart),
                      transform var(--d-fast) var(--ease-out-quart),
                      box-shadow var(--d-fast) var(--ease-out-quart),
                      opacity var(--d-fast) var(--ease-out-quart);
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--c-accent);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -4px rgba(181,65,37,0.32);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0) scale(0.98); transition-duration: 80ms; }
        .btn-primary:disabled { opacity: .4; cursor: not-allowed; }

        .btn-secondary {
          background: var(--c-surface); color: var(--c-ink); border: 1px solid var(--c-line);
          border-radius: var(--r-sm);
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          transition: background var(--d-fast) var(--ease-out-quart),
                      color var(--d-fast) var(--ease-out-quart),
                      border-color var(--d-fast) var(--ease-out-quart),
                      transform var(--d-fast) var(--ease-out-quart),
                      box-shadow var(--d-fast) var(--ease-out-quart),
                      opacity var(--d-fast) var(--ease-out-quart);
        }
        .btn-secondary:hover:not(:disabled) {
          background: var(--c-ink); color: var(--c-bg); border-color: var(--c-ink);
          transform: translateY(-1px); box-shadow: 0 4px 12px -4px rgba(26,26,26,0.18);
        }
        .btn-secondary:active:not(:disabled) { transform: translateY(0) scale(0.98); transition-duration: 80ms; }
        .btn-secondary:disabled { opacity: .4; cursor: not-allowed; }

        .btn-ghost {
          background: transparent; color: var(--c-ink-soft); border: 1px solid transparent;
          border-radius: var(--r-sm);
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          transition: background var(--d-fast) var(--ease-out-quart),
                      color var(--d-fast) var(--ease-out-quart),
                      transform var(--d-fast) var(--ease-out-quart);
        }
        .btn-ghost:hover:not(:disabled) { background: var(--c-line-soft); color: var(--c-ink); }
        .btn-ghost:active:not(:disabled) { transform: scale(0.96); transition-duration: 80ms; }

        .input-field {
          background: var(--c-surface); border: 1px solid var(--c-line); padding: 10px 14px;
          border-radius: var(--r-sm); outline: none;
          transition: border-color var(--d-fast) var(--ease-out-quart),
                      box-shadow var(--d-fast) var(--ease-out-quart);
          font-family: inherit; font-size: 14px;
        }
        .input-field:focus { border-color: var(--c-accent); box-shadow: 0 0 0 3px rgba(181,65,37,0.14); }
        .input-field:focus-visible { outline: none; }

        /* ---------- Toggle iOS-style ---------- */
        .switch {
          position: relative; display: inline-block;
          width: 38px; height: 22px; flex-shrink: 0;
        }
        .switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .switch .slider {
          position: absolute; cursor: pointer; inset: 0;
          background: #d6d0c1; border-radius: 999px;
          transition: background var(--d-base) var(--ease-out-quart);
        }
        .switch .slider::before {
          content: ''; position: absolute;
          height: 18px; width: 18px; left: 2px; top: 2px;
          background: #fff; border-radius: 50%;
          box-shadow: 0 1px 2px rgba(26,26,26,0.18), 0 2px 4px rgba(26,26,26,0.12);
          transition: transform var(--d-base) var(--ease-out-expo);
        }
        .switch input:checked + .slider { background: var(--c-accent); }
        .switch input:checked + .slider::before { transform: translateX(16px); }
        .switch input:focus-visible + .slider { box-shadow: 0 0 0 3px rgba(181,65,37,0.3); }

        /* ---------- QCM options ---------- */
        .qcm-option {
          display: flex; gap: 12px; padding: 14px 16px; border: 1px solid var(--c-line);
          background: var(--c-surface); cursor: pointer; align-items: flex-start;
          border-radius: var(--r-sm);
          transition: background var(--d-fast) var(--ease-out-quart),
                      border-color var(--d-fast) var(--ease-out-quart),
                      color var(--d-fast) var(--ease-out-quart),
                      box-shadow var(--d-fast) var(--ease-out-quart),
                      transform var(--d-fast) var(--ease-out-quart);
        }
        .qcm-option:hover { background: #faf7ee; border-color: #c4bca8; transform: translateX(2px); box-shadow: var(--shadow-rest); }
        .qcm-option:active { transform: translateX(2px) scale(0.995); transition-duration: 80ms; }
        .qcm-option.selected { background: var(--c-ink); color: var(--c-bg); border-color: var(--c-ink); box-shadow: var(--shadow-card); }
        .qcm-option.correct { background: #e6f3e0; border-color: #6b9d4d; color: #2d5a1a; animation: optionFlashGreen 600ms var(--ease-out-quart); }
        .qcm-option.incorrect-selected { background: #f8e0d6; border-color: #b54125; color: #6b1f0a; animation: optionShake 360ms var(--ease-out-quart); }
        .qcm-option.missed { background: #fff8e0; border-color: #c4a84d; color: #5a4a10; }

        /* ---------- Surface (cartes par defaut) ---------- */
        .surface {
          background: var(--c-surface); border: 1px solid var(--c-line);
          border-radius: var(--r-md); box-shadow: var(--shadow-rest);
          transition: box-shadow var(--d-base) var(--ease-out-quart),
                      transform var(--d-base) var(--ease-out-quart),
                      border-color var(--d-base) var(--ease-out-quart);
        }
        .surface-elevated { box-shadow: var(--shadow-card); }

        /* ---------- Pills (QCM/QROC etc.) en palette ---------- */
        .pill {
          display: inline-flex; align-items: center;
          padding: 2px 8px; border-radius: 999px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; letter-spacing: 0.04em;
          border: 1px solid;
        }
        .pill-qcm  { background: rgba(181,65,37,0.08); color: var(--c-accent); border-color: rgba(181,65,37,0.22); }
        .pill-qroc { background: rgba(26,26,26,0.06);  color: var(--c-ink);    border-color: rgba(26,26,26,0.18); }

        /* ---------- Keyframes ---------- */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes modalEnter {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes optionShake {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-4px); }
          40%      { transform: translateX(4px); }
          60%      { transform: translateX(-2px); }
          80%      { transform: translateX(2px); }
        }
        @keyframes optionFlashGreen {
          0%   { background: #e6f3e0; }
          25%  { background: #c6e3b6; }
          100% { background: #e6f3e0; }
        }
        @keyframes timerPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(181,65,37,0); }
          50%      { transform: scale(1.04); box-shadow: 0 0 0 6px rgba(181,65,37,0.08); }
        }
        @keyframes recPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.55; }
        }
        @keyframes thinkBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%           { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes scoreReveal {
          0%   { opacity: 0; transform: translateY(12px) scale(0.92); letter-spacing: -0.04em; }
          60%  { opacity: 1; transform: translateY(0) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); letter-spacing: -0.02em; }
        }
        @keyframes starPop {
          0%   { transform: scale(1) rotate(0); }
          40%  { transform: scale(1.4) rotate(15deg); }
          100% { transform: scale(1) rotate(0); }
        }
        @keyframes confettiDrop {
          0%   { transform: translateY(-20vh) rotate(0); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }

        /* ---------- Animation utilities ---------- */
        .anim-fade-up { animation: fadeUp var(--d-base) var(--ease-out-quart) both; }
        .anim-fade-in { animation: fadeIn var(--d-base) var(--ease-out-quart) both; }
        .anim-scale-in { animation: scaleIn var(--d-base) var(--ease-out-quart) both; }
        .anim-stagger-1 { animation-delay: 60ms; }
        .anim-stagger-2 { animation-delay: 130ms; }
        .anim-stagger-3 { animation-delay: 200ms; }
        .anim-stagger-4 { animation-delay: 280ms; }
        .anim-stagger-5 { animation-delay: 360ms; }

        .modal-backdrop { animation: fadeIn var(--d-fast) var(--ease-out-quart) both; }
        .modal-panel { animation: modalEnter var(--d-base) var(--ease-out-expo) both; }

        .chat-bubble { animation: fadeUp var(--d-base) var(--ease-out-quart) both; }

        .score-reveal { animation: scoreReveal 700ms var(--ease-out-expo) both; }

        .timer-pulse { animation: timerPulse 1.6s var(--ease-out-quart) infinite; }
        .rec-dot { animation: recPulse 1.2s var(--ease-out-quart) infinite; }

        .think-dot { display: inline-block; animation: thinkBounce 1.2s infinite; }
        .think-dot:nth-child(2) { animation-delay: 0.16s; }
        .think-dot:nth-child(3) { animation-delay: 0.32s; }

        .star-pop { animation: starPop 380ms var(--ease-out-quart); }
        .star-btn { transition: transform var(--d-fast) var(--ease-out-quart); }
        .star-btn:hover { transform: scale(1.18); }
        .star-btn:active { transform: scale(0.92); transition-duration: 80ms; }

        .nav-tab { position: relative; transition: color var(--d-fast) var(--ease-out-quart); }
        .nav-tab:hover:not(.nav-tab--active) { color: #1a1a1a; }

        .card-hover {
          box-shadow: var(--shadow-rest);
          transition: transform var(--d-base) var(--ease-out-quart),
                      box-shadow var(--d-base) var(--ease-out-quart),
                      border-color var(--d-base) var(--ease-out-quart);
        }
        .card-hover:hover { transform: translateY(-3px); box-shadow: var(--shadow-lift); border-color: #c4bca8; }

        .drop-zone {
          border-radius: var(--r-md);
          transition: background var(--d-base) var(--ease-out-quart),
                      border-color var(--d-base) var(--ease-out-quart),
                      box-shadow var(--d-base) var(--ease-out-quart),
                      transform var(--d-base) var(--ease-out-quart);
        }
        .drop-zone:hover:not(.drop-zone--over) { border-color: #8a8273; background: rgba(255,255,255,0.4); }
        .drop-zone--over { transform: scale(1.01); box-shadow: 0 12px 36px -16px rgba(181,65,37,0.32); }

        /* ---------- Nav tabs avec indicateur slide ---------- */
        .tab-bar {
          position: relative;
          display: flex; align-items: center; gap: 2px;
        }
        .tab-bar .tab-indicator {
          position: absolute; bottom: -1px; height: 2px;
          background: var(--c-accent); border-radius: 2px;
          transition: left var(--d-base) var(--ease-out-expo),
                      width var(--d-base) var(--ease-out-expo),
                      opacity var(--d-fast) var(--ease-out-quart);
          pointer-events: none;
        }
        .tab-btn {
          position: relative; background: transparent; border: 0;
          padding: 14px 16px; font-size: 14px;
          color: var(--c-ink-soft); font-weight: 400;
          cursor: pointer; white-space: nowrap;
          transition: color var(--d-fast) var(--ease-out-quart);
          border-radius: var(--r-sm) var(--r-sm) 0 0;
        }
        .tab-btn:hover:not(.tab-btn--active) { color: var(--c-ink); background: rgba(26,26,26,0.03); }
        .tab-btn--active { color: var(--c-ink); font-weight: 600; }

        /* ---------- Modal panel premium ---------- */
        .modal-panel { box-shadow: var(--shadow-modal); border-radius: var(--r-md) !important; }

        /* ---------- Liens textuels ---------- */
        .link-accent {
          color: var(--c-accent); text-decoration: none;
          background-image: linear-gradient(currentColor, currentColor);
          background-size: 100% 1px; background-repeat: no-repeat;
          background-position: 0 100%;
          transition: background-size var(--d-base) var(--ease-out-quart);
        }
        .link-accent:hover { background-size: 100% 2px; }

        .feedback-card { animation: scaleIn var(--d-base) var(--ease-out-quart) both; }

        .progress-bar { transition: width 380ms var(--ease-out-quart); }

        .arrow-slide { display: inline-block; transition: transform var(--d-base) var(--ease-out-quart); }
        .arrow-host:hover .arrow-slide { transform: translateX(4px); }

        /* Confetti container */
        .confetti-piece {
          position: fixed; top: 0; width: 8px; height: 14px;
          pointer-events: none; z-index: 60;
          animation: confettiDrop 2.4s var(--ease-out-quart) forwards;
        }

        /* ---------- Reduced motion ---------- */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
          .qcm-option:hover, .btn-primary:hover, .btn-secondary:hover,
          .card-hover:hover, .star-btn:hover, .arrow-host:hover .arrow-slide,
          .drop-zone--over { transform: none !important; }
        }
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
                <IconStar size={13} filled /> Mes decks ({decks.length})
              </button>
            )}
            {supabaseEnabled && (session
              ? <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs" title={session.user?.email}>DÃ©connexion</button>
              : <button onClick={() => setShowAuth(true)} className="btn-secondary px-3 py-1.5 text-xs">Connexion</button>
            )}
            <button onClick={() => setShowSettings(true)} className="btn-secondary px-3 py-1.5 text-xs">
              <IconCog size={13} /> RÃ©glages
            </button>
          </div>
        </div>
      </header>

      {/* Barre de menu â€” bascule entre les outils */}
      <nav className="border-b" style={{ borderColor: '#d6d0c1', background: '#f6f3ec' }}>
        <TabBar
          tabs={[
            { key: 'qcm', label: 'QCM / QROC' },
            { key: 'ecos', label: 'ECOS' },
            { key: 'analyse', label: 'Analyse partiels' },
            { key: 'entretien', label: 'Entretien' },
          ]}
          activeKey={
            mode === 'ecos' ? 'ecos'
            : mode === 'analyse' ? 'analyse'
            : mode === 'entretien' ? 'entretien'
            : 'qcm'
          }
          onSelect={(key) => {
            if (key === 'qcm') {
              if (mode === 'ecos' || mode === 'analyse' || mode === 'entretien') reset();
            } else if (key === 'ecos') {
              if (mode !== 'ecos') setMode('ecos');
            } else if (key === 'analyse') {
              if (mode !== 'analyse') setMode('analyse');
            } else if (key === 'entretien') {
              if (mode !== 'entretien') setMode('entretien');
            }
          }}
        />
      </nav>

      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'rgba(26,26,26,0.5)' }}
             onClick={() => setShowAuth(false)}>
          <div className="bg-white p-8 max-w-md w-full mx-4 modal-panel" style={{ borderRadius: 'var(--r-md)' }} onClick={e => e.stopPropagation()}>
            <h2 className="display text-2xl mb-4" style={{ fontWeight: 600 }}>
              {authIsSignup ? 'CrÃ©er un compte' : 'Connexion'}
            </h2>
            {!supabaseEnabled && (
              <p className="text-xs mb-4" style={{ color: '#b54125' }}>
                Supabase n'est pas configurÃ©. DÃ©finis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY puis exÃ©cute supabase-schema.sql.
              </p>
            )}
            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              placeholder="email@exemple.com" className="input-field w-full mb-3" autoFocus />
            <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAuth()}
              placeholder="Mot de passe (min. 6 caractÃ¨res)" className="input-field w-full mb-3" />
            {authError && <p className="text-xs mb-3" style={{ color: '#b54125' }}>{authError}</p>}
            <div className="flex justify-between items-center">
              <button onClick={() => { setAuthIsSignup(!authIsSignup); setAuthError(null); }}
                className="text-xs underline" style={{ color: '#5a5a5a' }}>
                {authIsSignup ? 'â† DÃ©jÃ  un compte ? Connexion' : 'Pas de compte ? S\'inscrire â†’'}
              </button>
              <button onClick={submitAuth} disabled={authBusy || !authEmail || !authPassword}
                className="btn-primary px-5 py-2 text-sm">
                {authBusy ? 'â€¦' : (authIsSignup ? 'CrÃ©er' : 'Se connecter')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'rgba(26,26,26,0.5)' }}
             onClick={() => setShowSettings(false)}>
          <div className="bg-white p-8 max-w-lg w-full mx-4 modal-panel" style={{ borderRadius: 'var(--r-md)' }} onClick={e => e.stopPropagation()}>
            <h2 className="display text-2xl mb-4" style={{ fontWeight: 600 }}>RÃ©glages</h2>
            <p className="text-sm mb-6" style={{ color: '#5a5a5a' }}>
              La clÃ© reste stockÃ©e localement dans ton navigateur et n'est envoyÃ©e qu'Ã  OpenAI.
            </p>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>ClÃ© API OpenAI</label>
            <div className="flex gap-2 mb-5">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => persistKey(e.target.value)}
                placeholder="sk-..." className="input-field flex-1" />
              <button onClick={() => setShowKey(!showKey)} className="btn-secondary px-3 text-xs" aria-label={showKey ? 'Cacher la clÃ©' : 'Voir la clÃ©'}>
                {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
            </div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>ModÃ¨le</label>
            <input type="text" value={model} onChange={e => persistModel(e.target.value)} className="input-field w-full mb-2" />
            <p className="text-xs mb-5" style={{ color: '#8a8a8a' }}>
              Suggestions : <code className="mono">gpt-5.4-mini</code> (recommandÃ©, ~0,07 Â¢/QROC) Â· <code className="mono">gpt-5.4-nano</code> (5Ã— moins cher) Â· <code className="mono">gpt-5.5</code> (max qualitÃ©)
            </p>
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <span className="switch">
                <input type="checkbox" checked={useAI} onChange={e => persistUseAI(e.target.checked)} />
                <span className="slider" />
              </span>
              <span className="text-sm">Utiliser l'IA pour Ã©valuer les QROC quand la comparaison stricte Ã©choue</span>
            </label>

            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>OCR (Tesseract.js, FR)</label>
            <select value={ocrMode} onChange={e => persistOcrMode(e.target.value)} className="input-field w-full mb-2">
              <option value="off">DÃ©sactivÃ©</option>
              <option value="auto">Automatique (uniquement si page sans texte â€” recommandÃ©)</option>
              <option value="force">Forcer OCR sur toutes les pages (lent)</option>
            </select>
            <p className="text-xs mb-6" style={{ color: '#8a8a8a' }}>
              Utile pour les PDF scannÃ©s. La dÃ©tection de la couleur verte est dÃ©sactivÃ©e sur les pages OCR â€” il faudra cocher les bonnes rÃ©ponses Ã  la main.
            </p>
            <div className="flex justify-end">
              <button onClick={() => setShowSettings(false)} className="btn-primary px-5 py-2 text-sm">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {!libsReady && !libsError && (
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs mono" style={{ color: '#8a8a8a' }}>
          Chargement des bibliothÃ¨ques PDFâ€¦
        </div>
      )}
      {libsError && (
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs mono" style={{ color: '#b54125' }}>
          Erreur de chargement des bibliothÃ¨ques : {libsError}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8" style={{ display: mode === 'analyse' || mode === 'entretien' ? 'none' : '' }}>

        {mode === 'home' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`drop-zone anim-fade-up cursor-pointer border-2 border-dashed flex flex-col items-center justify-center text-center ${dragOver ? 'drop-zone--over' : ''}`}
              style={{
                borderColor: dragOver ? '#b54125' : '#b8b09c',
                background: dragOver ? '#ece7d8' : 'rgba(255,255,255,0.3)',
                padding: '80px 32px', minHeight: '320px',
              }}
            >
              <input ref={fileInputRef} type="file"
                accept=".pdf,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
              <div className="display text-2xl md:text-3xl mb-2" style={{ fontWeight: 500 }}>
                {processing ? 'Extraction en coursâ€¦' : 'DÃ©pose un PDF ou PPTX de cours corrigÃ©'}
              </div>
              <div className="text-sm" style={{ color: '#5a5a5a' }}>
                {processing
                  ? `${progress.label} (${progress.current}/${progress.total})`
                  : 'DÃ©tection automatique des bonnes rÃ©ponses (texte vert) + mode quiz interactif'}
              </div>
              {processing && progress.total > 0 && (
                <div className="w-full max-w-md mt-6 h-1" style={{ background: '#d6d0c1' }}>
                  <div className="h-full progress-bar" style={{
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
                  Ouvrir un deck sauvegardÃ© ({decks.length})
                </button>
                <button onClick={startFavoritesQuiz} className="btn-primary px-4 py-2 text-sm">
                  <IconStar size={14} filled /> Quiz sur mes favoris ({decks.reduce((n, d) => n + (d.questions || []).filter(q => q.favorite).length, 0)})
                </button>
              </div>
            )}

            <div
              onClick={() => setMode('ecos')}
              className="arrow-host card-hover anim-fade-up anim-stagger-2 cursor-pointer mt-10 p-7 border flex items-center justify-between gap-6"
              style={{ borderColor: '#1a1a1a', background: '#fff', borderRadius: 'var(--r-md)' }}
            >
              <div>
                <div className="display text-2xl mb-1" style={{ fontWeight: 600 }}>ECOS â€” EntraÃ®nement</div>
                <div className="text-sm" style={{ color: '#5a5a5a' }}>
                  Examen Clinique Objectif StructurÃ© : patient simulÃ© par IA, dictÃ©e vocale, notation dÃ©taillÃ©e /20.
                </div>
              </div>
              <div className="arrow-slide" style={{ color: '#b54125', display: 'inline-flex', alignItems: 'center' }}>
                <IconArrowRight size={20} stroke={1.5} />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mt-10">
              {[
                { t: 'Auto-correction', d: 'DÃ©tection des bonnes rÃ©ponses par analyse de la couleur du texte (vert = correct).' },
                { t: 'Quiz interactif', d: 'Tu rÃ©ponds, l\'app corrige immÃ©diatement. Score, erreurs, et possibilitÃ© de revoir.' },
                { t: 'Ã‰valuation IA', d: 'Pour les QROC, OpenAI Ã©value ta rÃ©ponse mÃªme si elle ne matche pas exactement la rÃ©fÃ©rence.' },
              ].map((c, i) => (
                <div key={i} className={`card-hover anim-fade-up anim-stagger-${3 + i} p-5 border`} style={{ borderColor: '#d6d0c1', background: '#fff' }}>
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
                <h2 className="display text-2xl mb-1" style={{ fontWeight: 600 }}>ECOS â€” Choix du cas</h2>
                <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                  SÃ©lectionne un cas clinique. Tu joues le mÃ©decin, l'IA joue le patient.
                </div>
              </div>
              <button onClick={() => setMode('home')} className="btn-secondary px-3 py-1.5 text-xs"><IconArrowLeft size={12} /> Retour</button>
            </div>

            {!apiKey && (
              <div className="p-4 mb-4 text-sm" style={{ background: '#fff8e0', borderLeft: '3px solid #c4a84d', color: '#5a4a10' }}>
                Aucune clÃ© OpenAI configurÃ©e. Ouvre les <button onClick={() => setShowSettings(true)} className="underline">RÃ©glages</button> pour la renseigner avant de dÃ©marrer un ECOS.
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => { setEcosImportOpen(v => !v); setEcosImportError(null); }}
                className="btn-secondary px-3 py-1.5 text-xs">
                {ecosImportOpen ? <><IconX size={11} /> Fermer l'import</> : <><IconPlus size={11} /> Importer un ECOS (PDF)</>}
              </button>
            </div>
            <div className="mb-4 flex items-center gap-2">
              <label className="mono text-xs" style={{ color: '#5a5a5a' }}>CatÃ©gorie</label>
              <select value={ecosCategory} onChange={(e) => setEcosCategory(e.target.value)} className="input-field text-xs py-1">
                <option value="all">Toutes</option>
                {ecosCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
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
                {ecosImportProcessing && <div className="text-xs mt-2 mono" style={{ color: '#5a5a5a' }}>Extraction + gÃ©nÃ©ration via GPTâ€¦</div>}
                {ecosImportError && <div className="text-xs mt-2" style={{ color: '#b54125' }}>{ecosImportError}</div>}
                {ecosImportPreview && (
                  <div className="mt-3 p-3" style={{ background: '#f6f3ec' }}>
                    <div className="display text-base mb-1" style={{ fontWeight: 600 }}>{ecosImportPreview.titre}</div>
                    <div className="mono text-xs mb-2" style={{ color: '#b54125' }}>{ecosImportPreview.specialite} Â· {ecosImportPreview.duree} min</div>
                    <div className="text-xs mb-2" style={{ color: '#5a5a5a' }}>
                      Grille : {ecosImportPreview.grilleCorrection.length} items Â· {ecosImportPreview.grilleCorrection.reduce((s, it) => s + (Number(it.points) || 0), 0)} pts
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer">AperÃ§u consigne candidat</summary>
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
              {visibleEcosCases.filter(c => !customCases.find(cc => cc.id === c.id)).map(c => (
                (() => {
                  const lastAttempt = ecosAttempts.find(a => a.case_id === c.id);
                  return (
                <div key={c.id} className="card-hover p-5 border cursor-pointer" style={{ borderColor: '#d6d0c1', background: '#fff' }}
                  onClick={() => startEcos(c)}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="display text-lg" style={{ fontWeight: 600 }}>{c.titre}</div>
                    <div className="mono text-xs" style={{ color: '#8a8a8a' }}>{c.duree} min</div>
                  </div>
                  <div className="mono text-xs mb-3" style={{ color: '#b54125' }}>{c.specialite}</div>
                  <div className="text-xs" style={{ color: '#5a5a5a' }}>
                    Grille : {c.grilleCorrection.length} items Â· {c.grilleCorrection.reduce((s, it) => s + it.points, 0)} pts
                  </div>
                  {lastAttempt?.data?.status === 'in_progress' && (
                    <div className="mt-2">
                      <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#fff8e0', color: '#5a4a10', border: '1px solid #c4a84d' }}>Session en cours</span>
                      <div className="mono text-[10px] mt-1" style={{ color: '#6a6a6a' }}>
                        Reprise auto au clic
                      </div>
                    </div>
                  )}
                  {lastAttempt?.data?.status !== 'in_progress' && lastAttempt?.data?.finishedAt && (
                    <div className="mt-2">
                      <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#e6f3e0', color: '#2d5a1a', border: '1px solid #9ec28f' }}>âœ… ECOS dÃ©jÃ  fait</span>
                      <div className="mono text-[10px] mt-1" style={{ color: '#6a6a6a' }}>
                        Dernier passage: {new Date(lastAttempt.data.finishedAt).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })()
              ))}
              {visibleEcosCases.filter(c => customCases.find(cc => cc.id === c.id)).map(c => (
                (() => {
                  const lastAttempt = ecosAttempts.find(a => a.case_id === c.id);
                  return (
                <div key={c.id} className="card-hover p-5 border relative" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                  <div onClick={() => startEcos(c)} className="cursor-pointer">
                    <div className="flex items-baseline justify-between mb-2 gap-2">
                      <div className="display text-lg" style={{ fontWeight: 600 }}>{c.titre}</div>
                      <div className="mono text-xs" style={{ color: '#8a8a8a' }}>{c.duree} min</div>
                    </div>
                    <div className="mono text-xs mb-3" style={{ color: '#b54125' }}>{c.specialite}</div>
                    <div className="text-xs mb-2" style={{ color: '#5a5a5a' }}>
                      Grille : {(c.grilleCorrection || []).length} items Â· {(c.grilleCorrection || []).reduce((s, it) => s + (Number(it.points) || 0), 0)} pts
                    </div>
                    {lastAttempt?.data?.status === 'in_progress' && (
                      <div className="mt-2">
                        <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#fff8e0', color: '#5a4a10', border: '1px solid #c4a84d' }}>Session en cours</span>
                        <div className="mono text-[10px] mt-1" style={{ color: '#6a6a6a' }}>
                          Reprise auto au clic
                        </div>
                      </div>
                    )}
                    {lastAttempt?.data?.status !== 'in_progress' && lastAttempt?.data?.finishedAt && (
                      <div className="mt-2">
                        <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#e6f3e0', color: '#2d5a1a', border: '1px solid #9ec28f' }}>âœ… ECOS dÃ©jÃ  fait</span>
                        <div className="mono text-[10px] mt-1" style={{ color: '#6a6a6a' }}>
                          Dernier passage: {new Date(lastAttempt.data.finishedAt).toLocaleString('fr-FR')}
                        </div>
                      </div>
                    )}
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
                  );
                })()
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
                  {ecosCase.specialite} Â· {ecosCase.duree} min
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
                      <div className={`mono text-xl px-3 py-1 ${ecosTimerRunning && ecosTimeLeft <= 30 ? 'timer-pulse' : ''}`} style={{
                        color, fontWeight: 600,
                        background: '#fff', border: '1px solid #d6d0c1',
                        minWidth: 90, textAlign: 'center',
                      }}>{mm}:{ss}</div>
                      <button
                        onClick={() => {
                          setEcosTimerRunning(r => !r);
                          saveEcosSession('in_progress');
                        }}
                        disabled={ecosTimeLeft === 0 || ecosEvaluating}
                        className="btn-secondary px-3 py-1.5 text-xs">
                        {ecosTimerRunning
                          ? <><IconPause size={11} /> Pause</>
                          : <><IconPlay size={11} /> {ecosTimeLeft === (ecosCase.duree || 10) * 60 ? 'DÃ©marrer' : 'Reprendre'}</>}
                      </button>
                    </div>
                  );
                })()}
                <button onClick={() => { if (confirm('Abandonner cet ECOS ?')) { saveEcosSession('abandoned'); setEcosTimerRunning(false); setEcosCase(null); setEcosMessages([]); setEcosInput(''); } }}
                  className="btn-secondary px-3 py-1.5 text-xs">Abandonner</button>
                <button onClick={finishEcos} disabled={ecosEvaluating || ecosMessages.length === 0}
                  className="btn-primary px-4 py-1.5 text-xs">
                  {ecosEvaluating ? 'Ã‰valuationâ€¦' : <>Terminer l'ECOS <IconArrowRight size={12} /></>}
                </button>
              </div>
            </div>
            {ecosSaveState && (
              <div className="mono text-[10px] mb-3" style={{ color: '#8a8a8a' }}>
                {ecosSaveState}
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-1 p-5 border self-start" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Consigne candidat</div>
                <div className="text-sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cleanMarkdownNoise(ecosCase.consigneCandidat)}</div>
              </div>

              <div className="md:col-span-2 border flex flex-col" style={{ borderColor: '#d6d0c1', background: '#fff', minHeight: '60vh' }}>
                <div ref={ecosScrollRef} className="flex-1 overflow-y-auto scrollbar p-4 space-y-3" style={{ maxHeight: '60vh' }}>
                  {ecosMessages.length === 0 && (
                    <div className="text-sm italic" style={{ color: '#8a8a8a' }}>
                      Le patient attend. Commence ton interrogatoire (prÃ©sentation, motif, anamnÃ¨seâ€¦).
                    </div>
                  )}
                  {ecosMessages.map((m, i) => (
                    <div key={i} className={`flex chat-bubble ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[85%] p-3 text-sm" style={{
                        background: m.role === 'user' ? '#1a1a1a' : '#f6f3ec',
                        color: m.role === 'user' ? '#f6f3ec' : '#1a1a1a',
                        borderRadius: 'var(--r-sm)', whiteSpace: 'pre-wrap',
                      }}>
                        <div className="mono text-xs mb-1" style={{ opacity: 0.6 }}>
                          {m.role === 'user' ? 'Vous (mÃ©decin)' : 'Patient'}
                        </div>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {ecosSending && (
                    <div className="flex justify-start chat-bubble">
                      <div className="p-3 text-sm italic flex items-center gap-2" style={{ background: '#f6f3ec', color: '#8a8a8a', borderRadius: 'var(--r-sm)' }}>
                        <span>Le patient rÃ©flÃ©chit</span>
                        <span className="think-dot">Â·</span>
                        <span className="think-dot">Â·</span>
                        <span className="think-dot">Â·</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t p-3" style={{ borderColor: '#d6d0c1' }}>
                  {ecosError && (
                    <div className="text-xs mb-2" style={{ color: '#b54125' }}>{ecosError}</div>
                  )}
                  {ecosTranscribing && (
                    <div className="text-xs mb-2 mono" style={{ color: '#5a5a5a' }}>Transcription en coursâ€¦</div>
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
                      placeholder={ecosRecording ? 'Enregistrementâ€¦' : 'Pose ta question au patient (EntrÃ©e pour envoyer, Maj+EntrÃ©e = retour Ã  la ligne)'}
                      rows={2}
                      className="input-field flex-1"
                      disabled={ecosSending || ecosRecording}
                      style={{ resize: 'vertical' }}
                    />
                    <button
                      onClick={() => {
                        if (ecosRecording) stopRecording();
                        else if (ecosInput.trim()) sendEcosMessage();
                        else startRecording();
                      }}
                      disabled={ecosSending || ecosTranscribing}
                      title={ecosRecording ? 'ArrÃªter la dictÃ©e' : (ecosInput.trim() ? 'Envoyer' : 'Dicter (Whisper)')}
                      className={ecosRecording ? 'px-3 py-2 text-sm' : (ecosInput.trim() ? 'btn-primary px-3 py-2 text-sm' : 'btn-secondary px-3 py-2 text-sm')}
                      style={ecosRecording ? {
                        background: '#b54125', color: '#fff', border: '1px solid #b54125',
                        borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', gap: 6,
                      } : undefined}
                    >
                      {ecosRecording
                        ? <><IconStop size={12} /> Stop</>
                        : ecosInput.trim()
                          ? <><IconSend size={13} /> Envoyer</>
                          : <IconMic size={16} />}
                    </button>
                  </div>
                  {ecosRecording && (
                    <div className="text-xs mt-2 mono flex items-center gap-2" style={{ color: '#b54125' }}>
                      <span className="rec-dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#b54125' }} />
                      Enregistrement en coursâ€¦
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'ecos-results' && ecosCase && ecosEvaluation && ecosScore && (
          <>
            {ecosScore.sur20 >= 18 && <Confetti />}
            <div className="text-center py-8 mb-8 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div className="mono text-xs mb-2 anim-fade-up" style={{ color: '#8a8a8a' }}>
                {ecosCase.titre} Â· {ecosCase.specialite}
              </div>
              <div className="display text-5xl mb-2 score-reveal" style={{ fontWeight: 600 }}>
                {ecosScore.sur20} / 20
              </div>
              <div className="text-sm anim-fade-up anim-stagger-2" style={{ color: '#5a5a5a' }}>
                {ecosScore.obtenu} / {ecosScore.total} points Â· {Math.round((ecosScore.obtenu / ecosScore.total) * 100)} %
              </div>
              <div className="flex justify-center gap-2 mt-6 anim-fade-up anim-stagger-3">
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
                      <div className="h-full progress-bar" style={{
                        width: `${pct}%`,
                        background: pct >= 75 ? '#6b9d4d' : pct >= 50 ? '#c4a84d' : '#b54125',
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
                    {ecosEvaluation.pointsForts.map((p, i) => <li key={i}>â€¢ {p}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(ecosEvaluation.axesAmelioration) && ecosEvaluation.axesAmelioration.length > 0 && (
                <div className="p-4" style={{ background: '#f8e0d6', borderLeft: '3px solid #b54125' }}>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6b1f0a' }}>Axes d'amÃ©lioration</div>
                  <ul className="text-sm space-y-1" style={{ color: '#6b1f0a' }}>
                    {ecosEvaluation.axesAmelioration.map((p, i) => <li key={i}>â€¢ {p}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>DÃ©tail item par item</h3>
            <div className="space-y-2 mb-8">
              {(ecosEvaluation.items || []).map((it, i) => {
                const max = Number(it.pointsMax) || 0;
                const obt = Number(it.pointsObtenus) || 0;
                const ratio = max > 0 ? obt / max : 0;
                const color = ratio >= 0.75 ? '#6b9d4d' : ratio >= 0.5 ? '#c4a84d' : '#b54125';
                return (
                  <div key={i} className="p-3 border" style={{ borderColor: '#d6d0c1', background: '#fff', borderLeftWidth: 3, borderLeftColor: color }}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm"><strong>{it.section}</strong> â€” {it.critere}</span>
                      <span className="mono text-xs" style={{ color: '#5a5a5a' }}>{obt} / {max}</span>
                    </div>
                    {it.commentaire && <div className="text-xs italic" style={{ color: '#5a5a5a' }}>{it.commentaire}</div>}
                  </div>
                );
              })}
            </div>

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Grille claire des points</h3>
            <div className="space-y-2 mb-8">
              {(ecosCase.grilleCorrection || []).map((g, i) => {
                const got = (ecosEvaluation.items || []).find(it => (it.critere || '').trim() === (g.critere || '').trim());
                return (
                  <div key={i} className="p-3 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm"><strong>{g.section}</strong> â€” {g.critere}</div>
                      <div className="mono text-xs" style={{ color: '#5a5a5a' }}>{Number(got?.pointsObtenus || 0)} / {Number(g.points || 0)}</div>
                    </div>
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
                <IconStar size={14} filled /> Quiz sur tous mes favoris
              </button>
            </div>
            {decks.length === 0 && (
              <p className="text-sm" style={{ color: '#5a5a5a' }}>Aucun deck. Importe un PDF puis clique Â« Sauvegarder ce deck Â».</p>
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
                      {qs.length} questions Â· {qs.filter(q => q.type === 'qcm').length} QCM Â· {qs.filter(q => q.type === 'qroc').length} QROC
                      {favCount > 0 && <span style={{ color: '#c4a84d', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}> Â· <IconStar size={11} filled /> {favCount}</span>}
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
                <h2 className="display text-2xl mb-1" style={{ fontWeight: 600 }}>VÃ©rification</h2>
                <div className="mono text-xs" style={{ color: '#5a5a5a' }}>
                  {stats.total} questions extraites Â· {stats.qcm} QCM Â· {stats.qroc} QROC
                  {(stats.badQcm + stats.badQroc) > 0 && (
                    <span style={{ color: '#b54125' }}> Â· {stats.badQcm + stats.badQroc} sans rÃ©ponse dÃ©tectÃ©e</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {supabaseEnabled && !currentDeckId && (
                  <button onClick={saveCurrentDeck} disabled={savingDeck || !questions.length}
                    className="btn-secondary px-4 py-2 text-sm">
                    {savingDeck
                      ? 'Sauvegardeâ€¦'
                      : <><IconSave size={14} /> {session ? 'Sauvegarder ce deck' : 'Sauvegarder (connexion)'}</>}
                  </button>
                )}
                {currentDeckId && (
                  <span className="mono text-xs self-center" style={{ color: '#6b9d4d' }}>â— Deck synchronisÃ©</span>
                )}
                <button onClick={() => startQuiz(false)}
                  disabled={stats.total - stats.badQcm - stats.badQroc === 0}
                  className="btn-secondary px-4 py-2 text-sm">Quiz dans l'ordre</button>
                <button onClick={() => startQuiz(true)}
                  disabled={stats.total - stats.badQcm - stats.badQroc === 0}
                  className="btn-primary px-4 py-2 text-sm">Quiz en alÃ©atoire <IconArrowRight size={13} /></button>
              </div>
            </div>

            <p className="text-sm mb-4" style={{ color: '#5a5a5a' }}>
              VÃ©rifie rapidement les bonnes rÃ©ponses dÃ©tectÃ©es. Tu peux corriger directement en cliquant.
              Les questions <span style={{ color: '#b54125' }}>sans rÃ©ponse dÃ©tectÃ©e</span> sont exclues du quiz tant que tu ne les complÃ¨tes pas.
            </p>

            <div className="space-y-6">
              {questions.map((q) => (
                <div key={q.id} className="p-5 border" style={{
                  borderColor: (q.hasNoCorrect || q.hasNoAnswer) ? '#b54125' : '#d6d0c1',
                  background: '#fff',
                }}>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`pill ${q.type === 'qcm' ? 'pill-qcm' : 'pill-qroc'}`}>{q.type.toUpperCase()}</span>
                      <span className="mono text-xs" style={{ color: '#8a8a8a' }}>p.{q.pageNum}</span>
                      {q.detectionError && <span className="text-xs flex items-center gap-1" style={{ color: '#b54125' }}><IconWarning size={11} /> dÃ©tection couleur Ã©chouÃ©e</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {(q.hasNoCorrect || q.hasNoAnswer) && (
                        <span className="text-xs" style={{ color: '#b54125' }}>âš  aucune rÃ©ponse</span>
                      )}
                      <button onClick={() => toggleFavorite(q.id)} className="star-btn p-1 -m-1" title="Marquer comme favori" aria-label="Favori">
                        <span key={String(q.favorite)} className={q.favorite ? 'star-pop inline-block' : 'inline-block'} style={{ color: q.favorite ? '#c4a84d' : '#cfc7b4' }}>
                          <IconStar size={16} filled={q.favorite} />
                        </span>
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
                        Voir la page d'origine (figures, schÃ©mas)
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
                          {o.correct && <span className="text-xs">âœ“ correcte</span>}
                        </div>
                      ))}
                      <div className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                        Clic sur une option pour corriger sa marque Â« bonne rÃ©ponse Â».
                      </div>
                    </div>
                  )}

                  {q.type === 'qroc' && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>RÃ©ponse attendue</label>
                      <input type="text" value={q.expected}
                        onChange={e => setQROCAnswer(q.id, e.target.value)}
                        className="input-field w-full" placeholder="(Ã  complÃ©ter)" />
                      {q.variants.length > 0 && (
                        <div className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                          Variantes acceptÃ©es : {q.variants.join(' Â· ')}
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
                    <span style={{ color: '#6b9d4d' }}>âœ“ {quizStats.correct}</span>
                    <span className="mx-2" style={{ color: '#b54125' }}>âœ— {quizStats.incorrect}</span>
                    <button onClick={() => { if (confirm('Quitter le quiz ?')) setMode('extract'); }}
                      className="ml-3 underline">Quitter</button>
                  </div>
                </div>
                <div className="h-1" style={{ background: '#d6d0c1' }}>
                  <div className="h-full progress-bar" style={{
                    background: '#1a1a1a', width: `${((quizIdx + (feedback ? 1 : 0)) / totalQuiz) * 100}%`,
                  }} />
                </div>
              </div>

              <div key={quizIdx} className="p-8 border anim-fade-up" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className={`pill ${q.type === 'qcm' ? 'pill-qcm' : 'pill-qroc'}`}>{q.type.toUpperCase()}</span>
                  <span className="mono text-xs" style={{ color: '#8a8a8a' }}>p.{q.pageNum}</span>
                  <button onClick={() => toggleFavorite(q.id)} className="ml-auto star-btn p-1 -m-1" title="Favori" aria-label="Favori">
                    <span key={String(q.favorite)} className={q.favorite ? 'star-pop inline-block' : 'inline-block'} style={{ color: q.favorite ? '#c4a84d' : '#cfc7b4' }}>
                      <IconStar size={18} filled={q.favorite} />
                    </span>
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
                      Voir la page d'origine (figures, schÃ©mas)
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
                          {feedback && o.correct && <span className="text-xs">âœ“</span>}
                          {feedback && !o.correct && sel && <span className="text-xs">âœ—</span>}
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
                      placeholder="Ta rÃ©ponseâ€¦ (Ctrl/Cmd + EntrÃ©e pour valider)"
                      className="input-field w-full"
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                )}

                {feedback && (
                  <div className="p-4 mb-6 feedback-card" style={{
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
                        {feedback.verdict === 'correct' ? 'âœ“ Correct' : feedback.verdict === 'partiel' ? '~ Partiel' : 'âœ— Incorrect'}
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
                      {evaluating ? 'Ã‰valuation IAâ€¦' : 'Valider'}
                    </button>
                  )}
                  {feedback && (
                    <button onClick={nextQuestion} className="btn-primary px-6 py-2.5 text-sm">
                      {quizIdx + 1 >= totalQuiz ? 'Voir les rÃ©sultats' : 'Suivante'} <IconArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {mode === 'results' && (
          <>
            {quizStats.total > 0 && quizStats.correct === quizStats.total && (
              <Confetti />
            )}
            <div className="text-center py-8 mb-8 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div className="display text-5xl mb-2 score-reveal" style={{ fontWeight: 600 }}>
                {quizStats.correct} / {quizStats.total}
              </div>
              <div className="text-sm anim-fade-up anim-stagger-2" style={{ color: '#5a5a5a' }}>
                {Math.round((quizStats.correct / quizStats.total) * 100)} % de bonnes rÃ©ponses
              </div>
              <div className="flex justify-center gap-4 mt-4 mono text-sm anim-fade-up anim-stagger-3">
                <span style={{ color: '#6b9d4d' }}>âœ“ {quizStats.correct} correctes</span>
                {quizStats.partial > 0 && <span style={{ color: '#c4a84d' }}>~ {quizStats.partial} partielles</span>}
                <span style={{ color: '#b54125' }}>âœ— {quizStats.incorrect} incorrectes</span>
              </div>
              <div className="flex justify-center gap-2 mt-6 anim-fade-up anim-stagger-4">
                <button onClick={() => startQuiz(true)} className="btn-secondary px-4 py-2 text-sm">Refaire (alÃ©atoire)</button>
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

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>DÃ©tail</h3>
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
                      {i + 1}. {r.question.type.toUpperCase()} Â· p.{r.question.pageNum}
                    </span>
                    <span className="text-xs">
                      {r.feedback?.verdict === 'correct' ? 'âœ“' : r.feedback?.verdict === 'partiel' ? '~' : 'âœ—'}
                    </span>
                  </div>
                  <div className="text-sm mb-2" style={{ whiteSpace: 'pre-wrap' }}>{r.question.enonce}</div>
                  <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><strong>Ta rÃ©ponse :</strong> {r.feedback?.userValue}</div>
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

      {mode === 'entretien' && (
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h1 className="display text-3xl mb-2" style={{ fontWeight: 600 }}>Entretien patient</h1>
            <p className="text-sm" style={{ color: '#5a5a5a' }}>
              Enregistre ou importe un entretien (jusqu'Ã  30 min). L'IA produit une observation mÃ©dicale structurÃ©e.
            </p>
            {supabaseEnabled && session && (
              <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                â˜ Audio + transcript + restitution stockÃ©s sur ton compte Supabase et auto-supprimÃ©s aprÃ¨s 24h.
              </p>
            )}
            {supabaseEnabled && !session && (
              <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                Connecte-toi pour conserver les entretiens 24h sur ton compte (sinon tout reste en local et disparaÃ®t au reload).
              </p>
            )}
          </div>

          {!apiKey && (
            <div className="mb-4 p-3 text-sm" style={{ background: '#fdf3ee', border: '1px solid #b54125', color: '#b54125' }}>
              Configure ta clÃ© API OpenAI dans les RÃ©glages pour utiliser cet outil.
            </div>
          )}
          {entError && (
            <div className="mb-4 p-3 text-sm" style={{ background: '#fdf3ee', border: '1px solid #b54125', color: '#b54125' }}>
              {entError}
            </div>
          )}

          {/* Ã‰tape 1 : capture audio */}
          <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
            <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>1. Audio</h2>

            {!entAudioBlob && !entRecording && (
              <div className="flex flex-wrap gap-3">
                <button onClick={startEntRecording} disabled={!apiKey} className="btn-primary px-4 py-2 text-sm">
                  â— DÃ©marrer l'enregistrement
                </button>
                <button onClick={() => entFileInputRef.current?.click()} className="btn-secondary px-4 py-2 text-sm">
                  Importer un fichier audio
                </button>
                <input
                  ref={entFileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => onEntFilePicked(e.target.files?.[0])}
                />
              </div>
            )}

            {entRecording && (
              <div className="flex items-center gap-4">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#b54125', animation: 'pulse 1.2s infinite' }} />
                <span className="mono text-lg">{fmtMs(entRecMs)}</span>
                <span className="text-xs" style={{ color: '#5a5a5a' }}>(stop auto Ã  30:00)</span>
                <button onClick={stopEntRecording} className="btn-primary px-4 py-2 text-sm" style={{ background: '#b54125' }}>
                  â–  ArrÃªter
                </button>
              </div>
            )}

            {entAudioBlob && !entRecording && (
              <div>
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <span className="text-sm">{entAudioName}</span>
                  <span className="text-xs mono" style={{ color: '#5a5a5a' }}>
                    {(entAudioBlob.size / (1024 * 1024)).toFixed(2)} Mo
                  </span>
                  {entUploading && <span className="text-xs" style={{ color: '#8a8a8a' }}>â†‘ Upload Supabaseâ€¦</span>}
                  {!entUploading && entRecordId && <span className="text-xs" style={{ color: '#3a7a3a' }}>âœ“ StockÃ© (24h)</span>}
                </div>
                {entAudioUrl && <audio controls src={entAudioUrl} className="w-full mb-3" />}
                <div className="flex flex-wrap gap-3">
                  <button onClick={resetEntretien} className="btn-secondary px-3 py-2 text-xs">
                    â†º Recommencer
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Ã‰tape 2 : transcription */}
          {entAudioBlob && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>2. Transcription (Whisper)</h2>

              {entStep === 'have-audio' && (
                <button onClick={transcribeEntretien} disabled={!apiKey} className="btn-primary px-4 py-2 text-sm">
                  Transcrire l'audio
                </button>
              )}

              {entStep === 'transcribing' && (
                <div className="text-sm" style={{ color: '#5a5a5a' }}>
                  Transcription en coursâ€¦
                  {entProgress.total > 1 && ` (segment ${entProgress.current}/${entProgress.total})`}
                </div>
              )}
              {entStep === 'labelling' && (
                <div className="text-sm" style={{ color: '#5a5a5a' }}>
                  Ã‰tiquetage MÃ©decin / Patientâ€¦
                </div>
              )}

              {entTranscript && (
                <div className="mt-3">
                  <textarea
                    value={entTranscript}
                    onChange={(e) => setEntTranscript(e.target.value)}
                    rows={Math.min(20, Math.max(6, entTranscript.split('\n').length + 2))}
                    className="input-field w-full text-sm"
                    style={{ fontFamily: 'inherit' }}
                  />
                  <p className="text-xs mt-1" style={{ color: '#8a8a8a' }}>
                    Tu peux corriger la transcription avant la restitution.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Ã‰tape 3 : restitution IA */}
          {(entStep === 'transcribed' || entStep === 'generating' || entStep === 'done') && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>3. Observation structurÃ©e</h2>

              {(entStep === 'transcribed' || entStep === 'done') && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={entContext}
                    onChange={(e) => setEntContext(e.target.value)}
                    placeholder="Contexte (optionnel) : ex. consultation de mÃ©decine gÃ©nÃ©rale, urgencesâ€¦"
                    className="input-field w-full text-sm mb-3"
                  />
                  <button onClick={generateEntNote} disabled={!apiKey} className="btn-primary px-4 py-2 text-sm">
                    {entStep === 'done' ? 'â†º RÃ©gÃ©nÃ©rer la restitution' : 'GÃ©nÃ©rer la restitution'}
                  </button>
                </div>
              )}

              {entStep === 'generating' && (
                <div className="text-sm" style={{ color: '#5a5a5a' }}>GÃ©nÃ©ration en coursâ€¦</div>
              )}

              {entNote && (
                <div className="mt-4 p-4" style={{ background: '#faf7ef', border: '1px solid #e6dfc8', borderRadius: 'var(--r-md)' }}>
                  <pre className="whitespace-pre-wrap text-sm" style={{ fontFamily: 'inherit', lineHeight: 1.6 }}>
                    {entNote}
                  </pre>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(entNote)}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Copier
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([entNote], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'observation.md'; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      TÃ©lÃ©charger (.md)
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Historique 24h */}
          {supabaseEnabled && session && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="display text-lg" style={{ fontWeight: 600 }}>Mes entretiens (24h)</h2>
                <button onClick={refreshEntHistory} className="btn-secondary px-3 py-1.5 text-xs">â†» Actualiser</button>
              </div>
              {entHistoryLoading && <div className="text-xs" style={{ color: '#8a8a8a' }}>Chargementâ€¦</div>}
              {!entHistoryLoading && entHistory.length === 0 && (
                <div className="text-xs" style={{ color: '#8a8a8a' }}>Aucun entretien stockÃ© pour l'instant.</div>
              )}
              {entHistory.length > 0 && (
                <ul className="divide-y" style={{ borderColor: '#e6dfc8' }}>
                  {entHistory.map(row => {
                    const created = new Date(row.created_at);
                    const expires = new Date(row.expires_at);
                    const remainMs = expires - new Date();
                    const remainH = Math.max(0, Math.floor(remainMs / 3600000));
                    const remainM = Math.max(0, Math.floor((remainMs % 3600000) / 60000));
                    const sizeMo = row.size_bytes ? (row.size_bytes / (1024 * 1024)).toFixed(1) : '?';
                    const dur = row.duration_ms ? fmtMs(row.duration_ms) : null;
                    return (
                      <li key={row.id} className="py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">
                            {created.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            {dur && <span className="ml-2 mono text-xs" style={{ color: '#8a8a8a' }}>{dur}</span>}
                            <span className="ml-2 text-xs" style={{ color: '#8a8a8a' }}>{sizeMo} Mo</span>
                          </div>
                          <div className="text-xs" style={{ color: '#8a8a8a' }}>
                            {row.note ? 'âœ“ Restitution' : (row.transcript ? 'âœ“ Transcrit' : 'Audio brut')}
                            <span className="ml-2">Â· expire dans {remainH}h{String(remainM).padStart(2, '0')}</span>
                          </div>
                        </div>
                        <button onClick={() => restoreEntretien(row)} className="btn-secondary px-3 py-1.5 text-xs">Ouvrir</button>
                        <button
                          onClick={() => { if (confirm('Supprimer cet entretien ?')) deleteEntretienRow(row); }}
                          className="btn-secondary px-3 py-1.5 text-xs"
                          style={{ color: '#b54125' }}
                        >Supprimer</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </main>
      )}

      {mode === 'analyse' && (
        <iframe
          src={`/analyse-partiels.html${supabaseEnabled ? `?su=${encodeURIComponent(import.meta.env.VITE_SUPABASE_URL)}&sk=${encodeURIComponent(import.meta.env.VITE_SUPABASE_ANON_KEY)}${session?.access_token ? `&at=${encodeURIComponent(session.access_token)}` : ''}${session?.refresh_token ? `&rt=${encodeURIComponent(session.refresh_token)}` : ''}` : ''}`}
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

      {mode !== 'analyse' && mode !== 'entretien' && (
        <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 text-xs border-t" style={{ color: '#8a8a8a', borderColor: '#d6d0c1' }}>
          Tout tourne dans le navigateur. Ta clÃ© OpenAI est stockÃ©e localement et n'est envoyÃ©e qu'Ã  api.openai.com.
          Les PDF ne quittent jamais ta machine.
        </footer>
      )}
    </div>
  );
}
