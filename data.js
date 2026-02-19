/* ═══════════════════════════════════════════
   SimEHR — data.js
   Seed patients, order catalog, result generators,
   note templates, SmartPhrases, sim config
   ═══════════════════════════════════════════ */

// ─── SCHEMA VERSION (for localStorage migrations) ───
const SCHEMA_VERSION = 2;

// ─── SIM TIMING CONFIG (milliseconds at 1x speed) ───
const SIM_TIMING = {
  // Order pipeline delays per category + priority
  lab: {
    STAT:    { sign: 3000, collect: 8000,  process: 20000, result: 35000 },
    Urgent:  { sign: 3000, collect: 12000, process: 35000, result: 55000 },
    Routine: { sign: 5000, collect: 20000, process: 50000, result: 80000 },
  },
  imaging: {
    STAT:    { sign: 3000, schedule: 10000, inProgress: 30000, result: 50000 },
    Urgent:  { sign: 3000, schedule: 20000, inProgress: 45000, result: 70000 },
    Routine: { sign: 5000, schedule: 30000, inProgress: 60000, result: 90000 },
  },
  diagnostic: {
    STAT:    { sign: 2000, perform: 8000, interpret: 20000, result: 30000 },
    Urgent:  { sign: 3000, perform: 15000, interpret: 30000, result: 45000 },
    Routine: { sign: 5000, perform: 20000, interpret: 40000, result: 60000 },
  },
  medication: {
    STAT:    { sign: 2000, verify: 8000, dispense: 15000, ready: 20000 },
    Urgent:  { sign: 3000, verify: 12000, dispense: 25000, ready: 30000 },
    Routine: { sign: 5000, verify: 20000, dispense: 40000, ready: 50000 },
  },
  nursing: {
    STAT:    { sign: 2000, acknowledge: 5000, complete: 15000 },
    Urgent:  { sign: 3000, acknowledge: 8000, complete: 25000 },
    Routine: { sign: 5000, acknowledge: 15000, complete: 40000 },
  },
  // Vitals auto-update interval
  vitalsInterval: 60000, // 1 min at 1x
};

// ─── ORDER CATALOG ───
const ORDER_CATALOG = [
  // LABS — Hematology
  { id:"OC1",  name:"CBC with Differential",        cat:"lab", sub:"Hematology",   resultKey:"cbc" },
  { id:"OC2",  name:"Comprehensive Metabolic Panel", cat:"lab", sub:"Chemistry",    resultKey:"cmp" },
  { id:"OC3",  name:"Basic Metabolic Panel",         cat:"lab", sub:"Chemistry",    resultKey:"bmp" },
  { id:"OC4",  name:"Troponin I",                    cat:"lab", sub:"Cardiac",      resultKey:"trop" },
  { id:"OC5",  name:"BNP",                           cat:"lab", sub:"Cardiac",      resultKey:"bnp" },
  { id:"OC6",  name:"PT/INR",                        cat:"lab", sub:"Coagulation",  resultKey:"ptinr" },
  { id:"OC7",  name:"PTT",                           cat:"lab", sub:"Coagulation",  resultKey:"ptt" },
  { id:"OC8",  name:"Urinalysis",                    cat:"lab", sub:"Urine",        resultKey:"ua" },
  { id:"OC9",  name:"Blood Culture x2",              cat:"lab", sub:"Micro",        resultKey:"bcx" },
  { id:"OC10", name:"Lactate",                       cat:"lab", sub:"Chemistry",    resultKey:"lactate" },
  { id:"OC11", name:"Procalcitonin",                 cat:"lab", sub:"Chemistry",    resultKey:"procal" },
  { id:"OC12", name:"Lipase",                        cat:"lab", sub:"Chemistry",    resultKey:"lipase" },
  { id:"OC13", name:"D-Dimer",                       cat:"lab", sub:"Coagulation",  resultKey:"ddimer" },
  { id:"OC14", name:"Type and Screen",               cat:"lab", sub:"Blood Bank",   resultKey:"ts" },
  { id:"OC15", name:"Urine Drug Screen",             cat:"lab", sub:"Toxicology",   resultKey:"uds" },
  { id:"OC16", name:"Magnesium",                     cat:"lab", sub:"Chemistry",    resultKey:"mag" },
  { id:"OC17", name:"Phosphorus",                    cat:"lab", sub:"Chemistry",    resultKey:"phos" },
  { id:"OC18", name:"Lactic Acid (venous)",          cat:"lab", sub:"Chemistry",    resultKey:"lactate" },
  { id:"OC19", name:"Ammonia",                       cat:"lab", sub:"Chemistry",    resultKey:"ammonia" },
  { id:"OC20", name:"ESR",                           cat:"lab", sub:"Hematology",   resultKey:"esr" },
  { id:"OC21", name:"CRP",                           cat:"lab", sub:"Chemistry",    resultKey:"crp" },
  { id:"OC22", name:"Hemoglobin A1c",                cat:"lab", sub:"Chemistry",    resultKey:"a1c" },
  { id:"OC23", name:"TSH",                           cat:"lab", sub:"Endocrine",    resultKey:"tsh" },
  { id:"OC24", name:"Urine Culture",                 cat:"lab", sub:"Micro",        resultKey:"ucx" },
  { id:"OC25", name:"ABG (Arterial Blood Gas)",      cat:"lab", sub:"Chemistry",    resultKey:"abg" },
  { id:"OC26", name:"VBG (Venous Blood Gas)",        cat:"lab", sub:"Chemistry",    resultKey:"vbg" },
  { id:"OC27", name:"Fibrinogen",                    cat:"lab", sub:"Coagulation",  resultKey:"fib" },

  // IMAGING
  { id:"OC40", name:"CXR PA/Lateral",                      cat:"imaging", sub:"X-Ray", resultKey:"cxr" },
  { id:"OC41", name:"CT Head w/o Contrast",                cat:"imaging", sub:"CT",    resultKey:"cthead" },
  { id:"OC42", name:"CT Abdomen/Pelvis w/ Contrast",       cat:"imaging", sub:"CT",    resultKey:"ctap" },
  { id:"OC43", name:"CT Angiography Chest (PE Protocol)",  cat:"imaging", sub:"CT",    resultKey:"ctape" },
  { id:"OC44", name:"XR Extremity 2-view",                 cat:"imaging", sub:"X-Ray", resultKey:"xrext" },
  { id:"OC45", name:"Ultrasound RUQ",                      cat:"imaging", sub:"US",    resultKey:"usruq" },
  { id:"OC46", name:"CT Cervical Spine w/o Contrast",      cat:"imaging", sub:"CT",    resultKey:"ctcsp" },
  { id:"OC47", name:"XR Pelvis AP",                        cat:"imaging", sub:"X-Ray", resultKey:"xrpelvis" },
  { id:"OC48", name:"US FAST Exam",                        cat:"imaging", sub:"US",    resultKey:"fast" },
  { id:"OC49", name:"CT Coronary Angiography",             cat:"imaging", sub:"CT",    resultKey:"ctca" },

  // DIAGNOSTIC
  { id:"OC60", name:"EKG 12-Lead",                   cat:"diagnostic", sub:"Cardiac",     resultKey:"ekg" },
  { id:"OC61", name:"Bedside Echocardiogram",        cat:"diagnostic", sub:"Cardiac",     resultKey:"echo" },
  { id:"OC62", name:"Lumbar Puncture",               cat:"diagnostic", sub:"Procedure",   resultKey:"lp" },

  // MEDICATIONS
  { id:"OC80",  name:"Normal Saline 1000mL IV bolus",          cat:"medication", sub:"IV Fluids",  medEffect:{type:"fluid"} },
  { id:"OC81",  name:"Lactated Ringer's 1000mL IV bolus",      cat:"medication", sub:"IV Fluids",  medEffect:{type:"fluid"} },
  { id:"OC82",  name:"Morphine 4mg IV q4h PRN pain",           cat:"medication", sub:"Analgesic",  medEffect:{type:"vitals", hr:-5, bp:-5, rr:-2, pain:-3} },
  { id:"OC83",  name:"Fentanyl 50mcg IV q1h PRN pain",         cat:"medication", sub:"Analgesic",  medEffect:{type:"vitals", hr:-3, bp:-3, rr:-2, pain:-4} },
  { id:"OC84",  name:"Ketorolac 30mg IV x1",                   cat:"medication", sub:"Analgesic",  medEffect:{type:"vitals", pain:-3} },
  { id:"OC85",  name:"Acetaminophen 1000mg PO/IV q6h PRN",     cat:"medication", sub:"Analgesic",  medEffect:{type:"vitals", temp:-1.0, pain:-2} },
  { id:"OC86",  name:"Ondansetron 4mg IV q6h PRN nausea",      cat:"medication", sub:"Antiemetic", medEffect:null },
  { id:"OC87",  name:"Ceftriaxone 2g IV daily",                cat:"medication", sub:"Antibiotic", medEffect:{type:"abx"} },
  { id:"OC88",  name:"Azithromycin 500mg IV daily",            cat:"medication", sub:"Antibiotic", medEffect:{type:"abx"} },
  { id:"OC89",  name:"Piperacillin-Tazobactam 4.5g IV q6h",   cat:"medication", sub:"Antibiotic", medEffect:{type:"abx"} },
  { id:"OC90",  name:"Vancomycin 1g IV q12h",                  cat:"medication", sub:"Antibiotic", medEffect:{type:"abx"} },
  { id:"OC91",  name:"Metoprolol 5mg IV q5min x3 PRN",        cat:"medication", sub:"Cardiac",    medEffect:{type:"vitals", hr:-15, bp:-10} },
  { id:"OC92",  name:"Nitroglycerin 0.4mg SL PRN chest pain",  cat:"medication", sub:"Cardiac",    medEffect:{type:"vitals", bp:-15, pain:-2} },
  { id:"OC93",  name:"Aspirin 325mg PO STAT",                  cat:"medication", sub:"Cardiac",    medEffect:null },
  { id:"OC94",  name:"Heparin 60 units/kg IV bolus",           cat:"medication", sub:"Anticoag",   medEffect:null },
  { id:"OC95",  name:"Heparin drip 12 units/kg/hr",            cat:"medication", sub:"Anticoag",   medEffect:null },
  { id:"OC96",  name:"Norepinephrine 0.1mcg/kg/min IV",        cat:"medication", sub:"Pressor",    medEffect:{type:"vitals", bp:+20, hr:+5} },
  { id:"OC97",  name:"Albuterol 2.5mg nebulizer q4h + PRN",    cat:"medication", sub:"Respiratory",medEffect:{type:"vitals", spo2:+2, hr:+5} },
  { id:"OC98",  name:"Methylprednisolone 125mg IV",             cat:"medication", sub:"Steroid",    medEffect:{type:"vitals"} },
  { id:"OC99",  name:"Furosemide 40mg IV STAT",                cat:"medication", sub:"Diuretic",   medEffect:{type:"fluid"} },
  { id:"OC100", name:"Meropenem 1g IV q8h",                    cat:"medication", sub:"Antibiotic", medEffect:{type:"abx"} },
  { id:"OC101", name:"Hydrocortisone 100mg IV q8h",            cat:"medication", sub:"Steroid",    medEffect:{type:"vitals", bp:+5} },
  { id:"OC102", name:"Lorazepam 1mg IV PRN anxiety/seizure",   cat:"medication", sub:"Sedative",   medEffect:{type:"vitals", hr:-5, rr:-2, bp:-5} },
  { id:"OC103", name:"Naloxone 0.4mg IV/IM/IN PRN",            cat:"medication", sub:"Reversal",   medEffect:{type:"vitals", rr:+6} },
  { id:"OC104", name:"Epinephrine 0.3mg IM (anaphylaxis)",     cat:"medication", sub:"Emergency",  medEffect:{type:"vitals", hr:+20, bp:+30} },

  // NURSING
  { id:"OC120", name:"Continuous Pulse Oximetry",   cat:"nursing", sub:"Monitoring" },
  { id:"OC121", name:"Telemetry Monitoring",         cat:"nursing", sub:"Monitoring" },
  { id:"OC122", name:"Strict I&O",                   cat:"nursing", sub:"Assessment" },
  { id:"OC123", name:"Fall Precautions",              cat:"nursing", sub:"Safety" },
  { id:"OC124", name:"NPO",                          cat:"nursing", sub:"Diet" },
  { id:"OC125", name:"Foley Catheter Insertion",      cat:"nursing", sub:"Procedure" },
  { id:"OC126", name:"Vitals q15min x4 then q1h",    cat:"nursing", sub:"Monitoring" },
  { id:"OC127", name:"Neuro checks q1h",              cat:"nursing", sub:"Assessment" },
  { id:"OC128", name:"Wound care per protocol",       cat:"nursing", sub:"Wound Care" },
  { id:"OC129", name:"2L Nasal Cannula O2",           cat:"nursing", sub:"Respiratory", medEffect:{type:"vitals", spo2:+3} },
  { id:"OC130", name:"Non-Rebreather 15L O2",         cat:"nursing", sub:"Respiratory", medEffect:{type:"vitals", spo2:+6} },
  { id:"OC131", name:"Restraint Order — Soft Wrist",  cat:"nursing", sub:"Safety" },
  { id:"OC132", name:"1:1 Sitter",                    cat:"nursing", sub:"Safety" },
];

