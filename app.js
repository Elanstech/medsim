/* ═══════════════════════════════════════════
   SimEHR — app.js
   Simulation engine, state management,
   order pipeline, UI renderers
   ═══════════════════════════════════════════ */

// ─── STATE ───
const State = {
  patients: [],
  activePatientId: null,
  activeTab: "Summary",
  role: "Provider",
  unit: "ED",
  orders: {},       // { patientId: Order[] }
  results: {},      // { patientId: Result[] }
  notes: {},        // { patientId: Note[] }
  audit: [],        // { time, action, ptId }
  cart: [],         // items in order cart
  simClock: { startTime: Date.now(), speed: 2, paused: false, elapsed: 0, pausedAt: null },
  notifications: [],
  vitalsTimers: {},
};

// ─── PERSISTENCE ───
function saveState() {
  try {
    const s = {
      v: SCHEMA_VERSION,
      patients: State.patients.map(p => ({ id:p.id, edCourse:p.edCourse, vitalsHistory:p.vitalsHistory })),
      orders: State.orders,
      results: State.results,
      notes: State.notes,
      audit: State.audit.slice(0, 200),
    };
    localStorage.setItem("simehr_state", JSON.stringify(s));
  } catch(e) { /* ignore storage errors */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem("simehr_state");
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.v !== SCHEMA_VERSION) { localStorage.removeItem("simehr_state"); return false; }
    // Merge saved data onto seed patients
    State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
    s.patients.forEach(sp => {
      const pt = State.patients.find(p => p.id === sp.id);
      if (pt) {
        pt.edCourse = sp.edCourse || "";
        if (sp.vitalsHistory?.length > pt.vitalsHistory.length) pt.vitalsHistory = sp.vitalsHistory;
      }
    });
    State.orders = s.orders || {};
    State.results = s.results || {};
    State.notes = s.notes || {};
    State.audit = s.audit || [];
    return true;
  } catch(e) { return false; }
}

function resetAll() {
  localStorage.removeItem("simehr_state");
  State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
  State.orders = {};
  State.results = {};
  State.notes = {};
  State.audit = [];
  State.cart = [];
  State.notifications = [];
  // Re-seed pre-results
  State.patients.forEach(p => {
    if (p.preResults?.length) {
      State.results[p.id] = p.preResults.map((r, i) => ({
        id: `pre-${p.id}-${i}`, ...r, orderId: null, resultedAt: Date.now()
      }));
    }
  });
  clearAllTimers();
  log("System reset — all simulation data cleared");
  renderAll();
}

// ─── UTILITIES ───
function simNow() {
  if (State.simClock.paused) {
    return new Date(State.simClock.startTime + State.simClock.elapsed);
  }
  const realElapsed = Date.now() - State.simClock.startTime - (State.simClock.pausedTotal || 0);
  const simElapsed = realElapsed * State.simClock.speed;
  return new Date(State.simClock.startTime + simElapsed);
}
function simTimeStr() {
  return simNow().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function realNowStr() {
  return new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }

function log(action, ptId) {
  const entry = { time: simTimeStr(), action, ptId: ptId || State.activePatientId, realTime: realNowStr() };
  State.audit.unshift(entry);
  if (State.audit.length > 300) State.audit.length = 300;
  renderAudit();
  updateCounts();
  saveState();
}

function activePt() { return State.patients.find(p => p.id === State.activePatientId); }

// ─── NOTIFICATION SYSTEM ───
function notify(title, body, type="info") {
  const n = { id: uid(), title, body, type, time: simTimeStr(), created: Date.now() };
  State.notifications.push(n);
  renderNotification(n);
  // Auto-remove after 6 seconds
  setTimeout(() => removeNotification(n.id), 6000);
}

function renderNotification(n) {
  const container = document.getElementById("notification-container");
  const el = document.createElement("div");
  el.className = `notification type-${n.type}`;
  el.id = `notif-${n.id}`;
  el.innerHTML = `
    <div class="notif-title">${n.title}</div>
    <div class="notif-body">${n.body}</div>
    <div class="notif-time">${n.time}</div>
  `;
  el.onclick = () => removeNotification(n.id);
  container.appendChild(el);
}

function removeNotification(id) {
  const el = document.getElementById(`notif-${id}`);
  if (el) {
    el.classList.add("removing");
    setTimeout(() => el.remove(), 300);
  }
}

// ─── SIM CLOCK ───
let clockInterval;

function startClock() {
  State.simClock.startTime = Date.now();
  State.simClock.pausedTotal = 0;
  clockInterval = setInterval(tickClock, 200);
}

function tickClock() {
  if (State.simClock.paused) return;
  document.getElementById("sim-clock-time").textContent = simTimeStr();
  // Process order timers
  processOrderTimers();
}

function setSpeed(speed) {
  State.simClock.speed = speed;
  document.querySelectorAll(".speed-btn[data-speed]").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.speed) === speed);
  });
}

function togglePause() {
  const btn = document.getElementById("pause-btn");
  const dot = document.getElementById("sim-status-dot");
  if (State.simClock.paused) {
    State.simClock.paused = false;
    State.simClock.pausedTotal += Date.now() - State.simClock.pausedAt;
    btn.textContent = "⏸ Pause";
    dot.classList.remove("paused");
  } else {
    State.simClock.paused = true;
    State.simClock.pausedAt = Date.now();
    btn.textContent = "▶ Resume";
    dot.classList.add("paused");
  }
}

// ─── ORDER PIPELINE ENGINE ───
// Order stages differ by category
function getStages(cat, priority) {
  const p = priority || "Routine";
  const timing = SIM_TIMING[cat];
  if (!timing) return [];
  const t = timing[p] || timing.Routine;
  
  switch (cat) {
    case "lab":
      return [
        { name:"Placed", delay:0 },
        { name:"Signed", delay:t.sign },
        { name:"Collected", delay:t.collect },
        { name:"Processing", delay:t.process },
        { name:"Resulted", delay:t.result },
      ];
    case "imaging":
      return [
        { name:"Placed", delay:0 },
        { name:"Signed", delay:t.sign },
        { name:"Scheduled", delay:t.schedule },
        { name:"In Progress", delay:t.inProgress },
        { name:"Resulted", delay:t.result },
      ];
    case "diagnostic":
      return [
        { name:"Placed", delay:0 },
        { name:"Signed", delay:t.sign },
        { name:"Performing", delay:t.perform },
        { name:"Interpreting", delay:t.interpret },
        { name:"Resulted", delay:t.result },
      ];
    case "medication":
      return [
        { name:"Placed", delay:0 },
        { name:"Signed", delay:t.sign },
        { name:"Pharmacy Verify", delay:t.verify },
        { name:"Dispensed", delay:t.dispense },
        { name:"Ready", delay:t.ready },
      ];
    case "nursing":
      return [
        { name:"Placed", delay:0 },
        { name:"Signed", delay:t.sign },
        { name:"Acknowledged", delay:t.acknowledge },
        { name:"Completed", delay:t.complete },
      ];
    default: return [{ name:"Placed", delay:0 }, { name:"Completed", delay:10000 }];
  }
}

function placeOrder(catalogItem, priority, ptId) {
  const pid = ptId || State.activePatientId;
  if (!pid) return;
  const p = priority || "Routine";
  const stages = getStages(catalogItem.cat, p);
  // Adjust timing by sim speed
  const speedAdjust = (ms) => ms / State.simClock.speed;
  const now = Date.now();
  
  const order = {
    id: uid(),
    catalogId: catalogItem.id,
    patientId: pid,
    name: catalogItem.name,
    cat: catalogItem.cat,
    sub: catalogItem.sub,
    resultKey: catalogItem.resultKey,
    medEffect: catalogItem.medEffect || null,
    priority: p,
    placedAt: now,
    placedSimTime: simTimeStr(),
    stages: stages.map((s, i) => ({
      ...s,
      targetTime: now + speedAdjust(s.delay),
      completed: i === 0, // "Placed" is immediately completed
      completedAt: i === 0 ? now : null,
    })),
    currentStage: 0,
    status: "Placed",
    cancelled: false,
    resulted: false,
  };
  
  if (!State.orders[pid]) State.orders[pid] = [];
  State.orders[pid].unshift(order);
  log(`Order placed: ${order.name} [${p}]`, pid);
  notify(`Order Placed`, `${order.name} — ${p}`, "order");
  updateCounts();
  saveState();
  return order;
}

