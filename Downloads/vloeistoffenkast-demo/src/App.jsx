import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
  { global: { headers: { "x-app-token": import.meta.env.VITE_APP_TOKEN } } }
);

const ls = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const dbSet = async (key, value) => {
  ls.set(key, value);
  try { await supabase.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() }); } catch {}
};

const hashPw = async (str) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
};
const isHashed = (s) => typeof s==="string" && /^[0-9a-f]{64}$/.test(s);

const migrateHashes = async (cfg) => {
  let changed=false;
  const c=JSON.parse(JSON.stringify(cfg));
  for(const acc of c.accounts||[]){
    if(!isHashed(acc.password)){acc.password=await hashPw(acc.password);changed=true;}
  }
  if(c.adminPin&&!isHashed(c.adminPin)){c.adminPin=await hashPw(c.adminPin);changed=true;}
  if(c.appName==="Vloeistoffenkast"){c.appName="Voorraadbeheer";changed=true;}
  if(changed)dbSet("vkast-cfg",c);
  return c;
};

const DEF = {
  appName: "Voorraadbeheer", location: "Ruinerwold",
  adminPin: "9999", checkAlertDays: 14, shelfAlertPct: 80,
  features: { consumptionTracking: true, emailReports: true, partialBottles: true },
  accounts: [
    { id:1, username:"medewerker-Ruinerwold", password:"123456", role:"worker",  active:true },
    { id:2, username:"Manager-Ruinerwold",    password:"654321", role:"manager", active:true },
  ],
  emails: [
    { id:1, dept:"Inkoop",     email:"inkoop@bedrijf.nl",     active:true },
    { id:2, dept:"Facilitair", email:"facilitair@bedrijf.nl", active:true },
  ],
  shelves: [
    { id:1, label:"Lekbak 1", sublabel:"Bovenste lekbak",  maxLiters:30, color:"#3D8B2E", category:"flammable", active:true, products:[
      {id:"1-1",name:"Glasreiniger",vol:0.75,target:5},{id:"1-2",name:"Ontvetter spray",vol:1.0,target:4},
      {id:"1-3",name:"Desinfectie middel",vol:1.0,target:4},{id:"1-4",name:"Badkamerreiniger",vol:2.0,target:3},{id:"1-5",name:"RVS reiniger",vol:0.5,target:5},
    ]},
    { id:2, label:"Lekbak 2", sublabel:"Middelste lekbak", maxLiters:30, color:"#5AAE3C", category:"flammable", active:true, products:[
      {id:"2-1",name:"Allesreiniger",vol:5.0,target:2},{id:"2-2",name:"Vloeibare zeep",vol:2.0,target:3},
      {id:"2-3",name:"Handzeep",vol:1.0,target:3},{id:"2-4",name:"Schuurmiddel",vol:1.0,target:3},{id:"2-5",name:"Sanitairreiniger",vol:2.0,target:2},
    ]},
    { id:3, label:"Lekbak 3", sublabel:"Derde lekbak",    maxLiters:26, color:"#78C74E", category:"corrosive", active:true, products:[
      {id:"3-1",name:"Green'r Indus",vol:5.0,target:1},{id:"3-2",name:"Green'r Hand dish",vol:1.0,target:4},
      {id:"3-3",name:"Green'r Wind",vol:0.75,target:8},{id:"3-4",name:"Green'r Easy All",vol:0.75,target:3},
      {id:"3-5",name:"Green'r Sanit",vol:0.75,target:2},{id:"3-6",name:"Green'r WC",vol:0.75,target:3},{id:"3-7",name:"Phago'derm Sensitive",vol:5.0,target:1},
    ]},
    { id:4, label:"Lekbak 4", sublabel:"Onderste lekbak", maxLiters:33, color:"#A8DE52", category:"corrosive", active:true, products:[
      {id:"4-1",name:"Keukenreiniger",vol:1.0,target:4},{id:"4-2",name:"Vetoplosser",vol:2.0,target:3},
      {id:"4-3",name:"Roestvrijstaal spray",vol:0.5,target:5},{id:"4-4",name:"Ontkalker",vol:1.0,target:3},{id:"4-5",name:"Multireiniger",vol:5.0,target:2},
    ]},
  ],
  // Normale voorraad — op stuks, geen lekbakken
  voorraad: [
    { id:"v-1", name:"WC papier",           unit:"rol",  target:48, active:true },
    { id:"v-2", name:"Handdoekrollen",      unit:"rol",  target:20, active:true },
    { id:"v-3", name:"Latex handschoenen",  unit:"doos", target:10, active:true },
    { id:"v-4", name:"Haarnetjes",          unit:"doos", target:5,  active:true },
    { id:"v-5", name:"Baardnetjes",         unit:"doos", target:5,  active:true },
  ],
};

const CAT = {
  flammable:{label:"Ontvlambaar",icon:"🔥",ghs:"GHS02",color:"#E8632A",bg:"#FDF0EB"},
  corrosive:{label:"Corrosief",icon:"⚗️",ghs:"GHS05",color:"#7C3A9A",bg:"#F5EEFF"},
};

const aSh  = (cfg) => cfg.shelves.filter(s=>s.active);
const aPr  = (sh)  => sh.products;
const defI = (cfg) => {
  const i={};
  cfg.shelves.forEach(s=>s.products.forEach(p=>{i[p.id]={full:0,partial:0};}));
  (cfg.voorraad||[]).forEach(p=>{i[p.id]={count:0};});
  return i;
};
const pL   = (p,inv) => { const s=inv[p.id]||{full:0,partial:0}; return s.full*p.vol+(s.partial>0?p.vol*s.partial/100:0); };
const shL  = (sh,inv) => aPr(sh).reduce((s,p)=>s+pL(p,inv),0);
const shP  = (sh,inv) => Math.min((shL(sh,inv)/sh.maxLiters)*100,100);
const fCol = (pct) => pct>=90?"#D44A2A":pct>=70?"#E8A020":pct>=30?"#3D8B2E":"#5AB8E8";
const uCol = (n,t) => n===0?"#3D8B2E":n/t>=1?"#D44A2A":n/t>=0.5?"#E8A020":"#F5C842";

const S = {
  card:{background:"#fff",border:"2.5px solid #C8E6B0",borderRadius:18,padding:16,boxShadow:"0 4px 16px rgba(61,139,46,0.12)",marginBottom:12},
  btn:{border:"none",borderRadius:14,cursor:"pointer",fontFamily:"Nunito,sans-serif",fontWeight:800,padding:"13px 20px",fontSize:14},
  inp:{background:"#F5FBF0",border:"2px solid #C8E6B0",borderRadius:10,padding:"10px 12px",fontFamily:"Nunito,sans-serif",fontSize:13,fontWeight:700,color:"#1A3A0A",outline:"none",width:"100%",boxSizing:"border-box"},
  lbl:{fontSize:10,fontWeight:800,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4},
};
const GF=`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');`;

function HelloFreshLogo({size=32}){
  return(
    <img src="/hellofresh-logo.svg" height={size} width={size*1.5} style={{display:"inline-block",flexShrink:0,objectFit:"contain"}} alt="HelloFresh"/>
  );
}

