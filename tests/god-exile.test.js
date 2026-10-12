const fs=require("fs"), vm=require("vm");
const src=fs.readFileSync(require("path").join(__dirname, "..", "index.js"),"utf8");
const a=src.indexOf("async function executeGodAction(");
const b=src.indexOf("// ── Multi-action batch executor", a);
const code=src.slice(a,b);
let pass=0,fail=0; const ck=(n,c,e="")=>{ if(c){pass++;console.log("  PASS",n)}else{fail++;console.log("  FAIL",n,e)} };
(async()=>{
  const log=[]; const sent=[];
  const ctx={ MASTER_ID:"MASTER", console:{log(){},error:(...x)=>log.push(x.join(" "))},
    exileUser: async (g,id)=>{ log.push("exiled:"+id); return `⛓️ <@${id}> has been exiled.`; },
    unexileUser: async (g,id)=>{ log.push("unexiled:"+id); return `✅ <@${id}> unexiled.`; } };
  vm.createContext(ctx); vm.runInContext(code+";globalThis.f=executeGodAction;",ctx);
  const adminCh={ send: async (m)=>{ sent.push(m); return {}; } };
  let r=await ctx.f({action:"exile_god",userId:"42"},{},adminCh);
  ck('exile_god now executes (was "Unknown command.")', r!=="Unknown command." && /exiled/.test(r) && log.includes("exiled:42"), r);
  ck("exile is written to the god-mode audit log channel", sent.some(m=>/exiled by Mr.EnderLavender/.test(m)), JSON.stringify(sent));
  r=await ctx.f({action:"unexile_god",userId:"42"},{},adminCh);
  ck('unexile_god now executes', /unexiled/.test(r) && log.includes("unexiled:42"), r);
  r=await ctx.f({action:"exile_god",userId:"MASTER"},{},adminCh);
  ck("exiling the Don is still rejected", /never act against/.test(r) && !log.includes("exiled:MASTER"), r);
  r=await ctx.f({action:"exile_god",userId:"7"},{},null);
  ck("no admin channel configured -> no crash (the old ReferenceError class of bug)", /exiled/.test(r), r);
  r=await ctx.f({action:"totally_made_up"},{},adminCh);
  ck('genuinely unknown actions still say "Unknown command."', r==="Unknown command.", r);
  const ec=src.indexOf("async function executeMasterCommand(");
  const ecEnd=src.indexOf("\nasync function ", ec+10);
  const body=src.slice(ec, ecEnd>0?ecEnd:undefined);
  ck("dead/broken exile_god cases are gone from executeMasterCommand", !/case "exile_god"/.test(body) && !/case "unexile_god"/.test(body));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
