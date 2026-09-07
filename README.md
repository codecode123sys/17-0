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

## Season logging (optional)

Every completed season — the 8 drafted players, final record, playoff
outcome, roster strength, and a timestamp — can be logged as one row to a
Google Sheet, across every visitor, as a running dataset. Nothing personal
is sent; it's pure gameplay data. This is entirely optional: with no
webhook configured, `src/lib/logSeason.ts` no-ops silently.

Setup:

1. Create a blank Google Sheet. **Extensions → Apps Script**, paste in the
   script below, and run `setupHeaders` once from the editor (approve the
   permission prompt — it's your own script touching your own sheet).
2. **Deploy → New deployment → Web app.** Execute as "Me," access "Anyone."
   Copy the resulting URL (ends in `/exec`).
3. Copy `.env.example` to `.env.local`, and set `VITE_SHEET_WEBHOOK_URL` to
   that URL and `VITE_SHEET_WEBHOOK_KEY` to a random string of your choice
   (it just has to match the `SHARED_KEY` constant in the script below —
   this isn't real auth, just enough to stop randos from spamming the
   endpoint if they ever found the URL). Set the same two values in
   Vercel's **Project Settings → Environment Variables** for production,
   then redeploy.

```javascript
var SHARED_KEY = "REPLACE_WITH_YOUR_OWN_RANDOM_STRING";

var SLOTS = ["qb", "rb1", "rb2", "wr1", "wr2", "te", "flex", "def"];

function setupHeaders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headers = ["timestamp", "strength", "wins", "losses", "seed", "divWinner", "division", "result", "outcome"];
  SLOTS.forEach(function (s) {
    headers.push(s + "_name", s + "_team", s + "_era", s + "_ovr");
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data.key !== SHARED_KEY) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "bad key" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = [new Date(), data.strength, data.wins, data.losses, data.seed, data.divWinner, data.division, data.result, data.outcome];
  SLOTS.forEach(function (s) {
    var p = (data.players && data.players[s]) || {};
    row.push(p.name || "", p.team || "", p.era || "", p.ovr || "");
  });
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

Download the collected data as a real `.xlsx` anytime from the sheet:
**File → Download → Microsoft Excel (.xlsx)**.

## Accounts & run history (optional)

Players can sign in (email magic link, no password) to save every
completed season to their own account and browse it later from "My
runs." This is entirely separate from the season logging above — that's
anonymous aggregate telemetry across every visitor, this is per-user
history. Like the Sheets webhook, it's fully optional: with no Supabase
project configured, the sign-in UI simply doesn't render and nothing
else changes.

Setup:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard's **SQL Editor**, run:

```sql
create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  created_at timestamptz default now(),
  strength int not null,
  wins int not null,
  losses int not null,
  seed int,
  division text,
  div_winner boolean,
  result int not null,
  outcome_text text not null,
  players jsonb not null
);

alter table runs enable row level security;

create policy "users manage their own runs" on runs
  for all using (auth.uid() = user_id);
```

3. **Authentication → Sign In / Providers**: Email should already be
   enabled by default. Under **Authentication → URL Configuration**, add
   your production URL (e.g. `https://www.draft17-0.com`) to the **Redirect
   URLs** allow-list, or the magic link will fail to complete sign-in.
4. **Project Settings → API**: copy the **Project URL** and the **anon
   public** key.
5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to those two values. Set the same two in
   Vercel's **Project Settings → Environment Variables** for production,
   then redeploy.

Nothing else to build — the client talks to Supabase directly, and row
level security (the policy above) is what keeps one signed-in player from
ever seeing another's runs.

## Commands

```bash
npm install
npm run dev      # start the dev server
npm test         # run the engine test suite
npm run build    # type-check + production build
```
