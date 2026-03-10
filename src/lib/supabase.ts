import { createClient } from "@supabase/supabase-js";

// Server-side Supabase Client (mit Service Role Key für Storage + pgvector)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase Konfiguration fehlt in .env.local");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// Client-side Supabase (mit Anon Key, nur für öffentliche Operationen)
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase Konfiguration fehlt");
  }

  return createClient(url, key);
}