function processOrderTimers() {
  const now = Date.now();
  Object.keys(State.orders).forEach(pid => {
    State.orders[pid].forEach(order => {
      if (order.cancelled || order.resulted) return;
      
      const nextIdx = order.stages.findIndex(s => !s.completed);
      if (nextIdx === -1) return;
      
      const stage = order.stages[nextIdx];
      // Recalculate target based on speed (speed might have changed)
      const baseDelay = getStages(order.cat, order.priority)[nextIdx]?.delay || 10000;
      const adjustedDelay = baseDelay / State.simClock.speed;
      const prevCompleted = order.stages[nextIdx - 1]?.completedAt || order.placedAt;
      const target = prevCompleted + adjustedDelay;
      
      if (now >= target) {
        stage.completed = true;
        stage.completedAt = now;
        order.currentStage = nextIdx;
        order.status = stage.name;
        
        const pt = State.patients.find(p => p.id === pid);
        const ptName = pt ? pt.name.split(",")[0] : pid;
        
        // Check if this is the final stage
        if (nextIdx === order.stages.length - 1) {
          if (order.cat === "medication") {
            // Medication is ready to administer
            order.status = "Ready";
            notify(`Medication Ready`, `${order.name} — ready for ${ptName}`, "med");
            log(`Medication ready: ${order.name}`, pid);
            // Apply med effect to MAR
            addMedToMAR(order, pid);
          } else {
            // Generate results
            order.resulted = true;
            generateResults(order, pid);
          }
        } else {
          // Intermediate stage notification for important stages
          if (stage.name === "Collected" || stage.name === "In Progress" || stage.name === "Performing") {
            log(`${order.name}: ${stage.name}`, pid);
          }
        }
        
        // Re-render if viewing orders tab
        if (State.activeTab === "Orders" && State.activePatientId === pid) {
          renderTab();
        }
        updateCounts();
        saveState();
      }
    });
  });
}

function addMedToMAR(order, pid) {
  const pt = State.patients.find(p => p.id === pid);
  if (!pt) return;
  // Check if already in inptMeds via MAR rendering (we track in orders)
  // The MAR tab will pull from orders where cat === "medication"
}

function cancelOrder(orderId, pid) {
  const orders = State.orders[pid];
  if (!orders) return;
  const order = orders.find(o => o.id === orderId);
  if (!order || order.resulted) return;
  order.cancelled = true;
  order.status = "Cancelled";
  log(`Order cancelled: ${order.name}`, pid);
  notify(`Order Cancelled`, order.name, "info");
  updateCounts();
  saveState();
  if (State.activeTab === "Orders") renderTab();
}

// ─── RESULT GENERATION ───
function generateResults(order, pid) {
  const generators = RESULT_GENERATORS[pid];
  const key = order.resultKey;
  let resultItems = [];
  
  // Try patient-specific generator first, then generic
  if (generators && typeof generators[key] === "function") {
    resultItems = generators[key].call(generators);
  } else if (GENERIC_RESULTS[key]) {
    resultItems = GENERIC_RESULTS[key]();
  } else {
    // Fallback: generic normal result
    resultItems = [{ name: order.name, value: "See report", unit: "", ref: "", flag: "NORMAL", cat: order.cat === "lab" ? "Lab" : order.cat === "imaging" ? "Imaging" : "Diagnostic" }];
  }
  
  if (!State.results[pid]) State.results[pid] = [];
  
  const pt = State.patients.find(p => p.id === pid);
  const ptName = pt ? pt.name.split(",")[0] : pid;
  
  resultItems.forEach(r => {
    // Auto-flag based on ref range if not explicitly set
    if (!r.flag && r.refLo !== undefined && r.refHi !== undefined) {
      const v = parseFloat(r.value);
      if (isNaN(v)) { r.flag = "NORMAL"; }
      else if (v > r.refHi * 2 || v < r.refLo * 0.5) { r.flag = "CRITICAL"; }
      else if (v > r.refHi) { r.flag = "HIGH"; }
      else if (v < r.refLo) { r.flag = "LOW"; }
      else { r.flag = "NORMAL"; }
    }
    if (!r.flag) r.flag = "NORMAL";
    if (!r.cat) r.cat = order.cat === "lab" ? "Lab" : order.cat === "imaging" ? "Imaging" : "Diagnostic";
    
    const result = {
      id: uid(),
      orderId: order.id,
      name: r.name,
      value: String(r.value),
      unit: r.unit || "",
      ref: r.ref || "",
      flag: r.flag,
      cat: r.cat,
      report: r.report || null,
      time: simTimeStr(),
      ack: false,
      resultedAt: Date.now(),
      isPending: r.isPending || false,
    };
    
    State.results[pid].unshift(result);
    
    // Handle pending results that will finalize later (like blood cultures)
    if (r.isPending && r.pendingFinal) {
      const finalDelay = (r.pendingFinal.delay || 120000) / State.simClock.speed;
      setTimeout(() => {
        result.value = r.pendingFinal.value;
        result.flag = r.pendingFinal.flag;
        result.isPending = false;
        result.time = simTimeStr();
        notify(`🔬 Culture Final Result`, `${ptName}: ${result.name} — ${result.value}`, result.flag === "CRITICAL" ? "critical" : "result");
        log(`Culture finalized: ${result.name} — ${result.value}`, pid);
        if (State.activeTab === "Results" && State.activePatientId === pid) renderTab();
        saveState();
      }, finalDelay);
    }
  });
  
  // Determine notification type
  const hasCritical = resultItems.some(r => r.flag === "CRITICAL");
  const hasAbnormal = resultItems.some(r => r.flag !== "NORMAL" && r.flag !== "PENDING");
  const notifType = hasCritical ? "critical" : hasAbnormal ? "result" : "result";
  const firstResult = resultItems[0];
  
  const notifTitle = hasCritical ? "⚠ CRITICAL RESULT" : "New Result Available";
  const notifBody = resultItems.length === 1 
    ? `${ptName}: ${firstResult.name} = ${firstResult.value} ${firstResult.unit || ""} ${firstResult.flag !== "NORMAL" && firstResult.flag !== "PENDING" ? `[${firstResult.flag}]` : ""}`
    : `${ptName}: ${order.name} — ${resultItems.length} values resulted`;
  
  notify(notifTitle, notifBody, notifType);
  log(`Results available: ${order.name}`, pid);
  
  if (State.activeTab === "Results" && State.activePatientId === pid) renderTab();
  updateCounts();
  saveState();
}

// ─── VITALS ENGINE ───
function generateNextVitals(pt) {
  const last = pt.vitalsHistory[pt.vitalsHistory.length - 1];
  if (!last) return;
  
  // Base variation
  let dHR = randRange(-3, 3, 0);
  let dSBP = randRange(-4, 4, 0);
  let dDBP = randRange(-3, 3, 0);
  let dRR = randRange(-1, 1, 0);
  let dSpo2 = randRange(-1, 1, 0);
  let dTemp = randRange(-0.2, 0.1);
  let dPain = 0;
  
  // Check recent medication effects from placed orders
  const ptOrders = State.orders[pt.id] || [];
  const recentMeds = ptOrders.filter(o => 
    o.cat === "medication" && !o.cancelled && 
    o.stages.some(s => s.name === "Ready" && s.completed) &&
    (Date.now() - o.placedAt) < 300000 // within last 5 min real time
  );
  
  recentMeds.forEach(o => {
    const catalogItem = ORDER_CATALOG.find(c => c.id === o.catalogId);
    if (catalogItem?.medEffect?.type === "vitals") {
      const eff = catalogItem.medEffect;
      if (eff.hr) dHR += eff.hr * 0.3; // gradual effect
      if (eff.bp) { dSBP += eff.bp * 0.3; dDBP += (eff.bp * 0.5) * 0.3; }
      if (eff.rr) dRR += eff.rr * 0.3;
      if (eff.spo2) dSpo2 += eff.spo2 * 0.3;
      if (eff.temp) dTemp += eff.temp * 0.3;
      if (eff.pain) dPain += eff.pain * 0.3;
    }
  });
  
  // General trend toward improvement over time (slight)
  const hCount = pt.vitalsHistory.length;
  if (hCount > 3) { dHR -= 1; dRR -= 0.5; dSpo2 += 0.3; }
  
  const hr = Math.round(Math.max(40, Math.min(180, parseInt(last.hr || last.bp?.split("/")[0]) + dHR)));
  const prevSBP = parseInt(last.bp.split("/")[0]);
  const prevDBP = parseInt(last.bp.split("/")[1]);
  const sbp = Math.round(Math.max(60, Math.min(220, prevSBP + dSBP)));
  const dbp = Math.round(Math.max(30, Math.min(130, prevDBP + dDBP)));
  const rr = Math.round(Math.max(8, Math.min(40, last.rr + dRR)));
  const spo2 = Math.round(Math.max(70, Math.min(100, last.spo2 + dSpo2)));
  const temp = +(Math.max(95, Math.min(106, last.temp + dTemp))).toFixed(1);
  const pain = Math.round(Math.max(0, Math.min(10, last.pain + dPain)));
  
  const newVitals = {
    time: simTimeStr(),
    hr, bp: `${sbp}/${dbp}`, rr, spo2, temp, pain,
    src: "Auto (Sim)"
  };
  
  pt.vitalsHistory.push(newVitals);
  if (pt.vitalsHistory.length > 20) pt.vitalsHistory = pt.vitalsHistory.slice(-20);
  
  // Alert on critical vitals
  if (hr > 150 || hr < 45) notify("⚠ Vitals Alert", `${pt.name.split(",")[0]}: HR ${hr}`, "critical");
  if (sbp < 80 || sbp > 200) notify("⚠ Vitals Alert", `${pt.name.split(",")[0]}: BP ${sbp}/${dbp}`, "critical");
  if (spo2 < 88) notify("⚠ Vitals Alert", `${pt.name.split(",")[0]}: SpO₂ ${spo2}%`, "critical");
  if (temp > 103) notify("⚠ Vitals Alert", `${pt.name.split(",")[0]}: Temp ${temp}°F`, "critical");
  
  if (State.activeTab === "Summary" && State.activePatientId === pt.id) renderTab();
  saveState();
}

