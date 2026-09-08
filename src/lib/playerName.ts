const NAME_KEY = "seventeen-oh-player-name";

/** The player's chosen leaderboard display name, or null if never set. */
export function getPlayerName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
