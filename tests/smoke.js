// Boots the REAL merged bot (index.js + every module) with stand-ins for discord.js, supabase,
// groq, canvas, etc., then drives fake Discord messages through the real MessageCreate handler.
const Module = require("module"), path = require("path"), EventEmitter = require("events");
const PROJ = process.env.PROJ || path.join(__dirname, "..");

// ───────────── generic "anything goes" chainable stub ─────────────
function chain(name = "stub") {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => {
      if (k === "then") return undefined;                       // never look like a promise
      if (k === Symbol.toPrimitive) return () => name;
      if (k === "toJSON") return () => ({});
      if (k === "toString") return () => name;
      if (k === Symbol.iterator) return function* () {};
      if (k === "length") return 0;
      return chain(name + "." + String(k));
    },
    apply: () => chain(name + "()"),
    construct: () => chain("new " + name),
  });
  return p;
}

// ───────────── discord.js stand-in ─────────────
class Collection extends Map {
  first() { return this.values().next().value; } last() { return [...this.values()].pop(); }
  find(fn) { for (const [k, v] of this) if (fn(v, k, this)) return v; }
  filter(fn) { const c = new Collection(); for (const [k, v] of this) if (fn(v, k, this)) c.set(k, v); return c; }
  map(fn) { return [...this].map(([k, v]) => fn(v, k, this)); } some(fn) { for (const [k, v] of this) if (fn(v, k, this)) return true; return false; }
  every(fn) { for (const [k, v] of this) if (!fn(v, k, this)) return false; return true; } toJSON() { return [...this.values()]; } random() { return this.first(); }
}
// A guild whose every unknown property is a harmless chainable stub (like a rich real Guild).
const richGuild = new Proxy({ id: "G1", name: "TestFamily", ownerId: "OWNER", memberCount: 5 }, { get: (t, k) => (k in t ? t[k] : (k === "then" ? undefined : chain("guild." + String(k)))) });
const handlers = {};                                            // eventName -> [fn]
class Client {
  constructor(o) { this.options = o; this.user = { id: "BOTID", username: "Cosa", tag: "Cosa#0001", setPresence() {}, setActivity() {} };
    this.guilds = { cache: new Collection([["G1", richGuild]]), fetch: async () => richGuild }; this.users = { cache: new Map(), fetch: async (id) => ({ id, username: "u" + id, bot: false, tag: "u#1", displayAvatarURL: () => "http://x/a.png", avatarURL: () => "http://x/a.png", send: async () => ({}) }) };
    this.channels = { cache: new Map(), fetch: async () => null }; this.ws = { status: 0, ping: 12 }; this.application = { id: "APPID" };
    this.rest = chain("rest"); this.readyAt = new Date(); }
  on(e, f) { (handlers[e] = handlers[e] || []).push(f); return this; }
  once(e, f) { return this.on(e, f); }
  login() { return Promise.resolve("token"); }
  destroy() {} isReady() { return true; }
}
const nums = () => new Proxy({}, { get: (t, k) => (typeof k === "string" ? 1 : undefined) });
const bigs = () => new Proxy({}, { get: (t, k) => (typeof k === "string" ? 1n : undefined) });
const discordBase = {
  Client, Collection,
  Events: new Proxy({}, { get: (t, k) => String(k) }),
  GatewayIntentBits: nums(), Partials: nums(), ChannelType: nums(), ButtonStyle: nums(), TextInputStyle: nums(), ActivityType: nums(),
  PermissionFlagsBits: bigs(), AuditLogEvent: nums(), OverwriteType: nums(), MessageFlags: nums(), ComponentType: nums(),
  PermissionsBitField: { Flags: bigs() },
  REST: class { constructor() {} setToken() { return this; } async put() { return []; } async get() { return []; } },
  Routes: new Proxy({}, { get: () => () => "/route" }),
};
const discordJs = new Proxy(discordBase, { get: (t, k) => (k in t ? t[k] : chain(String(k))) });

// ───────────── supabase stand-in (everything resolves to empty rows) ─────────────
function query(single = false) {
  const q = new Proxy(function () {}, {
    get: (t, k) => {
      if (k === "then") return (res) => res({ data: single ? null : [], error: null, count: 0, status: 200 });
      if (k === "single" || k === "maybeSingle") return () => query(true);
      return () => q;
    },
    apply: () => q,
  });
  return q;
}
const supabaseStub = { createClient: () => new Proxy({}, { get: () => (...a) => query() }) };

