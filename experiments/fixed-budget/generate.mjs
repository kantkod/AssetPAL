// Frozen development corpus from the 2026-09-30 evaluation. Not a new holdout.
// Generation is byte-checked against the original corpus hash by run.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { signClaim, verifyClaim } from '../../provenance.js';
import { projectToTorus } from '../../torus.js';
const cfg = JSON.parse(fs.readFileSync(new URL('../../default.json', import.meta.url)));
function rng(seed){let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const domains=['LOGISTICS','EDUCATION','ENERGY','PROCUREMENT','FACILITIES','RESEARCH'];
const subjects=['storage_limit','assessment_period','inspection_interval','approval_ceiling','booking_window','sample_retention','delivery_allowance','review_cycle','safety_margin','service_interval','access_duration','reporting_deadline'];
const modes=['plain','spoof_clones','spoof_varied','spoof_multi','signed_compromised'];
const sizes=[1,2,5,10,20];
function world(w){
 const r=rng(20260930+w*104729), pick=a=>a[Math.floor(r()*a.length)], int=(a,b)=>a+Math.floor(r()*(b-a+1));
 const domain=domains[w%6],subject=subjects[Math.floor(w/6)%12]+'_'+String(w).padStart(3,'0');
 const scope={region:pick(['NORTH','SOUTH','WEST']),tier:pick(['STANDARD','PLUS']),product:pick(['X','Y'])};
 const outside={...scope,region:scope.region==='NORTH'?'SOUTH':'NORTH'};
 const wildcard={region:'*',tier:'*',product:'*'};
 const now=int(100,250),updateTs=now-int(5,30),oldTs=updateTs-int(60,150);
 const values=shuffle(['limit_'+int(5,29),'limit_'+int(31,60),'limit_'+int(61,90),'limit_'+int(91,120)],r);
 const [oldValue,newValue,falseValue,otherValue]=values;
 const authority='Authority_'+w, handbook='Handbook_'+w;
 const reliabilityOld=.75+r()*.20,reliabilityNew=.80+r()*.19;
 let docN=0;
 function doc(source,value,timestamp,rel,sc,text,valid=true,sub=subject){
  const id=`w${w}_d${docN++}`;
  const c={domain,subject:sub,value,timestamp,source,reliability:rel,scope:sc,docId:id,theta:projectToTorus(domain,sub)};
  c.sig=valid?signClaim(c,cfg.seed):'00000000000000000000000000000000';
  return {id,domain,text,source,timestamp,reliability:rel,claims:[c]};
 }
 const queryText=(sc)=>[
  `What is the current ${subject} policy for ${sc.region} ${sc.tier} ${sc.product}?`,
  `Which ${subject} rule applies to ${sc.region} ${sc.product} ${sc.tier} today?`,
  `Find the applicable ${subject} limit in ${sc.region} for ${sc.tier} product ${sc.product}`
 ][w%3];
 const prose=(v,sc,variant)=>[
  `${domain} ${subject} policy states ${v}. Applies to ${sc.region} ${sc.tier} ${sc.product}. Current operational guidance and policy register.`,
  `For ${domain}, the applicable ${subject} rule is ${v}. Coverage ${sc.region} ${sc.tier} ${sc.product}. Approved operational instructions.`,
  `${subject} limit ${v} for product ${sc.product}, tier ${sc.tier}, region ${sc.region}. ${domain} current policy reference.`
 ][variant%3];
 const old=doc(handbook,oldValue,oldTs,reliabilityOld,wildcard,prose(oldValue,wildcard,w));
 const fresh=doc(authority,newValue,updateTs,reliabilityNew,scope,prose(newValue,scope,w+1));
 const irrelevantScope=doc('Branch_'+w,otherValue,now-2,.80+r()*.19,outside,prose(otherValue,outside,w+2));
 const noise=Array.from({length:8},(_,i)=>doc('Archive_'+w+'_'+i,'reference_'+i,oldTs+i,.5,wildcard,`${domain} office records maintenance reference ${i} historical operational guidance`,true,'unrelated_'+i));
 const base=[old,fresh,irrelevantScope,...noise];
 const cases=[];
 function add(family,docs,expected,support,sc=scope,ts=now,size=0){
  const q={id:`w${w}_${family}_${size}`,domain,subject,question:queryText(sc),scope:sc,nowTs:ts,expected};
  cases.push({world:w,family,size,q,docs:shuffle(docs,r),support});
 }
 add('clean_current',base,newValue,[fresh.id]);
 // Out-of-scope reference has its own newer scoped rule: remove it so the
 // declared old wildcard policy is the only applicable authoritative rule.
 add('clean_outscope',[old,fresh,...noise],oldValue,[old.id],outside);
 add('before_update',[old,...noise],oldValue,[old.id],scope,updateTs-1);
 const conflictTs=now-1,confRel=.85+r()*.13;
 const c1=doc('Board_'+w,newValue,conflictTs,confRel,scope,prose(newValue,scope,w));
 const c2=doc('Audit_'+w,otherValue,conflictTs,confRel,scope,prose(otherValue,scope,w));
 add('hard_conflict',[old,c1,c2,...noise],'CONFLICT',[c1.id,c2.id]);
 const witness=doc('Auditor_'+w,newValue,updateTs,reliabilityNew,scope,prose(newValue,scope,w+2));
 add('corroborated',[old,fresh,witness,...noise],newValue,[fresh.id,witness.id]);
 // One supporting witness suffices for a non-conflict answer (OR semantics).
 const stale=doc(handbook,oldValue,oldTs+1,reliabilityOld,wildcard,queryText(scope)+' '+domain+' archived copy '+oldValue);
 add('stale_distractor',[...base,stale],newValue,[fresh.id]);
 const attackLag=int(0,3),claimRel=.85+r()*.14,lowRel=.35+r()*.30;
 for(const mode of modes){
  const attacks=[];
  for(let i=0;i<20;i++){
   const varied=mode==='spoof_varied'||mode==='spoof_multi';
   const ts=now-attackLag-(varied?(i%7):0);
   const source=mode==='plain'?'Community_'+w:mode==='spoof_multi'?'Authority_alias_'+w+'_'+i:mode==='signed_compromised'?'CompromisedBulletin_'+w:authority;
   const rel=mode==='plain'?lowRel:varied?Math.max(.65,claimRel-(i%5)*.045):claimRel;
   // Shared false value, changing wording and optionally date/identity; no
   // FALSE prefix or attack label enters text or structured semantic values.
   const text=(w%3===0?queryText(scope)+' '+domain+' ':prose(falseValue,scope,w+i))+' '+['confirmed bulletin','revised guidance','policy clarification','operational notice'][i%4]+' '+falseValue;
   attacks.push(doc(source,falseValue,ts,rel,scope,text,mode==='plain'||mode==='signed_compromised'));
  }
  for(const size of sizes)add(mode,[...base,...attacks.slice(0,size)],newValue,[fresh.id],scope,now,size);
 }
 return cases;
}

function sufficient(c,docs){const ids=new Set(docs.map(x=>x.id));return c.q.expected==='CONFLICT'?c.support.every(x=>ids.has(x)):c.support.some(x=>ids.has(x));}
function verifyCases(cases){
 assert.equal(cases.length,7440);assert.equal(new Set(cases.map(c=>c.q.id)).size,7440);
 for(const c of cases){
  assert(c.docs.length>=6);assert(sufficient(c,c.docs));
  assert(c.docs.every(d=>d.timestamp<=c.q.nowTs));
  assert(c.docs.filter(d=>c.support.includes(d.id)).every(d=>d.claims[0].value===c.q.expected||c.q.expected==='CONFLICT'));
  for(const d of c.docs){const shouldVerify=!c.family.startsWith('spoof')||!d.source.startsWith('Authority')||d.claims[0].value===c.q.expected;
   // Test actual provenance contract using recorded zero tag, independent of labels.
   assert.equal(verifyClaim(d.claims[0],cfg.seed),d.claims[0].sig!=='00000000000000000000000000000000');
  }
 }
}


export function generateCases() {
  const cases = Array.from({length:240}, (_, w) => world(w)).flat();
  verifyCases(cases);
  return cases;
}
