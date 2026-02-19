/* ═══════════════════════════════════════════
   SimEHR v3 — data.js
   Clinical brain: timing, pharmacology, rules,
   scenario scripts, result generators
   ═══════════════════════════════════════════ */
const SCHEMA_VERSION=3;
const rr=(a,b,d=1)=>+(a+Math.random()*(b-a)).toFixed(d);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).substr(2,5);

/* ─── VARIABLE TIMING (ms at 1x) ───
   Each value is [min, max] — randomized per order.
   Represents REAL variability: sometimes lab is fast,
   sometimes backed up. Imaging has longer variance. */
const SIM_TIMING={
  lab:{
    STAT:   {sign:[2e3,4e3],collect:[5e3,12e3],process:[15e3,30e3],result:[25e3,50e3]},
    Urgent: {sign:[3e3,5e3],collect:[10e3,18e3],process:[25e3,45e3],result:[40e3,70e3]},
    Routine:{sign:[4e3,8e3],collect:[15e3,30e3],process:[40e3,70e3],result:[60e3,120e3]},
  },
  imaging:{
    STAT:   {sign:[2e3,4e3],schedule:[8e3,15e3],inProgress:[20e3,45e3],result:[35e3,70e3]},
    Urgent: {sign:[3e3,5e3],schedule:[15e3,30e3],inProgress:[30e3,60e3],result:[50e3,100e3]},
    Routine:{sign:[4e3,8e3],schedule:[25e3,50e3],inProgress:[50e3,90e3],result:[80e3,150e3]},
  },
  diagnostic:{
    STAT:   {sign:[2e3,3e3],perform:[5e3,12e3],interpret:[12e3,25e3],result:[20e3,40e3]},
    Urgent: {sign:[3e3,5e3],perform:[10e3,20e3],interpret:[20e3,35e3],result:[30e3,55e3]},
    Routine:{sign:[4e3,7e3],perform:[15e3,30e3],interpret:[25e3,45e3],result:[40e3,70e3]},
  },
  medication:{
    STAT:   {sign:[1e3,3e3],verify:[5e3,10e3],dispense:[10e3,18e3],ready:[14e3,22e3]},
    Urgent: {sign:[2e3,4e3],verify:[8e3,15e3],dispense:[18e3,30e3],ready:[22e3,38e3]},
    Routine:{sign:[3e3,6e3],verify:[15e3,25e3],dispense:[30e3,50e3],ready:[40e3,65e3]},
  },
  nursing:{
    STAT:   {sign:[1e3,2e3],ack:[3e3,6e3],complete:[8e3,18e3]},
    Urgent: {sign:[2e3,4e3],ack:[5e3,10e3],complete:[15e3,30e3]},
    Routine:{sign:[3e3,6e3],ack:[8e3,15e3],complete:[25e3,45e3]},
  },
};

/* ─── RANDOM DELAY EVENTS ───
   These can fire at any time and add delay to ALL pending orders
   of a category. Simulates real ER chaos. */
const DELAY_EVENTS=[
  {cat:"lab",msg:"🔬 Lab is backed up — expect 30-60 min additional delay on routine labs",prob:0.08,delayMs:[20e3,40e3]},
  {cat:"lab",msg:"🔬 Phlebotomy short-staffed — specimen collection delayed",prob:0.06,delayMs:[10e3,25e3]},
  {cat:"imaging",msg:"📡 CT scanner down for maintenance — CT orders delayed 45+ min",prob:0.05,delayMs:[30e3,60e3]},
  {cat:"imaging",msg:"📡 Multiple traumas in queue — imaging backed up",prob:0.07,delayMs:[15e3,35e3]},
  {cat:"imaging",msg:"📡 Radiology attending reviewing — preliminary read delayed",prob:0.06,delayMs:[10e3,20e3]},
  {cat:"medication",msg:"💊 Pharmacy verifying high-risk medication — additional delay",prob:0.05,delayMs:[8e3,18e3]},
  {cat:"medication",msg:"💊 Pyxis machine down — nurse retrieving from main pharmacy",prob:0.04,delayMs:[12e3,25e3]},
  {cat:"lab",msg:"🔬 Hemolyzed specimen — redraw required (auto-reordered)",prob:0.04,delayMs:[25e3,45e3],isRedraw:true},
  {cat:"lab",msg:"🔬 Lab instrument calibration in progress — results delayed",prob:0.03,delayMs:[15e3,30e3]},
];

/* ─── PHARMACOLOGY ENGINE ───
   Each med entry: onset (ms), peak (ms), duration (ms), effects on vitals.
   Effects are DELTA values applied gradually over onset→peak→duration.
   Multiple meds stack. Negative values decrease, positive increase. */
const PHARMACOLOGY={
  // Analgesics
  "Morphine 4mg IV":{onset:3e3,peak:15e3,dur:90e3,fx:{hr:-8,sbp:-12,dbp:-6,rr:-3,pain:-4},warn:"Monitor for respiratory depression. Hold if RR < 10."},
  "Fentanyl 50mcg IV":{onset:2e3,peak:8e3,dur:45e3,fx:{hr:-5,sbp:-8,dbp:-4,rr:-3,pain:-5},warn:"Rapid onset. Monitor respiratory status."},
  "Ketorolac 30mg IV":{onset:8e3,peak:30e3,dur:120e3,fx:{pain:-3},warn:"Avoid in renal impairment, GI bleed risk. Max 5 days."},
  "Acetaminophen 1000mg":{onset:10e3,peak:40e3,dur:150e3,fx:{temp:-1.2,pain:-2},warn:"Max 4g/day. Check for hepatic impairment."},
  // Cardiac
  "Metoprolol 5mg IV":{onset:3e3,peak:12e3,dur:120e3,fx:{hr:-18,sbp:-15,dbp:-8},warn:"Hold if HR<60 or SBP<100. Monitor for bronchospasm in asthmatics."},
  "Nitroglycerin 0.4mg SL":{onset:2e3,peak:5e3,dur:20e3,fx:{sbp:-20,dbp:-12,pain:-3},warn:"Contraindicated if SBP<90 or if PDE5 inhibitor used in 24-48hr."},
  "Aspirin 325mg PO":{onset:15e3,peak:40e3,dur:600e3,fx:{},warn:"Give immediately in ACS. Check for allergy/bleeding."},
  "Heparin bolus IV":{onset:2e3,peak:5e3,dur:60e3,fx:{},warn:"Weight-based dosing. Check baseline PTT. Monitor for HIT."},
  "Heparin drip IV":{onset:5e3,peak:20e3,dur:999e3,fx:{},warn:"Titrate to PTT 60-80 sec. Check PTT q6h after initiation."},
  // Pressors
  "Norepinephrine IV":{onset:2e3,peak:8e3,dur:999e3,fx:{sbp:25,dbp:15,hr:5},warn:"Central line preferred. Titrate to MAP≥65. Monitor for extravasation."},
  "Epinephrine 0.3mg IM":{onset:2e3,peak:5e3,dur:15e3,fx:{hr:25,sbp:35,dbp:15},warn:"Anaphylaxis dose. May repeat q5-15min."},
  // Respiratory
  "Albuterol 2.5mg neb":{onset:3e3,peak:15e3,dur:90e3,fx:{hr:8,spo2:3},warn:"May cause tachycardia and tremor. Monitor K+."},
  "Methylprednisolone 125mg IV":{onset:15e3,peak:60e3,dur:300e3,fx:{spo2:1},warn:"Monitor glucose. Not immediate onset — takes hours for full effect."},
  // Antibiotics (no direct vitals effect but clinical importance)
  "Ceftriaxone 2g IV":{onset:10e3,peak:30e3,dur:600e3,fx:{},warn:"Give within 1hr of sepsis recognition. Check allergies — cross-reactivity with PCN ~1%."},
  "Azithromycin 500mg IV":{onset:10e3,peak:30e3,dur:600e3,fx:{},warn:"QTc prolongation risk. Monitor with telemetry."},
  "Piperacillin-Tazobactam 4.5g IV":{onset:10e3,peak:30e3,dur:180e3,fx:{},warn:"β-lactam — check penicillin allergy. Dose-adjust for renal impairment."},
  "Meropenem 1g IV":{onset:10e3,peak:30e3,dur:240e3,fx:{},warn:"Carbapenem — reserve for resistant organisms. Low cross-reactivity with PCN."},
  "Vancomycin 1g IV":{onset:15e3,peak:45e3,dur:360e3,fx:{},warn:"Infuse over ≥60min to avoid Red Man Syndrome. Trough levels needed."},
  // Sedatives/Reversal
  "Lorazepam 1mg IV":{onset:3e3,peak:10e3,dur:120e3,fx:{hr:-5,rr:-2,sbp:-8},warn:"Respiratory depression risk. Have flumazenil available."},
  "Naloxone 0.4mg IV":{onset:2e3,peak:5e3,dur:30e3,fx:{rr:6,hr:10},warn:"Short duration — may need repeat doses. Monitor for withdrawal."},
  // Fluids
  "Normal Saline 1000mL IV bolus":{onset:5e3,peak:20e3,dur:120e3,fx:{sbp:10,dbp:5,hr:-5},warn:"Monitor for fluid overload in CHF patients. Reassess after each bolus."},
  "Lactated Ringer's 1000mL IV bolus":{onset:5e3,peak:20e3,dur:120e3,fx:{sbp:10,dbp:5,hr:-5},warn:"Preferred in sepsis resuscitation."},
  "Furosemide 40mg IV":{onset:5e3,peak:20e3,dur:120e3,fx:{sbp:-10,dbp:-5},warn:"Monitor K+, Mg+. May worsen renal function."},
  // Antiemetic
  "Ondansetron 4mg IV":{onset:5e3,peak:15e3,dur:120e3,fx:{},warn:"QTc prolongation. Max 16mg/day."},
};