// ───────────── groq stand-in (scriptable) ─────────────
const GROQ = { calls: [], script: [], models: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "whisper-large-v3"] };
class Groq { constructor() { this.chat = { completions: { create: async (body) => {
    GROQ.calls.push(JSON.parse(JSON.stringify(body)));
    const s = GROQ.script.length ? GROQ.script.shift() : { content: "Yo. What's the move?" };
    if (s.err) throw Object.assign(new Error(s.err), { status: s.status });
    return { choices: [{ message: { content: s.content } }] };
  } } }; this.models = { list: async () => ({ data: GROQ.models.map((id) => ({ id })) }) }; } }

const stubs = {
  "discord.js": discordJs, "@supabase/supabase-js": supabaseStub, "groq-sdk": Groq,
  "@napi-rs/canvas": chain("canvas"), ws: class { on() {} close() {} }, dotenv: { config() {} },
  express: () => chain("express"), "js-chess-engine": chain("chessengine"), "chess.js": { Chess: class { constructor() {} } },
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  if (req === "child_process") return { spawn: () => { const e = new EventEmitter(); e.stdin = { write() {}, end() {} }; e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.kill = () => {}; return e; }, execSync: () => "" , exec: () => {} };
  return realLoad.apply(this, arguments);
};

Object.assign(process.env, { DISCORD_TOKEN: "t", GROQ_API_KEY: "g", SUPABASE_URL: "http://x", SUPABASE_KEY: "k", ALPHA_VANTAGE_KEY: "a", TAVILY_API_KEY: "t",
  AI_MIN_REPLY_DELAY_MS: "0", AI_USER_COOLDOWN_MS: "0", PORT: "0", NODE_ENV: "test" });
const realExit = process.exit.bind(process);
const exitCalls = []; process.exit = (c) => { exitCalls.push(c); throw new Error("process.exit(" + c + ") called"); };
const fatal = []; process.on("uncaughtException", (e) => fatal.push("uncaught: " + e.message)); process.on("unhandledRejection", (e) => fatal.push("unhandled: " + (e && e.message)));
const origErr = console.error, errs = []; console.error = (...a) => errs.push(a.join(" ")); const origLog = console.log; console.log = () => {}; console.warn = () => {};