export default function App() {
  const [cfg,setCfg]       = useState(null);
  const [inv,setInv]       = useState(null);
  const [snaps,setSnaps]   = useState([]);
  const [loading,setLoading] = useState(true);
  const [role,setRole]     = useState(null);
  const [mgrTab,setMgrTab] = useState("status");
  const [screen,setScreen] = useState("home");
  // "home" | "open" | "shelf-N" | "voorraad"
  const [loginErr,setLoginErr] = useState("");
  const [adminPin,setAdminPin] = useState("");
  const [adminErr,setAdminErr] = useState(false);
  const [showAdmin,setShowAdmin] = useState(false);
  const [showReport,setShowReport] = useState(false);
  const [pinAttempts,setPinAttempts] = useState(0);
  const [pinLocked,setPinLocked] = useState(false);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const [{data:cd},{data:id_},{data:sd}]=await Promise.all([
          supabase.from("app_state").select("value").eq("key","vkast-cfg").single(),
          supabase.from("app_state").select("value").eq("key","vkast-inv").single(),
          supabase.from("app_state").select("value").eq("key","vkast-snap").single(),
        ]);
        if(cancelled)return;
        const raw=cd?.value||ls.get("vkast-cfg")||DEF;
        const c=await migrateHashes(raw);
        setCfg(c);
        setInv(id_?.value||ls.get("vkast-inv")||defI(c));
        setSnaps(sd?.value||ls.get("vkast-snap")||[]);
      }catch{
        if(cancelled)return;
        const raw=ls.get("vkast-cfg")||DEF;
        const c=await migrateHashes(raw);
        setCfg(c);
        setInv(ls.get("vkast-inv")||defI(c));
        setSnaps(ls.get("vkast-snap")||[]);
      }
      if(!cancelled)setLoading(false);
    })();
    const ch=supabase.channel("app_state_rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_state"},(p)=>{
        if(!p.new)return;
        const {key,value}=p.new;
        if(key==="vkast-cfg")setCfg(value);
        else if(key==="vkast-inv")setInv(value);
        else if(key==="vkast-snap")setSnaps(value);
      }).subscribe();
    return()=>{cancelled=true;supabase.removeChannel(ch);};
  },[]);

  const updateInv = useCallback((pid,field,val)=>{
    setInv(prev=>{
      const current = prev[pid] || (field==="count" ? {count:0} : {full:0,partial:0});
      const next={...prev,[pid]:{...current,[field]:val}};
      dbSet("vkast-inv",next);
      return next;
    });
  },[]);

  const saveCfg = useCallback((nc)=>{ setCfg(nc); dbSet("vkast-cfg",nc); },[]);
  const takeSnap = useCallback((label)=>{
    const snap={id:Date.now(),label,date:new Date().toISOString(),inv:JSON.parse(JSON.stringify(inv))};
    setSnaps(p=>{ const n=[snap,...p].slice(0,12); dbSet("vkast-snap",n); return n; });
  },[inv]);

  const openCab  = ()=>{ setScreen("open"); };
  const closeCab = ()=>{ setScreen("home"); };
  const activeShelf = screen.startsWith("shelf-")?aSh(cfg||DEF).find(s=>s.id===parseInt(screen.split("-")[1])):null;

  if (loading||!cfg||!inv) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F0FAE8",fontFamily:"Nunito,sans-serif"}}>
      <style>{GF}</style>
      <div style={{textAlign:"center"}}><div style={{marginBottom:12}}><HelloFreshLogo size={52}/></div><div style={{fontSize:14,fontWeight:700,color:"#8AAA7A",letterSpacing:2}}>LADEN...</div></div>
    </div>
  );

  if (showAdmin) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1A1A2E,#16213E)",fontFamily:"Nunito,sans-serif",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <style>{GF}</style>
      <Hdr cfg={cfg} isAdmin onBack={()=>{setShowAdmin(false);setAdminPin("");setAdminErr(false);}} backLabel="Terug"/>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{background:"#1A1A2E",border:"2px solid #7C5CBF",borderRadius:24,padding:32,width:"100%",maxWidth:300,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>🔧</div>
          <div style={{fontSize:20,fontWeight:900,color:"#A07EE0",marginBottom:4}}>Beheerder</div>
          <div style={{fontSize:10,color:"#5A4A7A",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>Voer PIN in</div>
          {adminErr&&<div style={{color:"#e74c3c",fontSize:12,fontWeight:700,marginBottom:10}}>Onjuiste PIN</div>}
          <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:20}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:16,height:16,borderRadius:"50%",border:`2.5px solid ${adminPin.length>i?"#7C5CBF":"#3D2A7A"}`,background:adminPin.length>i?"#7C5CBF":"transparent"}}/>)}
          </div>
          {pinLocked&&<div style={{color:"#e74c3c",fontSize:12,fontWeight:700,marginBottom:10}}>Geblokkeerd — wacht 30 seconden</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[1,2,3,4,5,6,7,8,9].map(n=>(
              <button key={n} style={{height:52,background:"#16213E",border:"2px solid #3D2A7A",borderRadius:12,color:pinLocked?"#3D2A7A":"#C0B0E8",fontFamily:"Nunito,sans-serif",fontSize:20,fontWeight:700,cursor:pinLocked?"not-allowed":"pointer"}}
                onClick={()=>{
                  if(adminPin.length>=4||pinLocked)return;
                  const nx=adminPin+n; setAdminPin(nx);
                  if(nx.length===4)setTimeout(async()=>{
                    const h=await hashPw(nx);
                    if(h===cfg.adminPin){setRole("admin");setShowAdmin(false);setAdminPin("");setAdminErr(false);setPinAttempts(0);}
                    else{const a=pinAttempts+1;setPinAttempts(a);if(a>=3){setPinLocked(true);setTimeout(()=>{setPinLocked(false);setPinAttempts(0);},30000);}setAdminErr(true);setAdminPin("");}
                  },150);
                }}>{n}</button>
            ))}
            <div/>
            <button style={{height:52,background:"#16213E",border:"2px solid #3D2A7A",borderRadius:12,color:pinLocked?"#3D2A7A":"#C0B0E8",fontFamily:"Nunito,sans-serif",fontSize:20,fontWeight:700,cursor:pinLocked?"not-allowed":"pointer"}}
              onClick={()=>{
                if(adminPin.length>=4||pinLocked)return;
                const nx=adminPin+"0"; setAdminPin(nx);
                if(nx.length===4)setTimeout(async()=>{
                  const h=await hashPw(nx);
                  if(h===cfg.adminPin){setRole("admin");setShowAdmin(false);setAdminPin("");setAdminErr(false);setPinAttempts(0);}
                  else{const a=pinAttempts+1;setPinAttempts(a);if(a>=3){setPinLocked(true);setTimeout(()=>{setPinLocked(false);setPinAttempts(0);},30000);}setAdminErr(true);setAdminPin("");}
                },150);
              }}>0</button>
            <button style={{height:52,background:"#16213E",border:"2px solid #3D2A7A",borderRadius:12,color:"#9B8EC4",fontFamily:"Nunito,sans-serif",fontSize:16,cursor:"pointer"}}
              onClick={()=>{setAdminPin(p=>p.slice(0,-1));setAdminErr(false);}}>DEL</button>
          </div>
        </div>
      </div>
      <Ftr isAdmin/>
    </div>
  );

  if (!role) {
    const accounts=(cfg.accounts||[]).filter(a=>a.active);
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0FAE8,#FEFCF4)",fontFamily:"Nunito,sans-serif",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <style>{GF}</style>
        <Hdr cfg={cfg}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",width:"100%"}}>
          <div style={{marginBottom:8}}><HelloFreshLogo size={52}/></div>
          <div style={{fontSize:24,fontWeight:900,color:"#3D8B2E",marginBottom:4}}>Welkom</div>
          <div style={{fontSize:11,color:"#8AAA7A",letterSpacing:2,textTransform:"uppercase",marginBottom:24,fontWeight:700}}>{cfg.location}</div>
          <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>
            {accounts.map(acc=>(
              <LoginCard key={acc.id} acc={acc}
                onSuccess={()=>setRole(acc.role)}
                onFail={()=>setLoginErr(acc.id)}
                hasErr={loginErr===acc.id} onClear={()=>setLoginErr("")}/>
            ))}
          </div>
          <div style={{marginTop:18,fontSize:11,color:"#8AAA7A",fontWeight:600}}>
            Beheerder?{" "}
            <button style={{background:"none",border:"none",color:"#7C5CBF",fontFamily:"Nunito,sans-serif",fontSize:11,fontWeight:800,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setShowAdmin(true)}>Klik hier</button>
          </div>
        </div>
        <Ftr/>
      </div>
    );
  }

  if (role==="admin") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1A1A2E,#0F3460)",fontFamily:"Nunito,sans-serif",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <style>{GF}</style>
      <Hdr cfg={cfg} isAdmin role="admin" onBack={()=>setRole(null)} backLabel="Uitloggen"/>
      <AdminPanel cfg={cfg} onSave={saveCfg}/>
      <Ftr isAdmin/>
    </div>
  );

  if (role==="manager") {
    const shelves=aSh(cfg);
    const vProducts=(cfg.voorraad||[]).filter(p=>p.active!==false);
    const totalOrderShelves=shelves.reduce((s,sh)=>s+aPr(sh).reduce((ss,p)=>ss+Math.max(0,p.target-(inv[p.id]||{full:0}).full),0),0);
    const totalOrderVoorraad=vProducts.reduce((s,p)=>s+Math.max(0,p.target-(inv[p.id]||{count:0}).count),0);
    const totalOrder=totalOrderShelves+totalOrderVoorraad;
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0FAE8,#FEFCF4)",fontFamily:"Nunito,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:40}}>
        <style>{GF}</style>
        <Hdr cfg={cfg} role="manager" onBack={()=>setRole(null)} backLabel="Uitloggen"/>
        <div style={{display:"flex",gap:8,width:"100%",maxWidth:440,padding:"12px 14px 0",margin:"0 auto"}}>
          {["status","verbruik"].map(t=>(
            <button key={t} onClick={()=>setMgrTab(t)}
              style={{flex:1,padding:"10px 6px",border:"2.5px solid",borderColor:mgrTab===t?"#3D8B2E":"#C8E6B0",borderRadius:12,background:mgrTab===t?"#3D8B2E":"#fff",color:mgrTab===t?"#fff":"#8AAA7A",fontFamily:"Nunito,sans-serif",fontSize:11,fontWeight:800,cursor:"pointer"}}>
              {t==="status"?"Status":"Verbruik"}
            </button>
          ))}
        </div>
        <div style={{width:"100%",maxWidth:440,padding:"14px 14px 0",margin:"0 auto"}}>
          {mgrTab==="status"&&(
            <div>
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                <div style={{flex:1,...S.card,textAlign:"center",padding:12}}>
                  <div style={{fontSize:28,fontWeight:900,color:totalOrder>0?"#E8A020":"#3D8B2E"}}>{totalOrder}</div>
                  <div style={{fontSize:9,color:"#8AAA7A",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginTop:3}}>Te bestellen</div>
                </div>
                <div style={{flex:1,...S.card,textAlign:"center",padding:12}}>
                  <div style={{fontSize:28,fontWeight:900,color:"#5AAE3C"}}>{shelves.length}</div>
                  <div style={{fontSize:9,color:"#8AAA7A",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginTop:3}}>Lekbakken</div>
                </div>
              </div>
              {cfg.features.emailReports&&(
                <button onClick={()=>setShowReport(true)}
                  style={{width:"100%",padding:"16px 20px",background:"linear-gradient(135deg,#E8632A,#D44A20)",border:"none",borderRadius:16,color:"#fff",fontFamily:"Nunito,sans-serif",fontSize:15,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:16}}>
                  <span style={{fontSize:22}}>📧</span>
                  <div><div>Maandelijkse Uitdraai</div><div style={{fontSize:10,opacity:0.85,marginTop:2}}>Bestelrapport aanmaken</div></div>
                </button>
              )}
              {shelves.map(sh=>{
                const pct=shP(sh,inv); const col=fCol(pct);
                const ord=aPr(sh).reduce((s,p)=>s+Math.max(0,p.target-(inv[p.id]||{full:0}).full),0);
                return (
                  <div key={sh.id} style={{...S.card,padding:0,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 10px",borderBottom:"2px solid #EEF9E6"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:sh.color}}/>
                        <div>
                          <div style={{fontSize:14,fontWeight:800}}>{sh.label}</div>
                          <div style={{fontSize:9,color:"#8AAA7A",fontWeight:700,marginTop:2}}>{shL(sh,inv).toFixed(1)}L / {sh.maxLiters}L · {ord>0?`${ord} te bestellen`:"op voorraad"}</div>
                          {sh.category&&CAT[sh.category]&&<div style={{fontSize:9,fontWeight:800,color:CAT[sh.category].color}}>{CAT[sh.category].icon} {CAT[sh.category].ghs}</div>}
                        </div>
                      </div>
                      <div style={{fontSize:20,fontWeight:900,color:col}}>{Math.round(pct)}%</div>
                    </div>
                    <div style={{height:6,background:"#EEF9E6"}}><div style={{height:"100%",width:`${pct}%`,background:col}}/></div>
                    <div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 60px 52px 66px",padding:"6px 14px",borderBottom:"1px solid #EEF9E6"}}>
                        {["Product","Aanwezig","Doel","Bestellen"].map(h=><div key={h} style={{fontSize:9,color:"#8AAA7A",fontWeight:800,textTransform:"uppercase",letterSpacing:1,textAlign:h!=="Product"?"right":"left"}}>{h}</div>)}
                      </div>
                      {aPr(sh).map(p=>{
                        const st=inv[p.id]||{full:0,partial:0};
                        const need=Math.max(0,p.target-st.full);
                        const uc=uCol(need,p.target);
                        const curr=st.partial>0?`${st.full}+${st.partial}%`:`${st.full}`;
                        return (
                          <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 52px 66px",padding:"9px 14px",borderBottom:"1px solid #F5FBF0",alignItems:"center"}}>
                            <div><div style={{fontSize:12,fontWeight:700}}>{p.name}</div><div style={{fontSize:9,color:"#8AAA7A"}}>{p.vol}L/fles</div></div>
                            <div style={{fontSize:13,fontWeight:800,textAlign:"right"}}>{curr}</div>
                            <div style={{fontSize:13,fontWeight:700,textAlign:"right",color:"#8AAA7A"}}>{p.target}</div>
                            <div style={{textAlign:"right"}}>
                              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:40,padding:"3px 7px",borderRadius:7,fontSize:12,fontWeight:800,border:`2px solid ${uc}66`,background:`${uc}18`,color:uc}}>{need===0?"✓":`+${need}`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Normale voorraad sectie */}
              {vProducts.length>0&&(
                <div style={{...S.card,padding:0,overflow:"hidden",borderColor:"#90B8E8"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 10px",borderBottom:"2px solid #EBF3FD",background:"linear-gradient(135deg,#EBF3FD,#F0F7FF)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:18}}>📦</span>
                      <div>
                        <div style={{fontSize:14,fontWeight:800}}>Normale Voorraad</div>
                        <div style={{fontSize:9,color:"#5A80B0",fontWeight:700,marginTop:2}}>
                          {totalOrderVoorraad>0?`${totalOrderVoorraad} stuks te bestellen`:"op voorraad"}
                        </div>
                      </div>
                    </div>
                    <div style={{fontSize:20,fontWeight:900,color:totalOrderVoorraad>0?"#E8A020":"#3D8B2E"}}>
                      {totalOrderVoorraad>0?`+${totalOrderVoorraad}`:"✓"}
                    </div>
                  </div>
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 60px 52px 66px",padding:"6px 14px",borderBottom:"1px solid #EBF3FD"}}>
                      {["Product","Aanwezig","Doel","Bestellen"].map(h=><div key={h} style={{fontSize:9,color:"#8AAA7A",fontWeight:800,textTransform:"uppercase",letterSpacing:1,textAlign:h!=="Product"?"right":"left"}}>{h}</div>)}
                    </div>
                    {vProducts.map(p=>{
                      const cnt=(inv[p.id]||{count:0}).count;
                      const need=Math.max(0,p.target-cnt);
                      const uc=uCol(need,p.target);
                      return(
                        <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 52px 66px",padding:"9px 14px",borderBottom:"1px solid #F0F7FF",alignItems:"center"}}>
                          <div><div style={{fontSize:12,fontWeight:700}}>{p.name}</div><div style={{fontSize:9,color:"#8AAA7A"}}>per {p.unit}</div></div>
                          <div style={{fontSize:13,fontWeight:800,textAlign:"right"}}>{cnt}</div>
                          <div style={{fontSize:13,fontWeight:700,textAlign:"right",color:"#8AAA7A"}}>{p.target}</div>
                          <div style={{textAlign:"right"}}>
                            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:40,padding:"3px 7px",borderRadius:7,fontSize:12,fontWeight:800,border:`2px solid ${uc}66`,background:`${uc}18`,color:uc}}>{need===0?"✓":`+${need}`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {mgrTab==="verbruik"&&cfg.features.consumptionTracking&&(
            <ConsumptionView inv={inv} snaps={snaps} setSnaps={setSnaps} onSnap={takeSnap} cfg={cfg}/>
          )}
        </div>
        {showReport&&<ReportModal cfg={cfg} inv={inv} onClose={()=>setShowReport(false)}/>}
        <Ftr/>
      </div>
    );
  }

  const wSh=aSh(cfg);
  const isVoorraad = screen==="voorraad";
  const backLabel = activeShelf ? "Kast" : (screen==="open") ? "Sluiten" : isVoorraad ? "Sluiten" : null;
  const onBack    = activeShelf ? ()=>setScreen("open")
                  : screen==="open" ? closeCab
                  : isVoorraad ? ()=>setScreen("home")
                  : null;

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0FAE8,#FEFCF4)",fontFamily:"Nunito,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:40}}>
      <style>{GF}</style>
      <Hdr cfg={cfg} role="worker" onBack={onBack} backLabel={backLabel} onSwitch={()=>setRole(null)}/>

      {/* HOME — twee kasten naast elkaar */}
      {screen==="home" && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"22px 16px 0",width:"100%",gap:20}}>
          <div style={{fontSize:12,fontWeight:700,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,textAlign:"center"}}>
            Kies een kast
          </div>
          <div style={{display:"flex",gap:14,width:"100%",maxWidth:420,justifyContent:"center",flexWrap:"wrap"}}>
            {/* Vloeistoffenkast */}
            <div onClick={openCab} style={{flex:"1 1 160px",maxWidth:200,cursor:"pointer",background:"linear-gradient(160deg,#4DA035,#3D8B2E)",border:"3px solid #2D7020",borderRadius:16,padding:"20px 16px",textAlign:"center",boxShadow:"0 8px 28px rgba(61,139,46,0.25)",transition:"transform 0.15s"}}>
              <div style={{marginBottom:8}}><HelloFreshLogo size={36}/></div>
              <div style={{fontSize:15,fontWeight:900,color:"#fff",letterSpacing:1}}>Vloeistoffenkast</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Brandbare stoffen</div>
              <div style={{marginTop:12,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                {wSh.map(sh=>{const pct=shP(sh,inv);const col=fCol(pct);return(
                  <div key={sh.id} style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"3px 7px",fontSize:9,fontWeight:800,color:col}}>
                    {sh.label} {Math.round(pct)}%
                  </div>
                );})}
              </div>
            </div>

            {/* Normale voorraad */}
            <div onClick={()=>setScreen("voorraad")} style={{flex:"1 1 160px",maxWidth:200,cursor:"pointer",background:"linear-gradient(160deg,#4A80C4,#2D5FA0)",border:"3px solid #1E4A80",borderRadius:16,padding:"20px 16px",textAlign:"center",boxShadow:"0 8px 28px rgba(45,95,160,0.25)",transition:"transform 0.15s"}}>
              <div style={{fontSize:36,marginBottom:8}}>📦</div>
              <div style={{fontSize:15,fontWeight:900,color:"#fff",letterSpacing:1}}>Normale Voorraad</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Verbruiksartikelen</div>
              <div style={{marginTop:12,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                {(cfg.voorraad||[]).map(p=>{
                  const cnt=(inv[p.id]||{count:0}).count;
                  const need=cnt<Math.ceil(p.target*0.3);
                  return(
                    <div key={p.id} style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"3px 7px",fontSize:9,fontWeight:800,color:need?"#FFB880":"rgba(255,255,255,0.7)"}}>
                      {cnt} {p.unit}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VLOEISTOFFENKAST OPEN — kies lekbak */}
      {screen==="open" && !activeShelf && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"22px 16px 0",width:"100%"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,marginBottom:18,textAlign:"center"}}>
            Kies een lekbak
          </div>
          <Cabinet shelves={wSh} inv={inv} onSelect={s=>setScreen(`shelf-${s.id}`)}/>
          <div style={{width:"100%",maxWidth:340,margin:"20px auto 0",background:"#fff",border:"2px solid #C8E6B0",borderRadius:16,padding:16,boxShadow:"0 4px 16px rgba(61,139,46,0.12)"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>Lekbak bezetting</div>
            {wSh.map(sh=>{const pct=shP(sh,inv);const col=fCol(pct);return(
              <div key={sh.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:800,width:60,color:"#4A6A3A"}}>{sh.label}</div>
                <div style={{flex:1,height:14,background:"#EEF9E6",borderRadius:8,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:8,transition:"width 0.8s"}}/>
                </div>
                <div style={{fontSize:13,fontWeight:800,color:col,width:42,textAlign:"right"}}>{Math.round(pct)}%</div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* LEKBAK DETAIL */}
      {activeShelf && <ShelfDetail shelf={activeShelf} inv={inv} onUpdate={updateInv} cfg={cfg}/>}

      {/* NORMALE VOORRAAD */}
      {isVoorraad && <VoorraadView cfg={cfg} inv={inv} onUpdate={updateInv}/>}

      <Ftr/>
    </div>
  );
}

function Hdr({cfg,role,isAdmin,onBack,backLabel,onSwitch}){
  return(
    <div style={{width:"100%",background:isAdmin?"#0D0D1A":"#3D8B2E",padding:"11px 14px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:200,boxShadow:"0 3px 14px rgba(61,139,46,0.25)",overflowX:"auto",scrollbarWidth:"none"}}>
      <span style={{flexShrink:0}}>{isAdmin?"🔧":<HelloFreshLogo size={20}/>}</span>
      <div style={{flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:900,color:"#fff",whiteSpace:"nowrap"}}>{isAdmin?"Masterfile":cfg?.appName||"Voorraadbeheer"}</div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",whiteSpace:"nowrap"}}>{cfg?.location||""}</div>
      </div>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {role&&<div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.85)",padding:"4px 8px",border:"1.5px solid rgba(255,255,255,0.3)",borderRadius:20,background:"rgba(255,255,255,0.12)",textTransform:"uppercase",whiteSpace:"nowrap"}}>{role==="admin"?"Beheerder":role==="manager"?"Manager":"Medewerker"}</div>}
        {onBack&&<button style={{background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.3)",color:"#fff",fontFamily:"Nunito,sans-serif",fontSize:11,fontWeight:700,padding:"5px 11px",borderRadius:20,cursor:"pointer",whiteSpace:"nowrap"}} onClick={onBack}>{backLabel||"Terug"}</button>}
        {!onBack&&role&&onSwitch&&<button style={{background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.3)",color:"#fff",fontFamily:"Nunito,sans-serif",fontSize:11,fontWeight:700,padding:"5px 11px",borderRadius:20,cursor:"pointer",whiteSpace:"nowrap"}} onClick={onSwitch}>Uitloggen</button>}
      </div>
    </div>
  );
}

function LoginCard({acc,onSuccess,onFail,hasErr,onClear}){
  const [pass,setPass]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [attempts,setAttempts]=useState(0);
  const [lockedUntil,setLockedUntil]=useState(0);
  const isMgr=acc.role==="manager";
  const isLocked=Date.now()<lockedUntil;

  const tryLogin=async()=>{
    if(isLocked)return;
    const h=await hashPw(pass);
    if(h===acc.password){
      onSuccess();
    } else {
      const a=attempts+1;
      setAttempts(a);
      if(a>=3){
        const until=Date.now()+30000;
        setLockedUntil(until);
        setTimeout(()=>{setAttempts(0);setLockedUntil(0);},30000);
      }
      onFail();
    }
  };

  return(
    <div style={{background:hasErr?"#FDEDEA":"#fff",border:`2.5px solid ${hasErr?"#D44A2A":isLocked?"#D44A2A44":isMgr?"#E8632A55":"#C8E6B0"}`,borderRadius:18,padding:18,boxShadow:"0 4px 16px rgba(61,139,46,0.1)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:12,borderBottom:`2px solid ${isMgr?"#E8632A22":"#EEF9E6"}`}}>
        <span style={{fontSize:28}}>{isMgr?"📊":"🧹"}</span>
        <div>
          <div style={{fontSize:15,fontWeight:900,color:isMgr?"#E8632A":"#3D8B2E"}}>{isMgr?"Manager":"Medewerker"}</div>
          <div style={{fontSize:11,fontWeight:700,color:isMgr?"#E8632A":"#3D8B2E",background:isMgr?"#FDF0EB":"#EEF9E6",border:`1.5px solid ${isMgr?"#E8632A44":"#C8E6B0"}`,borderRadius:20,padding:"2px 10px",display:"inline-block",marginTop:3}}>{acc.username}</div>
        </div>
      </div>
      {isLocked&&<div style={{background:"#FDEDEA",border:"1.5px solid #D44A2A",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:700,color:"#D44A2A",marginBottom:10}}>Geblokkeerd — wacht 30 seconden</div>}
      {!isLocked&&hasErr&&<div style={{background:"#FDEDEA",border:"1.5px solid #D44A2A",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:700,color:"#D44A2A",marginBottom:10}}>Onjuist wachtwoord{attempts>0?` (${attempts}/3)`:""}</div>}
      <label style={S.lbl}>Wachtwoord</label>
      <div style={{position:"relative",width:"100%"}}>
        <input style={{...S.inp,paddingRight:44,marginBottom:12,borderColor:hasErr?"#D44A2A":"#C8E6B0"}}
          type={showPw?"text":"password"} placeholder="Voer wachtwoord in" value={pass}
          disabled={isLocked}
          onChange={e=>{setPass(e.target.value);if(hasErr)onClear();}}
          onKeyDown={e=>e.key==="Enter"&&tryLogin()}/>
        <button style={{position:"absolute",right:12,top:"40%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#8AAA7A"}} onClick={()=>setShowPw(p=>!p)}>{showPw?"🙈":"👁"}</button>
      </div>
      <button style={{...S.btn,width:"100%",background:isLocked?"#ccc":isMgr?"linear-gradient(135deg,#E8632A,#D44A20)":"linear-gradient(135deg,#3D8B2E,#5AAE3C)",color:"#fff",letterSpacing:1,textTransform:"uppercase",cursor:isLocked?"not-allowed":"pointer"}} onClick={tryLogin} disabled={isLocked}>
        {isLocked?"Geblokkeerd...":isMgr?"Manager inloggen":"Medewerker inloggen"}
      </button>
    </div>
  );
}

function Cabinet({shelves,inv,onSelect}){
  return(
    <div style={{width:270,background:"linear-gradient(180deg,#F5FBF0,#EEF9E6)",border:"3px solid #9FCC80",borderRadius:12,boxShadow:"0 12px 40px rgba(61,139,46,0.18)",overflow:"hidden"}}>
      {shelves.map(sh=>{
        const pct=shP(sh,inv);const col=fCol(pct);
        return(
          <div key={sh.id} style={{display:"flex",alignItems:"stretch",height:84,borderBottom:"3px solid #C8E6B0",position:"relative",cursor:"pointer"}} onClick={()=>onSelect(sh)}>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${pct}%`,background:col,opacity:0.25,transition:"height 0.8s"}}/>
            <div style={{position:"relative",zIndex:2,flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"8px 10px",gap:2}}>
              <div style={{fontSize:8,letterSpacing:2,color:"#8AAA7A",fontWeight:700,textTransform:"uppercase"}}>{sh.label}</div>
              <div style={{fontSize:22,fontWeight:900,color:col,lineHeight:1}}>{Math.round(pct)}%</div>
              <div style={{fontSize:9,color:"#8AAA7A",fontWeight:600}}>{shL(sh,inv).toFixed(1)}L / {sh.maxLiters}L</div>
            </div>
            <div style={{width:13,background:"#C8E6B0",margin:"10px 11px 10px 4px",borderRadius:7,overflow:"hidden",position:"relative",zIndex:2}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${pct}%`,background:col,borderRadius:"6px 6px 0 0",transition:"height 0.8s"}}/>
            </div>
            <div style={{position:"absolute",right:7,bottom:6,fontSize:8,letterSpacing:1,color:"#8AAA7A",fontWeight:700,zIndex:2}}>TAP</div>
          </div>
        );
      })}
    </div>
  );
}

function ShelfDetail({shelf,inv,onUpdate,cfg}){
  const total=shL(shelf,inv);const pct=Math.min((total/shelf.maxLiters)*100,100);const col=fCol(pct);
  const cat=shelf.category?CAT[shelf.category]:null;
  return(
    <div style={{width:"100%",maxWidth:420,padding:"14px 14px 0",margin:"0 auto"}}>
      <div style={S.card}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,color:"#8AAA7A",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{shelf.label} · {shelf.sublabel}</div>
            <div style={{fontSize:22,fontWeight:900,color:col}}>Lekbak {shelf.id}</div>
            {cat&&<div style={{fontSize:10,fontWeight:800,color:cat.color,background:cat.bg,padding:"2px 8px",borderRadius:20,display:"inline-block",marginTop:4}}>{cat.icon} {cat.ghs} {cat.label}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontWeight:900,color:col}}>{Math.round(pct)}%</div>
            <div style={{fontSize:10,color:"#8AAA7A",fontWeight:600}}>{total.toFixed(2)}L / {shelf.maxLiters}L</div>
          </div>
        </div>
        <div style={{height:10,background:"#EEF9E6",borderRadius:6,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:6,transition:"width 0.5s"}}/>
        </div>
      </div>
      {pct>=100&&<div style={{background:"#FDEDEA",border:"2px solid #D44A2A",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:800,color:"#D44A2A",marginBottom:12}}>Maximum overschreden!</div>}
      {pct>=80&&pct<100&&<div style={{background:"#FFFBEA",border:"2px solid #F5C842",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:800,color:"#A06A00",marginBottom:12}}>Bijna vol — check voordat je bijvult</div>}
      {aPr(shelf).map(p=>{
        const st=inv[p.id]||{full:0,partial:0};
        const curL=pL(p,inv);
        const partL=st.partial>0?p.vol*st.partial/100:0;
        const remaining=shelf.maxLiters-(total-st.full*p.vol-partL);
        const maxFull=Math.min(p.target,Math.floor(remaining/p.vol));
        return(
          <div key={p.id} style={S.card}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
              <div><div style={{fontSize:14,fontWeight:800}}>{p.name}</div><div style={{fontSize:10,color:"#8AAA7A",fontWeight:600,marginTop:2}}>{p.vol}L/fles · max {p.target} stuks</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:800,color:curL>0?col:"#8AAA7A"}}>{curL.toFixed(2)}L</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{display:"flex",alignItems:"center",border:"2px solid #C8E6B0",borderRadius:12,overflow:"hidden"}}>
                  <button style={{width:44,height:44,background:"#F5FBF0",border:"none",color:"#3D8B2E",fontSize:22,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={st.full<=0} onClick={()=>onUpdate(p.id,"full",st.full-1)}>−</button>
                  <div style={{width:50,height:44,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#1A3A0A",borderLeft:"2px solid #C8E6B0",borderRight:"2px solid #C8E6B0"}}>{st.full}</div>
                  <button style={{width:44,height:44,background:"#F5FBF0",border:"none",color:"#3D8B2E",fontSize:22,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={st.full>=maxFull} onClick={()=>onUpdate(p.id,"full",st.full+1)}>+</button>
                </div>
                <span style={{fontSize:11,color:"#8AAA7A",fontWeight:700}}>vol</span>
              </div>
              {cfg.features.partialBottles!==false&&(
                <div style={{display:"flex",gap:5}}>
                  {[0,25,50,75].map(v=>{
                    const active=st.partial===v;
                    return(
                      <button key={v} style={{height:44,padding:"0 8px",background:active?"#EEF9E6":"#F5FBF0",border:`2px solid ${active?"#3D8B2E":"#C8E6B0"}`,borderRadius:10,color:active?"#3D8B2E":"#8AAA7A",fontFamily:"Nunito,sans-serif",fontSize:11,fontWeight:800,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}
                        onClick={()=>onUpdate(p.id,"partial",st.partial===v?0:v)}>
                        <span>{v===0?"--":`${v}%`}</span>
                        <span style={{fontSize:7,opacity:0.7}}>{v===0?"geen":v===25?"¼":v===50?"½":"¾"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <button style={{width:"100%",padding:11,background:"#FDEDEA",border:"2px solid #C8E6B0",color:"#D44A2A",fontFamily:"Nunito,sans-serif",fontSize:12,fontWeight:800,letterSpacing:1,borderRadius:14,cursor:"pointer",textTransform:"uppercase",marginTop:4,marginBottom:20}} onClick={()=>aPr(shelf).forEach(p=>{onUpdate(p.id,"full",0);onUpdate(p.id,"partial",0);})}>
        Lekbak leeg melden
      </button>
    </div>
  );
}

function ConsumptionView({inv,snaps,setSnaps,onSnap,cfg}){
  const [taking,setTaking]=useState(false);
  const label=new Date().toLocaleDateString("nl-NL",{month:"long",year:"numeric"});
  const hasSnaps=snaps.length>0;
  const latest=hasSnaps?snaps[0]:null;
  const calc=(snapInv)=>{
    const rows=[];
    aSh(cfg).forEach(sh=>aPr(sh).forEach(p=>{
      const b=snapInv[p.id]||{full:0,partial:0},a=inv[p.id]||{full:0,partial:0};
      const bL=b.full*p.vol+(b.partial>0?p.vol*b.partial/100:0);
      const aL=a.full*p.vol+(a.partial>0?p.vol*a.partial/100:0);
      rows.push({sh,p,used:Math.max(0,bL-aL),maxUsed:p.target*p.vol});
    }));
    return rows;
  };
  const rows=latest?calc(latest.inv):[];
  const total=rows.reduce((s,r)=>s+r.used,0);
  return(
    <div>
      <div style={{fontSize:14,fontWeight:900,color:"#3D8B2E",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Maandverbruik</div>
      <button style={{...S.btn,width:"100%",background:"linear-gradient(135deg,#3D8B2E,#5AAE3C)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:14}}
        onClick={()=>{setTaking(true);onSnap(label);setTaking(false);}}>
        <span style={{fontSize:20}}>📸</span>
        <div><div>{taking?"Opslaan...":"Maandstand vastleggen"}</div><div style={{fontSize:10,opacity:0.8,marginTop:2}}>{label}</div></div>
      </button>
      {!hasSnaps&&<div style={{...S.card,textAlign:"center",padding:28}}><div style={{fontSize:36,marginBottom:10}}>📊</div><div style={{fontSize:13,color:"#8AAA7A"}}>Druk op maandstand vastleggen aan het begin van de maand.</div></div>}
      {hasSnaps&&(
        <div style={{...S.card,padding:0,overflow:"hidden"}}>
          <div style={{background:"#EEF9E6",padding:"12px 16px",borderBottom:"2px solid #C8E6B0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,fontWeight:900,color:"#3D8B2E"}}>Verbruik t.o.v. {latest.label}</div>
            <div style={{fontSize:16,fontWeight:900,color:"#3D8B2E"}}>{total.toFixed(2)}L</div>
          </div>
          {aSh(cfg).map(sh=>{
            const shRows=rows.filter(r=>r.sh.id===sh.id&&r.used>0);
            return(
              <div key={sh.id} style={{padding:"10px 16px 4px",borderBottom:"1px solid #EEF9E6"}}>
                <div style={{fontSize:10,fontWeight:800,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:sh.color}}/>{sh.label}
                </div>
                {shRows.length===0&&<div style={{fontSize:11,color:"#8AAA7A",paddingBottom:6}}>Geen verbruik</div>}
                {shRows.map(r=>(
                  <div key={r.p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",borderBottom:"1px solid #F5FBF0"}}>
                    <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{r.p.name}</div><div style={{height:5,background:"#EEF9E6",borderRadius:3,overflow:"hidden",marginTop:3}}><div style={{height:"100%",width:`${Math.min((r.used/r.maxUsed)*100,100)}%`,background:sh.color,borderRadius:3}}/></div></div>
                    <div style={{fontSize:13,fontWeight:800,color:sh.color,flexShrink:0}}>{r.used.toFixed(2)}L</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {snaps.length>0&&(
        <div style={{...S.card,marginTop:12}}>
          <div style={{fontSize:11,fontWeight:800,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,marginBottom:10}}>Maandstanden</div>
          {snaps.map(snap=>(
            <div key={snap.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #EEF9E6"}}>
              <div><div style={{fontSize:13,fontWeight:700,color:"#4A6A3A"}}>{snap.label}</div><div style={{fontSize:10,color:"#8AAA7A",marginTop:1}}>{new Date(snap.date).toLocaleDateString("nl-NL",{day:"2-digit",month:"short"})}</div></div>
              <button style={{background:"#FDEDEA",border:"none",color:"#D44A2A",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:13}} onClick={()=>{const n=snaps.filter(s=>s.id!==snap.id);setSnaps(n);dbSet("vkast-snap",n);}}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPanel({cfg,onSave}){
  const [tab,setTab]=useState("lekbakken");
  const [local,setLocal]=useState(()=>JSON.parse(JSON.stringify(cfg)));
  const [saved,setSaved]=useState(false);
  const save=async()=>{
    const next=JSON.parse(JSON.stringify(local));
    for(const acc of next.accounts||[]){
      if(acc._newPw&&acc._newPw.trim()){acc.password=await hashPw(acc._newPw.trim());}
      delete acc._newPw;
    }
    if(next._newPin&&next._newPin.trim()){next.adminPin=await hashPw(next._newPin.trim());}
    delete next._newPin;
    onSave(next);setSaved(true);setTimeout(()=>setSaved(false),2500);
  };
  const upd=(path,val)=>{
    setLocal(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      const keys=path.split(".");let obj=next;
      keys.slice(0,-1).forEach(k=>{obj=Array.isArray(obj)?obj[parseInt(k)]:obj[k];});
      const last=keys[keys.length-1];
      if(Array.isArray(obj))obj[parseInt(last)]=val;else obj[last]=val;
      return next;
    });
  };
  const TABS=[{id:"lekbakken",l:"Lekbakken"},{id:"producten",l:"Producten"},{id:"email",l:"E-mail"},{id:"accounts",l:"Accounts"},{id:"instellingen",l:"Instellingen"}];
  const ac={background:"rgba(255,255,255,0.05)",border:"1.5px solid #3D2A7A",borderRadius:12,padding:14,marginBottom:10};
  const ai={background:"#0D0D1A",border:"1.5px solid #3D2A7A",borderRadius:9,color:"#E0D8F8",fontFamily:"Nunito,sans-serif",fontSize:13,fontWeight:700,padding:"8px 10px",outline:"none",width:"100%"};
  const al={fontSize:9,fontWeight:800,color:"#7B6A9B",textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4};
  const sv={...S.btn,width:"100%",background:"linear-gradient(135deg,#7C5CBF,#5A3A9F)",color:"#fff",letterSpacing:1};
  return(
    <div style={{width:"100%"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,width:"100%",maxWidth:460,padding:"12px 14px 0",margin:"0 auto"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"1 1 60px",minWidth:60,padding:"9px 6px",border:`2px solid ${tab===t.id?"#7C5CBF":"#3D2A7A"}`,borderRadius:10,background:tab===t.id?"#7C5CBF":"#16213E",color:tab===t.id?"#fff":"#9B8EC4",fontFamily:"Nunito,sans-serif",fontSize:10,fontWeight:800,cursor:"pointer"}}>{t.l}</button>)}
      </div>
      <div style={{width:"100%",maxWidth:460,padding:"14px 14px 0",margin:"0 auto"}}>
        {tab==="lekbakken"&&<div>
          {local.shelves.map((sh,si)=><div key={sh.id} style={ac}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:sh.color,flexShrink:0}}/>
              <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <input style={ai} value={sh.label} onChange={e=>upd(`shelves.${si}.label`,e.target.value)}/>
                <input style={ai} value={sh.sublabel} onChange={e=>upd(`shelves.${si}.sublabel`,e.target.value)}/>
              </div>
              <button style={{background:"none",border:`1.5px solid ${sh.active?"#2A5A1A":"#5A1A1A"}`,color:sh.active?"#7FE060":"#CC6666",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:11,fontWeight:800}} onClick={()=>upd(`shelves.${si}.active`,!sh.active)}>{sh.active?"AAN":"UIT"}</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 60px",gap:8}}>
              <div><label style={al}>Max liters</label><input style={{...ai,width:"100%"}} type="number" value={sh.maxLiters} onChange={e=>upd(`shelves.${si}.maxLiters`,parseFloat(e.target.value)||10)}/></div>
              <div><label style={al}>Kleur</label><input type="color" value={sh.color} style={{width:"100%",height:36,border:"none",background:"transparent",cursor:"pointer"}} onChange={e=>upd(`shelves.${si}.color`,e.target.value)}/></div>
            </div>
          </div>)}
          <button style={sv} onClick={save}>{saved?"Opgeslagen!":"Opslaan"}</button>
        </div>}
        {tab==="producten"&&<div>
          {local.shelves.map((sh,si)=><div key={sh.id} style={{...ac,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:"#A07EE0",marginBottom:10}}>{sh.label}</div>
            {sh.products.map((p,pi)=><div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 60px auto",gap:6,alignItems:"center",padding:"6px 0",borderBottom:"1px solid #1A1040"}}>
              <input style={ai} value={p.name} onChange={e=>upd(`shelves.${si}.products.${pi}.name`,e.target.value)}/>
              <input style={{...ai,textAlign:"center"}} type="number" value={p.vol} min={0.1} step={0.25} onChange={e=>upd(`shelves.${si}.products.${pi}.vol`,parseFloat(e.target.value)||0.5)}/>
              <input style={{...ai,textAlign:"center"}} type="number" value={p.target} min={1} onChange={e=>upd(`shelves.${si}.products.${pi}.target`,parseInt(e.target.value)||1)}/>
              <button style={{background:"none",border:"1.5px solid #5A1A1A",color:"#CC6666",borderRadius:7,width:28,height:28,cursor:"pointer"}} onClick={()=>{const n=JSON.parse(JSON.stringify(local));n.shelves[si].products.splice(pi,1);setLocal(n);}}>×</button>
            </div>)}
            <button style={{...S.btn,width:"100%",background:"transparent",border:"1.5px dashed #3D2A7A",color:"#7C5CBF",fontSize:11,marginTop:8,padding:8}} onClick={()=>{const n=JSON.parse(JSON.stringify(local));n.shelves[si].products.push({id:`${sh.id}-${Date.now()}`,name:"Nieuw product",vol:1.0,target:3});setLocal(n);}}>+ Product</button>
          </div>)}
          <button style={sv} onClick={save}>{saved?"Opgeslagen!":"Opslaan"}</button>
        </div>}
        {tab==="email"&&<div>
          <div style={ac}>
            {local.emails.map((em,ei)=><div key={em.id} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
              <input style={{...ai,width:80}} value={em.dept} onChange={e=>upd(`emails.${ei}.dept`,e.target.value)}/>
              <input style={{...ai,flex:1}} value={em.email} type="email" onChange={e=>upd(`emails.${ei}.email`,e.target.value)}/>
              <button style={{background:"none",border:"1.5px solid #5A1A1A",color:"#CC6666",borderRadius:7,width:28,height:28,cursor:"pointer"}} onClick={()=>{const n=JSON.parse(JSON.stringify(local));n.emails.splice(ei,1);setLocal(n);}}>×</button>
            </div>)}
            <button style={{...S.btn,width:"100%",background:"transparent",border:"1.5px dashed #3D2A7A",color:"#7C5CBF",fontSize:12,padding:9,marginTop:4}} onClick={()=>setLocal(p=>({...p,emails:[...p.emails,{id:Date.now(),dept:"Afdeling",email:"",active:true}]}))}>+ Ontvanger</button>
          </div>
          <button style={sv} onClick={save}>{saved?"Opgeslagen!":"Opslaan"}</button>
        </div>}
        {tab==="accounts"&&<div>
          {(local.accounts||[]).map((acc,ai_)=><div key={acc.id} style={ac}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:20}}>{acc.role==="manager"?"📊":"🧹"}</span>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:800,color:"#C0B0E8"}}>{acc.username}</div></div>
              <button style={{background:"none",border:"1.5px solid #5A1A1A",color:"#CC6666",borderRadius:7,width:28,height:28,cursor:"pointer"}} onClick={()=>{const n=JSON.parse(JSON.stringify(local));n.accounts.splice(ai_,1);setLocal(n);}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div><label style={al}>Gebruikersnaam</label><input style={ai} value={acc.username} onChange={e=>upd(`accounts.${ai_}.username`,e.target.value)}/></div>
              <div><label style={al}>Nieuw wachtwoord</label><input style={ai} type="password" placeholder="Laat leeg = ongewijzigd" value={acc._newPw||""} onChange={e=>upd(`accounts.${ai_}._newPw`,e.target.value)}/></div>
            </div>
          </div>)}
          <button style={{...S.btn,width:"100%",background:"transparent",border:"1.5px dashed #3D2A7A",color:"#7C5CBF",fontSize:12,marginBottom:10,padding:9}} onClick={()=>setLocal(p=>({...p,accounts:[...(p.accounts||[]),{id:Date.now(),username:"nieuw",password:"wachtwoord",role:"worker",active:true}]}))}>+ Account</button>
          <button style={sv} onClick={save}>{saved?"Opgeslagen!":"Opslaan"}</button>
        </div>}
        {tab==="instellingen"&&<div>
          <div style={ac}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={al}>App naam</label><input style={ai} value={local.appName} onChange={e=>upd("appName",e.target.value)}/></div>
              <div><label style={al}>Locatie</label><input style={ai} value={local.location} onChange={e=>upd("location",e.target.value)}/></div>
            </div>
            <div><label style={al}>Nieuwe PIN (4 cijfers)</label><input style={{...ai,width:"50%"}} type="password" placeholder="Laat leeg = ongewijzigd" value={local._newPin||""} onChange={e=>upd("_newPin",e.target.value.replace(/\D/g,"").slice(0,4))}/></div>
          </div>
          <button style={sv} onClick={save}>{saved?"Opgeslagen!":"Opslaan"}</button>
        </div>}
        {saved&&<div style={{color:"#7FE060",fontSize:12,fontWeight:800,textAlign:"center",letterSpacing:1,marginTop:8}}>✓ Opgeslagen</div>}
      </div>
    </div>
  );
}

function ReportModal({cfg,inv,onClose}){
  const [copied,setCopied]=useState(false);
  const emails=(cfg.emails||[]).filter(e=>e.active&&e.email.includes("@"));
  const lines=[`${cfg.appName.toUpperCase()} — BESTELRAPPORTAGE`,`Datum: ${new Date().toLocaleDateString("nl-NL",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}`,`Locatie: ${cfg.location}`,""];
  let total=0;
  aSh(cfg).forEach(sh=>{
    lines.push(`${sh.label} (${shL(sh,inv).toFixed(1)}L / ${sh.maxLiters}L)`);
    aPr(sh).forEach(p=>{
      const s=inv[p.id]||{full:0,partial:0};const need=Math.max(0,p.target-s.full);total+=need;
      const curr=s.partial>0?`${s.full}+${s.partial}%`:`${s.full}`;
      lines.push(`  ${p.name.padEnd(24)} ${curr.padEnd(8)} doel:${p.target}  ${need>0?`+${need} flessen`:"ok"}`);
    });lines.push("");
  });
  const vp=(cfg.voorraad||[]).filter(p=>p.active!==false);
  if(vp.length>0){
    lines.push("NORMALE VOORRAAD");
    vp.forEach(p=>{
      const cnt=(inv[p.id]||{count:0}).count;const need=Math.max(0,p.target-cnt);total+=need;
      const mv=p.unit==="rol"?"rollen":p.unit==="doos"?"dozen":`${p.unit}s`;
      lines.push(`  ${p.name.padEnd(24)} ${String(cnt).padEnd(8)} doel:${p.target}  ${need>0?`+${need} ${mv}`:"ok"}`);
    });
    lines.push("");
  }
  lines.push(`TOTAAL TE BESTELLEN: ${total}`);
  const report=lines.join("\n");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(30,90,15,0.55)",zIndex:500,display:"flex",flexDirection:"column",alignItems:"center",overflowY:"auto",backdropFilter:"blur(3px)"}}>
      <div style={{width:"100%",maxWidth:480,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
        <div style={{background:"#3D8B2E",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0}}>
          <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>Maandelijkse Uitdraai</div>
          <button style={{background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.3)",color:"#fff",fontSize:16,width:36,height:36,borderRadius:10,cursor:"pointer",fontWeight:700}} onClick={onClose}>×</button>
        </div>
        <div style={{flex:1,padding:16,background:"linear-gradient(160deg,#F0FAE8,#FEFCF4)"}}>
          <div style={{background:total>0?"#FFFBEA":"#EEF9E6",border:`2px solid ${total>0?"#F5C842":"#9FCC80"}`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:28}}>{total>0?"📦":"🎉"}</span>
            <div style={{fontSize:14,fontWeight:900,color:total>0?"#A06A00":"#3D8B2E"}}>{total>0?`${total} producten bijbestellen`:"Alle voorraden op peil!"}</div>
          </div>
          <div style={{...S.card,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:"#8AAA7A",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Ontvangers ({emails.length})</div>
            {emails.length===0&&<div style={{fontSize:12,color:"#8AAA7A"}}>Geen ontvangers. Stel in via Beheerder.</div>}
            {emails.map(e=><div key={e.id} style={{fontSize:12,fontWeight:700,color:"#4A6A3A",padding:"4px 0"}}>📬 {e.dept} — {e.email}</div>)}
          </div>
          <textarea readOnly value={report} style={{width:"100%",height:200,background:"#F5FBF0",border:"2px solid #C8E6B0",borderRadius:10,padding:12,fontFamily:"monospace",fontSize:10,color:"#4A6A3A",lineHeight:1.7,resize:"none",outline:"none",marginBottom:12}}/>
          <button style={{...S.btn,width:"100%",background:"linear-gradient(135deg,#E8632A,#D44A20)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:10,opacity:emails.length===0?0.5:1,cursor:emails.length===0?"not-allowed":"pointer"}}
            onClick={()=>{const to=emails.map(e=>e.email).join(",");const subj=encodeURIComponent(`${cfg.appName} — Bestelrapport`);window.location.href=`mailto:${to}?subject=${subj}&body=${encodeURIComponent(report)}`;}} disabled={emails.length===0}>
            <span style={{fontSize:20}}>📧</span> Verstuur per e-mail
          </button>
          <button style={{...S.btn,width:"100%",background:"#fff",border:"2.5px solid #C8E6B0",color:copied?"#3D8B2E":"#4A6A3A",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}
            onClick={async()=>{try{await navigator.clipboard.writeText(report);}catch{}setCopied(true);setTimeout(()=>setCopied(false),2500);}}>
            {copied?"✅ Gekopieerd!":"⧉ Kopieer rapport"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoorraadView({cfg,inv,onUpdate}){
  const products=(cfg.voorraad||[]).filter(p=>p.active!==false);
  const totalNeed=products.reduce((s,p)=>s+Math.max(0,p.target-(inv[p.id]||{count:0}).count),0);
  return(
    <div style={{width:"100%",maxWidth:420,padding:"14px 14px 0",margin:"0 auto"}}>
      {/* Header */}
      <div style={{...S.card,background:"linear-gradient(135deg,#EBF3FD,#F0F7FF)",borderColor:"#90B8E8"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontSize:10,color:"#5A80B0",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Normale Voorraad</div>
            <div style={{fontSize:22,fontWeight:900,color:"#2D5FA0"}}>📦 Verbruiksartikelen</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:900,color:totalNeed>0?"#E8A020":"#3D8B2E"}}>{totalNeed}</div>
            <div style={{fontSize:10,color:"#8AAA7A",fontWeight:600}}>te bestellen</div>
          </div>
        </div>
        <div style={{height:8,background:"#D8E8F8",borderRadius:5,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${products.length>0?Math.round((products.filter(p=>(inv[p.id]||{count:0}).count>=p.target).length/products.length)*100):0}%`,background:"#3D8B2E",borderRadius:5,transition:"width 0.5s"}}/>
        </div>
        <div style={{fontSize:10,color:"#5A80B0",fontWeight:600,marginTop:6}}>
          {products.filter(p=>(inv[p.id]||{count:0}).count>=p.target).length} van {products.length} producten op doelstelling
        </div>
      </div>

      {/* Products */}
      {products.map(p=>{
        const cnt=(inv[p.id]||{count:0}).count;
        const need=Math.max(0,p.target-cnt);
        const pct=Math.min((cnt/p.target)*100,100);
        const col=pct>=80?"#3D8B2E":pct>=40?"#E8A020":"#D44A2A";
        return(
          <div key={p.id} style={S.card}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:15,fontWeight:800}}>{p.name}</div>
                <div style={{fontSize:10,color:"#8AAA7A",fontWeight:600,marginTop:2}}>per {p.unit} · doel: {p.target} {p.unit}{p.target!==1?"s":""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:15,fontWeight:800,color:col}}>{cnt}</div>
                <div style={{fontSize:10,color:"#8AAA7A",fontWeight:600}}>{p.unit}{cnt!==1?"s":""}</div>
              </div>
            </div>
            <div style={{height:8,background:"#EEF9E6",borderRadius:5,overflow:"hidden",marginBottom:12}}>
              <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:5,transition:"width 0.4s"}}/>
            </div>
            {need>0&&<div style={{fontSize:11,fontWeight:700,color:"#E8632A",marginBottom:10}}>⚠ {need} {p.unit}{need!==1?"s":""} bijbestellen</div>}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",border:"2px solid #C8E6B0",borderRadius:12,overflow:"hidden"}}>
                <button style={{width:44,height:44,background:"#F5FBF0",border:"none",color:"#3D8B2E",fontSize:22,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                  disabled={cnt<=0}
                  onClick={()=>onUpdate(p.id,"count",cnt-1)}>−</button>
                <div style={{width:54,height:44,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#1A3A0A",borderLeft:"2px solid #C8E6B0",borderRight:"2px solid #C8E6B0"}}>{cnt}</div>
                <button style={{width:44,height:44,background:"#F5FBF0",border:"none",color:"#3D8B2E",fontSize:22,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                  onClick={()=>onUpdate(p.id,"count",cnt+1)}>+</button>
              </div>
              <span style={{fontSize:11,color:"#8AAA7A",fontWeight:700}}>{p.unit}{cnt!==1?"s":""} aanwezig</span>
            </div>
          </div>
        );
      })}

      <button style={{width:"100%",padding:11,background:"#EBF3FD",border:"2px solid #90B8E8",color:"#2D5FA0",fontFamily:"Nunito,sans-serif",fontSize:12,fontWeight:800,letterSpacing:1,borderRadius:14,cursor:"pointer",textTransform:"uppercase",marginTop:4,marginBottom:20}}
        onClick={()=>products.forEach(p=>onUpdate(p.id,"count",0))}>
        Voorraad leeg melden
      </button>
    </div>
  );
}

function Ftr({isAdmin}){
  return(
    <div style={{width:"100%",padding:"13px 20px 16px",marginTop:28,borderTop:`2px solid ${isAdmin?"#3D2A7A":"#C8E6B0"}`,background:isAdmin?"#16213E":"linear-gradient(180deg,#F5FBF0,#fff)",textAlign:"center"}}>
      <div style={{fontSize:11,fontWeight:600,color:isAdmin?"#5A4A7A":"#8AAA7A",lineHeight:1.6}}>2026 Leroy Evertse — Alle rechten voorbehouden.</div>
    </div>
  );
}