/* ─── CLINICAL RULES ENGINE ───
   Checks run on every order placement.
   Returns {ok:bool, type:"error"|"warning"|"info", msg:string} */
const CLINICAL_RULES=[
  // Allergy checks
  {check:(order,pt)=>{
    const name=order.name.toLowerCase();
    for(const a of pt.allergies){
      const ag=a.agent.toLowerCase();
      // Direct match
      if(name.includes(ag)) return{ok:false,type:"error",msg:`⛔ ALLERGY ALERT: Patient allergic to ${a.agent} (${a.rxn}). Order blocked.`,block:true};
      // Cross-reactivity: penicillin → cephalosporins
      if(ag==="penicillin"&&(name.includes("cefazolin")||name.includes("ceftriaxone")||name.includes("cephalexin")))
        return{ok:false,type:"warning",msg:`⚠ CROSS-REACTIVITY: Patient has Penicillin allergy (${a.rxn}). Cephalosporin ordered — ~1-2% cross-reactivity risk. Proceed with caution. Consider carbapenem alternative.`};
      if(ag==="penicillin"&&(name.includes("piperacillin")||name.includes("amoxicillin")||name.includes("ampicillin")))
        return{ok:false,type:"error",msg:`⛔ ALLERGY: Patient allergic to ${a.agent} — ${order.name} is a penicillin-class antibiotic. Order blocked.`,block:true};
      // Vancomycin + Red Man
      if(ag==="vancomycin"&&name.includes("vancomycin"))
        return{ok:false,type:"error",msg:`⛔ ALLERGY: Patient has Vancomycin allergy (${a.rxn}). Consider linezolid or daptomycin alternative.`,block:true};
      // Sulfa
      if(ag==="sulfa"&&(name.includes("sulfamethoxazole")||name.includes("bactrim")||name.includes("tmp-smx")))
        return{ok:false,type:"error",msg:`⛔ ALLERGY: Patient allergic to Sulfa drugs. Order blocked.`,block:true};
    }
    return null;
  }},
  // Renal dosing
  {check:(order,pt)=>{
    if(!pt._creatinine) return null;
    const cr=pt._creatinine;
    const name=order.name.toLowerCase();
    if(cr>1.5&&name.includes("ketorolac"))return{ok:false,type:"error",msg:`⛔ CONTRAINDICATED: Ketorolac with Creatinine ${cr} (renal impairment). Use acetaminophen instead.`,block:true};
    if(cr>2.0&&name.includes("metformin"))return{ok:false,type:"warning",msg:`⚠ Metformin may be contraindicated with Cr ${cr}. Risk of lactic acidosis.`};
    if(cr>1.5&&(name.includes("meropenem")||name.includes("vancomycin")))return{ok:false,type:"warning",msg:`⚠ DOSE ADJUSTMENT: ${order.name} — patient has renal impairment (Cr ${cr}). Verify dose.`};
    return null;
  }},
  // Hypotension checks
  {check:(order,pt)=>{
    const v=pt.vitals[pt.vitals.length-1];if(!v)return null;
    const sbp=parseInt(v.bp.split("/")[0]);
    const name=order.name.toLowerCase();
    if(sbp<90&&name.includes("nitroglycerin"))return{ok:false,type:"error",msg:`⛔ CONTRAINDICATED: Nitroglycerin with SBP ${sbp}. Patient is hypotensive.`,block:true};
    if(sbp<90&&name.includes("metoprolol"))return{ok:false,type:"error",msg:`⛔ HOLD: Metoprolol with SBP ${sbp}. Will worsen hypotension.`,block:true};
    if(sbp<100&&name.includes("furosemide"))return{ok:false,type:"warning",msg:`⚠ Caution: Furosemide with SBP ${sbp}. May worsen hypotension.`};
    if(sbp<90&&name.includes("lisinopril"))return{ok:false,type:"error",msg:`⛔ HOLD: ACE inhibitor with SBP ${sbp}.`,block:true};
    return null;
  }},
  // Bradycardia checks
  {check:(order,pt)=>{
    const v=pt.vitals[pt.vitals.length-1];if(!v)return null;
    if(v.hr<60&&order.name.toLowerCase().includes("metoprolol"))return{ok:false,type:"error",msg:`⛔ HOLD: Beta-blocker with HR ${v.hr}. Risk of symptomatic bradycardia.`,block:true};
    return null;
  }},
  // Respiratory depression
  {check:(order,pt)=>{
    const v=pt.vitals[pt.vitals.length-1];if(!v)return null;
    if(v.rr<10&&(order.name.toLowerCase().includes("morphine")||order.name.toLowerCase().includes("fentanyl")||order.name.toLowerCase().includes("lorazepam")))
      return{ok:false,type:"error",msg:`⛔ HOLD: Respiratory depressant with RR ${v.rr}. Consider naloxone if opioid-related.`,block:true};
    return null;
  }},
  // CHF + fluids
  {check:(order,pt)=>{
    if(!pt.problems.some(p=>p.toLowerCase().includes("chf")||p.toLowerCase().includes("heart failure")))return null;
    const name=order.name.toLowerCase();
    if(name.includes("saline")&&name.includes("bolus")||name.includes("ringer")&&name.includes("bolus"))
      return{ok:false,type:"warning",msg:`⚠ CAUTION: IV fluid bolus in patient with CHF (${pt.problems.find(p=>p.toLowerCase().includes("chf")||p.toLowerCase().includes("heart failure"))}). Risk of pulmonary edema. Consider smaller volumes or pressors.`};
    return null;
  }},
  // Duplicate order
  {check:(order,pt,existingOrders)=>{
    if(!existingOrders)return null;
    const dup=existingOrders.find(o=>o.name===order.name&&!o.cancelled&&!o.resulted&&(Date.now()-o.placedAt)<180000);
    if(dup)return{ok:false,type:"warning",msg:`⚠ DUPLICATE: ${order.name} was already ordered ${Math.round((Date.now()-dup.placedAt)/1000)}s ago. Are you sure?`};
    return null;
  }},
];

/* ─── SCENARIO EVENTS ───
   Timed + conditional events per patient. These fire as the sim runs.
   type: "page" (nurse pages you), "callback" (consult calls back),
         "deterioration" (patient worsens), "update" (lab/status update),
         "reminder" (clinical reminder if action not taken) */
