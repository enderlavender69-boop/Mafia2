// /don-help must (1) list EVERY command, (2) never list a command the bot doesn't actually accept,
// and (3) be Don-only + private. This runs the REAL parser code from index.js against every
// documented sample, so the list can't silently go stale.
const fs = require("fs"), vm = require("vm"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(root, "index.js"), "utf8");
const dh = require(path.join(root, "donhelp.js"));
let pass = 0, fail = 0;
const ck = (n, c, e = "") => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e); } };

(async () => {
  // ── load the real parsers ────────────────────────────────────────────────
  const a = SRC.indexOf("function detectMasterCommand("), b = SRC.indexOf("async function executeMasterCommand(");
  if (a < 0 || b < 0) throw new Error("parsers not found in index.js");
  const parserSrc = SRC.slice(a, b);
  const ctx = {
    console, RIVAL_BOT_ID: "333333333333333333", client: { user: { id: "BOT" } },
    isTriggered: () => true,
    getTargetId: (m) => ((m.content || "").match(/<@!?(\d+)>/) || [])[1] || null,
    eco: { parseBet: (x) => (/^\d+(?:\.\d+)?[a-z]{0,3}$/i.test(String(x)) ? 1 : null) },
    normalizeTierAlias: (x) => x || null, parseShortAmount: (x) => String(x).trim(), parseDuration: () => 1000, parseFullDuration: () => 1000,
  };
  vm.createContext(ctx);
  vm.runInContext(parserSrc + ";globalThis.M=detectMasterCommand;globalThis.P=detectPublicCommand;", ctx);
  const msg = (t) => ({ author: { id: "1" }, content: t, mentions: { users: new Map([...t.matchAll(/<@!?(\d+)>/g)].map((x) => [x[1], { id: x[1] }])) } });
  const runM = (t) => { const r = ctx.M(t, msg(t), true); return r && r.action; };
  const runP = (t) => { const r = ctx.P(t, msg(t)); return r && r.action; };

  console.log("\n[1] Every documented text command is really accepted by the real parser");
  const parsed = dh.SECTIONS.flatMap((s) => s.items).filter((i) => i.kind === "parsed");
  const direct = dh.SECTIONS.flatMap((s) => s.items).filter((i) => i.kind === "direct");
  let bad = [];
  for (const it of parsed) {
    // Mods/Don go through detectMasterCommand first, then detectPublicCommand (that is what the message handler does).
    const got = it.w === "all" ? runP(it.s) : (runM(it.s) || runP(it.s));
    if (!it.a.includes(got)) bad.push(`${it.u}  [sample "${it.s}" -> ${got}; expected ${it.a.join("|")}]`);
  }
  ck(`all ${parsed.length} parsed entries produce their documented action`, bad.length === 0, "\n    " + bad.join("\n    "));

  console.log("\n[2] No parser action is missing from the list");
  const actions = new Set();
  for (const m of parserSrc.matchAll(/action:\s*"([a-z0-9_]+)"/g)) actions.add(m[1]);
  for (const m of parserSrc.matchAll(/action:\s*[^,{}]*?\?\s*"([a-z0-9_]+)"\s*:\s*"([a-z0-9_]+)"/g)) { actions.add(m[1]); actions.add(m[2]); }
  const covered = new Set(parsed.flatMap((i) => i.a));
  // trivia_start / trivia_stop are produced by the parser but can never be reached by typing text:
  // "cosa trivia ..." is always matched first by the plain "quiz" command. They're slash-only (/trivia).
  const SHADOWED = new Set(["trivia_start", "trivia_stop"]);
  ck("sanity: parser exposes 200+ actions", actions.size > 200, String(actions.size));
  const missing = [...actions].filter((x) => !covered.has(x) && !SHADOWED.has(x));
  ck("every reachable parser action appears in the /don-help list", missing.length === 0, "missing: " + missing.join(", "));
  ck("trivia text commands really are shadowed by 'quiz' (so omitting them is correct)", runP("cosa trivia start") === "quiz" && runP("cosa trivia stop") === "quiz");
  ck("the list doesn't invent actions the parser can't produce", [...covered].every((x) => actions.has(x)), [...covered].filter((x) => !actions.has(x)).join(", "));

  console.log("\n[3] Commands handled directly in index.js still exist there");
  const gone = direct.filter((d) => !SRC.includes(d.k)).map((d) => `${d.u} (looked for ${d.k})`);
  ck(`all ${direct.length} direct entries are still in index.js`, gone.length === 0, "\n    " + gone.join("\n    "));

  console.log("\n[4] Slash commands: all of them are listed, built from the real command array");
  const dump = spawnSync(process.execPath, [path.join(root, "scripts", "dump-commands.js")], { encoding: "utf8" });
  ck("dump-commands ran", dump.status === 0, dump.stderr);
  const tree = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "cmdtree.json"), "utf8"));
  ck("/don-help is one of the registered slash commands", tree.some((c) => c.name === "don-help"));
  const dhCmd = tree.find((c) => c.name === "don-help") || {};
  ck("name is lowercase (Discord rejects capitals) and description <= 100 chars", /^[a-z-]+$/.test(dhCmd.name || "") && (dhCmd.description || "").length <= 100, dhCmd.description);
  const pages = dh.buildDonHelpPages(tree);
  const all = pages.join("\n");
  const notListed = tree.filter((c) => !all.includes("/" + c.name + " ") && !all.includes("/" + c.name + "\n") && !all.endsWith("/" + c.name)).map((c) => c.name);
  ck(`all ${tree.length} slash commands appear`, notListed.length === 0, "missing: " + notListed.join(", "));
  const subMissing = [];
  for (const c of tree) for (const s of (c.options || []).filter((o) => o.__sub || o.__group)) if (!all.includes(`/${c.name} ${s.name}`)) subMissing.push(`${c.name} ${s.name}`);
  ck("every slash subcommand appears too", subMissing.length === 0, subMissing.join(", "));

  // The dump above uses the project's own stand-in format. The REAL discord.js .toJSON() output uses
  // numeric option types (1 = subcommand, 2 = group, 3 = string, 6 = user ...) — check that shape too.
  const real = [
    { name: "ping", description: "Pong", options: [] },
    { name: "give", description: "Give stuff", options: [{ type: 6, name: "user", description: "who", required: true }, { type: 4, name: "amount", description: "how much" }] },
    { name: "raffle", description: "Raffles", options: [
      { type: 1, name: "start", description: "Start one", options: [{ type: 3, name: "prize", description: "p", required: true }, { type: 4, name: "minutes", description: "m", required: true }, { type: 4, name: "cash", description: "c" }] },
      { type: 1, name: "end", description: "End it", options: [] } ] },
    { name: "grp", description: "Group cmd", options: [{ type: 2, name: "team", description: "Team stuff", options: [{ type: 1, name: "add", description: "Add", options: [{ type: 6, name: "user", description: "u", required: true }] }] }] },
  ];
  const rl = dh.slashLines(real).join("\n");
  ck("real Discord JSON: plain command", /^\/ping — Pong$/m.test(rl), rl);
  ck("real Discord JSON: required <user> and optional [amount] shown", /\/give <user> \[amount\] — Give stuff/.test(rl), rl);
  ck("real Discord JSON: subcommands with their options", /\/raffle start <prize> <minutes> \[cash\] — Start one/.test(rl) && /\/raffle end — End it/.test(rl), rl);
  ck("real Discord JSON: subcommand groups", /\/grp team add <user> — Add/.test(rl), rl);

  console.log("\n[5] Pages fit Discord's embed limits and nothing important is cut");
  ck("at least 2 pages (it is a long list)", pages.length >= 2, String(pages.length));
  ck("every page + code fence fits one embed (<= 4096)", pages.every((p) => p.length + 8 <= 4096), pages.map((p) => p.length).join(","));
  ck("no page contains a triple backtick (would break the code block)", pages.every((p) => !p.includes("```")));
  ck("not an absurd number of messages (<= 10)", pages.length <= 10, String(pages.length));
  const rebuilt = pages.join("\n");
  ck("every entry's usage line survives pagination intact", dh.textLines().filter(Boolean).filter((l) => !l.startsWith("──")).every((l) => rebuilt.includes(l)));

  console.log("\n[6] Don-only + private (static check of the real handler)");
  const hs = SRC.indexOf('interaction.commandName === "don-help"');
  ck("handler exists", hs > 0);
  const he = SRC.indexOf('if (interaction.commandName === "help")', hs);
  const block = SRC.slice(hs, he);
  ck("gated on MASTER_ID", /interaction\.user\.id\s*!==\s*MASTER_ID/.test(block));
  ck("strictly Don: granted developers are NOT let in", !/isDeveloperSync/.test(block));
  ck("every reply is ephemeral (only the caller sees it)", (block.match(/\.reply\(|\.followUp\(/g) || []).length === (block.match(/ephemeral:\s*true/g) || []).length && /ephemeral:\s*true/.test(block));

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
