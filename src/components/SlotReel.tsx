import { useMemo } from "react";
import type { CSSProperties } from "react";

const STOPS = 16; // decoys shown while spinning, before landing on the real value

/** A vertical slot-machine reel. Bump `spinToken` to trigger a new spin —
 *  the strip fills with random decoys drawn from `pool` and animates down
 *  to land on `value`, including the very first time it renders.
 *
 *  Implemented as a CSS keyframe animation on a freshly-keyed element
 *  (rather than manually sequencing a transition in JS): giving the track
 *  a `key={spinToken}` forces React to mount a brand-new element on every
 *  spin, and a fresh element always plays its `animation` from the start —
 *  no refs, no requestAnimationFrame timing, nothing for React StrictMode's
 *  extra effect cycle or Fast Refresh to leave in a half-updated state. */
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
  const strip = useMemo(() => {
    const decoys = Array.from({ length: STOPS - 1 }, () =>
      pool.length ? pool[Math.floor(Math.random() * pool.length)] : value
    );
    return [...decoys, value];
    // Intentionally keyed only on spinToken: this freezes the decoy strip
    // for the duration of one spin instead of reshuffling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const style = { "--stops": strip.length - 1 } as CSSProperties;

  return (
    <div className="slot-window">
      <div key={spinToken} className="slot-track" style={style}>
        {strip.map((v, i) => (
          <div className="slot-item" key={i}>
            {renderItem(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