const SCENARIO_EVENTS={
  P1:[ // Elena Martinez — NSTEMI
    {id:"e1",delay:15e3,type:"page",from:"RN Sarah",msg:"Dr., patient is asking for more pain medication. Current pain 8/10. She's getting anxious. Last vitals: HR 102, BP 168/94.",cond:null},
    {id:"e2",delay:30e3,type:"reminder",msg:"⏰ REMINDER: Serial Troponin due. If initial troponin was positive, repeat troponin should be ordered q3-6h to trend.",cond:(pt,orders)=>!orders.some(o=>o.resultKey==="trop"&&!o.cancelled)},
    {id:"e3",delay:45e3,type:"page",from:"RN Sarah",msg:"BP still elevated 165/92. Patient diaphoretic. Are we giving nitro or metoprolol? Cardiology is going to ask what we've started.",cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("metoprolol")||o.name.toLowerCase().includes("nitroglycerin"))},
    {id:"e4",delay:60e3,type:"callback",from:"Cardiology Fellow (Dr. Patel)",msg:"Hey, I got the consult for your NSTEMI. Troponin 0.42 — is it trending? Did you start heparin and dual antiplatelet? We'd like serial trops q3h, and if the next one is rising we'll probably take her to the cath lab. Make sure she's on tele and has a type & screen. What's her GFR — may need to adjust contrast protocol.",cond:null},
    {id:"e5",delay:90e3,type:"deterioration",msg:"⚠ PATIENT DETERIORATING: Elena is now having 9/10 chest pain with new diaphoresis. EKG shows deeper ST depression. HR 110, BP 178/96.",vitalChanges:{hr:110,sbp:178,dbp:96,pain:9},cond:(pt,orders)=>{
      const hasBB=orders.some(o=>(o.name.toLowerCase().includes("metoprolol")||o.name.toLowerCase().includes("heparin"))&&!o.cancelled);
      return!hasBB; // deteriorates if no beta-blocker or anticoagulation started
    }},
    {id:"e6",delay:120e3,type:"page",from:"RN Sarah",msg:"Glucose came back 224. Should I give insulin? She's on metformin at home but NPO now. Also her creatinine was 1.4 — nephro flag per protocol.",cond:null},
    {id:"e7",delay:70e3,type:"page",from:"Charge RN",msg:"Bay 12 nurse is asking about tele monitoring order. Patient is cardiac but I don't see telemetry ordered.",cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("telemetry")&&!o.cancelled)},
    {id:"e8",delay:50e3,type:"reminder",msg:"⏰ Have you ordered an EKG? Standard workup for chest pain includes 12-lead EKG within 10 minutes of arrival.",cond:(pt,orders)=>!orders.some(o=>o.resultKey==="ekg"&&!o.cancelled)},
  ],
  P2:[ // Marcus Johnson — Colles Fracture
    {id:"e1",delay:12e3,type:"page",from:"RN Mike",msg:"Patient requesting pain medication. He's splinted but pain is 9/10. He's allergic to codeine (nausea) — what analgesic do you want?",cond:null},
    {id:"e2",delay:35e3,type:"callback",from:"Ortho Resident (Dr. Kim)",msg:"Got your consult for the Colles fracture. I'm looking at the films — it's pretty displaced, probably needs ORIF. Is he NPO? When was his last meal? We'll need a type & screen, CBC, BMP, and pre-op EKG since he's 40. Any blood thinners? Can you get consent for procedural sedation for reduction in the meantime?",cond:null},
    {id:"e3",delay:55e3,type:"page",from:"RN Mike",msg:"Hey doc, this patient's tetanus status is unknown and he has an open laceration. Should I give Tdap? Also the laceration needs to be irrigated and closed — do you want to do it or should I set up a suture tray?",cond:null},
    {id:"e4",delay:25e3,type:"reminder",msg:"⏰ Fracture with skin break — has antibiotic prophylaxis been ordered? Cefazolin 2g IV is standard for open fracture prophylaxis.",cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("cefazolin")&&!o.cancelled)},
    {id:"e5",delay:80e3,type:"page",from:"RN Mike",msg:"Patient's girlfriend is here asking about the plan. She's anxious. Also he says he ate a sandwich about 2 hours ago — ortho will want to know for anesthesia.",cond:null},
  ],
  P3:[ // Lisa Chen — Pneumonia/COPD
    {id:"e1",delay:10e3,type:"page",from:"RN Diana",msg:"SpO2 dropped to 86% on 2L NC. She's using accessory muscles and can barely finish sentences. Should I increase O2? She's getting agitated.",cond:null},
    {id:"e2",delay:25e3,type:"reminder",msg:"⏰ SEPSIS ALERT: This patient meets SIRS criteria (Temp 101.8, HR 108, RR 28, WBC pending). SEP-1 bundle: Lactate, blood cultures, and antibiotics within 1 hour.",cond:(pt,orders)=>{
      const hasAbx=orders.some(o=>(o.name.toLowerCase().includes("ceftriaxone")||o.name.toLowerCase().includes("azithromycin")||o.name.toLowerCase().includes("piperacillin"))&&!o.cancelled);
      const hasBCx=orders.some(o=>o.resultKey==="bcx"&&!o.cancelled);
      const hasLactate=orders.some(o=>o.resultKey==="lactate"&&!o.cancelled);
      return !(hasAbx&&hasBCx&&hasLactate);
    }},
    {id:"e3",delay:45e3,type:"deterioration",msg:"⚠ WORSENING: Lisa's SpO2 88% on 4L NC. RR 30. Becoming more confused. ABG shows respiratory acidosis. Consider BiPAP or escalation.",vitalChanges:{spo2:88,rr:30,hr:112},cond:(pt,orders)=>{
      const hasNeb=orders.some(o=>o.name.toLowerCase().includes("albuterol")&&!o.cancelled);
      const hasSteroid=orders.some(o=>o.name.toLowerCase().includes("methylprednisolone")&&!o.cancelled);
      return !(hasNeb&&hasSteroid);
    }},
    {id:"e4",delay:60e3,type:"callback",from:"Pulm/CC Fellow (Dr. Rivera)",msg:"Got the consult on your COPD exacerbation with pneumonia. Sounds like she may need ICU if she doesn't improve on BiPAP. Has she gotten steroids and nebs? What's her lactate? Procal? I'd get an ABG if you haven't already. If she tires out we may need to intubate — have RT on standby.",cond:null},
    {id:"e5",delay:35e3,type:"page",from:"RN Diana",msg:"Respiratory therapy is here and asking what nebulizer treatments are ordered. I don't see albuterol or ipratropium in the system yet.",cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("albuterol")&&!o.cancelled)},
    {id:"e6",delay:75e3,type:"page",from:"RN Diana",msg:"Blood cultures drawn. Should I put in a second IV for the antibiotics? She only has one 20g in the hand.",cond:null},
    {id:"e7",delay:20e3,type:"page",from:"Infection Control",msg:"Heads up — this patient is on droplet precautions. Influenza/COVID PCR has been ordered per protocol. Please ensure proper PPE for all staff entering the room.",cond:null},
  ],
  P4:[ // Robert Williams — Septic Shock
    {id:"e1",delay:8e3,type:"page",from:"ICU RN Janelle",msg:"MAP is 53 on norepinephrine 0.1 mcg/kg/min. Should I titrate up? He's on 30mL/hr maintenance fluids. Last lactate was 4.6 — repeat hasn't been ordered yet.",cond:null},
    {id:"e2",delay:20e3,type:"page",from:"ICU RN Janelle",msg:"Family is at bedside — his daughter is asking to speak with the doctor about prognosis and code status. She's very emotional. When can you come by?",cond:null},
    {id:"e3",delay:35e3,type:"reminder",msg:"⏰ SEP-1 BUNDLE: Repeat lactate should be ordered within 6 hours if initial lactate >2. Current lactate 4.6. Have antibiotics been verified and administered?",cond:(pt,orders)=>{
      const hasRepeatLactate=orders.filter(o=>o.resultKey==="lactate"&&!o.cancelled).length>=1;
      return !hasRepeatLactate;
    }},
    {id:"e4",delay:50e3,type:"deterioration",msg:"⚠ CRITICAL: Robert's MAP dropped to 48. Norepinephrine at max dose 0.3 mcg/kg/min. Consider adding vasopressin or stress-dose hydrocortisone. Urine output <0.5 mL/kg/hr × 2hrs.",vitalChanges:{sbp:72,dbp:42,hr:125,spo2:91},cond:(pt,orders)=>{
      const hasHydro=orders.some(o=>o.name.toLowerCase().includes("hydrocortisone")&&!o.cancelled);
      return !hasHydro;
    }},
    {id:"e5",delay:70e3,type:"callback",from:"ID Attending (Dr. Okonkwo)",msg:"Reviewed the case — UTI-source septic shock in an 81yo with recurrent UTIs. Meropenem is a good choice given his history. I'd add a repeat UA with culture sensitivity when it comes back. Watch for C. diff given broad spectrum. Any concern for endocarditis given the sustained bacteremia? Consider echo if cultures remain positive at 48h.",cond:null},
    {id:"e6",delay:40e3,type:"page",from:"ICU RN Janelle",msg:"Apixaban is on his home med list — it's been held since admission but wanted to confirm. Also, Cr is 2.8 up from baseline 1.8 — should we consult nephro for the AKI?",cond:null},
    {id:"e7",delay:100e3,type:"page",from:"Lab",msg:"🔬 CRITICAL VALUE CALL: Blood culture at 18 hours growing gram-negative rods. Preliminary identification: E. coli. Final sensitivities pending.",cond:null},
  ],
};

