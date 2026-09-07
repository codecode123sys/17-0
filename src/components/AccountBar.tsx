import { useState } from "react";
import type { GameController } from "../state/useGame";

export function AccountBar({ game }: { game: GameController }) {
  const { auth, viewHistory } = game;
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.accountsEnabled || !auth.authReady) return null;

  if (auth.user) {
    return (
      <div className="account-bar">
        <span className="mono">{auth.username ?? auth.user.email}</span>
        <button className="btn ghost small" onClick={viewHistory}>
          My runs
        </button>
        <button className="btn ghost small" onClick={auth.signOut}>
          Sign out
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    const error =
      mode === "signup" ? await auth.signUp(username, email, password) : await auth.signIn(email, password);
    setBusy(false);
    if (error) setStatus(error);
  }

  return (
    <form className="account-bar" onSubmit={submit}>
      <div className="account-tabs" role="group" aria-label="Account mode">
        <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>
          Create account
        </button>
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          Log in
        </button>
      </div>
      {mode === "signup" && (
        <input
          type="text"
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      )}
      <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn ghost small" type="submit" disabled={busy}>
        {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
      </button>
      {status && <span className="account-status mono">{status}</span>}
    </form>
  );
}
