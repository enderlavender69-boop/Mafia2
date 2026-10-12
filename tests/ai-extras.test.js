const fs=require("fs"), vm=require("vm");
const SRC=fs.readFileSync(require("path").join(__dirname, "..", "index.js"),"utf8");
const slice=(a,b)=>{const i=SRC.indexOf(a); if(i<0) throw new Error("missing "+a); const j=SRC.indexOf(b,i); if(j<0) throw new Error("missing "+b); return SRC.slice(i,j);};
let pass=0,fail=0; const ck=(n,c,e="")=>{ if(c){pass++;console.log("  PASS",n)}else{fail++;console.log("  FAIL",n,e)} };

(async()=>{
  // ── A. wait-for-cooldown + token headroom, using the REAL pipeline code ──
  const code=slice("// ── GROQ AI Setup — Multi-key rotation","// ── API Leak Protection");
  function mk(script,env={}){ const rec=[]; class Groq{constructor(){this.chat={completions:{create:async b=>{rec.push({t:Date.now(),b:JSON.parse(JSON.stringify(b))}); const s=script.shift(); if(s.err) throw Object.assign(new Error(s.err),{status:s.status}); return {choices:[{message:{content:s.content}}]};}}};}}
    const logs=[]; const ctx={process:{env:{GROQ_API_KEY:"k",...env}},console:{log:(...a)=>logs.push(a.join(" ")),warn(){},error(){}},Groq,setTimeout,clearTimeout,Promise,Date,Math,JSON,Object,Array,Set,Map,String,Number,Error,Client:class{constructor(o){this.options=o}},GatewayIntentBits:new Proxy({}, {get:()=>1}),Partials:new Proxy({}, {get:()=>1}),global:{}};
    vm.createContext(ctx); vm.runInContext(code+";globalThis.A={rateLimitedGroqCall,defaultMaxTokens,waitForUsableModel,modelCooldownUntil,deadModelUntil,modelChainFor,AI_MODEL_CHAT,AI_FALLBACK_CHAT,AI_LAST_RESORT};",ctx); return {A:ctx.A,rec,logs}; }
  console.log("\n[A] chat reliability");
  let {A}=mk([]);
  ck("qwen non-thinking -> 150 tokens", A.defaultMaxTokens("qwen/qwen3.8-27b",{})===150);
  ck("gpt-oss (reasoning) gets headroom -> 400 tokens", A.defaultMaxTokens("openai/gpt-oss-120b",{})===400 && A.defaultMaxTokens("openai/gpt-oss-20b",{})===400);
  { const mm=mk([{content:"ok"}]); await mm.A.rateLimitedGroqCall([{role:"user",content:"hi"}],{maxTokens:77}); ck("explicit opts.maxTokens (77) still wins over the default", mm.rec[0].b.max_tokens===77, mm.rec[0].b.max_tokens); }
  let m=mk([{content:"ok"}]); await m.A.rateLimitedGroqCall([{role:"user",content:"hi"}],{});
  ck("qwen request sent with 150 max_tokens", m.rec[0].b.max_tokens===150, m.rec[0].b.max_tokens);
  m=mk([{content:"ok"}],{GROQ_MODEL_CHAT:"openai/gpt-oss-120b"}); await m.A.rateLimitedGroqCall([{role:"user",content:"hi"}],{});
  ck("gpt-oss request sent with 400 max_tokens (no truncated/empty replies)", m.rec[0].b.max_tokens===400, m.rec[0].b.max_tokens);
  m=mk([{content:"after wait"}]);
  const chain=m.A.modelChainFor({}); const now=Date.now(); chain.forEach(x=>m.A.modelCooldownUntil.set(x,now+700));
  const t0=Date.now(); const out=await m.A.rateLimitedGroqCall([{role:"user",content:"hi"}],{}); const dt=Date.now()-t0;
  ck("ALL models cooling 0.7s -> waits, then answers (instead of failing)", out==="after wait" && dt>=600 && dt<2500, `out=${out} dt=${dt}`);
  ck("…and logged that it was waiting", m.logs.some(l=>/All models (cooling down|busy)/.test(l)));
  m=mk([{content:"x"}]); chain.forEach(x=>m.A.modelCooldownUntil.set(x,Date.now()+6*3600e3));
  const t1=Date.now(); try{ await m.A.rateLimitedGroqCall([{role:"user",content:"hi"}],{}); }catch(e){} 
  ck("long (daily-cap) cooldown does NOT stall the bot", Date.now()-t1<2000, Date.now()-t1);

  // ── B. anti-spam block (opt-in), using the REAL handler code ──
  console.log("\n[B] anti-spam (opt-in)");
  const block=slice("    // ── Anti-spam (opt-in, see ANTISPAM_ENABLED)","    if (isMaster && (lower === \"cosa networth\"");
  const AsyncFn=Object.getPrototypeOf(async function(){}).constructor;
  function mkSpam(enabled){
    const sent=[], timeouts=[], purged=[]; const spamTimestamps=new Map(), spamWarnings=new Map();
    const consts={ANTISPAM_ENABLED:enabled,SPAM_WINDOW_MS:2000,SPAM_MSG_THRESHOLD:3,SPAM_WARNS_TO_MUTE:3,SPAM_MUTE_MINUTES:30,SPAM_MUTE_MS:1800000};
    const fn=new AsyncFn("c","msg","isDM","isMaster","isMentioned","repliedToBot","isTriggered","spamTimestamps","spamWarnings","purgeQueuedMessagesFrom","Date",
      `const {ANTISPAM_ENABLED,SPAM_WINDOW_MS,SPAM_MSG_THRESHOLD,SPAM_WARNS_TO_MUTE,SPAM_MUTE_MINUTES,SPAM_MUTE_MS}=c; const message=msg; const lower='';\n`+
      block.replace(/\n\s*return;\n/,"\n        return 'BLOCKED';\n")+"\n return 'PASS';");
    const message=(id="u1",extra={})=>({author:{id},guild:{members:{fetch:async()=>({timeout:async(ms,why)=>{timeouts.push([ms,why])}})}},channel:{send:async t=>{sent.push(t)}},...extra});
    const run=(msg,o={})=>fn(consts,msg,o.isDM||false,o.isMaster||false,o.mention??true,o.reply||false,()=>o.triggered||false,spamTimestamps,spamWarnings,id=>purged.push(id),Date);
    return {run,message,sent,timeouts,purged,spamWarnings};
  }
  let s=mkSpam(false); let r=[]; for(let i=0;i<6;i++) r.push(await s.run(s.message()));
  ck("DEFAULT (off): never warns or mutes, however fast", r.every(x=>x==="PASS") && s.sent.length===0 && s.timeouts.length===0);
  s=mkSpam(true); r=[]; for(let i=0;i<3;i++) r.push(await s.run(s.message()));
  ck("ON: 3 fast bot-directed messages -> first warning, burst dropped", r.join()==="PASS,PASS,BLOCKED" && /Warning \*\*1\/3\*\*/.test(s.sent[0]) && s.timeouts.length===0, r.join()+s.sent[0]);
  for(let w=0;w<2;w++) for(let i=0;i<3;i++) await s.run(s.message());
  ck("ON: 3rd warning -> 30 min timeout + queued burst purged + notice", s.timeouts.length===1 && s.timeouts[0][0]===1800000 && s.purged.includes("u1") && /muted for \*\*30 minutes/.test(s.sent[s.sent.length-1]), JSON.stringify(s.timeouts));
  s=mkSpam(true); r=[]; for(let i=0;i<8;i++) r.push(await s.run(s.message("m"),{isMaster:true}));
  ck("ON: the Don/devs are never touched", r.every(x=>x==="PASS") && s.sent.length===0);
  s=mkSpam(true); r=[]; for(let i=0;i<8;i++) r.push(await s.run(s.message(),{mention:false,reply:false,triggered:false}));
  ck("ON: chatter NOT aimed at Cosa is never counted", r.every(x=>x==="PASS") && s.sent.length===0);
  s=mkSpam(true); r=[]; for(let i=0;i<8;i++) r.push(await s.run(s.message(),{isDM:true}));
  ck("ON: DMs are exempt", r.every(x=>x==="PASS"));
  s=mkSpam(true); const real=Date.now; let t=1e9; const D={now:()=>t}; const f2=async()=>{ const o=[]; for(let i=0;i<3;i++){ o.push(await s.run(s.message("slow")));} return o; };
  // slow typist: 3 messages spread over >2s each should not trip the window
  const res=[]; const spamFn=s.run; 
  for(let i=0;i<3;i++){ res.push(await (async()=>{ const msg=s.message("slow"); const ts=[]; return spamFn(msg); })()); await new Promise(r=>setTimeout(r,2100)); }
  ck("ON: normal-speed chatting (>2s apart) is never flagged", res.every(x=>x==="PASS") && s.sent.length===0, res.join());
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
