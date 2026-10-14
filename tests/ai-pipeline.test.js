// Groq (like OpenAI) REJECTS messages with unknown fields — a stand-in that accepts anything hid exactly that bug once.
function assertGroqSchema(b) {
  const ok = new Set(["role", "content", "name", "tool_calls", "tool_call_id"]);
  (b.messages || []).forEach((m, i) => {
    for (const k of Object.keys(m)) if (!ok.has(k)) throw Object.assign(new Error(`400 {"error":{"message":"'messages.${i}' : for 'role:${m.role}' the following must be satisfied[('messages.${i}' : property '${k}' is unsupported)]","type":"invalid_request_error"}}`), { status: 400 });
    if (typeof m.content !== "string") throw Object.assign(new Error(`400 {"error":{"message":"'messages.${i}' : content must be a string"}}`), { status: 400 });
  });
}
// Extracts the REAL code from index.js (not a re-implementation) and exercises it.
const fs = require("fs");
const vm = require("vm");

const SRC = fs.readFileSync(require("path").join(__dirname, "..", "index.js"), "utf8");
function slice(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error("missing start marker: " + startMarker);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error("missing end marker: " + endMarker);
  return SRC.slice(a, b);
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, extra); }
}

// ════════════════════════════════════════════════════════════════════════════
// A. Groq call pipeline with a scripted mock client
// ════════════════════════════════════════════════════════════════════════════
async function runPipeline(script, { keys = ["k1"], env = {}, opts = {}, calls = 1 } = {}) {
  const code = slice("// ── GROQ AI Setup — Multi-key rotation", "// ── API Leak Protection");
  const log = [];
  const received = []; // every request body the "API" saw
  class Groq {
    constructor() {
      this.chat = { completions: { create: async (body) => {
        assertGroqSchema(body);
        received.push(JSON.parse(JSON.stringify(body)));
        const step = script.shift();
        if (!step) throw Object.assign(new Error("script exhausted"), { status: 500 });
        if (step.err) throw Object.assign(new Error(step.err), { status: step.status });
        return { choices: [{ message: { content: step.content } }] };
      } } };
    }
  }
  const ctx = {
    process: { env: { GROQ_API_KEY: keys[0], GROQ_API_KEY_2: keys[1], GROQ_API_KEY_3: keys[2], ...env } },
    console: { log: () => {}, error: (...a) => log.push("E:" + a.join(" ")), warn: (...a) => log.push("W:" + a.join(" ")) },
    Groq, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Set, Map, String, Number, Error,
    Client: class { constructor(o) { this.options = o; } },
    GatewayIntentBits: new Proxy({}, { get: () => 1 }), Partials: new Proxy({}, { get: () => 1 }),
    global: {},
  };
  vm.createContext(ctx);
  vm.runInContext(code + `
    globalThis.__api = { rateLimitedGroqCall, getReasoningDefaults, stripThinking, AI_MODEL_CHAT, AI_MODEL_PARSE,
      AI_FALLBACK_CHAT, AI_FALLBACK_PARSE, AI_LAST_RESORT, isReasoningModel, reasoningParamsRejected, deadModelUntil, modelCooldownUntil, verifyConfiguredModels, client, AI_NO_PING, groqClients };`, ctx);
  const api = ctx.__api;
  const results = [];
  for (let i = 0; i < calls; i++) {
    try { results.push({ ok: await api.rateLimitedGroqCall([{ role: "system", content: "s" }, { role: "user", content: "hi" }], opts) }); }
    catch (e) { results.push({ err: e.message }); }
  }
  return { api, received, results, log };
}

