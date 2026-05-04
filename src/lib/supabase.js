import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && key);
export const supabase = supabaseEnabled ? createClient(url, key) : null;

// ---------- Decks ----------
export async function listDecks() {
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, created_at, questions')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveDeck(name, questions) {
  const { data, error } = await supabase
    .from('decks')
    .insert({ name, questions })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDeckQuestions(id, questions) {
  const { error } = await supabase.from('decks').update({ questions }).eq('id', id);
  if (error) throw error;
}

export async function deleteDeck(id) {
  const { error } = await supabase.from('decks').delete().eq('id', id);
  if (error) throw error;
}

// ---------- ECOS cases ----------
export async function listEcosCases() {
  const { data, error } = await supabase
    .from('ecos_cases')
    .select('case_id, data')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => r.data);
}

export async function upsertEcosCases(cases) {
  if (!cases || cases.length === 0) return;
  const rows = cases.map(c => ({ case_id: c.id, data: c, updated_at: new Date().toISOString() }));
  const { error } = await supabase
    .from('ecos_cases')
    .upsert(rows, { onConflict: 'user_id,case_id' });
  if (error) throw error;
}

export async function deleteEcosCase(caseId) {
  const { error } = await supabase.from('ecos_cases').delete().eq('case_id', caseId);
  if (error) throw error;
}

// ---------- ECOS attempts (dernier passage par cas) ----------
export async function listEcosAttempts() {
  const { data, error } = await supabase
    .from('ecos_attempts')
    .select('case_id, data, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertEcosAttempt(attempt) {
  if (!attempt?.case_id || !attempt?.data) return;
  const row = { case_id: attempt.case_id, data: attempt.data, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('ecos_attempts')
    .upsert(row, { onConflict: 'user_id,case_id' });
  if (error) throw error;
}

// ---------- Entretiens (audio + transcription + note, 24h) ----------
const ENTRETIENS_BUCKET = 'entretiens';

export async function purgeExpiredEntretiens() {
  // Liste les expirés, supprime les fichiers, puis les lignes
  const { data: expired, error: e1 } = await supabase
    .from('entretiens')
    .select('id, storage_path')
    .lt('expires_at', new Date().toISOString());
  if (e1) throw e1;
  if (!expired || expired.length === 0) return 0;
  const paths = expired.map(r => r.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(ENTRETIENS_BUCKET).remove(paths);
  }
  const ids = expired.map(r => r.id);
  await supabase.from('entretiens').delete().in('id', ids);
  return expired.length;
}

export async function listEntretiens() {
  const { data, error } = await supabase
    .from('entretiens')
    .select('id, storage_path, filename, duration_ms, size_bytes, transcript, note, context, created_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadEntretien({ blob, filename, durationMs }) {
  const { data: userData, error: ue } = await supabase.auth.getUser();
  if (ue) throw ue;
  const uid = userData?.user?.id;
  if (!uid) throw new Error('Non connecté.');
  const ext = (filename?.split('.').pop() || 'webm').toLowerCase();
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(ENTRETIENS_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('entretiens')
    .insert({
      storage_path: path,
      filename: filename || `audio.${ext}`,
      duration_ms: durationMs || null,
      size_bytes: blob.size,
    })
    .select()
    .single();
  if (error) {
    // rollback storage
    await supabase.storage.from(ENTRETIENS_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function updateEntretien(id, fields) {
  const { error } = await supabase.from('entretiens').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteEntretien(id, storagePath) {
  if (storagePath) {
    await supabase.storage.from(ENTRETIENS_BUCKET).remove([storagePath]);
  }
  const { error } = await supabase.from('entretiens').delete().eq('id', id);
  if (error) throw error;
}

export async function getEntretienSignedUrl(storagePath, expiresInSec = 3600) {
  const { data, error } = await supabase.storage
    .from(ENTRETIENS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadEntretienBlob(storagePath) {
  const { data, error } = await supabase.storage.from(ENTRETIENS_BUCKET).download(storagePath);
  if (error) throw error;
  return data;
}

// ---------- API key (user metadata) ----------
export async function saveApiKey(key) {
  const { error } = await supabase.auth.updateUser({ data: { openai_key: key } });
  if (error) throw error;
}
