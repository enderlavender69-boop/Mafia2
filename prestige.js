// ── prestige.js — Ascension / Respect system ───────────────────────────────
// Cookie-Clicker-style prestige: convert lifetime earnings into a permanent
// currency ("Respect") that grants a permanent % bonus to future earnings,
// at the cost of wiping your current money. Built on `wallets.total_earned`,
// which already tracks lifetime earnings and never decreases.

const { createClient } = require("@supabase/supabase-js");
const eco = require("./economy.js");
const bank = require("./bank.js");

let supabase; // set by initPrestige(), called from index.js at boot
function initPrestige(url, key) {
  supabase = createClient(url, key);
  console.log("🎖️ Prestige system initialized");
}

// +0.5% to earnings per Respect point, uncapped by design — this is meant to
// be an open-ended long-term sink, same philosophy as Cookie Clicker's
// heavenly chips: each run makes the next one faster, indefinitely.
const BONUS_PER_POINT = 0.005;

const prestigeCache = new Map(); // userId -> { points: Number, ascensions: Number }

async function loadPrestige() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("prestige").select("*");
    if (error) throw error;
    for (const row of data || []) {
      prestigeCache.set(row.user_id, { points: Number(row.points) || 0, ascensions: row.ascension_count || 0 });
    }
    console.log(`[PRESTIGE] Loaded Respect for ${(data || []).length} players`);
  } catch (e) { console.error("[PRESTIGE LOAD]", e.message); }
}

function getPrestige(userId) {
  return prestigeCache.get(userId) || { points: 0, ascensions: 0 };
}

function getTopPrestige(limit = 10) {
  return [...prestigeCache.entries()]
    .map(([userId, v]) => ({ userId, points: v.points, ascensions: v.ascensions }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

// Multiplier to apply at any earning point (job payouts, daily claim, etc).
// 0 Respect -> 1x (no change) so nobody who never touches this system sees
// any behavior difference from before it existed.
function getBonusMultiplier(userId) {
  return 1 + getPrestige(userId).points * BONUS_PER_POINT;
}

// Cookie-Clicker-style sqrt curve on lifetime earnings (in Cash/copper):
// 1B lifetime earned -> 1 point, 1T -> ~31, 1qd -> 1,000, 1qt -> ~31,600.
// Deliberately slow early on, using the same astronomical scale this economy
// already deals in (see economy.js's k/m/b/t/qd/qt/sx/sp/oc/no/dc ladder).
function calculateEarnablePoints(totalEarnedCopper) {
  const n = Number(totalEarnedCopper);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(Math.sqrt(n / 1_000_000_000));
}

async function getPrestigeInfo(userId) {
  const wallet = await eco.getWallet(userId).catch(() => null);
  const totalEarned = wallet ? Number(wallet.total_earned || 0) : 0;
  const earnable = calculateEarnablePoints(totalEarned);
  const current = getPrestige(userId);
  return {
    currentPoints: current.points,
    ascensions: current.ascensions,
    currentBonusPct: current.points * BONUS_PER_POINT * 100,
    totalEarned,
    earnableIfAscendNow: earnable,
    bonusAfterAscend: (current.points + earnable) * BONUS_PER_POINT * 100,
  };
}

// The reset itself. Only wipes money (wallet copper/silver/gold/stellar/debt
// and total_earned, plus bank balance) — inventory, firm holdings, gang
// membership, marriage, and notoriety are all left untouched on purpose.
// Those represent real player effort/relationships, not raw Cash, and
// shouldn't be casually destroyed by an economy reset button.
async function ascend(userId) {
  const wallet = await eco.getWallet(userId).catch(() => null);
  if (!wallet) return { success: false, reason: "Couldn't load your wallet." };
  const totalEarned = Number(wallet.total_earned || 0);
  const earnable = calculateEarnablePoints(totalEarned);
  if (earnable <= 0) {
    return { success: false, reason: "You need at least 💵 1,000,000,000 Cash earned lifetime to ascend — keep grinding." };
  }
  await eco.saveWallet({ ...wallet, copper: 0, silver: 0, gold: 0, stellar: 0, debt: 0, total_earned: 0 });
  const bankAccount = await bank.getBankAccount(userId).catch(() => null);
  if (bankAccount) await bank.saveBankAccount({ ...bankAccount, balance: 0 }).catch(() => {});

  const current = getPrestige(userId);
  const updated = { points: current.points + earnable, ascensions: current.ascensions + 1 };
  prestigeCache.set(userId, updated);
  try {
    await supabase.from("prestige").upsert(
      { user_id: userId, points: updated.points, ascension_count: updated.ascensions, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } catch (e) { console.error("[PRESTIGE SAVE]", e.message); }

  return {
    success: true,
    pointsGained: earnable,
    newTotal: updated.points,
    newBonusPct: updated.points * BONUS_PER_POINT * 100,
    ascensions: updated.ascensions,
  };
}

module.exports = {
  initPrestige, loadPrestige, getPrestige, getTopPrestige, getBonusMultiplier, getPrestigeInfo,
  ascend, calculateEarnablePoints, BONUS_PER_POINT,
};
