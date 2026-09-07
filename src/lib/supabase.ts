import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Undefined when the project isn't configured (local dev with no .env.local,
 * or a preview deploy without the env vars set) — every caller must handle
 * that, same as logSeason.ts's webhook does, rather than throwing. */
export const supabase = URL && ANON_KEY ? createClient(URL, ANON_KEY) : null;
