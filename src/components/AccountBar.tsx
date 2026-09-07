import { useState } from "react";
import type { GameController } from "../state/useGame";

export function AccountBar({ game }: { game: GameController }) {
  const { auth, viewHistory } = game;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  if (!auth.accountsEnabled || !auth.authReady) return null;

  if (auth.user) {
    return (
      <div className="account-bar">
        <span className="mono">{auth.user.email}</span>
        <button className="btn ghost small" onClick={viewHistory}>
          My runs
        </button>
        <button className="btn ghost small" onClick={auth.signOut}>
          Sign out
        </button>
      </div>
    );
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email || sending) return;
    setSending(true);
    setStatus("");
    const error = await auth.signInWithEmail(email);
    setSending(false);
    setStatus(error ? error : "Check your email for a sign-in link.");
  }

  return (
    <form className="account-bar" onSubmit={sendLink}>
      <input
        type="email"
        required
        placeholder="Email to save your runs"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn ghost small" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Sign in"}
      </button>
      {status && <span className="account-status mono">{status}</span>}
    </form>
  );
}
