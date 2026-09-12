// ── notoritychart.js — Notoriety rank card renderer ───────────────────────────
// Renders a player's notoriety standing as an image card (avatar, tier badge,
// XP progress bar, wealth bonus) instead of a plain text block. Same visual
// language as stockchart.js (dark bg, same font stack already registered by
// poster.js/chess.js) so it feels consistent with the rest of the bot's output.

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  GlobalFonts.registerFromPath(path.join(__dirname, "font.ttf"), "PosterFont");
} catch (e) {
  console.error("Notoriety card font registration failed:", e.message);
}

const C = {
  bg:          "#0e1117",
  bgGradTop:   "#161b28",
  border:      "#2a2f45",
  textPrimary: "#e0e6f0",
  textMuted:   "#8892a4",
  textFaint:   "#4a5568",
  barBg:       "#1a1f2e",
};

// One accent color per tier, roughly matching each tier's flavor —
// reused for the avatar ring, tier name, and progress bar fill.
const TIER_COLORS = {
  nobody:      "#6b7280",
  whisper:     "#9ca3af",
  known:       "#60a5fa",
  respected:   "#34d399",
  connected:   "#a78bfa",
  feared:      "#f472b6",
  notorious:   "#fb923c",
  untouchable: "#22d3ee",
  legend:      "#facc15",
  kingpin:     "#ffd700",
};

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.avatarUrl
 * @param {object} opts.tier        - { key, name, emoji, xp, wealthPct }
 * @param {object|null} opts.nextTier - same shape, or null if maxed
 * @param {number} opts.xp          - total XP
 * @param {number} opts.wealthBonus - Cash/day from wealth scaling (already a Number)
 * @param {bigint} opts.netWorth
 */
async function renderNotorietyCard(opts) {
  const { username, avatarUrl, tier, nextTier, xp, wealthBonus, netWorth } = opts;
  const W = 900, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = TIER_COLORS[tier.key] || "#e0e6f0";

  // Background — solid fill rather than a gradient, keeping to canvas APIs
  // already proven elsewhere in this codebase (no createLinearGradient use
  // anywhere else, so avoiding it removes any doubt about renderer support).
  ctx.fillStyle = C.bgGradTop;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 20);
  ctx.stroke();

  // Avatar (circle, tier-colored ring)
  const avX = 60, avY = H / 2, avR = 85;
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avR, avY, avR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avX, avY - avR, avR * 2, avR * 2);
    ctx.restore();
  } catch (e) {
    // Fallback: plain filled circle if the avatar fetch fails — never let a
    // dead CDN link break the whole card.
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(avX + avR, avY, avR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avX + avR, avY, avR, 0, Math.PI * 2);
  ctx.stroke();

  // Big tier emoji badge, bottom-right of the avatar
  ctx.font = "40px PosterFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const badgeX = avX + avR * 2 - 10, badgeY = avY + avR - 10;
  ctx.fillStyle = C.bg;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillText(tier.emoji, badgeX, badgeY + 2);

  // Right column: name, tier, XP bar, wealth line
  const colX = avX + avR * 2 + 50;
  const colW = W - colX - 50;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.textPrimary;
  ctx.font = "bold 34px PosterFont, sans-serif";
  ctx.fillText(username, colX, 75);

  ctx.fillStyle = accent;
  ctx.font = "bold 26px PosterFont, sans-serif";
  ctx.fillText(`${tier.emoji} ${tier.name}`, colX, 115);

  ctx.fillStyle = C.textMuted;
  ctx.font = "20px PosterFont, sans-serif";
  ctx.fillText(`⭐ ${fmtBig(xp)} XP total`, colX, 148);

  // Progress bar to next tier
  const barY = 175, barH = 26, barW = colW;
  roundRect(ctx, colX, barY, barW, barH, 13);
  ctx.fillStyle = C.barBg;
  ctx.fill();

  if (nextTier) {
    const span = nextTier.xp - tier.xp;
    const done = xp - tier.xp;
    const pct = span > 0 ? Math.max(0, Math.min(1, done / span)) : 0;
    const fillW = Math.max(barH, barW * pct); // never fully collapse the rounded cap
    roundRect(ctx, colX, barY, fillW, barH, 13);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.fillStyle = C.textPrimary;
    ctx.font = "bold 15px PosterFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(pct * 100)}%`, colX + barW / 2, barY + barH / 2 + 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.textFaint;
    ctx.font = "16px PosterFont, sans-serif";
    ctx.fillText(`${fmtBig(nextTier.xp - xp)} XP to ${nextTier.emoji} ${nextTier.name}`, colX, barY + barH + 24);
  } else {
    roundRect(ctx, colX, barY, barW, barH, 13);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.font = "bold 15px PosterFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MAXED — TOP OF THE UNDERWORLD", colX + barW / 2, barY + barH / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Wealth scaling line
  ctx.fillStyle = C.textMuted;
  ctx.font = "17px PosterFont, sans-serif";
  const wealthText = tier.wealthPct > 0 && netWorth > 1_000_000n
    ? `💎 Wealth scaling: ${(tier.wealthPct * 100).toFixed(3)}% → ${fmtBig(wealthBonus)} Cash/day`
    : `💎 Wealth scaling inactive (net worth under 1M)`;
  ctx.fillText(wealthText, colX, barY + barH + 55);

  return canvas.toBuffer("image/png");
}

// Lightweight big-number formatter for canvas text — mirrors economy.js's
// suffix style (k/m/b/t/qd/qt/sx/sp/oc/no/dc) without importing economy.js,
// since this module has no reason to depend on the whole economy stack.
const SUFFIXES = ["", "k", "m", "b", "t", "qd", "qt", "sx", "sp", "oc", "no", "dc"];
function fmtBig(n) {
  n = typeof n === "bigint" ? Number(n) : n;
  if (!isFinite(n)) return "∞";
  const neg = n < 0; n = Math.abs(n);
  let tier = 0;
  while (n >= 1000 && tier < SUFFIXES.length - 1) { n /= 1000; tier++; }
  const str = tier === 0 ? String(Math.round(n)) : n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0);
  return (neg ? "-" : "") + str + SUFFIXES[tier];
}

module.exports = { renderNotorietyCard };
