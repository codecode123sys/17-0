import type { SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Known synchronously, with no bundle cost — safe to check before ever
 * loading the real client (e.g. to decide whether to render sign-in UI). */
export const accountsConfigured = !!(URL && ANON_KEY);

let clientPromise: Promise<SupabaseClient> | null = null;

/** Lazily loads and creates the Supabase client on first use. The package
 * bundles realtime/storage/functions clients we never touch here and is
 * hard to tree-shake (~150KB gzipped) — most players never sign in, so this
 * keeps that weight out of everyone's initial bundle, loading it only when
 * someone actually opens the account UI. Resolves to null if unconfigured. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!accountsConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(URL!, ANON_KEY!));
  }
  return clientPromise;
}
