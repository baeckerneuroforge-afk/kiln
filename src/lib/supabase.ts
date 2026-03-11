import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (with service role key for Storage + pgvector)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration missing in .env.local");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// Client-side Supabase (with anon key, only for public operations)
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(url, key);
}
