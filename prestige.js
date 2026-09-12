// ── prestige.js — Ascension / Respect tech tree ────────────────────────────
// Cookie-Clicker-style prestige: convert lifetime earnings into "Respect", a
// currency you SPEND on a tiered tree of permanent upgrades (not a passive
// per-point bonus — the bonus comes entirely from what you've bought).
// Built on `wallets.total_earned`, which already tracks lifetime earnings
// and never decreases.

const { createClient } = require("@supabase/supabase-js");
const eco = require("./economy.js");
const bank = require("./bank.js");

let supabase; // set by initPrestige(), called from index.js at boot
function initPrestige(url, key) {
  supabase = createClient(url, key);
  console.log("🎖️ Prestige system initialized");
}

// ── The tech tree ────────────────────────────────────────────────────────────
// A smaller, fully real, extensible tree — not a 129-node recreation of
// Cookie Clicker's heavenly upgrades, but built so adding more nodes later is
// just appending to this array. `prereqs` is a list of upgrade keys that must
// ALL be owned first (some tier-3 nodes deliberately require two tier-2
// branches to converge, like a real tech tree). `bonusPct` stacks additively
// with every other owned upgrade into the single earnings multiplier applied
// at work/crime/scavenge/smuggle payouts and the daily claim.
const UPGRADE_TREE = [
  // Tier 1 — cheap, root-level
  { key: "blood_oath",      name: "Blood Oath",              icon: "🩸", tier: 1, cost: 1,   prereqs: [],                          bonusPct: 0.01, desc: "The Family remembers this ascension. +1% earnings." },
  { key: "heavenly_ledger", name: "Heavenly Ledger",         icon: "📖", tier: 1, cost: 3,   prereqs: ["blood_oath"],             bonusPct: 0.02, desc: "Every debt and favor, written down forever. +2% earnings." },
  { key: "old_recipes",     name: "Old Family Recipes",      icon: "🍝", tier: 1, cost: 5,   prereqs: ["blood_oath"],             bonusPct: 0.02, desc: "Passed down, never forgotten. +2% earnings." },
  { key: "made_man",        name: "Made Man Status",         icon: "🎩", tier: 1, cost: 8,   prereqs: ["blood_oath"],             bonusPct: 0.03, desc: "You don't start from nothing anymore. +3% earnings." },

  // Tier 2 — require a tier-1 node
  { key: "second_gen",      name: "Second Generation",       icon: "👨‍👦", tier: 2, cost: 15,  prereqs: ["heavenly_ledger"],        bonusPct: 0.05, desc: "The next run starts stronger. +5% earnings." },
  { key: "offshore",        name: "Offshore Accounts",       icon: "🛳️", tier: 2, cost: 20,  prereqs: ["old_recipes"],            bonusPct: 0.05, desc: "Some money never really disappears. +5% earnings." },
  { key: "loaded_dice_perm",name: "Loaded Dice, Permanently",icon: "🎲", tier: 2, cost: 25,  prereqs: ["made_man"],               bonusPct: 0.06, desc: "The house doesn't always win. +6% earnings." },

  // Tier 3 — converging branches
  { key: "commission",      name: "The Commission",          icon: "🏛️", tier: 3, cost: 50,  prereqs: ["second_gen", "offshore"], bonusPct: 0.10, desc: "Every Family answers to someone. +10% earnings." },
  { key: "untouchable_rep", name: "Untouchable Reputation",  icon: "🛡️", tier: 3, cost: 60,  prereqs: ["loaded_dice_perm"],       bonusPct: 0.10, desc: "Nobody questions you twice. +10% earnings." },

  // Tier 4 — capstone, requires both tier-3 branches
  { key: "kingpin_legacy",  name: "Kingpin's Legacy",        icon: "👑", tier: 4, cost: 150, prereqs: ["commission", "untouchable_rep"], bonusPct: 0.25, desc: "The name outlives the man. +25% earnings." },
];
function getUpgrade(key) { return UPGRADE_TREE.find(u => u.key === key); }
// Loose match by key or name substring — good enough for a small, named tree.
function resolveUpgrade(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  return UPGRADE_TREE.find(u => u.key === q) ||
         UPGRADE_TREE.find(u => u.name.toLowerCase() === q) ||
         UPGRADE_TREE.find(u => u.name.toLowerCase().includes(q)) ||
         null;
}

const prestigeCache = new Map();  // userId -> { balance, lifetimeEarned, ascensions }
const ownedUpgrades = new Map();  // userId -> Set(upgradeKey)

async function loadPrestige() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("prestige").select("*");
    if (error) throw error;
    for (const row of data || []) {
      prestigeCache.set(row.user_id, {
        balance: Number(row.points) || 0,
        lifetimeEarned: Number(row.lifetime_points ?? row.points) || 0,
        ascensions: row.ascension_count || 0,
      });
    }
    console.log(`[PRESTIGE] Loaded Respect for ${(data || []).length} players`);
  } catch (e) { console.error("[PRESTIGE LOAD]", e.message); }
}
async function loadPrestigeUpgrades() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("prestige_upgrades").select("*");
    if (error) throw error;
    for (const row of data || []) {
      if (!ownedUpgrades.has(row.user_id)) ownedUpgrades.set(row.user_id, new Set());
      ownedUpgrades.get(row.user_id).add(row.upgrade_key);
    }
    console.log(`[PRESTIGE] Loaded ${(data || []).length} owned upgrades`);
  } catch (e) { console.error("[PRESTIGE UPGRADES LOAD]", e.message); }
}

function getPrestige(userId) {
  return prestigeCache.get(userId) || { balance: 0, lifetimeEarned: 0, ascensions: 0 };
}
function getOwnedUpgrades(userId) {
  return ownedUpgrades.get(userId) || new Set();
}
function hasUpgrade(userId, key) {
  return getOwnedUpgrades(userId).has(key);
}
// The ONLY source of the earnings bonus — sum of every owned upgrade's
// bonusPct. 0 upgrades owned -> 1x (no change), same as before this system
// existed, so nobody who's never ascended sees any behavior difference.
function getBonusMultiplier(userId) {
  const owned = getOwnedUpgrades(userId);
  let total = 0;
  for (const key of owned) total += getUpgrade(key)?.bonusPct || 0;
  return 1 + total;
}
function canAfford(userId, key) {
  const up = getUpgrade(key);
  if (!up) return { ok: false, reason: "No such upgrade." };
  if (hasUpgrade(userId, key)) return { ok: false, reason: "Already owned." };
  const missing = up.prereqs.filter(p => !hasUpgrade(userId, p));
  if (missing.length) return { ok: false, reason: `Requires: ${missing.map(k => getUpgrade(k)?.name || k).join(", ")}` };
  if (getPrestige(userId).balance < up.cost) return { ok: false, reason: `Not enough Respect (need ${up.cost}).` };
  return { ok: true };
}
async function purchaseUpgrade(userId, key) {
  const check = canAfford(userId, key);
  if (!check.ok) return { success: false, reason: check.reason };
  const up = getUpgrade(key);
  const current = getPrestige(userId);
  const updated = { ...current, balance: current.balance - up.cost };
  prestigeCache.set(userId, updated);
  if (!ownedUpgrades.has(userId)) ownedUpgrades.set(userId, new Set());
  ownedUpgrades.get(userId).add(key);
  try {
    await supabase.from("prestige").upsert(
      { user_id: userId, points: updated.balance, lifetime_points: updated.lifetimeEarned, ascension_count: updated.ascensions, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await supabase.from("prestige_upgrades").upsert({ user_id: userId, upgrade_key: key }, { onConflict: "user_id,upgrade_key" });
  } catch (e) { console.error("[PRESTIGE PURCHASE SAVE]", e.message); }
  return { success: true, upgrade: up, newBalance: updated.balance };
}

// Cookie-Clicker-style sqrt curve on lifetime earnings (in Cash/copper):
// 1B lifetime earned -> 1 point, 1T -> ~31, 1qd -> 1,000, 1qt -> ~31,600.
// Deliberately slow early on, using the same astronomical scale this economy
// already deals in (see economy.js's full suffix ladder up to vigintillion).
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
    balance: current.balance,
    lifetimeEarned: current.lifetimeEarned,
    ascensions: current.ascensions,
    currentBonusPct: (getBonusMultiplier(userId) - 1) * 100,
    totalEarned,
    earnableIfAscendNow: earnable,
    ownedCount: getOwnedUpgrades(userId).size,
    totalUpgrades: UPGRADE_TREE.length,
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
  const updated = {
    balance: current.balance + earnable,
    lifetimeEarned: current.lifetimeEarned + earnable,
    ascensions: current.ascensions + 1,
  };
  prestigeCache.set(userId, updated);
  try {
    await supabase.from("prestige").upsert(
      { user_id: userId, points: updated.balance, lifetime_points: updated.lifetimeEarned, ascension_count: updated.ascensions, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } catch (e) { console.error("[PRESTIGE SAVE]", e.message); }

  return { success: true, pointsGained: earnable, newBalance: updated.balance, ascensions: updated.ascensions };
}

function getTopPrestige(limit = 10) {
  return [...prestigeCache.entries()]
    .map(([userId, v]) => ({ userId, lifetimeEarned: v.lifetimeEarned, ascensions: v.ascensions }))
    .sort((a, b) => b.lifetimeEarned - a.lifetimeEarned)
    .slice(0, limit);
}

module.exports = {
  initPrestige, loadPrestige, loadPrestigeUpgrades,
  getPrestige, getOwnedUpgrades, hasUpgrade, getBonusMultiplier, getPrestigeInfo,
  canAfford, purchaseUpgrade, ascend, getTopPrestige,
  calculateEarnablePoints, UPGRADE_TREE, getUpgrade, resolveUpgrade,
};
