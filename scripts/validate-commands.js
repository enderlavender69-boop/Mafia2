// Pre-deploy check:  npm run validate   (or: node scripts/validate-commands.js [path/to/index.js])
// Runs the REAL `const commands = [ ... ];` block from index.js against a stand-in for discord.js's
// builders that enforces Discord's documented limits (descriptions <= 100 chars, names, option order,
// choice limits...) and reports EVERY violation at once — instead of crashing on the first one at boot.
const fs = require("fs"), vm = require("vm");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "index.js");
const src = fs.readFileSync(file, "utf8");
const a = src.indexOf("const commands = [");
if (a < 0) { console.error("commands array not found"); process.exit(2); }
// find the matching close of the top-level array
let depth = 0, i = src.indexOf("[", a), end = -1, inStr = null, esc = false, inLC = false, inBC = false;
for (let j = i; j < src.length; j++) {
  const c = src[j], n = src[j + 1];
  if (inLC) { if (c === "\n") inLC = false; continue; }
  if (inBC) { if (c === "*" && n === "/") { inBC = false; j++; } continue; }
  if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === inStr) inStr = null; continue; }
  if (c === "/" && n === "/") { inLC = true; continue; }
  if (c === "/" && n === "*") { inBC = true; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "[") depth++;
  else if (c === "]") { depth--; if (depth === 0) { end = j; break; } }
}
const block = src.slice(a, end + 1) + ";";

const problems = [];
const NAME_RE = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
const here = () => { const m = (new Error().stack || "").split("\n").find(l => l.includes("evalmachine") && !l.includes("validate")); return m ? (m.match(/:(\d+):/) || [])[1] : "?"; };

class Opt {
  constructor(type) { this.type = type; this.o = { type, choices: [] }; }
  setName(n) { this.o.name = n; return this; }
  setDescription(d) { this.o.description = d; return this; }
  setRequired(r = true) { this.o.required = !!r; return this; }
  addChoices(...c) { this.o.choices.push(...c.flat()); return this; }
  setAutocomplete(){ return this; } setMinValue(){ return this; } setMaxValue(){ return this; }
  setMinLength(){ return this; } setMaxLength(){ return this; } addChannelTypes(){ return this; }
  setNameLocalizations(){ return this; } setDescriptionLocalizations(){ return this; }
}
class Cmd {
  constructor() { this.o = { options: [] }; }
  setName(n) { this.o.name = n; return this; }
  setDescription(d) { this.o.description = d; return this; }
  _add(type, fn) { const op = new Opt(type); fn(op); this.o.options.push(op.o); return this; }
  addStringOption(f) { return this._add(3, f); } addIntegerOption(f) { return this._add(4, f); }
  addBooleanOption(f) { return this._add(5, f); } addUserOption(f) { return this._add(6, f); }
  addChannelOption(f) { return this._add(7, f); } addRoleOption(f) { return this._add(8, f); }
  addMentionableOption(f) { return this._add(9, f); } addNumberOption(f) { return this._add(10, f); }
  addAttachmentOption(f) { return this._add(11, f); }
  addSubcommand(f) { const s = new Cmd(); f(s); s.o.__sub = true; this.o.options.push(s.o); return this; }
  addSubcommandGroup(f) { const s = new Cmd(); f(s); s.o.__group = true; this.o.options.push(s.o); return this; }
  setDefaultMemberPermissions(){ return this; } setDMPermission(){ return this; } setNSFW(){ return this; }
  setNameLocalizations(){ return this; } setDescriptionLocalizations(){ return this; }
  toJSON() { return this.o; }
}
const ctx = { SlashCommandBuilder: Cmd, PermissionFlagsBits: new Proxy({}, { get: () => 1n }), console, BigInt, process };
vm.createContext(ctx);
vm.runInContext(block + "\nglobalThis.__cmds = commands;", ctx, { filename: "commands-block" });
const cmds = ctx.__cmds;

function checkOpts(path, opts) {
  if (opts.length > 25) problems.push(`${path}: ${opts.length} options (max 25)`);
  let sawOptional = false;
  const names = new Set();
  for (const o of opts) {
    const p = `${path} > ${o.name}`;
    if (o.__sub || o.__group) { checkNode(p, o); continue; }
    if (!o.name || !NAME_RE.test(o.name) || o.name !== o.name.toLowerCase()) problems.push(`${p}: invalid option name "${o.name}" (lowercase, 1-32, letters/digits/_/-)`);
    if (!o.description || o.description.length < 1 || o.description.length > 100) problems.push(`${p}: option description is ${o.description ? o.description.length : 0} chars (1-100): "${o.description}"`);
    if (names.has(o.name)) problems.push(`${p}: duplicate option name`); names.add(o.name);
    if (o.required && sawOptional) problems.push(`${p}: REQUIRED option placed after an optional one (Discord rejects this at registration)`);
    if (!o.required) sawOptional = true;
    if (o.choices.length > 25) problems.push(`${p}: ${o.choices.length} choices (max 25)`);
    for (const c of o.choices) {
      if (!c.name || String(c.name).length > 100) problems.push(`${p}: choice name too long/empty (${String(c.name).length}): "${c.name}"`);
      if (typeof c.value === "string" && c.value.length > 100) problems.push(`${p}: choice value too long (${c.value.length})`);
    }
  }
}
function checkNode(path, c) {
  if (!c.name || !NAME_RE.test(c.name) || c.name !== c.name.toLowerCase()) problems.push(`${path}: invalid name "${c.name}"`);
  if (!c.description || c.description.length > 100) problems.push(`${path}: description is ${c.description ? c.description.length : 0} chars (1-100): "${c.description}"`);
  checkOpts(path, c.options);
}
const seen = new Set();
cmds.forEach((c, idx) => {
  if (seen.has(c.name)) problems.push(`/${c.name}: DUPLICATE command name`); seen.add(c.name);
  checkNode(`/${c.name}`, c);
});
if (cmds.length > 100) problems.push(`${cmds.length} commands (max 100 global)`);
console.log(`Checked ${cmds.length} slash commands.`);
if (!problems.length) console.log("✅ No violations.");
else { console.log(`❌ ${problems.length} violation(s):`); problems.forEach(p => console.log("  - " + p)); process.exit(1); }