// ─── SCENARIO-BASED RESULT GENERATORS ───
// Each patient has a result map keyed by resultKey
// Values can be static or functions (for trending/randomized values)
// "flag" is auto-calculated from ref range

function randRange(min, max, dec=1) {
  return +(min + Math.random() * (max - min)).toFixed(dec);
}

const RESULT_GENERATORS = {
  // ─── P001: Elena Martinez — NSTEMI ───
  P001: {
    _tropCount: 0, // tracks serial troponins for rising pattern
    cbc: () => [
      { name:"WBC",         value: randRange(10.5,12.2), unit:"K/uL",  ref:"4.5-11.0", refLo:4.5, refHi:11.0 },
      { name:"Hemoglobin",  value: randRange(12.8,13.4), unit:"g/dL",  ref:"12.0-16.0", refLo:12.0, refHi:16.0 },
      { name:"Hematocrit",  value: randRange(38,40),     unit:"%",     ref:"36-46", refLo:36, refHi:46 },
      { name:"Platelets",   value: randRange(230,260),   unit:"K/uL",  ref:"150-400", refLo:150, refHi:400 },
      { name:"Neutrophils",  value: randRange(72,80),    unit:"%",     ref:"40-70", refLo:40, refHi:70 },
    ],
    cmp: () => [
      { name:"Sodium",     value: randRange(136,140,0),  unit:"mEq/L", ref:"136-145", refLo:136, refHi:145 },
      { name:"Potassium",  value: randRange(3.9,4.3),    unit:"mEq/L", ref:"3.5-5.0", refLo:3.5, refHi:5.0 },
      { name:"Chloride",   value: randRange(100,104,0),  unit:"mEq/L", ref:"98-106",  refLo:98,  refHi:106 },
      { name:"CO2",        value: randRange(22,26,0),     unit:"mEq/L", ref:"22-28",   refLo:22,  refHi:28 },
      { name:"BUN",        value: randRange(22,28,0),     unit:"mg/dL", ref:"7-20",    refLo:7,   refHi:20 },
      { name:"Creatinine", value: randRange(1.3,1.5),     unit:"mg/dL", ref:"0.6-1.2", refLo:0.6, refHi:1.2 },
      { name:"Glucose",    value: randRange(210,240,0),   unit:"mg/dL", ref:"70-100",  refLo:70,  refHi:100 },
      { name:"Calcium",    value: randRange(8.8,9.4),     unit:"mg/dL", ref:"8.5-10.5",refLo:8.5, refHi:10.5 },
      { name:"Total Protein", value: randRange(6.4,7.2),  unit:"g/dL", ref:"6.0-8.3", refLo:6.0, refHi:8.3 },
      { name:"Albumin",    value: randRange(3.4,3.8),     unit:"g/dL", ref:"3.5-5.0",  refLo:3.5, refHi:5.0 },
      { name:"AST",        value: randRange(28,38,0),      unit:"U/L",  ref:"10-40",   refLo:10,  refHi:40 },
      { name:"ALT",        value: randRange(22,32,0),      unit:"U/L",  ref:"7-56",    refLo:7,   refHi:56 },
      { name:"Alk Phos",   value: randRange(65,90,0),      unit:"U/L",  ref:"44-147",  refLo:44,  refHi:147 },
      { name:"Total Bilirubin", value: randRange(0.6,1.0), unit:"mg/dL",ref:"0.1-1.2", refLo:0.1, refHi:1.2 },
    ],
    bmp: () => [
      { name:"Sodium",     value: randRange(136,140,0),  unit:"mEq/L", ref:"136-145", refLo:136, refHi:145 },
      { name:"Potassium",  value: randRange(3.9,4.3),    unit:"mEq/L", ref:"3.5-5.0", refLo:3.5, refHi:5.0 },
      { name:"Chloride",   value: randRange(100,104,0),  unit:"mEq/L", ref:"98-106",  refLo:98,  refHi:106 },
      { name:"CO2",        value: randRange(22,26,0),     unit:"mEq/L", ref:"22-28",   refLo:22,  refHi:28 },
      { name:"BUN",        value: randRange(22,28,0),     unit:"mg/dL", ref:"7-20",    refLo:7,   refHi:20 },
      { name:"Creatinine", value: randRange(1.3,1.5),     unit:"mg/dL", ref:"0.6-1.2", refLo:0.6, refHi:1.2 },
      { name:"Glucose",    value: randRange(210,240,0),   unit:"mg/dL", ref:"70-100",  refLo:70,  refHi:100 },
      { name:"Calcium",    value: randRange(8.8,9.4),     unit:"mg/dL", ref:"8.5-10.5",refLo:8.5, refHi:10.5 },
    ],
    trop: function() {
      // Rising troponin pattern for NSTEMI
      this._tropCount = (this._tropCount || 0) + 1;
      const vals = [0.42, 0.89, 1.64, 2.31, 3.08, 3.52, 3.41];
      const v = vals[Math.min(this._tropCount - 1, vals.length - 1)] + randRange(-0.05, 0.05);
      return [{ name:"Troponin I", value: +v.toFixed(2), unit:"ng/mL", ref:"<0.04", refLo:0, refHi:0.04 }];
    },
    bnp:     () => [{ name:"BNP", value: randRange(350,420,0), unit:"pg/mL", ref:"<100", refLo:0, refHi:100 }],
    ptinr:   () => [
      { name:"PT",  value: randRange(11.5,13.0), unit:"sec",  ref:"11.0-13.5", refLo:11.0, refHi:13.5 },
      { name:"INR", value: randRange(0.9,1.1),   unit:"",     ref:"0.9-1.1",   refLo:0.9,  refHi:1.1 },
    ],
    ptt:     () => [{ name:"PTT", value: randRange(28,35,0), unit:"sec", ref:"25-35", refLo:25, refHi:35 }],
    lactate: () => [{ name:"Lactate", value: randRange(1.2,1.8), unit:"mmol/L", ref:"0.5-2.0", refLo:0.5, refHi:2.0 }],
    mag:     () => [{ name:"Magnesium", value: randRange(1.8,2.2), unit:"mg/dL", ref:"1.7-2.2", refLo:1.7, refHi:2.2 }],
    lipase:  () => [{ name:"Lipase", value: randRange(18,42,0), unit:"U/L", ref:"0-60", refLo:0, refHi:60 }],
    ddimer:  () => [{ name:"D-Dimer", value: randRange(0.8,1.6), unit:"mg/L FEU", ref:"<0.50", refLo:0, refHi:0.50 }],
    a1c:     () => [{ name:"HbA1c", value: randRange(7.8,8.6), unit:"%", ref:"<5.7", refLo:0, refHi:5.7 }],
    cxr: () => [{ name:"CXR PA/Lateral", value:"Mild cardiomegaly. No acute infiltrate. No pneumothorax.", unit:"", ref:"",
      report:"CLINICAL INDICATION: Chest pain, rule out acute process.\n\nCOMPARISON: None available.\n\nFINDINGS:\nHeart: Mildly enlarged cardiac silhouette.\nLungs: Clear bilaterally. No focal consolidation, effusion, or pneumothorax.\nMediastinum: Normal contours. No widening.\nBones: Degenerative changes of thoracic spine. No acute fracture.\n\nIMPRESSION:\n1. Mild cardiomegaly.\n2. No acute cardiopulmonary process.",
      flag:"ABNORMAL", cat:"Imaging" }],
    ekg: () => [{ name:"EKG 12-Lead", value:"Sinus tachycardia at 98 bpm. ST depression V3-V6. T-wave inversions leads I, aVL, V5-V6. No ST elevation. Normal axis. Normal intervals.", unit:"", ref:"",
      report:"RATE: 98 bpm\nRHYTHM: Normal sinus\nAXIS: Normal\nINTERVALS: PR 164ms, QRS 88ms, QTc 448ms\n\nST CHANGES: Horizontal ST depression 1-2mm in V3-V6\nT-WAVE: Inversions in I, aVL, V5-V6\n\nINTERPRETATION: Sinus tachycardia with ST-T wave changes consistent with myocardial ischemia. Recommend serial troponins, cardiology consult.\n\nCritical value called to provider at [time].",
      flag:"ABNORMAL", cat:"Diagnostic" }],
    ctca: () => [{ name:"CT Coronary Angiography", value:"LAD: 80% stenosis mid-segment. LCx: 40% proximal. RCA: patent.", unit:"", ref:"",
      report:"CLINICAL INDICATION: NSTEMI, evaluate coronary anatomy.\n\nTECHNIQUE: ECG-gated CT coronary angiography with IV contrast.\n\nFINDINGS:\nLeft Main: Patent, no significant stenosis.\nLAD: 80% stenosis in mid-segment with mixed plaque. Distal LAD patent.\nLCx: 40% stenosis proximal segment, non-flow-limiting.\nRCA: Patent throughout. Dominant RCA.\n\nCalcium Score: 342 Agatston units (moderate).\n\nIMPRESSION:\n1. Significant LAD stenosis (80%) — correlate with symptoms, recommend cardiology/interventional evaluation.\n2. Mild LCx disease.\n3. Moderate coronary calcium burden.",
      flag:"ABNORMAL", cat:"Imaging" }],
    ts: () => [{ name:"Type and Screen", value:"Type A Positive. Antibody screen negative.", unit:"", ref:"", flag:"NORMAL", cat:"Lab" }],
  },

  // ─── P002: Marcus Johnson — Colles Fracture ───
  P002: {
    cbc: () => [
      { name:"WBC",        value: randRange(8.5,10.5), unit:"K/uL", ref:"4.5-11.0", refLo:4.5, refHi:11.0 },
      { name:"Hemoglobin", value: randRange(14.2,15.2),unit:"g/dL", ref:"13.5-17.5",refLo:13.5,refHi:17.5 },
      { name:"Hematocrit", value: randRange(42,46),    unit:"%",    ref:"38.3-48.6",refLo:38.3,refHi:48.6 },
      { name:"Platelets",  value: randRange(290,330),  unit:"K/uL", ref:"150-400",  refLo:150, refHi:400 },
    ],
    bmp: () => [
      { name:"Sodium",     value: randRange(138,142,0), unit:"mEq/L",ref:"136-145",refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(3.8,4.4),   unit:"mEq/L",ref:"3.5-5.0",refLo:3.5,refHi:5.0 },
      { name:"Creatinine", value: randRange(0.9,1.1),   unit:"mg/dL",ref:"0.7-1.3",refLo:0.7,refHi:1.3 },
      { name:"Glucose",    value: randRange(95,115,0),   unit:"mg/dL",ref:"70-100", refLo:70, refHi:100 },
    ],
    cmp: () => [
      { name:"Sodium",     value: randRange(138,142,0), unit:"mEq/L",ref:"136-145", refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(3.8,4.4),   unit:"mEq/L",ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
      { name:"Creatinine", value: randRange(0.9,1.1),   unit:"mg/dL",ref:"0.7-1.3", refLo:0.7,refHi:1.3 },
      { name:"Glucose",    value: randRange(95,115,0),   unit:"mg/dL",ref:"70-100",  refLo:70, refHi:100 },
      { name:"AST",        value: randRange(20,32,0),    unit:"U/L",  ref:"10-40",   refLo:10, refHi:40 },
      { name:"ALT",        value: randRange(18,28,0),    unit:"U/L",  ref:"7-56",    refLo:7,  refHi:56 },
    ],
    ptinr: () => [
      { name:"PT",  value: randRange(11.0,12.5), unit:"sec",ref:"11.0-13.5",refLo:11.0,refHi:13.5 },
      { name:"INR", value: randRange(0.9,1.0),   unit:"",   ref:"0.9-1.1",  refLo:0.9, refHi:1.1 },
    ],
    xrext: () => [{ name:"XR Right Forearm 2-View", value:"Displaced distal radius fracture with dorsal angulation (Colles type). Ulna intact.", unit:"", ref:"",
      report:"CLINICAL INDICATION: Fall, right arm deformity and pain.\n\nFINDINGS:\nDistal Radius: Displaced transverse fracture of the distal radius approximately 2.5cm proximal to the articular surface with dorsal angulation of approximately 25 degrees and 8mm of dorsal displacement. Comminution of the dorsal cortex is present.\nUlna: Intact. No fracture.\nUlnar styloid: Small avulsion fracture of the ulnar styloid tip.\nCarpal bones: No acute fracture. Alignment preserved.\nSoft tissues: Moderate soft tissue swelling dorsal wrist.\n\nIMPRESSION:\n1. Displaced Colles fracture (distal radius) with dorsal angulation and displacement.\n2. Ulnar styloid tip avulsion.\n3. Recommend orthopedic consultation for reduction and fixation.\n\nCritical finding communicated to ED provider at [time].",
      flag:"ABNORMAL", cat:"Imaging" }],
    ts: () => [{ name:"Type and Screen", value:"Type O Positive. Antibody screen negative.", unit:"", ref:"", flag:"NORMAL", cat:"Lab" }],
    ekg: () => [{ name:"EKG 12-Lead", value:"Normal sinus rhythm at 82 bpm. No ST changes. Normal intervals.", unit:"", ref:"",
      report:"RATE: 82 bpm\nRHYTHM: Normal sinus\nAXIS: Normal\nINTERVALS: PR 156ms, QRS 84ms, QTc 412ms\nST/T CHANGES: None\n\nINTERPRETATION: Normal EKG.",
      flag:"NORMAL", cat:"Diagnostic" }],
    cxr: () => [{ name:"CXR PA/Lateral", value:"No acute cardiopulmonary abnormality.", unit:"", ref:"",
      report:"FINDINGS: Heart size normal. Lungs clear. No effusion or pneumothorax.\n\nIMPRESSION: Normal chest radiograph.", flag:"NORMAL", cat:"Imaging" }],
  },

  // ─── P003: Lisa Chen — Pneumonia/COPD ───
  P003: {
    cbc: () => [
      { name:"WBC",        value: randRange(15.5,18.0), unit:"K/uL", ref:"4.5-11.0", refLo:4.5, refHi:11.0 },
      { name:"Hemoglobin", value: randRange(11.2,12.2), unit:"g/dL", ref:"12.0-16.0",refLo:12.0,refHi:16.0 },
      { name:"Hematocrit", value: randRange(34,37),     unit:"%",    ref:"36-46",    refLo:36,  refHi:46 },
      { name:"Platelets",  value: randRange(310,380),   unit:"K/uL", ref:"150-400",  refLo:150, refHi:400 },
      { name:"Neutrophils", value: randRange(78,88),    unit:"%",    ref:"40-70",    refLo:40,  refHi:70 },
      { name:"Bands",       value: randRange(8,14,0),   unit:"%",    ref:"0-5",      refLo:0,   refHi:5 },
    ],
    cmp: () => [
      { name:"Sodium",     value: randRange(134,138,0), unit:"mEq/L",ref:"136-145", refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(3.6,4.0),   unit:"mEq/L",ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
      { name:"CO2",        value: randRange(28,33,0),    unit:"mEq/L",ref:"22-28",   refLo:22, refHi:28 },
      { name:"BUN",        value: randRange(14,20,0),    unit:"mg/dL",ref:"7-20",    refLo:7,  refHi:20 },
      { name:"Creatinine", value: randRange(0.8,1.0),    unit:"mg/dL",ref:"0.6-1.2", refLo:0.6,refHi:1.2 },
      { name:"Glucose",    value: randRange(135,155,0),  unit:"mg/dL",ref:"70-100",  refLo:70, refHi:100 },
      { name:"AST",        value: randRange(22,30,0),    unit:"U/L",  ref:"10-40",   refLo:10, refHi:40 },
      { name:"ALT",        value: randRange(18,26,0),    unit:"U/L",  ref:"7-56",    refLo:7,  refHi:56 },
    ],
    bmp: () => [
      { name:"Sodium",     value: randRange(134,138,0), unit:"mEq/L",ref:"136-145", refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(3.6,4.0),   unit:"mEq/L",ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
      { name:"Creatinine", value: randRange(0.8,1.0),    unit:"mg/dL",ref:"0.6-1.2", refLo:0.6,refHi:1.2 },
      { name:"Glucose",    value: randRange(135,155,0),  unit:"mg/dL",ref:"70-100",  refLo:70, refHi:100 },
    ],
    procal: () => [{ name:"Procalcitonin", value: randRange(2.0,3.2), unit:"ng/mL", ref:"<0.10", refLo:0, refHi:0.10 }],
    lactate: () => [{ name:"Lactate", value: randRange(2.4,3.2), unit:"mmol/L", ref:"0.5-2.0", refLo:0.5, refHi:2.0 }],
    bcx:  () => [{ name:"Blood Culture x2", value:"Pending — no growth at [time elapsed]", unit:"", ref:"", flag:"PENDING", cat:"Lab", isPending:true }],
    ucx:  () => [{ name:"Urine Culture", value:"Pending", unit:"", ref:"", flag:"PENDING", cat:"Lab", isPending:true }],
    ua:   () => [
      { name:"UA — Appearance", value:"Clear", unit:"", ref:"Clear", refLo:null, refHi:null },
      { name:"UA — WBC",        value:"0-2", unit:"/HPF", ref:"0-5", refLo:0, refHi:5 },
      { name:"UA — Bacteria",   value:"None", unit:"", ref:"None", refLo:null, refHi:null },
    ],
    crp: () => [{ name:"CRP", value: randRange(12,22), unit:"mg/dL", ref:"<0.5", refLo:0, refHi:0.5 }],
    abg: () => [
      { name:"ABG pH",   value: randRange(7.32,7.38,2), unit:"",     ref:"7.35-7.45", refLo:7.35, refHi:7.45 },
      { name:"ABG pCO2", value: randRange(48,56,0),     unit:"mmHg", ref:"35-45",     refLo:35,   refHi:45 },
      { name:"ABG pO2",  value: randRange(58,66,0),     unit:"mmHg", ref:"80-100",    refLo:80,   refHi:100 },
      { name:"ABG HCO3", value: randRange(26,30,0),     unit:"mEq/L",ref:"22-26",     refLo:22,   refHi:26 },
    ],
    vbg: () => [
      { name:"VBG pH",   value: randRange(7.30,7.36,2), unit:"",     ref:"7.31-7.41", refLo:7.31, refHi:7.41 },
      { name:"VBG pCO2", value: randRange(50,60,0),     unit:"mmHg", ref:"41-51",     refLo:41,   refHi:51 },
    ],
    cxr: () => [{ name:"CXR PA/Lateral", value:"Right lower lobe consolidation with air bronchograms. Small right pleural effusion.", unit:"", ref:"",
      report:"CLINICAL INDICATION: Fever, productive cough, dyspnea. History of COPD.\n\nCOMPARISON: None.\n\nFINDINGS:\nLungs: Dense consolidation in the right lower lobe with air bronchograms. No left lung consolidation. Hyperinflation with flattened diaphragms bilaterally consistent with COPD.\nPleura: Small right-sided pleural effusion layering dependently.\nHeart: Normal size.\nMediastinum: Normal.\n\nIMPRESSION:\n1. Right lower lobe pneumonia.\n2. Small right parapneumonic effusion.\n3. Hyperinflated lungs consistent with COPD.",
      flag:"ABNORMAL", cat:"Imaging" }],
    ekg: () => [{ name:"EKG 12-Lead", value:"Sinus tachycardia 105 bpm. Right axis deviation. Low voltage in limb leads. P-pulmonale.", unit:"", ref:"",
      report:"RATE: 105 bpm\nRHYTHM: Sinus tachycardia\nAXIS: Right axis deviation\nINTERVALS: PR 168ms, QRS 86ms, QTc 432ms\nP-WAVE: Peaked P-waves (P-pulmonale) in II, III, aVF\nST/T: No acute ST changes\n\nINTERPRETATION: Sinus tachycardia with findings suggestive of right heart strain/cor pulmonale. Correlate clinically.",
      flag:"ABNORMAL", cat:"Diagnostic" }],
  },

  // ─── P004: Robert Williams — Septic Shock ───
  P004: {
    cbc: () => [
      { name:"WBC",        value: randRange(20.0,25.0), unit:"K/uL", ref:"4.5-11.0", refLo:4.5, refHi:11.0 },
      { name:"Hemoglobin", value: randRange(10.2,11.5), unit:"g/dL", ref:"13.5-17.5",refLo:13.5,refHi:17.5 },
      { name:"Hematocrit", value: randRange(31,35),     unit:"%",    ref:"38.3-48.6",refLo:38.3,refHi:48.6 },
      { name:"Platelets",  value: randRange(98,140),    unit:"K/uL", ref:"150-400",  refLo:150, refHi:400 },
      { name:"Neutrophils", value: randRange(82,92),    unit:"%",    ref:"40-70",    refLo:40,  refHi:70 },
      { name:"Bands",       value: randRange(12,20,0),  unit:"%",    ref:"0-5",      refLo:0,   refHi:5 },
    ],
    cmp: () => [
      { name:"Sodium",     value: randRange(131,136,0),  unit:"mEq/L",ref:"136-145", refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(4.8,5.6),    unit:"mEq/L",ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
      { name:"CO2",        value: randRange(16,20,0),     unit:"mEq/L",ref:"22-28",   refLo:22, refHi:28 },
      { name:"BUN",        value: randRange(42,58,0),     unit:"mg/dL",ref:"7-20",    refLo:7,  refHi:20 },
      { name:"Creatinine", value: randRange(2.5,3.2),     unit:"mg/dL",ref:"0.6-1.2", refLo:0.6,refHi:1.2 },
      { name:"Glucose",    value: randRange(65,85,0),     unit:"mg/dL",ref:"70-100",  refLo:70, refHi:100 },
      { name:"AST",        value: randRange(68,95,0),     unit:"U/L",  ref:"10-40",   refLo:10, refHi:40 },
      { name:"ALT",        value: randRange(52,78,0),     unit:"U/L",  ref:"7-56",    refLo:7,  refHi:56 },
      { name:"Alk Phos",   value: randRange(110,150,0),   unit:"U/L",  ref:"44-147",  refLo:44, refHi:147 },
      { name:"Total Bilirubin", value:randRange(1.8,2.8), unit:"mg/dL",ref:"0.1-1.2", refLo:0.1,refHi:1.2 },
      { name:"Albumin",    value: randRange(2.2,2.8),     unit:"g/dL", ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
    ],
    bmp: () => [
      { name:"Sodium",     value: randRange(131,136,0),  unit:"mEq/L",ref:"136-145", refLo:136,refHi:145 },
      { name:"Potassium",  value: randRange(4.8,5.6),    unit:"mEq/L",ref:"3.5-5.0", refLo:3.5,refHi:5.0 },
      { name:"Creatinine", value: randRange(2.5,3.2),     unit:"mg/dL",ref:"0.6-1.2", refLo:0.6,refHi:1.2 },
      { name:"Glucose",    value: randRange(65,85,0),     unit:"mg/dL",ref:"70-100",  refLo:70, refHi:100 },
    ],
    lactate: () => [{ name:"Lactate", value: randRange(4.0,5.5), unit:"mmol/L", ref:"0.5-2.0", refLo:0.5, refHi:2.0 }],
    procal:  () => [{ name:"Procalcitonin", value: randRange(10,18), unit:"ng/mL", ref:"<0.10", refLo:0, refHi:0.10 }],
    bcx:     () => [{ name:"Blood Culture x2", value:"Pending — no growth at [time elapsed]", unit:"", ref:"", flag:"PENDING", cat:"Lab", isPending:true,
      pendingFinal: { value:"POSITIVE: E. coli — pan-sensitive", flag:"CRITICAL", delay: 120000 } }],
    ucx:     () => [{ name:"Urine Culture", value:"Pending", unit:"", ref:"", flag:"PENDING", cat:"Lab", isPending:true,
      pendingFinal: { value:">100,000 CFU/mL E. coli — pan-sensitive", flag:"ABNORMAL", delay: 100000 } }],
    ua: () => [
      { name:"UA — Appearance",  value:"Cloudy",    unit:"", ref:"Clear",  refLo:null, refHi:null },
      { name:"UA — Color",       value:"Dark amber", unit:"", ref:"Yellow", refLo:null, refHi:null },
      { name:"UA — Nitrites",    value:"Positive",   unit:"", ref:"Negative", flag:"ABNORMAL" },
      { name:"UA — Leuk Esterase", value:"3+",       unit:"", ref:"Negative", flag:"ABNORMAL" },
      { name:"UA — WBC",         value:">100",       unit:"/HPF", ref:"0-5",  refLo:0, refHi:5 },
      { name:"UA — Bacteria",    value:"3+",         unit:"", ref:"None",     flag:"ABNORMAL" },
      { name:"UA — RBC",         value:"5-10",       unit:"/HPF", ref:"0-3",  refLo:0, refHi:3 },
    ],
    ptinr: () => [
      { name:"PT",  value: randRange(14.5,16.5), unit:"sec", ref:"11.0-13.5", refLo:11.0, refHi:13.5 },
      { name:"INR", value: randRange(1.3,1.5),   unit:"",    ref:"0.9-1.1",   refLo:0.9,  refHi:1.1 },
    ],
    fib: () => [{ name:"Fibrinogen", value: randRange(480,620,0), unit:"mg/dL", ref:"200-400", refLo:200, refHi:400 }],
    vbg: () => [
      { name:"VBG pH",   value: randRange(7.24,7.30,2), unit:"",     ref:"7.31-7.41", refLo:7.31, refHi:7.41 },
      { name:"VBG pCO2", value: randRange(32,38,0),     unit:"mmHg", ref:"41-51",     refLo:41,   refHi:51 },
      { name:"VBG Lactate", value: randRange(4.0,5.5),  unit:"mmol/L",ref:"0.5-2.0",  refLo:0.5,  refHi:2.0 },
    ],
    cxr: () => [{ name:"CXR Portable AP", value:"Low lung volumes. No focal consolidation. Mild pulmonary vascular congestion.", unit:"", ref:"",
      report:"CLINICAL INDICATION: Sepsis, evaluate for pneumonia.\n\nFINDINGS:\nHeart: Top normal size (limited by AP technique).\nLungs: Low lung volumes. No focal consolidation. Mild perihilar vascular congestion. No pleural effusion.\n\nIMPRESSION: No pneumonia. Mild pulmonary vascular congestion — correlate with fluid status.",
      flag:"ABNORMAL", cat:"Imaging" }],
    ekg: () => [{ name:"EKG 12-Lead", value:"Atrial fibrillation with rapid ventricular response at 118 bpm. Nonspecific ST-T changes. Left axis.", unit:"", ref:"",
      report:"RATE: 118 bpm (ventricular)\nRHYTHM: Atrial fibrillation\nAXIS: Left axis deviation\nINTERVALS: QRS 92ms, QTc 468ms\nST/T: Diffuse nonspecific ST-T wave changes\nOTHER: No acute ST elevation. Low voltage in limb leads.\n\nINTERPRETATION: AFib with RVR. Nonspecific ST-T changes — may be rate-related vs demand ischemia in setting of sepsis.",
      flag:"ABNORMAL", cat:"Diagnostic" }],
  },
};

// Fallback generic results for any order not specifically mapped
const GENERIC_RESULTS = {
  lipase:  () => [{ name:"Lipase", value: randRange(15,55,0), unit:"U/L", ref:"0-60", refLo:0, refHi:60 }],
  ddimer:  () => [{ name:"D-Dimer", value: randRange(0.2,0.4), unit:"mg/L FEU", ref:"<0.50", refLo:0, refHi:0.50 }],
  ts:      () => [{ name:"Type and Screen", value:"Pending crossmatch", unit:"", ref:"", flag:"PENDING", cat:"Lab", isPending:true }],
  uds:     () => [{ name:"Urine Drug Screen", value:"Negative all panels", unit:"", ref:"Negative", flag:"NORMAL", cat:"Lab" }],
  ammonia: () => [{ name:"Ammonia", value: randRange(18,35,0), unit:"umol/L", ref:"15-45", refLo:15, refHi:45 }],
  esr:     () => [{ name:"ESR", value: randRange(10,25,0), unit:"mm/hr", ref:"0-20", refLo:0, refHi:20 }],
  crp:     () => [{ name:"CRP", value: randRange(0.2,0.8), unit:"mg/dL", ref:"<0.5", refLo:0, refHi:0.5 }],
  tsh:     () => [{ name:"TSH", value: randRange(1.2,3.8), unit:"mIU/L", ref:"0.4-4.0", refLo:0.4, refHi:4.0 }],
  a1c:     () => [{ name:"HbA1c", value: randRange(5.0,5.6), unit:"%", ref:"<5.7", refLo:0, refHi:5.7 }],
  mag:     () => [{ name:"Magnesium", value: randRange(1.8,2.1), unit:"mg/dL", ref:"1.7-2.2", refLo:1.7, refHi:2.2 }],
  phos:    () => [{ name:"Phosphorus", value: randRange(2.8,4.2), unit:"mg/dL", ref:"2.5-4.5", refLo:2.5, refHi:4.5 }],
  ptt:     () => [{ name:"PTT", value: randRange(26,34,0), unit:"sec", ref:"25-35", refLo:25, refHi:35 }],
  fib:     () => [{ name:"Fibrinogen", value: randRange(220,350,0), unit:"mg/dL", ref:"200-400", refLo:200, refHi:400 }],
  cthead:  () => [{ name:"CT Head w/o Contrast", value:"No acute intracranial abnormality.", unit:"", ref:"",
    report:"FINDINGS: No hemorrhage, mass, or midline shift. Ventricles normal in size. Age-appropriate parenchymal volume loss. No acute territorial infarct.\n\nIMPRESSION: No acute intracranial process.", flag:"NORMAL", cat:"Imaging" }],
  ctap:    () => [{ name:"CT Abdomen/Pelvis w/ Contrast", value:"No acute abdominal pathology.", unit:"", ref:"",
    report:"FINDINGS: Liver, spleen, pancreas, adrenals, and kidneys are unremarkable. No free fluid. No lymphadenopathy. Bowel gas pattern is nonobstructive.\n\nIMPRESSION: No acute abdominal or pelvic pathology.", flag:"NORMAL", cat:"Imaging" }],
  ctape:   () => [{ name:"CTA Chest (PE Protocol)", value:"No pulmonary embolism.", unit:"", ref:"",
    report:"FINDINGS: No filling defect in the main, lobar, segmental, or subsegmental pulmonary arteries. Heart chambers normal. No pericardial effusion.\n\nIMPRESSION: No pulmonary embolism.", flag:"NORMAL", cat:"Imaging" }],
  ctcsp:   () => [{ name:"CT C-Spine w/o Contrast", value:"No acute fracture or malalignment.", unit:"", ref:"",
    report:"FINDINGS: Vertebral body heights and alignment preserved C1-C7. No fracture. Disc spaces maintained. Prevertebral soft tissues normal.\n\nIMPRESSION: No acute cervical spine injury.", flag:"NORMAL", cat:"Imaging" }],
  usruq:   () => [{ name:"US RUQ", value:"Gallbladder normal. No biliary dilation.", unit:"", ref:"",
    report:"FINDINGS: Gallbladder is normal in size without wall thickening or pericholecystic fluid. No gallstones. CBD measures 4mm. Liver is normal in echotexture.\n\nIMPRESSION: Normal right upper quadrant ultrasound.", flag:"NORMAL", cat:"Imaging" }],
  xrpelvis:() => [{ name:"XR Pelvis AP", value:"No fracture or dislocation.", unit:"", ref:"",
    report:"FINDINGS: Bony pelvis intact. Hip joints maintained. No fracture or dislocation.\n\nIMPRESSION: Normal pelvis radiograph.", flag:"NORMAL", cat:"Imaging" }],
  fast:    () => [{ name:"US FAST Exam", value:"Negative — no free fluid.", unit:"", ref:"",
    report:"FINDINGS:\nRUQ (Morison's): No free fluid.\nLUQ (Splenorenal): No free fluid.\nPelvis (Suprapubic): No free fluid.\nSubxiphoid: No pericardial effusion.\n\nIMPRESSION: Negative FAST exam.", flag:"NORMAL", cat:"Imaging" }],
  echo:    () => [{ name:"Bedside Echo", value:"EF ~55%. No pericardial effusion. No RV dilation.", unit:"", ref:"",
    report:"BEDSIDE LIMITED ECHOCARDIOGRAM\nLV function: Grossly normal, EF estimated 55%.\nRV: Normal size and function.\nPericardium: No effusion.\nIVC: Normal diameter with respiratory variation.\n\nIMPRESSION: Grossly normal cardiac function. No effusion.", flag:"NORMAL", cat:"Diagnostic" }],
  lp:      () => [
    { name:"CSF — Appearance", value:"Clear, colorless", unit:"", ref:"Clear", flag:"NORMAL", cat:"Lab" },
    { name:"CSF — WBC",        value:"2",   unit:"/uL", ref:"0-5",   refLo:0, refHi:5 },
    { name:"CSF — RBC",        value:"0",   unit:"/uL", ref:"0",     refLo:0, refHi:0 },
    { name:"CSF — Protein",    value:"32",  unit:"mg/dL", ref:"15-45", refLo:15, refHi:45 },
    { name:"CSF — Glucose",    value:"65",  unit:"mg/dL", ref:"40-80", refLo:40, refHi:80 },
  ],
};


// ─── SEED PATIENTS ───
const SEED_PATIENTS = [
  {
    id:"P001", name:"Martinez, Elena", mrn:"MRN-482910", dob:"1958-03-14", age:67, sex:"F",
    location:"ED-Bay 12", encounter:"ENC-90421", status:"Active", acuity:"ESI-2",
    chief:"Chest pain, diaphoresis × 2 hrs",
    triage:"67F presenting with acute onset substernal chest pain radiating to left arm with associated diaphoresis and nausea. Pain started 2 hours ago while at rest. Hx HTN, DM2, HLD. Takes ASA 81mg daily. Pain is 8/10, pressure-like. EKG obtained at triage showing ST depression V3-V6.",
    allergies:[
      { agent:"Penicillin", reaction:"Anaphylaxis", severity:"High" },
      { agent:"Sulfa drugs", reaction:"Rash/Urticaria", severity:"Moderate" },
    ],
    alerts:["Fall Risk","DVT Prophylaxis Required","Cardiac Alert"],
    problems:["Hypertension","Type 2 Diabetes Mellitus","Hyperlipidemia","GERD","Osteoarthritis bilateral knees","Obesity (BMI 32)"],
    homeMeds:[
      { name:"Lisinopril 20mg", route:"PO", freq:"Daily" },
      { name:"Metformin 1000mg", route:"PO", freq:"BID" },
      { name:"Atorvastatin 40mg", route:"PO", freq:"QHS" },
      { name:"Omeprazole 20mg", route:"PO", freq:"Daily" },
      { name:"Aspirin 81mg", route:"PO", freq:"Daily" },
      { name:"Amlodipine 5mg", route:"PO", freq:"Daily" },
    ],
    vitalsBase:{ hr:102, sbp:168, dbp:94, rr:22, spo2:94, temp:98.8, pain:8 },
    vitalsHistory:[
      { time:"14:32", hr:102, bp:"168/94", rr:22, spo2:94, temp:98.8, pain:8, src:"Triage" },
      { time:"14:50", hr:98,  bp:"162/90", rr:20, spo2:95, temp:98.7, pain:7, src:"RN" },
      { time:"15:15", hr:94,  bp:"155/88", rr:18, spo2:96, temp:98.6, pain:5, src:"RN" },
    ],
    // Pre-seeded results (already resulted at start of sim)
    preResults:[
      { name:"Troponin I", value:"0.42", unit:"ng/mL", ref:"<0.04", flag:"CRITICAL", time:"14:45", ack:false, cat:"Lab" },
      { name:"EKG 12-Lead", value:"ST depression V3-V6. T-wave inversions lateral leads. Sinus tach 98.", flag:"ABNORMAL", time:"14:40", ack:false, cat:"Diagnostic",
        report:"RATE: 98 bpm\nRHYTHM: Sinus tachycardia\nST: Horizontal ST depression 1-2mm V3-V6\nT-WAVE: Inversions I, aVL, V5-V6\n\nINTERPRETATION: Ischemic changes consistent with NSTEMI." },
    ],
    edCourse:"",
    notes:[],
    imaging:[],
  },
  {
    id:"P002", name:"Johnson, Marcus", mrn:"MRN-738201", dob:"1985-11-22", age:40, sex:"M",
    location:"ED-Bay 5", encounter:"ENC-90422", status:"Active", acuity:"ESI-3",
    chief:"Fall from ladder — right arm deformity, laceration",
    triage:"40M fell approximately 8 feet from a ladder while cleaning gutters. Landed on outstretched right hand. Obvious deformity of right distal forearm. 4cm laceration to right forearm, controlled with direct pressure. Neurovascularly intact distally. Tetanus unknown. No LOC, no head strike, no neck pain.",
    allergies:[{ agent:"Codeine", reaction:"Nausea/Vomiting", severity:"Moderate" }],
    alerts:["Tetanus Due"],
    problems:["Asthma (mild intermittent)","Seasonal allergic rhinitis"],
    homeMeds:[
      { name:"Albuterol MDI", route:"INH", freq:"PRN" },
      { name:"Cetirizine 10mg", route:"PO", freq:"Daily" },
    ],
    vitalsBase:{ hr:110, sbp:148, dbp:92, rr:20, spo2:98, temp:98.4, pain:9 },
    vitalsHistory:[
      { time:"13:10", hr:110, bp:"148/92", rr:20, spo2:98, temp:98.4, pain:9, src:"Triage" },
      { time:"13:35", hr:98,  bp:"138/86", rr:18, spo2:99, temp:98.5, pain:7, src:"RN" },
      { time:"14:00", hr:88,  bp:"132/82", rr:16, spo2:99, temp:98.4, pain:5, src:"RN" },
    ],
    preResults:[],
    edCourse:"",
    notes:[],
    imaging:[],
  },
  {
    id:"P003", name:"Chen, Lisa", mrn:"MRN-219384", dob:"1972-07-08", age:53, sex:"F",
    location:"ED-Bay 8", encounter:"ENC-90423", status:"Active", acuity:"ESI-2",
    chief:"Acute dyspnea, productive cough × 3 days, fever 101.8°F",
    triage:"53F with COPD (moderate, 1ppd × 30yr smoker) presenting with worsening dyspnea and productive cough with yellow-green sputum × 3 days. Fever at home 101.8. SpO2 88% on RA at triage, improved to 91% on 2L NC. Using accessory muscles. Able to speak in short sentences.",
    allergies:[],
    alerts:["Isolation: Droplet Precautions","Supplemental O2 Required"],
    problems:["COPD (moderate — GOLD Stage II)","Current smoker (1 ppd × 30 yrs)","Osteoporosis","Major Depressive Disorder","Vitamin D deficiency"],
    homeMeds:[
      { name:"Tiotropium 18mcg inhaler", route:"INH", freq:"Daily" },
      { name:"Fluticasone/Salmeterol 250/50", route:"INH", freq:"BID" },
      { name:"Albuterol nebulizer", route:"INH", freq:"PRN" },
      { name:"Sertraline 100mg", route:"PO", freq:"Daily" },
      { name:"Alendronate 70mg", route:"PO", freq:"Weekly (Sundays)" },
      { name:"Vitamin D3 2000 IU", route:"PO", freq:"Daily" },
    ],
    vitalsBase:{ hr:108, sbp:130, dbp:78, rr:28, spo2:88, temp:101.8, pain:4 },
    vitalsHistory:[
      { time:"12:45", hr:108, bp:"130/78", rr:28, spo2:88, temp:101.8, pain:4, src:"Triage" },
      { time:"13:15", hr:102, bp:"128/76", rr:24, spo2:91, temp:101.4, pain:3, src:"RN" },
      { time:"14:00", hr:96,  bp:"126/74", rr:22, spo2:93, temp:100.8, pain:2, src:"RN" },
    ],
    preResults:[],
    edCourse:"",
    notes:[],
    imaging:[],
  },
  {
    id:"P004", name:"Williams, Robert", mrn:"MRN-605827", dob:"1945-01-30", age:81, sex:"M",
    location:"ICU-Bed 3", encounter:"ENC-90420", status:"Active", acuity:"ESI-1",
    chief:"Transfer from ED — septic shock, UTI source, on vasopressors",
    triage:"81M transferred from ED to ICU. Presented with AMS (GCS 13), fever 103.1, hypotension MAP 52. Found to have UTI-source sepsis → septic shock requiring vasopressors. 30mL/kg NS bolus given in ED. Norepinephrine started. Broad-spectrum abx initiated. Foley placed — purulent urine.",
    allergies:[
      { agent:"Vancomycin", reaction:"Red Man Syndrome", severity:"Moderate" },
      { agent:"Iodine contrast", reaction:"Hives/Urticaria", severity:"Moderate" },
    ],
    alerts:["Fall Risk","Code Status: FULL CODE","Vasopressors Active","Central Line In Situ","Contact Isolation"],
    problems:["Benign prostatic hyperplasia","Atrial fibrillation (chronic, on anticoagulation)","CHF — HFrEF (EF 35%)","CKD Stage 3b (baseline Cr 1.8)","Mild Alzheimer's dementia","Recurrent UTIs","Gout"],
    homeMeds:[
      { name:"Apixaban 5mg", route:"PO", freq:"BID" },
      { name:"Carvedilol 12.5mg", route:"PO", freq:"BID" },
      { name:"Furosemide 40mg", route:"PO", freq:"Daily" },
      { name:"Tamsulosin 0.4mg", route:"PO", freq:"QHS" },
      { name:"Donepezil 10mg", route:"PO", freq:"QHS" },
      { name:"Allopurinol 100mg", route:"PO", freq:"Daily" },
    ],
    vitalsBase:{ hr:118, sbp:78, dbp:50, rr:26, spo2:92, temp:103.1, pain:6 },
    vitalsHistory:[
      { time:"10:00", hr:118, bp:"78/50",  rr:26, spo2:92, temp:103.1, pain:6, src:"ED Triage" },
      { time:"11:00", hr:110, bp:"85/55",  rr:24, spo2:94, temp:102.4, pain:5, src:"ED RN" },
      { time:"12:00", hr:102, bp:"92/60",  rr:22, spo2:95, temp:101.6, pain:4, src:"ICU RN" },
    ],
    preResults:[
      { name:"WBC", value:"22.4", unit:"K/uL", ref:"4.5-11.0", flag:"CRITICAL", time:"10:15", ack:false, cat:"Lab" },
      { name:"Lactate", value:"4.6", unit:"mmol/L", ref:"0.5-2.0", flag:"CRITICAL", time:"10:15", ack:false, cat:"Lab" },
      { name:"Creatinine", value:"2.8", unit:"mg/dL", ref:"0.6-1.2", flag:"HIGH", time:"10:20", ack:false, cat:"Lab" },
      { name:"Procalcitonin", value:"12.8", unit:"ng/mL", ref:"<0.10", flag:"CRITICAL", time:"10:25", ack:false, cat:"Lab" },
      { name:"Urinalysis", value:"Positive nitrites, >100 WBC, bacteria 3+, leuk esterase 3+", flag:"ABNORMAL", time:"10:30", ack:false, cat:"Lab" },
      { name:"Blood Cx x2", value:"Pending — no growth", flag:"PENDING", time:"10:10", ack:false, cat:"Lab" },
    ],
    edCourse:"81M with hx AFib, HFrEF (EF 35%), CKD3b, BPH presenting with AMS, fever 103.1, hypotension (MAP 52). Found to have UTI source sepsis → septic shock. 30mL/kg IVF bolus given. Started on norepinephrine. Meropenem initiated (VRE risk given recurrent UTIs, avoids vancomycin per allergy). Foley placed — grossly purulent urine. Labs notable for WBC 22.4, lactate 4.6, Cr 2.8 (baseline 1.8), procal 12.8. Transferred to ICU for vasopressor management and close monitoring.",
    notes:[],
    imaging:[],
  },
];


// ─── NOTE TEMPLATES ───
const NOTE_TEMPLATES = {
  "ED Provider Note": `CHIEF COMPLAINT: [complaint]

HISTORY OF PRESENT ILLNESS:
[age][sex] with PMH significant for [problems] who presents to the ED with [complaint].

[Onset, location, duration, character, aggravating/alleviating factors, radiation, timing, severity]

Associated symptoms: [positive/negative pertinents]

REVIEW OF SYSTEMS:
Constitutional: [+/- fever, chills, weight loss, fatigue]
HEENT: [findings]
Cardiovascular: [+/- chest pain, palpitations, edema]
Pulmonary: [+/- dyspnea, cough, wheezing]
GI: [+/- nausea, vomiting, abdominal pain, diarrhea]
GU: [+/- dysuria, frequency, hematuria]
MSK: [+/- pain, swelling, ROM limitation]
Neuro: [+/- headache, dizziness, weakness, numbness]
Psych: [+/- SI/HI, anxiety, depression]
All other systems reviewed and negative unless noted above.

PHYSICAL EXAMINATION:
General: [appearance, distress level]
Vitals: [HR, BP, RR, SpO2, Temp, Pain]
HEENT: [PERRL, EOMI, TMs, oropharynx]
Neck: [supple, ROM, JVD, lymphadenopathy]
Cardiovascular: [rate, rhythm, murmurs, peripheral pulses]
Pulmonary: [effort, breath sounds, wheezes, rales]
Abdomen: [soft/rigid, tenderness, distension, BS]
Extremities: [edema, deformity, pulses, sensation, motor]
Skin: [color, temperature, moisture, lesions]
Neurological: [CN II-XII, strength, sensation, gait, coordination]

DIAGNOSTICS:
[Labs, imaging, EKG interpretation]

EMERGENCY DEPARTMENT COURSE:
[Interventions, responses, consultations]

MEDICAL DECISION MAKING:
[Assessment, differential, risk stratification, reasoning]

DIAGNOSIS:
1. [Primary]
2. [Secondary]

PLAN:
[Disposition, orders, consults, follow-up]

ED Attending Physician: _______________
Time of evaluation: _______________`,

  "Nursing Assessment": `NURSING ASSESSMENT
Date/Time: [time]
Patient: [name] | MRN: [mrn]
Chief Complaint: [complaint]

PRIMARY SURVEY:
A — Airway: [patent / compromised / intubated]
B — Breathing: Rate [rr], effort [normal/labored/accessory muscles], SpO2 [spo2]% on [RA/NC/NRB]
C — Circulation: HR [hr], BP [bp], skin [warm-dry / cool-clammy / mottled], cap refill [<2s / >2s]
D — Disability: GCS [score] (E__ V__ M__), pupils [PERRL / abnormal]
E — Exposure: Temp [temp]°F, skin exam [findings]

SECONDARY ASSESSMENT:
Pain: [location] [scale]/10, [quality: sharp/dull/pressure/burning], [onset, radiation]
Neuro: [orientation x1-4], [behavior: calm/agitated/confused/obtunded]
Cardiovascular: [rhythm on monitor], [edema], [IV access: site, gauge, fluids running]
Respiratory: [breath sounds], [O2 delivery device and flow rate]
GI/GU: [last BM], [diet tolerance], [foley Y/N, urine output]
Skin: [integrity], [wounds/surgical sites], [pressure injury risk]
Safety: [fall risk score], [restraints Y/N], [isolation type], [bed alarm], [side rails]

INTERVENTIONS PERFORMED:
[ ] IV access obtained — [site, gauge]
[ ] Labs drawn
[ ] Medications administered — [list]
[ ] O2 applied — [device, flow]
[ ] Monitoring initiated — [tele, pulse ox, etc.]
[ ] Other: _______________

REASSESSMENT PLAN:
[Vitals frequency, neuro checks, reassess pain at ___]

Nurse: _______________`,

  "Progress Note": `PROGRESS NOTE
Date/Time: [datetime]
Provider: _______________

SUBJECTIVE:
Patient reports [symptoms/complaints/changes since last assessment].
[Current pain level, new concerns, response to treatments]

OBJECTIVE:
Vitals: HR ___ | BP ___/___ | RR ___ | SpO2 ___% on ___ | Temp ___°F
General: [appearance]
Pertinent exam: [focused findings relevant to chief complaint]
New results: [labs, imaging since last note]
I&O (if applicable): [intake/output]

ASSESSMENT:
[Problem-based assessment with current status]

PLAN:
[Changes to orders, new medications, pending results, consultations, disposition update]

Provider: _______________`,

  "Procedure Note": `PROCEDURE NOTE

Procedure: [name]
Date/Time: [datetime]
Provider: [name, credentials]
Indication: [clinical reason]
Consent: [informed consent obtained — verbal / written / emergency waiver]
Timeout performed: ☐ Yes — confirmed patient, procedure, site, allergies, antibiotics

PREPARATION:
Position: [supine / lateral / sitting]
Sterile technique: [full sterile / clean / NA]
Anesthesia: [local with ___ / conscious sedation / none]
Monitoring: [continuous SpO2, cardiac monitor, etc.]

TECHNIQUE:
[Step-by-step description of procedure performed]

FINDINGS:
[What was observed during the procedure]

SPECIMENS:
[Sent to lab / pathology / none]

COMPLICATIONS:
[None / describe]

ESTIMATED BLOOD LOSS: [volume or minimal]

POST-PROCEDURE:
[Vitals stable, patient tolerated well, post-procedure orders, monitoring plan]
[Post-procedure imaging ordered: Y/N]

Provider: _______________`,

  "Discharge Summary": `DISCHARGE SUMMARY

PATIENT: [name] | MRN: [mrn] | DOB: [dob]
ADMISSION DATE: _______________
DISCHARGE DATE: _______________
LENGTH OF STAY: ___ days
ATTENDING: _______________

DISCHARGE DIAGNOSIS:
1. [Primary]
2. [Secondary]

HOSPITAL COURSE:
[Brief narrative of admission reason, key findings, treatments, and clinical trajectory]

SIGNIFICANT RESULTS:
[Key lab values, imaging findings, pathology]

PROCEDURES PERFORMED:
[List with dates]

DISCHARGE MEDICATIONS:
[Complete list with changes highlighted]

DISCHARGE CONDITION:
[Stable / Improved / Unchanged]
Activity: [Restrictions]
Diet: [Type]

FOLLOW-UP:
[Provider, specialty, timeframe]

PATIENT EDUCATION:
[Key instructions, return precautions]

PENDING RESULTS AT DISCHARGE:
[Cultures, pathology, etc.]

Dictated by: _______________`,
};


// ─── SMART PHRASES ───
const SMART_PHRASES = {
  ".nml":     "Within normal limits.",
  ".nad":     "No acute distress. Patient is comfortable, alert, and cooperative.",
  ".rrr":     "Regular rate and rhythm. No murmurs, rubs, or gallops.",
  ".ctab":    "Clear to auscultation bilaterally. No wheezes, rales, or rhonchi.",
  ".soft":    "Soft, non-tender, non-distended. Normoactive bowel sounds in all four quadrants.",
  ".aox3":    "Alert and oriented to person, place, and time.",
  ".aox4":    "Alert and oriented to person, place, time, and situation.",
  ".perrla":  "Pupils equal, round, and reactive to light and accommodation. 3mm → 2mm bilaterally.",
  ".neuro":   "Cranial nerves II-XII grossly intact. Sensation intact to light touch in all extremities. Motor strength 5/5 in all extremities. Gait not assessed.",
  ".skin":    "Warm, dry, and intact. No rashes, lesions, or breakdown noted. Capillary refill < 2 seconds.",
  ".educ":    "Patient educated on diagnosis, treatment plan, expected course, and return precautions. Patient verbalized understanding and agreement with plan. Questions answered.",
  ".ivaccess":"Peripheral IV access obtained: 18g right antecubital fossa, flushed with 10mL NS, patent without infiltration.",
  ".fallrisk":"Fall risk assessment completed. Patient is [low/moderate/high] risk. Appropriate precautions implemented including bed in low position, call light within reach, non-skid footwear provided.",
  ".painass": "Pain assessment: Location [___], Quality [sharp/dull/burning/aching], Severity [___/10], Onset [___], Duration [___], Radiation [Y/N — where], Aggravating factors [___], Alleviating factors [___].",
  ".codestat":"Code status discussed with patient/family. Patient is FULL CODE. Wishes documented.",
  ".dispo":   "Disposition discussed with patient. Patient agreeable to plan. Discharge instructions reviewed including return precautions: return to ED for [worsening symptoms, fever, new symptoms].",
  ".sepsis":  "Sepsis screening positive. Hour-1 bundle initiated: lactate drawn, blood cultures obtained prior to antibiotics, broad-spectrum antibiotics administered, 30mL/kg crystalloid bolus initiated for hypotension/lactate ≥ 4.",
  ".stemi":   "STEMI alert activated. Cardiology notified. ASA 325mg administered. Heparin bolus and drip initiated. Cath lab team mobilized. Door-to-balloon time tracking initiated.",
  ".stroke":  "Stroke alert activated. Last known well: [time]. NIHSS score: [___]. CT Head obtained. Neurology consulted. tPA eligibility being assessed.",
};
