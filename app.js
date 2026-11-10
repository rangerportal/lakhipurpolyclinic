// Lakhipur Polyclinic — Clinic Management PWA
// Firebase Auth (email/password, usernames mapped to emails) + Cloud Firestore.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, LOGIN_DOMAIN, ADMIN_USERNAME, DEFAULT_SETTINGS } from "./firebase-config.js";

const ADMIN_EMAIL = `${ADMIN_USERNAME}@${LOGIN_DOMAIN}`;
const PID_PREFIX = "LPC";
const ROLES = { admin: "Admin", copartner: "Co-partner", staff: "Staff" };

/* ======================= Helpers ======================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pad = (n, w) => String(n).padStart(w, "0");
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDT = (ms) => ms ? `${fmtDate(ms)}, ${fmtTime(ms)}` : "";
const fmtKey = (k) => { const [y, m, d] = k.split("-").map(Number); return fmtDate(new Date(y, m - 1, d).getTime()); };
const sum = (arr, f) => arr.reduce((a, x) => a + (typeof f === "function" ? f(x) : num(x[f])), 0);
const drName = (n) => /^dr\.?\s/i.test(n || "") ? n : `Dr. ${n || ""}`;
const ageStr = (p) => p.age ? `${p.age}${({ Y: " Y", M: " M", D: " D" })[p.ageUnit || "Y"]}` : "";
const genderShort = (g) => ({ Male: "M", Female: "F", Other: "O" })[g] || "";
const formObj = (form) => Object.fromEntries(new FormData(form).entries());
const logoHtml = (st, cls = "logo") => st.logo ? `<img class="${cls} img" src="${esc(st.logo)}" alt="">` : `<div class="${cls}">✚</div>`;

// Resize an uploaded logo so it fits comfortably inside a Firestore document.
function resizeImage(file, max = 360) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      let url = c.toDataURL("image/png");
      if (url.length > 300000) url = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(img.src);
      resolve(url);
    };
    img.onerror = () => reject(new Error("Could not read this image. Please use a PNG or JPG file."));
    img.src = URL.createObjectURL(file);
  });
}

function cacheSettings() {
  try { localStorage.setItem("lpc_settings", JSON.stringify(S.settings)); } catch (e) {}
}
function loadCachedSettings() {
  try { const s = JSON.parse(localStorage.getItem("lpc_settings") || "null"); if (s) S.settings = { ...DEFAULT_SETTINGS, ...s }; } catch (e) {}
}
function applySettingsToPage() {
  const st = S.settings;
  $("#page-size").textContent = `@page { size: ${st.paperSize === "A4" ? "A4" : "A5"}; margin: ${st.paperSize === "A4" ? "10mm" : "6mm"}; }`;
  document.title = st.name;
  const b = $("#sb-brand");
  if (b) b.innerHTML = brandInner();
  const tb = $("#tb-name"); if (tb) tb.textContent = st.name;
  const tl = $(".topbar .tb-logo"); if (tl) tl.outerHTML = logoHtml(st, "tb-logo");
}
const brandInner = () => `${logoHtml(S.settings)}<div class="sb-text"><b>${esc(S.settings.name)}</b><span>${esc(S.settings.tagline || "Clinic Management")}</span></div>`;

function icon(name) {
  const P = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    plus: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
}

function toast(msg, type = "") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function openModal(title, bodyHtml, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal ${opts.wide ? "wide" : ""}"><div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">×</button></div><div class="modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  return { el: wrap, close };
}

function confirmBox(message, { okText = "Yes", danger = false, withReason = false } = {}) {
  return new Promise((resolve) => {
    const m = openModal("Please confirm", `
      <p style="margin-top:0">${esc(message)}</p>
      ${withReason ? `<div class="field"><label class="req">Reason</label><input id="cf-reason" required></div>` : ""}
      <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? "danger" : ""}" id="cf-ok">${esc(okText)}</button></div>`);
    let done = false;
    $("#cf-ok", m.el).onclick = () => {
      const reason = withReason ? $("#cf-reason", m.el).value.trim() : true;
      if (withReason && !reason) { $("#cf-reason", m.el).focus(); return; }
      done = true; m.close(); resolve(reason);
    };
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = "Please wait…";
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

function friendlyError(e) {
  const c = e?.code || "";
  const map = {
    "auth/invalid-credential": "Wrong username or password.",
    "auth/wrong-password": "Wrong username or password.",
    "auth/user-not-found": "Wrong username or password.",
    "auth/invalid-email": "Invalid username.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection.",
    "auth/email-already-in-use": "This username is already taken.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/requires-recent-login": "Please log out and log in again, then retry.",
    "permission-denied": "You don't have permission to do this.",
    "unavailable": "You're offline. This action needs internet.",
    "failed-precondition": "You're offline. This action needs internet.",
  };
  return map[c] || e?.message || "Something went wrong.";
}

function downloadFile(name, content, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

/* ======================= Firebase ======================= */
const CONFIG_OK = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
let fbApp, auth, db;
if (CONFIG_OK) {
  fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  try {
    db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = getFirestore(fbApp);
  }
}

// Creates a login for someone else without logging the admin out (uses a temporary 2nd app).
async function createLoginAccount(email, password) {
  const sec = initializeApp(firebaseConfig, "secondary-" + Date.now());
  try {
    const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await signOut(secAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(sec).catch(() => {});
  }
}

/* ======================= State ======================= */
const S = {
  user: null, profile: null,
  settings: { ...DEFAULT_SETTINGS },
  doctors: [],
  unsub: [],
  loginMsg: "",
  installPrompt: null,
};
loadCachedSettings();
const can = {
  dashboard: () => ["admin", "copartner"].includes(S.profile?.role),
  createVisit: () => ["admin", "staff"].includes(S.profile?.role),
  editPatient: () => ["admin", "staff"].includes(S.profile?.role),
  admin: () => S.profile?.role === "admin",
  money: () => ["admin", "copartner"].includes(S.profile?.role),
};

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); S.installPrompt = e;
  $$(".install-btn").forEach((b) => b.classList.remove("hidden"));
});
async function doInstall() {
  if (!S.installPrompt) return;
  S.installPrompt.prompt();
  await S.installPrompt.userChoice;
  S.installPrompt = null;
  $$(".install-btn").forEach((b) => b.classList.add("hidden"));
}

/* ======================= Boot / Auth ======================= */
const appEl = $("#app");

if (!CONFIG_OK) {
  appEl.innerHTML = `<div class="setup-box">
    <h2>Almost ready — connect Firebase</h2>
    <p>Open <code>firebase-config.js</code> and paste your Firebase web app config, then reload this page.</p>
    <p class="muted">See README.md for step-by-step instructions.</p></div>`;
} else {
  onAuthStateChanged(auth, handleAuth);
}

async function handleAuth(u) {
  S.unsub.forEach((f) => f()); S.unsub = [];
  if (!u) { S.user = null; S.profile = null; showLogin(); return; }
  try {
    const ref = doc(db, "users", u.uid);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
      if ((u.email || "").toLowerCase() === ADMIN_EMAIL) {
        await setDoc(ref, { username: ADMIN_USERNAME, name: "Administrator", role: "admin", active: true, createdAtMs: Date.now() });
        snap = await getDoc(ref);
      } else {
        S.loginMsg = "This login is not set up. Please contact the admin.";
        await signOut(auth); return;
      }
    }
    const p = snap.data();
    if (!p.active) { S.loginMsg = "This login has been disabled by the admin."; await signOut(auth); return; }
    S.user = u;
    S.profile = { uid: u.uid, ...p };
    await startListeners();
    showShell();
    route();
  } catch (e) {
    console.error(e);
    S.loginMsg = friendlyError(e);
    await signOut(auth);
  }
}

function startListeners() {
  return new Promise((resolve) => {
    let gotDocs = false;
    const finish = () => { if (gotDocs) resolve(); };
    S.unsub.push(onSnapshot(doc(db, "settings", "clinic"), (s) => {
      S.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      cacheSettings();
      applySettingsToPage();
    }, () => {}));
    S.unsub.push(onSnapshot(collection(db, "doctors"), (s) => {
      S.doctors = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      if (!gotDocs) { gotDocs = true; finish(); }
      else if (currentRoute() === "doctors") route();
    }, () => { gotDocs = true; finish(); }));
    setTimeout(() => { gotDocs = true; resolve(); }, 5000);
  });
}

const loginBrand = () => {
  const st = S.settings;
  return `${logoHtml(st)}<h1>${esc(st.name)}</h1>${st.tagline ? `<div class="tagline">${esc(st.tagline)}</div>` : ""}<p>${esc(st.address)}</p>`;
};

