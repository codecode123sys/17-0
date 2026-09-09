import { Suspense, lazy } from "react";
import "./styles/game.css";
import { useGame } from "./state/useGame";
import { Title } from "./screens/Title";
import { Draft } from "./screens/Draft";
import { DailyDraft } from "./screens/DailyDraft";
import { Season } from "./screens/Season";
import { Results } from "./screens/Results";
import { History } from "./screens/History";
import { Leaderboard } from "./screens/Leaderboard";

// Lazy-loaded: pulls in the Firebase SDK, which only ever ships to
// visitors who actually open head-to-head — see lib/firebase.ts.
const HeadToHead = lazy(() => import("./screens/HeadToHead").then((m) => ({ default: m.HeadToHead })));

export default function App() {
  const game = useGame();

  return (
    <div className="wrap">
      {game.screen !== "title" && (
        <button className="home-btn" type="button" onClick={game.goHome}>
          &larr; Home
        </button>
      )}

      {game.screen === "title" && <Title game={game} />}
      {game.screen === "draft" && <Draft game={game} />}
      {game.screen === "dailyDraft" && <DailyDraft game={game} />}
      {game.screen === "season" && <Season game={game} />}
      {game.screen === "results" && <Results game={game} />}
      {game.screen === "history" && <History game={game} />}
      {game.screen === "leaderboard" && <Leaderboard game={game} />}
      {game.screen === "h2h" && (
        <Suspense fallback={<p className="pick-hint">Loading&hellip;</p>}>
          <HeadToHead game={game} />
        </Suspense>
      )}
    </div>
  );
}