/* ─── ADMISSION CALLBACKS ───
   When user tries to admit, the admitting team responds contextually */
const ADMIT_CALLBACKS={
  P1:{
    service:"Cardiology",
    acceptMsg:"Cardiology accepting. Dr. Patel will be the admitting fellow. We'll take her to the CCU pending cath in the morning. Please make sure heparin drip is running and titrated, serial trops are ordered, and she stays NPO after midnight. We'll need the EKG, troponin trend, and echocardiogram results. Good catch on the NSTEMI.",
    rejectConditions:[
      {cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("heparin")&&!o.cancelled),msg:"Cardiology says: We need anticoagulation started before we accept. Please initiate heparin bolus and drip."},
      {cond:(pt,orders)=>!orders.some(o=>o.resultKey==="trop"&&!o.cancelled),msg:"Cardiology says: We need to see troponin trend before accepting. Please order serial troponins."},
    ],
    delayMs:[8e3,15e3],
  },
  P2:{
    service:"Orthopedics",
    acceptMsg:"Ortho accepting for ORIF in the morning. Dr. Kim will staff. Please keep NPO, continue pain management, make sure pre-op labs (CBC, BMP, T&S, coags) and pre-op EKG are ordered. Cefazolin prophylaxis is good. We'll plan OR for 7AM if the schedule holds.",
    rejectConditions:[
      {cond:(pt,orders)=>!orders.some(o=>o.resultKey==="ts"&&!o.cancelled),msg:"Ortho says: We need Type & Screen ordered before we can schedule OR. Please add."},
    ],
    delayMs:[10e3,20e3],
  },
  P3:{
    service:"Pulmonology/Critical Care",
    acceptMsg:"Pulm/CC accepting to MICU. Dr. Rivera is the attending. Please continue current antibiotics, nebs, steroids. We'll reassess BiPAP vs intubation on arrival. Make sure an ABG is sent and RT is aware. Good sepsis workup.",
    rejectConditions:[
      {cond:(pt,orders)=>{
        const hasAbx=orders.some(o=>(o.name.toLowerCase().includes("ceftriaxone")||o.name.toLowerCase().includes("azithromycin"))&&!o.cancelled);
        return !hasAbx;
      },msg:"Pulm/CC says: We need antibiotics started before transfer. This patient meets sepsis criteria — please initiate empiric coverage."},
      {cond:(pt,orders)=>!orders.some(o=>o.name.toLowerCase().includes("albuterol")&&!o.cancelled),msg:"Pulm/CC says: Has the patient received any bronchodilator therapy? Please start albuterol nebs before transfer."},
    ],
    delayMs:[12e3,18e3],
  },
  P4:{
    service:"Already in ICU",
    acceptMsg:null, // Already admitted
    rejectConditions:[],
    delayMs:[5e3,8e3],
  },
};

/* ─── ORDER CATALOG ─── */
const ORDER_CATALOG=[
  // Labs
  {id:"L1",name:"CBC with Differential",cat:"lab",sub:"Hematology",rk:"cbc"},
  {id:"L2",name:"Comprehensive Metabolic Panel",cat:"lab",sub:"Chemistry",rk:"cmp"},
  {id:"L3",name:"Basic Metabolic Panel",cat:"lab",sub:"Chemistry",rk:"bmp"},
  {id:"L4",name:"Troponin I",cat:"lab",sub:"Cardiac",rk:"trop"},
  {id:"L5",name:"BNP",cat:"lab",sub:"Cardiac",rk:"bnp"},
  {id:"L6",name:"PT/INR",cat:"lab",sub:"Coagulation",rk:"ptinr"},
  {id:"L7",name:"PTT",cat:"lab",sub:"Coagulation",rk:"ptt"},
  {id:"L8",name:"Urinalysis",cat:"lab",sub:"Urine",rk:"ua"},
  {id:"L9",name:"Blood Culture x2",cat:"lab",sub:"Micro",rk:"bcx"},
  {id:"L10",name:"Lactate",cat:"lab",sub:"Chemistry",rk:"lactate"},
  {id:"L11",name:"Procalcitonin",cat:"lab",sub:"Chemistry",rk:"procal"},
  {id:"L12",name:"Lipase",cat:"lab",sub:"Chemistry",rk:"lipase"},
  {id:"L13",name:"D-Dimer",cat:"lab",sub:"Coagulation",rk:"ddimer"},
  {id:"L14",name:"Type and Screen",cat:"lab",sub:"Blood Bank",rk:"ts"},
  {id:"L15",name:"Urine Drug Screen",cat:"lab",sub:"Toxicology",rk:"uds"},
  {id:"L16",name:"Magnesium",cat:"lab",sub:"Chemistry",rk:"mag"},
  {id:"L17",name:"Phosphorus",cat:"lab",sub:"Chemistry",rk:"phos"},
  {id:"L18",name:"ABG (Arterial Blood Gas)",cat:"lab",sub:"Chemistry",rk:"abg"},
  {id:"L19",name:"VBG (Venous Blood Gas)",cat:"lab",sub:"Chemistry",rk:"vbg"},
  {id:"L20",name:"Fibrinogen",cat:"lab",sub:"Coagulation",rk:"fib"},
  {id:"L21",name:"CRP",cat:"lab",sub:"Chemistry",rk:"crp"},
  {id:"L22",name:"ESR",cat:"lab",sub:"Hematology",rk:"esr"},
  {id:"L23",name:"HbA1c",cat:"lab",sub:"Chemistry",rk:"a1c"},
  {id:"L24",name:"TSH",cat:"lab",sub:"Endocrine",rk:"tsh"},
  {id:"L25",name:"Urine Culture",cat:"lab",sub:"Micro",rk:"ucx"},
  {id:"L26",name:"Ammonia",cat:"lab",sub:"Chemistry",rk:"ammonia"},
  // Imaging
  {id:"I1",name:"CXR PA/Lateral",cat:"imaging",sub:"X-Ray",rk:"cxr"},
  {id:"I2",name:"CT Head w/o Contrast",cat:"imaging",sub:"CT",rk:"cthead"},
  {id:"I3",name:"CT Abdomen/Pelvis w/ Contrast",cat:"imaging",sub:"CT",rk:"ctap"},
  {id:"I4",name:"CT Angiography Chest (PE Protocol)",cat:"imaging",sub:"CT",rk:"ctape"},
  {id:"I5",name:"XR Extremity 2-view",cat:"imaging",sub:"X-Ray",rk:"xrext"},
  {id:"I6",name:"Ultrasound RUQ",cat:"imaging",sub:"US",rk:"usruq"},
  {id:"I7",name:"CT Coronary Angiography",cat:"imaging",sub:"CT",rk:"ctca"},
  {id:"I8",name:"US FAST Exam",cat:"imaging",sub:"US",rk:"fast"},
  // Diagnostic
  {id:"D1",name:"EKG 12-Lead",cat:"diagnostic",sub:"Cardiac",rk:"ekg"},
  {id:"D2",name:"Bedside Echocardiogram",cat:"diagnostic",sub:"Cardiac",rk:"echo"},
  // Medications
  {id:"M1",name:"Normal Saline 1000mL IV bolus",cat:"medication",sub:"IV Fluids"},
  {id:"M2",name:"Lactated Ringer's 1000mL IV bolus",cat:"medication",sub:"IV Fluids"},
  {id:"M3",name:"Morphine 4mg IV q4h PRN pain",cat:"medication",sub:"Analgesic"},
  {id:"M4",name:"Fentanyl 50mcg IV q1h PRN pain",cat:"medication",sub:"Analgesic"},
  {id:"M5",name:"Ketorolac 30mg IV x1",cat:"medication",sub:"Analgesic"},
  {id:"M6",name:"Acetaminophen 1000mg PO/IV q6h PRN",cat:"medication",sub:"Analgesic"},
  {id:"M7",name:"Ondansetron 4mg IV q6h PRN nausea",cat:"medication",sub:"Antiemetic"},
  {id:"M8",name:"Ceftriaxone 2g IV daily",cat:"medication",sub:"Antibiotic"},
  {id:"M9",name:"Azithromycin 500mg IV daily",cat:"medication",sub:"Antibiotic"},
  {id:"M10",name:"Piperacillin-Tazobactam 4.5g IV q6h",cat:"medication",sub:"Antibiotic"},
  {id:"M11",name:"Vancomycin 1g IV q12h",cat:"medication",sub:"Antibiotic"},
  {id:"M12",name:"Meropenem 1g IV q8h",cat:"medication",sub:"Antibiotic"},
  {id:"M13",name:"Metoprolol 5mg IV q5min x3 PRN",cat:"medication",sub:"Cardiac"},
  {id:"M14",name:"Nitroglycerin 0.4mg SL PRN chest pain",cat:"medication",sub:"Cardiac"},
  {id:"M15",name:"Aspirin 325mg PO STAT",cat:"medication",sub:"Cardiac"},
  {id:"M16",name:"Heparin 60 units/kg IV bolus",cat:"medication",sub:"Anticoag"},
  {id:"M17",name:"Heparin drip 12 units/kg/hr IV",cat:"medication",sub:"Anticoag"},
  {id:"M18",name:"Norepinephrine 0.1mcg/kg/min IV",cat:"medication",sub:"Pressor"},
  {id:"M19",name:"Albuterol 2.5mg nebulizer q4h+PRN",cat:"medication",sub:"Respiratory"},
  {id:"M20",name:"Methylprednisolone 125mg IV",cat:"medication",sub:"Steroid"},
  {id:"M21",name:"Furosemide 40mg IV STAT",cat:"medication",sub:"Diuretic"},
  {id:"M22",name:"Lorazepam 1mg IV PRN anxiety/seizure",cat:"medication",sub:"Sedative"},
  {id:"M23",name:"Naloxone 0.4mg IV/IM PRN",cat:"medication",sub:"Reversal"},
  {id:"M24",name:"Epinephrine 0.3mg IM (anaphylaxis)",cat:"medication",sub:"Emergency"},
  {id:"M25",name:"Hydrocortisone 100mg IV q8h",cat:"medication",sub:"Steroid"},
  {id:"M26",name:"Cefazolin 2g IV STAT (pre-op)",cat:"medication",sub:"Antibiotic"},
  {id:"M27",name:"Insulin Regular 5 units IV STAT",cat:"medication",sub:"Endocrine"},
  // Nursing
  {id:"N1",name:"Continuous Pulse Oximetry",cat:"nursing",sub:"Monitoring"},
  {id:"N2",name:"Telemetry Monitoring",cat:"nursing",sub:"Monitoring"},
  {id:"N3",name:"Strict I&O",cat:"nursing",sub:"Assessment"},
  {id:"N4",name:"Fall Precautions",cat:"nursing",sub:"Safety"},
  {id:"N5",name:"NPO",cat:"nursing",sub:"Diet"},
  {id:"N6",name:"Foley Catheter Insertion",cat:"nursing",sub:"Procedure"},
  {id:"N7",name:"Vitals q15min x4 then q1h",cat:"nursing",sub:"Monitoring"},
  {id:"N8",name:"Neuro checks q1h",cat:"nursing",sub:"Assessment"},
  {id:"N9",name:"2L Nasal Cannula O2",cat:"nursing",sub:"Respiratory"},
  {id:"N10",name:"Non-Rebreather 15L O2",cat:"nursing",sub:"Respiratory"},
  {id:"N11",name:"BiPAP 12/5 FiO2 100%",cat:"nursing",sub:"Respiratory"},
];

