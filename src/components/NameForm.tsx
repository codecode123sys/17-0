import { useState } from "react";
import { checkNameTaken } from "../lib/leaderboard";
import { getPlayerName, setPlayerName } from "../lib/playerName";
import { validateName } from "../lib/profanity";

/** The leaderboard display-name picker — used on both the title screen and
 * the leaderboard itself, so it's set up wherever a player happens to be
 * rather than only right before they'd need it. */
export function NameForm() {
  const [nameInput, setNameInput] = useState(getPlayerName() ?? "");
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    const error = validateName(trimmed);
    if (error) {
      setNameError(error);
      setNameSaved(false);
      return;
    }

    // Re-saving the exact name you already have shouldn't get blocked as
    // "taken" — it's already yours. Only check uniqueness against a name
    // that's new to this device.
    const currentName = getPlayerName();
    if (currentName?.toLowerCase() !== trimmed.toLowerCase()) {
      setCheckingName(true);
      const taken = await checkNameTaken(trimmed);
      setCheckingName(false);
      if (taken) {
        setNameError("That name's already taken — try another.");
        setNameSaved(false);
        return;
      }
    }

    setPlayerName(trimmed);
    setNameError("");
    setNameSaved(true);
  }

  return (
    <form className="name-form" onSubmit={saveName}>
      <input
        type="text"
        placeholder="Your leaderboard name"
        value={nameInput}
        onChange={(e) => {
          setNameInput(e.target.value);
          setNameSaved(false);
        }}
      />
      <button className="btn ghost small" type="submit" disabled={checkingName}>
        {checkingName ? "Checking…" : "Save"}
      </button>
      {nameError && <span className="name-status mono">{nameError}</span>}
      {!nameError && nameSaved && <span className="name-status mono">Saved — future runs will use this name.</span>}
    </form>
  );
}
