// ── Casino games ──────────────────────────────────────────────────────────────
// Four new gambling games: Roulette, Minesweeper, Mystery Box, and Arena.
// Follows the same conventions as the existing slots/wheel games in
// economy.js: pure functions return a result object, index.js handles the
// actual bet deduction/payout via eco.deductCopper/payoutOrRefund so all four
// games get the same insufficient-funds handling, White Money bypass, and
// house-cut bookkeeping as everything else.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// ── Roulette ──────────────────────────────────────────────────────────────────
// Standard European single-zero wheel: 0-36, 0 is green (house edge ~2.7%,
// same as a real casino's single-zero table — no extra "00" pocket).
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function rouletteColorOf(n) {
  if (n === 0) return "green";
  return ROULETTE_RED.has(n) ? "red" : "black";
}

// betType: "number" (0-36) or "color" ("red"/"black"). betValue matches.
// Straight-number hit pays 36x (35:1 profit + stake back). Color hit pays 2x
// (1:1 profit + stake back) — standard roulette payouts.
function playRoulette(betType, betValue) {
  const result = Math.floor(Math.random() * 37);
  const color = rouletteColorOf(result);
  let multiplier = 0;
  let won = false;
  const type = String(betType || "").toLowerCase();
  if (type === "number" && result === Number(betValue)) { multiplier = 36; won = true; }
  else if (type === "color" && color === betValue) { multiplier = 2; won = true; }
  else if (type === "parity" && result !== 0 && (result % 2 ? "odd" : "even") === betValue) { multiplier = 2; won = true; }
  else if (type === "range" && result !== 0 && (result <= 18 ? "low" : "high") === betValue) { multiplier = 2; won = true; }
  else if (type === "dozen") {
    const dozen = result === 0 ? 0 : Math.ceil(result / 12);
    if (dozen === Number(betValue)) { multiplier = 3; won = true; }
  }
  return { result, color, multiplier, won, betType: type, betValue };
}

// ── Mystery Box ───────────────────────────────────────────────────────────────
// Weighted single-pull box. Weights sum to 100 and are tuned for a small
// house edge (~3%, EV ≈ 0.97) — same target edge as the other games here.
// Adjust weights freely if a different edge/feel is wanted; nothing else
// depends on the exact numbers.
const MYSTERY_BOX_STAGES = [
  { key: "bankrupt", label: "💀 Bankruptcy",           multiplier: 0,  weight: 38 },
  { key: "half",     label: "😬 0.5x — Small Loss",     multiplier: 0.5, weight: 30 },
  { key: "even",     label: "😐 1x — Break Even",       multiplier: 1,  weight: 16 },
  { key: "small",    label: "🙂 2x — Small Win",        multiplier: 2,  weight: 9 },
  { key: "big",      label: "😃 4x — Big Win",          multiplier: 4,  weight: 4 },
  { key: "jackpot",  label: "🎉 8x — JACKPOT",          multiplier: 8,  weight: 2 },
  { key: "super",    label: "🌟 16x — SUPER JACKPOT",   multiplier: 16, weight: 1 },
];
const MYSTERY_BOX_TOTAL_WEIGHT = MYSTERY_BOX_STAGES.reduce((s, x) => s + x.weight, 0);

function playMysteryBox() {
  let roll = Math.random() * MYSTERY_BOX_TOTAL_WEIGHT;
  for (const stage of MYSTERY_BOX_STAGES) {
    if (roll < stage.weight) return stage;
    roll -= stage.weight;
  }
  return MYSTERY_BOX_STAGES[0]; // unreachable, defensive fallback
}

// ── Arena ─────────────────────────────────────────────────────────────────────
// Difficulty tiers exactly as specified: higher risk, higher multiplier.
// Limbus Company themed — the deeper you go, the more distorted the fight.
const ARENA_TIERS = {
  easy:       { label: "Backstreets",      emoji: "🟢", winChance: 0.90,  multiplier: 1.2 },
  medium:     { label: "Nest",             emoji: "🟡", winChance: 0.60,  multiplier: 2 },
  hard:       { label: "L Corp. Branch",   emoji: "🟠", winChance: 0.35,  multiplier: 4 },
  extreme:    { label: "Lobotomy Corp.",   emoji: "🔴", winChance: 0.15,  multiplier: 8 },
  nightmare:  { label: "The Library",      emoji: "🟣", winChance: 0.075, multiplier: 16 },
  boss:       { label: "The Head",         emoji: "⚫", winChance: 0.02,  multiplier: 32 },
};

