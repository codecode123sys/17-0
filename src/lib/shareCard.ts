import type { FilledSlots } from "../engine/draft";
import { SLOTS } from "../engine/draft";
import { teamMeta } from "../data/teams";

const WIDTH = 1200;
const HEIGHT = 630;

export interface ShareCardData {
  filled: FilledSlots;
  record: string;
  outcomeText: string;
  isDaily: boolean;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the shareable result card and resolves with a PNG blob. Loads the
 *  app's own webfonts first — the <link> tag in index.html only queues them
 *  for the DOM's own text, canvas drawing needs them explicitly ready, or
 *  it silently falls back to the browser default and looks off-brand. */
export async function renderResultCard(data: ShareCardData): Promise<Blob> {
  await Promise.all([
    document.fonts.load("700 64px Anton"),
    document.fonts.load("700 28px Oswald"),
    document.fonts.load("600 22px Oswald"),
    document.fonts.load("500 26px Oswald"),
    document.fonts.load("600 20px 'IBM Plex Mono'"),
  ]);
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // ---------- background ----------
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0d1712");
  bg.addColorStop(1, "#16281f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // faint vertical yard-line style stripes, echoing the app's own board texture
  ctx.strokeStyle = "rgba(246,245,236,0.05)";
  ctx.lineWidth = 1;
  for (let x = 60; x < WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  // bottom accent bar
  ctx.fillStyle = "#e7a417";
  ctx.fillRect(0, HEIGHT - 8, WIDTH, 8);

  // ---------- header ----------
  ctx.fillStyle = "#e7a417";
  ctx.font = "700 44px Anton, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("17–0", 48, 66);

  ctx.font = "600 20px Oswald, sans-serif";
  ctx.fillStyle = "rgba(246,245,236,0.55)";
  ctx.textAlign = "right";
  ctx.fillText(data.isDaily ? "DAILY CHALLENGE · DRAFT17-0.COM" : "DRAFT17-0.COM", WIDTH - 48, 60);
  ctx.textAlign = "left";

  // ---------- record / outcome ----------
  ctx.fillStyle = "#f6f5ec";
  ctx.font = "700 78px Anton, sans-serif";
  ctx.fillText(data.record, 48, 172);

  ctx.font = "500 26px Oswald, sans-serif";
  ctx.fillStyle = "rgba(246,245,236,0.82)";
  wrapText(ctx, data.outcomeText, 48, 208, WIDTH - 96, 32);

  // ---------- roster grid: 4 columns x 2 rows ----------
  const gridTop = 250;
  const gridLeft = 48;
  const gridGap = 16;
  const cols = 4;
  const cardW = (WIDTH - gridLeft * 2 - gridGap * (cols - 1)) / cols;
  const cardH = 158;

  SLOTS.forEach((slot, i) => {
    const p = data.filled[slot.key];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridLeft + col * (cardW + gridGap);
    const y = gridTop + row * (cardH + gridGap);

    ctx.fillStyle = "rgba(246,245,236,0.06)";
    roundRect(ctx, x, y, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(246,245,236,0.12)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 10);
    ctx.stroke();

    if (!p) return;
    const meta = teamMeta(p.team);

    // team-colored initials chip
    const chipSize = 44;
    ctx.fillStyle = meta.primary;
    roundRect(ctx, x + 16, y + 16, chipSize, chipSize, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 16px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(meta.abbr, x + 16 + chipSize / 2, y + 16 + chipSize / 2 + 6);
    ctx.textAlign = "left";

    ctx.fillStyle = "#e7a417";
    ctx.font = "700 15px Oswald, sans-serif";
    ctx.fillText(slot.label, x + 16, y + 90);

    ctx.fillStyle = "#f6f5ec";
    ctx.font = "500 21px Oswald, sans-serif";
    fitText(ctx, p.name, x + 16, y + 118, cardW - 32);

    ctx.fillStyle = "rgba(246,245,236,0.55)";
    ctx.font = "600 14px 'IBM Plex Mono', monospace";
    ctx.fillText(`${p.team} · ${p.era}`, x + 16, y + 142);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}

/** Shrinks the font size a couple of steps if the name would otherwise
 *  overflow its card — cheaper than measuring and truncating with an
 *  ellipsis, and every real name here fits within a couple of steps. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let size = 21;
  while (size > 15 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `500 ${size}px Oswald, sans-serif`;
  }
  ctx.fillText(text, x, y);
}
