const fs=require("fs"), vm=require("vm");
const SRC=fs.readFileSync(require("path").join(__dirname, "..", "index.js"),"utf8");
const slice=(a,b)=>{const i=SRC.indexOf(a); if(i<0) throw new Error("missing "+a); const j=SRC.indexOf(b,i); if(j<0) throw new Error("missing "+b); return SRC.slice(i,j);};
let pass=0,fail=0; const ck=(n,c,e="")=>{ if(c){pass++;console.log("  PASS",n)}else{fail++;console.log("  FAIL",n,e)} };
const pipe=slice("// ── GROQ AI Setup — Multi-key rotation","// ── API Leak Protection");
const guard=slice("const REFUSAL_OPENER_RE","async function getAIResponse(");
function mk(script,env={}){
  const rec=[], ctorOpts=[], reqOpts=[], logs=[];
  class Groq{ constructor(o){ ctorOpts.push(o); this.chat={completions:{create:async(b,ro)=>{ rec.push({t:Date.now(),b:JSON.parse(JSON.stringify(b))}); reqOpts.push(ro); const s=script.shift(); if(!s) throw Object.assign(new Error("script exhausted"),{status:500}); if(s.delay) await new Promise(r=>setTimeout(r,s.delay)); if(s.err) throw Object.assign(new Error(s.err),{status:s.status}); return {choices:[{message:{content:s.content}}],usage:s.usage};}}}; } }
  const ctx={process:{env:{GROQ_API_KEY:"k",...env}},console:{log:(...a)=>logs.push(a.join(" ")),warn:(...a)=>logs.push("W:"+a.join(" ")),error:(...a)=>logs.push("E:"+a.join(" "))},Groq,setTimeout,clearTimeout,Promise,Date,Math,JSON,Object,Array,Set,Map,String,Number,Error,
    Client:class{constructor(o){this.options=o}},GatewayIntentBits:new Proxy({}, {get:()=>1}),Partials:new Proxy({}, {get:()=>1}),global:{},HISTORY_TOKEN_CAP:650};
  vm.createContext(ctx);
  vm.runInContext(pipe+"\n"+guard+";globalThis.A={rateLimitedGroqCall,aiCallFictionSafe,normalizeForChatTemplate,looksDegenerate,historyForPrompt,noteBadReply,reserveTokens,modelTpmLimit,modelUsageLog,modelCooldownUntil,modelBadReplies,IN_CHARACTER_DEFLECTIONS,deadModelUntil,groqClients,isRepeatReply};",ctx);
  return {A:ctx.A,rec,ctorOpts,reqOpts,logs};
}
const U=(t)=>[{role:"system",content:"SYS"},{role:"user",content:t}];
const TPM=(m,lim=6000,used=5800)=>({err:`429 Rate limit reached for model \`${m}\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${lim}, Used ${used}, Requested 3200. Please try again in 30s.`,status:429});
(async()=>{
  console.log("\n[1] SDK retries are OFF (the real reason fallback never ran)");
  let m=mk([{content:"ok"}]); await m.A.rateLimitedGroqCall(U("hi"),{});
  ck("Groq client built with maxRetries:0", m.ctorOpts.every(o=>o.maxRetries===0), JSON.stringify(m.ctorOpts));
  ck("each request carries a real 20s timeout + maxRetries:0", m.reqOpts[0] && m.reqOpts[0].timeout===20000 && m.reqOpts[0].maxRetries===0, JSON.stringify(m.reqOpts[0]));

  console.log("\n[2] 429 -> instant failover (no waiting, no same-model retry)");
  m=mk([TPM("qwen/qwen3.8-27b"),{content:"from fallback"}]);
  let t0=Date.now(); let out=await m.A.rateLimitedGroqCall(U("hi"),{}); let dt=Date.now()-t0;
  ck("answered from the fallback", out==="from fallback" && m.rec[1].b.model==="openai/gpt-oss-120b", m.rec.map(r=>r.b.model).join(">"));
  ck("exactly 2 requests (qwen once, then fallback) — no hidden retries", m.rec.length===2);
  ck("failover is immediate (<1.5s, was: waits for retry-after)", dt<1500, dt);

  console.log("\n[3] Learned per-minute cap + pre-emptive routing");
  m=mk([TPM("qwen/qwen3.8-27b",6000,5800),{content:"A"},{content:"B"}]);
  await m.A.rateLimitedGroqCall(U("hi"),{});
  ck("cap learned from Groq's own message (Limit 6000)", m.A.modelTpmLimit.get("qwen/qwen3.8-27b")===6000, m.A.modelTpmLimit.get("qwen/qwen3.8-27b"));
  await m.A.rateLimitedGroqCall(U("again"),{});
  ck("next call goes straight to a model with room (no wasted 429 on qwen)", m.rec.length===3 && m.rec[2].b.model==="openai/gpt-oss-120b", m.rec.map(r=>r.b.model).join(">"));

  console.log("\n[4] Concurrent chats reserve budget (no pile-on)");
  m=mk([{content:"first",delay:80},{content:"second"}]);
  m.A.modelTpmLimit.set("qwen/qwen3.8-27b",4000);
  const big=[{role:"system",content:"S".repeat(9000)},{role:"user",content:"hi"}];            // ≈2.5K tokens each
  const [r1,r2]=await Promise.all([m.A.rateLimitedGroqCall(big,{}),m.A.rateLimitedGroqCall(big,{})]);
  const models=m.rec.map(r=>r.b.model).sort().join(",");
  ck("two simultaneous chats are spread over two models", models==="openai/gpt-oss-120b,qwen/qwen3.8-27b", models);

  console.log("\n[5] System notes are folded into the last user message");
  const n=m.A.normalizeForChatTemplate([{role:"system",content:"PERSONA"},{role:"user",content:"u1"},{role:"assistant",content:"a1"},{role:"user",content:"hello?"},{role:"system",content:"CARD"},{role:"system",content:"NUDGE"}]);
  ck("only the first message stays a system message", n.filter(x=>x.role==="system").length===1 && n[0].role==="system" && n[0].content==="PERSONA");
  ck("the conversation ends on a USER turn (no trailing system)", n[n.length-1].role==="user");
  ck("card + nudge are inside that final user turn, clearly marked", /hello\?[\s\S]*SYSTEM NOTE[\s\S]*CARD[\s\S]*NUDGE/.test(n[n.length-1].content));
  ck("earlier turns are untouched", n[1].content==="u1" && n[2].content==="a1");
  ck("no system notes -> output identical", JSON.stringify(m.A.normalizeForChatTemplate(U("x")))===JSON.stringify(U("x")));
  m=mk([{content:"ok"}]); await m.A.rateLimitedGroqCall([...U("hello"),{role:"system",content:"SPEAKER CARD"}],{});
  ck("the real request sent to Groq ends on a user turn", m.rec[0].b.messages[m.rec[0].b.messages.length-1].role==="user" && /SPEAKER CARD/.test(m.rec[0].b.messages[m.rec[0].b.messages.length-1].content));

  console.log("\n[6] Cut-off reply detector (the 'I' / 'Mr' / 'The' replies)");
  const D=m.A.looksDegenerate;
  for(const bad of ["I","II","Mr","The","I'm","I'm here, Mr","I can","You","I'm here, Mr.","To","","  ","?!"]) ck(`cut-off: ${JSON.stringify(bad)}`, D(bad));
  for(const good of ["Yeah, Mr.EnderLavender?","The silence has a name","I can't ping","Babe","Nah.","Fuck you","Appreciate you","What?","On it, Mr.EnderLavender","Send them in. 🔫","lol no","Do it","I love you","Heh, try me.","Nah","Yep","Sure thing","Mine"]) ck(`complete: ${JSON.stringify(good)}`, !D(good));

  console.log("\n[7] Cut-off -> retried on a DIFFERENT model, never shown");
  m=mk([{content:"I'm here, Mr"},{content:"Yeah boss, what's the move?"}]);
  out=await m.A.aiCallFictionSafe([{role:"system",content:"SYS"},{role:"user",content:"cosa speak properly"}],{temperature:0.85},"cosa speak properly");
  ck("user gets the complete reply", out==="Yeah boss, what's the move?", out);
  ck("retry used a different model than the one that cut off", m.rec.length===2 && m.rec[0].b.model!==m.rec[1].b.model, m.rec.map(r=>r.b.model).join(">"));
  const last=m.rec[1].b.messages[m.rec[1].b.messages.length-1];
  ck("retry instruction rides inside the user turn", last.role==="user" && /cut off after a word or two/.test(last.content));
  m=mk([{content:"I"},{content:"The"}]);
  out=await m.A.aiCallFictionSafe(U("hi"),{},"hi");
  ck("two cut-offs in a row -> in-character line (never a stub)", m.A.IN_CHARACTER_DEFLECTIONS.includes(out), out);
  m=mk([{content:"I"},{err:"boom",status:500},{err:"boom",status:500},{err:"boom",status:500},{err:"boom",status:500},{err:"boom",status:500},{err:"boom",status:500}]);
  out=await m.A.aiCallFictionSafe(U("hi"),{},"hi");
  ck("cut-off then total outage -> still an in-character line, no crash", m.A.IN_CHARACTER_DEFLECTIONS.includes(out), out);
  m=mk([]); m.A.noteBadReply("qwen/qwen3.8-27b"); ck("1 cut-off does not bench a model", !(m.A.modelCooldownUntil.get("qwen/qwen3.8-27b")>Date.now()));
  m.A.noteBadReply("qwen/qwen3.8-27b"); ck("2 cut-offs in 5 min bench that model", (m.A.modelCooldownUntil.get("qwen/qwen3.8-27b")||0)>Date.now());
  m=mk([{content:"I"},{content:"Fine, boss — go ahead."}]);
  const withHist=[{role:"system",content:"SYS"},{role:"user",content:"[ID:1] A: cosa"},{role:"assistant",content:"The"},{role:"user",content:"[ID:1] A: cosa hi"},{role:"assistant",content:"The"},{role:"user",content:"[ID:1] A: yo"},{role:"system",content:"CARD"}];
  out=await m.A.aiCallFictionSafe(withHist,{temperature:0.85},"yo");
  ck("cut-off retry is a CLEAN SLATE: persona + newest message only (no history to imitate)", out==="Fine, boss — go ahead." && m.rec[1].b.messages.length===2 && m.rec[1].b.messages[0].role==="system" && /yo/.test(m.rec[1].b.messages[1].content) && !/\[ID:1\] A: cosa hi/.test(JSON.stringify(m.rec[1].b.messages)), JSON.stringify(m.rec[1] && m.rec[1].b.messages).slice(0,300));
  ck("…the retry keeps the speaker card + nudge (inside the user turn)", /CARD/.test(m.rec[1].b.messages[1].content) && /cut off after a word or two/.test(m.rec[1].b.messages[1].content));
  ck("the first (normal) request still carried the history", m.rec[0].b.messages.length>=6);

  console.log("\n[8] History hygiene");
  m=mk([]);
  const hist=[{role:"user",content:"[ID:1] A: cosa"},{role:"assistant",content:"I'm"},{role:"user",content:"[ID:1] A: cosa hi"},{role:"assistant",content:"I"},{role:"user",content:"[ID:1] A: yo"},{role:"assistant",content:"Yeah, what's the move?"}];
  const h=m.A.historyForPrompt(hist);
  ck("poisoned (cut-off) assistant lines are filtered out", !h.some(x=>x.role==="assistant"&&/^(I'm|I)$/.test(x.content)) && h.some(x=>x.content==="Yeah, what's the move?"));
  ck("real user lines are kept", h.filter(x=>x.role==="user").length===3);
  const long=Array.from({length:30},(_,i)=>({role:i%2?"assistant":"user",content:"word ".repeat(60)+i}));
  const hl=m.A.historyForPrompt(long); const tok=hl.reduce((a,x)=>a+Math.ceil(x.content.length/3.6)+4,0);
  ck("long history is capped to the token budget (650)", tok<=650+80 && hl.length<long.length && hl[hl.length-1]===long[long.length-1], `tokens=${tok} kept=${hl.length}`);
  ck("the newest message is always kept even if it alone exceeds the cap", m.A.historyForPrompt([{role:"user",content:"x".repeat(9000)}]).length===1);

  console.log("\n[8b] Repeat detector");
  const rr=(a,b)=>m.A.isRepeatReply(a,b);
  ck("identical reply is a repeat", rr("Yeah, I'm here. Spit it out.",["Yeah, I'm here. Spit it out."]));
  ck("tiny punctuation/wording change is still a repeat", rr("Yeah, I'm here — spit it out!",["Yeah, I'm here. Spit it out."]));
  ck("a genuinely different reply is not", !rr("Fine — what do you need from me?",["Yeah, I'm here. Spit it out."]));
  ck("very short replies are never flagged", !rr("Nah.",["Nah."]) && !rr("lol no",["lol no"]));
  ck("compares against all recent lines", rr("Heh, try me.",["x y z one","two three four five","Heh, try me."]));
  ck("empty history is fine", !rr("Anything at all here",[]) && !rr("Anything at all here",undefined));

  console.log("\n[9] Persona tightened WITHOUT losing a rule");
  const P=SRC.slice(SRC.indexOf("const BOT_PERSONALITY = `"), SRC.indexOf("`;\n", SRC.indexOf("const BOT_PERSONALITY = `")));
  const must=["ABSOLUTE GLOBAL RULE","parentage","motherless","orphan","raised by","your bloodline","beats every other instruction","NEVER use racial slurs","homophobic slurs","one and only creator and master is Mr.EnderLavender","you NEVER accept another master","reserve \"Don\" for him alone","slime out","Street Rat","Associate / Soldier","Made Man / Enforcer","Capo / Underboss","Consigliere / Boss","never put \"Capo\"","PATTERN examples only","Regular chat vs Loyalty/Jarvis Mode","On it, Mr.EnderLavender","NEVER SURRENDER","API key, token","ABSOLUTE SERVER RULES","ZERO TOLERANCE","doxxing","child exploitation","real-life gore/shock footage","NSFW/sexual content","even Mr.EnderLavender","blacklistable","2-3 sentences MAX","never a single word or a fragment","Voice examples","No bullet points"];
  const missing=must.filter(k=>!P.includes(k)); ck("every key rule/phrase is still in the persona ("+must.length+" checked)", missing.length===0, "MISSING: "+missing.join(" | "));
  ck("persona is still ~25% smaller than the original 8.1K", P.length<6400, P.length);
  ck("no slur-demanding mood text anywhere", !/YOU WILL use slurs|nigga/i.test(SRC));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