function showLogin() {
  applySettingsToPage();
  appEl.innerHTML = `
  <div class="login-wrap">
    <form class="login-card" id="login-form" autocomplete="on">
      <div class="login-brand" id="login-brand">${loginBrand()}</div>
      <div id="login-err">${S.loginMsg ? `<div class="form-error">${esc(S.loginMsg)}</div>` : ""}</div>
      <div class="field"><label>Username</label><input name="username" autocomplete="username" autocapitalize="none" required autofocus></div>
      <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn block" type="submit">Log in</button>
      <button class="btn ghost block install-btn ${S.installPrompt ? "" : "hidden"}" type="button" style="margin-top:10px">Install app on this device</button>
    </form>
  </div>`;
  S.loginMsg = "";
  // Refresh logo / name from the database (settings are readable before login).
  getDoc(doc(db, "settings", "clinic")).then((s) => {
    if (!s.exists()) return;
    S.settings = { ...DEFAULT_SETTINGS, ...s.data() }; cacheSettings(); applySettingsToPage();
    const lb = $("#login-brand"); if (lb) lb.innerHTML = loginBrand();
  }).catch(() => {});
  $(".install-btn").onclick = doInstall;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    const uname = f.username.trim().toLowerCase();
    const email = uname.includes("@") ? uname : `${uname}@${LOGIN_DOMAIN}`;
    const btn = $("button[type=submit]", e.target);
    await busy(btn, async () => {
      try {
        await signInWithEmailAndPassword(auth, email, f.password);
      } catch (err) {
        let msg = friendlyError(err);
        // First-ever admin login: create the admin account automatically.
        if (email === ADMIN_EMAIL && ["auth/invalid-credential", "auth/user-not-found"].includes(err.code)) {
          try { await createUserWithEmailAndPassword(auth, email, f.password); return; }
          catch (e2) { msg = e2.code === "auth/email-already-in-use" ? "Wrong username or password." : friendlyError(e2); }
        }
        $("#login-err").innerHTML = `<div class="form-error">${esc(msg)}</div>`;
      }
    });
  };
}

/* ======================= Shell & Router ======================= */
const NAV = [
  { r: "dashboard", label: "Dashboard", ic: "home", show: () => can.dashboard() },
  { r: "new-visit", label: "New Prescription", ic: "plus", show: () => can.createVisit() },
  { r: "visits", label: "Prescriptions & Fees", ic: "file", show: () => true },
  { r: "patients", label: "Patients", ic: "users", show: () => true },
  { r: "doctors", label: "Doctors", ic: "pulse", show: () => true },
  { r: "users", label: "Logins", ic: "shield", show: () => can.admin() },
  { r: "settings", label: "Settings", ic: "sliders", show: () => can.admin() },
  { r: "account", label: "My Account", ic: "user", show: () => true },
];

