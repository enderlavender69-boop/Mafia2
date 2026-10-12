#!/usr/bin/env node
// One command to verify the whole bot BEFORE you deploy:   npm run check
// Runs: syntax of every file -> project tests -> slash-command validation ->
// AI/chat unit tests -> a full boot of the bot against stand-in Discord/Supabase/Groq
// services with fake messages. No tokens, network or database needed.
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env }, timeout: 240000 });
const steps = [];
const listJs = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f));
const allJs = [...listJs("."), ...(fs.existsSync(path.join(root, "scripts")) ? listJs("scripts") : []), ...(fs.existsSync(path.join(root, "tests")) ? listJs("tests") : [])].map((f) => f.replace(/^\.[\\/]/, ""));

steps.push(["syntax (every .js file)", () => {
  const bad = allJs.filter((f) => run(["--check", f]).status !== 0);
  return { ok: !bad.length, note: bad.length ? "BAD: " + bad.join(", ") : `${allJs.length} files` };
}]);
steps.push(["project tests (test.js)", () => { const r = run(["test.js"]); return { ok: r.status === 0, out: r.stdout + r.stderr }; }]);
steps.push(["slash commands within Discord's limits", () => { const r = run(["scripts/validate-commands.js"]); return { ok: r.status === 0, out: r.stdout + r.stderr }; }]);
if (fs.existsSync(path.join(root, "tests"))) {
  for (const f of fs.readdirSync(path.join(root, "tests")).filter((x) => x.endsWith(".test.js")).sort()) {
    steps.push([`tests/${f}`, () => { const r = run([path.join("tests", f)]); return { ok: r.status === 0, out: r.stdout + r.stderr }; }]);
  }
  steps.push(["whole-bot smoke test (boots index.js, sends fake messages)", () => { const r = run([path.join("tests", "smoke.js")]); return { ok: r.status === 0, out: r.stdout + r.stderr }; }]);
}
let failed = 0; const t0 = Date.now();
console.log("Cosa pre-deploy check\n");
for (const [name, fn] of steps) {
  const t = Date.now(); let res;
  try { res = fn(); } catch (e) { res = { ok: false, out: String(e) }; }
  const lines = (res.out || "").split("\n");
  const summary = lines.filter((l) => /^\s*\d+ passed, \d+ failed\s*$/.test(l)).pop() || lines.filter((l) => /Checked \d+ slash|All checks passed|No violations/.test(l)).slice(-2).join(" | ");
  const tail = (summary || "").trim();
  console.log(`${res.ok ? "✅" : "❌"} ${name.padEnd(62)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${res.note || tail}`);
  if (!res.ok) { failed++; const fails = (res.out || "").split("\n").filter((l) => /FAIL|Error|BAD|violation/i.test(l)).slice(0, 8); if (fails.length) console.log("   " + fails.join("\n   ")); }
}
console.log(`\n${failed ? "❌ " + failed + " step(s) FAILED — do NOT deploy yet." : "✅ All checks passed — safe to deploy."}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
process.exit(failed ? 1 : 0);