let vitalsInterval;
function startVitalsEngine() {
  vitalsInterval = setInterval(() => {
    if (State.simClock.paused) return;
    State.patients.forEach(pt => generateNextVitals(pt));
  }, 45000); // Generate new vitals every ~45 real seconds
}

function clearAllTimers() {
  Object.values(State.orders).forEach(orders => {
    orders.forEach(o => { o.cancelled = true; });
  });
}

// ─── RENDER ENGINE ───
function renderAll() {
  renderPatientList();
  renderBanner();
  renderEncounterContext();
  renderTab();
  renderAudit();
  updateCounts();
}

function renderPatientList() {
  const search = document.getElementById("patient-search").value.toLowerCase();
  const list = document.getElementById("patient-list");
  const filtered = State.patients.filter(p => 
    p.name.toLowerCase().includes(search) || p.mrn.toLowerCase().includes(search)
  );
  list.innerHTML = filtered.map(p => {
    const acuityNum = p.acuity ? parseInt(p.acuity.split("-")[1]) : 3;
    return `<button class="patient-item ${p.id === State.activePatientId ? 'active' : ''}" data-pid="${p.id}">
      <div class="patient-item-name">${p.name} <span class="patient-item-acuity acuity-${acuityNum}">${p.acuity || ''}</span></div>
      <div class="patient-item-info">${p.location} · ${p.chief.substring(0, 35)}…</div>
    </button>`;
  }).join("");
}

function renderBanner() {
  const pt = activePt();
  const banner = document.getElementById("patient-banner");
  if (!pt) { banner.innerHTML = `<span class="banner-placeholder">Select a patient to begin</span>`; return; }
  const allergyStr = pt.allergies.length > 0 
    ? `<span class="pill pill-red">⚠ ${pt.allergies.map(a => a.agent).join(", ")}</span>` 
    : `<span class="pill pill-green">NKDA</span>`;
  const alertStr = pt.alerts.map(a => `<span class="pill pill-yellow">${a}</span>`).join(" ");
  banner.innerHTML = `
    <span class="banner-name">${pt.name}</span>
    <span class="pill pill-info">${pt.mrn}</span>
    <span class="banner-info">DOB: ${pt.dob} (${pt.age}${pt.sex})</span>
    <span class="pill pill-blue">${pt.location}</span>
    <span class="pill pill-info">${pt.encounter}</span>
    ${allergyStr} ${alertStr}
  `;
}

function renderEncounterContext() {
  const pt = activePt();
  const el = document.getElementById("encounter-context");
  if (!pt) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="section-label">Encounter</div>
    <div style="padding:0 10px">
      <div class="encounter-line"><strong>${pt.encounter}</strong></div>
      <div class="encounter-line">${pt.location} · ${pt.status} · ${pt.acuity}</div>
      <div class="encounter-line">Role: ${State.role} · Unit: ${State.unit}</div>
      <div class="encounter-line mt-4" style="font-size:10px;color:var(--text-mute)">Chief: ${pt.chief}</div>
    </div>
  `;
}

function renderAudit() {
  const pt = activePt();
  const el = document.getElementById("audit-log");
  const entries = State.audit.filter(a => !pt || a.ptId === pt.id).slice(0, 40);
  if (entries.length === 0) { el.innerHTML = `<div class="text-muted-small">No actions recorded yet.</div>`; return; }
  el.innerHTML = entries.map(a => 
    `<div class="audit-entry"><span class="audit-time">${a.time}</span>${a.action}</div>`
  ).join("");
}

function updateCounts() {
  const pt = activePt();
  const pid = pt?.id;
  const unackCount = pid ? (State.results[pid] || []).filter(r => !r.ack).length : 0;
  const unsignedCount = Object.values(State.notes).flat().filter(n => n.status === "Draft").length;
  const activeOrderCount = Object.values(State.orders).flat().filter(o => !o.cancelled && !o.resulted && o.status !== "Ready").length;
  const pendingCount = Object.values(State.orders).flat().filter(o => !o.cancelled && !o.resulted).length;
  
  document.getElementById("count-results").textContent = unackCount;
  document.getElementById("count-results").className = `activity-count ${unackCount > 0 ? 'count-red' : ''}`;
  document.getElementById("count-unsigned").textContent = unsignedCount;
  document.getElementById("count-unsigned").className = `activity-count ${unsignedCount > 0 ? 'count-yellow' : ''}`;
  
  const badge = document.getElementById("tab-badge-results");
  if (unackCount > 0) { badge.textContent = unackCount; badge.classList.remove("hidden"); }
  else { badge.classList.add("hidden"); }
  
  document.getElementById("active-orders-count").textContent = activeOrderCount;
  document.getElementById("pending-results-count").textContent = pendingCount;
}

// ─── TAB RENDERER ───
function renderTab() {
  const content = document.getElementById("tab-content");
  const pt = activePt();
  if (!pt) { content.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-mute)"><h2>Select a patient from the sidebar to begin</h2><p>Choose a clinical scenario to practice your EHR workflow.</p></div>`; return; }
  
  switch (State.activeTab) {
    case "Summary": renderSummary(content, pt); break;
    case "Timeline": renderTimeline(content, pt); break;
    case "Orders": renderOrders(content, pt); break;
    case "Results": renderResults(content, pt); break;
    case "MAR": renderMAR(content, pt); break;
    case "Notes": renderNotes(content, pt); break;
    case "Imaging": renderImaging(content, pt); break;
    case "Disposition": renderDisposition(content, pt); break;
    default: content.innerHTML = `<div class="text-muted-small">Tab not implemented.</div>`;
  }
}