const ROUTES = {
  dashboard: { ok: () => can.dashboard(), view: viewDashboard },
  "new-visit": { ok: () => can.createVisit(), view: viewNewVisit },
  visits: { ok: () => true, view: viewVisits },
  patients: { ok: () => true, view: viewPatients },
  patient: { ok: () => true, view: viewPatient },
  doctors: { ok: () => true, view: viewDoctors },
  users: { ok: () => can.admin(), view: viewUsers },
  settings: { ok: () => can.admin(), view: viewSettings },
  account: { ok: () => true, view: viewAccount },
  print: { ok: () => true, view: viewPrint },
};
const homeRoute = () => (can.dashboard() ? "dashboard" : "new-visit");
const currentRoute = () => (location.hash.replace(/^#\/?/, "").split("/")[0] || "");

function showShell() {
  const p = S.profile;
  const items = NAV.filter((n) => n.show());
  // Mobile bottom bar: the 4 most-used screens + "More" (opens the full menu)
  const bottom = items.filter((n) => ["dashboard", "new-visit", "visits", "patients", "doctors"].includes(n.r)).slice(0, 4);
  const short = { "new-visit": "New Rx", visits: "Entries", dashboard: "Home" };
  appEl.innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div class="sb-brand" id="sb-brand">${brandInner()}</div>
      <nav class="nav">${items.map((n) => `<a href="#/${n.r}" data-r="${n.r}" title="${n.label}">${icon(n.ic)}<span>${n.label}</span></a>`).join("")}</nav>
      <div class="sb-user">
        <b>${esc(p.name)}</b><span class="muted">@${esc(p.username)}</span><br><span class="role">${ROLES[p.role] || p.role}</span>
        <button class="install-btn ${S.installPrompt ? "" : "hidden"}" type="button">Install app</button>
        <button id="logout" type="button" title="Log out">${icon("logout")} <span>Log out</span></button>
      </div>
    </aside>
    <div class="backdrop" id="backdrop"></div>
    <div class="main">
      <div class="topbar"><button class="icon-btn" id="menu-btn" aria-label="Menu">☰</button>${logoHtml(S.settings, "tb-logo")}<b id="tb-name">${esc(S.settings.name)}</b><span id="net-pill"></span></div>
      <div class="content" id="view"></div>
    </div>
    <nav class="bottom-nav">
      ${bottom.map((n) => `<a href="#/${n.r}" data-r="${n.r}">${icon(n.ic)}<span>${short[n.r] || n.label}</span></a>`).join("")}
      <a href="javascript:void 0" id="more-btn">${icon("sliders")}<span>More</span></a>
    </nav>
  </div>`;
  $("#more-btn").onclick = () => $("#shell").classList.add("nav-open");
  $("#logout").onclick = async () => { if (await confirmBox("Log out of this device?", { okText: "Log out" })) signOut(auth); };
  $$(".install-btn").forEach((b) => (b.onclick = doInstall));
  $("#menu-btn").onclick = () => $("#shell").classList.toggle("nav-open");
  $("#backdrop").onclick = () => $("#shell").classList.remove("nav-open");
  updateNet();
}

function updateNet() {
  const el = $("#net-pill");
  if (el) el.innerHTML = navigator.onLine ? "" : `<span class="offline-pill">Offline</span>`;
}
window.addEventListener("online", () => { updateNet(); toast("Back online", "ok"); });
window.addEventListener("offline", () => { updateNet(); toast("You are offline — some actions will wait for internet"); });
window.addEventListener("hashchange", () => S.profile && route());

function route() {
  if (!S.profile) return;
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  let r = parts[0];
  if (!ROUTES[r] || !ROUTES[r].ok()) { location.replace(`#/${homeRoute()}`); r = homeRoute(); }
  $$(".nav a, .bottom-nav a[data-r]").forEach((a) => a.classList.toggle("active", a.dataset.r === r || (r === "patient" && a.dataset.r === "patients")));
  $("#shell")?.classList.remove("nav-open");
  const v = $("#view");
  v.innerHTML = `<div class="loading">Loading…</div>`;
  window.scrollTo(0, 0);
  Promise.resolve(ROUTES[r].view(v, parts.slice(1))).catch((e) => {
    console.error(e);
    v.innerHTML = `<div class="card"><div class="form-error">${esc(friendlyError(e))}</div></div>`;
  });
}

/* ======================= Data access ======================= */
async function fetchVisits(from, to) {
  const q = query(collection(db, "visits"), where("dateKey", ">=", from), where("dateKey", "<=", to));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

async function searchPatients(term) {
  term = term.trim();
  const col = collection(db, "patients");
  if (!term) {
    const s = await getDocs(query(col, orderBy("createdAtMs", "desc"), limit(50)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const queries = [];
  if (new RegExp(`^${PID_PREFIX}`, "i").test(term)) {
    queries.push(query(col, where("pid", "==", term.toUpperCase())));
  } else if (/^\d+$/.test(term)) {
    queries.push(query(col, where("phone", ">=", term), where("phone", "<=", term + ""), limit(25)));
    if (term.length <= 6) queries.push(query(col, where("pid", "==", PID_PREFIX + pad(term, 5))));
  } else {
    const t = term.toLowerCase();
    queries.push(query(col, where("nameLower", ">=", t), where("nameLower", "<=", t + ""), limit(25)));
  }
  const results = await Promise.all(queries.map((q) => getDocs(q)));
  const map = new Map();
  results.forEach((s) => s.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() })));
  return [...map.values()];
}

function cleanPatient(f) {
  return {
    name: (f.name || "").trim(),
    nameLower: (f.name || "").trim().toLowerCase(),
    age: (f.age || "").trim(),
    ageUnit: f.ageUnit || "Y",
    gender: f.gender || "",
    phone: (f.phone || "").replace(/\D/g, ""),
    guardian: (f.guardian || "").trim(),
    address: (f.address || "").trim(),
    bloodGroup: f.bloodGroup || "",
  };
}

/* ======================= Range control ======================= */
function rangeControl(container, onChange, preset = "today") {
  container.innerHTML = `
    <select class="rc-preset">
      <option value="today">Today</option><option value="yesterday">Yesterday</option>
      <option value="7d">Last 7 days</option><option value="month">This month</option>
      <option value="lastmonth">Last month</option><option value="year">This year</option>
      <option value="custom">Custom dates…</option>
    </select>
    <input type="date" class="rc-from hidden"><input type="date" class="rc-to hidden">`;
  const sel = $(".rc-preset", container), f = $(".rc-from", container), t = $(".rc-to", container);
  sel.value = preset;
  const calc = (p) => {
    const d = new Date();
    switch (p) {
      case "yesterday": { const y = addDays(d, -1); return [dayKey(y), dayKey(y)]; }
      case "7d": return [dayKey(addDays(d, -6)), dayKey(d)];
      case "month": return [dayKey(new Date(d.getFullYear(), d.getMonth(), 1)), dayKey(d)];
      case "lastmonth": return [dayKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), dayKey(new Date(d.getFullYear(), d.getMonth(), 0))];
      case "year": return [dayKey(new Date(d.getFullYear(), 0, 1)), dayKey(d)];
      default: return [dayKey(d), dayKey(d)];
    }
  };
  const fire = () => {
    if (sel.value === "custom") {
      f.classList.remove("hidden"); t.classList.remove("hidden");
      if (!f.value || !t.value) return;
      const a = f.value <= t.value ? f.value : t.value, b = f.value <= t.value ? t.value : f.value;
      onChange(a, b);
    } else {
      f.classList.add("hidden"); t.classList.add("hidden");
      const [a, b] = calc(sel.value);
      f.value = a; t.value = b;
      onChange(a, b);
    }
  };
  sel.onchange = fire; f.onchange = fire; t.onchange = fire;
  fire();
}

/* ======================= Dashboard ======================= */
async function viewDashboard(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Dashboard</h1><div class="range" id="dash-range"></div></div>
    <div id="dash-body"><div class="loading">Loading…</div></div>`;
  rangeControl($("#dash-range"), load, "today");

  async function load(from, to) {
    const body = $("#dash-body");
    if (!body) return;
    body.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const [visits, pSnap] = await Promise.all([
        fetchVisits(from, to),
        getDocs(query(collection(db, "patients"), where("dateKey", ">=", from), where("dateKey", "<=", to))),
      ]);
      renderDash(body, visits, pSnap.size, from, to);
    } catch (e) { body.innerHTML = `<div class="form-error">${esc(friendlyError(e))}</div>`; }
  }
}

function renderDash(body, visits, newPatients, from, to) {
  const act = visits.filter((v) => v.status !== "cancelled");
  const cancelled = visits.length - act.length;
  const total = sum(act, "total"), disc = sum(act, "discount"), docShare = sum(act, "doctorShare");
  const clinic = total - docShare;

  const group = (keyFn, nameFn) => {
    const m = new Map();
    act.forEach((v) => {
      const k = keyFn(v);
      const g = m.get(k) || { name: nameFn(v), count: 0, total: 0, docShare: 0 };
      g.count++; g.total += num(v.total); g.docShare += num(v.doctorShare);
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  };
  const byDoc = group((v) => v.doctorId, (v) => drName(v.doctorName));
  const byMode = group((v) => v.paymentMode || "Cash", (v) => v.paymentMode || "Cash");
  const byStaff = group((v) => v.createdBy, (v) => v.createdByName || "—");

  // daily series
  const days = [];
  const [fy, fm, fd] = from.split("-").map(Number), [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd), end = new Date(ty, tm - 1, td);
  const spanDays = Math.round((end - start) / 864e5) + 1;
  if (spanDays > 1 && spanDays <= 62) {
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(dayKey(d));
  }
  const byDay = {};
  act.forEach((v) => { byDay[v.dateKey] = byDay[v.dateKey] || { t: 0, c: 0 }; byDay[v.dateKey].t += num(v.total); byDay[v.dateKey].c++; });
  const maxDay = Math.max(1, ...days.map((k) => byDay[k]?.t || 0));

  const maxDoc = Math.max(1, ...byDoc.map((d) => d.total));

  body.innerHTML = `
    <div class="stats">
      <div class="stat primary"><div class="label">Total collection</div><div class="value">${money(total)}</div></div>
      <div class="stat"><div class="label">Patients seen</div><div class="value">${act.length}</div></div>
      <div class="stat"><div class="label">New patients</div><div class="value">${newPatients}</div></div>
      <div class="stat"><div class="label">Clinic share</div><div class="value">${money(clinic)}</div></div>
      <div class="stat"><div class="label">Doctor payout</div><div class="value">${money(docShare)}</div></div>
      <div class="stat"><div class="label">Discounts given</div><div class="value">${money(disc)}</div></div>
      <div class="stat"><div class="label">Cancelled</div><div class="value">${cancelled}</div></div>
      <div class="stat"><div class="label">Avg. per patient</div><div class="value">${money(act.length ? Math.round(total / act.length) : 0)}</div></div>
    </div>

    ${days.length ? `
    <div class="card">
      <div class="card-head"><h3>Daily collection</h3><span class="muted small">${fmtKey(from)} – ${fmtKey(to)}</span></div>
      <div class="bars">${days.map((k) => `<div class="bar" style="height:${((byDay[k]?.t || 0) / maxDay) * 100}%" data-tip="${fmtKey(k)}: ${money(byDay[k]?.t || 0)} (${byDay[k]?.c || 0} pts)"></div>`).join("")}</div>
      <div class="bar-labels">${days.map((k, i) => `<span>${days.length <= 14 || i % Math.ceil(days.length / 10) === 0 ? k.slice(8) : ""}</span>`).join("")}</div>
    </div>` : ""}

    <div class="two-col">
      <div class="card">
        <div class="card-head"><h3>Doctor-wise earnings</h3></div>
        ${byDoc.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Doctor</th><th class="num">Patients</th><th class="num">Collection</th><th class="num">Doctor share</th><th class="num">Clinic</th></tr></thead>
          <tbody>${byDoc.map((d) => `<tr><td>${esc(d.name)}<div class="hbar"><i style="width:${(d.total / maxDoc) * 100}%"></i></div></td><td class="num">${d.count}</td><td class="num">${money(d.total)}</td><td class="num">${money(d.docShare)}</td><td class="num">${money(d.total - d.docShare)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${act.length}</td><td class="num">${money(total)}</td><td class="num">${money(docShare)}</td><td class="num">${money(clinic)}</td></tr></tfoot>
        </table></div>` : `<div class="empty">No entries in this period</div>`}
      </div>
      <div>
        <div class="card">
          <div class="card-head"><h3>Payment mode</h3></div>
          ${byMode.length ? `<table><tbody>${byMode.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${m.count}</td><td class="num"><b>${money(m.total)}</b></td></tr>`).join("")}</tbody></table>` : `<div class="empty">—</div>`}
        </div>
        <div class="card">
          <div class="card-head"><h3>Collected by (cash check)</h3></div>
          ${byStaff.length ? `<table><tbody>${byStaff.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${m.count}</td><td class="num"><b>${money(m.total)}</b></td></tr>`).join("")}</tbody></table>` : `<div class="empty">—</div>`}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Latest entries</h3><a href="#/visits" class="btn ghost sm">View all &amp; search</a></div>
      ${visitTable(visits.slice(0, 10), { compact: true })}
    </div>`;
  bindVisitTable(body);
}

/* ======================= Visits list ======================= */
function visitTable(list, { compact = false, showTotals = false } = {}) {
  if (!list.length) return `<div class="empty">No prescriptions found</div>`;
  const act = list.filter((v) => v.status !== "cancelled");
  return `<div class="table-wrap"><table class="mcards">
    <thead><tr><th>Receipt</th><th>Date</th><th>Token</th><th>Patient</th>${compact ? "" : "<th>Phone</th>"}<th>Doctor</th><th class="num">Fee</th>${compact ? "" : "<th>Mode</th><th>By</th>"}<th></th></tr></thead>
    <tbody>${list.map((v) => `
      <tr class="click ${v.status === "cancelled" ? "cancelled" : ""}" data-print="${v.id}">
        <td class="nowrap mc-title" data-label="Receipt"><b>${esc(v.receiptNo)}</b> <span class="mc-only muted small">· Token ${esc(v.token)}</span></td>
        <td class="nowrap" data-label="Date">${fmtDate(v.createdAtMs)}<div class="muted small">${fmtTime(v.createdAtMs)}</div></td>
        <td class="mc-hide" data-label="Token">${esc(v.token)}</td>
        <td data-label="Patient">${esc(v.patientName)}<div class="muted small">${esc(v.pid)} · ${esc(ageStr(v))} ${esc(genderShort(v.gender))}</div></td>
        ${compact ? "" : `<td class="nowrap" data-label="Phone">${esc(v.phone)}</td>`}
        <td data-label="Doctor">${esc(drName(v.doctorName))}</td>
        <td class="num nowrap" data-label="Fee">${money(v.total)}${num(v.discount) ? `<div class="muted small">−${money(v.discount)}</div>` : ""}</td>
        ${compact ? "" : `<td data-label="Mode">${esc(v.paymentMode)}</td><td class="small" data-label="By">${esc(v.createdByName)}</td>`}
        <td class="nowrap right mc-actions">${v.status === "cancelled" ? `<span class="badge off">Cancelled</span>` : ""}
          ${!compact && can.admin() && v.status !== "cancelled" ? `<button class="btn danger-ghost sm" data-cancel="${v.id}">Cancel</button>` : ""}</td>
      </tr>`).join("")}</tbody>
    ${showTotals ? `<tfoot><tr><td colspan="${compact ? 5 : 6}">Total (${act.length} active)</td><td class="num">${money(sum(act, "total"))}</td><td colspan="${compact ? 1 : 3}" class="mc-hide"></td></tr></tfoot>` : ""}
  </table></div>`;
}

function bindVisitTable(root, onChanged) {
  $$("[data-print]", root).forEach((tr) => tr.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    location.hash = `#/print/${tr.dataset.print}`;
  }));
  $$("[data-cancel]", root).forEach((b) => b.addEventListener("click", async () => {
    const reason = await confirmBox("Cancel this prescription? It will be removed from earnings (kept in records).", { okText: "Cancel entry", danger: true, withReason: true });
    if (!reason) return;
    try {
      await updateDoc(doc(db, "visits", b.dataset.cancel), { status: "cancelled", cancelReason: reason, cancelledBy: S.profile.name, cancelledAtMs: Date.now() });
      toast("Entry cancelled", "ok");
      onChanged && onChanged();
    } catch (e) { toast(friendlyError(e), "error"); }
  }));
}

