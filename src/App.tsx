import "./styles/game.css";
import { useGame } from "./state/useGame";
import { Title } from "./screens/Title";
import { Draft } from "./screens/Draft";
import { Season } from "./screens/Season";
import { Results } from "./screens/Results";

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
      {game.screen === "season" && <Season game={game} />}
      {game.screen === "results" && <Results game={game} />}
    </div>
  );
}
