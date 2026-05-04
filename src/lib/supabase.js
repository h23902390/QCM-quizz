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

// ---------- API key (user metadata) ----------
export async function saveApiKey(key) {
  const { error } = await supabase.auth.updateUser({ data: { openai_key: key } });
  if (error) throw error;
}