async function viewVisits(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Prescriptions &amp; Fees</h1>
      <div class="btn-row">${can.createVisit() ? `<a class="btn" href="#/new-visit">+ New prescription</a>` : ""}
      ${can.money() ? `<button class="btn ghost" id="v-export">Export CSV</button>` : ""}</div></div>
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Period</label><div class="range" id="v-range"></div></div>
        <div class="field"><label>Doctor</label><select id="v-doc"><option value="">All doctors</option>${S.doctors.map((d) => `<option value="${d.id}">${esc(drName(d.name))}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select id="v-status"><option value="">All</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></div>
        <div class="field grow"><label>Search</label><input id="v-q" placeholder="Name, phone, Patient ID or receipt no."></div>
      </div>
      <div id="v-sum" class="btn-row small" style="margin-bottom:10px"></div>
      <div id="v-list"><div class="loading">Loading…</div></div>
    </div>`;
  let all = [], range = [];
  const draw = () => {
    const dId = $("#v-doc").value, st = $("#v-status").value, q = $("#v-q").value.trim().toLowerCase();
    const list = all.filter((v) =>
      (!dId || v.doctorId === dId) &&
      (!st || (st === "cancelled" ? v.status === "cancelled" : v.status !== "cancelled")) &&
      (!q || [v.patientName, v.phone, v.pid, v.receiptNo].some((x) => String(x || "").toLowerCase().includes(q))));
    const act = list.filter((v) => v.status !== "cancelled");
    $("#v-sum").innerHTML = `<span class="badge teal">${list.length} entries</span>${can.money() ? `<span class="badge ok">Collection ${money(sum(act, "total"))}</span>` : ""}`;
    $("#v-list").innerHTML = visitTable(list, { showTotals: can.money() });
    bindVisitTable($("#v-list"), load);
    return list;
  };
  const load = async () => {
    $("#v-list").innerHTML = `<div class="loading">Loading…</div>`;
    try { all = await fetchVisits(range[0], range[1]); draw(); }
    catch (e) { $("#v-list").innerHTML = `<div class="form-error">${esc(friendlyError(e))}</div>`; }
  };
  rangeControl($("#v-range"), (a, b) => { range = [a, b]; load(); }, "today");
  $("#v-doc").onchange = draw; $("#v-status").onchange = draw; $("#v-q").oninput = draw;
  const ex = $("#v-export");
  if (ex) ex.onclick = () => {
    const list = draw();
    const rows = [["Receipt No", "Date", "Time", "Token", "Patient ID", "Patient", "Age", "Gender", "Phone", "Doctor", "Visit type", "Fee", "Discount", "Total", "Payment mode", "Doctor share", "Clinic share", "Entered by", "Status", "Cancel reason"]];
    list.forEach((v) => rows.push([v.receiptNo, fmtDate(v.createdAtMs), fmtTime(v.createdAtMs), v.token, v.pid, v.patientName, ageStr(v), v.gender, v.phone, drName(v.doctorName), v.visitType, v.fee, v.discount, v.total, v.paymentMode, v.doctorShare, num(v.total) - num(v.doctorShare), v.createdByName, v.status, v.cancelReason || ""]));
    downloadFile(`prescriptions_${range[0]}_to_${range[1]}.csv`, toCSV(rows));
  };
}

/* ======================= New visit / prescription ======================= */
async function viewNewVisit(el) {
  const docs = S.doctors.filter((d) => d.active !== false);
  if (!docs.length) {
    el.innerHTML = `<div class="page-head"><h1>New Prescription</h1></div>
      <div class="card empty">No doctors added yet. ${can.admin() ? `<br><br><a class="btn" href="#/doctors">Add a doctor first</a>` : "Ask the admin to add doctors."}</div>`;
    return;
  }
  const lastDoc = localStorage.getItem("lpc_last_doc");
  let patient = null; // selected existing patient
  let mode = "search"; // 'search' | 'new'

  el.innerHTML = `
  <div class="page-head"><h1>New Prescription</h1><span class="muted small">${fmtDate(Date.now())}</span></div>
  <form id="nv-form" autocomplete="off">
    <div class="card">
      <div class="step"><span class="n">1</span><h3>Select doctor</h3></div>
      <select name="doctorId" id="nv-doc" required>
        ${docs.map((d) => `<option value="${d.id}" ${d.id === lastDoc ? "selected" : ""}>${esc(drName(d.name))} — ${esc(d.degrees)}${d.specialization ? ` (${esc(d.specialization)})` : ""}</option>`).join("")}
      </select>
      <div class="doc-info" id="nv-docinfo"></div>
    </div>

    <div class="card">
      <div class="step"><span class="n">2</span><h3>Patient</h3>
        <div class="seg" style="margin-left:auto"><button type="button" data-mode="search" class="on">Existing patient</button><button type="button" data-mode="new">New patient</button></div>
      </div>
      <div id="nv-search-wrap">
        <div class="search-box"><input id="nv-search" placeholder="Search by name, phone number or Patient ID (${PID_PREFIX}…)"><div class="search-results hidden" id="nv-results"></div></div>
        <div id="nv-chip" style="margin-top:10px"></div>
      </div>
      <div id="nv-new-wrap" class="hidden">${patientFields({})}</div>
    </div>

    <div class="card">
      <div class="step"><span class="n">3</span><h3>Vitals &amp; complaints <span class="muted small">(optional)</span></h3></div>
      <div class="grid g5">
        <div class="field"><label>BP (mmHg)</label><input name="bp" placeholder="120/80"></div>
        <div class="field"><label>Pulse (/min)</label><input name="pulse" inputmode="numeric"></div>
        <div class="field"><label>Temp (°F)</label><input name="temp" inputmode="decimal"></div>
        <div class="field"><label>Weight (kg)</label><input name="weight" inputmode="decimal"></div>
        <div class="field"><label>SpO₂ (%)</label><input name="spo2" inputmode="numeric"></div>
      </div>
      <div class="field"><label>Chief complaints</label><textarea name="complaints" rows="2" placeholder="e.g. Fever for 3 days, cough"></textarea></div>
    </div>

    <div class="card">
      <div class="step"><span class="n">4</span><h3>Fees</h3></div>
      <div class="grid g4">
        <div class="field"><label>Visit type</label><select name="visitType" id="nv-vtype"><option>New</option><option>Follow-up</option><option>Emergency</option></select></div>
        <div class="field"><label class="req">Doctor fee (₹)</label><input name="fee" id="nv-fee" type="number" min="0" step="1" required></div>
        <div class="field"><label>Discount (₹)</label><input name="discount" id="nv-disc" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label>Payment mode</label><select name="paymentMode"><option>Cash</option><option>UPI</option><option>Card</option><option>Free</option></select></div>
      </div>
      <div class="total-box"><span>Amount to collect</span><b id="nv-total">₹0</b></div>
    </div>

    <div class="sticky-actions">
      <button type="reset" class="btn ghost lg" id="nv-reset">Clear</button>
      <button type="submit" class="btn lg">Save &amp; Print</button>
    </div>
  </form>`;

  const form = $("#nv-form");
  const docSel = $("#nv-doc"), feeEl = $("#nv-fee"), discEl = $("#nv-disc");
  const getDoc_ = () => S.doctors.find((d) => d.id === docSel.value);
  const calcTotal = () => { $("#nv-total").textContent = money(Math.max(0, num(feeEl.value) - num(discEl.value))); };
  const onDoc = () => {
    const d = getDoc_(); if (!d) return;
    $("#nv-docinfo").innerHTML = `<b>${esc(drName(d.name))}</b> · ${esc(d.degrees)}${d.specialization ? ` · ${esc(d.specialization)}` : ""}${d.timings ? `<div class="muted small">${esc(d.timings)}</div>` : ""}`;
    const follow = $("#nv-vtype").value === "Follow-up" && d.followUpFee !== undefined && d.followUpFee !== "";
    feeEl.value = follow ? num(d.followUpFee) : num(d.fee);
    calcTotal();
  };
  docSel.onchange = onDoc;
  $("#nv-vtype").onchange = onDoc;
  feeEl.oninput = calcTotal; discEl.oninput = calcTotal;
  onDoc();

  // patient mode switching
  const setMode = (m) => {
    mode = m;
    $$(".seg button", form).forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    $("#nv-search-wrap").classList.toggle("hidden", m !== "search");
    $("#nv-new-wrap").classList.toggle("hidden", m !== "new");
    $$("#nv-new-wrap [data-required]").forEach((i) => (i.required = m === "new"));
    if (m === "new") $("#nv-new-wrap [name=name]").focus();
  };
  $$(".seg button", form).forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  const showChip = () => {
    $("#nv-chip").innerHTML = patient ? `<div class="pt-chip"><div><b>${esc(patient.name)}</b> <span class="badge teal">${esc(patient.pid)}</span><div class="muted small">${esc([ageStr(patient), patient.gender, patient.phone, patient.address].filter(Boolean).join(" · "))}${patient.visitCount ? ` · ${patient.visitCount} previous visit(s)` : ""}</div></div><button type="button" class="btn ghost sm" id="nv-clear">Change</button></div>` : "";
    $("#nv-search").classList.toggle("hidden", !!patient);
    if (patient) {
      $("#nv-clear").onclick = () => { patient = null; showChip(); $("#nv-search").value = ""; $("#nv-search").focus(); };
      if (patient.visitCount) $("#nv-vtype").value = "Follow-up";
      onDoc();
    }
  };
  let tmr;
  $("#nv-search").oninput = (e) => {
    clearTimeout(tmr);
    const t = e.target.value;
    const box = $("#nv-results");
    if (t.trim().length < 2) { box.classList.add("hidden"); return; }
    tmr = setTimeout(async () => {
      try {
        const res = await searchPatients(t);
        box.classList.remove("hidden");
        box.innerHTML = res.length ? res.map((p) => `<div class="item" data-id="${p.id}"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.pid)} · ${esc(ageStr(p))} ${esc(genderShort(p.gender))} · ${esc(p.phone)}</span></div>`).join("")
          : `<div class="item" data-new="1">No patient found — <b>add as new patient</b></div>`;
        $$(".item", box).forEach((it) => (it.onclick = () => {
          box.classList.add("hidden");
          if (it.dataset.new) {
            setMode("new");
            const isNum = /^\d+$/.test(t.trim());
            $(`#nv-new-wrap [name=${isNum ? "phone" : "name"}]`).value = t.trim();
            return;
          }
          patient = res.find((p) => p.id === it.dataset.id);
          showChip();
        }));
      } catch (err) { box.classList.remove("hidden"); box.innerHTML = `<div class="item">${esc(friendlyError(err))}</div>`; }
    }, 300);
  };
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) $("#nv-results")?.classList.add("hidden"); });

  $("#nv-reset").onclick = () => setTimeout(() => { patient = null; showChip(); setMode("search"); onDoc(); }, 0);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(form);
    const d = getDoc_();
    if (mode === "search" && !patient) { toast("Please select a patient or add a new one", "error"); $("#nv-search").focus(); return; }
    if (mode === "new" && !f.name.trim()) { toast("Enter patient name", "error"); return; }
    const fee = num(f.fee), discount = Math.min(num(f.discount), fee), total = Math.max(0, fee - discount);
    const btn = $("button[type=submit]", form);
    await busy(btn, async () => {
      try {
        const id = await saveVisit({ f, d, fee, discount, total, existing: mode === "search" ? patient : null });
        localStorage.setItem("lpc_last_doc", d.id);
        toast("Saved", "ok");
        location.hash = `#/print/${id}?auto=1`;
      } catch (err) { console.error(err); toast(friendlyError(err), "error"); }
    });
  };
}

function patientFields(p) {
  const opt = (arr, v) => arr.map((x) => `<option ${x === v ? "selected" : ""}>${x}</option>`).join("");
  return `
  <div class="grid g3">
    <div class="field span2"><label class="req">Patient name</label><input name="name" data-required value="${esc(p.name)}"></div>
    <div class="field"><label>Phone</label><input name="phone" inputmode="tel" maxlength="13" value="${esc(p.phone)}"></div>
    <div class="field"><label>Age</label><div class="btn-row" style="flex-wrap:nowrap"><input name="age" inputmode="numeric" style="flex:1" value="${esc(p.age)}"><select name="ageUnit" style="width:90px"><option value="Y" ${p.ageUnit !== "M" && p.ageUnit !== "D" ? "selected" : ""}>Years</option><option value="M" ${p.ageUnit === "M" ? "selected" : ""}>Months</option><option value="D" ${p.ageUnit === "D" ? "selected" : ""}>Days</option></select></div></div>
    <div class="field"><label>Gender</label><select name="gender"><option value="">—</option>${opt(["Male", "Female", "Other"], p.gender)}</select></div>
    <div class="field"><label>Blood group</label><select name="bloodGroup"><option value="">—</option>${opt(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], p.bloodGroup)}</select></div>
    <div class="field"><label>Father / Husband name</label><input name="guardian" value="${esc(p.guardian)}"></div>
    <div class="field span2"><label>Address / Village</label><input name="address" value="${esc(p.address)}"></div>
  </div>`;
}

async function saveVisit({ f, d, fee, discount, total, existing }) {
  const now = Date.now(), dk = dayKey(new Date(now));
  const pRef = existing ? doc(db, "patients", existing.id) : doc(collection(db, "patients"));
  const vRef = doc(collection(db, "visits"));
  const pCnt = doc(db, "counters", "patients"), vCnt = doc(db, "counters", "visits");
  const tCnt = doc(db, "counters", `token_${dk}_${d.id}`);
  const sharePct = num(d.doctorSharePct);

  await runTransaction(db, async (tx) => {
    const pc = existing ? null : await tx.get(pCnt);
    const vc = await tx.get(vCnt);
    const tc = await tx.get(tCnt);
    let pt;
    if (existing) {
      pt = existing;
      tx.update(pRef, { lastVisitMs: now, visitCount: increment(1) });
    } else {
      const n = pc.exists() ? pc.data().next : 1;
      pt = { ...cleanPatient(f), pid: PID_PREFIX + pad(n, 5), createdAtMs: now, dateKey: dk, createdBy: S.profile.uid, lastVisitMs: now, visitCount: 1 };
      tx.set(pCnt, { next: n + 1 });
      tx.set(pRef, pt);
    }
    const vn = vc.exists() ? vc.data().next : 1;
    const tn = tc.exists() ? tc.data().next : 1;
    tx.set(vCnt, { next: vn + 1 });
    tx.set(tCnt, { next: tn + 1 });
    tx.set(vRef, {
      receiptNo: "R" + pad(vn, 6), token: tn, dateKey: dk, createdAtMs: now, createdAt: serverTimestamp(),
      createdBy: S.profile.uid, createdByName: S.profile.name,
      patientId: pRef.id, pid: pt.pid, patientName: pt.name, phone: pt.phone || "", age: pt.age || "", ageUnit: pt.ageUnit || "Y",
      gender: pt.gender || "", guardian: pt.guardian || "", address: pt.address || "", bloodGroup: pt.bloodGroup || "",
      doctorId: d.id, doctorName: d.name, doctorDegrees: d.degrees || "", doctorSpecialization: d.specialization || "", doctorRegNo: d.regNo || "",
      visitType: f.visitType || "New",
      vitals: { bp: f.bp || "", pulse: f.pulse || "", temp: f.temp || "", weight: f.weight || "", spo2: f.spo2 || "" },
      complaints: (f.complaints || "").trim(),
      fee, discount, total, paymentMode: f.paymentMode || "Cash",
      doctorSharePct: sharePct, doctorShare: Math.round((total * sharePct) / 100 * 100) / 100,
      status: "active",
    });
  });
  return vRef.id;
}

