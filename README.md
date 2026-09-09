# 17–0

Draft an 8-man all-time NFL roster — a decade of history at a time via a
franchise + era spinner — then simulate a full season: a real 17-game
schedule inside a randomly-assigned division, real standings and seeding,
and a full playoff bracket, all against a simulated season for the other
31 teams.

`reference/17-0.html` is the original single-file prototype this project
was ported from — kept as the source of truth for game data and rules.
Don't hand-edit it; change the ported modules under `src/` instead.

## Stack

Vite + React + TypeScript, plain CSS (design tokens ported from the
prototype, light/dark via `prefers-color-scheme`), Vitest for the
simulation engine. Per-visitor best-record persistence is `localStorage`
(never leaves the browser). There's an optional, separate master log of
every completed season across all visitors — see below.

## Layout

- `src/data/` — the player pool and team/division data. QB/RB/WR/TE from
  2000 onward are rated from real nflverse stats by `scripts/`; everything
  else (DEF at any era, anyone pre-2000) is hand-curated — see
  `scripts/README.md` for why that split exists and how to re-run it.
- `src/engine/` — pure, DOM-free simulation logic: the draft slot machine
  (`draft.ts`), the season/league/playoff sim (`season.ts`), the
  Monte Carlo preseason projection (`projection.ts`), and generated
  team-badge/portrait data (`visuals.ts`). Has its own Vitest suite.
- `src/state/useGame.ts` — the screen/draft/season state machine
- `src/screens/`, `src/components/` — the React UI

## Editing player ratings

Every player's rating lives in `src/data/players.ts`, but you don't have to
hand-edit that file. There's a spreadsheet workflow instead:

1. **Generate the spreadsheet CSV** (one time, or whenever the player pool
   itself changes — new players added, etc.):
   ```bash
   python3 scripts/export_players_csv.py > players.csv
   ```
2. **Import it into Google Sheets**: create a blank Sheet, then
   **File → Import → Upload**, pick `players.csv`, and choose "Replace
   spreadsheet."
3. **Edit ratings directly in the sheet.** Change the `ovr` column for any
   player (55-99, keep it a whole number) — this drives roster balance and
   is shown in-game as "OVR." You can also tweak `stats` (the counting-stat
   line) or `accolades` (the highlight underneath it). Leave `id`, `name`,
   `team`, `era`, and `pos` alone — those identify the row, and this
   workflow can't add or remove players, only correct their ratings and
   text.
4. **Download your edited sheet as CSV**: **File → Download → Comma
   Separated Values (.csv)**.
5. **Pull the edits back into the game**:
   ```bash
   python3 scripts/import_players_csv.py ~/Downloads/players.csv
   ```
   This prints every rating it changed, then rewrites
   `src/data/players.ts`.
6. **Ship it**: `npm test && npm run build` to double check, then commit
   and push — Vercel redeploys automatically.

You can skip the download/re-upload step by publishing the sheet instead:
**File → Share → Publish to web**, select your sheet and "Comma-separated
values (.csv)," and pass that URL straight to
`import_players_csv.py <url>` any time you've made edits.

## Season logging + leaderboard (optional)

Every completed season — the 8 drafted players, final record, playoff
outcome, roster strength, a timestamp, and the player's chosen display
name (`src/lib/playerName.ts`, "Anonymous" if never set) — is logged as
one row to a Google Sheet, across every visitor, as a running dataset.
This same sheet doubles as the leaderboard's data source: the in-game
"Leaderboard" screen queries it for the top runs in the last day/week/
month/year. Nothing sensitive is sent; it's pure gameplay data plus
whatever name the player typed in. Entirely optional: with no webhook
configured, `src/lib/logSeason.ts` no-ops silently and the leaderboard
screen just shows an empty state.

Setup:

1. Create a blank Google Sheet. **Extensions → Apps Script**, paste in the
   script below, and run `setupHeaders` once from the editor (approve the
   permission prompt — it's your own script touching your own sheet). If
   you already had the older version of this script set up (no
   leaderboard), it's safe to re-run `setupHeaders` — the new `name`
   column is appended at the end, so existing rows/columns don't shift.
2. **Deploy → New deployment → Web app.** Execute as "Me," access "Anyone."
   Copy the resulting URL (ends in `/exec`). If you're updating an
   existing deployment, use **Manage deployments → edit (pencil) → New
   version** instead of creating a second deployment, so the URL you
   already have configured keeps working.
3. Copy `.env.example` to `.env.local`, and set `VITE_SHEET_WEBHOOK_URL` to
   that URL and `VITE_SHEET_WEBHOOK_KEY` to a random string of your choice
   (it just has to match the `SHARED_KEY` constant in the script below —
   this isn't real auth, just enough to stop randos from spamming the
   endpoint if they ever found the URL). Set the same two values in
   Vercel's **Project Settings → Environment Variables** for production,
   then redeploy. The leaderboard's read endpoint (`doGet`) is
   intentionally public/unauthenticated — it only ever returns data, never
   writes any — so no key is needed to view it.

```javascript
var SHARED_KEY = "REPLACE_WITH_YOUR_OWN_RANDOM_STRING";

var SLOTS = ["qb", "rb1", "rb2", "wr1", "wr2", "te", "flex", "def"];

// Always the sheet's first tab, regardless of whichever tab happens to be
// "active" (last clicked) in the UI when this runs — getActiveSheet() can
// silently point doPost and doGet at two different tabs if you ever switch
// tabs while poking around the spreadsheet, which reads back as "nothing
// on the leaderboard" with no error at all.
function logSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function setupHeaders() {
  var sheet = logSheet();
  var headers = ["timestamp", "strength", "wins", "losses", "seed", "divWinner", "division", "result", "outcome"];
  SLOTS.forEach(function (s) {
    headers.push(s + "_name", s + "_team", s + "_era", s + "_ovr");
  });
  headers.push("name"); // appended last so re-running this never shifts existing columns
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data.key !== SHARED_KEY) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "bad key" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = logSheet();
  var row = [new Date(), data.strength, data.wins, data.losses, data.seed, data.divWinner, data.division, data.result, data.outcome];
  SLOTS.forEach(function (s) {
    var p = (data.players && data.players[s]) || {};
    row.push(p.name || "", p.team || "", p.era || "", p.ovr || "");
  });
  row.push(data.name || "Anonymous");
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// Public, read-only leaderboard query:
//   /exec?period=day|week|month|year  -> top runs in that window
//   /exec?checkName=SomeName          -> { ok: true, taken: true|false }
function doGet(e) {
  try {
    var sheet = logSheet();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idx = {};
    headers.forEach(function (h, i) {
      idx[h] = i;
    });

    if (e.parameter && e.parameter.checkName) {
      var wanted = e.parameter.checkName.trim().toLowerCase();
      var taken = values.slice(1).some(function (r) {
        return String(r[idx.name] || "").trim().toLowerCase() === wanted;
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, taken: taken })).setMimeType(
        ContentService.MimeType.JSON
      );
    }

    var period = ((e.parameter && e.parameter.period) || "week").toLowerCase();
    var now = new Date();
    var cutoff;
    if (period === "day") {
      // Calendar day (midnight today in the script's project time zone),
      // not a rolling 24 hours -- see Project Settings for that time zone.
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      var ms = { week: 7, month: 30, year: 365 }[period];
      cutoff = ms ? new Date(now.getTime() - ms * 24 * 60 * 60 * 1000) : new Date(0);
    }
    var limit = { day: 25, week: 25, month: 50, year: 100 }[period] || 25;

    var inWindow = values.slice(1).filter(function (r) {
      return r[idx.timestamp] instanceof Date && r[idx.timestamp] >= cutoff;
    });
    var totalPlaythroughs = inWindow.length;

    var entries = inWindow
      .map(function (r) {
        var players = {};
        SLOTS.forEach(function (s) {
          players[s] = {
            name: r[idx[s + "_name"]],
            team: r[idx[s + "_team"]],
            era: r[idx[s + "_era"]],
            ovr: r[idx[s + "_ovr"]],
          };
        });
        return {
          name: r[idx.name] || "Anonymous",
          wins: r[idx.wins],
          losses: r[idx.losses],
          strength: r[idx.strength],
          result: r[idx.result],
          outcome: r[idx.outcome],
          timestamp: r[idx.timestamp].toISOString(),
          players: players,
        };
      })
      .sort(function (a, b) {
        return b.wins - a.wins || b.strength - a.strength;
      })
      .slice(0, limit);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        entries: entries,
        totalPlaythroughs: totalPlaythroughs,
        debugSheetName: sheet.getName(),
        debugTotalRows: values.length - 1,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Surface the real error in the response body instead of just a bare
    // "Failed" in the Executions log with no visible detail.
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err), stack: err.stack })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
```

Download the collected data as a real `.xlsx` anytime from the sheet:
**File → Download → Microsoft Excel (.xlsx)**.

Name filtering (min length, profanity blocklist) and the one-name-per-
player uniqueness check both happen client-side only — `profanity.ts`
validates the name, and `leaderboard.ts`'s `checkNameTaken` calls the
`checkName` query above before saving. Neither is enforced by `doPost`
itself: there's no account system, so the server has no real way to tell
"the legitimate owner of this name resubmitting" apart from "someone else
claiming an already-used name" — the uniqueness check only stops someone
from *picking* an already-used name through the game's own UI, not from
bypassing it entirely with a hand-crafted request to the webhook (the
shared key is visible in the bundled client JS same as the rest of this
setup). Good enough to keep the leaderboard honest for normal play; not a
real security boundary.

## Run history

Every completed season is saved to `localStorage` on the player's own
device (see `src/lib/runs.ts`) and browsable from "My runs" on the title
screen (shown once they've played at least one season). This is
per-device, not a real account — there's no sign-in, no external
service, and nothing to configure. It's separate from the season
logging above, which is anonymous aggregate telemetry across every
visitor rather than one player's own history.

An account-based version (sign-in, history synced across devices) was
tried via Supabase and rolled back — real accounts add a genuine
dependency (an external service to configure and debug) for a feature
that, at this stage, a local device history serves just as well. Worth
revisiting once cross-device history is something players actually ask
for.

## Live head-to-head (optional)

Two players draft against the identical sequence of 8 team/era matchups
(the same board generator as the daily challenge, just seeded per-match
instead of per-day) — round 1 is the same matchup for both, round 2 is
the same matchup for both, and so on, drafted blind and entirely
privately, so both players can even end up drafting the exact same real
player with no conflict. Each player also gets one personal skip for the
whole match — reroll whichever round you're currently facing into a new
random matchup, just for you; your opponent's view of that round is
unaffected. Once both rosters are full, the engine simulates one game
between the two rosters to declare a winner. Rooms are joined by a short
code or invite link (`?join=CODE`), no accounts. See `src/lib/match.ts`
for the room/draft/skip logic and `src/screens/HeadToHead.tsx` for the UI.

This needs a live backend, unlike everything else in the app — it's the
one feature that genuinely can't work from localStorage alone, since two
different browsers have to see each other's picks in real time. It uses
Firebase (Firestore + anonymous sign-in). The whole Firebase SDK is
lazy-loaded only when a visitor opens head-to-head (see `App.tsx`'s
`lazy(...)` import), so it never touches the main bundle otherwise, and
the "Head-to-head" button on the title screen only appears at all once
it's configured — leave the env vars blank and this feature just doesn't
exist for players.

**One-time setup:**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project (the free "Spark" plan is enough).
2. **Build → Firestore Database → Create database** — start in production mode (the security rules below lock it down properly, so production mode is fine from the start).
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.** This is the only auth method used — no email, no password, no real accounts, just a stable per-browser id to tell the two players apart.
4. In Firestore, open the **Rules** tab and replace the default with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /matches/{code} {
         allow read: if request.auth != null;
         allow create: if request.auth != null
           && request.resource.data.hostUid == request.auth.uid
           && request.resource.data.status == 'waiting';
         allow update: if request.auth != null
           && (resource.data.hostUid == request.auth.uid
               || resource.data.guestUid == request.auth.uid
               || request.resource.data.guestUid == request.auth.uid);
         allow delete: if false;
       }
     }
   }
   ```

   This restricts every read/write to signed-in (anonymous is fine) users, and restricts writes to a match to the two players actually in it.
5. **Project settings (gear icon) → General → Your apps → Add app → Web**, register it (no hosting setup needed), and copy the `firebaseConfig` values into `.env.local` (and into Vercel's Project Settings → Environment Variables for prod) — see `.env.example` for the exact variable names.

**Known limitations, worth knowing before relying on this:**

- Match documents are never cleaned up — Firestore's free tier is generous enough that this is a non-issue at hobby scale, but a scheduled cleanup (Cloud Function, or a manual sweep) would be needed eventually.
- If a player closes the tab mid-match, their opponent currently just waits — there's no disconnect/forfeit handling yet.

## Commands

```bash
npm install
npm run dev      # start the dev server
npm test         # run the engine test suite
npm run build    # type-check + production build
```
