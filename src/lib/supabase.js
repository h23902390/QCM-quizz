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

// ---------- API key (user metadata) ----------
export async function saveApiKey(key) {
  const { error } = await supabase.auth.updateUser({ data: { openai_key: key } });
  if (error) throw error;
}