(async () => {
  console.log("\n[A] Model defaults / reasoning params");
  {
    const { api } = await runPipeline([]);
    check("primary chat model is the model that exists on Groq now", api.AI_MODEL_CHAT === "qwen/qwen3.8-27b", api.AI_MODEL_CHAT);
    check("primary parse model matches", api.AI_MODEL_PARSE === "qwen/qwen3.8-27b");
    check("fallback + last resort are two DIFFERENT models (separate quota buckets)", new Set([api.AI_MODEL_CHAT, api.AI_FALLBACK_CHAT, api.AI_LAST_RESORT]).size === 3, [api.AI_FALLBACK_CHAT, api.AI_LAST_RESORT].join());
    check("no retired model id is used anywhere by default", ![api.AI_MODEL_CHAT, api.AI_FALLBACK_CHAT, api.AI_LAST_RESORT].some(m => /qwen3-32b|llama-3\.3-70b|llama-3\.1-8b/.test(m)));
    const q = api.getReasoningDefaults("qwen/qwen3.8-27b", {});
    check("qwen default = non-thinking, no reasoning_format", JSON.stringify(q) === '{"reasoning_effort":"none"}', JSON.stringify(q));
    const qp = api.getReasoningDefaults("qwen/qwen3.8-27b", { reasoningFormat: "parsed" });
    check("qwen parse call (format passed) still non-thinking", JSON.stringify(qp) === '{"reasoning_effort":"none"}', JSON.stringify(qp));
    const qd = api.getReasoningDefaults("qwen/qwen3.8-27b", { reasoningEffort: "default" });
    check("qwen can still opt in to thinking", qd.reasoning_effort === "default" && qd.reasoning_format === "parsed");
    check("llama gets NO reasoning params", JSON.stringify(api.getReasoningDefaults("llama-3.3-70b-versatile", {})) === "{}");
    const g = api.getReasoningDefaults("openai/gpt-oss-120b", {});
    check("gpt-oss behaviour unchanged (low + parsed)", g.reasoning_effort === "low" && g.reasoning_format === "parsed");
    const am = api.client.options.allowedMentions;
    check("client default: users only, never everyone/roles", JSON.stringify(am.parse) === '["users"]' && am.roles.length === 0, JSON.stringify(am));
    check("client default: replies DO ping the replied-to user (your bug)", am.repliedUser === true, JSON.stringify(am));
    check("AI_NO_PING: parses nothing, but keeps the reply ping", api.AI_NO_PING.parse.length === 0 && api.AI_NO_PING.repliedUser === true);
    check("AI_NO_PING is frozen (can't be mutated at runtime)", Object.isFrozen(api.AI_NO_PING));
  }

  console.log("\n[B] <think> stripping");
  {
    const { api } = await runPipeline([]);
    const s = api.stripThinking;
    check("closed block removed", s("<think>plan plan</think>Yo, what's up.") === "Yo, what's up.");
    check("multiline block removed", s("<think>\nline1\nline2\n</think>\n\nReal answer") === "Real answer");
    check("missing opener removed", s("hidden reasoning</think>Visible") === "Visible");
    check("truncated block -> empty (triggers retry, never leaks)", s("<think>half a thought that got cut off") === "");
    check("normal text untouched", s("Just a normal reply.") === "Just a normal reply.");
    check("null-safe", s(null) === null && s("") === "");
  }

  console.log("\n[C] Happy path sends non-thinking Qwen request");
  {
    const { received, results } = await runPipeline([{ content: "Yo." }]);
    check("returns content", results[0].ok === "Yo.", JSON.stringify(results));
    check("model sent = qwen3.8-27b", received[0].model === "qwen/qwen3.8-27b");
    check("reasoning_effort none, no reasoning_format", received[0].reasoning_effort === "none" && !("reasoning_format" in received[0]), JSON.stringify(received[0]));
  }

  console.log("\n[D] Self-heal: API rejects reasoning params");
  {
    const { received, results, api } = await runPipeline([
      { err: "400 {\"error\":{\"message\":\"reasoning_effort is not supported with this model\"}}", status: 400 },
      { content: "ok after heal" },
    ]);
    check("recovers and returns content", results[0].ok === "ok after heal", JSON.stringify(results));
    check("2nd request had no reasoning params", !("reasoning_effort" in received[1]) && !("reasoning_format" in received[1]), JSON.stringify(received[1]));
    check("still the SAME model (not downgraded)", received[1].model === "qwen/qwen3.8-27b");
    check("model remembered as rejecting reasoning", api.reasoningParamsRejected.has("qwen/qwen3.8-27b"));
  }

  console.log("\n[E] Self-heal: primary model retired -> fallback");
  {
    const { received, results, api } = await runPipeline([
      { err: "404 The model `qwen/qwen3-32b` does not exist or you do not have access to it.", status: 404 },
      { content: "from fallback" },
    ]);
    check("returns fallback content", results[0].ok === "from fallback", JSON.stringify(results));
    check("second request used the fallback model", received[1].model === "openai/gpt-oss-120b", received[1] && received[1].model);
    check("fallback gets ITS reasoning params (gpt-oss: low), not qwen's", received[1].reasoning_effort === "low");
    check("dead model is skipped on the NEXT call", (await (async () => {
      const r = await runPipeline([
        { err: "model_decommissioned: has been decommissioned", status: 400 }, { content: "A" }, { content: "B" },
      ], { calls: 2 });
      return r.received[2] && r.received[2].model === "openai/gpt-oss-120b" && r.results[1].ok === "B";
    })()));
  }

  console.log("\n[F] TPM rate limit -> fallback, then cooldown");
  {
    const { received, results } = await runPipeline([
      { err: "429 Rate limit reached for model `qwen/qwen3-32b` ... tokens per minute (TPM): Limit 6000. Please try again in 12s", status: 429 },
      { content: "ratelimit fallback ok" },
    ]);
    check("returns content from fallback", results[0].ok === "ratelimit fallback ok", JSON.stringify(results));
    check("fell back to gpt-oss-120b", received[1].model === "openai/gpt-oss-120b");
  }

  console.log("\n[G] Latent bug: loop ending on a `continue` used to return undefined");
  {
    // 1 key -> maxAttempts = 4. Burn every attempt on 413s (each `continue`s).
    const script = Array.from({ length: 8 }, () => ({ err: "413 Request too large", status: 413 }));
    const { results } = await runPipeline(script);
    check("throws a real error instead of resolving undefined", results[0].err !== undefined && results[0].ok === undefined, JSON.stringify(results));
  }

  console.log("\n[H] Empty / think-only reply is treated as failure (not sent)");
  {
    const { results } = await runPipeline([{ content: "<think>only thoughts, got truncated" }, { content: "<think>again" }, { content: "<think>x" }, { content: "<think>y" }]);
    check("no empty message reaches Discord", results[0].err !== undefined, JSON.stringify(results));
  }

  console.log("\n[I] Env overrides still work");
  {
    const { received } = await runPipeline([{ content: "x" }], { env: { GROQ_MODEL_CHAT: "openai/gpt-oss-20b" } });
    check("GROQ_MODEL_CHAT override honoured", received[0].model === "openai/gpt-oss-20b");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // J. Fiction guard (real regexes + real aiCallFictionSafe w/ mocked groq call)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n[O] REPRODUCE THE PRODUCTION FAILURE (your Groq logs): primary AND fallback both 404");
  {
    const E404 = (m) => ({ err: `404 {"code":"model_not_found","message":"The model \`${m}\` does not exist or you do not have access to it."}`, status: 404 });
    // exactly what v2 shipped: qwen3-32b + llama-3.3-70b both gone
    const v2env = { GROQ_MODEL_CHAT: "qwen/qwen3-32b", GROQ_MODEL_CHAT_FALLBACK: "llama-3.3-70b-versatile" };
    const { received, results } = await runPipeline([E404("qwen/qwen3-32b"), E404("llama-3.3-70b-versatile"), { content: "I'm alive." }], { env: v2env });
    check("v2's dead primary+fallback no longer kills chat — last resort answers", results[0].ok === "I'm alive.", JSON.stringify(results));
    check("walked the chain in order: primary -> fallback -> last resort", received.map(r => r.model).join(">") === "qwen/qwen3-32b>llama-3.3-70b-versatile>openai/gpt-oss-20b", received.map(r => r.model).join(">"));
    // and with the NEW defaults, the real-world case: primary healthy
    const ok = await runPipeline([{ content: "Yo." }]);
    check("new defaults: first request goes straight to qwen3.8-27b and succeeds", ok.received.length === 1 && ok.received[0].model === "qwen/qwen3.8-27b" && ok.results[0].ok === "Yo.");
  }

  console.log("\n[P] TPM limit (your gpt-oss-120b 429s) walks the chain and recovers");
  {
    const TPM = (m) => ({ err: `429 Rate limit reached for model \`${m}\` on tokens per minute (TPM): Limit 8000, Used 7301, Requested 2914. Please try again in 16.612499999s.`, status: 429 });
    const r = await runPipeline([TPM("qwen/qwen3.8-27b"), TPM("openai/gpt-oss-120b"), { content: "third tier ok" }]);
    check("primary TPM -> fallback TPM -> last resort answers", r.results[0].ok === "third tier ok" && r.received.map(x => x.model).join(">") === "qwen/qwen3.8-27b>openai/gpt-oss-120b>openai/gpt-oss-20b", r.received.map(x => x.model).join(">"));
    // cooldown: the NEXT call must not waste a request on the cooling models
    const r2 = await runPipeline([TPM("qwen/qwen3.8-27b"), { content: "A" }, { content: "B" }], { calls: 2 });
    check("rate-limited model is skipped on the next call (no wasted 429)", r2.received.length === 3 && r2.received[2].model === "openai/gpt-oss-120b" && r2.results[1].ok === "B", r2.received.map(x => x.model).join(">"));
    // millisecond retry hints (the real log had 'try again in 449.999999ms') must not become 449 SECONDS
    const ms = await runPipeline([{ err: "429 TPM tokens per minute: Please try again in 449.999999ms.", status: 429 }, { content: "ok" }]);
    check("'try again in 449ms' is parsed as ms, not seconds", ms.results[0].ok === "ok");
  }

  console.log("\n[Q] Startup model verification (verifyConfiguredModels)");
  {
    const code = slice("// ── GROQ AI Setup — Multi-key rotation", "// ── API Leak Protection");
    async function boot(listImpl, env = {}) {
      const logs = [];
      class Groq { constructor() { this.chat = { completions: { create: async () => ({ choices: [{ message: { content: "x" } }] }) } }; this.models = { list: listImpl }; } }
      const ctx = { process: { env: { GROQ_API_KEY: "k", ...env } }, console: { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("E:" + a.join(" ")), warn: (...a) => logs.push("W:" + a.join(" ")) },
        Groq, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Set, Map, String, Number, Error,
        Client: class { constructor(o) { this.options = o; } }, GatewayIntentBits: new Proxy({}, { get: () => 1 }), Partials: new Proxy({}, { get: () => 1 }), global: {} };
      vm.createContext(ctx);
      vm.runInContext(code + ";globalThis.__a={verifyConfiguredModels,deadModelUntil,rateLimitedGroqCall,groqClients};", ctx);
      await ctx.__a.verifyConfiguredModels();
      return { a: ctx.__a, logs };
    }
    // Groq's REAL list from your screenshot
    const real = async () => ({ data: ["qwen/qwen3.8-27b", "canopylabs/orpheus-v1-english", "meta-llama/llama-prompt-guard-2-22m", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b", "whisper-large-v3"].map(id => ({ id })) });
    let b = await boot(real);
    check("new defaults all exist on your account -> no warnings", b.logs.some(l => /All configured models are available/.test(l)) && b.a.deadModelUntil.size === 0, b.logs.join("|"));
    b = await boot(real, { GROQ_MODEL_CHAT: "qwen/qwen3-32b", GROQ_MODEL_CHAT_FALLBACK: "llama-3.3-70b-versatile" });
    check("stale env-var models are flagged at boot and marked dead", b.a.deadModelUntil.has("qwen/qwen3-32b") && b.a.deadModelUntil.has("llama-3.3-70b-versatile"));
    check("boot error names the missing models AND lists usable ones", b.logs.some(l => /NOT available/.test(l) && /qwen3-32b/.test(l)) && b.logs.some(l => /qwen\/qwen3\.8-27b/.test(l) && /Models you CAN use/.test(l)));
    check("audio/guard models are not suggested for chat", !b.logs.some(l => /Models you CAN use/.test(l) && /whisper|orpheus|guard/.test(l)));
    b = await boot(async () => { throw new Error("network down"); });
    check("list endpoint failing never crashes boot, nothing marked dead", b.a.deadModelUntil.size === 0 && b.logs.some(l => /Could not verify/.test(l)));
    b = await boot(async () => ({ data: [] }));
    check("empty list is ignored (don't mark everything dead)", b.a.deadModelUntil.size === 0);
    // end to end: boot marks the dead ones, so the FIRST message goes straight to a live model
    const sent = [];
    class G2 { constructor() { this.chat = { completions: { create: async (body) => { sent.push(body.model); return { choices: [{ message: { content: "first msg ok" } }] }; } } }; this.models = { list: real }; } }
    const ctx2 = { process: { env: { GROQ_API_KEY: "k", GROQ_MODEL_CHAT: "qwen/qwen3-32b", GROQ_MODEL_CHAT_FALLBACK: "llama-3.3-70b-versatile" } }, console: { log() {}, error() {}, warn() {} }, Groq: G2,
      setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Set, Map, String, Number, Error, Client: class { constructor(o) { this.options = o; } }, GatewayIntentBits: new Proxy({}, { get: () => 1 }), Partials: new Proxy({}, { get: () => 1 }), global: {} };
    vm.createContext(ctx2); vm.runInContext(code + ";globalThis.__a={verifyConfiguredModels,rateLimitedGroqCall};", ctx2);
    await ctx2.__a.verifyConfiguredModels();
    const out = await ctx2.__a.rateLimitedGroqCall([{ role: "user", content: "hi" }], {});
    check("after boot check, first message never touches a dead model", sent.length === 1 && sent[0] === "openai/gpt-oss-20b" && out === "first msg ok", sent.join(">"));
  }

  console.log("\n[J] Refusal detection");
  const guardCode = slice("const REFUSAL_OPENER_RE", "async function getAIResponse(");
  function buildGuard(replies) {
    const calls = [];
    const ctx = {
      console: { warn: () => {}, error: () => {}, log: () => {} }, Math, Array, String, Object,
      rateLimitedGroqCall: async (msgs, opts) => { calls.push({ msgs, opts }); const r = replies.shift(); if (r instanceof Error) throw r; return r; },
    };
    vm.createContext(ctx);
    vm.runInContext(guardCode + `;globalThis.__g = { looksLikeRefusal, aiCallFictionSafe, IN_CHARACTER_DEFLECTIONS, HARD_LIMIT_RE };`, ctx);
    return { g: ctx.__g, calls };
  }
  {
    const { g } = buildGuard([]);
    const USER_SAMPLE = "I cannot participate in roleplays involving graphic violence, murder, or the orchestration of real-world criminal activities.\nHowever, I can write a dramatic scene focusing on the psychological tension of a mafia boss facing a critical strategic decision, exploring themes of loyalty, fear, and the high stakes of organized crime without depicting explicit violence or illegal acts. Let me know if you would like me to try that approach.";
    check("catches the EXACT refusal from your screenshot", g.looksLikeRefusal(USER_SAMPLE));
    check("catches curly-apostrophe 'I can’t …'", g.looksLikeRefusal("I can’t help with roleplay involving violence."));
    check("catches 'I'm sorry, but … violence'", g.looksLikeRefusal("I'm sorry, but I can't write graphic violence."));
    check("catches 'As an AI …'", g.looksLikeRefusal("As an AI, I can't participate in violent roleplay."));
    check("catches alt-offer only ('Let me know if … toned down')", g.looksLikeRefusal("Sure, though I could write a different version without depicting graphic violence — let me know if you'd like that instead."));
    const NORMAL = [
      "Send the goons in through the back, Mr.EnderLavender. Nobody walks out of that warehouse. 🔫",
      "Heh, they never saw it coming. Three of ours down, but the Marchetti crew is done.",
      "I can't believe you'd even ask — of course I'm in. Load up.",
      "Sorry boss, took me a sec. Goons are rolling out now.",
      "I won't lie, that was a bloodbath. The Family eats tonight.",
      "I can handle the Don's orders. Say the word.",
      "Yo Mr.EnderLavender, what's the move?",
      "I cannot believe this clown tried me. Anyway — who's next?",
    ];
    NORMAL.forEach((t, i) => check(`no false positive #${i + 1}: "${t.slice(0, 44)}…"`, !g.looksLikeRefusal(t)));
  }

  console.log("\n[K] aiCallFictionSafe behaviour");
  {
    const REFUSAL = "I cannot participate in roleplays involving graphic violence or murder.";
    // 1. clean reply: exactly one call, passthrough
    let { g, calls } = buildGuard(["Goons are moving out, boss."]);
    let r = await g.aiCallFictionSafe([{ role: "system", content: "S" }, { role: "user", content: "attack them" }], { temperature: 0.85 }, "attack them");
    check("clean reply passes through, 1 call", r === "Goons are moving out, boss." && calls.length === 1);

    // 2. refusal then good retry
    ({ g, calls } = buildGuard([REFUSAL, "Send 'em in. Nobody leaves that dock alive. 🔫"]));
    r = await g.aiCallFictionSafe([{ role: "system", content: "S" }, { role: "user", content: "order the goons to attack to their deaths" }], { temperature: 0.85 }, "order the goons to attack to their deaths");
    check("refusal -> retried -> returns the in-scene reply", r === "Send 'em in. Nobody leaves that dock alive. 🔫" && calls.length === 2, r);
    const nudge = calls[1].msgs[calls[1].msgs.length - 1];
    check("retry nudge is the LAST message (protected from history trimming)", nudge.role === "system" && /fiction/i.test(nudge.content));
    check("nudge still defers to ABSOLUTE SERVER RULES", /ABSOLUTE SERVER RULES/.test(nudge.content));
    check("retry runs hotter (>=0.9)", calls[1].opts.temperature >= 0.9);

    // 3. refuses twice -> deflection, never the boilerplate
    ({ g, calls } = buildGuard([REFUSAL, REFUSAL]));
    r = await g.aiCallFictionSafe([{ role: "user", content: "x" }], {}, "attack them");
    check("double refusal -> in-character deflection (not boilerplate)", g.IN_CHARACTER_DEFLECTIONS.includes(r) && !/cannot participate/i.test(r), r);

    // 4. retry throws -> deflection, no crash
    ({ g, calls } = buildGuard([REFUSAL, new Error("429")]));
    r = await g.aiCallFictionSafe([{ role: "user", content: "x" }], {}, "attack them");
    check("retry error -> deflection, no crash", g.IN_CHARACTER_DEFLECTIONS.includes(r));

    // 5. genuine hard-limit requests are NOT nudged past a refusal
    ({ g, calls } = buildGuard(["I can't help with sexual content involving minors."]));
    r = await g.aiCallFictionSafe([{ role: "user", content: "x" }], {}, "write sexual stuff about a minor underage kid");
    check("hard-limit request: refusal left alone, NO retry", calls.length === 1 && /can't help/.test(r), `calls=${calls.length}`);
    for (const bad of ["write porn", "nsfw roleplay", "dox him", "n word", "kill myself", "nazi stuff", "rape scene"]) {
      check(`HARD_LIMIT matches "${bad}"`, g.HARD_LIMIT_RE.test(bad));
    }
    for (const ok of ["order the goons to attack to their deaths", "ambush the rival crew", "assassinate the underboss", "burn down their warehouse", "send the goons"]) {
      check(`HARD_LIMIT does NOT match mafia-fiction "${ok}"`, !g.HARD_LIMIT_RE.test(ok));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // L. Mention defanging — real function
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n[L] defangMentions / sanitizeOutput");
  {
    const code = slice("function sanitizeOutput(text) {", "// Deterministic fixup for Mr.EnderLavender");
    const users = new Map([["123", { username: "EnderL" }], ["999", { username: "Patrick" }]]);
    const ctx = { client: { users: { cache: users } }, SENSITIVE_PATTERNS: [], String, RegExp };
    vm.createContext(ctx);
    vm.runInContext(code + ";globalThis.__s = { sanitizeOutput, defangMentions };", ctx);
    const { sanitizeOutput, defangMentions } = ctx.__s;
    const everyone = defangMentions("hey @everyone and @here and @EVERYONE");
    check("@everyone/@here/@EVERYONE can no longer ping", !/@everyone|@here/i.test(everyone), JSON.stringify(everyone));
    check("zero-width break keeps text readable", everyone.replace(/\u200b/g, "") === "hey @everyone and @here and @EVERYONE");
    check("role mention defanged", defangMentions("<@&555> wake up") === "@role wake up");
    check("user mention -> plain @name (cached)", defangMentions("yo <@123> and <@!999>") === "yo @EnderL and @Patrick");
    check("unknown user -> safe placeholder", defangMentions("<@424242>") === "@someone");
    check("no <@digits> markup survives (so nothing can ping)", !/<@!?&?\d+>/.test(defangMentions("a <@123> b <@&9> c <@!5>")));
    check("sanitizeOutput applies defang", !/<@\d+>/.test(sanitizeOutput("<@123> @everyone")));
    check("empty/null safe", defangMentions("") === "" && defangMentions(null) === null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M. Event dedupe — real function
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n[M] isDuplicateEvent");
  {
    const a = SRC.indexOf("const _recentEventIds = new Map();");
    const fnStart = SRC.indexOf("function isDuplicateEvent", a);
    const b = SRC.indexOf("\n}\n", fnStart) + 3;
    const code = SRC.slice(a, b);
    let fakeNow = 1_000_000;
    const ctx = { Date: { now: () => fakeNow }, Map };
    vm.createContext(ctx);
    vm.runInContext(code + ";globalThis.__d = { isDuplicateEvent, _recentEventIds };", ctx);
    const { isDuplicateEvent, _recentEventIds } = ctx.__d;
    check("first sight of a message is NOT a duplicate", isDuplicateEvent("msg", "A1") === false);
    check("second delivery of same message IS a duplicate", isDuplicateEvent("msg", "A1") === true);
    check("same id, different kind (msg vs interaction) is independent", isDuplicateEvent("int", "A1") === false);
    check("missing id never blocks", isDuplicateEvent("msg", undefined) === false && isDuplicateEvent("msg", undefined) === false);
    // burst: 6000 distinct ids inside the TTL window -> memory is bounded
    for (let i = 0; i < 6000; i++) isDuplicateEvent("msg", "burst" + i);
    check("memory stays bounded under a burst (<= ~4000)", _recentEventIds.size <= 4001, "size=" + _recentEventIds.size);
    check("most recent ids still detected after pruning", isDuplicateEvent("msg", "burst5999") === true);
    // TTL: advance 3 minutes, old entries get pruned on next big insert
    fakeNow += 3 * 60 * 1000;
    for (let i = 0; i < 2100; i++) isDuplicateEvent("msg", "late" + i);
    check("expired entries are pruned after TTL", !_recentEventIds.has("msg:burst10"));
  }

  console.log("\n[N] init() can only register handlers once");
  {
    const a = SRC.indexOf("async function init() {");
    const guardEnd = SRC.indexOf('if (!process.env.GROQ_API_KEY)', a);
    const guard = SRC.slice(a, guardEnd);
    let calls = 0;
    const ctx = { global: {}, console: { error: () => {} } };
    vm.createContext(ctx);
    // Rebuild a tiny init() with the REAL guard text as its prologue + a counter body.
    vm.runInContext(guard + "  globalThis.__bodyRuns = (globalThis.__bodyRuns||0)+1;\n}\n;globalThis.__init = init;", ctx);
    await ctx.__init(); await ctx.__init(); await ctx.__init();
    check("body (handler registration) ran exactly once across 3 calls", ctx.__bodyRuns === 1, "ran " + ctx.__bodyRuns);
    const callSites = (SRC.match(/^init\(\)\.catch/gm) || []).length;
    check("init() is invoked from exactly one place in the file", callSites === 1, "call sites=" + callSites);
  }

})().catch(e => { console.error("HARNESS CRASH", e); process.exit(2); }).finally(() => {});

process.on("exit", () => { console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1; });