/* ======================= Print ======================= */
async function viewPrint(el, params) {
  const [id, qs] = (params[0] || "").split("?");
  const snap = await getDoc(doc(db, "visits", id));
  if (!snap.exists()) { el.innerHTML = `<div class="card empty">Prescription not found</div>`; return; }
  const v = { id, ...snap.data() };
  const st = S.settings;
  const vt = v.vitals || {};
  const paper = st.paperSize === "A4" ? "A4" : "A5";
  const head = `
      <div class="rx-head">
        ${logoHtml(st)}
        <div class="rx-clinic">
          <h2>${esc(st.name)}</h2>
          ${st.tagline ? `<div class="rx-tagline">${esc(st.tagline)}</div>` : ""}
          <p>${esc(st.address)}</p>
          ${st.phone || st.email || st.timings ? `<p>${[st.phone ? `Ph: ${esc(st.phone)}` : "", esc(st.email), esc(st.timings)].filter(Boolean).join(" · ")}</p>` : ""}
        </div>
      </div>
      ${st.tags ? `<div class="rx-tags">${esc(st.tags)}</div>` : ""}`;
  const cancelled = v.status === "cancelled" ? `<div class="rx-cancel">CANCELLED — ${esc(v.cancelReason || "")}</div>` : "";
  el.innerHTML = `
    <div class="rx-actions">
      <button class="btn lg" id="rx-print">🖨 Print prescription</button>
      <button class="btn ghost lg" id="rc-print">🧾 Print fee receipt</button>
      ${can.createVisit() ? `<a class="btn ghost lg" href="#/new-visit">+ Next patient</a>` : ""}
      <a class="btn ghost lg" href="#/patient/${v.patientId}">Patient history</a>
    </div>

    <div class="rx-paper ${paper} rx-presc print-target">
      ${cancelled}${head}
      <div class="rx-doc">
        <div><div class="dname">${esc(drName(v.doctorName))}</div>
          <div class="deg">${esc(v.doctorDegrees)}${v.doctorSpecialization ? ` · ${esc(v.doctorSpecialization)}` : ""}</div>
          ${v.doctorRegNo ? `<div class="small">Reg. No: ${esc(v.doctorRegNo)}</div>` : ""}</div>
        <div class="rx-meta"><div class="tok">Token <b>${esc(v.token)}</b></div>${fmtDate(v.createdAtMs)} · ${fmtTime(v.createdAtMs)}</div>
      </div>
      <div class="rx-pt">
        <div><span>Name</span> <b>${esc(v.patientName)}</b></div>
        <div><span>Age/Sex</span> <b>${esc(ageStr(v))}${v.gender ? " / " + esc(genderShort(v.gender)) : ""}</b></div>
        <div><span>ID</span> <b>${esc(v.pid)}</b></div>
        ${v.phone ? `<div><span>Ph</span> ${esc(v.phone)}</div>` : ""}
        ${v.guardian ? `<div><span>C/o</span> ${esc(v.guardian)}</div>` : ""}
        ${v.address ? `<div><span>Addr</span> ${esc(v.address)}</div>` : ""}
      </div>
      <div class="rx-body">
        <div class="rx-left">
          <div class="blk vit">
            <div>BP <b>${esc(vt.bp)}</b></div><div>Pulse <b>${esc(vt.pulse)}</b></div>
            <div>Temp <b>${esc(vt.temp)}</b></div><div>Wt <b>${esc(vt.weight)}</b></div><div>SpO₂ <b>${esc(vt.spo2)}</b></div>
          </div>
          <div class="blk"><h4>C/C</h4><p>${esc(v.complaints)}</p></div>
          <div class="blk grow"><h4>O/E</h4></div>
          <div class="blk grow"><h4>Diagnosis</h4></div>
          <div class="blk grow"><h4>Advice / Inv.</h4></div>
        </div>
        <div class="rx-right"><div class="rx-symbol">℞</div></div>
      </div>
      <div class="rx-foot">
        <div>Next visit: ______________</div>
        <div class="sign">Signature</div>
      </div>
      ${st.footerNote ? `<div class="rx-note">${esc(st.footerNote)}</div>` : ""}
    </div>

    <div class="rx-paper receipt rx-receipt">
      ${cancelled}${head}
      <h3 class="rc-title">FEE RECEIPT</h3>
      <div class="kv rc-kv">
        <div class="k">Receipt no.</div><div><b>${esc(v.receiptNo)}</b></div>
        <div class="k">Date</div><div>${fmtDT(v.createdAtMs)}</div>
        <div class="k">Patient</div><div><b>${esc(v.patientName)}</b> (${esc(v.pid)})</div>
        <div class="k">Doctor</div><div>${esc(drName(v.doctorName))}</div>
        <div class="k">Token</div><div>${esc(v.token)}</div>
      </div>
      <table class="rc-table"><tbody>
        <tr><td>Consultation fee (${esc(v.visitType)})</td><td class="num">${money(v.fee)}</td></tr>
        ${num(v.discount) ? `<tr><td>Discount</td><td class="num">−${money(v.discount)}</td></tr>` : ""}
        <tr class="tot"><td>Total paid (${esc(v.paymentMode)})</td><td class="num">${money(v.total)}</td></tr>
      </tbody></table>
      <div class="rx-foot"><div class="small">Received by: ${esc(v.createdByName)}</div><div class="sign">Authorised sign</div></div>
    </div>`;
  const printWhich = (cls) => {
    $$(".rx-paper", el).forEach((p) => p.classList.toggle("print-target", p.classList.contains(cls)));
    window.print();
  };
  $("#rx-print").onclick = () => printWhich("rx-presc");
  $("#rc-print").onclick = () => printWhich("rx-receipt");
  if (qs && qs.includes("auto=1")) {
    history.replaceState(null, "", `#/print/${id}`);
    setTimeout(() => printWhich("rx-presc"), 400);
  }
}

/* ======================= Patients ======================= */
async function viewPatients(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Patients</h1>${can.editPatient() ? `<button class="btn" id="p-add">+ Add patient</button>` : ""}</div>
    <div class="card">
      <div class="toolbar"><div class="field grow"><input id="p-q" placeholder="Search by name, phone or Patient ID"></div></div>
      <div id="p-list"><div class="loading">Loading…</div></div>
    </div>`;
  const load = async () => {
    const t = $("#p-q").value;
    try {
      const list = await searchPatients(t);
      $("#p-list").innerHTML = list.length ? `<div class="table-wrap"><table class="mcards">
        <thead><tr><th>Patient ID</th><th>Name</th><th>Age/Sex</th><th>Phone</th><th>Address</th><th class="num">Visits</th><th>Last visit</th></tr></thead>
        <tbody>${list.map((p) => `<tr class="click" data-id="${p.id}"><td class="mc-title" data-label="ID"><span class="badge teal">${esc(p.pid)}</span> <b class="mc-only">${esc(p.name)}</b></td><td class="mc-hide" data-label="Name"><b>${esc(p.name)}</b>${p.guardian ? `<div class="muted small">${esc(p.guardian)}</div>` : ""}</td><td data-label="Age/Sex">${esc(ageStr(p))} ${esc(genderShort(p.gender))}</td><td data-label="Phone">${esc(p.phone)}</td><td class="small" data-label="Address">${esc(p.address)}</td><td class="num" data-label="Visits">${p.visitCount || 0}</td><td class="small nowrap" data-label="Last visit">${fmtDate(p.lastVisitMs)}</td></tr>`).join("")}</tbody>
      </table></div>${!t.trim() ? `<p class="muted small">Showing the 50 most recent patients. Use search to find older ones.</p>` : ""}` : `<div class="empty">No patients found</div>`;
      $$("[data-id]", $("#p-list")).forEach((tr) => (tr.onclick = () => (location.hash = `#/patient/${tr.dataset.id}`)));
    } catch (e) { $("#p-list").innerHTML = `<div class="form-error">${esc(friendlyError(e))}</div>`; }
  };
  let tmr;
  $("#p-q").oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 300); };
  const add = $("#p-add");
  if (add) add.onclick = () => patientModal(null, (id) => (location.hash = `#/patient/${id}`));
  load();
}

function patientModal(p, onSaved) {
  const m = openModal(p ? "Edit patient" : "Add patient", `<form id="pm-form">${patientFields(p || {})}<div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`, { wide: true });
  $("#pm-form [name=name]", m.el).required = true;
  $("#pm-form", m.el).onsubmit = async (e) => {
    e.preventDefault();
    const data = cleanPatient(formObj(e.target));
    await busy($("button[type=submit]", e.target), async () => {
      try {
        let id;
        if (p) { await updateDoc(doc(db, "patients", p.id), data); id = p.id; }
        else {
          const ref = doc(collection(db, "patients"));
          await runTransaction(db, async (tx) => {
            const c = await tx.get(doc(db, "counters", "patients"));
            const n = c.exists() ? c.data().next : 1;
            tx.set(doc(db, "counters", "patients"), { next: n + 1 });
            tx.set(ref, { ...data, pid: PID_PREFIX + pad(n, 5), createdAtMs: Date.now(), dateKey: dayKey(), createdBy: S.profile.uid, visitCount: 0 });
          });
          id = ref.id;
        }
        m.close(); toast("Patient saved", "ok"); onSaved && onSaved(id);
      } catch (err) { toast(friendlyError(err), "error"); }
    });
  };
}

async function viewPatient(el, params) {
  const id = params[0];
  const [ps, vs] = await Promise.all([
    getDoc(doc(db, "patients", id)),
    getDocs(query(collection(db, "visits"), where("patientId", "==", id))),
  ]);
  if (!ps.exists()) { el.innerHTML = `<div class="card empty">Patient not found</div>`; return; }
  const p = { id, ...ps.data() };
  const visits = vs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const act = visits.filter((v) => v.status !== "cancelled");
  el.innerHTML = `
    <div class="page-head"><h1>${esc(p.name)} <span class="badge teal">${esc(p.pid)}</span></h1>
      <div class="btn-row">
        ${can.editPatient() ? `<button class="btn ghost" id="pt-edit">Edit</button>` : ""}
        ${can.admin() ? `<button class="btn danger-ghost" id="pt-del">Delete</button>` : ""}
        ${can.createVisit() ? `<a class="btn" href="#/new-visit" id="pt-new">+ New prescription</a>` : ""}
      </div></div>
    <div class="two-col">
      <div class="card"><div class="kv">
        <div class="k">Age / Sex</div><div>${esc(ageStr(p))} ${esc(p.gender)}</div>
        <div class="k">Phone</div><div>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : "—"}</div>
        <div class="k">Father/Husband</div><div>${esc(p.guardian) || "—"}</div>
        <div class="k">Blood group</div><div>${esc(p.bloodGroup) || "—"}</div>
        <div class="k">Address</div><div>${esc(p.address) || "—"}</div>
        <div class="k">Registered</div><div>${fmtDT(p.createdAtMs)}</div>
      </div></div>
      <div class="stats" style="grid-template-columns:1fr 1fr;align-content:start">
        <div class="stat"><div class="label">Total visits</div><div class="value">${act.length}</div></div>
        ${can.money() ? `<div class="stat"><div class="label">Total paid</div><div class="value">${money(sum(act, "total"))}</div></div>` : ""}
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>Visit history</h3></div>${visitTable(visits)}</div>`;
  bindVisitTable(el, () => route());
  const ed = $("#pt-edit"); if (ed) ed.onclick = () => patientModal(p, () => route());
  const del = $("#pt-del");
  if (del) del.onclick = async () => {
    if (!(await confirmBox(`Delete patient ${p.name}? Their past prescriptions remain in reports.`, { okText: "Delete", danger: true }))) return;
    try { await deleteDoc(doc(db, "patients", id)); toast("Deleted", "ok"); location.hash = "#/patients"; }
    catch (e) { toast(friendlyError(e), "error"); }
  };
}

