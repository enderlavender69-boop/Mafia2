// Runs the REAL `const commands = [ ... ];` block from index.js against a stand-in for
// discord.js's builders that enforces Discord's documented limits, and reports EVERY violation.
const fs = require("fs"), vm = require("vm");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "index.js");
const fsx=require("fs");
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

fsx.writeFileSync(require("path").join(require("os").tmpdir(), "cmdtree.json"), JSON.stringify(cmds)); console.log("dumped", cmds.length);