// ─── SUMMARY TAB ───
function renderSummary(el, pt) {
  const v = pt.vitalsHistory[pt.vitalsHistory.length - 1];
  const sbp = parseInt(v.bp.split("/")[0]);
  
  const flagClass = (val, lo, hi) => val > hi ? 'flag-high' : val < lo ? 'flag-low' : '';
  const valClass = (val, lo, hi) => val > hi ? 'text-red' : val < lo ? 'text-yellow' : '';
  
  const ptOrders = (State.orders[pt.id] || []).filter(o => !o.cancelled);
  const ptResults = (State.results[pt.id] || []).filter(r => !r.ack);
  
  el.innerHTML = `
    <div class="grid-2">
      <!-- Triage Note -->
      <div class="card card-span-2">
        <div class="card-title">📋 Triage / Presenting Info</div>
        <div style="font-size:12px;color:var(--text-sec);line-height:1.6">${pt.triage}</div>
      </div>
      
      <!-- Vitals -->
      <div class="card card-span-2">
        <div class="card-title">Vitals <span class="text-muted-xs" style="margin-left:auto">Latest: ${v.time} · ${pt.vitalsHistory.length} sets recorded · Source: ${v.src || 'RN'}</span></div>
        <div class="vitals-row">
          <div class="vital-box ${flagClass(v.hr,60,100)}"><div class="vital-label">HR</div><div class="vital-value ${valClass(v.hr,60,100)}">${v.hr}</div><div class="vital-unit">bpm</div></div>
          <div class="vital-box ${flagClass(sbp,90,140)}"><div class="vital-label">BP</div><div class="vital-value ${valClass(sbp,90,140)}">${v.bp}</div><div class="vital-unit">mmHg</div></div>
          <div class="vital-box ${flagClass(v.rr,12,20)}"><div class="vital-label">RR</div><div class="vital-value ${valClass(v.rr,12,20)}">${v.rr}</div><div class="vital-unit">/min</div></div>
          <div class="vital-box ${flagClass(v.spo2,95,101)}"><div class="vital-label">SpO₂</div><div class="vital-value ${valClass(v.spo2,95,101)}">${v.spo2}</div><div class="vital-unit">%</div></div>
          <div class="vital-box ${flagClass(v.temp,97,100.4)}"><div class="vital-label">Temp</div><div class="vital-value ${valClass(v.temp,97,100.4)}">${v.temp}</div><div class="vital-unit">°F</div></div>
          <div class="vital-box ${flagClass(v.pain,0,6)}"><div class="vital-label">Pain</div><div class="vital-value ${valClass(v.pain,0,6)}">${v.pain}</div><div class="vital-unit">/10</div></div>
        </div>
        <details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;color:var(--text-mute)">Show vitals trend (${pt.vitalsHistory.length} entries)</summary>
          <table class="tbl" style="margin-top:8px"><thead><tr><th>Time</th><th>Src</th><th>HR</th><th>BP</th><th>RR</th><th>SpO₂</th><th>Temp</th><th>Pain</th></tr></thead>
          <tbody>${pt.vitalsHistory.slice().reverse().map(vv => `<tr><td>${vv.time}</td><td style="font-size:10px;color:var(--text-mute)">${vv.src||''}</td><td>${vv.hr}</td><td>${vv.bp}</td><td>${vv.rr}</td><td>${vv.spo2}%</td><td>${vv.temp}</td><td>${vv.pain}</td></tr>`).join("")}</tbody></table>
        </details>
      </div>
      
      <!-- Allergies -->
      <div class="card">
        <div class="card-title">⚠ Allergies & Alerts</div>
        ${pt.allergies.length === 0 ? '<div class="pill pill-green">NKDA — No Known Drug Allergies</div>' :
          pt.allergies.map(a => `<div class="flex-center mb-4"><span class="pill ${a.severity==='High'?'pill-red':'pill-yellow'}">${a.severity==='High'?'⛔':'⚠'} ${a.agent}</span><span style="font-size:11px;color:var(--text-sec)">${a.reaction}</span></div>`).join("")}
        <div class="mt-8">${pt.alerts.map(a => `<span class="pill pill-yellow" style="margin:2px">${a}</span>`).join(" ")}</div>
      </div>
      
      <!-- Problems -->
      <div class="card">
        <div class="card-title">Problem List</div>
        ${pt.problems.map((p,i) => `<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border);color:var(--text-sec)">${i+1}. ${p}</div>`).join("")}
      </div>
      
      <!-- Home Meds -->
      <div class="card">
        <div class="card-title">Home Medications</div>
        ${pt.homeMeds.map(m => `<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border)">${m.name} <span style="color:var(--text-mute)">${m.route} ${m.freq}</span></div>`).join("")}
      </div>
      
      <!-- Active Orders Summary -->
      <div class="card">
        <div class="card-title">Active Orders (${ptOrders.length}) · Unack Results (${ptResults.length})</div>
        ${ptOrders.slice(0,6).map(o => `<div style="padding:3px 0;font-size:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span>${o.name}</span>${statusPill(o.status)}</div>`).join("")}
        ${ptOrders.length > 6 ? `<div class="text-muted-xs mt-4">+${ptOrders.length-6} more — see Orders tab</div>` : ''}
        ${ptOrders.length === 0 ? '<div class="text-muted-small">No active orders.</div>' : ''}
      </div>
      
      <!-- Quick Order Set -->
      <div class="card card-span-2">
        <div class="card-title">⚡ Quick Order Set</div>
        <div class="quick-order-grid" id="quick-order-grid">
          ${["OC1","OC2","OC4","OC6","OC7","OC60","OC40","OC12","OC10","OC5","OC11","OC25"].map(id => {
            const c = ORDER_CATALOG.find(x => x.id === id);
            return c ? `<label class="quick-order-item" data-catid="${c.id}"><input type="checkbox" />${c.name.replace(/\s*\(.*\)/, '').substring(0,20)}</label>` : '';
          }).join("")}
        </div>
        <button class="btn btn-primary" id="quick-order-btn">Place Selected Orders (STAT)</button>
      </div>
      
      <!-- ED Course -->
      <div class="card card-span-2">
        <div class="card-title">ED Course / Clinical Notes</div>
        <textarea class="input input-mono" id="ed-course-text" placeholder="Document the ED course here... (autosaves)" style="min-height:100px">${pt.edCourse || ''}</textarea>
        <div class="text-muted-xs mt-4">Auto-saves to patient record</div>
      </div>
    </div>
  `;
  
  // Bind quick order
  document.getElementById("quick-order-btn")?.addEventListener("click", () => {
    const checked = el.querySelectorAll(".quick-order-item input:checked");
    if (checked.length === 0) return;
    checked.forEach(cb => {
      const catId = cb.closest(".quick-order-item").dataset.catid;
      const item = ORDER_CATALOG.find(c => c.id === catId);
      if (item) placeOrder(item, "STAT");
      cb.checked = false;
    });
    renderTab();
  });
  
  // ED course autosave
  document.getElementById("ed-course-text")?.addEventListener("input", (e) => {
    pt.edCourse = e.target.value;
    saveState();
  });
}

// ─── TIMELINE TAB ───
function renderTimeline(el, pt) {
  const events = [];
  pt.vitalsHistory.forEach(v => events.push({ time: v.time, type: "Vitals", desc: `HR ${v.hr} | BP ${v.bp} | SpO₂ ${v.spo2}% | T ${v.temp}°F | Pain ${v.pain}`, cat: "vitals" }));
  (State.results[pt.id] || []).forEach(r => events.push({ time: r.time, type: r.cat, desc: `${r.name}: ${r.value} ${r.unit||""} ${r.flag!=="NORMAL"&&r.flag!=="PENDING"?`[${r.flag}]`:""}`, cat: "result" }));
  (State.orders[pt.id] || []).forEach(o => events.push({ time: o.placedSimTime, type: "Order", desc: `${o.name} [${o.priority}] — ${o.status}`, cat: "order" }));
  (State.notes[pt.id] || []).forEach(n => events.push({ time: n.time, type: "Note", desc: `${n.type} — ${n.status}`, cat: "note" }));
  State.audit.filter(a => a.ptId === pt.id).forEach(a => events.push({ time: a.time, type: "Action", desc: a.action, cat: "action" }));
  
  const catColors = { vitals: "var(--cyan)", result: "var(--blue)", order: "var(--green)", note: "var(--purple)", action: "var(--text-mute)" };
  const catPill = { vitals: "pill-blue", result: "pill-blue", order: "pill-green", note: "pill-purple", action: "pill-mute" };
  
  el.innerHTML = `
    <div class="filter-bar">
      <input type="text" class="input" style="width:300px" placeholder="Filter timeline..." id="timeline-filter" />
      <span class="text-muted-small">${events.length} events</span>
    </div>
    <div class="timeline" id="timeline-list">
      <div class="timeline-line"></div>
      ${events.map(e => `
        <div class="timeline-item" data-search="${(e.desc+e.type).toLowerCase()}">
          <div class="timeline-dot" style="background:${catColors[e.cat]||'var(--text-mute)'}"></div>
          <div class="timeline-card">
            <div class="timeline-card-header">
              <span class="pill ${catPill[e.cat]||'pill-mute'}">${e.type}</span>
              <span class="text-muted-xs">${e.time}</span>
            </div>
            <div style="font-size:12px;color:var(--text-sec)">${e.desc}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  
  document.getElementById("timeline-filter")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".timeline-item").forEach(item => {
      item.style.display = !q || item.dataset.search.includes(q) ? "" : "none";
    });
  });
}

// ─── ORDERS TAB ───
function renderOrders(el, pt) {
  const ptOrders = State.orders[pt.id] || [];
  const cats = ["All","lab","imaging","diagnostic","medication","nursing"];
  
  el.innerHTML = `
    <div class="grid-2">
      <!-- Catalog -->
      <div class="card">
        <div class="card-title">Order Catalog</div>
        <div class="filter-bar" id="order-cat-filters">
          ${cats.map(c => `<button class="filter-btn ${c==='All'?'active':''}" data-cat="${c}">${c==='All'?'All':c.charAt(0).toUpperCase()+c.slice(1)}</button>`).join("")}
        </div>
        <input type="text" class="input mb-8" placeholder="Search orders..." id="order-search" />
        <div style="max-height:400px;overflow-y:auto" id="order-catalog-list"></div>
      </div>
      
      <div>
        <!-- Cart -->
        <div class="card">
          <div class="card-title">🛒 Order Cart (<span id="cart-count">${State.cart.length}</span>)</div>
          <div id="cart-items">
            ${State.cart.length === 0 ? '<div class="text-muted-small">Add orders from catalog.</div>' : ''}
          </div>
          ${State.cart.length > 0 ? `
            <div class="flex-center mt-8">
              <select class="input" style="width:auto" id="cart-priority">
                <option>STAT</option><option>Urgent</option><option>Routine</option>
              </select>
              <button class="btn btn-primary" id="place-orders-btn">Place ${State.cart.length} Order(s)</button>
            </div>
          ` : ''}
        </div>
        
        <!-- Active Orders -->
        <div class="card">
          <div class="card-title">Active & Recent Orders (${ptOrders.length})</div>
          <div style="max-height:400px;overflow-y:auto">
            ${ptOrders.length === 0 ? '<div class="text-muted-small">No orders placed yet.</div>' : ''}
            ${ptOrders.map(o => renderOrderRow(o)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
  
  renderCatalog(el);
  renderCartItems();
  bindOrderEvents(el, pt);
}

function renderCatalog(el) {
  const catFilter = el.querySelector(".filter-btn.active")?.dataset.cat || "All";
  const search = document.getElementById("order-search")?.value?.toLowerCase() || "";
  const list = document.getElementById("order-catalog-list");
  if (!list) return;
  
  const filtered = ORDER_CATALOG.filter(o => 
    (catFilter === "All" || o.cat === catFilter) &&
    (o.name.toLowerCase().includes(search) || o.sub.toLowerCase().includes(search))
  );
  
  list.innerHTML = filtered.map(o => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div><span>${o.name}</span><span style="color:var(--text-mute);margin-left:8px;font-size:10px">${o.sub}</span></div>
      <button class="btn btn-sm btn-ghost add-to-cart-btn" data-catid="${o.id}">+ Add</button>
    </div>
  `).join("");
}

function renderCartItems() {
  const container = document.getElementById("cart-items");
  if (!container) return;
  if (State.cart.length === 0) { container.innerHTML = '<div class="text-muted-small">Add orders from catalog.</div>'; return; }
  container.innerHTML = State.cart.map(c => `
    <div class="cart-item">
      <span class="cart-item-name">${c.name} <span class="pill pill-info">${c.cat}</span></span>
      <button class="cart-remove remove-cart-btn" data-cartid="${c.id}">×</button>
    </div>
  `).join("");
}

function renderOrderRow(o) {
  const stages = o.stages || [];
  const pipelineHTML = stages.map((s, i) => {
    const cls = s.completed ? "done" : i === stages.findIndex(x => !x.completed) ? "active" : "pending";
    return `<span class="pipeline-step ${cls}">${s.name}</span>`;
  }).join("");
  
  const elapsed = o.resulted || o.cancelled ? "" : formatElapsed(Date.now() - o.placedAt);
  
  return `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);${o.cancelled?'opacity:0.4':''}" data-orderid="${o.id}">
      <div class="flex-between">
        <div>
          <span class="fw-600" style="font-size:12px">${o.name}</span>
          <span class="pill ${o.priority==='STAT'?'pill-red':o.priority==='Urgent'?'pill-yellow':'pill-info'}" style="margin-left:6px">${o.priority}</span>
        </div>
        <div class="flex-center gap-4">
          ${elapsed ? `<span class="timer-display">${elapsed}</span>` : ''}
          ${!o.cancelled && !o.resulted && o.status !== "Ready" ? `<button class="btn btn-xs btn-danger cancel-order-btn" data-oid="${o.id}">Cancel</button>` : ''}
          ${statusPill(o.status)}
        </div>
      </div>
      <div class="pipeline mt-4">${pipelineHTML}</div>
      <div class="text-muted-xs mt-4">Placed: ${o.placedSimTime}</div>
    </div>
  `;
}

function bindOrderEvents(el, pt) {
  // Category filters
  el.querySelectorAll("#order-cat-filters .filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll("#order-cat-filters .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCatalog(el);
      bindCatalogButtons();
    });
  });
  
  document.getElementById("order-search")?.addEventListener("input", () => { renderCatalog(el); bindCatalogButtons(); });
  
  bindCatalogButtons();
  
  // Cart removes
  el.querySelectorAll(".remove-cart-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      State.cart = State.cart.filter(c => c.id !== btn.dataset.cartid);
      renderTab();
    });
  });
  
  // Place orders
  document.getElementById("place-orders-btn")?.addEventListener("click", () => {
    const priority = document.getElementById("cart-priority")?.value || "Routine";
    State.cart.forEach(item => {
      const catItem = ORDER_CATALOG.find(c => c.id === item.catalogId);
      if (catItem) placeOrder(catItem, priority);
    });
    State.cart = [];
    renderTab();
  });
  
  // Cancel buttons
  el.querySelectorAll(".cancel-order-btn").forEach(btn => {
    btn.addEventListener("click", () => cancelOrder(btn.dataset.oid, pt.id));
  });
}

function bindCatalogButtons() {
  document.querySelectorAll(".add-to-cart-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const catItem = ORDER_CATALOG.find(c => c.id === btn.dataset.catid);
      if (catItem && !State.cart.find(c => c.catalogId === catItem.id)) {
        State.cart.push({ id: uid(), catalogId: catItem.id, name: catItem.name, cat: catItem.cat });
        renderTab();
      }
    });
  });
}

// ─── RESULTS TAB ───
function renderResults(el, pt) {
  const results = State.results[pt.id] || [];
  
  // Find trendable items
  const nameCounts = {};
  results.forEach(r => { if (!isNaN(parseFloat(r.value))) nameCounts[r.name] = (nameCounts[r.name]||0)+1; });
  const trendable = Object.keys(nameCounts).filter(n => nameCounts[n] > 1);
  
  el.innerHTML = `
    <div class="filter-bar">
      <button class="filter-btn active" data-rf="All">All</button>
      <button class="filter-btn" data-rf="Abnormal">Abnormal</button>
      <button class="filter-btn" data-rf="Critical">Critical</button>
      <button class="filter-btn" data-rf="Pending">Pending</button>
      <button class="filter-btn" data-rf="Lab">Lab</button>
      <button class="filter-btn" data-rf="Imaging">Imaging</button>
      <input type="text" class="input" style="width:200px;margin-left:auto" placeholder="Search results..." id="result-search" />
      <button class="btn btn-primary btn-sm" id="ack-all-btn">✓ Ack All</button>
    </div>
    ${trendable.length > 0 ? `
      <div class="flex-center mb-8">
        <span class="text-muted-small">Trends:</span>
        ${trendable.map(t => `<button class="btn btn-xs btn-ghost trend-btn" data-trend="${t}">📈 ${t}</button>`).join("")}
      </div>
      <div id="trend-panel"></div>
    ` : ''}
    <table class="tbl">
      <thead><tr><th>Test</th><th>Value</th><th>Reference</th><th>Flag</th><th>Time</th><th>Status</th><th></th></tr></thead>
      <tbody id="results-tbody"></tbody>
    </table>
  `;
  
  renderResultRows(results);
  
  // Filter buttons
  el.querySelectorAll("[data-rf]").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll("[data-rf]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.rf;
      const filtered = results.filter(r => {
        if (f === "Abnormal") return r.flag !== "NORMAL" && r.flag !== "PENDING";
        if (f === "Critical") return r.flag === "CRITICAL";
        if (f === "Pending") return r.flag === "PENDING" || r.isPending;
        if (f === "Lab") return r.cat === "Lab";
        if (f === "Imaging") return r.cat === "Imaging";
        return true;
      });
      renderResultRows(filtered);
    });
  });
  
  document.getElementById("result-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = results.filter(r => r.name.toLowerCase().includes(q));
    renderResultRows(filtered);
  });
  
  document.getElementById("ack-all-btn")?.addEventListener("click", () => {
    results.forEach(r => r.ack = true);
    log("Acknowledged all results");
    renderTab();
  });
  
  // Trend buttons
  el.querySelectorAll(".trend-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.trend;
      const data = results.filter(r => r.name === name && !isNaN(parseFloat(r.value))).reverse();
      const panel = document.getElementById("trend-panel");
      if (!panel) return;
      const max = Math.max(...data.map(d => parseFloat(d.value)));
      panel.innerHTML = `
        <div class="card mb-12">
          <div class="card-title">Trend: ${name}</div>
          <div class="trend-chart">
            ${data.map(d => {
              const v = parseFloat(d.value);
              const h = max > 0 ? Math.max(8, (v/max)*60) : 10;
              return `<div class="trend-bar-wrap"><span class="trend-value">${v}</span><div class="trend-bar" style="height:${h}px"></div><span class="trend-time">${d.time}</span></div>`;
            }).join("")}
          </div>
        </div>
      `;
    });
  });
}

function renderResultRows(results) {
  const tbody = document.getElementById("results-tbody");
  if (!tbody) return;
  tbody.innerHTML = results.map(r => {
    const rowClass = r.flag === "CRITICAL" ? "tbl-row-critical" : (r.flag === "HIGH" || r.flag === "LOW" || r.flag === "ABNORMAL") ? "tbl-row-abnormal" : "";
    return `<tr class="${rowClass}">
      <td class="fw-600">${r.name}</td>
      <td><span style="color:${r.flag==='CRITICAL'?'var(--red)':r.flag==='NORMAL'||r.flag==='PENDING'?'var(--text-pri)':'var(--yellow)'};font-weight:${r.flag==='CRITICAL'?700:400}">${r.value}</span>${r.unit ? `<span style="color:var(--text-mute);margin-left:4px">${r.unit}</span>` : ''}</td>
      <td style="color:var(--text-mute)">${r.ref || '—'}</td>
      <td>${flagPill(r.flag)}</td>
      <td style="color:var(--text-mute)">${r.time}</td>
      <td>${r.ack ? '<span style="color:var(--green);font-size:11px">✓ Ack</span>' : '<span style="color:var(--yellow);font-size:11px">● New</span>'}</td>
      <td>
        ${!r.ack ? `<button class="btn btn-xs btn-ghost ack-btn" data-rid="${r.id}">Ack</button>` : ''}
        ${r.report ? `<button class="btn btn-xs btn-ghost report-btn" data-rid="${r.id}">📄 Report</button>` : ''}
      </td>
    </tr>`;
  }).join("");
  
  // Bind ack buttons
  tbody.querySelectorAll(".ack-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pt = activePt();
      const result = (State.results[pt.id]||[]).find(r => r.id === btn.dataset.rid);
      if (result) { result.ack = true; log(`Acknowledged: ${result.name}`); renderTab(); }
    });
  });
  
  // Report buttons
  tbody.querySelectorAll(".report-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pt = activePt();
      const result = (State.results[pt.id]||[]).find(r => r.id === btn.dataset.rid);
      if (result?.report) alert(result.report);
    });
  });
}

// ─── MAR TAB ───
function renderMAR(el, pt) {
  // Combine seed inpatient meds with medication orders
  const seedMeds = (pt.homeMeds || []).map((m, i) => ({ id:`home-${i}`, name:m.name, route:m.route, freq:m.freq, sched:"Home", status:"Home", lastGiven:null, isHome:true }));
  const orderMeds = (State.orders[pt.id] || []).filter(o => o.cat === "medication" && !o.cancelled).map(o => {
    const isReady = o.stages.some(s => s.name === "Ready" && s.completed);
    const isAdministered = o._administered;
    return {
      id: o.id,
      name: o.name,
      route: o.sub?.includes("IV") ? "IV" : "PO",
      freq: o.priority === "STAT" ? "STAT" : "Scheduled",
      sched: o.priority === "STAT" ? "STAT" : o.name.includes("PRN") ? "PRN" : "Scheduled",
      status: isAdministered ? "Given" : isReady ? "Ready" : o.status,
      lastGiven: o._administeredAt || null,
      orderId: o.id,
    };
  });
  
  const allMeds = [...orderMeds, ...seedMeds];
  
  el.innerHTML = `
    <div class="filter-bar">
      <button class="filter-btn active" data-mf="All">All</button>
      <button class="filter-btn" data-mf="Ready">Ready to Give</button>
      <button class="filter-btn" data-mf="Given">Given</button>
      <button class="filter-btn" data-mf="PRN">PRN</button>
      <button class="filter-btn" data-mf="Home">Home Meds</button>
      <button class="btn btn-primary btn-sm" style="margin-left:auto" id="admin-selected-btn">💉 Administer Selected</button>
    </div>
    <table class="tbl">
      <thead><tr><th></th><th>Medication</th><th>Route</th><th>Frequency</th><th>Schedule</th><th>Status</th><th>Last Given</th></tr></thead>
      <tbody id="mar-tbody">${allMeds.map(m => {
        const rowBg = m.status==="Ready" ? "tbl-row-abnormal" : m.status==="Given" ? "" : "";
        return `<tr class="${rowBg}">
          <td>${m.status!=="Given"&&m.status!=="Home"&&m.status!=="Placed"&&m.status!=="Signed"&&m.status!=="Pharmacy Verify"&&m.status!=="Dispensed" ? `<input type="checkbox" class="mar-check" data-mid="${m.id}" style="accent-color:var(--blue)" />` : ''}</td>
          <td class="fw-600">${m.name}</td>
          <td>${m.route||''}</td>
          <td>${m.freq||''}</td>
          <td>${pillForSched(m.sched)}</td>
          <td>${statusPill(m.status)}</td>
          <td style="color:var(--text-mute)">${m.lastGiven || '—'}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  `;
  
  // Filters
  el.querySelectorAll("[data-mf]").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll("[data-mf]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      // Simple filter via row visibility
      const f = btn.dataset.mf;
      const rows = document.querySelectorAll("#mar-tbody tr");
      rows.forEach((row, i) => {
        const m = allMeds[i];
        if (!m) return;
        let show = true;
        if (f === "Ready") show = m.status === "Ready";
        else if (f === "Given") show = m.status === "Given";
        else if (f === "PRN") show = m.sched === "PRN";
        else if (f === "Home") show = m.isHome;
        row.style.display = show ? "" : "none";
      });
    });
  });
  
  // Administer
  document.getElementById("admin-selected-btn")?.addEventListener("click", () => {
    const checked = el.querySelectorAll(".mar-check:checked");
    if (checked.length === 0) return;
    checked.forEach(cb => {
      const mid = cb.dataset.mid;
      const order = (State.orders[pt.id]||[]).find(o => o.id === mid);
      if (order) {
        order._administered = true;
        order._administeredAt = simTimeStr();
        log(`Administered: ${order.name}`);
        
        // Apply med effects to vitals
        const catItem = ORDER_CATALOG.find(c => c.id === order.catalogId);
        if (catItem?.medEffect?.type === "vitals") {
          applyMedEffect(pt, catItem.medEffect);
        }
      }
    });
    notify("💉 Medications Administered", `${checked.length} medication(s) given`, "med");
    renderTab();
  });
}

function applyMedEffect(pt, effect) {
  const last = pt.vitalsHistory[pt.vitalsHistory.length - 1];
  if (!last) return;
  // Create an immediate vitals entry showing medication effect
  const sbp = parseInt(last.bp.split("/")[0]);
  const dbp = parseInt(last.bp.split("/")[1]);
  const newV = {
    time: simTimeStr(),
    hr: Math.round(Math.max(40, Math.min(180, last.hr + (effect.hr || 0)))),
    bp: `${Math.round(Math.max(60,Math.min(220,sbp+(effect.bp||0))))}/${Math.round(Math.max(30,Math.min(130,dbp+((effect.bp||0)*0.5))))}`,
    rr: Math.round(Math.max(8, Math.min(40, last.rr + (effect.rr || 0)))),
    spo2: Math.round(Math.max(70, Math.min(100, last.spo2 + (effect.spo2 || 0)))),
    temp: +(Math.max(95, Math.min(106, last.temp + (effect.temp || 0)))).toFixed(1),
    pain: Math.round(Math.max(0, Math.min(10, last.pain + (effect.pain || 0)))),
    src: "Post-Med"
  };
  pt.vitalsHistory.push(newV);
  saveState();
}

// ─── NOTES TAB ───
function renderNotes(el, pt) {
  const ptNotes = State.notes[pt.id] || [];
  
  el.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Note Writer</div>
        <div class="filter-bar mb-8">
          ${Object.keys(NOTE_TEMPLATES).map(t => `<button class="btn btn-xs btn-ghost template-btn" data-tmpl="${t}">${t}</button>`).join("")}
        </div>
        <select class="input mb-8" id="note-type-select">
          ${Object.keys(NOTE_TEMPLATES).map(t => `<option>${t}</option>`).join("")}
        </select>
        <textarea class="input input-mono" id="note-editor" style="min-height:380px" placeholder="Start typing or select a template..."></textarea>
        <div class="flex-center mt-8">
          <button class="btn btn-warning btn-sm" id="save-draft-btn">Save Draft</button>
          <button class="btn btn-primary" id="sign-note-btn">Sign Note</button>
          <button class="btn btn-sm" style="margin-left:auto;background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple)" id="toggle-sp-btn">.SmartPhrases</button>
        </div>
        <div id="sp-panel" class="hidden smartphrase-panel mt-8">
          <div style="font-size:11px;color:var(--purple);font-weight:600;margin-bottom:6px">SmartPhrases — Click to insert</div>
          ${Object.entries(SMART_PHRASES).map(([k,v]) => `<button class="smartphrase-btn sp-insert" data-sp="${k}"><span class="sp-key">${k}</span><span class="sp-val">${v.substring(0,60)}…</span></button>`).join("")}
        </div>
      </div>
      <div class="card">
        <div class="card-title">Saved Notes (${ptNotes.length})</div>
        ${ptNotes.length === 0 ? '<div class="text-muted-small">No notes written yet.</div>' : ''}
        ${ptNotes.slice().reverse().map(n => `
          <div class="saved-note">
            <div class="note-header">
              <div><span class="fw-600" style="font-size:12px">${n.type}</span> ${statusPill(n.status)}</div>
              <span class="text-muted-xs">${n.time} · ${n.author}</span>
            </div>
            <pre class="note-content">${n.content.substring(0, 600)}${n.content.length > 600 ? '...' : ''}</pre>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  
  // Template buttons
  el.querySelectorAll(".template-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.tmpl;
      let text = NOTE_TEMPLATES[name] || "";
      text = text.replace(/\[complaint\]/g, pt.chief).replace(/\[name\]/g, pt.name).replace(/\[mrn\]/g, pt.mrn)
        .replace(/\[dob\]/g, pt.dob).replace(/\[age\]/g, pt.age).replace(/\[sex\]/g, pt.sex)
        .replace(/\[problems\]/g, pt.problems.join(", "));
      document.getElementById("note-editor").value = text;
      document.getElementById("note-type-select").value = name;
    });
  });
  
  // SmartPhrases
  document.getElementById("toggle-sp-btn")?.addEventListener("click", () => {
    document.getElementById("sp-panel").classList.toggle("hidden");
  });
  el.querySelectorAll(".sp-insert").forEach(btn => {
    btn.addEventListener("click", () => {
      const editor = document.getElementById("note-editor");
      editor.value += " " + SMART_PHRASES[btn.dataset.sp];
      editor.focus();
    });
  });
  
  // Save/Sign
  const saveNote = (status) => {
    const content = document.getElementById("note-editor").value.trim();
    if (!content) return;
    const type = document.getElementById("note-type-select").value;
    if (!State.notes[pt.id]) State.notes[pt.id] = [];
    State.notes[pt.id].push({ id: uid(), type, content, status, time: simTimeStr(), author: `Sim ${State.role}` });
    log(`${status === "Draft" ? "Saved draft" : "Signed"}: ${type}`);
    document.getElementById("note-editor").value = "";
    renderTab();
    saveState();
  };
  document.getElementById("save-draft-btn")?.addEventListener("click", () => saveNote("Draft"));
  document.getElementById("sign-note-btn")?.addEventListener("click", () => saveNote("Signed"));
}

// ─── IMAGING TAB ───
function renderImaging(el, pt) {
  const imgOrders = (State.orders[pt.id] || []).filter(o => o.cat === "imaging" && !o.cancelled);
  const imgResults = (State.results[pt.id] || []).filter(r => r.cat === "Imaging");
  const seedImaging = pt.imaging || [];
  
  el.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Imaging Orders</div>
        ${imgOrders.length === 0 && seedImaging.length === 0 ? '<div class="text-muted-small">No imaging orders.</div>' : ''}
        ${imgOrders.map(o => `
          <div class="saved-note" style="cursor:pointer" data-oid="${o.id}">
            <div class="flex-between"><span class="fw-600">${o.name}</span>${statusPill(o.status)}</div>
            <div class="pipeline mt-4">${o.stages.map((s,i) => `<span class="pipeline-step ${s.completed?'done':i===o.stages.findIndex(x=>!x.completed)?'active':'pending'}">${s.name}</span>`).join("")}</div>
            <div class="text-muted-xs mt-4">Ordered: ${o.placedSimTime} ${o.resulted?'· Resulted':'· In progress...'}</div>
          </div>
        `).join("")}
        
        <div class="section-label-inline mt-12 mb-8">Imaging Results</div>
        ${imgResults.map(r => `
          <div class="saved-note img-result-item" style="cursor:pointer" data-rid="${r.id}">
            <div class="flex-between"><span class="fw-600">${r.name}</span>${flagPill(r.flag)}</div>
            <div style="font-size:12px;color:var(--text-sec);margin-top:4px">${r.value}</div>
          </div>
        `).join("")}
      </div>
      <div class="card">
        <div class="card-title">Report Viewer</div>
        <div id="img-viewer">
          <div style="color:var(--text-mute);text-align:center;padding:40px">Select an imaging study to view the report.</div>
        </div>
      </div>
    </div>
  `;
  
  // Click to view report
  el.querySelectorAll(".img-result-item").forEach(item => {
    item.addEventListener("click", () => {
      const r = imgResults.find(x => x.id === item.dataset.rid);
      if (!r) return;
      const viewer = document.getElementById("img-viewer");
      viewer.innerHTML = `
        <div class="fw-700 mb-8" style="font-size:14px">${r.name}</div>
        <div class="flex-center mb-12">${flagPill(r.flag)}<span class="text-muted-xs">Resulted: ${r.time}</span></div>
        <div class="img-placeholder">[ DICOM Viewer Placeholder — Sim MVP ]</div>
        <div class="section-label-inline">Radiology Report</div>
        <pre class="report-text">${r.report || 'No report text available.'}</pre>
      `;
    });
  });
}

// ─── DISPOSITION TAB ───
function renderDisposition(el, pt) {
  el.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Disposition Planning</div>
        <div class="section-label-inline">Disposition</div>
        <div class="flex-center gap-8 mb-12" style="flex-wrap:wrap">
          ${["Discharge","Admit","Observation","Transfer","AMA","Deceased"].map(d => `<button class="dispo-option" data-dispo="${d}">${d}</button>`).join("")}
        </div>
        <div class="section-label-inline">Diagnosis</div>
        <input type="text" class="input mb-12" id="dispo-dx" placeholder="Primary discharge/admit diagnosis..." />
        <div id="admit-service-section" class="hidden">
          <div class="section-label-inline">Admitting Service</div>
          <select class="input mb-12" id="dispo-service">
            <option value="">Select service...</option>
            <option>Internal Medicine</option><option>Cardiology</option><option>Surgery — General</option>
            <option>Orthopedics</option><option>Neurology</option><option>Pulmonology/Critical Care</option><option>Hospitalist</option>
          </select>
        </div>
        <div class="section-label-inline">Follow-Up</div>
        <input type="text" class="input mb-12" id="dispo-followup" placeholder="PCP in 3 days, Cardiology in 1 week..." />
        <div class="section-label-inline">Patient Instructions</div>
        <textarea class="input mb-12" id="dispo-instructions" placeholder="Return precautions, medication changes, activity restrictions..."></textarea>
        <button class="btn btn-primary" style="width:100%" id="gen-avs-btn">Generate AVS Preview</button>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Safety Checklist / Hard Stops</div>
          <div id="safety-checks">
            ${["Medications Reconciled","All Results Reviewed","Safety Screening Complete","Patient/Family Educated","Follow-Up Confirmed"].map((c,i) => `
              <label class="checklist-item"><input type="checkbox" class="safety-cb" data-idx="${i}" /><span class="checklist-label unchecked">⚠ ${c}</span></label>
            `).join("")}
          </div>
          <div id="safety-status" class="mt-8" style="padding:8px 12px;border-radius:6px;font-size:12px;background:var(--yellow-bg);color:var(--yellow)">⚠ Complete all safety checks before finalizing disposition.</div>
        </div>
        <div id="avs-container"></div>
      </div>
    </div>
  `;
  
  // Dispo buttons
  el.querySelectorAll(".dispo-option").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".dispo-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const d = btn.dataset.dispo;
      log(`Selected disposition: ${d}`);
      const admitSec = document.getElementById("admit-service-section");
      if (d === "Admit" || d === "Observation") admitSec.classList.remove("hidden");
      else admitSec.classList.add("hidden");
    });
  });
  
  // Safety checks
  el.querySelectorAll(".safety-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      const label = cb.closest(".checklist-item").querySelector(".checklist-label");
      label.className = `checklist-label ${cb.checked ? 'checked' : 'unchecked'}`;
      label.textContent = `${cb.checked ? '✓' : '⚠'} ${label.textContent.substring(2)}`;
      const allChecked = [...el.querySelectorAll(".safety-cb")].every(c => c.checked);
      const status = document.getElementById("safety-status");
      if (allChecked) {
        status.style.background = "var(--green-bg)";
        status.style.color = "var(--green)";
        status.textContent = "✓ All safety checks complete — clear to finalize disposition.";
      } else {
        status.style.background = "var(--yellow-bg)";
        status.style.color = "var(--yellow)";
        status.textContent = "⚠ Complete all safety checks before finalizing disposition.";
      }
    });
  });
  
  // Generate AVS
  document.getElementById("gen-avs-btn")?.addEventListener("click", () => {
    const dispo = el.querySelector(".dispo-option.active")?.dataset.dispo;
    const dx = document.getElementById("dispo-dx").value;
    if (!dispo || !dx) { alert("Please select disposition and enter diagnosis."); return; }
    const service = document.getElementById("dispo-service")?.value || "";
    const followup = document.getElementById("dispo-followup").value;
    const instructions = document.getElementById("dispo-instructions").value;
    log(`Generated AVS — ${dispo}, Dx: ${dx}`);
    
    document.getElementById("avs-container").innerHTML = `
      <div class="card">
        <div class="card-title">After-Visit Summary (AVS) Preview</div>
        <div class="avs-preview">
          <div class="avs-header">SIMULATED HEALTH SYSTEM<br><span style="font-size:12px;font-weight:400">After-Visit Summary</span></div>
          <div class="avs-section"><strong>Patient:</strong> ${pt.name} | <strong>MRN:</strong> ${pt.mrn} | <strong>DOB:</strong> ${pt.dob}<br><strong>Visit Date:</strong> ${new Date().toLocaleDateString()} | <strong>Location:</strong> ${pt.location}</div>
          <div class="avs-section"><strong>Disposition:</strong> ${dispo}<br><strong>Diagnosis:</strong> ${dx}${service ? `<br><strong>Service:</strong> ${service}` : ''}</div>
          <div class="avs-section"><strong>Follow-Up:</strong><br>${followup || "As directed by your provider."}</div>
          <div class="avs-section"><strong>Instructions:</strong><br>${instructions || "Follow up with your primary care provider."}</div>
          <div class="avs-section"><strong>Current Medications:</strong>${pt.homeMeds.map(m => `<br>• ${m.name} — ${m.route} ${m.freq}`).join("")}</div>
          <div class="avs-footer">⚠ SIMULATED DOCUMENT — NOT FOR CLINICAL USE — SimEHR Training Environment</div>
        </div>
      </div>
    `;
  });
}

// ─── HELPER: STATUS PILL HTML ───
function statusPill(status) {
  const map = {
    Placed:"pill-yellow", Signed:"pill-blue", Collected:"pill-blue", Processing:"pill-blue",
    Resulted:"pill-green", Completed:"pill-green", Cancelled:"pill-red",
    "In Progress":"pill-blue", Scheduled:"pill-yellow", Performing:"pill-blue", Interpreting:"pill-blue",
    "Pharmacy Verify":"pill-purple", Dispensed:"pill-blue", Ready:"pill-green",
    Acknowledged:"pill-blue", Due:"pill-yellow", Given:"pill-green", Running:"pill-blue",
    Available:"pill-mute", Unsigned:"pill-yellow", Draft:"pill-yellow", Home:"pill-mute",
    PENDING:"pill-yellow",
  };
  return `<span class="pill ${map[status]||'pill-info'}">${status}</span>`;
}

function flagPill(flag) {
  const map = { CRITICAL:"pill-red", HIGH:"pill-yellow", LOW:"pill-yellow", ABNORMAL:"pill-orange", NORMAL:"pill-green", PENDING:"pill-mute" };
  return `<span class="pill ${map[flag]||'pill-info'}">${flag}</span>`;
}

function pillForSched(sched) {
  if (sched === "PRN") return `<span class="pill pill-info">PRN</span>`;
  if (sched === "STAT") return `<span class="pill pill-red">STAT</span>`;
  if (sched === "Home") return `<span class="pill pill-mute">Home</span>`;
  return `<span class="pill pill-blue">${sched}</span>`;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── EVENT BINDING ───
function init() {
  // Load or initialize state
  State.patients = JSON.parse(JSON.stringify(SEED_PATIENTS));
  const loaded = loadState();
  
  // Seed pre-results if not loaded
  if (!loaded) {
    State.patients.forEach(p => {
      if (p.preResults?.length) {
        State.results[p.id] = p.preResults.map((r, i) => ({
          id: `pre-${p.id}-${i}`, ...r, orderId: null, resultedAt: Date.now()
        }));
      }
    });
  }
  
  // Default patient
  State.activePatientId = "P001";
  
  // Tab clicks
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeTab = btn.dataset.tab;
      log(`Viewed tab: ${State.activeTab}`);
      renderTab();
    });
  });
  
  // Patient list (delegated)
  document.getElementById("patient-list").addEventListener("click", (e) => {
    const item = e.target.closest(".patient-item");
    if (!item) return;
    State.activePatientId = item.dataset.pid;
    const pt = activePt();
    log(`Opened chart: ${pt.name}`);
    renderAll();
  });
  
  // Patient search
  document.getElementById("patient-search").addEventListener("input", renderPatientList);
  
  // Sidebar toggles
  document.getElementById("toggle-left").addEventListener("click", () => {
    const sb = document.getElementById("left-sidebar");
    sb.classList.toggle("open");
    document.getElementById("toggle-left").textContent = sb.classList.contains("open") ? "◀ Patients" : "▶";
  });
  document.getElementById("toggle-right").addEventListener("click", () => {
    const sb = document.getElementById("right-sidebar");
    sb.classList.toggle("open");
    document.getElementById("toggle-right").textContent = sb.classList.contains("open") ? "Context ▶" : "◀";
  });
  
  // Quick actions
  document.getElementById("qa-new-note").addEventListener("click", () => {
    State.activeTab = "Notes";
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "Notes"));
    renderTab();
  });
  document.getElementById("qa-new-order").addEventListener("click", () => {
    State.activeTab = "Orders";
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "Orders"));
    renderTab();
  });
  document.getElementById("qa-reset").addEventListener("click", () => {
    if (confirm("Reset all simulation data? This will clear all orders, results, notes, and audit log.")) resetAll();
  });
  
  // Speed buttons
  document.querySelectorAll(".speed-btn[data-speed]").forEach(btn => {
    btn.addEventListener("click", () => setSpeed(parseInt(btn.dataset.speed)));
  });
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  
  // Role/Unit selects
  document.getElementById("role-select").addEventListener("change", (e) => { State.role = e.target.value; });
  document.getElementById("unit-select").addEventListener("change", (e) => { State.unit = e.target.value; });
  
  // Start engines
  startClock();
  startVitalsEngine();
  
  // Initial render
  renderAll();
  
  // Periodic save
  setInterval(saveState, 10000);
  
  // Periodic re-render for active orders (timer displays)
  setInterval(() => {
    if (State.activeTab === "Orders") renderTab();
  }, 2000);
}

// ─── BOOT ───
document.addEventListener("DOMContentLoaded", init);