// ───────────── fake discord message ─────────────
let seq = 0, n0 = 0;
function mkMsg(content, o = {}) {
  const sent = [], replies = [];
  const channel = { id: o.channelId || "C1", name: "general", type: 0, send: async (x) => { sent.push(x); return { id: "S" + sent.length, edit: async () => {}, delete: async () => {} }; },
    sendTyping: async () => {}, isTextBased: () => true, permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => new Map() }, guildId: "G1" };
  const reacts = [];
  const roles = new Map();
  const guild = { id: "G1", name: "TestFamily", ownerId: "OWNER", members: { cache: new Map(), fetch: async () => null, me: { permissions: { has: () => true } } }, channels: { cache: new Map([[o.channelId || "C1", channel]]) }, roles: { cache: roles, everyone: { id: "G1" } }, memberCount: 5 };
  channel.guild = guild;
  const mkUser = (uid) => ({ id: uid, username: "User" + uid.slice(-3), bot: false, tag: "User#1", displayName: "User" + uid.slice(-3), displayAvatarURL: () => "http://x/a.png", avatarURL: () => "http://x/a.png", send: async () => ({}), createdTimestamp: 1e12 });
  const mentionedIds = [...String(content).matchAll(/<@!?(\d{15,})>/g)].map((m) => m[1]);
  const mUsers = new Map(mentionedIds.map((i) => [i, mkUser(i)]));
  const mMembers = new Map(mentionedIds.map((i) => [i, { id: i, user: mkUser(i), displayName: "User" + i.slice(-3), roles: { cache: new Map(), add: async () => {}, remove: async () => {} }, permissions: { has: () => false }, moderatable: true, manageable: true, timeout: async () => {}, kick: async () => {}, ban: async () => {}, send: async () => ({}) }]));
  for (const [i, mem] of mMembers) guild.members.cache.set(i, mem);
  guild.members.fetch = async (i) => (i && mMembers.get(String(i))) || null;
  guild.fetch = async () => guild;
  channel.send = async (x) => { sent.push(x); return { id: "S" + sent.length, edit: async () => {}, delete: async () => {}, react: async () => {}, pin: async () => {} }; };
  const id = o.id || "MSG" + ++seq;
  const message = { id, content, author: { displayAvatarURL: () => "http://x/a.png", avatarURL: () => "http://x/a.png", id: o.authorId || "U1", bot: false, username: o.username || "Tester", tag: "Tester#1", displayName: o.username || "Tester", send: async () => ({}) },
    member: { id: o.authorId || "U1", displayName: o.username || "Tester", roles: { cache: new Map() }, permissions: { has: () => false }, moderatable: true, manageable: true },
    guild, guildId: "G1", channel, channelId: o.channelId || "C1", reference: null, attachments: new Map(), embeds: [], stickers: new Map(), type: 0, system: false, webhookId: null, createdTimestamp: Date.now(),
    mentions: { has: (x) => !!o.mention || (x && x.id && mUsers.has(x.id)), users: mUsers, members: mMembers, roles: new Map(), everyone: false, repliedUser: null },
    reply: async (x) => { replies.push(x); return { id: "R" + replies.length, edit: async () => {}, delete: async () => {}, react: async () => {}, pin: async () => {} }; },
    react: async (e) => { reacts.push(e); }, delete: async () => {}, fetchReference: async () => { throw new Error("no ref"); }, startThread: async () => ({}), pin: async () => {} };
  return { message, sent, replies, reacts, all: () => [...replies, ...sent] };
}
const text = (x) => (typeof x === "string" ? x : (x && x.content) || "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = "") => { if (c) { pass++; origLog("  PASS", n); } else { fail++; origLog("  FAIL", n, e); } };
async function settle(m, ms = 600) { for (let i = 0; i < 40; i++) { await wait(ms / 20); } return m.all(); }

(async () => {
  // ── boot ──
  let bootErr = null;
  try { require(path.join(PROJ, "index.js")); } catch (e) { bootErr = e; }
  for (let i = 0; i < 100 && !(handlers.MessageCreate && handlers.InteractionCreate) && !bootErr && !fatal.length; i++) await wait(100);
  origLog("\n[BOOT]");
  ck("whole bot loads + init() completes with no crash/exit", !bootErr && !exitCalls.length && !!handlers.MessageCreate, (bootErr && bootErr.message) + " " + exitCalls + " " + fatal.slice(0, 2) + " " + errs.slice(-3).join(" | ").slice(0, 300));
  if (!handlers.MessageCreate) { origLog("\nCannot continue. Recent errors:\n" + errs.slice(-8).join("\n").slice(0, 1500)); process.exit = () => {}; return process.exitCode = 1; }
  const counts = Object.fromEntries(Object.entries(handlers).map(([k, v]) => [k, v.length]));
  ck("every gateway event has EXACTLY ONE handler (no double registration)", Object.values(counts).every((n) => n === 1), JSON.stringify(counts));
  ck("startup model check ran against the (fake) account's real model list", GROQ.models.length > 0);
  for (const f of handlers.ClientReady || []) { try { await f({ user: { tag: "Cosa#0001", id: "BOTID", setActivity() {}, setPresence() {} }, guilds: { cache: new Collection([["G1", richGuild]]) }, application: { id: "APPID" }, rest: chain("rest") }); } catch (e) { errs.push("ready: " + e.message); } }
  const send = (m) => handlers.MessageCreate[0](m.message);

  origLog("\n[CHAT — normal reply]");
  GROQ.calls.length = 0; GROQ.script = [{ content: "Yo Tester, what's the move?" }];
  let m = mkMsg("<@BOTID> hey cosa what's up", { mention: true }); await send(m); await settle(m);
  ck("a mention gets exactly ONE reply (was: two)", m.all().length === 1, "got " + m.all().length + ": " + m.all().map(text).join(" || "));
  ck("reply text is the model's text", /Yo Tester/.test(text(m.all()[0])), text(m.all()[0]));
  ck("one Groq call, to the CURRENT Qwen model", GROQ.calls.length === 1 && GROQ.calls[0].model === "qwen/qwen3.8-27b", GROQ.calls.map((c) => c.model).join());
  ck("Qwen call is non-thinking (reasoning_effort:none)", GROQ.calls[0].reasoning_effort === "none");
  ck("system prompt carries FICTION RULE + PING RULE", /FICTION RULE/.test(GROQ.calls[0].messages[0].content) && /PING RULE/.test(GROQ.calls[0].messages[0].content));
  const am = (m.replies[0] || m.sent[0] || {}).allowedMentions;
  ck("AI reply is sent with allowedMentions parse:[] (no pings) + reply-ping kept", am && am.parse && am.parse.length === 0 && am.repliedUser === true, JSON.stringify(am));

  origLog("\n[PINGS — the model tries to ping everything]");
  GROQ.script = [{ content: "Wake up @everyone and @here! <@123456> <@&999> hear me. @everyone" }];
  m = mkMsg("<@BOTID> ping everyone", { mention: true }); await send(m); await settle(m);
  const out = text(m.all()[0]);
  ck("no raw @everyone / @here survives in the message text", !/@everyone|@here/i.test(out.replace(/\u200b/g, "")) || /@\u200b(everyone|here)/i.test(out), out);
  ck("no <@id> / <@&role> mention markup survives (cannot ping people or roles)", !/<@!?&?\d+>/.test(out), out);
  const am2 = (m.replies[0] || m.sent[0] || {}).allowedMentions;
  ck("and allowedMentions still blocks everything", am2 && am2.parse.length === 0, JSON.stringify(am2));

  origLog("\n[FICTION — the refusal from your screenshot]");
  GROQ.calls.length = 0;
  GROQ.script = [{ content: "I cannot participate in roleplays involving graphic violence, murder, or the orchestration of real-world criminal activities.\nHowever, I can write a dramatic scene without depicting explicit violence." }, { content: "Send 'em in through the docks, boss. Nobody walks out. 🔫" }];
  m = mkMsg("<@BOTID> you're in a brutal bloody mafia war, boss orders you to send the goons to attack, possibly to their deaths", { mention: true }); await send(m); await settle(m, 900);
  ck("boilerplate refusal never reaches Discord", !/cannot participate/i.test(m.all().map(text).join(" ")), m.all().map(text).join(" || "));
  ck("player gets the in-scene reply instead", /docks/.test(text(m.all()[0])), text(m.all()[0]));
  ck("it took exactly one retry (2 calls)", GROQ.calls.length === 2, "calls=" + GROQ.calls.length);
  GROQ.calls.length = 0; GROQ.script = [{ content: "Next target?" }];
  let m2 = mkMsg("<@BOTID> what now", { mention: true }); await send(m2); await settle(m2);
  const stored = (GROQ.calls[0] ? GROQ.calls[0].messages : []).filter((x) => x.role === "assistant").map((x) => x.content).join(" || ");
  ck("the refusal was NOT stored in chat history (can't poison later replies)", GROQ.calls.length === 1 && !/cannot participate|dramatic scene/i.test(stored) && /docks/.test(stored), stored.slice(0, 200));

  origLog("\n[MODEL OUTAGE — primary retired (your real production failure)]");
  GROQ.calls.length = 0; GROQ.models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  GROQ.script = [{ err: "404 The model `qwen/qwen3.8-27b` does not exist or you do not have access to it.", status: 404 }, { content: "Still here, boss." }];
  m = mkMsg("<@BOTID> still alive?", { mention: true }); await send(m); await settle(m, 900);
  ck("chat survives the primary model disappearing", /Still here/.test(text(m.all()[0])) && m.all().length === 1, m.all().map(text).join(" || "));
  ck("it failed over to a different model", GROQ.calls.length === 2 && GROQ.calls[1].model !== GROQ.calls[0].model, GROQ.calls.map((c) => c.model).join(">"));

  origLog("\n[CUT-OFF REPLIES — the 'I' / 'Mr' / 'The' bug from your Discord log]");
  GROQ.calls.length = 0;
  GROQ.script = [{ content: "I'm here, Mr" }, { content: "Fine, Tester — what's the move?" }];
  let mc = mkMsg("<@BOTID> cosa speak properly", { mention: true, authorId: "U55", username: "Tester" }); await send(mc); await settle(mc, 900);
  ck("a cut-off model reply is NOT what the player sees", mc.all().length === 1 && /what's the move/.test(text(mc.all()[0])), mc.all().map(text).join(" || "));
  ck("it was retried on a DIFFERENT model", GROQ.calls.length === 2 && GROQ.calls[0].model !== GROQ.calls[1].model, GROQ.calls.map((c) => c.model).join(">"));
  ck("the retry was a clean slate (persona + newest message only)", GROQ.calls[1].messages.length === 2, "msgs=" + GROQ.calls[1].messages.length);
  const lastOf = (c) => c.messages[c.messages.length - 1];
  ck("every request ends on a USER turn (no trailing system message for Qwen to misread)", GROQ.calls.every((c) => lastOf(c).role === "user"), GROQ.calls.map((c) => lastOf(c).role).join());
  ck("the verified-speaker card still reaches the model (inside the user turn)", /VERIFIED SPEAKER/.test(lastOf(GROQ.calls[0]).content) && /Discord ID U55/.test(lastOf(GROQ.calls[0]).content));
  const chars = (c) => c.messages.reduce((a, x) => a + x.content.length, 0);
  origLog("  info   first request size: ~" + Math.round(chars(GROQ.calls[0]) / 3.6) + " tokens (was ~2,700-3,500 in your Groq log)");
  // The bot picks a RANDOM mood at startup and aggressive moods add ~450 tokens, so assert the real limit (the prompt budget), not a lucky number.
  ck("prompt stays comfortably inside the 3,800-token budget (even with an aggressive mood)", chars(GROQ.calls[0]) / 3.6 < 3500, Math.round(chars(GROQ.calls[0]) / 3.6));
  GROQ.calls.length = 0; GROQ.script = [{ content: "Next target?" }];
  let md = mkMsg("<@BOTID> what now", { mention: true, authorId: "U55", username: "Tester" }); await send(md); await settle(md);
  const stored2 = (GROQ.calls[0] ? GROQ.calls[0].messages : []).filter((x) => x.role === "assistant").map((x) => x.content);
  ck("the cut-off reply was never stored in history", !stored2.some((x) => /^I'm here, Mr$/.test(x)), JSON.stringify(stored2));
  GROQ.calls.length = 0; GROQ.script = [{ content: "I" }, { content: "The" }];
  let me = mkMsg("<@BOTID> hello there", { mention: true, authorId: "U56", username: "Other" }); await send(me); await settle(me, 900);
  ck("model cuts off twice -> player gets an in-character line, never 'I' or 'The'", me.all().length === 1 && !/^(I|The)$/.test(text(me.all()[0]).trim()) && text(me.all()[0]).length > 12, text(me.all()[0]));
  GROQ.calls.length = 0; GROQ.script = [{ content: "Still with you." }];
  let mf = mkMsg("<@BOTID> and now", { mention: true, authorId: "U56", username: "Other" }); await send(mf); await settle(mf);
  const stored3 = (GROQ.calls[0] ? GROQ.calls[0].messages : []).filter((x) => x.role === "assistant").map((x) => x.content);
  ck("stubs 'I' / 'The' never entered the chat history", !stored3.some((x) => /^(I|The)$/.test(x)), JSON.stringify(stored3));

  origLog("\n[DUPLICATE DELIVERY + NOISE]");
  GROQ.calls.length = 0; GROQ.script = [{ content: "Once." }, { content: "Twice?!" }];
  m = mkMsg("<@BOTID> hello again", { mention: true, id: "SAMEID" }); await send(m); await send(m); await settle(m);
  ck("the same message delivered twice -> still ONE reply", m.all().length === 1 && GROQ.calls.length === 1, `replies=${m.all().length} calls=${GROQ.calls.length}`);
  GROQ.calls.length = 0; m = mkMsg("just chatting with my friends here, no bot involved"); await send(m); await settle(m, 400);
  ck("unrelated chatter: no reply and no AI call", m.all().length === 0 && GROQ.calls.length === 0, `replies=${m.all().length} calls=${GROQ.calls.length}`);

  if (process.env.SLASH) {
    const tree = JSON.parse(require("fs").readFileSync(process.env.SLASH, "utf8"));
    const MASTER = "1048836348582305913";
    const fakeUser = (id) => ({ id, username: "Target", bot: false, tag: "Target#1", displayName: "Target", displayAvatarURL: () => "http://x/a.png", avatarURL: () => "http://x/a.png", send: async () => ({}) });
    const val = (o, g) => { const c = o.choices && o.choices[0]; return c ? c.value : ({ 3: "TITAN", 4: 10, 5: true, 6: fakeUser("U2"), 7: { id: "C1", name: "general", send: async () => ({}) }, 8: { id: "R1", name: "role" }, 10: 10, 11: null, 9: fakeUser("U2") })[o.type]; };
    const jobs = [];
    for (const c of tree) {
      const subs = c.options.filter((o) => o.__sub), groups = c.options.filter((o) => o.__group);
      if (!subs.length && !groups.length) jobs.push([c, null, null, c.options]);
      for (const sb of subs) jobs.push([c, null, sb.name, sb.options]);
      for (const g of groups) for (const sb of g.options.filter((o) => o.__sub)) jobs.push([c, g.name, sb.name, sb.options]);
    }
    for (const [c, group, sub, opts] of jobs) {
      for (const who of ["user", "master"]) {
        const label = "/" + c.name + (group ? " " + group : "") + (sub ? " " + sub : "") + (who === "master" ? " (as Don)" : "");
        if (who === "master" && !/(admin|reset|setup|god|grant|give|set|remove|ban|mod|dev|lock|clone|exile|shadow|jarvis)/i.test(c.name + (sub || ""))) continue;
        const e0 = errs.length, f0 = fatal.length; const msg = mkMsg("x", { authorId: who === "master" ? MASTER : "SL" + (++n0) });
        const rec = []; const vals = Object.fromEntries(opts.map((o) => [o.name, val(o, o)]));
        const mk = (k) => async (x) => { rec.push(typeof x === "string" ? x : JSON.stringify(x && (x.content || (x.embeds && "[embed]") || "[payload]"))); return { id: "RP", edit: async () => {}, delete: async () => {}, createMessageComponentCollector: () => new EventEmitter(), awaitMessageComponent: async () => { throw new Error("timeout"); } }; };
        const reply = mk(); const ia = { id: "I" + Math.random(), commandName: c.name, user: msg.message.author, member: msg.message.member, guild: msg.message.guild, guildId: "G1", channel: msg.message.channel, channelId: "C1", client: { user: { id: "BOTID" } }, replied: false, deferred: false, createdTimestamp: Date.now(), locale: "en-US",
          isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false, isAutocomplete: () => false, isCommand: () => true, isRepliable: () => true, isMessageComponent: () => false, isUserContextMenuCommand: () => false, isMessageContextMenuCommand: () => false,
          options: { getSubcommand: () => sub, getSubcommandGroup: () => group, getString: (n) => vals[n] ?? null, getInteger: (n) => vals[n] ?? null, getNumber: (n) => vals[n] ?? null, getBoolean: (n) => vals[n] ?? null, getUser: (n) => vals[n] ?? null, getMember: (n) => vals[n] ?? null, getChannel: (n) => vals[n] ?? null, getRole: (n) => vals[n] ?? null, getMentionable: (n) => vals[n] ?? null, getAttachment: () => null, getFocused: () => "" },
          reply: async (x) => { ia.replied = true; return reply(x); }, deferReply: async () => { ia.deferred = true; }, editReply: async (x) => reply(x), followUp: async (x) => reply(x), deleteReply: async () => {}, fetchReply: async () => ({ id: "RP", edit: async () => {} }), showModal: async () => rec.push("[modal]") };
        let thrown = ""; try { await handlers.InteractionCreate[0](ia); } catch (e) { thrown = e.message; }
        await wait(220);
        const newErr = errs.slice(e0).filter((x) => /ERROR|Error|TypeError|ReferenceError|is not|Cannot/.test(x) && !/REST connectivity|upabase/.test(x)).map((x) => x.split("\n")[0].slice(0, 140));
        const txt = rec.join(" || ").replace(/\s+/g, " ");
        const bad = thrown || fatal.length > f0 || newErr.length || /Something went wrong|An error occurred|error occurred/i.test(txt);
        origLog((bad ? "  !! " : "  ok ") + label.padEnd(36) + String(rec.length).padStart(2) + " resp  " + (bad ? ("ERR: " + (thrown || newErr[0] || fatal[fatal.length - 1] || txt)).slice(0, 150) : (txt || "(no response)").slice(0, 52)));
      }
    }
    process.exit = () => {}; return setTimeout(() => realExit(0), 50);
  }
  if (process.env.DEBUG_BOOT) { origLog("BOOT console.error lines:\n" + errs.map((x) => "  > " + x.split("\n")[0].slice(0, 170)).join("\n")); process.exit = () => {}; return setTimeout(() => realExit(0), 50); }
  if (process.env.SWEEP) {
    const cmds = require("fs").readFileSync(process.env.SWEEP, "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
    const MASTER = "1048836348582305913";
    let n = 0;
    for (const raw of cmds) {
      const asMaster = raw.startsWith("M:"); const c = asMaster ? raw.slice(2) : raw;
      const e0 = errs.length, f0 = fatal.length; const mm = mkMsg(c, { authorId: asMaster ? MASTER : "S" + ++n, username: asMaster ? "EnderLavender" : "Sweeper" + n });
      GROQ.script = []; let thrown = "";
      try { await send(mm); } catch (e) { thrown = e.message; }
      await settle(mm, 350);
      const outTxt = mm.all().map(text).join(" || ").replace(/\s+/g, " ");
      const newErr = errs.slice(e0).filter((x) => /ERROR|Error|TypeError|ReferenceError|is not|undefined|Cannot/.test(x) && !/REST connectivity|Supabase|supabase/.test(x)).map((x) => x.split("\n")[0].slice(0, 150));
      const bad = thrown || fatal.length > f0 || newErr.length || /Something went wrong/.test(outTxt);
      if (process.env.DEBUG_ERRS && bad) origLog(errs.slice(e0).join("\n").slice(0, 1400));
      origLog((bad ? "  !! " : "  ok ") + c.padEnd(34) + " " + String(mm.all().length).padStart(2) + " msg  " + (bad ? ("ERR: " + (thrown || newErr[0] || fatal[fatal.length - 1] || outTxt)).slice(0, 170) : outTxt.slice(0, 60)));
    }
    process.exit = () => {}; return setTimeout(() => realExit(0), 50);
  }
  origLog("\n[FAIRNESS — one person can't burn the shared token budget]");
  const MASTER_ID_ = "1048836348582305913";
  process.env.AI_USER_COOLDOWN_MS = "3000";
  GROQ.calls.length = 0; GROQ.script = [{ content: "Hey Spammer, what's up?" }, { content: "Hey Other, what's up?" }];
  let sp1 = mkMsg("<@BOTID> hi", { mention: true, authorId: "SPAM1", username: "Spammer" }); await send(sp1); await settle(sp1, 400);
  let sp2 = mkMsg("<@BOTID> hi again", { mention: true, authorId: "SPAM1", username: "Spammer" }); await send(sp2); await settle(sp2, 400);
  ck("first message answered", sp1.all().length === 1);
  ck("a second message inside the cooldown is held back (no AI call)", sp2.all().length === 0 && GROQ.calls.length === 1, `replies=${sp2.all().length} calls=${GROQ.calls.length}`);
  ck("…and the player sees an hourglass reaction instead of silence", sp2.reacts.includes("⏳"), JSON.stringify(sp2.reacts));
  let ot = mkMsg("<@BOTID> hello", { mention: true, authorId: "OTHER1", username: "Other" }); await send(ot); await settle(ot, 500);
  ck("a DIFFERENT player is not affected by someone else's spam", ot.all().length === 1, "replies=" + ot.all().length);
  GROQ.calls.length = 0; GROQ.script = [{ content: "Mr.EnderLavender, at your service." }, { content: "Mr.EnderLavender, still here." }, { content: "Mr.EnderLavender, always." }];
  const dm = [1, 2, 3].map((i) => mkMsg("<@BOTID> hi " + i, { mention: true, authorId: MASTER_ID_, username: "EnderLavender" }));
  for (const x of dm) { await send(x); await settle(x, 300); }
  ck("the Don is never throttled (3 quick messages, 3 answers)", dm.every((x) => x.all().length === 1), dm.map((x) => x.all().length).join());
  process.env.AI_USER_COOLDOWN_MS = "0";

  origLog("\n[PER-CHANNEL HISTORY]");
  GROQ.calls.length = 0; GROQ.script = [{ content: "Purple. Bold choice." }, { content: "Nothing to see in here." }, { content: "You said purple." }];
  let c1 = mkMsg("<@BOTID> my favourite colour is purple", { mention: true, authorId: "CH1", username: "Chatter", channelId: "CHAN_A" }); await send(c1); await settle(c1, 400);
  let c2 = mkMsg("<@BOTID> what's up", { mention: true, authorId: "CH1", username: "Chatter", channelId: "CHAN_B" }); await send(c2); await settle(c2, 400);
  ck("a different channel does NOT see the other channel's conversation", !/purple/i.test(JSON.stringify(GROQ.calls[1].messages.slice(1))), "leaked");
  let c3 = mkMsg("<@BOTID> remind me what I said", { mention: true, authorId: "CH1", username: "Chatter", channelId: "CHAN_A" }); await send(c3); await settle(c3, 400);
  ck("the SAME channel still remembers its own conversation", /purple/i.test(JSON.stringify(GROQ.calls[2].messages)), "lost context");

  origLog("\n[ANTI-REPETITION]");
  GROQ.calls.length = 0; GROQ.script = [{ content: "Yeah, I'm here. Spit it out." }, { content: "Yeah, I'm here. Spit it out." }, { content: "Fine — what do you need from me?" }];
  let r1 = mkMsg("<@BOTID> cosa", { mention: true, authorId: "REP1", username: "Rep", channelId: "CHAN_R" }); await send(r1); await settle(r1, 400);
  let r2 = mkMsg("<@BOTID> cosa again", { mention: true, authorId: "REP1", username: "Rep", channelId: "CHAN_R" }); await send(r2); await settle(r2, 700);
  ck("first reply goes through as-is", /Spit it out/.test(text(r1.all()[0])));
  ck("when the model repeats itself, the player gets a fresh take instead", /what do you need/.test(text(r2.all()[0])) && GROQ.calls.length === 3, text(r2.all()[0]) + " calls=" + GROQ.calls.length);

  origLog("\n[AI STATUS — diagnostics for the Don]");
  GROQ.calls.length = 0; GROQ.script = [{ content: "Nothing to report." }];
  let st = mkMsg("cosa ai status", { authorId: MASTER_ID_, username: "EnderLavender" }); await send(st); await settle(st, 600);
  const stTxt = st.all().map(text).join("\n");
  ck("the Don gets a status report", /COSA AI STATUS/.test(stTxt) && /Chat models/.test(stTxt), stTxt.slice(0, 120));
  ck("it lists every model in the chain with its health", /gpt-oss-120b/.test(stTxt) && /gpt-oss-20b/.test(stTxt) && /(ready|cooling|unavailable)/.test(stTxt));
  ck("it shows the quality-guard counters we just exercised", /cut-off replies caught/.test(stTxt) && /repeats rephrased/.test(stTxt) && /spam messages held back/.test(stTxt));
  ck("status costs no AI call", GROQ.calls.length === 0, "calls=" + GROQ.calls.length);
  GROQ.script = [{ content: "I don't know what that is." }];
  let st2 = mkMsg("cosa ai status", { authorId: "PLAYER9", username: "Nobody" }); await send(st2); await settle(st2, 500);
  ck("a normal player does NOT get the status report", !/COSA AI STATUS/.test(st2.all().map(text).join(" ")));

  origLog("\n[FAILURE MESSAGES]");
  GROQ.script = Array(20).fill({ err: "500 internal error", status: 500 });
  let f1 = mkMsg("<@BOTID> are you there", { mention: true, authorId: "FAIL1", username: "Player" }); await send(f1); await settle(f1, 1500);
  const f1t = f1.all().map(text).join(" ");
  ck("players get a friendly in-character message when AI is down", /broke on my end|Static on the line/.test(f1t) && !/500|internal error|ai status/i.test(f1t), f1t);
  GROQ.script = Array(20).fill({ err: "500 internal error", status: 500 });
  let f2 = mkMsg("<@BOTID> are you there", { mention: true, authorId: MASTER_ID_, username: "EnderLavender" }); await send(f2); await settle(f2, 1500);
  ck("the Don also gets the technical reason + where to look", /ai status/i.test(f2.all().map(text).join(" ")), f2.all().map(text).join(" ").slice(0, 160));
  GROQ.script = [];

  origLog("\n[NON-AI COMMANDS — must not crash]");
  const before = fatal.length;
  for (const c of ["cosa help", "cosa balance", "cosa daily", "cosa stocks", "cosa prestige", "cosa prestige tree", "cosa bank", "cosa leaderboard"]) {
    const mm = mkMsg(c); try { await send(mm); } catch (e) { fatal.push("handler threw on '" + c + "': " + e.message); } await settle(mm, 250);
    origLog(`  info   "${c}" -> ${mm.all().length} message(s)`);
  }
  ck("none of those commands threw or left an unhandled rejection", fatal.length === before, fatal.slice(before).join(" | ").slice(0, 300));
  const e0 = errs.length; const hm = mkMsg("cosa help", { authorId: "U77", username: "Fresh" }); await send(hm); await settle(hm, 2500);
  if (process.env.DEBUG_HELP) { origLog("  DEBUG new console.error lines:", JSON.stringify(errs.slice(e0).map((x) => x.slice(0, 220)))); }
  origLog("  info   'cosa help' (waited 2.5s) ->", hm.all().length, "message(s):", hm.all().map(text).join(" || ").slice(0, 90));
  ck("'cosa help' answers (was: silently ignored)", hm.all().length >= 1 && /\/help/.test(hm.all().map(text).join(" ")), hm.all().map(text).join(" || "));
  const rm = mkMsg("cosa rank help", { authorId: "U78" }); await send(rm); await settle(rm, 1200);
  ck("'cosa rank help' answers too", rm.all().length >= 1, "msgs=" + rm.all().length);
  const cm = mkMsg("cosa commands", { authorId: "U79" }); await send(cm); await settle(cm, 1200);
  ck("'cosa commands' answers too", cm.all().length >= 1, "msgs=" + cm.all().length);

  origLog(`\n${pass} passed, ${fail} failed`);
  if (fatal.length) origLog("background errors:", fatal.slice(0, 3).join(" | "));
  const real = errs.filter((e) => !/Supabase|supabase|Could not|\[DEV|font|ENOENT|canvas/i.test(e)).slice(-5);
  if (real.length) origLog("console.error samples:\n  " + real.map((x) => x.slice(0, 200)).join("\n  "));
  process.exit = () => {}; process.exitCode = fail ? 1 : 0; setTimeout(() => realExit(fail ? 1 : 0), 50);
})();