/* ======================= Doctors ======================= */
function viewDoctors(el) {
  const admin = can.admin();
  el.innerHTML = `
    <div class="page-head"><h1>Doctors</h1>${admin ? `<button class="btn" id="d-add">+ Add doctor</button>` : ""}</div>
    <div class="card">${S.doctors.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Doctor</th><th>Degrees</th><th>Speciality</th><th>Timings</th><th class="num">Fee</th>${can.money() ? `<th class="num">Dr. share</th>` : ""}<th>Status</th>${admin ? "<th></th>" : ""}</tr></thead>
      <tbody>${S.doctors.map((d) => `<tr>
        <td><b>${esc(drName(d.name))}</b>${d.regNo ? `<div class="muted small">Reg: ${esc(d.regNo)}</div>` : ""}${d.phone ? `<div class="muted small">${esc(d.phone)}</div>` : ""}</td>
        <td>${esc(d.degrees)}</td><td>${esc(d.specialization)}</td><td class="small">${esc(d.timings)}</td>
        <td class="num">${money(d.fee)}${d.followUpFee !== undefined && d.followUpFee !== "" ? `<div class="muted small">F/up ${money(d.followUpFee)}</div>` : ""}</td>
        ${can.money() ? `<td class="num">${num(d.doctorSharePct)}%</td>` : ""}
        <td>${d.active === false ? `<span class="badge off">Inactive</span>` : `<span class="badge ok">Active</span>`}</td>
        ${admin ? `<td class="nowrap right"><button class="btn ghost sm" data-edit="${d.id}">Edit</button> <button class="btn danger-ghost sm" data-del="${d.id}">Remove</button></td>` : ""}
      </tr>`).join("")}</tbody></table></div>` : `<div class="empty">No doctors yet${admin ? " — click “Add doctor”." : "."}</div>`}</div>`;
  if (!admin) return;
  $("#d-add").onclick = () => doctorModal(null);
  $$("[data-edit]", el).forEach((b) => (b.onclick = () => doctorModal(S.doctors.find((d) => d.id === b.dataset.edit))));
  $$("[data-del]", el).forEach((b) => (b.onclick = async () => {
    const d = S.doctors.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`Remove ${drName(d.name)}? Old prescriptions and reports are kept. (Tip: use Edit → Inactive to just hide them.)`, { okText: "Remove", danger: true }))) return;
    try { await deleteDoc(doc(db, "doctors", d.id)); toast("Doctor removed", "ok"); } catch (e) { toast(friendlyError(e), "error"); }
  }));
}

function doctorModal(d) {
  d = d || { active: true, doctorSharePct: 0 };
  const m = openModal(d.id ? "Edit doctor" : "Add doctor", `
  <form id="dm-form">
    <div class="grid g2">
      <div class="field span2"><label class="req">Doctor name</label><input name="name" required value="${esc(d.name)}" placeholder="e.g. Dr. Rahul Das"></div>
      <div class="field span2"><label class="req">Degrees / Qualifications</label><input name="degrees" required value="${esc(d.degrees)}" placeholder="e.g. MBBS, MD (Medicine)"></div>
      <div class="field"><label>Speciality</label><input name="specialization" value="${esc(d.specialization)}" placeholder="e.g. General Physician" list="spec-list"></div>
      <div class="field"><label>Registration no.</label><input name="regNo" value="${esc(d.regNo)}" placeholder="e.g. AMC 12345"></div>
      <div class="field"><label>Phone</label><input name="phone" value="${esc(d.phone)}"></div>
      <div class="field"><label>Visiting days / timings</label><input name="timings" value="${esc(d.timings)}" placeholder="e.g. Mon–Sat, 10am–1pm"></div>
      <div class="field"><label class="req">Consultation fee (₹)</label><input name="fee" type="number" min="0" required value="${esc(d.fee ?? "")}"></div>
      <div class="field"><label>Follow-up fee (₹)</label><input name="followUpFee" type="number" min="0" value="${esc(d.followUpFee ?? "")}" placeholder="Same as fee if empty"></div>
      <div class="field"><label>Doctor's share of fee (%)</label><input name="doctorSharePct" type="number" min="0" max="100" value="${esc(d.doctorSharePct ?? 0)}"><div class="muted small">Part of the fee paid to the doctor. The rest is clinic income.</div></div>
      <div class="field"><label>Status</label><select name="active"><option value="1" ${d.active !== false ? "selected" : ""}>Active</option><option value="0" ${d.active === false ? "selected" : ""}>Inactive (hidden)</option></select></div>
    </div>
    <datalist id="spec-list">${["General Physician", "Medicine", "Paediatrics", "Gynaecology & Obstetrics", "General Surgery", "Orthopaedics", "ENT", "Ophthalmology", "Dermatology", "Cardiology", "Neurology", "Psychiatry", "Dentistry", "Urology", "Chest & TB"].map((s) => `<option>${s}</option>`).join("")}</datalist>
    <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save doctor</button></div>
  </form>`, { wide: true });
  $("#dm-form", m.el).onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    const data = {
      name: f.name.trim(), degrees: f.degrees.trim(), specialization: f.specialization.trim(), regNo: f.regNo.trim(),
      phone: f.phone.trim(), timings: f.timings.trim(), fee: num(f.fee),
      followUpFee: f.followUpFee === "" ? "" : num(f.followUpFee),
      doctorSharePct: Math.min(100, Math.max(0, num(f.doctorSharePct))), active: f.active === "1", updatedAtMs: Date.now(),
    };
    await busy($("button[type=submit]", e.target), async () => {
      try {
        if (d.id) await updateDoc(doc(db, "doctors", d.id), data);
        else await addDoc(collection(db, "doctors"), { ...data, createdAtMs: Date.now() });
        m.close(); toast("Doctor saved", "ok");
      } catch (err) { toast(friendlyError(err), "error"); }
    });
  };
}

/* ======================= Users (logins) ======================= */
async function viewUsers(el) {
  const s = await getDocs(collection(db, "users"));
  const users = s.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => ["admin", "copartner", "staff"].indexOf(a.role) - ["admin", "copartner", "staff"].indexOf(b.role) || (a.name || "").localeCompare(b.name || ""));
  const count = (r) => users.filter((u) => u.role === r && u.active).length;
  el.innerHTML = `
    <div class="page-head"><h1>Logins</h1><button class="btn" id="u-add">+ Create login</button></div>
    <div class="stats">
      <div class="stat"><div class="label">Co-partners</div><div class="value">${count("copartner")}</div></div>
      <div class="stat"><div class="label">Staff</div><div class="value">${count("staff")}</div></div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th></th></tr></thead>
      <tbody>${users.map((u) => `<tr>
        <td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td>
        <td><span class="badge ${u.role === "admin" ? "warn" : "teal"}">${ROLES[u.role] || u.role}</span></td>
        <td>${esc(u.phone)}</td>
        <td>${u.active ? `<span class="badge ok">Active</span>` : `<span class="badge off">Disabled</span>`}</td>
        <td class="nowrap right">${u.uid === S.profile.uid || u.role === "admin" ? `<span class="muted small">Main admin</span>` : `
          <button class="btn ghost sm" data-edit="${u.uid}">Edit</button>
          <button class="btn ${u.active ? "danger-ghost" : "ghost"} sm" data-toggle="${u.uid}">${u.active ? "Disable" : "Enable"}</button>`}</td>
      </tr>`).join("")}</tbody></table></div>
      <p class="muted small">Disabling a login blocks it immediately. To reset a forgotten password, disable the old login and create a new one with a different username.</p>
    </div>`;
  $("#u-add").onclick = () => userModal(null);
  $$("[data-edit]", el).forEach((b) => (b.onclick = () => userModal(users.find((u) => u.uid === b.dataset.edit))));
  $$("[data-toggle]", el).forEach((b) => (b.onclick = async () => {
    const u = users.find((x) => x.uid === b.dataset.toggle);
    if (u.active && !(await confirmBox(`Disable login for ${u.name}? They will not be able to log in.`, { okText: "Disable", danger: true }))) return;
    try { await updateDoc(doc(db, "users", u.uid), { active: !u.active }); toast("Updated", "ok"); route(); }
    catch (e) { toast(friendlyError(e), "error"); }
  }));
}

function userModal(u) {
  const isNew = !u;
  const m = openModal(isNew ? "Create login" : "Edit login", `
  <form id="um-form" autocomplete="off">
    <div class="field"><label class="req">Full name</label><input name="name" required value="${esc(u?.name)}"></div>
    <div class="field"><label class="req">Role</label><select name="role">
      <option value="staff" ${u?.role === "staff" ? "selected" : ""}>Staff — creates prescriptions &amp; collects fees</option>
      <option value="copartner" ${u?.role === "copartner" ? "selected" : ""}>Co-partner — sees dashboard, earnings &amp; reports</option>
    </select></div>
    <div class="field"><label>Phone</label><input name="phone" value="${esc(u?.phone)}"></div>
    ${isNew ? `
    <div class="field"><label class="req">Username</label><input name="username" required pattern="[a-zA-Z0-9._\\-]{3,30}" autocapitalize="none" placeholder="e.g. staff1 or rahul"><div class="muted small">3–30 letters/numbers, no spaces.</div></div>
    <div class="field"><label class="req">Password</label><div class="btn-row" style="flex-wrap:nowrap"><input name="password" id="um-pw" required minlength="6" style="flex:1"><button type="button" class="btn ghost" id="um-gen">Generate</button></div></div>` : ""}
    <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">${isNew ? "Create login" : "Save"}</button></div>
  </form>`);
  const gen = $("#um-gen", m.el);
  if (gen) gen.onclick = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const arr = crypto.getRandomValues(new Uint32Array(8));
    $("#um-pw", m.el).value = [...arr].map((x) => chars[x % chars.length]).join("") + "@" + (10 + (arr[0] % 90));
  };
  $("#um-form", m.el).onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    await busy($("button[type=submit]", e.target), async () => {
      try {
        if (isNew) {
          const username = f.username.trim().toLowerCase();
          if (username === ADMIN_USERNAME) throw new Error("This username is reserved.");
          const uid = await createLoginAccount(`${username}@${LOGIN_DOMAIN}`, f.password);
          await setDoc(doc(db, "users", uid), { username, name: f.name.trim(), role: f.role, phone: f.phone.trim(), active: true, createdAtMs: Date.now(), createdBy: S.profile.uid });
          m.close();
          openModal("Login created ✔", `
            <p>Share these details with <b>${esc(f.name)}</b>:</p>
            <div class="card" style="background:#f8fafc"><div class="kv"><div class="k">App link</div><div>${esc(location.origin + location.pathname)}</div><div class="k">Username</div><div><b>${esc(username)}</b></div><div class="k">Password</div><div><b>${esc(f.password)}</b></div><div class="k">Role</div><div>${ROLES[f.role]}</div></div></div>
            <p class="muted small">Note this password now — it can't be shown again.</p>
            <div class="modal-foot"><button class="btn ghost" id="cp-copy">Copy</button><button class="btn" data-close>Done</button></div>`).el.querySelector("#cp-copy").onclick = () => {
            navigator.clipboard?.writeText(`${S.settings.name}\nApp: ${location.origin + location.pathname}\nUsername: ${username}\nPassword: ${f.password}`).then(() => toast("Copied", "ok"));
          };
        } else {
          await updateDoc(doc(db, "users", u.uid), { name: f.name.trim(), role: f.role, phone: f.phone.trim() });
          m.close(); toast("Saved", "ok");
        }
        route();
      } catch (err) { toast(friendlyError(err), "error"); }
    });
  };
}

/* ======================= Settings ======================= */
function viewSettings(el) {
  const st = S.settings;
  el.innerHTML = `
    <div class="page-head"><h1>Settings</h1></div>
    <form id="st-form">
      <div class="card">
        <h2>Logo, name &amp; tagline</h2>
        <div class="brand-edit">
          <div class="logo-drop" id="st-logo-box">${logoHtml(st, "logo-preview")}</div>
          <div>
            <div class="btn-row">
              <label class="btn ghost" style="margin:0">Upload logo<input type="file" id="st-logo" accept="image/*" hidden></label>
              <button type="button" class="btn danger-ghost ${st.logo ? "" : "hidden"}" id="st-logo-rm">Remove logo</button>
            </div>
            <p class="muted small">PNG or JPG. A square logo works best. It is shown on the login screen, in the app menu and on every printed prescription and receipt.</p>
          </div>
        </div>
        <div class="grid g2" style="margin-top:14px">
          <div class="field span2"><label class="req">Clinic name</label><input name="name" required value="${esc(st.name)}"></div>
          <div class="field span2"><label>Tagline</label><input name="tagline" value="${esc(st.tagline)}" placeholder="e.g. Caring for Lakhipur with trust"></div>
          <div class="field span2"><label>Tags / services line</label><input name="tags" value="${esc(st.tags)}" placeholder="e.g. OPD • Diagnostics • Pharmacy • 24×7 Emergency"><div class="muted small">Printed as a strip under the clinic header. Separate items with • or |</div></div>
        </div>
      </div>
      <div class="card">
        <h2>Contact &amp; printing</h2>
        <div class="grid g2">
          <div class="field span2"><label>Address</label><textarea name="address" rows="2">${esc(st.address)}</textarea></div>
          <div class="field"><label>Phone</label><input name="phone" value="${esc(st.phone)}"></div>
          <div class="field"><label>Email</label><input name="email" value="${esc(st.email)}"></div>
          <div class="field span2"><label>Clinic timings</label><input name="timings" value="${esc(st.timings)}" placeholder="e.g. Open daily 8am – 8pm"></div>
          <div class="field span2"><label>Footer note</label><input name="footerNote" value="${esc(st.footerNote)}"></div>
          <div class="field"><label>Prescription paper size</label><select name="paperSize"><option ${st.paperSize !== "A4" ? "selected" : ""}>A5</option><option ${st.paperSize === "A4" ? "selected" : ""}>A4</option></select></div>
        </div>
        <p class="muted small">Fees are never printed on the prescription. Use "Print fee receipt" on the print screen if the patient wants a receipt.</p>
        <button class="btn" type="submit">Save settings</button>
      </div>
    </form>
    <div class="card">
      <h2>Backup</h2>
      <p class="muted">Download all patients, doctors and prescriptions as a file. Keep a copy every month.</p>
      <button class="btn ghost" id="st-backup">Download full backup (JSON)</button>
    </div>`;
  let logo = st.logo || "";
  const showLogo = () => {
    $("#st-logo-box").innerHTML = logoHtml({ logo }, "logo-preview");
    $("#st-logo-rm").classList.toggle("hidden", !logo);
  };
  $("#st-logo").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { logo = await resizeImage(file); showLogo(); toast("Logo ready — press Save settings"); }
    catch (err) { toast(err.message, "error"); }
    e.target.value = "";
  };
  $("#st-logo-rm").onclick = () => { logo = ""; showLogo(); };
  $("#st-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    const data = { name: f.name.trim(), tagline: f.tagline.trim(), tags: f.tags.trim(), logo, address: f.address.trim(), phone: f.phone.trim(), email: f.email.trim(), timings: f.timings.trim(), footerNote: f.footerNote.trim(), paperSize: f.paperSize };
    await busy($("button[type=submit]", e.target), async () => {
      try { await setDoc(doc(db, "settings", "clinic"), data, { merge: true }); toast("Settings saved", "ok"); }
      catch (err) { toast(friendlyError(err), "error"); }
    });
  };
  $("#st-backup").onclick = (e) => busy(e.target, async () => {
    try {
      const out = { exportedAt: new Date().toISOString(), clinic: S.settings };
      for (const c of ["doctors", "patients", "visits", "users"]) {
        const s = await getDocs(collection(db, c));
        out[c] = s.docs.map((d) => { const x = { id: d.id, ...d.data() }; delete x.createdAt; return x; });
      }
      downloadFile(`lakhipur-polyclinic-backup-${dayKey()}.json`, JSON.stringify(out, null, 1), "application/json");
    } catch (err) { toast(friendlyError(err), "error"); }
  });
}

/* ======================= Account ======================= */
function viewAccount(el) {
  const p = S.profile;
  el.innerHTML = `
    <div class="page-head"><h1>My Account</h1></div>
    <div class="two-col">
      <div class="card"><div class="kv">
        <div class="k">Name</div><div><b>${esc(p.name)}</b></div>
        <div class="k">Username</div><div>${esc(p.username)}</div>
        <div class="k">Role</div><div>${ROLES[p.role]}</div>
      </div></div>
      <form class="card" id="ac-form">
        <h2>Change password</h2>
        <div class="field"><label>Current password</label><input type="password" name="cur" required autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input type="password" name="pw" required minlength="6" autocomplete="new-password"></div>
        <div class="field"><label>Confirm new password</label><input type="password" name="pw2" required minlength="6" autocomplete="new-password"></div>
        <button class="btn" type="submit">Update password</button>
      </form>
    </div>`;
  $("#ac-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    if (f.pw !== f.pw2) { toast("New passwords don't match", "error"); return; }
    await busy($("button[type=submit]", e.target), async () => {
      try {
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, f.cur));
        await updatePassword(auth.currentUser, f.pw);
        e.target.reset(); toast("Password changed", "ok");
      } catch (err) { toast(friendlyError(err), "error"); }
    });
  };
}