const ARENA_ENEMY_NAMES = [
  // Backstreets / Low-tier
  "a Backstreets thug", "a Fixer rookie", "a Sweeper", "a Syndicate grunt",
  "a rogue Claw mercenary", "a Tousle-headed punk", "a down-on-their-luck Fixer",
  // Mid-tier
  "a Grade 9 Fixer", "a Liu Association enforcer", "a Shi Association agent",
  "a W Corp. Cleaner", "a R Corp. Rabbit", "a T Corp. Timekeeper",
  "a K Corp. Knight", "a N Corp. Inquisitor", "a V Corp. Vampire",
  // High-tier / Distortions
  "a Distorted Fixer", "a Color Fixer — Red", "a Color Fixer — Black",
  "a Blue Reverb Trumpeter", "a Purple Tear", "a Black Silence",
  "an Abnormality: Laetitia", "an Abnormality: Queen of Hearts",
  "an Abnormality: Melting Love", "an Abnormality: Nothing There",
  // Boss tier
  "The Blue Reverb: Philip", "The Black Silence: Kromer",
  "The Red Mist: Roland", "The Purple Tear: Angela",
  "a Claw of the Head", "an Arbiter: Gebura", "an Arbiter: Binah",
  "the Head itself...",
];

function playArena(tierKey) {
  const tier = ARENA_TIERS[tierKey];
  if (!tier) return null;
  const enemy = ARENA_ENEMY_NAMES[Math.floor(Math.random() * ARENA_ENEMY_NAMES.length)];
  const won = Math.random() < tier.winChance;
  return { tier: tierKey, tierData: tier, enemy, won, multiplier: won ? tier.multiplier : 0 };
}

// ── Minesweeper ───────────────────────────────────────────────────────────────
// 5x5 grid (25 cells = exactly one full Discord button layout, 5 rows of 5).
// 5 bombs, 20 safe cells. Each safe reveal raises the multiplier using the
// standard "mines" fair-odds step (1 / probability the reveal was safe),
// then applies a small per-step house edge. Hitting a bomb ends the game
// immediately with its own fixed 40/60 sub-roll — the multiplier built up
// from safe cells is irrelevant once a bomb is hit; it only matters if the
// player cashes out before that happens.
const MINES_GRID_SIZE = 5;
const MINES_TOTAL_CELLS = MINES_GRID_SIZE * MINES_GRID_SIZE; // 25
const MINES_BOMB_COUNT = 5;
const MINES_STEP_HOUSE_EDGE = 0.95; // ~5% taken off the fair multiplier each safe step
const MINES_GAME_TIMEOUT_MS = 3 * 60 * 1000; // 3 min idle -> auto-refund at current state

// gameKey (userId, one active game at a time) -> game state
const activeMinesGames = new Map();

function newMinesGrid() {
  const cells = Array.from({ length: MINES_TOTAL_CELLS }, (_, i) => i);
  const bombs = new Set();
  while (bombs.size < MINES_BOMB_COUNT) {
    bombs.add(cells[Math.floor(Math.random() * MINES_TOTAL_CELLS)]);
  }
  return bombs;
}

function startMinesGame(userId, bet) {
  const bombs = newMinesGrid();
  const timeout = setTimeout(() => {
    activeMinesGames.delete(userId);
  }, MINES_GAME_TIMEOUT_MS);
  const game = {
    userId, bet, bombs,
    revealed: new Set(),
    multiplier: 1,
    cellsRemaining: MINES_TOTAL_CELLS,
    safeRemaining: MINES_TOTAL_CELLS - MINES_BOMB_COUNT,
    ended: false,
    timeout,
  };
  activeMinesGames.set(userId, game);
  return game;
}

