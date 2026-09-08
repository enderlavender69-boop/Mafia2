const fs = require("fs");
const cp = require("child_process");
const path = require("path");

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".js") && f !== "test.js");
let bad = 0;
for (const f of files) {
  try {
    cp.execFileSync(process.execPath, ["--check", path.join(__dirname, f)], { stdio: "pipe" });
    console.log("OK", f);
  } catch (e) {
    bad++;
    console.error("FAIL", f, (e.stderr || e.stdout || e.message).toString());
  }
}
if (bad) process.exit(1);

// Pure money-math regression tests. Stub optional runtime dependencies so the
// economy module can be loaded in CI without Discord/Supabase credentials.
const Module = require("module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "@supabase/supabase-js") return { createClient: () => ({}) };
  if (request === "ws") return {};
  return originalLoad.call(this, request, parent, isMain);
};
try {
  const eco = require("./economy");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  assert(eco.parseBet("999") === 999, "small amount parse failed");
  assert(eco.parseBet("1.5m") === 1500000, "decimal million parse failed");
  assert(eco.parseBet("9qd") === 9000000000000000, "quadrillion precision failed");
  assert(eco.parseBet("9.99qt") === "9990000000000000000", "quintillion precision failed");
  assert(eco.parseBet("10dc") === "10000000000000000000000000000000000", "decillion precision failed");
  assert(eco.multiplyMoney("9999999999999999999", 2) === "19999999999999999998", "giant multiplication failed");
  assert(eco.multiplyMoney("10000000000000000000", 2.5) === "25000000000000000000", "decimal giant multiplication failed");
  assert(eco.fmt("10000000000000000000") === "10qt", "giant formatting failed");
  console.log("OK money precision regression tests");
} finally {
  Module._load = originalLoad;
}

console.log(`All checks passed for ${files.length} JavaScript files.`);
