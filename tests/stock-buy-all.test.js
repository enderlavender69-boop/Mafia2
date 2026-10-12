const fs=require("fs"), vm=require("vm");
const src=fs.readFileSync(require("path").join(__dirname, "..", "features.js"),"utf8");
const a=src.indexOf("async function buyStock(");
const b=src.indexOf("\nasync function sellStock(", a);
const code=src.slice(a,b);
function run(wallet, shares, price=250){
  const deducted=[]; let saved=null;
  const eco={
    toBigIntSafe:(v)=>{ if(v==null)return 0n; if(typeof v==="bigint")return v; if(typeof v==="number")return Number.isFinite(v)?BigInt(Math.trunc(v)):0n;
      if(typeof v==="string"){const s=v.trim(); if(/^-?\d+$/.test(s))return BigInt(s); const f=parseFloat(s); return Number.isFinite(f)?BigInt(Math.trunc(f)):0n;} return 0n;},
    getWallet:async()=>({copper:wallet}), fmt:x=>String(x), formatWallet:x=>String(x), fromCopper:x=>x,
    deductCopper:async(u,amt)=>{ if(BigInt(amt)>BigInt(wallet)) return null; deducted.push(amt); return {}; }, addCopper:async()=>({}),
  };
  const stockPortfolios=new Map([["u",{}]]); const avgBuyPrice=new Map();
  const ctx={ eco, STOCKS:{TITAN:{name:"Titan"}}, stockPrices:{TITAN:price}, stockMarketOpen:true, stockPortfolios, avgBuyPrice,
    marketPressure:{}, savePortfolio:async()=>true, logStockTransaction:async(...a)=>{saved=a;}, supabase:{}, console, BigInt, Number, Math, Object, JSON };
  vm.createContext(ctx);
  vm.runInContext(code+";globalThis.f=buyStock;",ctx);
  return ctx.f("u","TITAN",shares).then(r=>({r,deducted,saved,pf:stockPortfolios.get("u")}));
}
let pass=0,fail=0; const ck=(n,c,e="")=>{ if(c){pass++;console.log("  PASS",n)}else{fail++;console.log("  FAIL",n,e)} };
(async()=>{
  let o=await run("1000","all",250);
  ck('"all" with 1000 cash @250 buys exactly 4 shares', o.pf.TITAN===4 && o.deducted[0]==="1000", JSON.stringify(o.pf)+o.deducted);
  o=await run("1099","all",250);
  ck('"all" never overspends (1099 @250 -> 4 shares, 1000 spent)', o.pf.TITAN===4 && o.deducted[0]==="1000");
  o=await run("249","all",250);
  ck('"all" with too little cash -> friendly message, nothing charged', /can't afford/i.test(o.r) && o.deducted.length===0, o.r);
  o=await run("0","all",250);
  ck('"all" with zero cash -> friendly message', /can't afford/i.test(o.r) && o.deducted.length===0);
  o=await run("999999999999999999999999","all",250);
  ck('"all" with a huge balance stays exact/BigInt-safe', o.pf.TITAN>0 && typeof o.r==="string" && /BOUGHT/.test(o.r), o.r);
  o=await run("1000","ALL ",250);
  ck('"ALL " (case/whitespace) accepted', o.pf.TITAN===4);
  o=await run("1000",3,250);
  ck("numeric buy unchanged: 3 shares", o.pf.TITAN===3 && o.deducted[0]==="750");
  o=await run("1000",0,250);
  ck("numeric 0 still rejected", /at least 1/i.test(o.r));
  o=await run("1000",5,250);
  ck("numeric buy you can't afford still rejected", /You need/i.test(o.r) && o.deducted.length===0, o.r);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