function getMinesGame(userId) {
  return activeMinesGames.get(userId) || null;
}

function endMinesGame(userId) {
  const game = activeMinesGames.get(userId);
  if (game) clearTimeout(game.timeout);
  activeMinesGames.delete(userId);
}

// Reveals one cell. Returns:
//   { outcome: "safe", multiplier, cellIndex }
//   { outcome: "bomb", bankrupt: bool, multiplier, cellIndex }  (multiplier is the FINAL payout multiplier: 0 or 0.5)
//   { outcome: "already_revealed" } / { outcome: "invalid" }
function revealMinesCell(userId, cellIndex) {
  const game = activeMinesGames.get(userId);
  if (!game || game.ended) return { outcome: "invalid" };
  if (game.revealed.has(cellIndex)) return { outcome: "already_revealed" };
  if (cellIndex < 0 || cellIndex >= MINES_TOTAL_CELLS) return { outcome: "invalid" };

  game.revealed.add(cellIndex);

  if (game.bombs.has(cellIndex)) {
    game.ended = true;
    const bankrupt = Math.random() < 0.40; // 40/60 split exactly as specified
    const finalMultiplier = bankrupt ? 0 : 0.5;
    game.multiplier = finalMultiplier;
    clearTimeout(game.timeout);
    return { outcome: "bomb", bankrupt, multiplier: finalMultiplier, cellIndex };
  }

  // Fair-odds step: probability this reveal was safe = safeRemaining/cellsRemaining.
  // Multiplying by the inverse keeps the ladder fair before the house edge.
  const stepFairMultiplier = game.cellsRemaining / game.safeRemaining;
  game.multiplier *= stepFairMultiplier * MINES_STEP_HOUSE_EDGE;
  game.cellsRemaining--;
  game.safeRemaining--;

  // Cleared the whole board (all 20 safe cells found) — auto cash-out.
  const cleared = game.revealed.size === (MINES_TOTAL_CELLS - MINES_BOMB_COUNT);
  if (cleared) {
    game.ended = true;
    clearTimeout(game.timeout);
  }

  return { outcome: "safe", multiplier: game.multiplier, cellIndex, cleared };
}

function cashOutMines(userId) {
  const game = activeMinesGames.get(userId);
  if (!game || game.ended) return null;
  game.ended = true;
  clearTimeout(game.timeout);
  return { multiplier: game.multiplier };
}

// Builds the 5 button rows (5x5). Revealed-safe cells show 💎, the clicked
// bomb shows 💣, everything else stays a blank button. When `revealAll` is
// true (game over), any UNREVEALED bomb cells are also shown as 💣 so the
// player can see the full board, and every button is disabled.
function buildMinesGrid(game, revealAll = false) {
  const rows = [];
  for (let r = 0; r < MINES_GRID_SIZE; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < MINES_GRID_SIZE; c++) {
      const idx = r * MINES_GRID_SIZE + c;
      const isRevealed = game.revealed.has(idx);
      const isBomb = game.bombs.has(idx);
      let label = "​"; // zero-width space — blank-looking button
      let style = ButtonStyle.Secondary;
      let disabled = game.ended;

      if (isRevealed && isBomb) {
        label = "💣"; style = ButtonStyle.Danger; disabled = true;
      } else if (isRevealed) {
        label = "💎"; style = ButtonStyle.Success; disabled = true;
      } else if (revealAll && isBomb) {
        label = "💣"; style = ButtonStyle.Secondary; disabled = true;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_cell:${game.userId}:${idx}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }
  return rows;
}

function buildMinesCashoutRow(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mines_cashout:${userId}`)
      .setLabel("💰 Cash Out")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

module.exports = {
  playRoulette, rouletteColorOf, ROULETTE_RED,
  playMysteryBox, MYSTERY_BOX_STAGES,
  playArena, ARENA_TIERS,
  startMinesGame, getMinesGame, endMinesGame, revealMinesCell, cashOutMines,
  buildMinesGrid, buildMinesCashoutRow,
  MINES_GRID_SIZE, MINES_TOTAL_CELLS, MINES_BOMB_COUNT,
};
