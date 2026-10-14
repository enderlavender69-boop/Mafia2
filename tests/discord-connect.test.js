// Regression: "cosa suddenly stopped working" — Render's log showed Discord answering
// HTTP 429 {"code":0,"message":"You are being blocked ... global rate limits"} and then
// client.login() hanging forever with no explanation. connectToDiscord() must (a) not call login
// while blocked, (b) wait for Discord's own retry-after, (c) log in as soon as it lifts,
// (d) back off on ordinary login failures, (e) stop on unfixable errors (bad token / intents).
const fs = require("fs"), vm = require("vm"), path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
const a = SRC.indexOf("const discordConn = {"), b = SRC.indexOf('init().catch(err => { console.error("Fatal startup error:"');
if (a < 0 || b < 0) throw new Error("connector not found in index.js");
const code = SRC.slice(a, b);
let pass = 0, fail = 0;
const ck = (n, c, e = "") => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e); } };

function run({ probes, logins }) {
  const waits = [], logs = [], loginCalls = [];
  const probeQ = [...probes], loginQ = [...logins];
  const ctx = {
    process: { env: { DISCORD_TOKEN: "tok" } }, Date, Math, Number, JSON, String, Error, Promise, AbortSignal,
    console: { log: (...x) => logs.push(x.join(" ")), warn: (...x) => logs.push("W:" + x.join(" ")), error: (...x) => logs.push("E:" + x.join(" ")) },
    setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },   // instant, but we record the requested delay
    setInterval: () => 0, clearInterval: () => {},
    client: { login: async (t) => { loginCalls.push(t); const r = loginQ.shift(); if (r instanceof Error) throw r; return "ok"; } },
    fetch: async () => {
      const p = probeQ.shift() || { status: 200, body: "{}" };
      if (p.throw) throw new Error(p.throw);
      return { status: p.status, text: async () => p.body || "", headers: { get: (h) => (h.toLowerCase() === "retry-after" && p.retryAfter != null ? String(p.retryAfter) : null) } };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code + ";globalThis.go=connectToDiscord;globalThis.conn=discordConn;", ctx);
  return ctx.go().then(() => ({ waits, logs, loginCalls, conn: ctx.conn }));
}
const BLOCK = (retryAfter) => ({ status: 429, retryAfter, body: '{"code":0,"message":"You are being blocked from accessing our API temporarily due to exceeding global rate limits."}' });

(async () => {
  console.log("\n[1] Blocked by Discord, then the block lifts");
  let r = await run({ probes: [BLOCK(90), BLOCK(90), { status: 200 }], logins: [null] });
  ck("login is NOT attempted while blocked (only once the block lifts)", r.loginCalls.length === 1 && r.logs.filter((l) => /Attempting Discord gateway login/.test(l)).length === 1);
  ck("it waited Discord's own retry-after (90s) each time", r.waits.filter((w) => w === 90000).length === 2, JSON.stringify(r.waits));
  ck("the log says plainly that Discord is blocking the host and that it isn't a token/code problem", r.logs.some((l) => /temporarily blocking this host/.test(l) && /not a token or code problem/.test(l)));
  ck("it tells you not to redeploy repeatedly", r.logs.some((l) => /Do NOT keep redeploying/.test(l)));
  ck("final state is 'connected'", r.conn.state === "connected", r.conn.state);

  console.log("\n[2] Waits are clamped to something sane");
  r = await run({ probes: [BLOCK(5), BLOCK(99999), BLOCK(undefined), { status: 200 }], logins: [null] });
  ck("tiny retry-after is raised to 30s; huge one is capped at 10 min; missing header defaults to 2 min", JSON.stringify(r.waits) === JSON.stringify([30000, 600000, 120000]), JSON.stringify(r.waits));
  r = await run({ probes: [{ status: 429, body: '{"retry_after": 45.5}' }, { status: 200 }], logins: [null] });
  ck("retry_after is also read from the JSON body when the header is absent", r.waits[0] === 45500, JSON.stringify(r.waits));

  console.log("\n[3] Network trouble is not mistaken for a ban");
  r = await run({ probes: [{ throw: "getaddrinfo ENOTFOUND discord.com" }], logins: [null] });
  ck("a failed probe does not wait — it just tries to log in", r.waits.length === 0 && r.loginCalls.length === 1);

  console.log("\n[4] Ordinary login failures retry with backoff");
  r = await run({ probes: [], logins: [new Error("socket hang up"), new Error("socket hang up"), null] });
  ck("retried until it worked (3 login calls)", r.loginCalls.length === 3 && r.conn.state === "connected");
  ck("backoff grows: 30s then 60s", JSON.stringify(r.waits) === JSON.stringify([30000, 60000]), JSON.stringify(r.waits));

  console.log("\n[5] Unfixable errors are reported once, not looped");
  r = await run({ probes: [], logins: [Object.assign(new Error("An invalid token was provided."), { code: "TokenInvalid" })] });
  ck("bad token: one attempt, no retry loop", r.loginCalls.length === 1 && r.waits.length === 0);
  ck("state is 'fatal' and the log names the fix", r.conn.state === "fatal" && r.logs.some((l) => /DISCORD_TOKEN/.test(l)));
  r = await run({ probes: [], logins: [Object.assign(new Error("Used disallowed intents"), { code: "DisallowedIntents" })] });
  ck("missing intents (Message Content / Members): also stops and explains", r.loginCalls.length === 1 && r.conn.state === "fatal" && r.logs.some((l) => /intents/i.test(l)));

  console.log("\n[6] The real token is used and /status exposes state");
  ck("login is called with DISCORD_TOKEN", r.loginCalls[0] === "tok");
  const ka = fs.readFileSync(path.join(__dirname, "..", "keepalive.js"), "utf8");
  ck("keepalive serves /status and keeps the plain / route for uptime pingers", /app\.get\("\/status"/.test(ka) && /app\.get\("\/"/.test(ka));
  ck("init() wires the connector in (not the old fire-and-forget login)", /connectToDiscord\(\);/.test(SRC) && !/client\.login\(process\.env\.DISCORD_TOKEN\)\s*\n\s*\.then/.test(SRC));

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
