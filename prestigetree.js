// ── prestigetree.js — Prestige tech tree renderer ──────────────────────────
// Same proven canvas APIs as notoritychart.js/stockchart.js (createCanvas,
// the shared quadraticCurveTo-based roundRect, ctx.arc, ctx.moveTo/lineTo,
// fillText) — nothing new or unproven introduced here.

const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

try {
  GlobalFonts.registerFromPath(path.join(__dirname, "font.ttf"), "PosterFont");
} catch (e) {
  console.error("Prestige tree font registration failed:", e.message);
}

const C = {
  bg:          "#0e1117",
  border:      "#2a2f45",
  textPrimary: "#e0e6f0",
  textMuted:   "#8892a4",
  textFaint:   "#4a5568",
  line:        "#2a2f45",
  lineActive:  "#facc15",
  owned:       "#facc15",
  affordable:  "#34d399",
  locked:      "#2a2f45",
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
 * @param {object[]} tree - UPGRADE_TREE from prestige.js
 * @param {Set<string>} owned - keys the player owns
 * @param {number} balance - current spendable Respect
 */
function renderTree(tree, owned, balance) {
  const tiers = {};
  for (const u of tree) (tiers[u.tier] ||= []).push(u);
  const tierNums = Object.keys(tiers).map(Number).sort((a, b) => a - b);

  const NODE_W = 190, NODE_H = 90, ROW_H = 150, PAD = 40;
  const maxCols = Math.max(...tierNums.map(t => tiers[t].length));
  const W = Math.max(700, PAD * 2 + maxCols * (NODE_W + 30) - 30);
  const H = PAD * 2 + 70 + tierNums.length * ROW_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = C.bg;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 20);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.textPrimary;
  ctx.font = "bold 28px PosterFont, sans-serif";
  ctx.fillText("🎖️ RESPECT TREE", PAD, 48);
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 22px PosterFont, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${balance} Respect`, W - PAD, 48);
  ctx.textAlign = "left";

  // Compute the center point of every node up front, so connector lines can
  // be drawn (prereqs may sit above in an earlier tier) before the node
  // boxes themselves, keeping lines UNDER the boxes visually.
  const centers = {};
  tierNums.forEach((tierNum, rowIdx) => {
    const nodes = tiers[tierNum];
    const rowY = PAD + 70 + rowIdx * ROW_H;
    const rowW = nodes.length * NODE_W + (nodes.length - 1) * 30;
    const startX = (W - rowW) / 2;
    nodes.forEach((u, colIdx) => {
      const x = startX + colIdx * (NODE_W + 30);
      centers[u.key] = { x: x + NODE_W / 2, y: rowY + NODE_H / 2, x0: x, y0: rowY };
    });
  });

  // Connector lines first (under the boxes)
  for (const u of tree) {
    const to = centers[u.key];
    for (const preKey of u.prereqs) {
      const from = centers[preKey];
      if (!from) continue;
      const active = owned.has(u.key) || owned.has(preKey);
      ctx.strokeStyle = active ? C.lineActive : C.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y0 + NODE_H / 2);
      ctx.lineTo(to.x, to.y0 - NODE_H / 2);
      ctx.stroke();
    }
  }

  // Node boxes
  for (const u of tree) {
    const { x0, y0 } = centers[u.key];
    const isOwned = owned.has(u.key);
    const prereqsMet = u.prereqs.every(p => owned.has(p));
    const affordable = !isOwned && prereqsMet && balance >= u.cost;
    const color = isOwned ? C.owned : affordable ? C.affordable : C.locked;

    ctx.fillStyle = "#161b28";
    roundRect(ctx, x0, y0, NODE_W, NODE_H, 12);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isOwned ? 4 : 2;
    roundRect(ctx, x0, y0, NODE_W, NODE_H, 12);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = C.textPrimary;
    ctx.font = "bold 16px PosterFont, sans-serif";
    const nameLine = `${u.icon} ${u.name}`;
    ctx.fillText(nameLine.length > 22 ? nameLine.slice(0, 21) + "…" : nameLine, x0 + 12, y0 + 26);

    ctx.font = "13px PosterFont, sans-serif";
    ctx.fillStyle = C.textMuted;
    const bonusText = `+${Math.round(u.bonusPct * 100)}% earnings`;
    ctx.fillText(bonusText, x0 + 12, y0 + 47);

    ctx.font = "bold 14px PosterFont, sans-serif";
    ctx.fillStyle = isOwned ? C.owned : prereqsMet ? C.textPrimary : C.textFaint;
    const costText = isOwned ? "✅ OWNED" : `💎 ${u.cost} Respect`;
    ctx.fillText(costText, x0 + 12, y0 + 70);

    if (!isOwned && !prereqsMet) {
      ctx.font = "11px PosterFont, sans-serif";
      ctx.fillStyle = C.textFaint;
      ctx.fillText("🔒 locked", x0 + NODE_W - 62, y0 + 26);
    }
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderTree };
