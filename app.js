/* ═══════════════════════════════════════════
   SimEHR — app.js  v2
   Fixes: scroll-on-order, filter persistence,
   full disposition workflows, surgical DOM updates
   ═══════════════════════════════════════════ */

// ─── STATE ───
const State = {
  patients: [],
  activePatientId: null,
  activeTab: "Summary",
  role: "Provider",
  unit: "ED",
  orders: {},
  results: {},
  notes: {},
  audit: [],
  cart: [],
  simClock: { startTime: Date.now(), speed: 2, paused: false, pausedTotal: 0, pausedAt: null },
  notifications: [],
  // Persisted filter states per tab
  filters: {
    ordersCat: "All",
    ordersSearch: "",
    resultsFilter: "All",
    resultsSearch: "",
    marFilter: "All",
    timelineFilter: "",
  },
  // Disposition state per patient
  dispo: {},
};

// ─── PERSISTENCE ───
function saveState() {
  try {
    const s = {
      v: SCHEMA_VERSION,
      patients: State.patients.map(p => ({
        id:p.id, edCourse:p.edCourse, vitalsHistory:p.vitalsHistory,
        location:p.location, status:p.status, dischargedAt:p.dischargedAt,
      })),
      orders: State.orders,
      results: State.results,
      notes: State.notes,
      audit: State.audit.slice(0, 200),
      dispo: State.dispo,
    };
    localStorage.setItem("simehr_state", JSON.stringify(s));
  } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem("simehr_state");
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.v !== SCHEMA_VERSION) { localStorage.removeItem("simehr_state"); return false; }
    State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
    (s.patients||[]).forEach(sp => {
      const pt = State.patients.find(p => p.id === sp.id);
      if (pt) {
        pt.edCourse = sp.edCourse || "";
        pt.location = sp.location || pt.location;
        pt.status = sp.status || pt.status;
        pt.dischargedAt = sp.dischargedAt || null;
        if (sp.vitalsHistory?.length > pt.vitalsHistory.length) pt.vitalsHistory = sp.vitalsHistory;
      }
    });
    State.orders = s.orders || {};
    State.results = s.results || {};
    State.notes = s.notes || {};
    State.audit = s.audit || [];
    State.dispo = s.dispo || {};
    return true;
  } catch(e) { return false; }
}

function resetAll() {
  localStorage.removeItem("simehr_state");
  State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
  State.orders = {}; State.results = {}; State.notes = {};
  State.audit = []; State.cart = []; State.notifications = [];
  State.dispo = {};
  State.patients.forEach(seedPreResults);
  log("System reset — all simulation data cleared");
  renderAll();
}

function seedPreResults(p) {
  if (p.preResults?.length) {
    State.results[p.id] = p.preResults.map((r, i) => ({
      id: `pre-${p.id}-${i}`, ...r, orderId: null, resultedAt: Date.now()
    }));
  }
}

// ─── UTILITIES ───
function simNow() {
  const realElapsed = Date.now() - State.simClock.startTime - (State.simClock.pausedTotal || 0);
  return new Date(State.simClock.startTime + realElapsed * State.simClock.speed);
}
function simTimeStr() {
  return simNow().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).substr(2,6); }
function activePt() { return State.patients.find(p=>p.id===State.activePatientId); }

function log(action, ptId) {
  State.audit.unshift({ time:simTimeStr(), action, ptId: ptId||State.activePatientId, realTime: new Date().toLocaleTimeString() });
  if (State.audit.length > 300) State.audit.length = 300;
  renderAudit();
  updateCounts();
  saveState();
}

// ─── NOTIFICATIONS ───
function notify(title, body, type="info") {
  const n = { id:uid(), title, body, type, time:simTimeStr() };
  State.notifications.push(n);
  const container = document.getElementById("notification-container");
  const el = document.createElement("div");
  el.className = `notification type-${type}`;
  el.id = `notif-${n.id}`;
  el.innerHTML = `<div class="notif-title">${title}</div><div class="notif-body">${body}</div><div class="notif-time">${n.time}</div>`;
  el.onclick = () => rmNotif(n.id);
  container.appendChild(el);
  setTimeout(() => rmNotif(n.id), 6000);
}
function rmNotif(id) {
  const el = document.getElementById(`notif-${id}`);
  if (el) { el.classList.add("removing"); setTimeout(()=>el.remove(),300); }
}

// ─── SIM CLOCK ───
let clockInterval;
function startClock() {
  State.simClock.startTime = Date.now();
  State.simClock.pausedTotal = 0;
  clockInterval = setInterval(()=>{
    if (State.simClock.paused) return;
    document.getElementById("sim-clock-time").textContent = simTimeStr();
    processOrderTimers();
  }, 200);
}
function setSpeed(speed) {
  State.simClock.speed = speed;
  document.querySelectorAll(".speed-btn[data-speed]").forEach(b =>
    b.classList.toggle("active", parseInt(b.dataset.speed) === speed));
}
function togglePause() {
  const btn = document.getElementById("pause-btn");
  const dot = document.getElementById("sim-status-dot");
  if (State.simClock.paused) {
    State.simClock.paused = false;
    State.simClock.pausedTotal += Date.now() - State.simClock.pausedAt;
    btn.textContent = "⏸ Pause"; dot.classList.remove("paused");
  } else {
    State.simClock.paused = true;
    State.simClock.pausedAt = Date.now();
    btn.textContent = "▶ Resume"; dot.classList.add("paused");
  }
}

// ─── ORDER PIPELINE ───
function getStages(cat, pri) {
  const p = pri||"Routine";
  const t = (SIM_TIMING[cat]||{})[p] || (SIM_TIMING[cat]||{}).Routine;
  if (!t) return [{name:"Placed",delay:0},{name:"Completed",delay:10000}];
  const s = {
    lab:[{n:"Placed",d:0},{n:"Signed",d:t.sign},{n:"Collected",d:t.collect},{n:"Processing",d:t.process},{n:"Resulted",d:t.result}],
    imaging:[{n:"Placed",d:0},{n:"Signed",d:t.sign},{n:"Scheduled",d:t.schedule},{n:"In Progress",d:t.inProgress},{n:"Resulted",d:t.result}],
    diagnostic:[{n:"Placed",d:0},{n:"Signed",d:t.sign},{n:"Performing",d:t.perform},{n:"Interpreting",d:t.interpret},{n:"Resulted",d:t.result}],
    medication:[{n:"Placed",d:0},{n:"Signed",d:t.sign},{n:"Pharmacy Verify",d:t.verify},{n:"Dispensed",d:t.dispense},{n:"Ready",d:t.ready}],
    nursing:[{n:"Placed",d:0},{n:"Signed",d:t.sign},{n:"Acknowledged",d:t.acknowledge},{n:"Completed",d:t.complete}],
  };
  return (s[cat]||[{n:"Placed",d:0},{n:"Completed",d:10000}]).map(x=>({name:x.n,delay:x.d}));
}

function placeOrder(catItem, priority, ptId) {
  const pid = ptId||State.activePatientId;
  if (!pid) return;
  const pri = priority||"Routine";
  const stages = getStages(catItem.cat, pri);
  const now = Date.now();
  const order = {
    id:uid(), catalogId:catItem.id, patientId:pid, name:catItem.name,
    cat:catItem.cat, sub:catItem.sub, resultKey:catItem.resultKey,
    medEffect:catItem.medEffect||null, priority:pri,
    placedAt:now, placedSimTime:simTimeStr(),
    stages: stages.map((s,i)=>({...s, targetTime:now+(s.delay/State.simClock.speed), completed:i===0, completedAt:i===0?now:null})),
    currentStage:0, status:"Placed", cancelled:false, resulted:false,
  };
  if (!State.orders[pid]) State.orders[pid]=[];
  State.orders[pid].unshift(order);
  log(`Order placed: ${order.name} [${pri}]`, pid);
  notify("Order Placed", `${order.name} — ${pri}`, "order");
  updateCounts(); saveState();
  return order;
}

function processOrderTimers() {
  const now = Date.now();
  let needsRefresh = false;
  Object.keys(State.orders).forEach(pid => {
    State.orders[pid].forEach(order => {
      if (order.cancelled || order.resulted) return;
      const nextIdx = order.stages.findIndex(s=>!s.completed);
      if (nextIdx === -1) return;
      const stage = order.stages[nextIdx];
      const baseDelay = getStages(order.cat, order.priority)[nextIdx]?.delay || 10000;
      const prevDone = order.stages[nextIdx-1]?.completedAt || order.placedAt;
      const target = prevDone + baseDelay / State.simClock.speed;
      if (now >= target) {
        stage.completed = true;
        stage.completedAt = now;
        order.currentStage = nextIdx;
        order.status = stage.name;
        const pt = State.patients.find(p=>p.id===pid);
        const ptN = pt ? pt.name.split(",")[0] : pid;
        if (nextIdx === order.stages.length - 1) {
          if (order.cat === "medication") {
            order.status = "Ready";
            notify("Medication Ready", `${order.name} — ready for ${ptN}`, "med");
            log(`Medication ready: ${order.name}`, pid);
          } else {
            order.resulted = true;
            generateResults(order, pid);
          }
        }
        needsRefresh = true;
        saveState();
      }
    });
  });
  if (needsRefresh) updateCounts();
  // Update timer displays in Orders tab without full re-render
  if (State.activeTab === "Orders") updateOrderTimers();
}

function cancelOrder(oid, pid) {
  const o = (State.orders[pid]||[]).find(x=>x.id===oid);
  if (!o || o.resulted) return;
  o.cancelled = true; o.status = "Cancelled";
  log(`Order cancelled: ${o.name}`, pid);
  notify("Order Cancelled", o.name, "info");
  updateCounts(); saveState();
  if (State.activeTab==="Orders") renderTab();
}

// ─── RESULT GENERATION ───
function generateResults(order, pid) {
  const gens = RESULT_GENERATORS[pid];
  const key = order.resultKey;
  let items = [];
  if (gens && typeof gens[key]==="function") items = gens[key].call(gens);
  else if (GENERIC_RESULTS[key]) items = GENERIC_RESULTS[key]();
  else items = [{name:order.name,value:"See report",unit:"",ref:"",flag:"NORMAL",cat:order.cat==="lab"?"Lab":order.cat==="imaging"?"Imaging":"Diagnostic"}];

  if (!State.results[pid]) State.results[pid]=[];
  const pt = State.patients.find(p=>p.id===pid);
  const ptN = pt ? pt.name.split(",")[0] : pid;

  items.forEach(r => {
    if (!r.flag && r.refLo!==undefined && r.refHi!==undefined) {
      const v = parseFloat(r.value);
      if (isNaN(v)) r.flag="NORMAL";
      else if (v>r.refHi*2||v<r.refLo*0.5) r.flag="CRITICAL";
      else if (v>r.refHi) r.flag="HIGH";
      else if (v<r.refLo) r.flag="LOW";
      else r.flag="NORMAL";
    }
    if (!r.flag) r.flag="NORMAL";
    if (!r.cat) r.cat = order.cat==="lab"?"Lab":order.cat==="imaging"?"Imaging":"Diagnostic";
    const result = {
      id:uid(), orderId:order.id, name:r.name, value:String(r.value),
      unit:r.unit||"", ref:r.ref||"", flag:r.flag, cat:r.cat,
      report:r.report||null, time:simTimeStr(), ack:false,
      resultedAt:Date.now(), isPending:r.isPending||false,
    };
    State.results[pid].unshift(result);
    if (r.isPending && r.pendingFinal) {
      const fd = (r.pendingFinal.delay||120000)/State.simClock.speed;
      setTimeout(()=>{
        result.value=r.pendingFinal.value; result.flag=r.pendingFinal.flag;
        result.isPending=false; result.time=simTimeStr();
        notify("🔬 Culture Final", `${ptN}: ${result.name} — ${result.value}`, result.flag==="CRITICAL"?"critical":"result");
        log(`Culture finalized: ${result.name}`, pid);
        if (State.activeTab==="Results"&&State.activePatientId===pid) renderTab();
        saveState();
      }, fd);
    }
  });

  const hasCrit = items.some(r=>r.flag==="CRITICAL");
  const notifType = hasCrit?"critical":"result";
  const first = items[0];
  notify(hasCrit?"⚠ CRITICAL RESULT":"New Result Available",
    items.length===1 ? `${ptN}: ${first.name} = ${first.value} ${first.unit||""} ${first.flag!=="NORMAL"&&first.flag!=="PENDING"?`[${first.flag}]`:""}`
    : `${ptN}: ${order.name} — ${items.length} values`, notifType);
  log(`Results available: ${order.name}`, pid);
  if (State.activeTab==="Results"&&State.activePatientId===pid) renderTab();
  updateCounts(); saveState();
}

// ─── VITALS ENGINE ───
let vitalsInterval;
function startVitalsEngine() {
  vitalsInterval = setInterval(()=>{
    if (State.simClock.paused) return;
    State.patients.forEach(pt => {
      if (pt.status === "Discharged") return;
      generateNextVitals(pt);
    });
  }, 45000);
}

function generateNextVitals(pt) {
  const last = pt.vitalsHistory[pt.vitalsHistory.length-1];
  if (!last) return;
  let dHR=randRange(-3,3,0), dSBP=randRange(-4,4,0), dDBP=randRange(-3,3,0),
      dRR=randRange(-1,1,0), dSpo2=randRange(-1,1,0), dTemp=randRange(-0.2,0.1), dPain=0;

  const ptOrds = State.orders[pt.id]||[];
  ptOrds.filter(o=>o.cat==="medication"&&!o.cancelled&&o._administered&&(Date.now()-o.placedAt)<300000).forEach(o=>{
    const ci = ORDER_CATALOG.find(c=>c.id===o.catalogId);
    if (ci?.medEffect?.type==="vitals") {
      const e=ci.medEffect;
      if(e.hr)dHR+=e.hr*0.3; if(e.bp){dSBP+=e.bp*0.3;dDBP+=(e.bp*0.5)*0.3;}
      if(e.rr)dRR+=e.rr*0.3; if(e.spo2)dSpo2+=e.spo2*0.3;
      if(e.temp)dTemp+=e.temp*0.3; if(e.pain)dPain+=e.pain*0.3;
    }
  });
  if (pt.vitalsHistory.length>3){dHR-=1;dRR-=0.5;dSpo2+=0.3;}

  const prevSBP=parseInt(last.bp.split("/")[0]), prevDBP=parseInt(last.bp.split("/")[1]);
  const nv = {
    time:simTimeStr(),
    hr:Math.round(Math.max(40,Math.min(180,last.hr+dHR))),
    bp:`${Math.round(Math.max(60,Math.min(220,prevSBP+dSBP)))}/${Math.round(Math.max(30,Math.min(130,prevDBP+dDBP)))}`,
    rr:Math.round(Math.max(8,Math.min(40,last.rr+dRR))),
    spo2:Math.round(Math.max(70,Math.min(100,last.spo2+dSpo2))),
    temp:+(Math.max(95,Math.min(106,last.temp+dTemp))).toFixed(1),
    pain:Math.round(Math.max(0,Math.min(10,last.pain+dPain))),
    src:"Auto (Sim)"
  };
  pt.vitalsHistory.push(nv);
  if (pt.vitalsHistory.length>20) pt.vitalsHistory = pt.vitalsHistory.slice(-20);

  const sbp = parseInt(nv.bp.split("/")[0]);
  if(nv.hr>150||nv.hr<45) notify("⚠ Vitals Alert",`${pt.name.split(",")[0]}: HR ${nv.hr}`,"critical");
  if(sbp<80||sbp>200) notify("⚠ Vitals Alert",`${pt.name.split(",")[0]}: BP ${nv.bp}`,"critical");
  if(nv.spo2<88) notify("⚠ Vitals Alert",`${pt.name.split(",")[0]}: SpO₂ ${nv.spo2}%`,"critical");

  if (State.activeTab==="Summary"&&State.activePatientId===pt.id) renderTab();
  saveState();
}

function applyMedEffect(pt, eff) {
  const last=pt.vitalsHistory[pt.vitalsHistory.length-1];
  if(!last)return;
  const sbp=parseInt(last.bp.split("/")[0]), dbp=parseInt(last.bp.split("/")[1]);
  pt.vitalsHistory.push({
    time:simTimeStr(),
    hr:Math.round(Math.max(40,Math.min(180,last.hr+(eff.hr||0)))),
    bp:`${Math.round(Math.max(60,Math.min(220,sbp+(eff.bp||0))))}/${Math.round(Math.max(30,Math.min(130,dbp+((eff.bp||0)*0.5))))}`,
    rr:Math.round(Math.max(8,Math.min(40,last.rr+(eff.rr||0)))),
    spo2:Math.round(Math.max(70,Math.min(100,last.spo2+(eff.spo2||0)))),
    temp:+(Math.max(95,Math.min(106,last.temp+(eff.temp||0)))).toFixed(1),
    pain:Math.round(Math.max(0,Math.min(10,last.pain+(eff.pain||0)))),
    src:"Post-Med"
  });
  saveState();
}

// ─── RENDER ENGINE ───
function renderAll() {
  renderPatientList(); renderBanner(); renderEncounterContext(); renderTab(); renderAudit(); updateCounts();
}

function renderPatientList() {
  const search = document.getElementById("patient-search").value.toLowerCase();
  const list = document.getElementById("patient-list");
  const filtered = State.patients.filter(p =>
    p.name.toLowerCase().includes(search)||p.mrn.toLowerCase().includes(search));
  list.innerHTML = filtered.map(p => {
    const an = p.acuity?parseInt(p.acuity.split("-")[1]):3;
    const dc = p.status==="Discharged"?' style="opacity:0.45"':'';
    return `<button class="patient-item ${p.id===State.activePatientId?'active':''}" data-pid="${p.id}"${dc}>
      <div class="patient-item-name">${p.name} <span class="patient-item-acuity acuity-${an}">${p.acuity||''}</span>
        ${p.status==="Discharged"?'<span class="pill pill-mute" style="margin-left:4px;font-size:9px">DC\'d</span>':''}
        ${p.status==="Admitted"?'<span class="pill pill-blue" style="margin-left:4px;font-size:9px">Admitted</span>':''}
      </div>
      <div class="patient-item-info">${p.location} · ${p.chief.substring(0,35)}…</div>
    </button>`;
  }).join("");
}

function renderBanner() {
  const pt=activePt(); const b=document.getElementById("patient-banner");
  if(!pt){b.innerHTML=`<span class="banner-placeholder">Select a patient to begin</span>`;return;}
  const al = pt.allergies.length>0
    ? `<span class="pill pill-red">⚠ ${pt.allergies.map(a=>a.agent).join(", ")}</span>`
    : `<span class="pill pill-green">NKDA</span>`;
  b.innerHTML=`
    <span class="banner-name">${pt.name}</span>
    <span class="pill pill-info">${pt.mrn}</span>
    <span class="banner-info">DOB: ${pt.dob} (${pt.age}${pt.sex})</span>
    <span class="pill pill-blue">${pt.location}</span>
    <span class="pill pill-info">${pt.encounter}</span>
    ${pt.status!=="Active"?`<span class="pill ${pt.status==='Discharged'?'pill-mute':'pill-green'}">${pt.status}</span>`:''}
    ${al}
    ${pt.alerts.map(a=>`<span class="pill pill-yellow">${a}</span>`).join(" ")}
  `;
}

