import { useEffect, useRef, useState } from "react";

const ITEM_H = 38; // px — must match .slot-item / .slot-window height in game.css
const STOPS = 16; // decoys shown while spinning, before landing on the real value
const DURATION_MS = 1050;

/** A vertical slot-machine reel. Bump `spinToken` to trigger a new spin —
 *  the strip fills with random decoys drawn from `pool` and scrolls down to
 *  land on `value`. When `spinToken` doesn't change it just sits still. */
export function SlotReel<T>({
  spinToken,
  value,
  pool,
  renderItem,
}: {
  spinToken: number;
  value: T;
  pool: T[];
  renderItem: (v: T) => React.ReactNode;
}) {
  const [strip, setStrip] = useState<T[]>([value]);
  const [offsetIndex, setOffsetIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const prevToken = useRef(spinToken);
  const firstRun = useRef(true);
  const rafIds = useRef<number[]>([]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      prevToken.current = spinToken;
      return;
    }
    if (prevToken.current === spinToken) return;
    prevToken.current = spinToken;

    const decoys = Array.from({ length: STOPS - 1 }, () =>
      pool.length ? pool[Math.floor(Math.random() * pool.length)] : value
    );
    const newStrip = [...decoys, value];

    setTransitioning(false);
    setStrip(newStrip);
    setOffsetIndex(0);

    rafIds.current.forEach(cancelAnimationFrame);
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        setTransitioning(true);
        setOffsetIndex(newStrip.length - 1);
      });
      rafIds.current = [id2];
    });
    rafIds.current = [id1];

    return () => rafIds.current.forEach(cancelAnimationFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  return (
    <div className="slot-window">
      <div
        className="slot-track"
        style={{
          transform: `translateY(-${offsetIndex * ITEM_H}px)`,
          transition: transitioning ? `transform ${DURATION_MS}ms cubic-bezier(.13,.7,.18,1)` : "none",
        }}
      >
        {strip.map((v, i) => (
          <div className="slot-item" key={i}>
            {renderItem(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