/* ─── RESULT GENERATORS per patient ─── */
const RESULT_GEN={
  P1:{
    _tc:0,
    cbc:()=>[{n:"WBC",v:rr(10.5,12.2),u:"K/uL",r:"4.5-11.0",lo:4.5,hi:11},{n:"Hgb",v:rr(12.8,13.4),u:"g/dL",r:"12-16",lo:12,hi:16},{n:"Plt",v:rr(230,260),u:"K/uL",r:"150-400",lo:150,hi:400}],
    cmp:()=>[{n:"Na",v:rr(136,140,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.9,4.3),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cl",v:rr(100,104,0),u:"mEq/L",r:"98-106",lo:98,hi:106},{n:"CO2",v:rr(22,26,0),u:"mEq/L",r:"22-28",lo:22,hi:28},{n:"BUN",v:rr(22,28,0),u:"mg/dL",r:"7-20",lo:7,hi:20},{n:"Cr",v:rr(1.3,1.5),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(210,240,0),u:"mg/dL",r:"70-100",lo:70,hi:100},{n:"Ca",v:rr(8.8,9.4),u:"mg/dL",r:"8.5-10.5",lo:8.5,hi:10.5},{n:"AST",v:rr(28,38,0),u:"U/L",r:"10-40",lo:10,hi:40},{n:"ALT",v:rr(22,32,0),u:"U/L",r:"7-56",lo:7,hi:56},{n:"T.Bili",v:rr(0.6,1.0),u:"mg/dL",r:"0.1-1.2",lo:0.1,hi:1.2},{n:"Albumin",v:rr(3.4,3.8),u:"g/dL",r:"3.5-5.0",lo:3.5,hi:5}],
    bmp:()=>[{n:"Na",v:rr(136,140,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.9,4.3),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cr",v:rr(1.3,1.5),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(210,240,0),u:"mg/dL",r:"70-100",lo:70,hi:100}],
    trop:function(){this._tc=(this._tc||0)+1;const vals=[0.42,0.89,1.64,2.31,3.08,3.52];const v=vals[Math.min(this._tc-1,vals.length-1)]+rr(-0.05,0.05);return[{n:"Troponin I",v:+v.toFixed(2),u:"ng/mL",r:"<0.04",lo:0,hi:0.04}];},
    bnp:()=>[{n:"BNP",v:rr(350,420,0),u:"pg/mL",r:"<100",lo:0,hi:100}],
    ptinr:()=>[{n:"PT",v:rr(11.5,13),u:"sec",r:"11-13.5",lo:11,hi:13.5},{n:"INR",v:rr(0.9,1.1),u:"",r:"0.9-1.1",lo:0.9,hi:1.1}],
    ptt:()=>[{n:"PTT",v:rr(28,35,0),u:"sec",r:"25-35",lo:25,hi:35}],
    lactate:()=>[{n:"Lactate",v:rr(1.2,1.8),u:"mmol/L",r:"0.5-2.0",lo:0.5,hi:2}],
    a1c:()=>[{n:"HbA1c",v:rr(7.8,8.6),u:"%",r:"<5.7",lo:0,hi:5.7}],
    cxr:()=>[{n:"CXR PA/Lat",v:"Mild cardiomegaly. No infiltrate. No PTX.",u:"",r:"",f:"ABNORMAL",cat:"Imaging",rpt:"FINDINGS: Mildly enlarged cardiac silhouette. Lungs clear. No effusion or PTX.\n\nIMPRESSION:\n1. Mild cardiomegaly\n2. No acute cardiopulmonary process"}],
    ekg:()=>[{n:"EKG 12-Lead",v:"Sinus tach 98. ST depression V3-V6. TWI I, aVL, V5-V6.",u:"",r:"",f:"ABNORMAL",cat:"Diagnostic",rpt:"RATE: 98 bpm\nRHYTHM: Sinus tachycardia\nST: Horizontal ST depression 1-2mm V3-V6\nT-WAVE: Inversions I, aVL, V5-V6\nINTERVALS: PR 164, QRS 88, QTc 448\n\nINTERPRETATION: Ischemic changes c/w NSTEMI. Recommend serial troponins, heparin, cardiology consult."}],
    ctca:()=>[{n:"CT Coronary Angiography",v:"LAD 80% mid-segment. LCx 40%. RCA patent.",u:"",r:"",f:"ABNORMAL",cat:"Imaging",rpt:"LAD: 80% stenosis mid-segment, mixed plaque.\nLCx: 40% proximal.\nRCA: Patent.\nCalcium score: 342.\n\nIMPRESSION: Significant LAD disease. Recommend cath."}],
    ts:()=>[{n:"Type & Screen",v:"Type A+. Antibody screen negative.",u:"",r:"",f:"NORMAL",cat:"Lab"}],
    mag:()=>[{n:"Magnesium",v:rr(1.8,2.2),u:"mg/dL",r:"1.7-2.2",lo:1.7,hi:2.2}],
  },
  P2:{
    cbc:()=>[{n:"WBC",v:rr(8.5,10.5),u:"K/uL",r:"4.5-11.0",lo:4.5,hi:11},{n:"Hgb",v:rr(14.2,15.2),u:"g/dL",r:"13.5-17.5",lo:13.5,hi:17.5},{n:"Plt",v:rr(290,330),u:"K/uL",r:"150-400",lo:150,hi:400}],
    bmp:()=>[{n:"Na",v:rr(138,142,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.8,4.4),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cr",v:rr(0.9,1.1),u:"mg/dL",r:"0.7-1.3",lo:0.7,hi:1.3},{n:"Glucose",v:rr(95,115,0),u:"mg/dL",r:"70-100",lo:70,hi:100}],
    cmp:()=>[{n:"Na",v:rr(138,142,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.8,4.4),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cr",v:rr(0.9,1.1),u:"mg/dL",r:"0.7-1.3",lo:0.7,hi:1.3},{n:"AST",v:rr(20,32,0),u:"U/L",r:"10-40",lo:10,hi:40},{n:"ALT",v:rr(18,28,0),u:"U/L",r:"7-56",lo:7,hi:56}],
    ptinr:()=>[{n:"PT",v:rr(11,12.5),u:"sec",r:"11-13.5",lo:11,hi:13.5},{n:"INR",v:rr(0.9,1.0),u:"",r:"0.9-1.1",lo:0.9,hi:1.1}],
    xrext:()=>[{n:"XR R Forearm 2-View",v:"Displaced distal radius fx (Colles). Ulnar styloid avulsion.",u:"",r:"",f:"ABNORMAL",cat:"Imaging",rpt:"FINDINGS: Displaced transverse fracture distal radius, 25° dorsal angulation, 8mm displacement. Ulnar styloid tip avulsion.\n\nIMPRESSION:\n1. Colles fracture — displaced\n2. Ulnar styloid avulsion\n3. Recommend ortho for reduction/ORIF\n\n⚠ CRITICAL: Called to provider."}],
    ekg:()=>[{n:"EKG 12-Lead",v:"NSR 82. No ST changes. Normal.",u:"",r:"",f:"NORMAL",cat:"Diagnostic",rpt:"RATE: 82\nRHYTHM: NSR\nNormal EKG."}],
    ts:()=>[{n:"Type & Screen",v:"Type O+. Antibody neg.",u:"",r:"",f:"NORMAL",cat:"Lab"}],
    cxr:()=>[{n:"CXR",v:"No acute abnormality.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"Normal chest radiograph."}],
  },
  P3:{
    cbc:()=>[{n:"WBC",v:rr(15.5,18),u:"K/uL",r:"4.5-11.0",lo:4.5,hi:11},{n:"Hgb",v:rr(11.2,12.2),u:"g/dL",r:"12-16",lo:12,hi:16},{n:"Plt",v:rr(310,380),u:"K/uL",r:"150-400",lo:150,hi:400},{n:"Bands",v:rr(8,14,0),u:"%",r:"0-5",lo:0,hi:5}],
    cmp:()=>[{n:"Na",v:rr(134,138,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.6,4.0),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"CO2",v:rr(28,33,0),u:"mEq/L",r:"22-28",lo:22,hi:28},{n:"Cr",v:rr(0.8,1.0),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(135,155,0),u:"mg/dL",r:"70-100",lo:70,hi:100}],
    bmp:()=>[{n:"Na",v:rr(134,138,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(3.6,4.0),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cr",v:rr(0.8,1.0),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(135,155,0),u:"mg/dL",r:"70-100",lo:70,hi:100}],
    procal:()=>[{n:"Procalcitonin",v:rr(2.0,3.2),u:"ng/mL",r:"<0.10",lo:0,hi:0.10}],
    lactate:()=>[{n:"Lactate",v:rr(2.4,3.2),u:"mmol/L",r:"0.5-2.0",lo:0.5,hi:2}],
    bcx:()=>[{n:"Blood Cx x2",v:"Pending — no growth",u:"",r:"",f:"PENDING",cat:"Lab",pending:true}],
    ucx:()=>[{n:"Urine Cx",v:"Pending",u:"",r:"",f:"PENDING",cat:"Lab",pending:true}],
    ua:()=>[{n:"UA-WBC",v:"0-2",u:"/HPF",r:"0-5",lo:0,hi:5},{n:"UA-Bacteria",v:"None",u:"",r:"None"}],
    crp:()=>[{n:"CRP",v:rr(12,22),u:"mg/dL",r:"<0.5",lo:0,hi:0.5}],
    abg:()=>[{n:"ABG pH",v:rr(7.32,7.38,2),u:"",r:"7.35-7.45",lo:7.35,hi:7.45},{n:"ABG pCO2",v:rr(48,56,0),u:"mmHg",r:"35-45",lo:35,hi:45},{n:"ABG pO2",v:rr(58,66,0),u:"mmHg",r:"80-100",lo:80,hi:100}],
    cxr:()=>[{n:"CXR PA/Lat",v:"RLL consolidation w/ air bronchograms. Small R pleural effusion.",u:"",r:"",f:"ABNORMAL",cat:"Imaging",rpt:"FINDINGS: RLL consolidation with air bronchograms. Small right pleural effusion. Hyperinflated lungs c/w COPD.\n\nIMPRESSION:\n1. RLL pneumonia\n2. Small parapneumonic effusion\n3. COPD"}],
    ekg:()=>[{n:"EKG",v:"Sinus tach 105. RAD. P-pulmonale.",u:"",r:"",f:"ABNORMAL",cat:"Diagnostic",rpt:"RATE: 105\nRHYTHM: Sinus tach\nAXIS: RAD\nP-wave: Peaked (P-pulmonale)\n\nINTERPRETATION: Sinus tach w/ right heart strain."}],
  },
  P4:{
    cbc:()=>[{n:"WBC",v:rr(20,25),u:"K/uL",r:"4.5-11.0",lo:4.5,hi:11},{n:"Hgb",v:rr(10.2,11.5),u:"g/dL",r:"13.5-17.5",lo:13.5,hi:17.5},{n:"Plt",v:rr(98,140),u:"K/uL",r:"150-400",lo:150,hi:400},{n:"Bands",v:rr(12,20,0),u:"%",r:"0-5",lo:0,hi:5}],
    cmp:()=>[{n:"Na",v:rr(131,136,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(4.8,5.6),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"CO2",v:rr(16,20,0),u:"mEq/L",r:"22-28",lo:22,hi:28},{n:"BUN",v:rr(42,58,0),u:"mg/dL",r:"7-20",lo:7,hi:20},{n:"Cr",v:rr(2.5,3.2),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(65,85,0),u:"mg/dL",r:"70-100",lo:70,hi:100},{n:"AST",v:rr(68,95,0),u:"U/L",r:"10-40",lo:10,hi:40},{n:"ALT",v:rr(52,78,0),u:"U/L",r:"7-56",lo:7,hi:56},{n:"T.Bili",v:rr(1.8,2.8),u:"mg/dL",r:"0.1-1.2",lo:0.1,hi:1.2},{n:"Albumin",v:rr(2.2,2.8),u:"g/dL",r:"3.5-5.0",lo:3.5,hi:5}],
    bmp:()=>[{n:"Na",v:rr(131,136,0),u:"mEq/L",r:"136-145",lo:136,hi:145},{n:"K",v:rr(4.8,5.6),u:"mEq/L",r:"3.5-5.0",lo:3.5,hi:5},{n:"Cr",v:rr(2.5,3.2),u:"mg/dL",r:"0.6-1.2",lo:0.6,hi:1.2},{n:"Glucose",v:rr(65,85,0),u:"mg/dL",r:"70-100",lo:70,hi:100}],
    lactate:()=>[{n:"Lactate",v:rr(4.0,5.5),u:"mmol/L",r:"0.5-2.0",lo:0.5,hi:2}],
    procal:()=>[{n:"Procalcitonin",v:rr(10,18),u:"ng/mL",r:"<0.10",lo:0,hi:0.10}],
    bcx:()=>[{n:"Blood Cx x2",v:"Pending — no growth",u:"",r:"",f:"PENDING",cat:"Lab",pending:true,pendFinal:{v:"POSITIVE: E. coli — pan-sensitive",f:"CRITICAL",delay:90e3}}],
    ucx:()=>[{n:"Urine Cx",v:"Pending",u:"",r:"",f:"PENDING",cat:"Lab",pending:true,pendFinal:{v:">100K CFU/mL E. coli — pan-sensitive",f:"ABNORMAL",delay:70e3}}],
    ua:()=>[{n:"UA-Appearance",v:"Cloudy",u:"",r:"Clear"},{n:"UA-Nitrites",v:"Positive",u:"",r:"Negative",f:"ABNORMAL"},{n:"UA-Leuk Est",v:"3+",u:"",r:"Negative",f:"ABNORMAL"},{n:"UA-WBC",v:">100",u:"/HPF",r:"0-5",lo:0,hi:5},{n:"UA-Bacteria",v:"3+",u:"",r:"None",f:"ABNORMAL"}],
    ptinr:()=>[{n:"PT",v:rr(14.5,16.5),u:"sec",r:"11-13.5",lo:11,hi:13.5},{n:"INR",v:rr(1.3,1.5),u:"",r:"0.9-1.1",lo:0.9,hi:1.1}],
    vbg:()=>[{n:"VBG pH",v:rr(7.24,7.30,2),u:"",r:"7.31-7.41",lo:7.31,hi:7.41},{n:"VBG pCO2",v:rr(32,38,0),u:"mmHg",r:"41-51",lo:41,hi:51},{n:"VBG Lactate",v:rr(4.0,5.5),u:"mmol/L",r:"0.5-2.0",lo:0.5,hi:2}],
    cxr:()=>[{n:"CXR Portable AP",v:"Low volumes. Mild pulm vascular congestion. No consolidation.",u:"",r:"",f:"ABNORMAL",cat:"Imaging",rpt:"Low lung volumes. Mild perihilar congestion. No PNA. No effusion.\n\nIMPRESSION: No pneumonia. Mild vascular congestion."}],
    ekg:()=>[{n:"EKG",v:"AFib w/ RVR 118. Nonspecific ST-T changes. LAD.",u:"",r:"",f:"ABNORMAL",cat:"Diagnostic",rpt:"RATE: 118\nRHYTHM: AFib\nAXIS: LAD\nST/T: Diffuse nonspecific changes\n\nINTERPRETATION: AFib w/ RVR. Demand ischemia vs rate-related changes in sepsis."}],
    fib:()=>[{n:"Fibrinogen",v:rr(480,620,0),u:"mg/dL",r:"200-400",lo:200,hi:400}],
  },
};

// Generic fallbacks
const GENERIC_RES={
  lipase:()=>[{n:"Lipase",v:rr(15,55,0),u:"U/L",r:"0-60",lo:0,hi:60}],
  ddimer:()=>[{n:"D-Dimer",v:rr(0.2,0.4),u:"mg/L FEU",r:"<0.50",lo:0,hi:0.50}],
  ts:()=>[{n:"Type & Screen",v:"Pending crossmatch",u:"",r:"",f:"PENDING",cat:"Lab",pending:true}],
  uds:()=>[{n:"UDS",v:"Negative all panels",u:"",r:"Negative",f:"NORMAL",cat:"Lab"}],
  ammonia:()=>[{n:"Ammonia",v:rr(18,35,0),u:"umol/L",r:"15-45",lo:15,hi:45}],
  tsh:()=>[{n:"TSH",v:rr(1.2,3.8),u:"mIU/L",r:"0.4-4.0",lo:0.4,hi:4}],
  mag:()=>[{n:"Mg",v:rr(1.8,2.1),u:"mg/dL",r:"1.7-2.2",lo:1.7,hi:2.2}],
  phos:()=>[{n:"Phos",v:rr(2.8,4.2),u:"mg/dL",r:"2.5-4.5",lo:2.5,hi:4.5}],
  fib:()=>[{n:"Fibrinogen",v:rr(220,350,0),u:"mg/dL",r:"200-400",lo:200,hi:400}],
  ptt:()=>[{n:"PTT",v:rr(26,34,0),u:"sec",r:"25-35",lo:25,hi:35}],
  esr:()=>[{n:"ESR",v:rr(10,25,0),u:"mm/hr",r:"0-20",lo:0,hi:20}],
  crp:()=>[{n:"CRP",v:rr(0.2,0.8),u:"mg/dL",r:"<0.5",lo:0,hi:0.5}],
  a1c:()=>[{n:"HbA1c",v:rr(5.0,5.6),u:"%",r:"<5.7",lo:0,hi:5.7}],
  cthead:()=>[{n:"CT Head w/o",v:"No acute abnormality.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"No hemorrhage, mass, or midline shift.\n\nIMPRESSION: Normal."}],
  ctap:()=>[{n:"CT A/P w/ contrast",v:"No acute pathology.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"Unremarkable.\nIMPRESSION: No acute abdominal pathology."}],
  ctape:()=>[{n:"CTA Chest (PE)",v:"No PE.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"No filling defect.\nIMPRESSION: No pulmonary embolism."}],
  usruq:()=>[{n:"US RUQ",v:"Normal GB. No biliary dilation.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"GB normal. CBD 4mm. Liver normal.\nIMPRESSION: Normal."}],
  fast:()=>[{n:"FAST",v:"Negative — no free fluid.",u:"",r:"",f:"NORMAL",cat:"Imaging",rpt:"All 4 views negative.\nIMPRESSION: Negative FAST."}],
  echo:()=>[{n:"Bedside Echo",v:"EF ~55%. No effusion. Normal.",u:"",r:"",f:"NORMAL",cat:"Diagnostic",rpt:"LV function grossly normal, EF ~55%. No pericardial effusion. IVC normal."}],
};

/* ─── PATIENTS ─── */
const PATIENTS=[
  {id:"P1",name:"Martinez, Elena",mrn:"MRN-482910",dob:"03/14/1958",age:67,sex:"F",loc:"ED-Bay 12",enc:"ENC-90421",status:"Active",acuity:"ESI-2",
    chief:"Chest pain, diaphoresis × 2hrs",
    triage:"67F PMH HTN/DM2/HLD presenting with acute substernal CP radiating to L arm, diaphoresis × 2hr. 8/10 pressure-like, at rest. Takes ASA 81mg daily. EKG at triage: ST depression V3-V6, TWI lateral leads.",
    allergies:[{agent:"Penicillin",rxn:"Anaphylaxis",sev:"High"},{agent:"Sulfa",rxn:"Rash",sev:"Mod"}],
    alerts:["Fall Risk","DVT Prophylaxis Required","Cardiac Alert"],
    problems:["Hypertension","Type 2 DM","Hyperlipidemia","GERD","OA bilateral knees","Obesity BMI 32"],
    homeMeds:["Lisinopril 20mg PO daily","Metformin 1000mg PO BID","Atorvastatin 40mg PO QHS","Omeprazole 20mg PO daily","ASA 81mg PO daily","Amlodipine 5mg PO daily"],
    vitals:[{t:"14:32",hr:102,bp:"168/94",rr:22,spo2:94,temp:98.8,pain:8,src:"Triage"},{t:"14:50",hr:98,bp:"162/90",rr:20,spo2:95,temp:98.7,pain:7,src:"RN"},{t:"15:15",hr:94,bp:"155/88",rr:18,spo2:96,temp:98.6,pain:5,src:"RN"}],
    preResults:[{n:"Troponin I",v:"0.42",u:"ng/mL",r:"<0.04",f:"CRITICAL",t:"14:45",cat:"Lab"},{n:"EKG 12-Lead",v:"ST depression V3-V6. TWI lateral. Sinus tach 98.",f:"ABNORMAL",t:"14:40",cat:"Diagnostic",rpt:"ST depression V3-V6. TWI I,aVL,V5-V6.\nSinus tach 98. QTc 448.\nIschemic changes c/w NSTEMI."}],
    _creatinine:1.4,edCourse:"",notes:[]},
  {id:"P2",name:"Johnson, Marcus",mrn:"MRN-738201",dob:"11/22/1985",age:40,sex:"M",loc:"ED-Bay 5",enc:"ENC-90422",status:"Active",acuity:"ESI-3",
    chief:"Fall from ladder — R arm deformity, laceration",
    triage:"40M fell ~8ft from ladder onto outstretched R hand. Obvious R distal forearm deformity. 4cm laceration R forearm, controlled. NVI distally. No LOC/head strike/neck pain. Tetanus unknown. Ate 2hr ago.",
    allergies:[{agent:"Codeine",rxn:"Nausea/Vomiting",sev:"Mod"}],
    alerts:["Tetanus Due","Pre-Op Clearance Needed"],
    problems:["Asthma (mild intermittent)","Seasonal allergies"],
    homeMeds:["Albuterol MDI PRN","Cetirizine 10mg PO daily"],
    vitals:[{t:"13:10",hr:110,bp:"148/92",rr:20,spo2:98,temp:98.4,pain:9,src:"Triage"},{t:"13:35",hr:98,bp:"138/86",rr:18,spo2:99,temp:98.5,pain:7,src:"RN"},{t:"14:00",hr:88,bp:"132/82",rr:16,spo2:99,temp:98.4,pain:5,src:"RN"}],
    preResults:[],_creatinine:1.0,edCourse:"",notes:[]},
  {id:"P3",name:"Chen, Lisa",mrn:"MRN-219384",dob:"07/08/1972",age:53,sex:"F",loc:"ED-Bay 8",enc:"ENC-90423",status:"Active",acuity:"ESI-2",
    chief:"Acute dyspnea, productive cough × 3d, fever 101.8°F",
    triage:"53F COPD (moderate, 1ppd×30yr) w/ worsening dyspnea, productive yellow-green sputum × 3d. Fever 101.8 at home. SpO2 88% on RA → 91% on 2L NC. Accessory muscles. Short sentences only.",
    allergies:[],
    alerts:["Droplet Precautions","Supplemental O2 Required","Sepsis Screen Positive"],
    problems:["COPD moderate (GOLD II)","Smoker 1ppd×30yr","Osteoporosis","MDD","Vitamin D deficiency"],
    homeMeds:["Tiotropium 18mcg INH daily","Fluticasone/Salmeterol 250/50 INH BID","Albuterol neb PRN","Sertraline 100mg PO daily","Alendronate 70mg PO weekly","Vitamin D3 2000 IU PO daily"],
    vitals:[{t:"12:45",hr:108,bp:"130/78",rr:28,spo2:88,temp:101.8,pain:4,src:"Triage"},{t:"13:15",hr:102,bp:"128/76",rr:24,spo2:91,temp:101.4,pain:3,src:"RN"},{t:"14:00",hr:96,bp:"126/74",rr:22,spo2:93,temp:100.8,pain:2,src:"RN"}],
    preResults:[],_creatinine:0.9,edCourse:"",notes:[]},
  {id:"P4",name:"Williams, Robert",mrn:"MRN-605827",dob:"01/30/1945",age:81,sex:"M",loc:"ICU-Bed 3",enc:"ENC-90420",status:"Active",acuity:"ESI-1",
    chief:"Septic shock — UTI source, on vasopressors",
    triage:"81M transferred ED→ICU. AMS (GCS 13), fever 103.1, MAP 52. UTI-source septic shock. 30mL/kg NS given. Norepinephrine started. Broad-spectrum abx initiated. Foley: purulent urine.",
    allergies:[{agent:"Vancomycin",rxn:"Red Man Syndrome",sev:"Mod"},{agent:"Iodine contrast",rxn:"Hives",sev:"Mod"}],
    alerts:["Fall Risk","FULL CODE","Vasopressors Active","Central Line","Contact Isolation"],
    problems:["BPH","AFib (chronic, on anticoag)","CHF HFrEF (EF 35%)","CKD 3b (baseline Cr 1.8)","Mild Alzheimer's","Recurrent UTIs","Gout"],
    homeMeds:["Apixaban 5mg PO BID","Carvedilol 12.5mg PO BID","Furosemide 40mg PO daily","Tamsulosin 0.4mg PO QHS","Donepezil 10mg PO QHS","Allopurinol 100mg PO daily"],
    vitals:[{t:"10:00",hr:118,bp:"78/50",rr:26,spo2:92,temp:103.1,pain:6,src:"ED"},{t:"11:00",hr:110,bp:"85/55",rr:24,spo2:94,temp:102.4,pain:5,src:"ED RN"},{t:"12:00",hr:102,bp:"92/60",rr:22,spo2:95,temp:101.6,pain:4,src:"ICU RN"}],
    preResults:[{n:"WBC",v:"22.4",u:"K/uL",r:"4.5-11.0",f:"CRITICAL",t:"10:15",cat:"Lab"},{n:"Lactate",v:"4.6",u:"mmol/L",r:"0.5-2.0",f:"CRITICAL",t:"10:15",cat:"Lab"},{n:"Creatinine",v:"2.8",u:"mg/dL",r:"0.6-1.2",f:"HIGH",t:"10:20",cat:"Lab"},{n:"Procalcitonin",v:"12.8",u:"ng/mL",r:"<0.10",f:"CRITICAL",t:"10:25",cat:"Lab"},{n:"Urinalysis",v:"+Nitrites, >100 WBC, bacteria 3+",f:"ABNORMAL",t:"10:30",cat:"Lab"},{n:"Blood Cx x2",v:"Pending — no growth",f:"PENDING",t:"10:10",cat:"Lab"}],
    _creatinine:2.8,
    edCourse:"81M hx AFib, HFrEF EF35%, CKD3b, BPH. AMS, fever 103.1, hypotension MAP 52. UTI-source septic shock. 30mL/kg IVF. Started norepinephrine. Meropenem initiated. Foley: purulent urine. WBC 22.4, lactate 4.6, Cr 2.8 (baseline 1.8), procal 12.8. Transferred ICU.",
    notes:[]},
];

/* ─── NOTE TEMPLATES (abbreviated for space) ─── */
const NOTE_TEMPLATES={
  "ED Provider Note":"CHIEF COMPLAINT: [chief]\n\nHPI:\n[age][sex] w/ PMH [problems] presenting with [chief].\n\n[Detail onset, location, duration, character, severity, associated sx]\n\nROS: [pertinent positives/negatives]\n\nEXAM:\nGeneral: \nHEENT: \nCV: \nPulm: \nAbd: \nExt: \nNeuro: \n\nDIAGNOSTICS:\n[labs, imaging, EKG]\n\nED COURSE:\n[interventions, responses]\n\nMDM:\n[assessment, differential, reasoning]\n\nDIAGNOSIS:\n1. \n\nPLAN:\n[disposition, orders, consults, f/u]\n\nAttending: ___",
  "Nursing Assessment":"NURSING ASSESSMENT — [time]\nPatient: [name] | [mrn]\n\nA: Airway [patent/compromised]\nB: Breathing RR___ SpO2___% on ___\nC: Circulation HR___ BP___ skin [WDI/cool/mottled]\nD: Disability GCS___ pupils ___\nE: Exposure Temp___\n\nPain: ___/10 Location: ___ Quality: ___\nIV Access: ___\nSafety: Fall risk [Y/N] Restraints [Y/N]\n\nInterventions: ___\n\nRN: ___",
  "Progress Note":"PROGRESS NOTE — [time]\n\nSubjective: \nObjective:\n  Vitals: \n  Exam: \n  New results: \n\nAssessment/Plan:\n\nProvider: ___",
  "Procedure Note":"PROCEDURE NOTE\nProcedure: ___\nIndication: ___\nConsent: ___\nTimeout: ☐\nTechnique: ___\nFindings: ___\nComplications: None\nEBL: ___\n\nProvider: ___",
};

const SMART_PHRASES={
  ".nml":"Within normal limits.",
  ".nad":"No acute distress.",
  ".rrr":"Regular rate and rhythm, no murmurs/rubs/gallops.",
  ".ctab":"Clear to auscultation bilaterally, no wheezes/rales/rhonchi.",
  ".soft":"Soft, non-tender, non-distended, normoactive bowel sounds.",
  ".aox3":"Alert and oriented ×3 (person, place, time).",
  ".perrla":"PERRL 3→2mm bilaterally.",
  ".neuro":"CN II-XII intact. Strength 5/5 all extremities. Sensation intact.",
  ".skin":"Warm, dry, intact. No rash. Cap refill <2s.",
  ".sepsis":"Sepsis screening positive. Hour-1 bundle initiated: lactate drawn, BCx obtained prior to abx, broad-spectrum abx given, 30mL/kg crystalloid for hypotension/lactate≥4.",
  ".stemi":"STEMI alert activated. Cardiology notified. ASA 325 given. Heparin initiated. Cath lab mobilized.",
  ".acs":"ACS protocol: ASA 325, heparin bolus+drip, serial troponins q3h, tele, cardiology consult. NPO for possible cath.",
  ".fall":"Patient fall risk assessment completed. Precautions in place: bed low, rails up, call light in reach, non-skid footwear.",
};