function renderEncounterContext() {
  const pt=activePt(); const el=document.getElementById("encounter-context");
  if(!pt){el.innerHTML="";return;}
  el.innerHTML=`<div class="section-label">Encounter</div><div style="padding:0 10px">
    <div class="encounter-line"><strong>${pt.encounter}</strong></div>
    <div class="encounter-line">${pt.location} · <strong>${pt.status}</strong> · ${pt.acuity}</div>
    <div class="encounter-line">Role: ${State.role} · Unit: ${State.unit}</div>
    <div class="encounter-line mt-4" style="font-size:10px;color:var(--text-mute)">Chief: ${pt.chief}</div>
    ${pt.dischargedAt?`<div class="encounter-line mt-4" style="color:var(--green)">Discharged: ${pt.dischargedAt}</div>`:''}
  </div>`;
}

function renderAudit() {
  const pt=activePt(); const el=document.getElementById("audit-log");
  const entries = State.audit.filter(a=>!pt||a.ptId===pt.id).slice(0,40);
  el.innerHTML = entries.length===0 ? '<div class="text-muted-small">No actions recorded yet.</div>'
    : entries.map(a=>`<div class="audit-entry"><span class="audit-time">${a.time}</span>${a.action}</div>`).join("");
}

function updateCounts() {
  const pid=State.activePatientId;
  const unack = pid?(State.results[pid]||[]).filter(r=>!r.ack).length:0;
  const unsigned = Object.values(State.notes).flat().filter(n=>n.status==="Draft").length;
  const activeOrd = Object.values(State.orders).flat().filter(o=>!o.cancelled&&!o.resulted&&o.status!=="Ready").length;
  const pending = Object.values(State.orders).flat().filter(o=>!o.cancelled&&!o.resulted).length;
  document.getElementById("count-results").textContent=unack;
  document.getElementById("count-results").className=`activity-count ${unack>0?'count-red':''}`;
  document.getElementById("count-unsigned").textContent=unsigned;
  document.getElementById("count-unsigned").className=`activity-count ${unsigned>0?'count-yellow':''}`;
  const badge=document.getElementById("tab-badge-results");
  if(unack>0){badge.textContent=unack;badge.classList.remove("hidden");}else{badge.classList.add("hidden");}
  document.getElementById("active-orders-count").textContent=activeOrd;
  document.getElementById("pending-results-count").textContent=pending;
}

// ─── TAB RENDERER ───
function renderTab() {
  const c=document.getElementById("tab-content"); const pt=activePt();
  if(!pt){c.innerHTML='<div style="text-align:center;padding:60px;color:var(--text-mute)"><h2>Select a patient from the sidebar</h2></div>';return;}
  switch(State.activeTab){
    case "Summary": renderSummary(c,pt);break;
    case "Timeline": renderTimeline(c,pt);break;
    case "Orders": renderOrders(c,pt);break;
    case "Results": renderResults(c,pt);break;
    case "MAR": renderMAR(c,pt);break;
    case "Notes": renderNotes(c,pt);break;
    case "Imaging": renderImaging(c,pt);break;
    case "Disposition": renderDisposition(c,pt);break;
  }
}

// ═══ SUMMARY ═══
function renderSummary(el, pt) {
  const v=pt.vitalsHistory[pt.vitalsHistory.length-1];
  const sbp=parseInt(v.bp.split("/")[0]);
  const fc=(val,lo,hi)=>val>hi?'flag-high':val<lo?'flag-low':'';
  const vc=(val,lo,hi)=>val>hi?'text-red':val<lo?'text-yellow':'';
  const po=(State.orders[pt.id]||[]).filter(o=>!o.cancelled);
  const pr=(State.results[pt.id]||[]).filter(r=>!r.ack);
  el.innerHTML=`<div class="grid-2">
    <div class="card card-span-2"><div class="card-title">📋 Triage</div><div style="font-size:12px;color:var(--text-sec);line-height:1.6">${pt.triage}</div></div>
    <div class="card card-span-2"><div class="card-title">Vitals <span class="text-muted-xs" style="margin-left:auto">Latest: ${v.time} · ${pt.vitalsHistory.length} sets · ${v.src||'RN'}</span></div>
      <div class="vitals-row">
        <div class="vital-box ${fc(v.hr,60,100)}"><div class="vital-label">HR</div><div class="vital-value ${vc(v.hr,60,100)}">${v.hr}</div><div class="vital-unit">bpm</div></div>
        <div class="vital-box ${fc(sbp,90,140)}"><div class="vital-label">BP</div><div class="vital-value ${vc(sbp,90,140)}">${v.bp}</div><div class="vital-unit">mmHg</div></div>
        <div class="vital-box ${fc(v.rr,12,20)}"><div class="vital-label">RR</div><div class="vital-value ${vc(v.rr,12,20)}">${v.rr}</div><div class="vital-unit">/min</div></div>
        <div class="vital-box ${fc(v.spo2,95,101)}"><div class="vital-label">SpO₂</div><div class="vital-value ${vc(v.spo2,95,101)}">${v.spo2}</div><div class="vital-unit">%</div></div>
        <div class="vital-box ${fc(v.temp,97,100.4)}"><div class="vital-label">Temp</div><div class="vital-value ${vc(v.temp,97,100.4)}">${v.temp}</div><div class="vital-unit">°F</div></div>
        <div class="vital-box ${fc(v.pain,0,6)}"><div class="vital-label">Pain</div><div class="vital-value ${vc(v.pain,0,6)}">${v.pain}</div><div class="vital-unit">/10</div></div>
      </div>
      <details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;color:var(--text-mute)">Vitals trend (${pt.vitalsHistory.length})</summary>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>Time</th><th>Src</th><th>HR</th><th>BP</th><th>RR</th><th>SpO₂</th><th>Temp</th><th>Pain</th></tr></thead>
        <tbody>${pt.vitalsHistory.slice().reverse().map(vv=>`<tr><td>${vv.time}</td><td class="text-muted-xs">${vv.src||''}</td><td>${vv.hr}</td><td>${vv.bp}</td><td>${vv.rr}</td><td>${vv.spo2}%</td><td>${vv.temp}</td><td>${vv.pain}</td></tr>`).join("")}</tbody></table>
      </details>
    </div>
    <div class="card"><div class="card-title">⚠ Allergies & Alerts</div>
      ${pt.allergies.length===0?'<div class="pill pill-green">NKDA</div>':pt.allergies.map(a=>`<div class="flex-center mb-4"><span class="pill ${a.severity==='High'?'pill-red':'pill-yellow'}">${a.severity==='High'?'⛔':'⚠'} ${a.agent}</span><span style="font-size:11px;color:var(--text-sec)">${a.reaction}</span></div>`).join("")}
      <div class="mt-8">${pt.alerts.map(a=>`<span class="pill pill-yellow" style="margin:2px">${a}</span>`).join(" ")}</div>
    </div>
    <div class="card"><div class="card-title">Problem List</div>${pt.problems.map((p,i)=>`<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border);color:var(--text-sec)">${i+1}. ${p}</div>`).join("")}</div>
    <div class="card"><div class="card-title">Home Medications</div>${pt.homeMeds.map(m=>`<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border)">${m.name} <span style="color:var(--text-mute)">${m.route} ${m.freq}</span></div>`).join("")}</div>
    <div class="card"><div class="card-title">Active Orders (${po.length}) · Unack Results (${pr.length})</div>
      ${po.slice(0,6).map(o=>`<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span>${o.name}</span>${statusPill(o.status)}</div>`).join("")}
      ${po.length>6?`<div class="text-muted-xs mt-4">+${po.length-6} more</div>`:''} ${po.length===0?'<div class="text-muted-small">No active orders.</div>':''}
    </div>
    <div class="card card-span-2"><div class="card-title">⚡ Quick Order Set</div>
      <div class="quick-order-grid" id="qog">${["OC1","OC2","OC4","OC6","OC7","OC60","OC40","OC12","OC10","OC5","OC11","OC25"].map(id=>{const c=ORDER_CATALOG.find(x=>x.id===id);return c?`<label class="quick-order-item" data-catid="${c.id}"><input type="checkbox"/>${c.name.replace(/\s*\(.*\)/,'').substring(0,22)}</label>`:''}).join("")}</div>
      <button class="btn btn-primary" id="qo-btn">Place Selected (STAT)</button>
    </div>
    <div class="card card-span-2"><div class="card-title">ED Course</div>
      <textarea class="input input-mono" id="edc" placeholder="Document ED course..." style="min-height:100px">${pt.edCourse||''}</textarea>
    </div>
  </div>`;
  document.getElementById("qo-btn")?.addEventListener("click",()=>{
    const cbs=el.querySelectorAll("#qog input:checked");
    if(!cbs.length)return;
    cbs.forEach(cb=>{const ci=ORDER_CATALOG.find(c=>c.id===cb.closest(".quick-order-item").dataset.catid);if(ci)placeOrder(ci,"STAT");cb.checked=false;});
    renderTab();
  });
  document.getElementById("edc")?.addEventListener("input",e=>{pt.edCourse=e.target.value;saveState();});
}

// ═══ TIMELINE ═══
function renderTimeline(el, pt) {
  const evts=[];
  pt.vitalsHistory.forEach(v=>evts.push({time:v.time,type:"Vitals",desc:`HR ${v.hr} | BP ${v.bp} | SpO₂ ${v.spo2}% | T ${v.temp}°F`,cat:"vitals"}));
  (State.results[pt.id]||[]).forEach(r=>evts.push({time:r.time,type:r.cat,desc:`${r.name}: ${r.value} ${r.unit||""} ${r.flag!=="NORMAL"&&r.flag!=="PENDING"?`[${r.flag}]`:""}`,cat:"result"}));
  (State.orders[pt.id]||[]).forEach(o=>evts.push({time:o.placedSimTime,type:"Order",desc:`${o.name} [${o.priority}] — ${o.status}`,cat:"order"}));
  (State.notes[pt.id]||[]).forEach(n=>evts.push({time:n.time,type:"Note",desc:`${n.type} — ${n.status}`,cat:"note"}));
  State.audit.filter(a=>a.ptId===pt.id).forEach(a=>evts.push({time:a.time,type:"Action",desc:a.action,cat:"action"}));
  const cc={vitals:"var(--cyan)",result:"var(--blue)",order:"var(--green)",note:"var(--purple)",action:"var(--text-mute)"};
  const cp={vitals:"pill-blue",result:"pill-blue",order:"pill-green",note:"pill-purple",action:"pill-mute"};
  el.innerHTML=`<div class="filter-bar"><input type="text" class="input" style="width:300px" placeholder="Filter timeline..." id="tf" value="${State.filters.timelineFilter}"/><span class="text-muted-small">${evts.length} events</span></div>
    <div class="timeline"><div class="timeline-line"></div>${evts.map(e=>`<div class="timeline-item" data-s="${(e.desc+e.type).toLowerCase()}"><div class="timeline-dot" style="background:${cc[e.cat]}"></div><div class="timeline-card"><div class="timeline-card-header"><span class="pill ${cp[e.cat]}">${e.type}</span><span class="text-muted-xs">${e.time}</span></div><div style="font-size:12px;color:var(--text-sec)">${e.desc}</div></div></div>`).join("")}</div>`;
  const applyFilter=()=>{const q=document.getElementById("tf").value.toLowerCase();State.filters.timelineFilter=q;document.querySelectorAll(".timeline-item").forEach(i=>{i.style.display=!q||i.dataset.s.includes(q)?"":"none";});};
  document.getElementById("tf")?.addEventListener("input",applyFilter);
  applyFilter();
}

// ═══ ORDERS — with surgical cart updates (no scroll reset) ═══
function renderOrders(el, pt) {
  const ptOrds=(State.orders[pt.id]||[]);
  const cats=["All","lab","imaging","diagnostic","medication","nursing"];
  el.innerHTML=`<div class="grid-2">
    <div class="card"><div class="card-title">Order Catalog</div>
      <div class="filter-bar" id="ocf">${cats.map(c=>`<button class="filter-btn ${c===State.filters.ordersCat?'active':''}" data-cat="${c}">${c==='All'?'All':c[0].toUpperCase()+c.slice(1)}</button>`).join("")}</div>
      <input type="text" class="input mb-8" placeholder="Search orders..." id="osrch" value="${State.filters.ordersSearch}"/>
      <div style="max-height:450px;overflow-y:auto" id="ocat-list"></div>
    </div>
    <div><div class="card"><div class="card-title">🛒 Order Cart (<span id="cc">${State.cart.length}</span>)</div><div id="cart-body"></div></div>
      <div class="card"><div class="card-title">Active & Recent Orders (${ptOrds.length})</div><div style="max-height:400px;overflow-y:auto" id="ord-list"></div></div>
    </div></div>`;
  renderCatalogList(); renderCartBody(); renderOrderList(pt);
  el.querySelectorAll("#ocf .filter-btn").forEach(b=>b.addEventListener("click",()=>{
    el.querySelectorAll("#ocf .filter-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); State.filters.ordersCat=b.dataset.cat; renderCatalogList();
  }));
  document.getElementById("osrch")?.addEventListener("input",e=>{State.filters.ordersSearch=e.target.value;renderCatalogList();});
}

function renderCatalogList() {
  const list=document.getElementById("ocat-list"); if(!list)return;
  const cf=State.filters.ordersCat, sf=State.filters.ordersSearch.toLowerCase();
  const filtered=ORDER_CATALOG.filter(o=>(cf==="All"||o.cat===cf)&&(o.name.toLowerCase().includes(sf)||o.sub.toLowerCase().includes(sf)));
  list.innerHTML=filtered.map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
    <div><span>${o.name}</span><span style="color:var(--text-mute);margin-left:8px;font-size:10px">${o.sub}</span></div>
    <button class="btn btn-sm btn-ghost atc" data-cid="${o.id}">+ Add</button></div>`).join("");
  list.querySelectorAll(".atc").forEach(b=>b.addEventListener("click",()=>{
    const ci=ORDER_CATALOG.find(c=>c.id===b.dataset.cid);
    if(ci&&!State.cart.find(c=>c.catalogId===ci.id)){
      State.cart.push({id:uid(),catalogId:ci.id,name:ci.name,cat:ci.cat});
      renderCartBody(); // ← surgical update, no scroll reset
    }
  }));
}

function renderCartBody() {
  const body=document.getElementById("cart-body"); if(!body)return;
  document.getElementById("cc").textContent=State.cart.length;
  if(State.cart.length===0){body.innerHTML='<div class="text-muted-small">Add orders from catalog.</div>';return;}
  body.innerHTML=State.cart.map(c=>`<div class="cart-item"><span class="cart-item-name">${c.name} <span class="pill pill-info">${c.cat}</span></span><button class="cart-remove rmc" data-id="${c.id}">×</button></div>`).join("")
    +`<div class="flex-center mt-8"><select class="input" style="width:auto" id="cpri"><option>STAT</option><option>Urgent</option><option>Routine</option></select>
    <button class="btn btn-primary" id="po-btn">Place ${State.cart.length} Order(s)</button></div>`;
  body.querySelectorAll(".rmc").forEach(b=>b.addEventListener("click",()=>{
    State.cart=State.cart.filter(c=>c.id!==b.dataset.id); renderCartBody();
  }));
  document.getElementById("po-btn")?.addEventListener("click",()=>{
    const pri=document.getElementById("cpri")?.value||"Routine";
    State.cart.forEach(c=>{const ci=ORDER_CATALOG.find(x=>x.id===c.catalogId);if(ci)placeOrder(ci,pri);});
    State.cart=[]; renderCartBody(); renderOrderList(activePt());
  });
}

function renderOrderList(pt) {
  const list=document.getElementById("ord-list"); if(!list)return;
  const ptOrds=(State.orders[pt.id]||[]);
  list.innerHTML=ptOrds.length===0?'<div class="text-muted-small">No orders yet.</div>':ptOrds.map(o=>orderRowHTML(o)).join("");
  list.querySelectorAll(".co-btn").forEach(b=>b.addEventListener("click",()=>cancelOrder(b.dataset.oid,pt.id)));
}

function orderRowHTML(o) {
  const pipe=o.stages.map((s,i)=>{const cls=s.completed?"done":i===o.stages.findIndex(x=>!x.completed)?"active":"pending";return`<span class="pipeline-step ${cls}">${s.name}</span>`;}).join("");
  const elapsed=o.resulted||o.cancelled?"":fmtEl(Date.now()-o.placedAt);
  return `<div style="padding:8px 0;border-bottom:1px solid var(--border);${o.cancelled?'opacity:0.4':''}" data-oid="${o.id}">
    <div class="flex-between"><div><span class="fw-600" style="font-size:12px">${o.name}</span>
    <span class="pill ${o.priority==='STAT'?'pill-red':o.priority==='Urgent'?'pill-yellow':'pill-info'}" style="margin-left:6px">${o.priority}</span></div>
    <div class="flex-center gap-4">${elapsed?`<span class="timer-display" data-timer="${o.id}">${elapsed}</span>`:''}
    ${!o.cancelled&&!o.resulted&&o.status!=="Ready"?`<button class="btn btn-xs btn-danger co-btn" data-oid="${o.id}">Cancel</button>`:''}${statusPill(o.status)}</div></div>
    <div class="pipeline mt-4">${pipe}</div><div class="text-muted-xs mt-4">Placed: ${o.placedSimTime}</div></div>`;
}

function updateOrderTimers() {
  // Update just the timer displays without full re-render
  const pid=State.activePatientId;
  (State.orders[pid]||[]).forEach(o=>{
    if(o.cancelled||o.resulted)return;
    const el=document.querySelector(`[data-timer="${o.id}"]`);
    if(el) el.textContent=fmtEl(Date.now()-o.placedAt);
    // Update pipeline steps
    const row=document.querySelector(`[data-oid="${o.id}"]`);
    if(row){
      const steps=row.querySelectorAll(".pipeline-step");
      o.stages.forEach((s,i)=>{
        if(steps[i]){
          steps[i].className="pipeline-step "+(s.completed?"done":i===o.stages.findIndex(x=>!x.completed)?"active":"pending");
        }
      });
      // Update status pill
      const pills=row.querySelectorAll(".pill");
      const lastPill=pills[pills.length-1];
      if(lastPill&&lastPill.textContent!==o.status){
        lastPill.outerHTML=statusPill(o.status);
      }
    }
  });
}

// ═══ RESULTS ═══
function renderResults(el, pt) {
  const results=State.results[pt.id]||[];
  const nc={};results.forEach(r=>{if(!isNaN(parseFloat(r.value)))nc[r.name]=(nc[r.name]||0)+1;});
  const trendable=Object.keys(nc).filter(n=>nc[n]>1);
  const f=State.filters.resultsFilter;
  el.innerHTML=`<div class="filter-bar">
    ${["All","Abnormal","Critical","Pending","Lab","Imaging"].map(x=>`<button class="filter-btn ${x===f?'active':''}" data-rf="${x}">${x}</button>`).join("")}
    <input type="text" class="input" style="width:200px;margin-left:auto" placeholder="Search..." id="rs" value="${State.filters.resultsSearch}"/>
    <button class="btn btn-primary btn-sm" id="aa-btn">✓ Ack All</button></div>
    ${trendable.length>0?`<div class="flex-center mb-8"><span class="text-muted-small">Trends:</span>${trendable.map(t=>`<button class="btn btn-xs btn-ghost tbtn" data-t="${t}">📈 ${t}</button>`).join("")}</div><div id="tp"></div>`:''}
    <table class="tbl"><thead><tr><th>Test</th><th>Value</th><th>Reference</th><th>Flag</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody id="rtb"></tbody></table>`;
  const applyFilters=()=>{
    const fv=State.filters.resultsFilter, sv=State.filters.resultsSearch.toLowerCase();
    const filtered=results.filter(r=>{
      if(fv==="Abnormal")return r.flag!=="NORMAL"&&r.flag!=="PENDING";
      if(fv==="Critical")return r.flag==="CRITICAL";
      if(fv==="Pending")return r.flag==="PENDING"||r.isPending;
      if(fv==="Lab")return r.cat==="Lab";
      if(fv==="Imaging")return r.cat==="Imaging";
      return true;
    }).filter(r=>!sv||r.name.toLowerCase().includes(sv));
    renderResultRows(filtered,pt);
  };
  el.querySelectorAll("[data-rf]").forEach(b=>b.addEventListener("click",()=>{
    el.querySelectorAll("[data-rf]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); State.filters.resultsFilter=b.dataset.rf; applyFilters();
  }));
  document.getElementById("rs")?.addEventListener("input",e=>{State.filters.resultsSearch=e.target.value;applyFilters();});
  document.getElementById("aa-btn")?.addEventListener("click",()=>{results.forEach(r=>r.ack=true);log("Acknowledged all results");renderTab();});
  el.querySelectorAll(".tbtn").forEach(b=>b.addEventListener("click",()=>{
    const nm=b.dataset.t; const data=results.filter(r=>r.name===nm&&!isNaN(parseFloat(r.value))).reverse();
    const mx=Math.max(...data.map(d=>parseFloat(d.value)));
    document.getElementById("tp").innerHTML=`<div class="card mb-12"><div class="card-title">Trend: ${nm}</div><div class="trend-chart">${data.map(d=>{const v=parseFloat(d.value);const h=mx>0?Math.max(8,(v/mx)*60):10;return`<div class="trend-bar-wrap"><span class="trend-value">${v}</span><div class="trend-bar" style="height:${h}px"></div><span class="trend-time">${d.time}</span></div>`;}).join("")}</div></div>`;
  }));
  applyFilters();
}
function renderResultRows(results,pt) {
  const tb=document.getElementById("rtb");if(!tb)return;
  tb.innerHTML=results.map(r=>{
    const rc=r.flag==="CRITICAL"?"tbl-row-critical":(r.flag==="HIGH"||r.flag==="LOW"||r.flag==="ABNORMAL")?"tbl-row-abnormal":"";
    return`<tr class="${rc}"><td class="fw-600">${r.name}</td>
    <td><span style="color:${r.flag==='CRITICAL'?'var(--red)':r.flag==='NORMAL'||r.flag==='PENDING'?'var(--text-pri)':'var(--yellow)'};font-weight:${r.flag==='CRITICAL'?700:400}">${r.value}</span>${r.unit?`<span style="color:var(--text-mute);margin-left:4px">${r.unit}</span>`:''}</td>
    <td style="color:var(--text-mute)">${r.ref||'—'}</td><td>${flagPill(r.flag)}</td><td style="color:var(--text-mute)">${r.time}</td>
    <td>${r.ack?'<span style="color:var(--green);font-size:11px">✓ Ack</span>':'<span style="color:var(--yellow);font-size:11px">● New</span>'}</td>
    <td>${!r.ack?`<button class="btn btn-xs btn-ghost ack1" data-rid="${r.id}">Ack</button>`:''}${r.report?`<button class="btn btn-xs btn-ghost rpt1" data-rid="${r.id}">📄</button>`:''}</td></tr>`;
  }).join("");
  tb.querySelectorAll(".ack1").forEach(b=>b.addEventListener("click",()=>{
    const r=(State.results[pt.id]||[]).find(x=>x.id===b.dataset.rid);
    if(r){r.ack=true;log(`Acknowledged: ${r.name}`);renderTab();}
  }));
  tb.querySelectorAll(".rpt1").forEach(b=>b.addEventListener("click",()=>{
    const r=(State.results[pt.id]||[]).find(x=>x.id===b.dataset.rid);
    if(r?.report)alert(r.report);
  }));
}

// ═══ MAR ═══
function renderMAR(el, pt) {
  const orderMeds=(State.orders[pt.id]||[]).filter(o=>o.cat==="medication"&&!o.cancelled).map(o=>{
    const ready=o.stages.some(s=>s.name==="Ready"&&s.completed);
    return{id:o.id,name:o.name,route:o.sub,freq:o.priority==="STAT"?"STAT":"Scheduled",
      sched:o.priority==="STAT"?"STAT":o.name.includes("PRN")?"PRN":"Scheduled",
      status:o._administered?"Given":ready?"Ready":o.status,lastGiven:o._administeredAt||null,orderId:o.id,isHome:false};
  });
  const homeMeds=pt.homeMeds.map((m,i)=>({id:`h${i}`,name:m.name,route:m.route,freq:m.freq,sched:"Home",status:"Home",lastGiven:null,isHome:true}));
  const all=[...orderMeds,...homeMeds];
  const mf=State.filters.marFilter;
  el.innerHTML=`<div class="filter-bar">
    ${["All","Ready","Given","PRN","Home"].map(x=>`<button class="filter-btn ${x===mf?'active':''}" data-mf="${x}">${x}</button>`).join("")}
    <button class="btn btn-primary btn-sm" style="margin-left:auto" id="adm-btn">💉 Administer Selected</button></div>
    <table class="tbl"><thead><tr><th></th><th>Medication</th><th>Route</th><th>Frequency</th><th>Schedule</th><th>Status</th><th>Last Given</th></tr></thead>
    <tbody id="mar-tb"></tbody></table>`;
  const applyFilter=()=>{
    const f=State.filters.marFilter;
    const shown=all.filter(m=>{
      if(f==="Ready")return m.status==="Ready";if(f==="Given")return m.status==="Given";
      if(f==="PRN")return m.sched==="PRN";if(f==="Home")return m.isHome;return true;
    });
    document.getElementById("mar-tb").innerHTML=shown.map(m=>{
      const canCheck=m.status!=="Given"&&m.status!=="Home"&&m.status!=="Placed"&&m.status!=="Signed"&&m.status!=="Pharmacy Verify"&&m.status!=="Dispensed";
      return`<tr${m.status==="Ready"?' class="tbl-row-abnormal"':''}><td>${canCheck?`<input type="checkbox" class="mck" data-mid="${m.id}" style="accent-color:var(--blue)"/>`:''}</td>
      <td class="fw-600">${m.name}</td><td>${m.route||''}</td><td>${m.freq||''}</td>
      <td>${pillForSched(m.sched)}</td><td>${statusPill(m.status)}</td><td style="color:var(--text-mute)">${m.lastGiven||'—'}</td></tr>`;
    }).join("");
  };
  el.querySelectorAll("[data-mf]").forEach(b=>b.addEventListener("click",()=>{
    el.querySelectorAll("[data-mf]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");State.filters.marFilter=b.dataset.mf;applyFilter();
  }));
  document.getElementById("adm-btn")?.addEventListener("click",()=>{
    const cbs=el.querySelectorAll(".mck:checked");if(!cbs.length)return;
    cbs.forEach(cb=>{const o=(State.orders[pt.id]||[]).find(x=>x.id===cb.dataset.mid);
      if(o){o._administered=true;o._administeredAt=simTimeStr();log(`Administered: ${o.name}`);
        const ci=ORDER_CATALOG.find(c=>c.id===o.catalogId);if(ci?.medEffect?.type==="vitals")applyMedEffect(pt,ci.medEffect);
      }
    });
    notify("💉 Medications Administered",`${cbs.length} med(s) given`,"med");renderTab();
  });
  applyFilter();
}

// ═══ NOTES ═══
function renderNotes(el, pt) {
  const ptN=State.notes[pt.id]||[];
  el.innerHTML=`<div class="grid-2"><div class="card"><div class="card-title">Note Writer</div>
    <div class="filter-bar mb-8">${Object.keys(NOTE_TEMPLATES).map(t=>`<button class="btn btn-xs btn-ghost tmpl" data-t="${t}">${t}</button>`).join("")}</div>
    <select class="input mb-8" id="nts">${Object.keys(NOTE_TEMPLATES).map(t=>`<option>${t}</option>`).join("")}</select>
    <textarea class="input input-mono" id="ne" style="min-height:380px" placeholder="Start typing or select a template..."></textarea>
    <div class="flex-center mt-8"><button class="btn btn-warning btn-sm" id="sd-btn">Save Draft</button><button class="btn btn-primary" id="sn-btn">Sign Note</button>
    <button class="btn btn-sm" style="margin-left:auto;background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple)" id="tsp">. SmartPhrases</button></div>
    <div id="spp" class="hidden smartphrase-panel mt-8"><div style="font-size:11px;color:var(--purple);font-weight:600;margin-bottom:6px">SmartPhrases — Click to insert</div>
    ${Object.entries(SMART_PHRASES).map(([k,v])=>`<button class="smartphrase-btn spi" data-sp="${k}"><span class="sp-key">${k}</span><span class="sp-val">${v.substring(0,55)}…</span></button>`).join("")}</div>
  </div>
  <div class="card"><div class="card-title">Saved Notes (${ptN.length})</div>
    ${ptN.length===0?'<div class="text-muted-small">No notes yet.</div>':''}
    ${ptN.slice().reverse().map(n=>`<div class="saved-note"><div class="note-header"><div><span class="fw-600" style="font-size:12px">${n.type}</span> ${statusPill(n.status)}</div><span class="text-muted-xs">${n.time} · ${n.author}</span></div><pre class="note-content">${n.content.substring(0,600)}${n.content.length>600?'...':''}</pre></div>`).join("")}
  </div></div>`;
  el.querySelectorAll(".tmpl").forEach(b=>b.addEventListener("click",()=>{
    let txt=NOTE_TEMPLATES[b.dataset.t]||"";
    txt=txt.replace(/\[complaint\]/g,pt.chief).replace(/\[name\]/g,pt.name).replace(/\[mrn\]/g,pt.mrn)
      .replace(/\[dob\]/g,pt.dob).replace(/\[age\]/g,pt.age).replace(/\[sex\]/g,pt.sex).replace(/\[problems\]/g,pt.problems.join(", "));
    document.getElementById("ne").value=txt;document.getElementById("nts").value=b.dataset.t;
  }));
  document.getElementById("tsp")?.addEventListener("click",()=>document.getElementById("spp").classList.toggle("hidden"));
  el.querySelectorAll(".spi").forEach(b=>b.addEventListener("click",()=>{const e=document.getElementById("ne");e.value+=" "+SMART_PHRASES[b.dataset.sp];e.focus();}));
  const saveN=(status)=>{const c=document.getElementById("ne").value.trim();if(!c)return;const tp=document.getElementById("nts").value;
    if(!State.notes[pt.id])State.notes[pt.id]=[];
    State.notes[pt.id].push({id:uid(),type:tp,content:c,status,time:simTimeStr(),author:`Sim ${State.role}`});
    log(`${status==="Draft"?"Saved draft":"Signed"}: ${tp}`);document.getElementById("ne").value="";renderTab();saveState();};
  document.getElementById("sd-btn")?.addEventListener("click",()=>saveN("Draft"));
  document.getElementById("sn-btn")?.addEventListener("click",()=>saveN("Signed"));
}

// ═══ IMAGING ═══
function renderImaging(el, pt) {
  const io=(State.orders[pt.id]||[]).filter(o=>o.cat==="imaging"&&!o.cancelled);
  const ir=(State.results[pt.id]||[]).filter(r=>r.cat==="Imaging");
  el.innerHTML=`<div class="grid-2"><div class="card"><div class="card-title">Imaging Orders</div>
    ${io.length===0?'<div class="text-muted-small">No imaging orders.</div>':''}
    ${io.map(o=>`<div class="saved-note"><div class="flex-between"><span class="fw-600">${o.name}</span>${statusPill(o.status)}</div>
      <div class="pipeline mt-4">${o.stages.map((s,i)=>`<span class="pipeline-step ${s.completed?'done':i===o.stages.findIndex(x=>!x.completed)?'active':'pending'}">${s.name}</span>`).join("")}</div>
      <div class="text-muted-xs mt-4">${o.placedSimTime} ${o.resulted?'· Resulted':'· In progress...'}</div></div>`).join("")}
    <div class="section-label-inline mt-12 mb-8">Imaging Results</div>
    ${ir.map(r=>`<div class="saved-note irv" style="cursor:pointer" data-rid="${r.id}"><div class="flex-between"><span class="fw-600">${r.name}</span>${flagPill(r.flag)}</div><div style="font-size:12px;color:var(--text-sec);margin-top:4px">${r.value}</div></div>`).join("")}
  </div><div class="card"><div class="card-title">Report Viewer</div><div id="ivw"><div style="color:var(--text-mute);text-align:center;padding:40px">Select a study to view.</div></div></div></div>`;
  el.querySelectorAll(".irv").forEach(i=>i.addEventListener("click",()=>{
    const r=ir.find(x=>x.id===i.dataset.rid);if(!r)return;
    document.getElementById("ivw").innerHTML=`<div class="fw-700 mb-8" style="font-size:14px">${r.name}</div>
      <div class="flex-center mb-12">${flagPill(r.flag)}<span class="text-muted-xs">Resulted: ${r.time}</span></div>
      <div class="img-placeholder">[ DICOM Viewer — Sim MVP ]</div>
      <div class="section-label-inline">Report</div><pre class="report-text">${r.report||'No report.'}</pre>`;
  }));
}

// ═══ DISPOSITION — FULL WORKFLOWS ═══
function renderDisposition(el, pt) {
  const d = State.dispo[pt.id] || {};
  const BEDS = {
    "Internal Medicine":["4N-201","4N-202","4N-210","4S-305","4S-312"],
    Cardiology:["CCU-1","CCU-2","CCU-3","5N-401","5N-402"],
    "Surgery — General":["6S-601","6S-602","6S-610"],
    Orthopedics:["6N-501","6N-502","6N-508"],
    Neurology:["3N-101","3N-102","3N-110"],
    "Pulmonology/Critical Care":["MICU-1","MICU-2","MICU-3","MICU-4"],
    Hospitalist:["5S-450","5S-451","5S-460","5S-465"],
  };

  el.innerHTML=`<div class="grid-2">
    <div class="card">
      <div class="card-title">Disposition Planning</div>
      ${pt.status==="Discharged"?`<div style="padding:20px;text-align:center;background:var(--green-bg);border-radius:8px;margin-bottom:12px"><div style="font-size:16px;font-weight:700;color:var(--green)">✓ Patient Discharged</div><div style="font-size:12px;color:var(--text-sec);margin-top:4px">${pt.dischargedAt||''}</div></div>`:''}
      ${pt.status==="Admitted"?`<div style="padding:20px;text-align:center;background:var(--blue-bg);border-radius:8px;margin-bottom:12px"><div style="font-size:16px;font-weight:700;color:var(--cyan)">✓ Patient Admitted</div><div style="font-size:12px;color:var(--text-sec);margin-top:4px">Location: ${pt.location}</div></div>`:''}

      <div class="section-label-inline">Disposition</div>
      <div class="flex-center gap-8 mb-12" style="flex-wrap:wrap">
        ${["Discharge","Admit","Observation","Transfer","AMA","Deceased"].map(x=>`<button class="dispo-option ${d.type===x?'active':''}" data-d="${x}" ${pt.status!=="Active"?'disabled style="opacity:0.4;pointer-events:none"':''}>${x}</button>`).join("")}
      </div>

      <div class="section-label-inline">Primary Diagnosis</div>
      <input type="text" class="input mb-12" id="ddx" placeholder="Diagnosis..." value="${d.dx||''}"/>

      <div id="admit-fields" class="${d.type==='Admit'||d.type==='Observation'?'':'hidden'}">
        <div class="section-label-inline">Admitting Service</div>
        <select class="input mb-8" id="dsvc"><option value="">Select service...</option>
          ${Object.keys(BEDS).map(s=>`<option ${d.service===s?'selected':''}>${s}</option>`).join("")}</select>
        <div class="section-label-inline">Assigned Bed</div>
        <select class="input mb-8" id="dbed"><option value="">Select bed...</option></select>
        <div class="section-label-inline">Admitting Provider</div>
        <input type="text" class="input mb-8" id="dadmprov" placeholder="Dr. ..." value="${d.admProv||''}"/>
        <div class="section-label-inline">Admit Priority</div>
        <div class="flex-center gap-8 mb-12">
          ${["Routine","Urgent","Emergency"].map(x=>`<button class="filter-btn adm-pri ${d.admPri===x?'active':''}" data-p="${x}">${x}</button>`).join("")}
        </div>
      </div>

      <div id="dc-fields" class="${d.type==='Discharge'?'':'hidden'}">
        <div class="section-label-inline">Condition at Discharge</div>
        <select class="input mb-8" id="dcond"><option>Stable — Improved</option><option>Stable — Unchanged</option><option>Guarded</option><option>Against Medical Advice</option></select>
        <div class="section-label-inline">Activity Restrictions</div>
        <input type="text" class="input mb-8" id="dact" placeholder="No heavy lifting × 6 weeks, etc." value="${d.actRestrict||''}"/>
        <div class="section-label-inline">Diet</div>
        <input type="text" class="input mb-8" id="ddiet" placeholder="Regular, low sodium, etc." value="${d.diet||''}"/>
      </div>

      <div id="ama-fields" class="${d.type==='AMA'?'':'hidden'}">
        <div style="padding:12px;background:var(--red-bg);border-radius:8px;border:1px solid var(--red);margin-bottom:12px">
          <div style="font-weight:700;color:var(--red);margin-bottom:4px">⚠ Against Medical Advice</div>
          <div style="font-size:12px;color:var(--text-sec)">Patient has been informed of risks including but not limited to: worsening condition, permanent disability, and death. Patient has capacity and understands risks.</div>
        </div>
        <label class="checklist-item"><input type="checkbox" id="ama-cap"/><span class="checklist-label unchecked">Patient has decision-making capacity</span></label>
        <label class="checklist-item"><input type="checkbox" id="ama-risk"/><span class="checklist-label unchecked">Risks explained and documented</span></label>
        <label class="checklist-item"><input type="checkbox" id="ama-sign"/><span class="checklist-label unchecked">AMA form signed (or refused to sign — documented)</span></label>
      </div>

      <div class="section-label-inline">Follow-Up</div>
      <input type="text" class="input mb-12" id="dfu" placeholder="PCP in 3 days, Cardiology 1 week..." value="${d.followUp||''}"/>
      <div class="section-label-inline">Patient Instructions</div>
      <textarea class="input mb-12" id="dins" placeholder="Return precautions, med changes...">${d.instructions||''}</textarea>

      <button class="btn btn-primary" style="width:100%" id="exec-dispo" ${pt.status!=="Active"?'disabled style="opacity:0.4"':''}>
        ${d.type==='Admit'||d.type==='Observation'?'🏥 Execute Admission':d.type==='Discharge'?'✅ Execute Discharge':d.type==='Transfer'?'🚑 Execute Transfer':d.type==='AMA'?'⚠ Complete AMA Discharge':'Select Disposition First'}
      </button>
    </div>

    <div>
      <div class="card"><div class="card-title">Safety Checklist</div><div id="scl">
        ${["Medications Reconciled","All Results Reviewed & Acknowledged","Safety Screening Complete","Patient/Family Educated","Follow-Up Confirmed","Pending Results Addressed"].map((c,i)=>`<label class="checklist-item"><input type="checkbox" class="scb" data-i="${i}"/><span class="checklist-label unchecked">⚠ ${c}</span></label>`).join("")}
      </div><div id="sst" class="mt-8" style="padding:8px 12px;border-radius:6px;font-size:12px;background:var(--yellow-bg);color:var(--yellow)">⚠ Complete all safety checks before finalizing.</div></div>
      <div id="avs-box"></div>
    </div>
  </div>`;

  // Dispo type selection
  el.querySelectorAll(".dispo-option").forEach(b=>b.addEventListener("click",()=>{
    el.querySelectorAll(".dispo-option").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const t=b.dataset.d;
    State.dispo[pt.id]={...State.dispo[pt.id],type:t};
    document.getElementById("admit-fields").className=t==="Admit"||t==="Observation"?"":"hidden";
    document.getElementById("dc-fields").className=t==="Discharge"?"":"hidden";
    document.getElementById("ama-fields").className=t==="AMA"?"":"hidden";
    const btn=document.getElementById("exec-dispo");
    btn.disabled=false;btn.style.opacity="1";
    btn.textContent=t==='Admit'||t==='Observation'?'🏥 Execute Admission':t==='Discharge'?'✅ Execute Discharge':t==='Transfer'?'🚑 Execute Transfer':t==='AMA'?'⚠ Complete AMA Discharge':t==='Deceased'?'Record Death':'Execute';
    log(`Selected disposition: ${t}`);
  }));

  // Service → bed options
  const svcSel=document.getElementById("dsvc");
  const bedSel=document.getElementById("dbed");
  if(svcSel) svcSel.addEventListener("change",()=>{
    const beds=BEDS[svcSel.value]||[];
    bedSel.innerHTML=`<option value="">Select bed...</option>`+beds.map(b=>`<option>${b}</option>`).join("");
  });

  // Admit priority
  el.querySelectorAll(".adm-pri").forEach(b=>b.addEventListener("click",()=>{
    el.querySelectorAll(".adm-pri").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");State.dispo[pt.id]={...State.dispo[pt.id],admPri:b.dataset.p};
  }));

  // Safety checkboxes
  el.querySelectorAll(".scb").forEach(cb=>cb.addEventListener("change",()=>{
    const lbl=cb.closest(".checklist-item").querySelector(".checklist-label");
    const txt=lbl.textContent.substring(2);
    lbl.className=`checklist-label ${cb.checked?'checked':'unchecked'}`;
    lbl.textContent=`${cb.checked?'✓':'⚠'} ${txt}`;
    const allOk=[...el.querySelectorAll(".scb")].every(c=>c.checked);
    const st=document.getElementById("sst");
    st.style.background=allOk?"var(--green-bg)":"var(--yellow-bg)";
    st.style.color=allOk?"var(--green)":"var(--yellow)";
    st.textContent=allOk?"✓ All safety checks complete.":"⚠ Complete all safety checks before finalizing.";
  }));

  // ─── EXECUTE DISPOSITION ───
  document.getElementById("exec-dispo")?.addEventListener("click",()=>{
    const dtype=(State.dispo[pt.id]||{}).type;
    const dx=document.getElementById("ddx").value;
    if(!dtype){alert("Select a disposition type.");return;}
    if(!dx){alert("Enter a diagnosis.");return;}

    const allSafe=[...el.querySelectorAll(".scb")].every(c=>c.checked);
    if(!allSafe&&!confirm("⚠ Not all safety checks are complete. Proceed anyway?")){return;}

    const fu=document.getElementById("dfu").value;
    const ins=document.getElementById("dins").value;

    // ─── ADMIT / OBSERVATION ───
    if(dtype==="Admit"||dtype==="Observation"){
      const svc=document.getElementById("dsvc").value;
      const bed=document.getElementById("dbed").value;
      const adp=document.getElementById("dadmprov").value;
      if(!svc){alert("Select an admitting service.");return;}
      if(!bed){alert("Select a bed assignment.");return;}

      pt.status="Admitted";
      pt.location=bed;
      State.dispo[pt.id]={...State.dispo[pt.id],dx,service:svc,bed,admProv:adp,followUp:fu,instructions:ins,executedAt:simTimeStr()};

      // Auto-generate admission note
      if(!State.notes[pt.id])State.notes[pt.id]=[];
      State.notes[pt.id].push({id:uid(),type:"Admission Order",status:"Signed",time:simTimeStr(),author:`Sim ${State.role}`,
        content:`ADMISSION ORDER\n\nPatient: ${pt.name} | MRN: ${pt.mrn}\nDate/Time: ${simTimeStr()}\n\nAdmit to: ${svc}\nBed: ${bed}\nAttending: ${adp||'TBD'}\nStatus: ${dtype==="Observation"?"Observation":"Inpatient"}\nDiagnosis: ${dx}\nCondition: ${pt.vitalsHistory[pt.vitalsHistory.length-1]?'See vitals':'Stable'}\nCode Status: Full Code\n\nAllergies: ${pt.allergies.length?pt.allergies.map(a=>a.agent).join(", "):"NKDA"}\n\nDiet: As tolerated\nActivity: As tolerated\nVitals: Per unit protocol\nIVF: Per orders\nMedications: Per medication orders\nLabs: Per orders\n\nNotify provider for:\n- Temp > 101.5°F\n- HR < 50 or > 120\n- SBP < 90 or > 180\n- SpO2 < 92%\n- Change in mental status\n- Significant pain uncontrolled`
      });

      // Auto-place standard admit nursing orders
      const nursingOrds=["OC120","OC121","OC123","OC126"];
      nursingOrds.forEach(nid=>{const ci=ORDER_CATALOG.find(c=>c.id===nid);if(ci)placeOrder(ci,"Routine",pt.id);});

      log(`ADMITTED to ${svc} — Bed ${bed}`,pt.id);
      notify("🏥 Patient Admitted",`${pt.name.split(",")[0]} → ${svc} Bed ${bed}`,"info");
      renderAll();
      return;
    }

    // ─── DISCHARGE ───
    if(dtype==="Discharge"){
      const cond=document.getElementById("dcond")?.value||"Stable";
      const act=document.getElementById("dact")?.value||"";
      const diet=document.getElementById("ddiet")?.value||"";

      pt.status="Discharged";
      pt.dischargedAt=simTimeStr();
      State.dispo[pt.id]={...State.dispo[pt.id],dx,condition:cond,actRestrict:act,diet,followUp:fu,instructions:ins,executedAt:simTimeStr()};

      // Generate discharge summary note
      if(!State.notes[pt.id])State.notes[pt.id]=[];
      State.notes[pt.id].push({id:uid(),type:"Discharge Summary",status:"Signed",time:simTimeStr(),author:`Sim ${State.role}`,
        content:`DISCHARGE SUMMARY\n\nPatient: ${pt.name} | MRN: ${pt.mrn} | DOB: ${pt.dob}\nDischarge Date: ${simTimeStr()}\nLocation: ${pt.location}\n\nDISCHARGE DIAGNOSIS:\n${dx}\n\nCONDITION AT DISCHARGE: ${cond}\n\nHOSPITAL/ED COURSE:\n${pt.edCourse||'[See ED course notes]'}\n\nDISCHARGE MEDICATIONS:\n${pt.homeMeds.map(m=>`- ${m.name} ${m.route} ${m.freq}`).join("\n")}\n\nACTIVITY: ${act||'As tolerated'}\nDIET: ${diet||'Regular'}\n\nFOLLOW-UP:\n${fu||'Follow up with PCP within 3-5 days'}\n\nPATIENT INSTRUCTIONS:\n${ins||'Return to ED for worsening symptoms'}\n\nRETURN PRECAUTIONS:\n- Worsening or new symptoms\n- Fever > 101°F\n- Inability to tolerate oral intake\n- Any concern\n\nPatient educated and verbalized understanding.\n\n⚠ SIMULATED — NOT FOR CLINICAL USE`
      });

      // Generate AVS
      document.getElementById("avs-box").innerHTML=`<div class="card"><div class="card-title">✅ After-Visit Summary Generated</div>
        <div class="avs-preview"><div class="avs-header">SIMULATED HEALTH SYSTEM<br><span style="font-size:12px;font-weight:400">After-Visit Summary</span></div>
        <div class="avs-section"><strong>Patient:</strong> ${pt.name} | <strong>MRN:</strong> ${pt.mrn} | <strong>DOB:</strong> ${pt.dob}<br><strong>Visit:</strong> ${new Date().toLocaleDateString()} | <strong>Location:</strong> ${pt.location}</div>
        <div class="avs-section"><strong>Disposition:</strong> Discharged<br><strong>Diagnosis:</strong> ${dx}<br><strong>Condition:</strong> ${cond}</div>
        <div class="avs-section"><strong>Activity:</strong> ${act||'As tolerated'}<br><strong>Diet:</strong> ${diet||'Regular'}</div>
        <div class="avs-section"><strong>Follow-Up:</strong><br>${fu||'PCP within 3-5 days'}</div>
        <div class="avs-section"><strong>Instructions:</strong><br>${ins||'Return for worsening symptoms.'}</div>
        <div class="avs-section"><strong>Medications:</strong>${pt.homeMeds.map(m=>`<br>• ${m.name} — ${m.route} ${m.freq}`).join("")}</div>
        <div class="avs-footer">⚠ SIMULATED — NOT FOR CLINICAL USE — SimEHR</div></div></div>`;

      log(`DISCHARGED — Dx: ${dx}`,pt.id);
      notify("✅ Patient Discharged",`${pt.name.split(",")[0]} — ${dx}`,"info");
      renderAll();
      return;
    }

    // ─── TRANSFER ───
    if(dtype==="Transfer"){
      pt.status="Transferred";
      pt.dischargedAt=simTimeStr();
      pt.location="Transfer Pending";
      State.dispo[pt.id]={...State.dispo[pt.id],dx,followUp:fu,instructions:ins,executedAt:simTimeStr()};

      if(!State.notes[pt.id])State.notes[pt.id]=[];
      State.notes[pt.id].push({id:uid(),type:"Transfer Note",status:"Signed",time:simTimeStr(),author:`Sim ${State.role}`,
        content:`TRANSFER NOTE\n\nPatient: ${pt.name} | MRN: ${pt.mrn}\nTransfer initiated: ${simTimeStr()}\nDiagnosis: ${dx}\nReason for transfer: [Specify receiving facility/service]\n\nClinical summary: ${pt.edCourse||'See chart'}\n\nPending results at transfer: ${(State.results[pt.id]||[]).filter(r=>r.isPending).map(r=>r.name).join(", ")||"None"}\n\nTransfer medications: Per current orders\nIV access: Patent\nLast vitals: ${JSON.stringify(pt.vitalsHistory[pt.vitalsHistory.length-1])}`
      });

      log(`TRANSFERRED — Dx: ${dx}`,pt.id);
      notify("🚑 Patient Transferred",`${pt.name.split(",")[0]}`,"info");
      renderAll();
      return;
    }

    // ─── AMA ───
    if(dtype==="AMA"){
      const cap=document.getElementById("ama-cap")?.checked;
      const risk=document.getElementById("ama-risk")?.checked;
      const sign=document.getElementById("ama-sign")?.checked;
      if(!cap||!risk){alert("Must confirm capacity assessment and risk discussion.");return;}

      pt.status="Discharged";
      pt.dischargedAt=simTimeStr()+" (AMA)";
      State.dispo[pt.id]={...State.dispo[pt.id],dx,followUp:fu,instructions:ins,executedAt:simTimeStr()};

      if(!State.notes[pt.id])State.notes[pt.id]=[];
      State.notes[pt.id].push({id:uid(),type:"AMA Discharge Note",status:"Signed",time:simTimeStr(),author:`Sim ${State.role}`,
        content:`AGAINST MEDICAL ADVICE (AMA) DISCHARGE\n\nPatient: ${pt.name} | MRN: ${pt.mrn}\nDate/Time: ${simTimeStr()}\n\nDiagnosis: ${dx}\n\nThe patient has been informed of the following risks of leaving AMA:\n- Worsening of current condition\n- Need for emergency care or hospitalization\n- Permanent disability or death\n\nCAPACITY ASSESSMENT: Patient demonstrates decision-making capacity.\nRISK DISCUSSION: Risks thoroughly explained. Patient verbalizes understanding.\nAMA FORM: ${sign?'Signed by patient':'Patient refused to sign — witnessed and documented'}\n\nDISCHARGE INSTRUCTIONS PROVIDED: Yes\nPrescriptions offered: ${fu?'Yes':'Per discussion'}\n\nFollow-up recommended: ${fu||'PCP within 24-48 hours'}\n\n⚠ SIMULATED — NOT FOR CLINICAL USE`
      });

      log(`AMA DISCHARGE — ${dx}`,pt.id);
      notify("⚠ AMA Discharge",`${pt.name.split(",")[0]} left against medical advice`,"critical");
      renderAll();
      return;
    }

    // ─── DECEASED ───
    if(dtype==="Deceased"){
      if(!confirm("Record patient death? This will mark the patient as deceased.")){return;}
      pt.status="Deceased";
      pt.dischargedAt=simTimeStr();

      if(!State.notes[pt.id])State.notes[pt.id]=[];
      State.notes[pt.id].push({id:uid(),type:"Death Note",status:"Signed",time:simTimeStr(),author:`Sim ${State.role}`,
        content:`DEATH NOTE\n\nPatient: ${pt.name} | MRN: ${pt.mrn}\nDate/Time of Death: ${simTimeStr()}\n\nCause of Death: ${dx}\n\nResuscitation efforts: [Document code details if applicable]\nTime called: ${simTimeStr()}\nFamily notified: [Y/N]\nMedical Examiner notified: [Y/N — if applicable]\nOrgan donation discussed: [Y/N]\n\nAttending of record: ___\n\n⚠ SIMULATED — NOT FOR CLINICAL USE`
      });

      log(`PATIENT DECEASED — ${dx}`,pt.id);
      notify("Patient Deceased",pt.name.split(",")[0],"critical");
      renderAll();
    }
  });
}

// ─── HELPER FUNCTIONS ───
function statusPill(s){
  const m={Placed:"pill-yellow",Signed:"pill-blue",Collected:"pill-blue",Processing:"pill-blue",
    Resulted:"pill-green",Completed:"pill-green",Cancelled:"pill-red","In Progress":"pill-blue",
    Scheduled:"pill-yellow",Performing:"pill-blue",Interpreting:"pill-blue","Pharmacy Verify":"pill-purple",
    Dispensed:"pill-blue",Ready:"pill-green",Acknowledged:"pill-blue",Due:"pill-yellow",Given:"pill-green",
    Running:"pill-blue",Available:"pill-mute",Unsigned:"pill-yellow",Draft:"pill-yellow",Home:"pill-mute",PENDING:"pill-yellow"};
  return`<span class="pill ${m[s]||'pill-info'}">${s}</span>`;
}
function flagPill(f){
  const m={CRITICAL:"pill-red",HIGH:"pill-yellow",LOW:"pill-yellow",ABNORMAL:"pill-orange",NORMAL:"pill-green",PENDING:"pill-mute"};
  return`<span class="pill ${m[f]||'pill-info'}">${f}</span>`;
}
function pillForSched(s){
  if(s==="PRN")return'<span class="pill pill-info">PRN</span>';
  if(s==="STAT")return'<span class="pill pill-red">STAT</span>';
  if(s==="Home")return'<span class="pill pill-mute">Home</span>';
  return`<span class="pill pill-blue">${s}</span>`;
}
function fmtEl(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return`${m}:${(s%60).toString().padStart(2,"0")}`;}

// ─── INIT ───
function init() {
  State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
  const loaded = loadState();
  if (!loaded) State.patients.forEach(seedPreResults);
  State.activePatientId = "P001";

  // Tab clicks
  document.querySelectorAll(".tab-btn").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".tab-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); State.activeTab=b.dataset.tab; renderTab();
  }));

  // Patient list (delegated)
  document.getElementById("patient-list").addEventListener("click",e=>{
    const item=e.target.closest(".patient-item");if(!item)return;
    State.activePatientId=item.dataset.pid;log(`Opened chart: ${activePt()?.name}`);renderAll();
  });
  document.getElementById("patient-search").addEventListener("input",renderPatientList);

  // Sidebar toggles
  document.getElementById("toggle-left").addEventListener("click",()=>{
    const sb=document.getElementById("left-sidebar");sb.classList.toggle("open");
    document.getElementById("toggle-left").textContent=sb.classList.contains("open")?"◀ Patients":"▶";
  });
  document.getElementById("toggle-right").addEventListener("click",()=>{
    const sb=document.getElementById("right-sidebar");sb.classList.toggle("open");
    document.getElementById("toggle-right").textContent=sb.classList.contains("open")?"Context ▶":"◀";
  });

  // Quick actions
  document.getElementById("qa-new-note").addEventListener("click",()=>{
    State.activeTab="Notes";document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab==="Notes"));renderTab();
  });
  document.getElementById("qa-new-order").addEventListener("click",()=>{
    State.activeTab="Orders";document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab==="Orders"));renderTab();
  });
  document.getElementById("qa-reset").addEventListener("click",()=>{
    if(confirm("Reset all simulation data?"))resetAll();
  });

  // Speed + pause
  document.querySelectorAll(".speed-btn[data-speed]").forEach(b=>b.addEventListener("click",()=>setSpeed(parseInt(b.dataset.speed))));
  document.getElementById("pause-btn").addEventListener("click",togglePause);
  document.getElementById("role-select").addEventListener("change",e=>{State.role=e.target.value;});
  document.getElementById("unit-select").addEventListener("change",e=>{State.unit=e.target.value;});

  startClock();
  startVitalsEngine();
  renderAll();
  setInterval(saveState, 10000);
}

document.addEventListener("DOMContentLoaded", init);
