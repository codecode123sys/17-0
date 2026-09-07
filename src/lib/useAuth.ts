import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { accountsConfigured, getSupabase } from "./supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!accountsConfigured);

  useEffect(() => {
    if (!accountsConfigured) return;
    let unsubscribe = () => {};

    getSupabase().then(async (supabase) => {
      if (!supabase) return;

      async function loadProfile(u: User | null) {
        if (!u) {
          setUsername(null);
          return;
        }
        const { data } = await supabase!.from("profiles").select("username").eq("id", u.id).single();
        setUsername(data?.username ?? null);
      }

      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      await loadProfile(data.session?.user ?? null);
      setAuthReady(true);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        void loadProfile(session?.user ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });

    return () => unsubscribe();
  }, []);

  /** Creates an account (username + email + password). The username is
   * copied into a `profiles` row by a database trigger (see README) keyed
   * off `raw_user_meta_data`, so nothing else has to happen client-side.
   * Returns an error message on failure, or null on success. */
  const signUp = useCallback(async (username: string, email: string, password: string): Promise<string | null> => {
    const supabase = await getSupabase();
    if (!supabase) return "Accounts aren't configured for this deployment yet.";
    if (!username.trim()) return "Pick a username.";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
    return error ? error.message : null;
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const supabase = await getSupabase();
    if (!supabase) return "Accounts aren't configured for this deployment yet.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { user, username, authReady, accountsEnabled: accountsConfigured, signUp, signIn, signOut };
}
