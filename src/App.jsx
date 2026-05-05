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
//  EXTRACTEUR & QUIZ DE QCM/QROC — V2
//  - Charge un PDF de cours corrigé
//  - Détecte automatiquement les bonnes réponses (couleur verte)
//  - Mode quiz interactif avec correction
//  - Évaluation IA (OpenAI) pour les QROC
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

// ---------- Hook : scroll-reveal via IntersectionObserver ----------
const useScrollReveal = (threshold = 0.12) => {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true); return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break; } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, shown];
};

// ---------- Composants premium : Eyebrow, Reveal ----------
const Eyebrow = ({ children, accent = false, ...props }) => (
  <span className={`eyebrow ${accent ? 'eyebrow--accent' : ''}`} {...props}>{children}</span>
);

const Reveal = ({ children, delay = 0, className = '', as: As = 'div', ...props }) => {
  const [ref, shown] = useScrollReveal();
  return (
    <As ref={ref}
        className={`reveal ${shown ? 'reveal--in' : ''} ${className}`}
        style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
        {...props}>
      {children}
    </As>
  );
};

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
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
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
  .replace(/^\s*[-*]\s+/gm, '• ')
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

const formatEcosAttemptDate = (attempt) => {
  const ts = attemptTimestamp(attempt);
  if (!ts) return 'Date inconnue';
  try {
    return new Date(ts).toLocaleString('fr-FR');
  } catch {
    return 'Date inconnue';
  }
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
  const [ecosAttempts, setEcosAttempts] = useState(() => readLocalEcosAttempts());
  const [ecosSaveState, setEcosSaveState] = useState('');
  const [ecosCategory, setEcosCategory] = useState('all');
  const ecosImportInputRef = useRef(null);

  // ---------- Entretien (écoute + restitution IA) ----------
  const [entStep, setEntStep] = useState('idle'); // 'idle' | 'have-audio' | 'transcribing' | 'transcribed' | 'generating' | 'done'
  const [entRecording, setEntRecording] = useState(false);
  const [entRecMs, setEntRecMs] = useState(0);
  const [entAudioBlob, setEntAudioBlob] = useState(null);
  const [entAudioUrl, setEntAudioUrl] = useState(null);
  const [entAudioName, setEntAudioName] = useState('');
  const [entTranscript, setEntTranscript] = useState('');
  const [entNote, setEntNote] = useState('');
  const [entReferralMail, setEntReferralMail] = useState('');
  const [entPrescription, setEntPrescription] = useState('');
  const [entPrescriptionDraft, setEntPrescriptionDraft] = useState('');
  const [entGeneratingDoc, setEntGeneratingDoc] = useState('');
  const [entPrescriptionListening, setEntPrescriptionListening] = useState(false);
  const [entError, setEntError] = useState(null);
  const [entContext, setEntContext] = useState(''); // contexte optionnel saisi par l'étudiant
  const [entPatientFirstName, setEntPatientFirstName] = useState('');
  const [entPatientLastName, setEntPatientLastName] = useState('');
  const [entDoctorName, setEntDoctorName] = useState(() => {
    try { return localStorage.getItem('doctor_name') || ''; } catch { return ''; }
  });
  const [entDoctorSignature, setEntDoctorSignature] = useState(() => {
    try { return localStorage.getItem('doctor_signature') || ''; } catch { return ''; }
  });
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
  const entPrescriptionRecRef = useRef(null);

  // Tick durée enregistrement
  useEffect(() => {
    if (!entRecording) return;
    const start = Date.now() - entRecMs;
    const id = setInterval(() => setEntRecMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [entRecording]);

  // Auto-stop à 30 min
  useEffect(() => {
    if (entRecording && entRecMs >= 30 * 60 * 1000) {
      stopEntRecording();
    }
  }, [entRecMs, entRecording]);

  const fmtMs = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const stripClinicalMarkdown = (text = '') => cleanMarkdownNoise(text)
    .replace(/^#{1,6}\s*/gm, '')
    .trim();

  const patientFullName = () => [entPatientFirstName, entPatientLastName].map(s => s.trim()).filter(Boolean).join(' ');

  const persistDoctorProfile = async (name = entDoctorName, signature = entDoctorSignature) => {
    try {
      localStorage.setItem('doctor_name', name || '');
      localStorage.setItem('doctor_signature', signature || '');
    } catch {}
    if (supabaseEnabled && session) {
      try {
        await supabase.auth.updateUser({ data: { doctor_name: name || '', doctor_signature: signature || '' } });
      } catch (e) {
        console.warn('saveDoctorProfile', e);
      }
    }
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
    setEntReferralMail('');
    setEntPrescription('');
    setEntPrescriptionDraft('');
    setEntGeneratingDoc('');
    setEntPrescriptionListening(false);
    setEntError(null);
    setEntProgress({ current: 0, total: 0 });
    setEntRecordId(null);
    setEntContext('');
    setEntPatientFirstName('');
    setEntPatientLastName('');
    entChunksRef.current = [];
    if (entPrescriptionRecRef.current) {
      try { entPrescriptionRecRef.current.stop(); } catch {}
      entPrescriptionRecRef.current = null;
    }
  };

  // Upload Supabase d'un blob audio (auto si connecté)
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

  const saveCurrentEntretien = async () => {
    if (!entAudioBlob) return;
    if (!supabaseEnabled || !session) { setShowAuth(true); return; }
    setEntError(null);
    let id = entRecordId;
    if (!id) {
      const row = await uploadEntretienToSupabase(entAudioBlob, entAudioName || 'audio.webm', entRecMs || null);
      id = row?.id;
    }
    if (!id) return;
    try {
      await updateEntretien(id, {
        transcript: entTranscript || null,
        note: entNote || null,
        context: entContext || null,
        referral_mail: entReferralMail || null,
        prescription: entPrescription || null,
        doctor_name: entDoctorName || null,
        doctor_signature: entDoctorSignature || null,
      });
      await persistDoctorProfile();
      try { setEntHistory(await listEntretiens()); } catch {}
    } catch (e) {
      setEntError('Sauvegarde : ' + e.message);
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

  // Charge l'historique quand on entre dans l'onglet Entretien (et qu'on est connecté)
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
      setEntReferralMail(row.referral_mail || '');
      setEntPrescription(row.prescription || '');
      setEntContext(row.context || '');
      setEntDoctorName(row.doctor_name || entDoctorName);
      setEntDoctorSignature(row.doctor_signature || entDoctorSignature);
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
    setEntReferralMail('');
    setEntPrescription('');
    setEntPrescriptionDraft('');
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
      };
      entMRRef.current = mr;
      mr.start();
      setEntRecording(true);
    } catch (e) {
      setEntError('Accès micro refusé : ' + e.message);
    }
  };

  const stopEntRecording = () => {
    const mr = entMRRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
  };

  const onEntFilePicked = (file) => {
    if (!file) return;
    setEntError(null);
    const MAX = 100 * 1024 * 1024; // 100 MB hard cap (sera chunké pour Whisper)
    if (file.size > MAX) {
      setEntError('Fichier trop gros (>100 Mo). Compresse-le ou découpe-le.');
      return;
    }
    if (entAudioUrl) { try { URL.revokeObjectURL(entAudioUrl); } catch {} }
    const url = URL.createObjectURL(file);
    setEntAudioBlob(file);
    setEntAudioUrl(url);
    setEntAudioName(file.name);
    setEntTranscript('');
    setEntNote('');
    setEntReferralMail('');
    setEntPrescription('');
    setEntPrescriptionDraft('');
    setEntStep('have-audio');
    setEntRecordId(null);
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
    if (!apiKey) { setEntError('Configure ta clé API OpenAI dans les Réglages.'); return; }
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
      // Étape d'étiquetage Médecin / Patient via GPT
      setEntProgress({ current: 0, total: 0 });
      setEntStep('labelling');
      try {
        const labelSys = `Tu reçois la transcription brute (sans étiquettes) d'un entretien médical entre un étudiant en médecine (ÉTUDIANT) et un patient (PATIENT). Ta tâche : restituer le dialogue ligne par ligne en attribuant chaque réplique au bon locuteur. Règles :
- Format strict, une réplique par ligne, préfixée par "Médecin :" ou "Patient :".
- L'étudiant pose les questions et oriente l'entretien (motif, ATCD, examen). Le patient décrit ses symptômes, son histoire, ses ressentis.
- Ne reformule PAS le contenu : reprends les mots de la transcription, corrige uniquement les fautes de transcription évidentes et la ponctuation.
- N'invente AUCUNE réplique. Si un passage est ambigu, fais le choix le plus probable.
- Pas de commentaire, pas d'introduction. Uniquement le dialogue annoté.`;
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
          console.warn('Étiquetage échoué', await resp.text());
        }
      } catch (e) {
        console.warn('Étiquetage échoué', e);
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
    if (!apiKey) { setEntError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    if (!entTranscript.trim()) { setEntError('Aucune transcription à exploiter.'); return; }
    setEntError(null);
    setEntStep('generating');
    setEntNote('');
    try {
      const sys = `Tu es un médecin senior qui rédige une observation clinique structurée à partir de la transcription brute d'un entretien médical étudiant-patient. Ta restitution doit être claire, professionnelle, sans invention (n'ajoute rien qui ne soit pas dans le texte ; mentionne explicitement "non précisé" si une rubrique est absente). N'utilise jamais de Markdown : aucun #, aucun ##. Utilise uniquement des titres en texte simple suivis de deux-points, avec exactement ces sections :

Motif de consultation :
Histoire de la maladie actuelle :
Antécédents :
- Médicaux
- Chirurgicaux
- Familiaux
- Gynéco-obstétricaux (si pertinent)
- Allergies
Mode de vie :
(tabac, alcool, drogues, profession, contexte social)
Traitements en cours :
Symptômes associés / revue des systèmes :
Examen clinique :
(uniquement si évoqué dans l'entretien)
Synthèse :
(3-5 lignes : résumé du cas, hypothèses diagnostiques évoquées par l'étudiant ou plausibles, points à creuser)
Points forts de l'entretien :
Points à améliorer :
Médecin :

Reste fidèle au contenu, reformule proprement (sans guillemets), corrige les fautes de transcription évidentes. Ne diagnostique pas à la place. Ajoute le patient et le médecin seulement si fournis. Termine par la signature du médecin si elle est fournie.`;
      const userMsg = `Transcription brute de l'entretien :

${entTranscript}

Patient : ${patientFullName() || 'non précisé'}
Médecin : ${entDoctorName || 'non précisé'}
Signature souhaitée : ${entDoctorSignature || 'non précisée'}
${entContext ? `Contexte fourni par l'étudiant : ${entContext}` : ''}`;
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
      const txt = stripClinicalMarkdown(data.choices?.[0]?.message?.content || '');
      setEntNote(txt);
      setEntStep('done');
      if (entRecordId) {
        try {
          await updateEntretien(entRecordId, {
            note: txt,
            context: entContext || null,
            doctor_name: entDoctorName || null,
            doctor_signature: entDoctorSignature || null,
          });
        } catch (e) { console.warn(e); }
      }
      try { setEntHistory(await listEntretiens()); } catch {}
    } catch (e) {
      setEntError(e.message);
      setEntStep('transcribed');
    }
  };

  const generateEntReferralMail = async () => {
    if (!apiKey) { setEntError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    if (!entTranscript.trim() && !entNote.trim()) { setEntError('Génère d’abord une transcription ou un compte rendu.'); return; }
    setEntError(null);
    setEntGeneratingDoc('mail');
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `Rédige un mail médical professionnel destiné à un confrère. Pas de Markdown, aucun #. Ton sobre, clair, synthétique. Inclure objet, formule d'appel, résumé, question posée au confrère, conclusion. Termine par la signature du médecin si fournie.`,
            },
            {
              role: 'user',
              content: `Patient : ${patientFullName() || 'non précisé'}
Médecin expéditeur : ${entDoctorName || 'non précisé'}
Signature : ${entDoctorSignature || 'non précisée'}
Contexte : ${entContext || 'non précisé'}

Compte rendu :
${entNote || 'non généré'}

Transcription :
${entTranscript}`,
            },
          ],
          temperature: 0.25,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const txt = stripClinicalMarkdown(data.choices?.[0]?.message?.content || '');
      setEntReferralMail(txt);
      if (entRecordId) {
        try { await updateEntretien(entRecordId, { referral_mail: txt, doctor_name: entDoctorName || null, doctor_signature: entDoctorSignature || null }); } catch (e) { console.warn(e); }
      }
      try { setEntHistory(await listEntretiens()); } catch {}
    } catch (e) {
      setEntError(e.message);
    } finally {
      setEntGeneratingDoc('');
    }
  };

  const generateEntPrescription = async () => {
    if (!apiKey) { setEntError('Configure ta clé API OpenAI dans les Réglages.'); return; }
    if (!entTranscript.trim() && !entNote.trim() && !entPrescriptionDraft.trim()) {
      setEntError('Ajoute une consigne, une transcription ou un compte rendu avant de générer l’ordonnance.');
      return;
    }
    setEntError(null);
    setEntGeneratingDoc('prescription');
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `Tu aides un médecin à préparer une ordonnance à partir de ses consignes et d'un entretien. Pas de Markdown, aucun #. Ne prescris rien si l'information est insuffisante : indique "à compléter par le médecin". Structure : Identité patient, Date, Ordonnance, Conseils, Signature. Le médecin reste responsable de valider.`,
            },
            {
              role: 'user',
              content: `Patient : ${patientFullName() || 'non précisé'}
Médecin : ${entDoctorName || 'non précisé'}
Signature : ${entDoctorSignature || 'non précisée'}
Consignes dictées/écrites par le médecin :
${entPrescriptionDraft || 'aucune'}

Compte rendu :
${entNote || 'non généré'}

Transcription :
${entTranscript}`,
            },
          ],
          temperature: 0.2,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI ${resp.status} : ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const txt = stripClinicalMarkdown(data.choices?.[0]?.message?.content || '');
      setEntPrescription(txt);
      if (entRecordId) {
        try { await updateEntretien(entRecordId, { prescription: txt, doctor_name: entDoctorName || null, doctor_signature: entDoctorSignature || null }); } catch (e) { console.warn(e); }
      }
      try { setEntHistory(await listEntretiens()); } catch {}
    } catch (e) {
      setEntError(e.message);
    } finally {
      setEntGeneratingDoc('');
    }
  };

  const togglePrescriptionDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setEntError('Dictée ordonnance non disponible dans ce navigateur.');
      return;
    }
    if (entPrescriptionRecRef.current) {
      try { entPrescriptionRecRef.current.stop(); } catch {}
      entPrescriptionRecRef.current = null;
      setEntPrescriptionListening(false);
      return;
    }
    setEntError(null);
    const rec = new SpeechRecognition();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalTxt = '';
      let interimTxt = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalTxt += txt;
        else interimTxt += txt;
      }
      if (finalTxt) {
        setEntPrescriptionDraft(prev => `${prev}${prev ? ' ' : ''}${finalTxt.trim()}`.trim());
      }
      if (interimTxt) setEntError(`Dictée en cours : ${interimTxt.trim()}`);
    };
    rec.onerror = (e) => {
      setEntError('Dictée ordonnance : ' + (e.error || 'erreur micro'));
      setEntPrescriptionListening(false);
      entPrescriptionRecRef.current = null;
    };
    rec.onend = () => {
      setEntPrescriptionListening(false);
      entPrescriptionRecRef.current = null;
      setEntError(null);
    };
    entPrescriptionRecRef.current = rec;
    setEntPrescriptionListening(true);
    rec.start();
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
        .then(() => setEcosSaveState(withUpdatedAt.data.status === 'finished' ? 'Session enregistrée' : 'Brouillon enregistré'))
        .catch(e => {
          console.warn('upsertEcosAttempt', e);
          setEcosSaveState('Sauvegarde locale seulement');
        });
    } else {
      setEcosSaveState('Brouillon local enregistré');
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

  const openEcosAttempt = (attempt) => {
    if (!attempt?.data) return;
    const d = attempt.data;
    const foundCase = allEcosCases.find(c => c.id === attempt.case_id || c.id === d.caseId);
    if (!foundCase) {
      setEcosError('Cas introuvable pour cette trace.');
      return;
    }
    setEcosCase(foundCase);
    setEcosMessages(Array.isArray(d.messages) ? d.messages : []);
    setEcosInput(d.input || '');
    setEcosEvaluation(d.evaluation || null);
    setEcosStartedAt(d.startedAt ? new Date(d.startedAt).getTime() : Date.now());
    setEcosTimeLeft(Number.isFinite(Number(d.timeLeft)) ? Number(d.timeLeft) : (foundCase.duree || 10) * 60);
    setEcosTimerRunning(false);
    setEcosSaveState(d.status === 'finished' ? 'Trace enregistrée' : 'Brouillon repris');
    setMode(d.evaluation ? 'ecos-results' : 'ecos');
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
          { role: 'system', content: `${ecosCase.briefPatient}\n\nRÈGLES IMPORTANTES:\n- Réponds uniquement à la question posée par le candidat.\n- Sois précise et non évasive sur les symptômes/antécédents quand on te les demande.\n- N'ajoute pas spontanément des informations qui n'ont pas été demandées.` },
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
            content: `Tu es un examinateur ECOS strict, constant et déterministe. Tu dois noter UNIQUEMENT à partir de la grille fournie et du transcript fourni.
Règles impératives:
1) Évalue TOUS les items de la grille, dans le même ordre.
2) pointsObtenus est borné entre 0 et pointsMax.
3) Si un critère n'est pas explicitement exploré par le candidat (question/verification active), mettre 0.
4) Pas d'invention: aucune information absente du transcript.
5) Commentaires courts, factuels, citant le comportement observé.
6) Sois sévère: une mention vague sans précision clinique = 0 ou score minimal.
7) N'accorde aucun point sur une simple salutation, reformulation, ou hypothèse non argumentée.
Réponds STRICTEMENT en JSON valide:
{"items":[{"section":"...","critere":"...","pointsMax":n,"pointsObtenus":n,"commentaire":"..."}],"feedbackGlobal":"...","pointsForts":["..."],"axesAmelioration":["..."]}.
Total /${totalPoints}, ensuite cohérent avec une note /20.`,
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
      if (meta.doctor_name) {
        setEntDoctorName(meta.doctor_name);
        try { localStorage.setItem('doctor_name', meta.doctor_name); } catch {}
      }
      if (meta.doctor_signature) {
        setEntDoctorSignature(meta.doctor_signature);
        try { localStorage.setItem('doctor_signature', meta.doctor_signature); } catch {}
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
    setMode('qcm'); setQuestions([]); setPages([]); setQuizQuestions([]);
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
      position: 'relative',
    }}>
      <div className="paper-grain" aria-hidden="true" />
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

        /* ---------- Premium : eyebrow tags ---------- */
        .eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.22em; text-transform: uppercase;
          color: var(--c-ink-mute);
          padding: 4px 10px;
          border: 1px solid var(--c-line);
          border-radius: 999px;
          background: var(--c-surface);
        }
        .eyebrow::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: var(--c-accent);
          box-shadow: 0 0 0 2px rgba(181,65,37,0.16);
        }
        .eyebrow--accent { color: var(--c-accent); border-color: rgba(181,65,37,0.28); }

        /* ---------- Premium : double-bezel (carte dans une carte) ---------- */
        .bezel {
          padding: 6px;
          background: linear-gradient(180deg, #efeadc 0%, #e6dfc8 100%);
          border: 1px solid #d6d0c1;
          border-radius: calc(var(--r-md) + 6px);
          box-shadow: var(--shadow-card);
          transition: box-shadow var(--d-base) var(--ease-out-quart),
                      transform var(--d-base) var(--ease-out-quart);
        }
        .bezel:hover { box-shadow: var(--shadow-lift); transform: translateY(-2px); }
        .bezel-inner {
          background: var(--c-surface);
          border-radius: var(--r-md);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
          position: relative; overflow: hidden;
        }
        .bezel-dropzone .bezel-inner {
          background: rgba(255,255,255,0.55);
          border: 1px dashed #b8b09c;
        }
        .bezel-dropzone:hover .bezel-inner { background: rgba(255,255,255,0.8); border-color: #8a8273; }
        .bezel-dropzone--over .bezel-inner { background: #ece7d8; border-color: var(--c-accent); border-style: solid; }

        /* ---------- Premium : CTA orbit (button-in-button arrow) ---------- */
        .cta-orbit {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 10px 10px 10px 22px;
          background: var(--c-ink); color: var(--c-bg);
          border-radius: 999px;
          font-size: 14px; font-weight: 500;
          transition: background var(--d-base) var(--ease-out-quart),
                      transform var(--d-base) var(--ease-out-quart),
                      box-shadow var(--d-base) var(--ease-out-quart);
        }
        .cta-orbit:hover { background: var(--c-accent); transform: translateY(-1px); box-shadow: 0 12px 28px -10px rgba(181,65,37,0.45); }
        .cta-orbit:active { transform: translateY(0) scale(0.98); }
        .cta-orbit .orbit-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.12);
          transition: transform var(--d-base) var(--ease-out-expo),
                      background var(--d-base) var(--ease-out-quart);
        }
        .cta-orbit:hover .orbit-icon { transform: translateX(3px) translateY(-1px) scale(1.06); background: rgba(255,255,255,0.2); }

        /* Variante claire pour fond sombre/sur carte foncée */
        .cta-orbit--light {
          background: var(--c-surface); color: var(--c-ink);
          border: 1px solid var(--c-line);
        }
        .cta-orbit--light:hover { background: var(--c-ink); color: var(--c-bg); border-color: var(--c-ink); }
        .cta-orbit--light .orbit-icon { background: rgba(26,26,26,0.06); }
        .cta-orbit--light:hover .orbit-icon { background: rgba(255,255,255,0.18); }

        /* ---------- Premium : scroll-reveal ---------- */
        .reveal {
          opacity: 0; transform: translateY(24px);
          filter: blur(4px);
          transition: opacity 800ms var(--ease-out-expo),
                      transform 800ms var(--ease-out-expo),
                      filter 600ms var(--ease-out-quart);
          will-change: opacity, transform, filter;
        }
        .reveal--in { opacity: 1; transform: translateY(0); filter: blur(0); }

        /* ---------- Premium : paper grain (fixed, performant) ---------- */
        .paper-grain {
          position: fixed; inset: 0; pointer-events: none;
          z-index: 1; opacity: 0.045; mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
        }

        /* ---------- ECOS picker card ---------- */
        .ecos-card {
          background: var(--c-surface);
          border: 1px solid var(--c-line);
          border-radius: var(--r-md);
          padding: 20px;
          cursor: pointer;
          transition: transform var(--d-base) var(--ease-out-quart),
                      box-shadow var(--d-base) var(--ease-out-quart),
                      border-color var(--d-base) var(--ease-out-quart);
        }
        .ecos-card:hover {
          transform: translateY(-2px);
          border-color: var(--c-ink-mute);
          box-shadow: var(--shadow-lift);
        }

        /* ---------- Premium : section macro-spacing ---------- */
        .section-macro { padding-top: clamp(48px, 7vw, 96px); padding-bottom: clamp(48px, 7vw, 96px); }
        .section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, var(--c-line) 18%, var(--c-line) 82%, transparent 100%);
          margin: clamp(48px, 6vw, 80px) 0;
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
          .drop-zone--over, .bezel:hover, .cta-orbit:hover .orbit-icon { transform: none !important; }
          .reveal { opacity: 1 !important; transform: none !important; filter: none !important; }
        }
      `}</style>

      <header className="border-b" style={{ borderColor: '#d6d0c1', position: 'relative', zIndex: 2, background: '#f6f3ec' }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-4 cursor-pointer" onClick={() => mode !== 'quiz' && setMode('home')}>
            <h1 className="display text-2xl md:text-3xl" style={{ fontWeight: 600 }}>Boîte à outils médicale</h1>
            {mode !== 'home' && mode !== 'qcm' && filename && (
              <span className="mono text-xs" style={{ color: '#5a5a5a' }}>{filename}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'home' && mode !== 'qcm' && mode !== 'quiz' && (
              <button onClick={reset} className="btn-secondary px-3 py-1.5 text-xs">Nouveau</button>
            )}
            {supabaseEnabled && session && (
              <button onClick={() => setMode('library')} className="btn-secondary px-3 py-1.5 text-xs">
                <IconStar size={13} filled /> Mes decks ({decks.length})
              </button>
            )}
            {supabaseEnabled && (session
              ? <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs" title={session.user?.email}>Déconnexion</button>
              : <button onClick={() => setShowAuth(true)} className="btn-secondary px-3 py-1.5 text-xs">Connexion</button>
            )}
            <button onClick={() => setShowSettings(true)} className="btn-secondary px-3 py-1.5 text-xs">
              <IconCog size={13} /> Réglages
            </button>
          </div>
        </div>
      </header>

      {/* Barre de menu — bascule entre les outils */}
      <nav className="border-b" style={{ borderColor: '#d6d0c1', background: '#f6f3ec', position: 'relative', zIndex: 2 }}>
        <TabBar
          tabs={[
            { key: 'home', label: 'Accueil' },
            { key: 'qcm', label: 'QCM / QROC' },
            { key: 'ecos', label: 'ECOS' },
            { key: 'analyse', label: 'Analyse partiels' },
            { key: 'entretien', label: 'Entretien' },
          ]}
          activeKey={
            mode === 'home' ? 'home'
            : mode === 'ecos' || mode === 'ecos-results' ? 'ecos'
            : mode === 'analyse' ? 'analyse'
            : mode === 'entretien' ? 'entretien'
            : 'qcm'
          }
          onSelect={(key) => {
            if (key === 'home') {
              setMode('home');
            } else if (key === 'qcm') {
              if (mode !== 'qcm' && mode !== 'extract' && mode !== 'quiz' && mode !== 'results' && mode !== 'library') reset();
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
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'rgba(26,26,26,0.5)' }}
             onClick={() => setShowSettings(false)}>
          <div className="bg-white p-8 max-w-lg w-full mx-4 modal-panel" style={{ borderRadius: 'var(--r-md)' }} onClick={e => e.stopPropagation()}>
            <h2 className="display text-2xl mb-4" style={{ fontWeight: 600 }}>Réglages</h2>
            <p className="text-sm mb-6" style={{ color: '#5a5a5a' }}>
              La clé reste stockée localement dans ton navigateur et n'est envoyée qu'à OpenAI.
            </p>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Clé API OpenAI</label>
            <div className="flex gap-2 mb-5">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => persistKey(e.target.value)}
                placeholder="sk-..." className="input-field flex-1" />
              <button onClick={() => setShowKey(!showKey)} className="btn-secondary px-3 text-xs" aria-label={showKey ? 'Cacher la clé' : 'Voir la clé'}>
                {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
            </div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8a8a8a' }}>Modèle</label>
            <input type="text" value={model} onChange={e => persistModel(e.target.value)} className="input-field w-full mb-2" />
            <p className="text-xs mb-5" style={{ color: '#8a8a8a' }}>
              Suggestions : <code className="mono">gpt-5.4-mini</code> (recommandé, ~0,07 ¢/QROC) · <code className="mono">gpt-5.4-nano</code> (5× moins cher) · <code className="mono">gpt-5.5</code> (max qualité)
            </p>
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <span className="switch">
                <input type="checkbox" checked={useAI} onChange={e => persistUseAI(e.target.checked)} />
                <span className="slider" />
              </span>
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

      <main className="max-w-7xl mx-auto px-6 py-8" style={{ display: mode === 'analyse' || mode === 'entretien' ? 'none' : '', position: 'relative', zIndex: 2 }}>

        {mode === 'home' && (
          <>
            {/* HOME — présentation de la boîte à outils */}
            <section className="section-macro" style={{ paddingTop: 'clamp(40px, 6vw, 96px)' }}>
              <Reveal className="anim-fade-up">
                <Eyebrow>Boîte à outils médicale — externat médecine</Eyebrow>
              </Reveal>
              <Reveal delay={80} className="anim-fade-up" as="h1">
                <span className="display block mt-5" style={{
                  fontWeight: 600, fontSize: 'clamp(40px, 7vw, 88px)',
                  lineHeight: 1.0, letterSpacing: '-0.035em',
                }}>
                  Quatre outils,<br />
                  <span style={{ color: 'var(--c-ink-soft)' }}>une seule discipline.</span>
                </span>
              </Reveal>
              <Reveal delay={160} className="anim-fade-up">
                <p className="mt-7 max-w-xl" style={{ color: 'var(--c-ink-soft)', fontSize: 18, lineHeight: 1.55 }}>
                  Une suite d'outils que je m'écris à mesure que j'avance dans l'externat.
                  Chacun résout un problème concret&nbsp;: réviser, simuler, analyser, structurer.
                </p>
              </Reveal>
            </section>

            <div className="section-divider" />

            {/* Les 4 outils */}
            <section>
              <Reveal>
                <Eyebrow>Sommaire</Eyebrow>
              </Reveal>
              <div className="grid md:grid-cols-2 gap-5 mt-8">
                {[
                  { n: '01', k: 'qcm', t: 'QCM / QROC', d: 'Extraction d\'un PDF de cours corrigé, génération automatique d\'un quiz, sauvegarde des decks et des favoris.' },
                  { n: '02', k: 'ecos', t: 'ECOS', d: 'Patient simulé par IA, dictée vocale, notation détaillée /20 par section. 132 cas Fac intégrés + import PDF.' },
                  { n: '03', k: 'analyse', t: 'Analyse partiels', d: 'Lecture rapide de tes partiels passés, repérage des questions récurrentes et des pièges.' },
                  { n: '04', k: 'entretien', t: 'Entretien', d: 'Dossier patient → entretien guidé. Anamnèse, examen, hypothèses, restitution écrite.' },
                ].map((c, i) => (
                  <Reveal key={c.k} delay={80 + i * 80}>
                    <div
                      onClick={() => {
                        if (c.k === 'qcm') reset();
                        else setMode(c.k);
                      }}
                      className="bezel cursor-pointer"
                      style={{ display: 'block', height: '100%' }}
                    >
                      <div className="bezel-inner" style={{ padding: 'clamp(28px, 3vw, 40px)', height: '100%' }}>
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="mono text-xs mb-5" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.16em' }}>{c.n}</div>
                            <div className="display" style={{
                              fontWeight: 600,
                              fontSize: 'clamp(22px, 2.4vw, 30px)',
                              letterSpacing: '-0.02em', lineHeight: 1.1,
                            }}>{c.t}</div>
                            <div className="mt-3 text-sm" style={{ color: 'var(--c-ink-soft)', lineHeight: 1.55 }}>{c.d}</div>
                          </div>
                          <span className="cta-orbit shrink-0">
                            Ouvrir
                            <span className="orbit-icon"><IconArrowRight size={14} stroke={2} /></span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>

            <div className="section-divider" />

            {/* Note signature */}
            <Reveal>
              <p className="mono text-xs" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Atelier personnel · Hugo Bette · {new Date().getFullYear()}
              </p>
            </Reveal>
          </>
        )}

        {mode === 'qcm' && (
          <>
            {/* Hero : eyebrow + intro typographique */}
            <section className="section-macro" style={{ paddingTop: 'clamp(32px, 5vw, 64px)' }}>
              <Reveal className="anim-fade-up">
                <Eyebrow>Outil 01 / Extraction & Quiz</Eyebrow>
              </Reveal>
              <Reveal delay={80} className="anim-fade-up" as="h1">
                <span className="display block mt-5" style={{
                  fontWeight: 600, fontSize: 'clamp(36px, 6vw, 72px)',
                  lineHeight: 1.02, letterSpacing: '-0.03em',
                }}>
                  Tes cours corrigés,<br />
                  <span style={{ color: 'var(--c-ink-soft)' }}>en quiz prêt à réviser.</span>
                </span>
              </Reveal>
              <Reveal delay={160} className="anim-fade-up">
                <p className="mt-6 max-w-xl" style={{ color: 'var(--c-ink-soft)', fontSize: 17, lineHeight: 1.55 }}>
                  Dépose un PDF de cours dont les bonnes réponses sont écrites en vert. L'app détecte, génère
                  le quiz, te corrige et garde tes erreurs en mémoire.
                </p>
              </Reveal>
            </section>

            {/* Drop zone double-bezel */}
            <Reveal delay={120}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`bezel bezel-dropzone cursor-pointer ${dragOver ? 'bezel-dropzone--over' : ''}`}
                style={{ display: 'block' }}
              >
                <div className="bezel-inner flex flex-col items-center justify-center text-center"
                  style={{ padding: 'clamp(48px, 7vw, 96px) 32px', minHeight: '300px' }}>
                  <input ref={fileInputRef} type="file"
                    accept=".pdf,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    className="hidden"
                    onChange={e => handleFile(e.target.files?.[0])} />
                  <Eyebrow accent>{processing ? 'En cours' : 'Glisser-déposer'}</Eyebrow>
                  <div className="display mt-5" style={{
                    fontWeight: 500,
                    fontSize: 'clamp(22px, 2.6vw, 32px)',
                    letterSpacing: '-0.02em',
                  }}>
                    {processing ? 'Extraction en cours…' : 'Dépose un PDF ou PPTX'}
                  </div>
                  <div className="text-sm mt-2" style={{ color: 'var(--c-ink-soft)' }}>
                    {processing
                      ? `${progress.label} (${progress.current}/${progress.total})`
                      : 'Détection automatique des bonnes réponses + mode quiz interactif'}
                  </div>
                  {processing && progress.total > 0 && (
                    <div className="w-full max-w-md mt-6 h-1" style={{ background: 'var(--c-line)', borderRadius: 999 }}>
                      <div className="h-full progress-bar" style={{
                        background: 'var(--c-accent)', borderRadius: 999,
                        width: `${(progress.current / progress.total) * 100}%`,
                      }} />
                    </div>
                  )}
                  {error && <div className="text-sm mt-4" style={{ color: 'var(--c-accent)' }}>{error}</div>}
                </div>
              </div>
            </Reveal>

            {supabaseEnabled && session && decks.length > 0 && (
              <Reveal delay={80} className="mt-6 flex flex-wrap gap-3 items-center">
                <button onClick={() => setMode('library')} className="btn-secondary px-4 py-2 text-sm">
                  Ouvrir un deck sauvegardé ({decks.length})
                </button>
                <button onClick={startFavoritesQuiz} className="btn-primary px-4 py-2 text-sm">
                  <IconStar size={14} filled /> Quiz sur mes favoris ({decks.reduce((n, d) => n + (d.questions || []).filter(q => q.favorite).length, 0)})
                </button>
              </Reveal>
            )}

            <div className="section-divider" />

            {/* Features — eyebrow + grille épurée */}
            <section>
              <Reveal>
                <Eyebrow>Pourquoi cet outil</Eyebrow>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="display mt-5" style={{
                  fontWeight: 600,
                  fontSize: 'clamp(28px, 3.4vw, 44px)',
                  letterSpacing: '-0.02em', lineHeight: 1.1,
                  maxWidth: '720px',
                }}>
                  Trois principes : détection silencieuse, correction immédiate, évaluation honnête.
                </h2>
              </Reveal>
              <div className="grid md:grid-cols-3 gap-5 mt-12">
                {[
                  { n: '01', t: 'Auto-correction', d: 'Détection des bonnes réponses par analyse de la couleur du texte (vert = correct).' },
                  { n: '02', t: 'Quiz interactif', d: 'Tu réponds, l\'app corrige immédiatement. Score, erreurs, et possibilité de revoir.' },
                  { n: '03', t: 'Évaluation IA', d: 'Pour les QROC, OpenAI évalue ta réponse même si elle ne matche pas exactement la référence.' },
                ].map((c, i) => (
                  <Reveal key={i} delay={80 + i * 100}>
                    <div className="card-hover p-7" style={{
                      background: 'var(--c-surface)',
                      border: '1px solid var(--c-line)',
                      borderRadius: 'var(--r-md)',
                      height: '100%',
                    }}>
                      <div className="mono text-xs mb-6" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.16em' }}>{c.n}</div>
                      <div className="display text-lg mb-2" style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>{c.t}</div>
                      <div className="text-sm" style={{ color: 'var(--c-ink-soft)', lineHeight: 1.55 }}>{c.d}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          </>
        )}

        {mode === 'ecos' && !ecosCase && (
          <>
            {/* Hero éditorial */}
            <section className="section-macro" style={{ paddingTop: 'clamp(32px, 5vw, 64px)', paddingBottom: 'clamp(28px, 4vw, 56px)' }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div style={{ maxWidth: 720 }}>
                  <Reveal className="anim-fade-up">
                    <Eyebrow>Outil 02 / Examen clinique simulé</Eyebrow>
                  </Reveal>
                  <Reveal delay={80} className="anim-fade-up" as="h1">
                    <span className="display block mt-5" style={{
                      fontWeight: 600, fontSize: 'clamp(36px, 6vw, 72px)',
                      lineHeight: 1.02, letterSpacing: '-0.03em',
                    }}>
                      Le patient,<br />
                      <span style={{ color: 'var(--c-ink-soft)' }}>tu l'as en face de toi.</span>
                    </span>
                  </Reveal>
                  <Reveal delay={160} className="anim-fade-up">
                    <p className="mt-6 max-w-xl" style={{ color: 'var(--c-ink-soft)', fontSize: 17, lineHeight: 1.55 }}>
                      Tu mènes l'entretien, l'IA joue le rôle. Dictée vocale, timer
                      réglementaire, notation détaillée à la fin. {visibleEcosCases.length} cas disponibles.
                    </p>
                  </Reveal>
                </div>
                <Reveal delay={120}>
                  <button onClick={() => setMode('home')} className="btn-secondary px-3 py-1.5 text-xs"><IconArrowLeft size={12} /> Accueil</button>
                </Reveal>
              </div>
            </section>

            {!apiKey && (
              <Reveal>
                <div className="p-4 mb-6 text-sm" style={{ background: '#fff8e0', borderLeft: '3px solid #c4a84d', color: '#5a4a10' }}>
                  Aucune clé OpenAI configurée. Ouvre les <button onClick={() => setShowSettings(true)} className="underline">Réglages</button> pour la renseigner avant de démarrer un ECOS.
                </div>
              </Reveal>
            )}

            {/* Barre de filtres + import */}
            <Reveal>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b" style={{ borderColor: 'var(--c-line)' }}>
                <div className="flex items-center gap-3">
                  <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.18em' }}>Catégorie</span>
                  <select value={ecosCategory} onChange={(e) => setEcosCategory(e.target.value)} className="input-field text-xs py-1.5">
                    <option value="all">Toutes</option>
                    {ecosCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <button onClick={() => { setEcosImportOpen(v => !v); setEcosImportError(null); }}
                  className="btn-secondary px-3 py-1.5 text-xs">
                  {ecosImportOpen ? <><IconX size={11} /> Fermer l'import</> : <><IconPlus size={11} /> Importer un ECOS (PDF)</>}
                </button>
              </div>
            </Reveal>

            {ecosImportOpen && (
              <Reveal>
                <div className="bezel mb-8" style={{ display: 'block' }}>
                  <div className="bezel-inner" style={{ padding: 'clamp(24px, 3vw, 36px)' }}>
                    <Eyebrow accent>Importer un ECOS depuis un PDF</Eyebrow>
                    <div className="mt-4">
                      <input
                        ref={ecosImportInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => handleEcosImportFile(e.target.files?.[0])}
                        disabled={ecosImportProcessing}
                        className="text-sm"
                      />
                    </div>
                    {ecosImportFilename && <div className="mono text-xs mt-2" style={{ color: 'var(--c-ink-soft)' }}>Fichier : {ecosImportFilename}</div>}
                    {ecosImportProcessing && <div className="text-xs mt-2 mono" style={{ color: 'var(--c-ink-soft)' }}>Extraction + génération via GPT…</div>}
                    {ecosImportError && <div className="text-xs mt-2" style={{ color: 'var(--c-accent)' }}>{ecosImportError}</div>}
                    {ecosImportPreview && (
                      <div className="mt-4 p-4" style={{ background: 'var(--c-bg)', borderRadius: 'var(--r-md)' }}>
                        <div className="display text-base mb-1" style={{ fontWeight: 600 }}>{ecosImportPreview.titre}</div>
                        <div className="mono text-xs mb-2" style={{ color: 'var(--c-accent)' }}>{ecosImportPreview.specialite} · {ecosImportPreview.duree} min</div>
                        <div className="text-xs mb-2" style={{ color: 'var(--c-ink-soft)' }}>
                          Grille : {ecosImportPreview.grilleCorrection.length} items · {ecosImportPreview.grilleCorrection.reduce((s, it) => s + (Number(it.points) || 0), 0)} pts
                        </div>
                        <details className="text-xs">
                          <summary className="cursor-pointer">Aperçu consigne candidat</summary>
                          <div className="mt-2 whitespace-pre-wrap" style={{ color: 'var(--c-ink)' }}>{ecosImportPreview.consigneCandidat}</div>
                        </details>
                        <div className="mt-3 flex gap-2">
                          <button onClick={saveImportedCase} className="btn-primary px-3 py-1.5 text-xs">Enregistrer dans ma banque</button>
                          <button onClick={() => setEcosImportPreview(null)} className="btn-secondary px-3 py-1.5 text-xs">Annuler</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            )}

            {ecosAttempts.length > 0 && (
              <Reveal>
                <section className="mb-12">
                  <div className="flex items-baseline justify-between gap-4 mb-5">
                    <Eyebrow>Mes traces — {ecosAttempts.length} session{ecosAttempts.length > 1 ? 's' : ''}</Eyebrow>
                    <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.16em' }}>BROUILLONS &amp; TERMINÉS</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {ecosAttempts.slice(0, 6).map(attempt => {
                      const d = attempt.data || {};
                      const isFinished = d.status === 'finished';
                      return (
                        <div key={attempt.case_id} className="flex items-center justify-between gap-3 p-4"
                          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-md)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm truncate" style={{ fontWeight: 600 }}>{d.caseTitle || attempt.case_id}</div>
                            <div className="mono text-[10px] mt-1" style={{ color: 'var(--c-ink-mute)' }}>
                              {isFinished ? 'TERMINÉ' : 'BROUILLON'} · {formatEcosAttemptDate(attempt)}
                            </div>
                          </div>
                          <button
                            onClick={() => openEcosAttempt(attempt)}
                            className={isFinished ? 'btn-primary px-3 py-1.5 text-xs shrink-0' : 'btn-secondary px-3 py-1.5 text-xs shrink-0'}
                          >
                            {isFinished ? <><IconEye size={11} /> Voir</> : <><IconPlay size={11} /> Reprendre</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </Reveal>
            )}

            <Reveal>
              <div className="flex items-baseline justify-between gap-4 mb-6">
                <Eyebrow>Banque de cas — {visibleEcosCases.length}</Eyebrow>
                <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.16em' }}>CLIQUE POUR DÉMARRER</span>
              </div>
            </Reveal>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleEcosCases.map((c, idx) => {
                const isCustom = !!customCases.find(cc => cc.id === c.id);
                const lastAttempt = ecosAttempts.find(a => a.case_id === c.id);
                const inProgress = lastAttempt?.data?.status === 'in_progress';
                const finished = lastAttempt?.data?.status !== 'in_progress' && lastAttempt?.data?.finishedAt;
                const points = (c.grilleCorrection || []).reduce((s, it) => s + (Number(it.points) || 0), 0);
                const num = String(idx + 1).padStart(2, '0');
                return (
                  <div key={c.id} className="ecos-card relative" onClick={() => startEcos(c)}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.16em' }}>{num}</span>
                      <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.12em' }}>{c.duree} MIN</span>
                    </div>
                    <div className="display text-base mb-2" style={{ fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{c.titre}</div>
                    <div className="mono text-[10px] mb-3" style={{ color: 'var(--c-accent)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{c.specialite}</div>
                    <div className="text-xs" style={{ color: 'var(--c-ink-soft)' }}>
                      {(c.grilleCorrection || []).length} items · {points} pts
                    </div>
                    {(inProgress || finished || isCustom) && (
                      <div className="mt-3 pt-3 flex flex-wrap gap-2 items-center" style={{ borderTop: '1px solid var(--c-line)' }}>
                        {inProgress && (
                          <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#fff8e0', color: '#5a4a10', border: '1px solid #c4a84d', letterSpacing: '0.1em' }}>EN COURS</span>
                        )}
                        {finished && (
                          <span className="mono text-[10px] px-2 py-0.5" style={{ background: '#e6f3e0', color: '#2d5a1a', border: '1px solid #9ec28f', letterSpacing: '0.1em' }}>FAIT</span>
                        )}
                        <span className="mono text-[10px] px-2 py-0.5" style={{
                          background: isCustom ? '#fff0d6' : 'var(--c-bg)',
                          color: isCustom ? '#7a5210' : 'var(--c-ink-mute)',
                          border: '1px solid ' + (isCustom ? '#dfc88a' : 'var(--c-line)'),
                          letterSpacing: '0.1em',
                        }}>{isCustom ? 'PERSO' : 'FAC'}</span>
                        {isCustom && (
                          <button onClick={(e) => { e.stopPropagation(); deleteCustomCase(c.id); }}
                            className="ml-auto text-xs underline" style={{ color: 'var(--c-accent)' }}>Supprimer</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
                          : <><IconPlay size={11} /> {ecosTimeLeft === (ecosCase.duree || 10) * 60 ? 'Démarrer' : 'Reprendre'}</>}
                      </button>
                    </div>
                  );
                })()}
                <button
                  onClick={() => saveEcosSession('in_progress')}
                  disabled={ecosEvaluating}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  <IconSave size={11} /> Enregistrer brouillon
                </button>
                <button onClick={() => { if (confirm('Abandonner cet ECOS ?')) { saveEcosSession('abandoned'); setEcosTimerRunning(false); setEcosCase(null); setEcosMessages([]); setEcosInput(''); } }}
                  className="btn-secondary px-3 py-1.5 text-xs">Abandonner</button>
                <button onClick={finishEcos} disabled={ecosEvaluating || ecosMessages.length === 0}
                  className="btn-primary px-4 py-1.5 text-xs">
                  {ecosEvaluating ? 'Évaluation…' : <>Terminer l'ECOS <IconArrowRight size={12} /></>}
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
                      Le patient attend. Commence ton interrogatoire (présentation, motif, anamnèse…).
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
                          {m.role === 'user' ? 'Vous (médecin)' : 'Patient'}
                        </div>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {ecosSending && (
                    <div className="flex justify-start chat-bubble">
                      <div className="p-3 text-sm italic flex items-center gap-2" style={{ background: '#f6f3ec', color: '#8a8a8a', borderRadius: 'var(--r-sm)' }}>
                        <span>Le patient réfléchit</span>
                        <span className="think-dot">·</span>
                        <span className="think-dot">·</span>
                        <span className="think-dot">·</span>
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
                    <button
                      onClick={() => {
                        if (ecosRecording) stopRecording();
                        else if (ecosInput.trim()) sendEcosMessage();
                        else startRecording();
                      }}
                      disabled={ecosSending || ecosTranscribing}
                      title={ecosRecording ? 'Arrêter la dictée' : (ecosInput.trim() ? 'Envoyer' : 'Dicter (Whisper)')}
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
            {ecosScore.sur20 >= 18 && <Confetti />}
            <div className="text-center py-8 mb-8 border-b" style={{ borderColor: '#d6d0c1' }}>
              <div className="mono text-xs mb-2 anim-fade-up" style={{ color: '#8a8a8a' }}>
                {ecosCase.titre} · {ecosCase.specialite}
              </div>
              <div className="display text-5xl mb-2 score-reveal" style={{ fontWeight: 600 }}>
                {ecosScore.sur20} / 20
              </div>
              <div className="text-sm anim-fade-up anim-stagger-2" style={{ color: '#5a5a5a' }}>
                {ecosScore.obtenu} / {ecosScore.total} points · {Math.round((ecosScore.obtenu / ecosScore.total) * 100)} %
              </div>
              <div className="flex justify-center gap-2 mt-6 anim-fade-up anim-stagger-3">
                <button onClick={() => { setEcosCase(null); setEcosEvaluation(null); setEcosMessages([]); setMode('ecos'); }}
                  className="btn-secondary px-4 py-2 text-sm">Autre cas</button>
                <button onClick={() => saveEcosSession('finished', { finishedAt: new Date().toISOString() })}
                  className="btn-secondary px-4 py-2 text-sm"><IconSave size={12} /> Enregistrer la trace</button>
                <button onClick={() => startEcos(ecosCase)} className="btn-primary px-4 py-2 text-sm">Refaire ce cas</button>
              </div>
              {ecosSaveState && (
                <div className="mono text-[10px] mt-3" style={{ color: '#8a8a8a' }}>
                  {ecosSaveState}
                </div>
              )}
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

            <h3 className="display text-xl mb-4" style={{ fontWeight: 600 }}>Grille claire des points</h3>
            <div className="space-y-2 mb-8">
              {(ecosCase.grilleCorrection || []).map((g, i) => {
                const got = (ecosEvaluation.items || []).find(it => (it.critere || '').trim() === (g.critere || '').trim());
                return (
                  <div key={i} className="p-3 border" style={{ borderColor: '#d6d0c1', background: '#fff' }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm"><strong>{g.section}</strong> — {g.critere}</div>
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
                      {favCount > 0 && <span style={{ color: '#c4a84d', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}> · <IconStar size={11} filled /> {favCount}</span>}
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
                    {savingDeck
                      ? 'Sauvegarde…'
                      : <><IconSave size={14} /> {session ? 'Sauvegarder ce deck' : 'Sauvegarder (connexion)'}</>}
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
                  className="btn-primary px-4 py-2 text-sm">Quiz en aléatoire <IconArrowRight size={13} /></button>
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
                      <span className={`pill ${q.type === 'qcm' ? 'pill-qcm' : 'pill-qroc'}`}>{q.type.toUpperCase()}</span>
                      <span className="mono text-xs" style={{ color: '#8a8a8a' }}>p.{q.pageNum}</span>
                      {q.detectionError && <span className="text-xs flex items-center gap-1" style={{ color: '#b54125' }}><IconWarning size={11} /> détection couleur échouée</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {(q.hasNoCorrect || q.hasNoAnswer) && (
                        <span className="text-xs" style={{ color: '#b54125' }}>⚠ aucune réponse</span>
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
              {/* Header de progression — éditorial */}
              <div className="mb-8" style={{ paddingTop: 'clamp(16px, 2vw, 32px)' }}>
                <div className="flex items-baseline justify-between mb-4">
                  <div className="flex items-baseline gap-4">
                    <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                      Question
                    </span>
                    <span className="display" style={{ fontWeight: 600, fontSize: 'clamp(20px, 2vw, 26px)', letterSpacing: '-0.02em' }}>
                      {String(quizIdx + 1).padStart(2, '0')}
                      <span style={{ color: 'var(--c-ink-mute)', fontWeight: 400 }}> / {String(totalQuiz).padStart(2, '0')}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mono text-xs">
                    <span style={{ color: '#6b9d4d' }}>✓ {quizStats.correct}</span>
                    <span style={{ color: 'var(--c-accent)' }}>✗ {quizStats.incorrect}</span>
                    <button onClick={() => { if (confirm('Quitter le quiz ?')) setMode('extract'); }}
                      className="underline" style={{ color: 'var(--c-ink-mute)' }}>Quitter</button>
                  </div>
                </div>
                <div className="h-px" style={{ background: 'var(--c-line)', position: 'relative' }}>
                  <div className="h-px progress-bar" style={{
                    background: 'var(--c-ink)', width: `${((quizIdx + (feedback ? 1 : 0)) / totalQuiz) * 100}%`,
                    position: 'absolute', top: 0, left: 0,
                  }} />
                </div>
              </div>

              <div key={quizIdx} className="bezel anim-fade-up" style={{ display: 'block' }}>
                <div className="bezel-inner" style={{ padding: 'clamp(28px, 4vw, 48px)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <span className={`pill ${q.type === 'qcm' ? 'pill-qcm' : 'pill-qroc'}`}>{q.type.toUpperCase()}</span>
                  <span className="mono text-[10px]" style={{ color: 'var(--c-ink-mute)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>P.{q.pageNum}</span>
                  <button onClick={() => toggleFavorite(q.id)} className="ml-auto star-btn p-1 -m-1" title="Favori" aria-label="Favori">
                    <span key={String(q.favorite)} className={q.favorite ? 'star-pop inline-block' : 'inline-block'} style={{ color: q.favorite ? '#c4a84d' : '#cfc7b4' }}>
                      <IconStar size={18} filled={q.favorite} />
                    </span>
                  </button>
                </div>

                {q.context && (
                  <div className="mb-6 p-5 text-sm italic" style={{
                    background: 'var(--c-bg)', color: 'var(--c-ink)', borderRadius: 'var(--r-sm, 4px)',
                    borderLeft: '2px solid var(--c-ink-mute)',
                  }}>{q.context}</div>
                )}

                <div className="display mb-8" style={{
                  fontWeight: 500,
                  fontSize: 'clamp(20px, 2.2vw, 26px)',
                  lineHeight: 1.4, letterSpacing: '-0.01em',
                  whiteSpace: 'pre-wrap',
                }}>
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
                      {quizIdx + 1 >= totalQuiz ? 'Voir les résultats' : 'Suivante'} <IconArrowRight size={14} />
                    </button>
                  )}
                </div>
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
                {Math.round((quizStats.correct / quizStats.total) * 100)} % de bonnes réponses
              </div>
              <div className="flex justify-center gap-4 mt-4 mono text-sm anim-fade-up anim-stagger-3">
                <span style={{ color: '#6b9d4d' }}>✓ {quizStats.correct} correctes</span>
                {quizStats.partial > 0 && <span style={{ color: '#c4a84d' }}>~ {quizStats.partial} partielles</span>}
                <span style={{ color: '#b54125' }}>✗ {quizStats.incorrect} incorrectes</span>
              </div>
              <div className="flex justify-center gap-2 mt-6 anim-fade-up anim-stagger-4">
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

      {mode === 'entretien' && (
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h1 className="display text-3xl mb-2" style={{ fontWeight: 600 }}>Entretien patient</h1>
            <p className="text-sm" style={{ color: '#5a5a5a' }}>
              Enregistre ou importe un entretien (jusqu'à 30 min). L'IA produit une observation médicale structurée.
            </p>
            {supabaseEnabled && session && (
              <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                ☁ Audio + transcript + restitution stockés sur ton compte Supabase et auto-supprimés après 24h.
              </p>
            )}
            {supabaseEnabled && !session && (
              <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                Connecte-toi pour conserver les entretiens 24h sur ton compte (sinon tout reste en local et disparaît au reload).
              </p>
            )}
          </div>

          {!apiKey && (
            <div className="mb-4 p-3 text-sm" style={{ background: '#fdf3ee', border: '1px solid #b54125', color: '#b54125' }}>
              Configure ta clé API OpenAI dans les Réglages pour utiliser cet outil.
            </div>
          )}
          {entError && (
            <div className="mb-4 p-3 text-sm" style={{ background: '#fdf3ee', border: '1px solid #b54125', color: '#b54125' }}>
              {entError}
            </div>
          )}

          <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
            <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>Infos document</h2>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                value={entPatientFirstName}
                onChange={(e) => setEntPatientFirstName(e.target.value)}
                placeholder="Prénom patient (non stocké)"
                className="input-field text-sm"
              />
              <input
                type="text"
                value={entPatientLastName}
                onChange={(e) => setEntPatientLastName(e.target.value)}
                placeholder="Nom patient (non stocké)"
                className="input-field text-sm"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                type="text"
                value={entDoctorName}
                onChange={(e) => setEntDoctorName(e.target.value)}
                onBlur={() => persistDoctorProfile()}
                placeholder="Nom et prénom du médecin"
                className="input-field text-sm"
              />
              <input
                type="text"
                value={entDoctorSignature}
                onChange={(e) => setEntDoctorSignature(e.target.value)}
                onBlur={() => persistDoctorProfile()}
                placeholder="Signature à ajouter en fin de document"
                className="input-field text-sm"
              />
            </div>
            <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
              L'identité patient sert seulement à générer les documents affichés ici. Le profil médecin est conservé sur Supabase.
            </p>
          </section>

          {/* Étape 1 : capture audio */}
          <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
            <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>1. Audio</h2>

            {!entAudioBlob && !entRecording && (
              <div className="flex flex-wrap gap-3">
                <button onClick={startEntRecording} disabled={!apiKey} className="btn-primary px-4 py-2 text-sm">
                  ● Démarrer l'enregistrement
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
                <span className="text-xs" style={{ color: '#5a5a5a' }}>(stop auto à 30:00)</span>
                <button onClick={stopEntRecording} className="btn-primary px-4 py-2 text-sm" style={{ background: '#b54125' }}>
                  ■ Arrêter
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
                  {entUploading && <span className="text-xs" style={{ color: '#8a8a8a' }}>↑ Upload Supabase…</span>}
                  {!entUploading && entRecordId && <span className="text-xs" style={{ color: '#3a7a3a' }}>✓ Stocké (24h)</span>}
                </div>
                {entAudioUrl && <audio controls src={entAudioUrl} className="w-full mb-3" />}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={saveCurrentEntretien}
                    disabled={entUploading}
                    className="btn-primary px-3 py-2 text-xs"
                  >
                    {entRecordId ? 'Enregistrer les modifications' : 'Enregistrer l’audio'}
                  </button>
                  <button onClick={resetEntretien} className="btn-secondary px-3 py-2 text-xs">
                    ↺ Recommencer
                  </button>
                </div>
                {supabaseEnabled && !session && (
                  <p className="text-xs mt-2" style={{ color: '#8a8a8a' }}>
                    Connecte-toi pour enregistrer cet audio sur Supabase.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Étape 2 : transcription */}
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
                  Transcription en cours…
                  {entProgress.total > 1 && ` (segment ${entProgress.current}/${entProgress.total})`}
                </div>
              )}
              {entStep === 'labelling' && (
                <div className="text-sm" style={{ color: '#5a5a5a' }}>
                  Étiquetage Médecin / Patient…
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

          {/* Étape 3 : restitution IA */}
          {(entStep === 'transcribed' || entStep === 'generating' || entStep === 'done') && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>3. Observation structurée</h2>

              {(entStep === 'transcribed' || entStep === 'done') && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={entContext}
                    onChange={(e) => setEntContext(e.target.value)}
                    placeholder="Contexte (optionnel) : ex. consultation de médecine générale, urgences…"
                    className="input-field w-full text-sm mb-3"
                  />
                  <button onClick={generateEntNote} disabled={!apiKey} className="btn-primary px-4 py-2 text-sm">
                    {entStep === 'done' ? '↺ Régénérer la restitution' : 'Générer la restitution'}
                  </button>
                </div>
              )}

              {entStep === 'generating' && (
                <div className="text-sm" style={{ color: '#5a5a5a' }}>Génération en cours…</div>
              )}

              {entNote && (
                <div className="mt-4 p-4" style={{ background: '#faf7ef', border: '1px solid #e6dfc8', borderRadius: 'var(--r-md)' }}>
                  <pre className="whitespace-pre-wrap text-sm" style={{ fontFamily: 'inherit', lineHeight: 1.6 }}>
                    {entNote}
                  </pre>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={saveCurrentEntretien}
                      disabled={entUploading}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Enregistrer
                    </button>
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
                      Télécharger (.md)
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {(entStep === 'done' || entNote || entTranscript) && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <h2 className="display text-lg mb-3" style={{ fontWeight: 600 }}>4. Courrier et ordonnance</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm" style={{ fontWeight: 600 }}>Mail à un confrère</h3>
                    <button
                      onClick={generateEntReferralMail}
                      disabled={!apiKey || entGeneratingDoc === 'mail'}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      {entGeneratingDoc === 'mail' ? 'Génération…' : 'Générer'}
                    </button>
                  </div>
                  <textarea
                    value={entReferralMail}
                    onChange={(e) => setEntReferralMail(e.target.value)}
                    placeholder="Le mail généré apparaîtra ici. Tu peux aussi l’écrire à la main."
                    className="input-field w-full text-sm"
                    rows={10}
                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(entReferralMail)} disabled={!entReferralMail} className="btn-secondary px-3 py-1.5 text-xs">Copier</button>
                    <button onClick={saveCurrentEntretien} disabled={entUploading} className="btn-secondary px-3 py-1.5 text-xs">Enregistrer</button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm" style={{ fontWeight: 600 }}>Ordonnance</h3>
                    <button
                      onClick={generateEntPrescription}
                      disabled={!apiKey || entGeneratingDoc === 'prescription'}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      {entGeneratingDoc === 'prescription' ? 'Génération…' : 'Suggérer IA'}
                    </button>
                  </div>
                  <textarea
                    value={entPrescriptionDraft}
                    onChange={(e) => setEntPrescriptionDraft(e.target.value)}
                    placeholder="Consigne optionnelle : dicte ou écris ce que tu veux prescrire avant suggestion IA."
                    className="input-field w-full text-sm mb-2"
                    rows={4}
                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div className="mb-2">
                    <button onClick={togglePrescriptionDictation} className="btn-secondary px-3 py-1.5 text-xs">
                      {entPrescriptionListening ? 'Arrêter la dictée' : 'Dicter la consigne'}
                    </button>
                  </div>
                  <textarea
                    value={entPrescription}
                    onChange={(e) => setEntPrescription(e.target.value)}
                    placeholder="Ordonnance générée ou rédigée manuellement."
                    className="input-field w-full text-sm"
                    rows={10}
                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(entPrescription)} disabled={!entPrescription} className="btn-secondary px-3 py-1.5 text-xs">Copier</button>
                    <button onClick={saveCurrentEntretien} disabled={entUploading} className="btn-secondary px-3 py-1.5 text-xs">Enregistrer</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Historique 24h */}
          {supabaseEnabled && session && (
            <section className="mb-6 p-5 bg-white" style={{ border: '1px solid #d6d0c1', borderRadius: 'var(--r-md)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="display text-lg" style={{ fontWeight: 600 }}>Mes entretiens (24h)</h2>
                <button onClick={refreshEntHistory} className="btn-secondary px-3 py-1.5 text-xs">↻ Actualiser</button>
              </div>
              {entHistoryLoading && <div className="text-xs" style={{ color: '#8a8a8a' }}>Chargement…</div>}
              {!entHistoryLoading && entHistory.length === 0 && (
                <div className="text-xs" style={{ color: '#8a8a8a' }}>Aucun entretien stocké pour l'instant.</div>
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
                            {row.note ? '✓ Restitution' : (row.transcript ? '✓ Transcrit' : 'Audio brut')}
                            <span className="ml-2">· expire dans {remainH}h{String(remainM).padStart(2, '0')}</span>
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
            background: '#f6f3ec',
            display: 'block',
          }}
        />
      )}

      {mode !== 'analyse' && mode !== 'entretien' && (
        <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 text-xs border-t" style={{ color: '#8a8a8a', borderColor: '#d6d0c1' }}>
          Tout tourne dans le navigateur. Ta clé OpenAI est stockée localement et n'est envoyée qu'à api.openai.com.
          Les PDF ne quittent jamais ta machine.
        </footer>
      )}
    </div>
  );
}
