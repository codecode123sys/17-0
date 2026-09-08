// A deliberately small, maintainable blocklist — this is a casual leaderboard
// name filter, not a comprehensive moderation system. Checked as a substring
// match against the lowercased, alphanumeric-only name, so spacing/punctuation
// tricks ("f-u-c-k") don't slip through.
const BLOCKED_SUBSTRINGS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "piss",
  "cock",
  "pussy",
  "bastard",
  "slut",
  "whore",
  "fag",
  "nigger",
  "nigga",
  "retard",
  "rape",
  "nazi",
];

const MIN_LENGTH = 1;
const MAX_LENGTH = 16;

/** Validates a leaderboard display name. Returns an error message if it's
 * invalid, or null if it's fine to use. */
export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < MIN_LENGTH) return `Name must be at least ${MIN_LENGTH} characters.`;
  if (name.length > MAX_LENGTH) return `Name must be ${MAX_LENGTH} characters or fewer.`;
  if (!/^[a-zA-Z0-9 '_-]+$/.test(name)) return "Name can only use letters, numbers, spaces, and - ' _.";

  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (BLOCKED_SUBSTRINGS.some((w) => normalized.includes(w))) {
    return "That name isn't allowed — try something else.";
  }
  return null;
}
