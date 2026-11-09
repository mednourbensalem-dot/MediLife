/* ==========================================================================
   MediLife — app layer
   Views, hash router, simulated auth, permissions, live clock and cross-tab sync.
   PROTOTYPE: fictional data, browser storage only, not a medical device.
   ========================================================================== */

let DB = Store.load();
let ME = null;
let LANG = localStorage.getItem('ml.lang') || 'en';

const CAL = { y: null, m: null, sel: null, st: '', v: 'month' };
let CURRENT = { page: '', arg: null };
let LAST_ROUTE = '';
let DOC_CAT = '';
let APPT_FILTER = 'all';
let NOTIF_FILTER = 'all';
let CONFIRM_FN = null;
let CLOCK = null;
let LAST_DAY = null;
const VIEWED = new Set();

/* ------------------------------------------------------------------ utils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const pad2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const today = () => iso(new Date());
const parseD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const toM = s => +s.slice(0, 2) * 60 + +s.slice(3);
const fromM = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
const fd = f => Object.fromEntries(new FormData(f));
const U = id => DB.users.find(u => u.id === id) || { id, name: 'Unknown', spec: '', role: 'patient' };
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function apTs(a) {
  const d = parseD(a.date);
  const [h, mi] = a.time.split(':').map(Number);
  d.setHours(h, mi, 0, 0);
  return d.getTime();
}
function fmtLong(s) { const d = parseD(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtShort(s) { const d = parseD(s); return DOW3[d.getDay()] + ' ' + d.getDate() + ' ' + MON3[d.getMonth()]; }
function dayDiff(s) { return Math.round((parseD(s) - parseD(today())) / 864e5); }
function relDay(s) {
  const n = dayDiff(s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return fmtShort(s);
}
function relTime(ts) {
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  const dd = Math.round(h / 24);
  if (dd === 1) return 'yesterday';
  if (dd < 30) return dd + ' days ago';
  return fmtShort(iso(d));
}
function humanCountdown(ms) {
  if (ms <= 0) return 'Now';
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  if (ms < 36e5) return m + ' min ' + pad2(s) + ' s';
  if (d > 0) return d + ' day' + (d > 1 ? 's' : '') + ' ' + h + ' h';
  return h + ' h ' + pad2(m) + ' min';
}
function ageOf(dob) {
  if (!dob) return null;
  const b = parseD(dob), n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const md = n.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && n.getDate() < b.getDate())) age--;
  return age;
}
function hashHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function avatar(user, size = 38, extra = '') {
  const name = typeof user === 'string' ? user : (user && user.name) || '?';
  const ini = name.replace(/^Dr\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<span class="avatar ${extra}" style="--size:${size}px;--h:${hashHue(name)}" aria-hidden="true">${esc(ini)}</span>`;
}
function icon(name, cls = 'ic') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/* --------------------------------------------------------------- live sync */
const sync = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('medilife.sync') : null;
function reloadFromStore(announce) {
  const id = ME && ME.id;
  DB = Store.load();
  if (id) ME = DB.users.find(u => u.id === id && u.active) || null;
  if (!id || !ME) {
    sessionStorage.removeItem('ml.me');
    if (ME || id) { ME = null; go(); }
    return;
  }
  renderBadges();
  if ($('#modal').open) return;
  go({ quiet: true });
  if (announce) toast('Workspace refreshed from another tab', 'info');
}
if (sync) {
  sync.onmessage = () => { if (ME) reloadFromStore(true); };
} else {
  window.addEventListener('storage', e => {
    if (e.key === Store.key && ME) reloadFromStore(true);
  });
}

function save() {
  const ok = Store.save();
  if (!ok) toast('Browser storage is full — remove a document to continue', 'error');
  if (sync) { try { sync.postMessage({ t: 'db', at: Date.now() }); } catch (e) {} }
  return ok;
}
function log(a) {
  const d = new Date();
  DB.audit.unshift({ ts: today() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()), by: ME ? ME.name + ' (' + ME.role + ')' : 'system', a });
  if (DB.audit.length > 250) DB.audit.length = 250;
  save();
}
function notify(to, text) {
  DB.notifs.unshift({ id: uid('n'), to, text, date: today(), read: false });
}

/* ------------------------------------------------------------------ toasts */
function toast(msg, type = 'ok') {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast--error' : type === 'info' ? ' toast--info' : '');
  const ic = type === 'error' ? 'alert' : type === 'info' ? 'activity' : 'check';
  el.innerHTML = icon(ic) + '<span>' + esc(msg) + '</span><button aria-label="Dismiss">×</button>';
  el.querySelector('button').onclick = () => el.remove();
  host.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); }, 4400);
}

/* ----------------------------------------------------------------- dialogs */
function openDialog(html, opts = {}) {
  const d = $('#modal');
  d.innerHTML = '<div class="dlg">' + html + '</div>';
  d.className = opts.wide ? 'is-wide' : '';
  if (!d.open) d.showModal();
}
function closeDialog() {
  const d = $('#modal');
  if (d.open) d.close();
  d.innerHTML = '';
  d.className = '';
  CONFIRM_FN = null;
}
function dialogHead(title, sub = '') {
  return `<div class="dlg-head"><div><h2 id="dlgTitle">${esc(title)}</h2>${sub ? '<p>' + esc(sub) + '</p>' : ''}</div><button class="icon-btn" aria-label="Close" onclick="closeDialog()">${icon('close')}</button></div>`;
}
function askConfirm({ title, body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  CONFIRM_FN = onConfirm;
  openDialog(dialogHead(title) +
    '<div class="dlg-body"><p style="margin:0;font-size:.9rem;line-height:1.55">' + body + '</p></div>' +
    '<div class="dlg-foot"><button class="btn btn--outline" onclick="closeDialog()">Keep as is</button>' +
    '<button class="btn ' + (danger ? 'btn--danger' : 'btn--primary') + '" onclick="runConfirm()">' + esc(confirmLabel) + '</button></div>');
}
function runConfirm() {
  const fn = CONFIRM_FN;
  closeDialog();
  if (fn) fn();
}
$('#modal') && $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeDialog(); });
$('#modal') && $('#modal').addEventListener('close', () => { CONFIRM_FN = null; });

/* -------------------------------------------------------------------- i18n */
const T = {
  en: {
    dashboard: 'Dashboard', dossier: 'My dossier', documents: 'Documents', calendar: 'Calendar', doctors: 'Doctors',
    meds: 'Medications', notifications: 'Notifications', settings: 'Settings', patients: 'Patients',
    users: 'Users & roles', appointments: 'Appointments', schedules: 'Doctor schedules', stats: 'Statistics',
    audit: 'Audit log', logout: 'Log out', tag: 'Your Health, Organized. Your Care, Connected.', tagShort: 'Care platform',
    care: 'Care', health: 'Health', account: 'Account', clinic: 'Clinic', workspace: 'Workspace', admin: 'Administration'
  },
  fr: {
    dashboard: 'Tableau de bord', dossier: 'Mon dossier', documents: 'Documents', calendar: 'Calendrier', doctors: 'Médecins',
    meds: 'Médicaments', notifications: 'Notifications', settings: 'Paramètres', patients: 'Patients',
    users: 'Utilisateurs & rôles', appointments: 'Rendez-vous', schedules: 'Horaires médecins', stats: 'Statistiques',
    audit: "Journal d'audit", logout: 'Déconnexion', tag: 'Votre santé, organisée. Vos soins, connectés.', tagShort: 'Plateforme de soins',
    care: 'Soins', health: 'Santé', account: 'Compte', clinic: 'Clinique', workspace: 'Espace', admin: 'Administration'
  },
  ar: {
    dashboard: 'لوحة القيادة', dossier: 'ملفي الطبي', documents: 'المستندات', calendar: 'التقويم', doctors: 'الأطباء',
    meds: 'الأدوية', notifications: 'الإشعارات', settings: 'الإعدادات', patients: 'المرضى',
    users: 'المستخدمون والأدوار', appointments: 'المواعيد', schedules: 'جداول الأطباء', stats: 'الإحصاءات',
    audit: 'سجل التدقيق', logout: 'تسجيل الخروج', tag: 'صحتك منظمة. رعايتك متصلة.', tagShort: 'منصة الرعاية',
    care: 'الرعاية', health: 'الصحة', account: 'الحساب', clinic: 'العيادة', workspace: 'مساحة العمل', admin: 'الإدارة'
  }
};
const t = k => (T[LANG] && T[LANG][k]) || T.en[k] || k;

/* --------------------------------------------------------------------- nav */
const PAGES = {
  dashboard: { icon: 'grid' }, dossier: { icon: 'file' }, documents: { icon: 'folder' },
  calendar: { icon: 'calendar' }, doctors: { icon: 'stethoscope' }, meds: { icon: 'pill' },
  notifications: { icon: 'bell' }, settings: { icon: 'settings' }, patients: { icon: 'users' },
  users: { icon: 'user' }, appointments: { icon: 'calendar-check' }, schedules: { icon: 'clock' },
  stats: { icon: 'chart' }, audit: { icon: 'shield' }
};
const NAV = {
  patient: [
    { group: 'care', pages: ['dashboard', 'dossier', 'documents', 'calendar'] },
    { group: 'health', pages: ['meds', 'doctors', 'notifications'] },
    { group: 'account', pages: ['settings'] }
  ],
  doctor: [
    { group: 'clinic', pages: ['dashboard', 'patients', 'calendar', 'documents'] },
    { group: 'workspace', pages: ['notifications'] },
    { group: 'account', pages: ['settings'] }
  ],
  admin: [
    { group: 'clinic', pages: ['dashboard', 'appointments', 'schedules'] },
    { group: 'admin', pages: ['users', 'stats', 'audit'] },
    { group: 'workspace', pages: ['notifications'] },
    { group: 'account', pages: ['settings'] }
  ]
};
const navPages = role => NAV[role].flatMap(g => g.pages);
const navLink = p => `<a class="nav-link" data-page="${p}" href="#/${p}" onclick="closeSidebar()">${icon(PAGES[p].icon)}<span>${t(p)}</span>${p === 'notifications' ? '<span class="nav-badge" data-unread hidden>0</span>' : ''}</a>`;
const liveChip = (label = 'Live') => `<span class="live-chip"><span class="live-dot"></span>${esc(label)}</span>`;
const linkTo = (href, label) => `<a class="link" href="${href}">${esc(label)} ${icon('arrow-right')}</a>`;

/* --------------------------------------------------------------- permissions */
function allowed(pid) {
  if (!ME) return false;
  if (ME.role === 'patient') return ME.id === pid;
  if (ME.role === 'doctor') return (U(pid).access || []).includes(ME.id);
  return false;
}
const myAppts = () => DB.appts.filter(a => ME && (ME.role === 'admin' || a.pid === ME.id || a.did === ME.id));

/* --------------------------------------------------------------- scheduling */
function slots(did, date, ignore) {
  const h = U(did).hours;
  if (!h || !Array.isArray(h.days) || !h.days.includes(parseD(date).getDay()) || date < today()) return [];
  const now = new Date();
  const nowM = date === today() ? now.getHours() * 60 + now.getMinutes() : -1;
  const out = [];
  for (let m = toM(h.start); m + 30 <= toM(h.end); m += 30) {
    if (nowM >= 0 && m <= nowM) continue;
    const s = fromM(m);
    if (!DB.appts.some(a => a.id !== ignore && a.did === did && a.date === date && a.time === s && a.status !== 'cancelled')) out.push(s);
  }
  return out;
}
function nextSlots(did, n = 3) {
  const out = [];
  for (let i = 0; i < 24 && out.length < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ds = iso(d);
    const free = slots(did, ds);
    if (free.length) out.push({ date: ds, time: free[0] });
  }
  return out;
}
function bookForm(pid, did, editId) {
  if (!ME) return;
  const e = DB.appts.find(a => a.id === editId);
  const docs = DB.users.filter(u => u.role === 'doctor' && u.active);
  if (!docs.length) return toast('No active doctors available', 'error');
  did = e ? e.did : (did || docs[0].id);
  pid = e ? e.pid : (pid || ME.id);
  if (ME.role === 'doctor' && !allowed(pid)) return toast('Patient consent is required to book', 'error');
  openDialog(dialogHead(e ? 'Reschedule appointment' : 'Book an appointment', e ? 'Move this visit to another free slot.' : 'Pick a doctor, a free slot and the reason for the visit.') +
    `<div class="dlg-body"><form id="bookForm" data-edit="${editId || ''}" onsubmit="return book(this,'${pid}','${editId || ''}')">
      <div class="form-grid">
        <label class="field"><span>Doctor</span><select class="select" name="did" onchange="slotRefresh()" ${e ? 'disabled' : ''}>${docs.map(d => `<option value="${d.id}" ${d.id === did ? 'selected' : ''}>Dr ${esc(d.name)} — ${esc(d.spec)}</option>`).join('')}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" min="${today()}" value="${e ? e.date : today()}" required onchange="slotRefresh()"></label>
        <label class="field"><span>Time slot</span><select class="select" name="time" required></select></label>
        <label class="field"><span>Reason for visit</span><input class="input" name="reason" maxlength="120" required value="${esc(e ? e.reason : '')}" placeholder="e.g. Follow-up consultation"></label>
      </div>
      <p class="dlg-note">${icon('clock')} Slots come from the clinic schedule and are checked again when you confirm.</p>
    </form></div>
    <div class="dlg-foot"><span class="spread">Suggested: <b id="sug">—</b></span>
      <button class="btn btn--outline" onclick="closeDialog()">Cancel</button>
      <button class="btn btn--primary" type="submit" form="bookForm">${e ? 'Save changes' : 'Confirm booking'}</button>
    </div>`, { wide: true });
  slotRefresh();
}
function slotRefresh() {
  const form = document.getElementById('bookForm');
  if (!form) return;
  const f = form.elements;
  const edit = form.dataset.edit || null;
  const s = slots(f.did.value, f.date.value, edit);
  f.time.innerHTML = s.length ? s.map(x => `<option>${x}</option>`).join('') : '<option value="">No free slot on this day</option>';
  const sug = [];
  for (let i = 0; i < 21 && sug.length < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ds = iso(d);
    const free = slots(f.did.value, ds, edit);
    if (free.length) sug.push(fmtShort(ds) + ' · ' + free[0]);
  }
  const el = document.getElementById('sug');
  if (el) el.textContent = sug.join(' · ') || 'no openings in the next 3 weeks';
}
function book(f, pid, editId) {
  const v = fd(f);
  const e = DB.appts.find(a => a.id === editId);
  const did = e ? e.did : v.did;
  if (!v.time) { toast('Pick an available slot', 'error'); return false; }
  if (DB.appts.some(a => a.id !== editId && a.pid === pid && a.date === v.date && a.time === v.time && a.status !== 'cancelled')) {
    toast('This patient already has a visit at that time', 'error');
    return false;
  }
  if (!slots(did, v.date, editId).includes(v.time)) { toast('That slot is no longer free', 'error'); return false; }
  if (e) {
    const moved = e.date !== v.date || e.time !== v.time;
    Object.assign(e, { date: v.date, time: v.time, reason: v.reason, status: 'pending' });
    if (moved) { notify(e.did, `Appointment moved to ${fmtShort(v.date)} ${v.time}`); notify(e.pid, `Appointment moved to ${fmtShort(v.date)} ${v.time}`); }
    log('Rescheduled ' + e.id);
    toast('Appointment updated');
  } else {
    const id = uid('ap');
    DB.appts.push({ id, pid, did, date: v.date, time: v.time, status: ME.role === 'doctor' ? 'confirmed' : 'pending', reason: v.reason, note: '', dx: '' });
    notify(did, `New booking ${v.date} ${v.time} — ${U(pid).name}`);
    notify(pid, `Appointment requested for ${v.date} ${v.time}`);
    log('Booked ' + id);
    toast(ME.role === 'patient' ? 'Booking request sent to the clinic' : 'Appointment created');
  }
  save();
  closeDialog();
  go();
  return false;
}
function setStatus(id, s) {
  const a = DB.appts.find(x => x.id === id);
  if (!a) return;
  if (ME.role === 'patient' && s === 'cancelled' && apTs(a) - Date.now() < 864e5) {
    return toast('Clinic rule: cancel at least 24 hours ahead', 'error');
  }
  const names = { cancelled: 'Cancel this appointment?', confirmed: 'Confirm this appointment?', completed: 'Mark this visit as completed?', missed: 'Record this visit as a no-show?' };
  askConfirm({
    title: names[s] || 'Update appointment?',
    body: `<b>${esc(U(a.pid).name)}</b> with Dr ${esc(U(a.did).name)} · ${fmtLong(a.date)} at ${a.time}.<br><span class="mut">${esc(a.reason)}</span>`,
    confirmLabel: s === 'cancelled' ? 'Cancel appointment' : s === 'missed' ? 'Mark no-show' : s[0].toUpperCase() + s.slice(1),
    danger: s === 'cancelled' || s === 'missed',
    onConfirm() {
      a.status = s;
      notify(a.pid, `Appointment ${fmtShort(a.date)} ${a.time}: ${s}`);
      notify(a.did, `Appointment ${fmtShort(a.date)} ${a.time}: ${s}`);
      log(`Appt ${id} → ${s}`);
      save();
      go();
      toast('Appointment updated');
    }
  });
}

/* --------------------------------------------------------------- components */
function statusPill(s) { return `<span class="pill pill--${s}"><span class="dot"></span>${esc(s)}</span>`; }
function emptyState(iconName, title, msg, action = '') {
  return `<div class="empty"><span class="empty-icon">${icon(iconName)}</span><b>${esc(title)}</b><p>${esc(msg)}</p>${action}</div>`;
}
function panel({ title, sub = '', head = '', body, cls = '' }) {
  return `<section class="card ${cls}"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${head}</div>${body}</section>`;
}
function pageHead(title, sub, actions = '') {
  return `<div class="page-head"><div class="page-head-text"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="page-head-actions">${actions}</div>` : ''}</div>`;
}
function statCard({ iconName, tone = 'teal', value, label, hint = '', bars = '' }) {
  return `<div class="stat"><div class="stat-top"><span class="stat-icon tone-${tone}">${icon(iconName)}</span>${hint ? `<span class="tiny mut">${esc(hint)}</span>` : ''}</div>
    <span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span>${bars}</div>`;
}
function miniBars(values) {
  const max = Math.max(...values, 1);
  return `<div class="stat-bars" aria-hidden="true">${values.map(v => `<i style="height:${Math.max(4, Math.round(v / max * 100))}%"></i>`).join('')}</div>`;
}
function apptButtons(a, compact) {
  const r = ME.role, live = ['pending', 'confirmed'].includes(a.status), out = [];
  if (compact) {
    if (live && r !== 'patient' && a.status === 'pending') out.push(`<button class="btn btn--primary btn--sm" onclick="setStatus('${a.id}','confirmed')">Confirm</button>`);
    if (live) out.push(`<button class="btn btn--danger btn--sm" onclick="setStatus('${a.id}','cancelled')">Cancel</button>`);
    out.push(`<a class="btn btn--ghost btn--sm" href="#/calendar/${a.date}" title="Open in calendar">${icon('calendar')}</a>`);
    return out.join('');
  }
  if (live && r !== 'patient' && a.status === 'pending') out.push(`<button class="btn btn--primary btn--sm" onclick="setStatus('${a.id}','confirmed')">Confirm</button>`);
  if (live && r === 'doctor' && a.status === 'confirmed') out.push(`<button class="btn btn--outline btn--sm" onclick="setStatus('${a.id}','completed')">Complete</button>`);
  if (live && r !== 'patient') out.push(`<button class="btn btn--outline btn--sm" onclick="setStatus('${a.id}','missed')">No-show</button>`);
  if (live) out.push(`<button class="btn btn--danger btn--sm" onclick="setStatus('${a.id}','cancelled')">Cancel</button>`);
  if (live && r !== 'doctor') out.push(`<button class="btn btn--ghost btn--sm" onclick="bookForm('${a.pid}','${a.did}','${a.id}')">Reschedule</button>`);
  if (r === 'doctor' && allowed(a.pid)) out.push(`<a class="btn btn--ghost btn--sm" href="#/patients/${a.pid}">Dossier</a>`);
  return out.join('');
}
function apptCard(a, opts = {}) {
  const doc = U(a.did), pat = U(a.pid);
  const title = ME.role === 'patient' ? 'Dr ' + esc(doc.name) : esc(pat.name);
  const sub = ME.role === 'patient' ? esc(a.reason) : esc(doc.spec) + ' · ' + esc(a.reason);
  return `<article class="appt">
    <div class="appt-time"><b>${a.time}</b><span>${relDay(a.date)}</span></div>
    <div class="appt-main">
      <div class="appt-title">${ME.role !== 'patient' ? avatar(pat, 25) : ''}${title}${statusPill(a.status)}</div>
      <div class="appt-sub">${sub}</div>
      <div class="appt-meta"><span>${icon('calendar')} ${fmtShort(a.date)}</span>${ME.role !== 'patient' ? `<span>${icon('stethoscope')} Dr ${esc(doc.name)}</span>` : `<span>${icon('clock')} ${a.time}</span>`}</div>
    </div>
    ${opts.actions === false ? '' : `<div class="appt-actions">${apptButtons(a)}</div>`}
  </article>`;
}
function apptTable(list) {
  const rows = [...list].sort((a, b) => apTs(a) - apTs(b)).map(a => {
    const q = [U(a.pid).name, U(a.did).name, a.reason, a.status, a.date].join(' ').toLowerCase();
    return `<tr data-q="${esc(q)}">
      <td><div class="name-cell">${avatar(U(a.pid), 30)}<div><b>${esc(U(a.pid).name)}</b><small>${esc(U(a.pid).phone || 'Patient')}</small></div></div></td>
      <td>${fmtShort(a.date)}<br><span class="hint tiny">${a.time}</span></td>
      <td>Dr ${esc(U(a.did).name)}<br><span class="hint tiny">${esc(U(a.did).spec)}</span></td>
      <td>${esc(a.reason)}</td>
      <td>${statusPill(a.status)}</td>
      <td class="right"><div class="cell-actions">${apptButtons(a, true)}</div></td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table-appts"><thead><tr><th>Patient</th><th>When</th><th>Doctor</th><th>Reason</th><th>Status</th><th class="right">Actions</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">${emptyState('calendar', 'No appointments', 'Nothing matches this filter yet.')}</td></tr>`}</tbody></table></div>`;
}
function filterCards(input) {
  const q = input.value.trim().toLowerCase();
  const scope = input.closest('.card') || document;
  scope.querySelectorAll('[data-q]').forEach(el => { el.style.display = !q || el.dataset.q.includes(q) ? '' : 'none'; });
}
function last7(filterFn) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const s = iso(d);
    return DB.appts.filter(a => a.date === s && filterFn(a)).length;
  });
}

/* ----------------------------------------------------------------- between */
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
}
function setLang(l) {
  LANG = l;
  localStorage.setItem('ml.lang', l);
  applyLang();
  if (ME) { refreshShell(); toast('Language updated', 'info'); }
}
function refreshShell() {
  if (!ME || !$('#app')) return;
  $('#app').innerHTML = '';
  renderShell();
  go({ quiet: true });
}
function skipToMain(e) {
  if (e) e.preventDefault();
  const m = $('#view') || $('#app');
  if (m) { m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: false }); }
  return false;
}
function toggleSidebar(force) {
  const s = $('#sidebar');
  if (!s) return;
  const open = typeof force === 'boolean' ? force : !s.classList.contains('is-open');
  s.classList.toggle('is-open', open);
  document.body.classList.toggle('nav-open', open);
  const scrim = $('#scrim');
  if (scrim) scrim.hidden = !open;
}
function closeSidebar() { toggleSidebar(false); }
function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return false;
}
function toggleSiteMenu() {
  const m = $('#siteMobile');
  if (m) m.hidden = !m.hidden;
}

/* ------------------------------------------------------------------- clock */
function startClock() {
  if (CLOCK) return;
  tick();
  CLOCK = setInterval(tick, 1000);
}
function stopClock() { clearInterval(CLOCK); CLOCK = null; }
function tick() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  $$('[data-clock]').forEach(el => { el.textContent = dateLabel + ' · ' + time; });
  $$('[data-time]').forEach(el => { el.textContent = time; });
  $$('[data-countdown]').forEach(el => {
    const ts = Number(el.dataset.countdown);
    if (!ts) return;
    el.textContent = humanCountdown(ts - Date.now());
  });
  $$('[data-rel]').forEach(el => { el.textContent = relTime(el.dataset.rel); });
  $$('[data-nowline]').forEach(el => {
    if (el.dataset.nowday !== today()) { el.hidden = true; return; }
    const mins = now.getHours() * 60 + now.getMinutes();
    const start = Number(el.dataset.start || 8) * 60;
    const h = Number(el.dataset.hour || 58);
    const top = (mins - start) / 60 * h;
    const total = Number(el.dataset.total || 0);
    if (top < 0 || (total && top > total)) { el.hidden = true; return; }
    el.hidden = false;
    el.style.top = top + 'px';
  });
  if (ME && LAST_DAY && LAST_DAY !== today()) {
    LAST_DAY = today();
    go({ quiet: true });
    toast('A new day — your schedule is up to date', 'info');
  }
  LAST_DAY = today();
}

/* ------------------------------------------------------------------ router */
function applyHash() {}
function go(opts = {}) {
  applyLang();
  closePalette();
  closeSidebar();
  const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const parts = raw.split('/');
  const page = parts[0] || '';
  const arg = parts[1] || null;

  if (!ME) {
    stopClock();
    document.body.classList.remove('is-app', 'nav-open');
    closeSidebar();
    document.title = 'MediLife — Your Health, Organized. Your Care, Connected.';
    if (page === 'login') return renderLogin();
    if (page === 'register') return renderRegister();
    return renderLanding();
  }

  const pages = navPages(ME.role);
  const pageName = pages.includes(page) ? page : 'dashboard';
  if (!document.body.classList.contains('is-app') || !$('#view')) renderShell();
  CURRENT = { page: pageName, arg };
  const view = $('#view');
  view.innerHTML = VIEWS[pageName](arg);
  if (!opts.quiet) {
    view.classList.remove('view-in');
    void view.offsetWidth;
    view.classList.add('view-in');
  }
  setActiveNav(pageName);
  const crumb = $('#crumb');
  if (crumb) crumb.textContent = pageName === 'patients' && arg ? U(arg).name : t(pageName);
  document.title = t(pageName) + ' · MediLife';
  renderBadges();
  startClock();
  const key = pageName + '/' + (arg || '');
  if (!opts.quiet && key !== LAST_ROUTE) window.scrollTo(0, 0);
  LAST_ROUTE = key;
  return true;
}
function setActiveNav(page) {
  $$('.nav-link').forEach(a => a.classList.toggle('is-active', a.dataset.page === page));
}
function renderBadges() {
  if (!ME) return;
  const unread = DB.notifs.filter(n => n.to === ME.id && !n.read).length;
  $$('[data-unread]').forEach(el => { el.hidden = unread === 0; el.textContent = unread > 9 ? '9+' : String(unread); });
  const bell = $('#bellBadge');
  if (bell) { bell.hidden = unread === 0; bell.textContent = unread > 9 ? '9+' : String(unread); }
}
window.addEventListener('hashchange', () => go());
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    if (ME) openPalette();
    return;
  }
  if (e.key === 'Escape') {
    const p = $('#palette');
    if (p && !p.hidden) closePalette();
  }
  if (e.key === '/' && ME && !/input|textarea|select/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    openPalette();
  }
});

/* -------------------------------------------------------------------- shell */
function renderShell() {
  document.body.classList.add('is-app');
  const unread = DB.notifs.filter(n => n.to === ME.id && !n.read).length;
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <a class="brand" href="#/dashboard" onclick="closeSidebar()">
        <span class="brand-mark">${icon('cross')}</span>
        <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
      </a>
      <nav class="nav">
        ${NAV[ME.role].map(g => `<p class="nav-group">${t(g.group)}</p>${g.pages.map(navLink).join('')}`).join('')}
      </nav>
      <div class="side-foot">
        <div class="live-box"><span class="live-dot"></span><div><b>Live sync</b><small data-time>—</small></div></div>
        <a class="side-user" href="#/settings" onclick="closeSidebar()">
          ${avatar(ME, 32)}
          <div><b>${esc(ME.name)}</b><small>${ME.role === 'doctor' ? 'Doctor' : ME.role === 'admin' ? 'Administrator' : 'Patient'}</small></div>
          ${icon('chevron-right')}
        </a>
        <button class="btn btn--ghost btn--block" onclick="logout()">${icon('logout')} ${t('logout')}</button>
      </div>
    </aside>
    <div class="scrim" id="scrim" onclick="closeSidebar()"></div>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-btn only-mobile" aria-label="Open menu" onclick="toggleSidebar()">${icon('menu')}</button>
          <nav class="crumbs" aria-label="Breadcrumb">
            <a class="crumb-root" href="#/dashboard">${esc(DB.clinic.name)}</a><span class="sep">/</span><b id="crumb">${t('dashboard')}</b>
          </nav>
        </div>
        <div class="topbar-right">
          <button class="search-trigger" onclick="openPalette()" aria-label="Search MediLife">${icon('search')}<span>Search…</span><kbd>Ctrl</kbd><kbd>K</kbd></button>
          <span class="clock" data-clock>—</span>
          <a class="bell" href="#/notifications" aria-label="Notifications" title="Notifications">${icon('bell')}<i id="bellBadge" ${unread ? '' : 'hidden'}>${unread > 9 ? '9+' : unread}</i></a>
          <a class="avatar-link" href="#/settings" title="Your account">${avatar(ME, 33)}<span class="only-desktop">${esc(ME.name.split(' ')[0])}</span></a>
        </div>
      </header>
      <main class="view" id="view" tabindex="-1"></main>
      <div class="app-note">${icon('lock')}<span><b>Prototype.</b> Simulated sign-in, fictional records and browser-only storage. Do not enter real patient data.</span></div>
    </div>
  </div>`;
  setActiveNav(CURRENT.page || 'dashboard');
  startClock();
  renderBadges();
}

/* ------------------------------------------------------------------ palette */
let P_ITEMS = [], P_ACTIVE = 0;
function openPalette() {
  if (!ME) return;
  const p = $('#palette');
  if (!p) return;
  p.hidden = false;
  const input = $('#paletteInput');
  input.value = '';
  P_ACTIVE = 0;
  document.body.classList.add('nav-open');
  paletteRender();
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 20);
}
function closePalette() {
  const p = $('#palette');
  if (!p || p.hidden) return;
  p.hidden = true;
  if (!document.body.classList.contains('is-app')) return;
  document.body.classList.remove('nav-open');
}
function paletteItems() {
  const items = [];
  navPages(ME.role).forEach(p => items.push({ group: 'Pages', icon: PAGES[p].icon, title: t(p), hint: 'Open page', href: '#/' + p }));
  if (ME.role === 'doctor') {
    DB.users.filter(u => u.role === 'patient' && allowed(u.id)).forEach(p => items.push({ group: 'Patients', icon: 'user', title: p.name, hint: 'Open dossier · consent granted', href: '#/patients/' + p.id }));
  }
  if (ME.role === 'patient') {
    DB.users.filter(u => u.role === 'doctor' && u.active).forEach(d => items.push({ group: 'Care team', icon: 'stethoscope', title: 'Dr ' + d.name, hint: d.spec + ' · book or message', href: '#/doctors' }));
    DB.docs.filter(d => d.pid === ME.id).forEach(d => items.push({ group: 'Documents', icon: 'folder', title: d.title, hint: d.cat + ' · ' + fmtShort(d.date), href: '#/documents' }));
  }
  if (ME.role !== 'admin') {
    DB.appts.filter(a => a.date >= today() && a.status !== 'cancelled' && (ME.role === 'admin' || a.pid === ME.id || a.did === ME.id))
      .forEach(a => items.push({ group: 'Appointments', icon: 'calendar-check', title: fmtShort(a.date) + ' · ' + a.time, hint: (ME.role === 'patient' ? 'Dr ' + U(a.did).name : U(a.pid).name) + ' — ' + a.reason, href: '#/calendar/' + a.date }));
  }
  if (ME.role === 'admin') {
    DB.users.filter(u => u.role !== 'admin').forEach(u => items.push({ group: 'People', icon: 'user', title: u.name, hint: u.role + ' · ' + (u.active ? 'active' : 'awaiting approval'), href: '#/users' }));
    DB.appts.filter(a => a.date >= today() && a.status !== 'cancelled').forEach(a => items.push({ group: 'Appointments', icon: 'calendar-check', title: fmtShort(a.date) + ' · ' + a.time, hint: U(a.pid).name + ' — ' + a.reason, href: '#/appointments' }));
  }
  return items;
}
function paletteRender() {
  const input = $('#paletteInput');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  P_ITEMS = paletteItems().filter(i => !q || (i.title + ' ' + i.hint + ' ' + i.group).toLowerCase().includes(q)).slice(0, 40);
  P_ACTIVE = Math.min(P_ACTIVE, Math.max(0, P_ITEMS.length - 1));
  const list = $('#paletteList');
  if (!P_ITEMS.length) {
    list.innerHTML = `<li class="palette-empty">No results for “${esc(q)}”.</li>`;
    return;
  }
  let html = '', group = '';
  P_ITEMS.forEach((it, i) => {
    if (it.group !== group) {
      group = it.group;
      html += `<li class="palette-group" aria-hidden="true">${esc(group)}</li>`;
    }
    html += `<li class="palette-item ${i === P_ACTIVE ? 'is-active' : ''}" role="option" aria-selected="${i === P_ACTIVE}" onclick="paletteGo(${i})" onmouseenter="paletteHover(${i})">
      <span class="pi-icon">${icon(it.icon)}</span>
      <span style="min-width:0"><b>${esc(it.title)}</b><small>${esc(it.hint)}</small></span>
      ${icon('arrow-up-right')}
    </li>`;
  });
  list.innerHTML = html;
  const active = list.querySelector('.is-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
function paletteHover(i) {
  P_ACTIVE = i;
  $$('.palette-item').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
}
function paletteKeys(e) {
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); P_ACTIVE = Math.min(P_ACTIVE + 1, P_ITEMS.length - 1); paletteRender(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); P_ACTIVE = Math.max(P_ACTIVE - 1, 0); paletteRender(); }
  else if (e.key === 'Enter') { e.preventDefault(); paletteGo(P_ACTIVE); }
}
function paletteGo(i) {
  const it = P_ITEMS[i];
  if (!it) return;
  closePalette();
  if (location.hash === it.href) go();
  else location.hash = it.href;
}

/* ---------------------------------------------------------------- auth flow */
function demo(e) {
  const f = $('#app form');
  if (!f) return;
  f.email.value = e;
  f.pass.value = 'demo';
}
function doLogin(f) {
  const v = fd(f);
  const u = DB.users.find(x => x.email === String(v.email).trim().toLowerCase() && x.pass === v.pass);
  if (!u) { toast('Email or password is incorrect', 'error'); return false; }
  if (!u.active) { toast('This account is waiting for administrator approval', 'error'); return false; }
  ME = u;
  sessionStorage.setItem('ml.me', u.id);
  log('Signed in');
  LAST_ROUTE = '';
  if (location.hash === '#/dashboard') go();
  else location.hash = '#/dashboard';
  toast('Welcome back, ' + u.name.split(' ')[0]);
  return false;
}
function demoSignIn(email) {
  const u = DB.users.find(x => x.email === email && x.active);
  if (!u) return toast('Demo account unavailable', 'error');
  ME = u;
  sessionStorage.setItem('ml.me', u.id);
  log('Demo sign-in');
  LAST_ROUTE = '';
  if (location.hash === '#/dashboard') go();
  else location.hash = '#/dashboard';
  toast('Exploring as ' + (u.role === 'doctor' ? 'Dr ' + u.name : u.name));
}
function logout() {
  if (ME) log('Signed out');
  ME = null;
  sessionStorage.removeItem('ml.me');
  closeDialog();
  closePalette();
  stopClock();
  LAST_ROUTE = '';
  if (location.hash) location.hash = '';
  else go();
  toast('You are signed out', 'info');
}
function doReg(f) {
  const v = fd(f);
  const email = String(v.email).trim().toLowerCase();
  if (DB.users.some(u => u.email === email)) { toast('An account already uses this email', 'error'); return false; }
  DB.users.push({ id: uid('p'), role: 'patient', name: v.name.trim(), email, pass: v.pass, active: false, phone: '', emergency: '', dob: '', blood: '', allergies: [], conditions: [], access: [] });
  DB.users.filter(u => u.role === 'admin').forEach(a => notify(a.id, 'Registration request: ' + v.name.trim()));
  log('Registration requested');
  save();
  location.hash = '#/login';
  toast('Request sent — an administrator will approve it', 'info');
  return false;
}
function needConsentNote() {
  return `<div class="alert">${icon('lock')}<span>Clinical notes require patient consent. You only see records for patients who granted access.</span></div>`;
}

/* ------------------------------------------------------------------- views */
function dashboard() {
  const isPatient = ME.role === 'patient';
  const isDoctor = ME.role === 'doctor';
  const mine = myAppts();
  const upcoming = mine.filter(a => ['pending', 'confirmed'].includes(a.status) && a.date >= today()).sort((a, b) => apTs(a) - apTs(b));
  const unread = DB.notifs.filter(n => n.to === ME.id && !n.read).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const hello = isDoctor ? 'Dr ' + ME.name.split(' ').slice(-1)[0] : ME.name.split(' ')[0];
  const todayList = mine.filter(a => a.date === today() && a.status !== 'cancelled').sort((a, b) => apTs(a) - apTs(b));
  const pending = mine.filter(a => a.status === 'pending' && a.date >= today());
  const doctors = DB.users.filter(u => u.role === 'doctor' && u.active);

  let sub;
  if (isPatient) {
    sub = fmtLong(today()) + (upcoming[0] ? ' · next visit ' + relDay(upcoming[0].date).toLowerCase() + ' at ' + upcoming[0].time : ' · no upcoming visits scheduled');
  } else if (isDoctor) {
    sub = fmtLong(today()) + ' · ' + todayList.length + ' appointment' + (todayList.length === 1 ? '' : 's') + ' today · ' + pending.length + ' awaiting confirmation';
  } else {
    sub = fmtLong(today()) + ' · ' + DB.users.filter(u => u.role === 'patient').length + ' patients · ' + doctors.length + ' doctors · ' + DB.appts.length + ' visits on record';
  }

  const actions = isPatient
    ? `${liveChip()}<button class="btn btn--primary" onclick="bookForm('${ME.id}')">${icon('plus')} Book appointment</button><button class="btn btn--outline" onclick="uploadDialog('${ME.id}')">${icon('upload')} Upload document</button>`
    : `${liveChip()}<a class="btn btn--outline" href="#/calendar">${icon('calendar')} Open calendar</a>` +
      (ME.role === 'admin' ? `<a class="btn btn--primary" href="#/users">${icon('user')} Manage accounts</a>` : '');

  let body = pageHead(greet + ', ' + esc(hello), esc(sub), actions);

  if (isPatient) {
    const next = upcoming[0];
    if (next) {
      const doc = U(next.did);
      body += `<section class="next-card">
        <div class="next-main">
          <div>
            <span class="next-eyebrow">Next appointment</span>
            <h2>${fmtLong(next.date)}</h2>
            <p>${next.time} · ${esc(next.reason)} · ${esc(doc.room || 'Room assigned on arrival')}</p>
            <div class="next-person">${avatar(doc, 46)}<div><b>Dr ${esc(doc.name)}</b><small>${esc(doc.spec)}${doc.room ? ' · ' + esc(doc.room) : ''}</small></div>${statusPill(next.status)}</div>
            <div class="next-actions">
              <button class="btn btn--on-dark" onclick="bookForm('${ME.id}','${next.did}','${next.id}')">${icon('edit')} Reschedule</button>
              <button class="btn btn--on-dark" onclick="msgForm('${next.did}')">${icon('message')} Message</button>
              <a class="btn btn--on-dark" href="#/calendar/${next.date}">${icon('calendar')} In calendar</a>
            </div>
          </div>
          <div class="countdown"><small>Starts in</small><b data-countdown="${apTs(next)}">—</b></div>
        </div>
        <div class="next-side">
          <span>Need to cancel? <b>Clinic rule: at least 24 h before</b></span>
          <span>Emergency contact: <b>${esc(ME.emergency || 'not set')}</b></span>
        </div>
      </section>`;
    }

    const activeMeds = DB.meds.filter(m => m.pid === ME.id && m.end >= today());
    const docs = DB.docs.filter(d => d.pid === ME.id).sort((a, b) => b.date.localeCompare(a.date));
    body += `<div class="grid grid--4" style="margin-top:16px">
      ${statCard({ iconName: 'calendar-check', tone: 'teal', value: upcoming.length, label: 'Upcoming visits', hint: upcoming[0] ? relDay(upcoming[0].date) : 'None', bars: miniBars(last7(a => a.pid === ME.id && ['pending', 'confirmed'].includes(a.status))) })}
      ${statCard({ iconName: 'bell', tone: 'amber', value: unread, label: 'Unread notifications', hint: unread ? 'Needs a look' : 'All read' })}
      ${statCard({ iconName: 'pill', tone: 'violet', value: activeMeds.length, label: 'Active treatments', hint: 'Prescribed by your doctor' })}
      ${statCard({ iconName: 'folder', tone: 'blue', value: docs.length, label: 'Documents', hint: 'Lab, imaging, prescriptions' })}
    </div>`;

    const myDocs = docs.slice(0, 4);
    body += `<div class="dash-grid" style="margin-top:16px">
      <div class="dash-col">
        ${panel({
          title: 'Upcoming appointments',
          sub: 'Your next visits across the clinic',
          head: linkTo('#/calendar', 'Open calendar'),
          body: upcoming.length ? upcoming.slice(0, 4).map(a => apptCard(a, { actions: false })).join('') : emptyState('calendar', 'Nothing booked', 'Book a visit with your care team whenever you are ready.', `<button class="btn btn--primary btn--sm" onclick="bookForm('${ME.id}')">Book appointment</button>`)
        })}
        ${panel({
          title: 'Recent documents',
          sub: 'Shared by your care team',
          head: linkTo('#/documents', 'All documents'),
          body: myDocs.length ? `<ul class="list-clean">${myDocs.map(d => `<li><a class="list-row" href="#/documents">${icon(docIcon(d.cat))}<div><b>${esc(d.title)}</b><small>${esc(d.cat)} · ${fmtShort(d.date)}</small></div>${icon('chevron-right')}</a></li>`).join('')}</ul>` : emptyState('folder', 'No documents yet', 'Documents your clinic shares will appear here.')
        })}
      </div>
      <div class="dash-col">
        ${panel({
          title: 'Care team',
          sub: 'Doctors with access to your dossier',
          head: linkTo('#/doctors', 'Find a doctor'),
          body: doctors.filter(d => (ME.access || []).includes(d.id)).length
            ? `<ul class="list-clean">${doctors.filter(d => (ME.access || []).includes(d.id)).map(d => `<li><div class="list-row" style="cursor:default">${avatar(d, 34)}<div><b>Dr ${esc(d.name)}</b><small>${esc(d.spec)} · ${esc(d.room)}</small></div><button class="btn btn--ghost btn--sm" onclick="msgForm('${d.id}')">${icon('message')} Message</button></div></li>`).join('')}</ul>`
            : emptyState('stethoscope', 'No access granted', 'Choose a doctor in your dossier to share your record.')
        })}
        ${panel({
          title: 'Treatments',
          sub: 'Active medications and reminders',
          head: linkTo('#/meds', 'Manage'),
          body: activeMeds.length ? activeMeds.map(m => `<div class="med-row"><span class="med-icon">${icon('pill')}</span><div style="min-width:0;flex:1"><b>${esc(m.name)}</b><small>${esc(m.dose)}</small><div class="progress"><i style="width:${medProgress(m)}%"></i></div></div><button class="reminder-toggle ${m.remind ? 'is-on' : ''}" onclick="toggleRem('${m.id}')"><span class="dot"></span>${m.remind ? 'On' : 'Off'}</button></div>`).join('') : emptyState('pill', 'No active treatment', 'Prescriptions from your doctor will show up here.')
        })}
        ${panel({
          title: 'Quick actions',
          body: `<div class="quick-grid">
            <button class="quick" onclick="bookForm('${ME.id}')">${icon('plus')} Book a visit<span>Next free slot</span></button>
            <a class="quick" href="#/documents">${icon('upload')} Documents<span>Preview & download</span></a>
            <a class="quick" href="#/doctors">${icon('stethoscope')} Care team<span>Message a doctor</span></a>
            <a class="quick" href="#/calendar">${icon('calendar')} Calendar<span>See your week</span></a>
          </div>`
        })}
      </div>
    </div>`;
  }

  if (isDoctor) {
    const consented = DB.users.filter(u => u.role === 'patient' && allowed(u.id));
    const completedMonth = mine.filter(a => a.status === 'completed' && a.date >= monthStart()).length;
    const feed = DB.audit.slice(0, 6);
    body += `<div class="grid grid--4" style="margin-top:16px">
      ${statCard({ iconName: 'calendar-check', tone: 'teal', value: todayList.length, label: 'Visits today', hint: todayList[0] ? 'First at ' + todayList[0].time : 'Free day' })}
      ${statCard({ iconName: 'bell', tone: 'amber', value: pending.length, label: 'Awaiting confirmation', hint: pending.length ? 'Action needed' : 'All clear' })}
      ${statCard({ iconName: 'users', tone: 'blue', value: consented.length, label: 'Patients under care', hint: 'With consent on file' })}
      ${statCard({ iconName: 'check', tone: 'green', value: completedMonth, label: 'Completed this month', hint: MON3[new Date().getMonth()] })}
    </div>
    <div class="dash-grid" style="margin-top:16px">
      <div class="dash-col">
        ${panel({
          title: 'Today at the clinic',
          sub: fmtLong(today()),
          head: linkTo('#/calendar', 'Full calendar'),
          body: todayList.length ? todayList.map(a => apptCard(a)).join('') : emptyState('calendar', 'No visits today', 'Enjoy the breathing room — your next appointment is on the calendar.')
        })}
        ${panel({
          title: 'Pending requests',
          sub: 'Confirm or release slots for waiting patients',
          head: pending.length ? `<span class="pill pill--pending">${pending.length} waiting</span>` : '',
          body: pending.length ? pending.map(a => apptCard(a, { actions: false }) + `<div style="display:flex;gap:6px;justify-content:flex-end;margin:-6px 0 10px">${apptButtons(a)}</div>`).join('') : emptyState('check', 'No requests waiting', 'New booking requests will appear here in real time.')
        })}
      </div>
      <div class="dash-col">
        ${panel({
          title: 'Live activity',
          sub: 'Actions across the clinic',
          head: `<span class="live-chip"><span class="live-dot"></span>Live</span>`,
          body: feed.length ? `<div class="feed">${feed.map(a => `<div class="feed-item"><span class="feed-dot"></span><div><p>${esc(a.a)}</p><small class="mut">${esc(a.by)}</small></div><time data-rel="${esc(a.ts)}">${relTime(a.ts)}</time></div>`).join('')}</div>` : emptyState('activity', 'No activity yet', 'Actions appear here as the clinic works.')
        })}
        ${panel({
          title: 'Quick actions',
          body: `<div class="quick-grid">
            <a class="quick" href="#/patients">${icon('users')} Patients<span>Consent & dossiers</span></a>
            <a class="quick" href="#/calendar">${icon('calendar')} Calendar<span>Today, week, month</span></a>
            <a class="quick" href="#/documents">${icon('folder')} Documents<span>Review uploads</span></a>
            <a class="quick" href="#/notifications">${icon('bell')} Inbox<span>${unread} unread</span></a>
          </div>`
        })}
        ${panel({
          title: 'Follow-up needed',
          sub: 'Missed visits in the last 30 days',
          body: (() => {
            const missed = DB.appts.filter(a => a.status === 'missed' && a.did === ME.id && dayDiff(a.date) >= -30);
            return missed.length ? missed.map(a => `<a class="list-row" href="#/patients/${a.pid}">${avatar(U(a.pid), 30)}<div><b>${esc(U(a.pid).name)}</b><small>${fmtShort(a.date)} · ${esc(a.reason)}</small></div>${icon('chevron-right')}</a>`).join('') : emptyState('check', 'No missed visits', 'Nice — every patient showed up recently.');
          })()
        })}
      </div>
    </div>`;
  }

  if (ME.role === 'admin') {
    const patients = DB.users.filter(u => u.role === 'patient');
    const pendingUsers = DB.users.filter(u => !u.active);
    const stats = s => DB.appts.filter(a => a.status === s).length;
    const feed = DB.audit.slice(0, 6);
    body += `<div class="grid grid--4" style="margin-top:16px">
      ${statCard({ iconName: 'users', tone: 'teal', value: patients.length, label: 'Patients', hint: patients.filter(p => p.active).length + ' active' })}
      ${statCard({ iconName: 'stethoscope', tone: 'blue', value: doctors.length, label: 'Doctors', hint: 'Across ' + new Set(doctors.map(d => d.spec)).size + ' specialties' })}
      ${statCard({ iconName: 'calendar-check', tone: 'violet', value: DB.appts.length, label: 'Appointments', hint: stats('pending') + ' pending' })}
      ${statCard({ iconName: 'alert', tone: 'amber', value: stats('missed'), label: 'No-shows', hint: 'Follow-up recommended' })}
    </div>
    <div class="dash-grid" style="margin-top:16px">
      <div class="dash-col">
        ${panel({
          title: 'Pending appointments',
          sub: 'Requests waiting for clinic confirmation',
          head: linkTo('#/appointments', 'All appointments'),
          body: stats('pending') ? DB.appts.filter(a => a.status === 'pending').sort((a, b) => apTs(a) - apTs(b)).map(a => `<div class="list-row" style="cursor:default;align-items:center">${avatar(U(a.pid), 32)}<div style="min-width:0;flex:1"><b>${esc(U(a.pid).name)}</b><small>${fmtShort(a.date)} ${a.time} · Dr ${esc(U(a.did).name)} · ${esc(a.reason)}</small></div>${statusPill(a.status)}<button class="btn btn--primary btn--sm" onclick="setStatus('${a.id}','confirmed')">Confirm</button></div>`).join('') : emptyState('check', 'Nothing pending', 'Every request has been handled.')
        })}
        ${panel({
          title: 'Clinic activity',
          sub: 'Doctors, patients and administrators',
          head: linkTo('#/audit', 'Audit log'),
          body: feed.length ? `<div class="feed">${feed.map(a => `<div class="feed-item"><span class="feed-dot"></span><div><p>${esc(a.a)}</p><small class="mut">${esc(a.by)}</small></div><time data-rel="${esc(a.ts)}">${relTime(a.ts)}</time></div>`).join('')}</div>` : emptyState('activity', 'No activity yet', 'Actions appear here as the clinic works.')
        })}
      </div>
      <div class="dash-col">
        ${panel({
          title: 'Registration requests',
          sub: pendingUsers.length ? pendingUsers.length + ' account(s) waiting' : 'All accounts reviewed',
          body: pendingUsers.length ? pendingUsers.map(u => `<div class="list-row" style="cursor:default">${avatar(u, 32)}<div style="min-width:0"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div><button class="btn btn--primary btn--sm" onclick="approveUser('${u.id}')">Approve</button></div>`).join('') : emptyState('user', 'No pending requests', 'New patient registrations land here.')
        })}
        ${panel({
          title: 'This week',
          sub: 'Visits booked per day',
          body: `<div class="bar-list">${weekBars()}</div>
            <div class="divider"></div>
            <div class="row" style="gap:10px">
              <div><div class="stat-value" style="font-size:1.3rem">${stats('completed')}</div><div class="hint">Completed</div></div>
              <div><div class="stat-value" style="font-size:1.3rem">${stats('cancelled')}</div><div class="hint">Cancelled</div></div>
              <div><div class="stat-value" style="font-size:1.3rem">${completionRate()}%</div><div class="hint">Completion</div></div>
            </div>`
        })}
        ${panel({
          title: 'Quick actions',
          body: `<div class="quick-grid">
            <a class="quick" href="#/users">${icon('user')} Accounts<span>Roles & approvals</span></a>
            <a class="quick" href="#/appointments">${icon('calendar-check')} Visits<span>Track every booking</span></a>
            <a class="quick" href="#/schedules">${icon('clock')} Schedules<span>Doctor hours</span></a>
            <a class="quick" href="#/stats">${icon('chart')} Reports<span>Clinic performance</span></a>
          </div>`
        })}
      </div>
    </div>`;
  }

  return body;
}

function patients(id) {
  if (id) return dossierView(id);
  const list = DB.users.filter(u => u.role === 'patient' && u.active);
  const rows = list.map(p => {
    const consent = allowed(p.id);
    return `<tr data-q="${esc((p.name + ' ' + p.email + ' ' + p.conditions.join(' ') + ' ' + p.phone).toLowerCase())}">
      <td><div class="name-cell">${avatar(p, 34)}<div><b>${esc(p.name)}</b><small>${esc(p.email)}</small></div></div></td>
      <td>${esc(p.conditions.join(', ') || '—')}<br><span class="hint tiny">${esc(p.allergies.join(', ') || 'no allergies recorded')}</span></td>
      <td>${consent ? '<span class="pill pill--completed"><span class="dot"></span>Consent</span>' : '<span class="pill pill--cancelled"><span class="dot"></span>No access</span>'}</td>
      <td class="right">${consent ? `<a class="btn btn--outline btn--sm" href="#/patients/${p.id}">Open dossier</a>` : `<span class="hint tiny">Request consent from the patient</span>`}</td>
    </tr>`;
  }).join('');
  return pageHead('Patients', list.filter(p => allowed(p.id)).length + ' with consent · ' + list.length + ' active patients in the clinic', liveChip()) +
    `<div class="card">
      ${needConsentNote()}
      <div class="toolbar" style="margin-top:14px"><label class="search-field" style="max-width:340px;margin:0"><span class="input-wrap">${icon('search')}<input class="input" type="search" placeholder="Search patients, conditions, phone…" oninput="filterCards(this)"></span></label></div>
      <div class="table-wrap"><table><thead><tr><th>Patient</th><th>Clinical summary</th><th>Access</th><th class="right">Dossier</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No patients yet.</td></tr>'}</tbody></table></div>
    </div>`;
}
function dossier() { return dossierView(ME.id); }
function dossierView(pid) {
  if (!allowed(pid)) {
    return `<a class="breadcrumb-back" href="#/patients">${icon('chevron-left')} Back to patients</a>` +
      pageHead('Dossier unavailable', 'This record is protected by patient consent') +
      `<div class="card">${emptyState('lock', 'Access denied', 'This patient has not shared their dossier with you. Ask them to grant access from their account.', '<a class="btn btn--outline btn--sm" href="#/patients">Back to patients</a>')}</div>`;
  }
  const p = U(pid);
  const mine = ME.role === 'patient';
  const isDoc = ME.role === 'doctor';
  if (isDoc && !VIEWED.has(pid)) { VIEWED.add(pid); log('Viewed dossier of ' + p.name); }
  const appts = DB.appts.filter(a => a.pid === pid);
  const docs = DB.docs.filter(d => d.pid === pid).sort((a, b) => b.date.localeCompare(a.date));
  const meds = DB.meds.filter(m => m.pid === pid);
  const doctorList = DB.users.filter(u => u.role === 'doctor' && u.active);
  const age = ageOf(p.dob);

  const events = [];
  appts.filter(a => a.status === 'completed').forEach(a => events.push({ ts: apTs(a), icon: 'stethoscope', title: 'Consultation — ' + a.reason, sub: (a.dx ? a.dx + ' · ' : '') + 'Dr ' + U(a.did).name }));
  docs.forEach(d => events.push({ ts: parseD(d.date).getTime(), icon: 'folder', title: d.cat + ' — ' + d.title, sub: 'Dr ' + U(d.by).name + ' · ' + fmtShort(d.date) }));
  meds.forEach(m => events.push({ ts: parseD(m.start).getTime(), icon: 'pill', title: 'Started ' + m.name, sub: m.dose }));
  appts.filter(a => a.date >= today() && a.status !== 'cancelled').forEach(a => events.push({ ts: apTs(a), icon: 'calendar', title: 'Upcoming — ' + a.reason, sub: fmtLong(a.date) + ' at ' + a.time + ' · Dr ' + U(a.did).name }));
  const timeline = events.sort((a, b) => b.ts - a.ts).slice(0, 8);

  return `${isDoc ? `<a class="breadcrumb-back" href="#/patients">${icon('chevron-left')} Back to patients</a>` : ''}
  <div class="page-head">
    <div class="profile-head">
      ${avatar(p, 62)}
      <div>
        <h1>${esc(p.name)}</h1>
        <div class="meta">
          ${p.dob ? `<span class="pill pill--neutral">${age} years</span>` : ''}
          ${p.blood ? `<span class="pill pill--neutral">${esc(p.blood)}</span>` : ''}
          ${(p.conditions || []).map(c => `<span class="pill pill--teal">${esc(c)}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="page-head-actions">
      ${mine ? `<button class="btn btn--outline" onclick="window.print()">${icon('print')} Print / PDF</button>` : '<span class="pill pill--completed"><span class="dot"></span>Consent verified</span>'}
    </div>
  </div>
  <div class="grid grid--2">
    <div class="stack">
      <div class="emergency">
        <h3>${icon('alert')} Emergency card</h3>
        <p>${esc(p.allergies.length ? 'Allergies: ' + p.allergies.join(', ') : 'No known allergies recorded')}${p.conditions.length ? ' · ' + esc(p.conditions.join(', ')) : ''}</p>
        <div class="em-grid">
          <div><small>Blood group</small><b>${esc(p.blood || 'Not recorded')}</b></div>
          <div><small>Emergency contact</small><b>${esc(p.emergency || 'Not recorded')}</b></div>
          <div><small>Phone</small><b>${esc(p.phone || 'Not recorded')}</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${mine ? 'Your details' : 'Patient details'}</h2><p>Contact information used by the clinic</p></div></div>
        ${mine ? `<form onsubmit="return saveProfile(this)"><div class="form-grid">
            <label class="field"><span>Full name</span><input class="input" name="name" value="${esc(p.name)}" required></label>
            <label class="field"><span>Phone</span><input class="input" name="phone" value="${esc(p.phone || '')}" placeholder="+216 …"></label>
            <label class="field span-2"><span>Emergency contact</span><input class="input" name="emergency" value="${esc(p.emergency || '')}" placeholder="Name — phone"></label>
          </div><div class="form-actions"><button class="btn btn--primary btn--sm">Save changes</button><span class="hint">Email ${esc(p.email)}</span></div></form>`
        : `<dl class="kv"><div><dt>Email</dt><dd>${esc(p.email)}</dd></div><div><dt>Phone</dt><dd>${esc(p.phone || '—')}</dd></div><div><dt>Emergency contact</dt><dd>${esc(p.emergency || '—')}</dd></div><div><dt>Date of birth</dt><dd>${p.dob ? fmtLong(p.dob) : '—'}</dd></div></dl>`}
      </div>
      ${mine ? `<div class="card">
        <div class="card-head"><div><h2>Who can access my dossier</h2><p>You control consent — revoke it at any time</p></div>${icon('lock')}</div>
        ${doctorList.map(d => `<label class="check" style="margin-bottom:7px"><input type="checkbox" ${p.access.includes(d.id) ? 'checked' : ''} onchange="consentDid('${d.id}',this.checked)"> <span><b>Dr ${esc(d.name)}</b> · ${esc(d.spec)}</span></label>`).join('')}
        <p class="hint" style="margin-top:10px">Doctors without consent cannot open your dossier or clinical notes.</p>
      </div>` : `<div class="card"><div class="card-head"><div><h2>Access & consent</h2><p>Patient-controlled</p></div>${icon('shield')}</div>
        <p class="hint">Consent granted on file. Access to this dossier is written to the audit log. Clinical notes remain editable only by the treating doctor.</p>
        <div class="role-note">${icon('lock')} Administrator accounts never see clinical notes or documents.</div>
      </div>`}
    </div>
    <div class="stack">
      ${isDoc ? consultTools(pid) : ''}
      <div class="card">
        <div class="card-head"><div><h2>Health timeline</h2><p>Consultations, documents and treatments</p></div></div>
        <div class="timeline">${timeline.length ? timeline.map(e => `<div class="tl-item"><span class="tl-icon">${icon(e.icon)}</span><div class="tl-body"><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></div></div>`).join('') : emptyState('activity', 'No history yet', 'Visits and documents will build this timeline.')}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>Documents</h2><p>${docs.length} on file</p></div>${mine ? `<a class="link" href="#/documents">Open ${icon('arrow-right')}</a>` : ''}</div>
        ${docs.length ? `<ul class="list-clean">${docs.slice(0, 5).map(d => `<li><div class="list-row">${icon(docIcon(d.cat))}<div style="min-width:0"><b>${esc(d.title)}</b><small>${esc(d.cat)} · ${fmtShort(d.date)}</small></div><button class="btn btn--ghost btn--sm" onclick="previewDoc('${d.id}')">View</button></div></li>`).join('')}</ul>` : emptyState('folder', 'No documents', 'Uploads from the care team appear here.')}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>Medications</h2><p>${meds.length} prescribed</p></div>${mine ? `<a class="link" href="#/meds">Manage ${icon('arrow-right')}</a>` : ''}</div>
        ${meds.length ? meds.map(m => `<div class="med-row"><span class="med-icon">${icon('pill')}</span><div style="min-width:0;flex:1"><b>${esc(m.name)}</b><small>${esc(m.dose)} · until ${fmtShort(m.end)}</small></div></div>`).join('') : emptyState('pill', 'No treatment', 'No medication is currently prescribed.')}
      </div>
      ${isDoc ? '' : `<div class="card"><div class="card-head"><div><h2>Consultation notes</h2><p>Shared by your doctors</p></div></div>
        ${appts.filter(a => a.note).length ? appts.filter(a => a.note).map(a => `<div class="list-row" style="align-items:flex-start;cursor:default"><div><b>${fmtShort(a.date)} · ${esc(a.dx || 'Consultation')}</b><small>${esc(a.note)}</small><small class="mut">Dr ${esc(U(a.did).name)}</small></div></div>`).join('') : '<p class="hint">No consultation notes yet.</p>'}
      </div>`}
    </div>
  </div>`;
}
function consultTools(pid) {
  const mine = DB.appts.filter(a => a.pid === pid && a.did === ME.id && a.status !== 'cancelled');
  return `<div class="card">
    <div class="card-head"><div><h2>Consultation</h2><p>Notes visible to this patient</p></div>${icon('stethoscope')}</div>
    ${mine.length ? `<form onsubmit="return saveNote(this)"><div class="form-grid">
        <label class="field span-2"><span>Appointment</span><select class="select" name="id">${mine.map(a => `<option value="${a.id}">${fmtShort(a.date)} ${a.time} — ${esc(a.reason)}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Diagnosis</span><input class="input" name="dx" value="${esc(mine[0].dx || '')}" placeholder="Working diagnosis"></label>
        <label class="field span-2"><span>Notes & follow-up plan</span><textarea class="textarea" name="note" placeholder="Observations, treatment, follow-up…">${esc(mine[0].note || '')}</textarea></label>
      </div><div class="form-actions"><button class="btn btn--primary btn--sm">Save note</button></div></form>` : '<p class="hint">No appointment with this patient yet.</p>'}
    <div class="divider"></div>
    <div class="card-head"><div><h2>Prescription</h2><p>Adds to the patient dossier and documents</p></div></div>
    <form onsubmit="return prescribe(this,'${pid}')"><div class="form-grid">
      <label class="field"><span>Medication</span><input class="input" name="name" required placeholder="e.g. Amlodipine"></label>
      <label class="field"><span>Dosage</span><input class="input" name="dose" required placeholder="5 mg · once daily"></label>
      <label class="field"><span>Start</span><input class="input" type="date" name="start" value="${today()}" required></label>
      <label class="field"><span>End</span><input class="input" type="date" name="end" value="${iso(new Date(Date.now() + 30 * 864e5))}" required></label>
    </div><div class="form-actions"><button class="btn btn--outline btn--sm">${icon('plus')} Prescribe</button></div></form>
    <div class="divider"></div>
    <h3 style="font-size:.9rem;margin:0 0 8px">Allergies</h3>
    <div class="tags" style="margin-bottom:10px">${(U(pid).allergies.length ? U(pid).allergies : ['none recorded']).map(a => `<span class="tag">${esc(a)}</span>`).join('')}</div>
    <form onsubmit="return addAllergy(this,'${pid}')" class="row"><label class="field"><span>Add allergy</span><input class="input" name="a" placeholder="e.g. Latex" required></label><button class="btn btn--outline btn--sm shrink">Add</button></form>
  </div>`;
}
function documents() {
  const cats = ['Prescription', 'Laboratory', 'Certificate', 'Imaging', 'Consultation summary'];
  const list = DB.docs.filter(d => ME.role !== 'admin' && allowed(d.pid)).sort((a, b) => b.date.localeCompare(a.date));
  const shown = DOC_CAT ? list.filter(d => d.cat === DOC_CAT) : list;
  return pageHead('Documents', list.length + ' documents shared across your care' + (ME.role === 'doctor' ? ' — only for patients who granted consent' : ''), `${liveChip()}<button class="btn btn--primary" onclick="uploadDialog('${ME.id}')">${icon('upload')} Upload document</button>`) +
    `<div class="card">
      <div class="toolbar">
        <label class="search-field" style="margin:0"><span class="input-wrap">${icon('search')}<input class="input" type="search" placeholder="Search title, category, patient…" oninput="filterCards(this)"></span></label>
        <div class="chips">
          <button class="chip ${DOC_CAT === '' ? 'is-on' : ''}" onclick="setDocCat('')">All <span class="count">${list.length}</span></button>
          ${cats.map(c => `<button class="chip ${DOC_CAT === c ? 'is-on' : ''}" onclick="setDocCat('${c}')">${esc(c)} <span class="count">${list.filter(d => d.cat === c).length}</span></button>`).join('')}
        </div>
      </div>
      ${shown.length ? `<div class="doc-grid">${shown.map(docCard).join('')}</div>` : emptyState('folder', 'No documents here', 'Uploads and clinic documents will appear in this space.', `<button class="btn btn--primary btn--sm" onclick="uploadDialog('${ME.id}')">Upload a document</button>`)}
    </div>`;
}
function docIcon(cat) {
  return { Prescription: 'pill', Laboratory: 'drop', Certificate: 'shield', Imaging: 'activity', 'Consultation summary': 'file' }[cat] || 'file';
}
function docTone(cat) {
  return { Prescription: 'violet', Laboratory: 'blue', Certificate: 'green', Imaging: 'amber', 'Consultation summary': 'teal' }[cat] || 'teal';
}
function docCard(d) {
  const q = (d.title + ' ' + d.cat + ' ' + d.tags + ' ' + U(d.pid).name).toLowerCase();
  return `<article class="doc-card" data-q="${esc(q)}">
    <div class="doc-top"><span class="doc-icon tone-${docTone(d.cat)}">${icon(docIcon(d.cat))}</span>
      <div style="min-width:0"><div class="doc-title">${esc(d.title)}</div><div class="doc-sub">${esc(U(d.pid).name)} · ${esc(d.cat)}</div></div>
    </div>
    <div class="tags"><span class="tag">v${d.ver}</span>${(d.tags || '').split(',').filter(Boolean).slice(0, 3).map(tg => `<span class="tag">${esc(tg.trim())}</span>`).join('')}</div>
    <div class="doc-meta"><span>${fmtShort(d.date)} · Dr ${esc(U(d.by).name)}</span>
      <div class="doc-actions">
        <button class="btn btn--ghost btn--sm" onclick="previewDoc('${d.id}')">Preview</button>
        <button class="btn btn--outline btn--sm" onclick="downloadDoc('${d.id}')">${icon('download')}</button>
      </div>
    </div>
  </article>`;
}
function doctors() {
  const list = DB.users.filter(u => u.role === 'doctor' && u.active);
  return pageHead('Care team', 'Choose a specialist, check availability and book a free slot', liveChip()) +
    `<div class="grid grid--3">${list.map(d => {
      const free = nextSlots(d.id, 3);
      return `<article class="card">
        <div class="appt-title" style="font-size:1rem">${avatar(d, 48)}<div><b>Dr ${esc(d.name)}</b><div class="hint">${esc(d.spec)}</div></div></div>
        <dl class="kv" style="margin-top:14px">
          <div><dt>Room</dt><dd>${esc(d.room)}</dd></div>
          <div><dt>Hours</dt><dd>${esc(d.hours.start)}–${esc(d.hours.end)}</dd></div>
          <div><dt>Phone</dt><dd>${esc(d.phone)}</dd></div>
        </dl>
        <div class="tags" style="margin-top:12px">${free.length ? free.map(f => `<span class="tag">${fmtShort(f.date)} · ${f.time}</span>`).join('') : '<span class="tag">No openings soon</span>'}</div>
        <div class="form-actions"><button class="btn btn--primary btn--sm" onclick="bookForm('${ME.id}','${d.id}')">${icon('plus')} Book</button><button class="btn btn--outline btn--sm" onclick="msgForm('${d.id}')">${icon('message')} Message</button></div>
      </article>`;
    }).join('')}</div>`;
}
function meds() {
  const list = DB.meds.filter(m => m.pid === ME.id);
  const active = list.filter(m => m.end >= today());
  return pageHead('Medications', active.length + ' active treatment' + (active.length === 1 ? '' : 's') + ' · prescribed by your doctors', liveChip()) +
    (list.length ? `<div class="grid grid--2">${list.map(m => {
      const pct = medProgress(m);
      const days = dayDiff(m.end);
      return `<article class="card">
        <div class="doc-top"><span class="doc-icon tone-violet">${icon('pill')}</span>
          <div style="min-width:0;flex:1"><div class="doc-title">${esc(m.name)}</div><div class="doc-sub">${esc(m.dose)}</div></div>
          <button class="reminder-toggle ${m.remind ? 'is-on' : ''}" onclick="toggleRem('${m.id}')"><span class="dot"></span>${m.remind ? 'Reminder on' : 'Reminder off'}</button>
        </div>
        <div style="margin:14px 0 8px" class="progress"><i style="width:${pct}%"></i></div>
        <div class="doc-meta" style="border:0;padding:0;margin:0"><span>${fmtShort(m.start)} → ${fmtShort(m.end)}</span><span>${days >= 0 ? days + ' day' + (days === 1 ? '' : 's') + ' left' : 'completed'}</span></div>
        <p class="hint" style="margin-top:10px">Prescribed by Dr ${esc(U(m.by).name)}. Questions about your treatment? Contact your doctor — this tool never changes a prescription.</p>
      </article>`;
    }).join('')}</div>` : emptyState('pill', 'No medications', 'Prescriptions from your doctor will appear here.', '<a class="btn btn--outline btn--sm" href="#/doctors">Contact your doctor</a>')) +
    '<div class="role-note" style="margin-top:16px">' + icon('alert') + '<span>Never start, stop or change a treatment on your own. In an emergency, contact your local emergency number.</span></div>';
}
function notifications() {
  const mine = DB.notifs.filter(n => n.to === ME.id);
  const unread = mine.filter(n => !n.read).length;
  const list = NOTIF_FILTER === 'unread' ? mine.filter(n => !n.read) : mine;
  const actions = ME.role === 'admin'
    ? `<button class="btn btn--primary" onclick="announceDialog()">${icon('plus')} Send announcement</button>`
    : `${liveChip()}<button class="btn btn--outline" onclick="markAllRead()">${icon('check')} Mark all read</button>`;
  return pageHead('Notifications', unread + ' unread · clinic updates and messages', actions) +
    `<div class="card">
      <div class="toolbar"><div class="chips">
        <button class="chip ${NOTIF_FILTER === 'all' ? 'is-on' : ''}" onclick="setNotifFilter('all')">All <span class="count">${mine.length}</span></button>
        <button class="chip ${NOTIF_FILTER === 'unread' ? 'is-on' : ''}" onclick="setNotifFilter('unread')">Unread <span class="count">${unread}</span></button>
      </div></div>
      ${list.length ? list.map(n => `<a class="list-row" href="#/notifications" onclick="markNotif('${n.id}');return false" style="align-items:flex-start">
        <span class="doc-icon tone-${n.read ? 'blue' : 'teal'}" style="width:32px;height:32px;border-radius:9px">${icon(n.read ? 'bell' : 'activity')}</span>
        <div style="min-width:0"><b style="font-weight:${n.read ? '500' : '600'}">${esc(n.text)}</b><small>${fmtLong(n.date)} · <span data-rel="${esc(n.date)}">${relTime(n.date)}</span></small></div>
        ${n.read ? '' : '<span class="pill pill--teal" style="margin-left:auto">New</span>'}
      </a>`).join('') : emptyState('bell', 'Nothing here', NOTIF_FILTER === 'unread' ? 'You are all caught up.' : 'Notifications from the clinic will appear here.')}
    </div>`;
}
function calendar(arg) {
  ensureCal();
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    CAL.sel = arg;
    const d = parseD(arg);
    CAL.y = d.getFullYear();
    CAL.m = d.getMonth();
  }
  const L = myAppts().filter(a => !CAL.st || a.status === CAL.st);
  const selList = L.filter(a => a.date === CAL.sel).sort((a, b) => apTs(a) - apTs(b));
  const actions = ME.role === 'patient'
    ? `${liveChip()}<button class="btn btn--primary" onclick="bookForm('${ME.id}')">${icon('plus')} Book appointment</button>`
    : `${liveChip()}<button class="btn btn--outline" onclick="window.print()">${icon('print')} Print</button>`;

  let viewBody;
  if (CAL.v === 'month') viewBody = calMonth(L);
  else if (CAL.v === 'week') viewBody = calWeek(L);
  else viewBody = calDay(L);

  return pageHead('Calendar', ME.role === 'patient' ? 'Your visits, live with the clinic schedule' : 'Every booking across the clinic, updated live', actions) +
    `<div class="cal-layout">
      <section class="card cal-card">
        <div class="cal-head">
          <div style="display:flex;align-items:center;gap:6px">
            <button class="icon-btn icon-btn--boxed" aria-label="Previous" onclick="calShift(-1)">${icon('chevron-left')}</button>
            <strong class="cal-title">${MON[CAL.m]} ${CAL.y}</strong>
            <button class="icon-btn icon-btn--boxed" aria-label="Next" onclick="calShift(1)">${icon('chevron-right')}</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn--outline btn--sm" onclick="calToday()">Today</button>
            <div class="seg">${['month', 'week', 'day'].map(v => `<button class="${CAL.v === v ? 'is-on' : ''}" onclick="setCalView('${v}')">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
          </div>
        </div>
        <div class="toolbar">
          <div class="chips">
            <button class="chip ${CAL.st === '' ? 'is-on' : ''}" onclick="setCalStatus('')">All</button>
            ${['pending', 'confirmed', 'completed', 'missed'].map(s => `<button class="chip ${CAL.st === s ? 'is-on' : ''}" onclick="setCalStatus('${s}')">${s}</button>`).join('')}
          </div>
        </div>
        ${viewBody}
        <div class="cal-legend">
          <span><i class="dot dot--pending"></i> pending</span>
          <span><i class="dot dot--confirmed"></i> confirmed</span>
          <span><i class="dot dot--completed"></i> completed</span>
          <span><i class="dot dot--missed"></i> missed</span>
          <span style="margin-left:auto">${liveChip('Live schedule')}</span>
        </div>
      </section>
      <aside class="card day-panel">
        <div class="day-head">
          <div><h3>${fmtLong(CAL.sel)}</h3><p>${selList.length} appointment${selList.length === 1 ? '' : 's'}</p></div>
          ${ME.role === 'patient' ? `<button class="btn btn--soft btn--sm" onclick="bookForm('${ME.id}')">${icon('plus')} Book</button>` : ''}
        </div>
        <div class="day-list">${selList.length ? selList.map(a => `
          <article class="appt appt--stack">
            <div class="appt-title">${a.time} · ${ME.role === 'patient' ? 'Dr ' + esc(U(a.did).name) : esc(U(a.pid).name)} ${statusPill(a.status)}</div>
            <div class="appt-sub">${esc(a.reason)}</div>
            <div class="appt-meta"><span>${icon('stethoscope')} ${ME.role === 'patient' ? esc(U(a.did).spec) : 'Dr ' + esc(U(a.did).name)}</span></div>
            ${['pending', 'confirmed'].includes(a.status) ? `<div class="appt-actions">${apptButtons(a)}</div>` : ''}
          </article>`).join('') : emptyState('calendar', 'No visits', 'Nothing scheduled on this day.')}</div>
      </aside>
    </div>`;
}
function ensureCal() {
  if (CAL.y === null) { const n = new Date(); CAL.y = n.getFullYear(); CAL.m = n.getMonth(); }
  if (!CAL.sel) CAL.sel = today();
}
function calMonth(L) {
  const first = new Date(CAL.y, CAL.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(CAL.y, CAL.m + 1, 0).getDate();
  const prevDim = new Date(CAL.y, CAL.m, 0).getDate();
  const cells = [];
  for (let i = offset; i > 0; i--) cells.push({ ds: iso(new Date(CAL.y, CAL.m - 1, prevDim - i + 1)), d: prevDim - i + 1, out: true });
  for (let d = 1; d <= dim; d++) cells.push({ ds: iso(new Date(CAL.y, CAL.m, d)), d, out: false });
  let extra = 1;
  while (cells.length % 7) cells.push({ ds: iso(new Date(CAL.y, CAL.m + 1, extra)), d: extra++, out: true });

  return `<div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="cal-dow">${x}</div>`).join('')}
    ${cells.map(c => {
      const items = L.filter(a => a.date === c.ds);
      const dow = parseD(c.ds).getDay();
      return `<button class="cal-day ${c.out ? 'is-out' : ''} ${c.ds === today() ? 'is-today' : ''} ${c.ds === CAL.sel ? 'is-sel' : ''} ${(dow === 0 || dow === 6) ? 'is-weekend' : ''}" onclick="setCalDay('${c.ds}')" aria-label="${fmtLong(c.ds)}${items.length ? ', ' + items.length + ' appointments' : ''}">
        <span class="cal-num">${c.d}</span>
        <span class="cal-dots">${items.slice(0, 4).map(a => `<i class="dot dot--${a.status}"></i>`).join('')}</span>
        ${items.length ? `<span class="cal-mini">${items.slice(0, 2).map(a => `<span>${a.time} ${esc(ME.role === 'patient' ? 'Dr ' + U(a.did).name.split(' ').slice(-1)[0] : U(a.pid).name.split(' ')[0])}</span>`).join('')}</span>` : ''}
      </button>`;
    }).join('')}
  </div>`;
}
function calWeek(L) {
  const base = parseD(CAL.sel);
  const dow = (base.getDay() + 6) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() - dow);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d); });
  return `<div class="week">${days.map(ds => {
    const items = L.filter(a => a.date === ds).sort((a, b) => apTs(a) - apTs(b));
    return `<div class="week-col ${ds === today() ? 'is-today' : ''}">
      <header><b>${DOW3[parseD(ds).getDay()]}</b><span>${parseD(ds).getDate()}</span></header>
      ${items.length ? items.map(a => `<a class="mini-appt is-${a.status}" href="#/calendar/${ds}"><b>${a.time}</b>${esc(ME.role === 'patient' ? 'Dr ' + U(a.did).name : U(a.pid).name)}</a>`).join('') : '<div class="empty-note">—</div>'}
    </div>`;
  }).join('')}</div>`;
}
function calDay(L) {
  const START = 8, END = 19, HOUR = 58;
  const items = L.filter(a => { const m = toM(a.time); return m >= START * 60 && m < END * 60; });
  const shade = (END - START) * HOUR;
  return `<div class="tl-day">
    <div class="tl-day-shade" style="height:${shade}px">
      <div class="tl-hours">${Array.from({ length: END - START }, (_, i) => `<div class="tl-hour"><span>${pad2(START + i)}:00</span></div>`).join('')}</div>
      ${items.map(a => {
        const top = Math.max(0, (toM(a.time) - START * 60) / 60 * HOUR);
        return `<div class="tl-day-block is-${a.status}" style="top:${top}px">
          <b>${a.time} · ${esc(ME.role === 'patient' ? 'Dr ' + U(a.did).name : U(a.pid).name)}</b>
          <span>${esc(a.reason)}</span>
        </div>`;
      }).join('')}
      <div class="tl-now" data-nowline data-nowday="${CAL.sel}" data-start="${START}" data-hour="${HOUR}" data-total="${shade}" ${CAL.sel === today() ? '' : 'hidden'}><span>Now</span></div>
    </div>
  </div>`;
}
function setCalView(v) { CAL.v = v; go({ quiet: true }); }
function setCalStatus(s) { CAL.st = s; go({ quiet: true }); }
function setCalDay(ds) {
  CAL.sel = ds;
  const d = parseD(ds);
  CAL.y = d.getFullYear();
  CAL.m = d.getMonth();
  history.replaceState(null, '', '#/calendar/' + ds);
  go({ quiet: true });
}
function calShift(n) {
  CAL.m += n;
  if (CAL.m < 0) { CAL.m = 11; CAL.y--; }
  if (CAL.m > 11) { CAL.m = 0; CAL.y++; }
  history.replaceState(null, '', '#/calendar');
  go({ quiet: true });
}
function calToday() {
  const n = new Date();
  CAL.sel = today();
  CAL.y = n.getFullYear();
  CAL.m = n.getMonth();
  history.replaceState(null, '', '#/calendar/' + today());
  go({ quiet: true });
}
function settings() {
  const p = ME.prefs || {};
  return pageHead('Settings', 'Profile, language, privacy and demo tools', liveChip()) +
    `<div class="settings-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h2>Profile</h2><p>How the clinic reaches you</p></div>${avatar(ME, 42)}</div>
          <form onsubmit="return saveProfile(this)"><div class="form-grid">
            <label class="field"><span>Full name</span><input class="input" name="name" value="${esc(ME.name)}" required></label>
            <label class="field"><span>Email</span><input class="input" value="${esc(ME.email)}" readonly></label>
            <label class="field"><span>Phone</span><input class="input" name="phone" value="${esc(ME.phone || '')}" placeholder="+216 …"></label>
            <label class="field"><span>Role</span><input class="input" value="${esc(ME.role)}" readonly></label>
            ${ME.role === 'patient' ? `<label class="field span-2"><span>Emergency contact</span><input class="input" name="emergency" value="${esc(ME.emergency || '')}" placeholder="Name — phone"></label>` : ''}
          </div><div class="form-actions"><button class="btn btn--primary btn--sm">Save profile</button><span class="hint">${ME.role === 'doctor' ? esc(ME.spec) : ME.role === 'admin' ? 'Clinic administrator' : 'Patient account'}</span></div></form>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Privacy preferences</h2><p>Control what leaves your workspace</p></div>${icon('shield')}</div>
          <label class="check" style="margin-bottom:8px"><input type="checkbox" ${p.rem !== false ? 'checked' : ''} onchange="setPref('rem',this.checked)"> <span><b>Appointment reminders</b><br><span class="hint">Notify me before upcoming visits</span></span></label>
          <label class="check"><input type="checkbox" ${p.stats ? 'checked' : ''} onchange="setPref('stats',this.checked)"> <span><b>Anonymised statistics</b><br><span class="hint">Help the clinic spot no-show patterns, without identities</span></span></label>
          <div class="divider"></div>
          <div class="form-actions"><button class="btn btn--outline btn--sm" onclick="exportMe()">${icon('download')} Export my data</button><button class="btn btn--danger btn--sm" onclick="resetDemo()">Reset demo data</button></div>
          <p class="hint" style="margin-top:10px">Everything here lives in this browser only. This is a fictional prototype, not a medical record system.</p>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h2>Language</h2><p>Navigation language</p></div>${icon('globe')}</div>
          <div class="lang-grid">${[['en', 'English', 'EN'], ['fr', 'Français', 'FR'], ['ar', 'العربية', 'AR']].map(([code, label, short]) => `<button class="lang-btn ${LANG === code ? 'is-on' : ''}" onclick="setLang('${code}')"><span class="flag">${short}</span>${esc(label)}<span>${LANG === code ? 'Selected' : ''}</span></button>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Account</h2><p>Session and clinic</p></div></div>
          <dl class="kv">
            <div><dt>Clinic</dt><dd>${esc(DB.clinic.name)}</dd></div>
            <div><dt>Hours</dt><dd>${esc(DB.clinic.hours)}</dd></div>
            <div><dt>Phone</dt><dd>${esc(DB.clinic.phone)}</dd></div>
            <div><dt>Mode</dt><dd>Local prototype</dd></div>
          </dl>
          <div class="form-actions" style="margin-top:14px"><button class="btn btn--outline btn--sm" onclick="logout()">${icon('logout')} Sign out</button></div>
        </div>
        <div class="role-note">${icon('lock')} No real patient data should be entered in this prototype. Storage is per browser and not encrypted.</div>
      </div>
    </div>`;
}
function users() {
  const pending = DB.users.filter(u => !u.active);
  const rows = DB.users.map(u => `<tr data-q="${esc((u.name + ' ' + u.email + ' ' + u.role).toLowerCase())}">
    <td><div class="name-cell">${avatar(u, 32)}<div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div></div></td>
    <td><select class="select" onchange="setRole('${u.id}',this.value)" ${u.id === ME.id ? 'disabled' : ''}>${['patient', 'doctor', 'admin'].map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
    <td>${u.active ? '<span class="pill pill--completed"><span class="dot"></span>Active</span>' : '<span class="pill pill--pending"><span class="dot"></span>Pending</span>'}</td>
    <td>${u.role === 'doctor' ? esc(u.spec || '') : u.phone ? esc(u.phone) : '—'}</td>
    <td class="right"><div class="cell-actions">${u.id === ME.id ? '<span class="hint tiny">You</span>' : `<button class="btn btn--${u.active ? 'danger' : 'primary'} btn--sm" onclick="toggleUser('${u.id}')">${u.active ? 'Deactivate' : 'Activate'}</button>`}</div></td>
  </tr>`).join('');
  return pageHead('Users & roles', DB.users.length + ' accounts · ' + pending.length + ' waiting for approval', `${liveChip()}<button class="btn btn--primary" onclick="addUserDialog()">${icon('plus')} Create account</button>`) +
    (pending.length ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>Awaiting approval</h2><p>New registrations do not access clinical data until approved</p></div><span class="pill pill--pending">${pending.length} pending</span></div>
      ${pending.map(u => `<div class="list-row" style="cursor:default">${avatar(u, 32)}<div style="min-width:0"><b>${esc(u.name)}</b><small>${esc(u.email)} · patient registration</small></div><button class="btn btn--primary btn--sm" onclick="approveUser('${u.id}')">Approve</button></div>`).join('')}
    </div>` : '') +
    `<div class="card">
      <div class="toolbar"><label class="search-field" style="margin:0"><span class="input-wrap">${icon('search')}<input class="input" type="search" placeholder="Search people, email, role…" oninput="filterCards(this)"></span></label>
      <span class="hint">Administrators can manage accounts but never see clinical notes.</span></div>
      <div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Details</th><th class="right">Access</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}
function appointments() {
  const counts = s => DB.appts.filter(a => a.status === s).length;
  const list = APPT_FILTER === 'all' ? DB.appts : DB.appts.filter(a => a.status === APPT_FILTER);
  return pageHead('Appointments', DB.appts.length + ' visits on record · ' + counts('pending') + ' waiting for confirmation', liveChip() + `<button class="btn btn--outline" onclick="window.print()">${icon('print')} Print</button>`) +
    `<div class="card">
      <div class="toolbar">
        <label class="search-field" style="margin:0"><span class="input-wrap">${icon('search')}<input class="input" type="search" placeholder="Search patient, doctor, reason…" oninput="filterCards(this)"></span></label>
        <div class="chips">
          <button class="chip ${APPT_FILTER === 'all' ? 'is-on' : ''}" onclick="setApptFilter('all')">All <span class="count">${DB.appts.length}</span></button>
          ${['pending', 'confirmed', 'completed', 'cancelled', 'missed'].map(s => `<button class="chip ${APPT_FILTER === s ? 'is-on' : ''}" onclick="setApptFilter('${s}')">${s} <span class="count">${counts(s)}</span></button>`).join('')}
        </div>
      </div>
      ${list.length ? apptTable(list) : emptyState('calendar', 'No appointments', 'Nothing matches this filter.')}
    </div>`;
}
function schedules() {
  const docs = DB.users.filter(u => u.role === 'doctor');
  const dayLabels = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];
  return pageHead('Doctor schedules', 'Hours drive the bookable slots patients see', liveChip()) +
    docs.map(d => `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><div class="appt-title" style="font-size:1rem">${avatar(d, 40)}<div><b>Dr ${esc(d.name)}</b><div class="hint">${esc(d.spec)}</div></div></div>${d.active ? '<span class="pill pill--completed"><span class="dot"></span>Active</span>' : '<span class="pill pill--cancelled"><span class="dot"></span>Inactive</span>'}</div>
      <form onsubmit="return saveHours(this,'${d.id}')"><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <label class="field"><span>Start</span><input class="input" type="time" name="start" value="${esc(d.hours.start)}" required></label>
        <label class="field"><span>End</span><input class="input" type="time" name="end" value="${esc(d.hours.end)}" required></label>
        <label class="field"><span>Room</span><input class="input" name="room" value="${esc(d.room)}"></label>
      </div>
      <div class="row" style="margin-top:14px">${dayLabels.map(([idx, label]) => `<label class="check shrink" style="padding:7px 10px"><input type="checkbox" name="d${idx}" ${d.hours.days.includes(+idx) ? 'checked' : ''}> ${label}</label>`).join('')}</div>
      <div class="form-actions"><button class="btn btn--primary btn--sm">Save schedule</button><span class="hint">30-minute slots · ${nextSlots(d.id, 1).length ? 'next opening ' + nextSlots(d.id, 1).map(x => fmtShort(x.date) + ' ' + x.time) : 'no openings in 3 weeks'}</span></div>
      </form>
    </div>`).join('');
}
function stats() {
  const total = DB.appts.length || 1;
  const count = s => DB.appts.filter(a => a.status === s).length;
  const docs = DB.users.filter(u => u.role === 'doctor');
  const months = monthlyCounts(6);
  const maxM = Math.max(...months.map(m => m.count), 1);
  return pageHead('Statistics', 'Aggregated clinic activity · no patient identities', liveChip() + `<button class="btn btn--outline" onclick="window.print()">${icon('print')} Print report</button>`) +
    `<div class="grid grid--4" style="margin-bottom:16px">
      ${statCard({ iconName: 'calendar-check', tone: 'teal', value: count('completed'), label: 'Completed visits', hint: count('completed') + '/' + total + ' total' })}
      ${statCard({ iconName: 'check', tone: 'green', value: completionRate() + '%', label: 'Completion rate', bars: miniBars(months.map(m => m.count)) })}
      ${statCard({ iconName: 'alert', tone: 'amber', value: Math.round(count('missed') / total * 100) + '%', label: 'No-show rate', hint: count('missed') + ' missed' })}
      ${statCard({ iconName: 'stethoscope', tone: 'blue', value: docs.length, label: 'Active doctors', hint: docs.reduce((n, d) => n + DB.appts.filter(a => a.did === d.id).length, 0) + ' visits' })}
    </div>
    <div class="grid grid--2">
      <div class="card">
        <div class="card-head"><div><h2>By status</h2><p>All appointments on record</p></div></div>
        <div class="bar-list">${['pending', 'confirmed', 'completed', 'cancelled', 'missed'].map(s => `<div class="bar-item"><div class="bar-top"><span>${s[0].toUpperCase() + s.slice(1)}</span><b>${count(s)}</b></div><div class="bar-track ${s === 'pending' ? 'tone-amber' : s === 'confirmed' ? 'tone-blue' : s === 'completed' ? 'tone-green' : s === 'missed' ? 'tone-red' : ''}"><i style="width:${Math.round(count(s) / total * 100)}%"></i></div></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>Visits per month</h2><p>Last six months</p></div></div>
        <div class="bar-list">${months.map(m => `<div class="bar-item"><div class="bar-top"><span>${m.label}</span><b>${m.count}</b></div><div class="bar-track"><i style="width:${Math.round(m.count / maxM * 100)}%"></i></div></div>`).join('')}</div>
      </div>
      <div class="card" style="grid-column:1/-1">
        <div class="card-head"><div><h2>Doctor workload</h2><p>Appointments per doctor (all statuses)</p></div></div>
        <div class="bar-list">${docs.map(d => { const n = DB.appts.filter(a => a.did === d.id).length; return `<div class="bar-item"><div class="bar-top"><span>Dr ${esc(d.name)} · ${esc(d.spec)}</span><b>${n}</b></div><div class="bar-track"><i style="width:${Math.round(n / total * 100)}%"></i></div></div>`; }).join('')}</div>
        <p class="hint" style="margin-top:14px">Aggregated figures only. Patient identities are never shown in reports.</p>
      </div>
    </div>`;
}
function audit() {
  const rows = DB.audit.slice(0, 200).map(a => `<tr data-q="${esc((a.by + ' ' + a.a).toLowerCase())}">
    <td class="nowrap">${esc(a.ts)}<br><span class="hint tiny" data-rel="${esc(a.ts)}">${relTime(a.ts)}</span></td>
    <td>${esc(a.by)}</td><td>${esc(a.a)}</td>
  </tr>`).join('');
  return pageHead('Audit log', 'Every sensitive action is recorded for accountability', liveChip()) +
    `<div class="card">
      <div class="toolbar"><label class="search-field" style="margin:0"><span class="input-wrap">${icon('search')}<input class="input" type="search" placeholder="Search user or action…" oninput="filterCards(this)"></span></label></div>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No activity recorded.</td></tr>'}</tbody></table></div>
    </div>`;
}

/* ----------------------------------------------------------------- actions */
function saveProfile(f) {
  const v = fd(f);
  ME.name = (v.name || ME.name).trim();
  ME.phone = v.phone || '';
  if (ME.role === 'patient') ME.emergency = v.emergency || '';
  save();
  refreshShell();
  toast('Profile saved');
  return false;
}
function consentDid(did, on) {
  const a = ME.access || (ME.access = []);
  if (on && !a.includes(did)) a.push(did);
  if (!on) ME.access = a.filter(x => x !== did);
  log('Consent ' + (on ? 'granted to ' : 'revoked from ') + U(did).name);
  save();
  toast('Access ' + (on ? 'granted' : 'revoked'), 'info');
  go({ quiet: true });
}
function toggleRem(id) {
  const m = DB.meds.find(x => x.id === id);
  if (!m) return;
  m.remind = !m.remind;
  save();
  go({ quiet: true });
  toast('Reminder ' + (m.remind ? 'on' : 'off'), 'info');
}
function setPref(k, v) {
  ME.prefs = { ...(ME.prefs || {}), [k]: v };
  save();
  toast('Preference saved', 'info');
}
function exportMe() {
  const data = {
    profile: { ...ME, pass: undefined },
    appointments: myAppts(),
    documents: DB.docs.filter(d => d.pid === ME.id).map(({ data, ...r }) => r),
    medications: DB.meds.filter(m => m.pid === ME.id),
    notifications: DB.notifs.filter(n => n.to === ME.id)
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'medilife-data.json';
  a.click();
  log('Data export');
  toast('Export downloaded');
}
function resetDemo() {
  askConfirm({
    title: 'Reset the demo workspace?',
    body: 'All changes made in this browser will be replaced by the original sample clinic. You will be signed out.',
    confirmLabel: 'Reset demo data',
    danger: true,
    onConfirm() {
      DB = Store.reset();
      VIEWED.clear();
      ME = null;
      sessionStorage.removeItem('ml.me');
      LAST_ROUTE = '';
      if (location.hash) location.hash = '';
      else go();
      toast('Demo data restored', 'info');
    }
  });
}
function setDocCat(cat) { DOC_CAT = cat; go({ quiet: true }); }
function setApptFilter(f) { APPT_FILTER = f; go({ quiet: true }); }
function setNotifFilter(f) { NOTIF_FILTER = f; go({ quiet: true }); }
function markNotif(id) {
  const n = DB.notifs.find(x => x.id === id);
  if (!n || n.read) return;
  n.read = true;
  save();
  go({ quiet: true });
}
function markAllRead() {
  DB.notifs.forEach(n => { if (n.to === ME.id) n.read = true; });
  save();
  go({ quiet: true });
  toast('All notifications marked read');
}
function toggleUser(id) {
  const u = U(id);
  if (u.id === ME.id) return toast('You cannot deactivate your own account', 'error');
  u.active = !u.active;
  log('User ' + u.name + ' active=' + u.active);
  save();
  go({ quiet: true });
  toast(u.name + (u.active ? ' activated' : ' deactivated'), u.active ? 'ok' : 'info');
}
function approveUser(id) {
  const u = U(id);
  u.active = true;
  notify(u.id, 'Your account has been approved by the clinic.');
  log('Approved ' + u.name);
  save();
  go({ quiet: true });
  toast(u.name + ' approved');
}
function setRole(id, r) {
  const u = U(id);
  if (u.id === ME.id) return toast('You cannot change your own role', 'error');
  u.role = r;
  log('Role ' + u.name + ' → ' + r);
  save();
  go({ quiet: true });
  toast('Role updated');
}
function saveHours(f, id) {
  const v = fd(f);
  const d = U(id);
  if (v.start >= v.end) { toast('End time must be after start time', 'error'); return false; }
  d.hours = { start: v.start, end: v.end, days: [0, 1, 2, 3, 4, 5, 6].filter(i => v['d' + i]) };
  d.room = v.room;
  log('Schedule updated for ' + d.name);
  save();
  toast('Schedule saved');
  go({ quiet: true });
  return false;
}
function saveNote(f) {
  const v = fd(f);
  const a = DB.appts.find(x => x.id === v.id);
  if (!a) return false;
  a.note = v.note;
  a.dx = v.dx;
  log('Clinical note ' + a.id);
  save();
  toast('Consultation note saved');
  go({ quiet: true });
  return false;
}
function prescribe(f, pid) {
  const v = fd(f);
  if (v.end < v.start) { toast('End date must be after the start date', 'error'); return false; }
  DB.meds.push({ id: uid('m'), pid, name: v.name, dose: v.dose, start: v.start, end: v.end, remind: true, by: ME.id });
  DB.docs.push({ id: uid('dc'), pid, title: v.name + ' prescription', cat: 'Prescription', date: today(), by: ME.id, apptId: '', tags: 'prescription', ver: 1 });
  notify(pid, 'New prescription: ' + v.name);
  log('Prescribed ' + v.name + ' to ' + U(pid).name);
  save();
  toast('Prescription added');
  go({ quiet: true });
  return false;
}
function addAllergy(f, pid) {
  const v = fd(f);
  const p = U(pid);
  if (!v.a) return false;
  if (!p.allergies.includes(v.a)) p.allergies.push(v.a);
  log('Allergy recorded for ' + p.name);
  save();
  toast('Allergy recorded');
  go({ quiet: true });
  return false;
}

/* ------------------------------------------------------------ documents ui */
function uploadDialog(pid) {
  pid = pid || ME.id;
  const canPick = ME.role === 'doctor';
  const patients = DB.users.filter(u => u.role === 'patient' && allowed(u.id));
  if (canPick && !patients.length) return toast('No patient with consent on file', 'error');
  openDialog(dialogHead('Upload a document', 'PDF, JPG or PNG up to 400 KB in this prototype.') +
    `<div class="dlg-body"><form id="uploadForm" onsubmit="return upload(this)">
      <div class="form-grid">
        ${canPick ? `<label class="field span-2"><span>Patient</span><select class="select" name="pid">${patients.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`
      : `<input type="hidden" name="pid" value="${esc(pid)}">`}
        <label class="field span-2"><span>Title</span><input class="input" name="title" required placeholder="e.g. Blood test results"></label>
        <label class="field"><span>Category</span><select class="select" name="cat">${['Prescription', 'Laboratory', 'Certificate', 'Imaging', 'Consultation summary'].map(c => `<option>${c}</option>`).join('')}</select></label>
        <label class="field"><span>Tags <em>(optional)</em></span><input class="input" name="tags" placeholder="blood, follow-up"></label>
        <label class="field span-2"><span>File</span><input class="input" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required></label>
      </div>
      <p class="dlg-note">${icon('shield')} In this prototype the file is stored in your browser only. Real deployments should use encrypted, access-controlled storage.</p>
    </form></div>
    <div class="dlg-foot"><button class="btn btn--outline" onclick="closeDialog()">Cancel</button><button class="btn btn--primary" type="submit" form="uploadForm">Upload document</button></div>`, { wide: true });
}
function upload(f) {
  const v = fd(f);
  const file = f.file.files[0];
  if (!file) return false;
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || file.size > 409600) {
    toast('Only PDF/JPG/PNG up to 400 KB in this prototype', 'error');
    return false;
  }
  const pid = v.pid || ME.id;
  const by = ME.role === 'doctor' ? ME.id : (DB.users.find(u => u.role === 'doctor' && (U(pid).access || []).includes(u.id)) || {}).id || DB.users.find(u => u.role === 'doctor').id;
  const reader = new FileReader();
  reader.onload = () => {
    DB.docs.push({ id: uid('dc'), pid, title: v.title, cat: v.cat, date: today(), by, apptId: '', tags: v.tags || '', ver: 1, data: reader.result, mime: file.type });
    log('Uploaded ' + v.title);
    save();
    closeDialog();
    toast('Document uploaded');
    go();
  };
  reader.onerror = () => toast('The file could not be read', 'error');
  reader.readAsDataURL(file);
  return false;
}
function previewDoc(id) {
  const d = DB.docs.find(x => x.id === id);
  if (!d) return;
  log('Opened document ' + d.title);
  openDialog(dialogHead(d.title, d.cat + ' · ' + fmtLong(d.date) + ' · Dr ' + U(d.by).name) +
    `<div class="dlg-body">${d.data
      ? (d.mime === 'application/pdf' ? `<iframe src="${d.data}" title="${esc(d.title)}" style="width:100%;height:420px;border:1px solid var(--line);border-radius:10px"></iframe>` : `<img src="${d.data}" alt="${esc(d.title)}" style="max-width:100%;border-radius:10px;border:1px solid var(--line)">`)
      : '<div class="dlg-note">Sample document placeholder — no file is attached to this demo record.</div>'}</div>
     <div class="dlg-foot"><button class="btn btn--outline" onclick="downloadDoc('${d.id}')">${icon('download')} Download</button><button class="btn btn--primary" onclick="closeDialog()">Close</button></div>`, { wide: true });
}
function downloadDoc(id) {
  const d = DB.docs.find(x => x.id === id);
  if (!d) return;
  log('Downloaded ' + d.title);
  const a = document.createElement('a');
  if (d.data) {
    a.href = d.data;
  } else {
    a.href = URL.createObjectURL(new Blob(['MediLife sample document\n' + d.title + '\n' + d.cat + ' · ' + d.date + ' · Dr ' + U(d.by).name + '\n'], { type: 'text/plain' }));
  }
  a.download = d.title.replace(/\W+/g, '_') + (d.data ? '' : '.txt');
  a.click();
  toast('Download started', 'info');
}
function msgForm(did) {
  const d = U(did);
  openDialog(dialogHead('Message Dr ' + d.name, 'Non-emergency messages only. In an emergency call your local emergency number.') +
    `<div class="dlg-body"><form id="msgForm" onsubmit="return sendMsg(this,'${did}')"><label class="field"><span>Your message</span><textarea class="textarea" name="t" rows="4" required placeholder="Describe your question…"></textarea></label></form></div>
    <div class="dlg-foot"><button class="btn btn--outline" onclick="closeDialog()">Cancel</button><button class="btn btn--primary" type="submit" form="msgForm">${icon('message')} Send message</button></div>`);
}
function sendMsg(f, did) {
  const v = fd(f);
  if (!v.t.trim()) return false;
  notify(did, 'Message from ' + ME.name + ': ' + v.t.trim());
  log('Message to Dr ' + U(did).name);
  save();
  closeDialog();
  toast('Message sent');
  return false;
}
function announceDialog() {
  openDialog(dialogHead('Send an announcement', 'Delivered to every matching inbox.') +
    `<div class="dlg-body"><form id="annForm" onsubmit="return announce(this)">
      <div class="form-grid">
        <label class="field"><span>Audience</span><select class="select" name="to"><option value="all">Everyone</option><option value="patient">Patients</option><option value="doctor">Doctors</option></select></label>
        <label class="field"><span>Message</span><input class="input" name="text" maxlength="200" required placeholder="Clinic announcement"></label>
      </div>
    </form></div>
    <div class="dlg-foot"><button class="btn btn--outline" onclick="closeDialog()">Cancel</button><button class="btn btn--primary" type="submit" form="annForm">Send announcement</button></div>`);
}
function announce(f) {
  const v = fd(f);
  DB.users.filter(u => v.to === 'all' || u.role === v.to).forEach(u => notify(u.id, '📢 ' + v.text));
  log('Announcement to ' + v.to);
  save();
  closeDialog();
  toast('Announcement sent');
  go({ quiet: true });
  return false;
}
function addUserDialog() {
  openDialog(dialogHead('Create an account', 'The account is active immediately and uses the demo password.') +
    `<div class="dlg-body"><form id="newUser" onsubmit="return addUser(this)">
      <div class="form-grid">
        <label class="field"><span>Full name</span><input class="input" name="name" required placeholder="Full name"></label>
        <label class="field"><span>Email</span><input class="input" type="email" name="email" required placeholder="name@clinic.demo"></label>
        <label class="field"><span>Role</span><select class="select" name="role"><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label>
        <label class="field"><span>Speciality <em>(doctors)</em></span><input class="input" name="spec" placeholder="e.g. Cardiology"></label>
      </div>
      <p class="dlg-note">Prototype accounts use the password <b>demo</b>.</p>
    </form></div>
    <div class="dlg-foot"><button class="btn btn--outline" onclick="closeDialog()">Cancel</button><button class="btn btn--primary" type="submit" form="newUser">Create account</button></div>`, { wide: true });
}
function addUser(f) {
  const v = fd(f);
  const email = String(v.email).trim().toLowerCase();
  if (DB.users.some(u => u.email === email)) { toast('An account already uses this email', 'error'); return false; }
  if (v.role === 'doctor') {
    DB.users.push({ id: uid('d'), role: 'doctor', name: v.name, spec: v.spec || 'General Medicine', room: 'R-200', phone: '', email, pass: 'demo', active: true, hours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] } });
  } else {
    DB.users.push({ id: uid('p'), role: 'patient', name: v.name, email, pass: 'demo', active: true, phone: '', emergency: '', dob: '', blood: '', allergies: [], conditions: [], access: [] });
  }
  log('Created user ' + v.name);
  save();
  closeDialog();
  toast('Account created');
  go({ quiet: true });
  return false;
}

/* ------------------------------------------------------------ misc helpers */
function medProgress(m) {
  const s = parseD(m.start).getTime(), e = parseD(m.end).getTime(), now = Date.now();
  return Math.max(0, Math.min(100, Math.round((now - s) / Math.max(1, e - s) * 100)));
}
function completionRate() {
  const total = DB.appts.length || 1;
  return Math.round(DB.appts.filter(a => a.status === 'completed').length / total * 100);
}
function monthStart() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}
function monthlyCounts(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    out.push({ label: MON3[d.getMonth()], count: DB.appts.filter(a => a.date.startsWith(key)).length });
  }
  return out;
}
function weekBars() {
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const max = Math.max(...days.map(d => DB.appts.filter(a => a.date === iso(d)).length), 1);
  return days.map(d => {
    const n = DB.appts.filter(a => a.date === iso(d)).length;
    return `<div class="bar-item"><div class="bar-top"><span>${DOW3[d.getDay()]} ${d.getDate()}</span><b>${n}</b></div><div class="bar-track"><i style="width:${Math.round(n / max * 100)}%"></i></div></div>`;
  }).join('');
}

/* ------------------------------------------------------------- public pages */
function renderLanding() {
  $('#app').innerHTML = `<div class="site">
    <header class="site-nav">
      <div class="site-nav-inner">
        <a class="brand" href="#/" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">
          <span class="brand-mark">${icon('cross')}</span>
          <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
        </a>
        <nav class="site-links" aria-label="Product">
          <a href="#features" onclick="return jumpTo('features')">Features</a>
          <a href="#how" onclick="return jumpTo('how')">How it works</a>
          <a href="#roles" onclick="return jumpTo('roles')">For your role</a>
          <a href="#security" onclick="return jumpTo('security')">Security</a>
        </nav>
        <div class="site-actions">
          <a class="btn btn--ghost" href="#/login">Sign in</a>
          <a class="btn btn--primary" href="#/register">Get started</a>
          <button class="icon-btn site-mobile-toggle" aria-label="Menu" onclick="toggleSiteMenu()">${icon('menu')}</button>
        </div>
      </div>
      <div class="site-mobile" id="siteMobile" hidden>
        <a href="#features" onclick="toggleSiteMenu();return jumpTo('features')">Features</a>
        <a href="#how" onclick="toggleSiteMenu();return jumpTo('how')">How it works</a>
        <a href="#roles" onclick="toggleSiteMenu();return jumpTo('roles')">For your role</a>
        <a href="#security" onclick="toggleSiteMenu();return jumpTo('security')">Security</a>
        <a href="#/login">Sign in</a>
        <a href="#/register">Create account</a>
      </div>
    </header>

    <section class="hero">
      <div class="site-wrap">
        <div class="hero-inner">
          <div>
            <span class="hero-pill"><span class="tag">Care platform</span> A calmer way to run the clinic</span>
            <h1>Your health, organized. Your care, <em>connected</em>.</h1>
            <p class="hero-lead">MediLife brings the medical dossier, appointments, documents and prescriptions into one live workspace — so patients, doctors and clinic teams always see the same picture.</p>
            <div class="hero-actions">
              <button class="btn btn--primary" onclick="demoSignIn('patient@medilife.demo')">${icon('activity')} Open the live demo</button>
              <a class="btn btn--outline" href="#/login">Sign in to your workspace</a>
            </div>
            <div class="hero-trust">
              <div><b>3</b><span>role workspaces</span></div>
              <div><b>1</b><span>shared source of truth</span></div>
              <div><b>Live</b><span>clock, updates and sync</span></div>
              <div><b>3</b><span>languages, incl. RTL</span></div>
            </div>
          </div>
          <div class="hero-visual">
            <div class="mock" aria-hidden="true">
              <div class="mock-bar"><i></i><i></i><i></i><em>app.medilife.health</em></div>
              <div class="mock-body">
                <div class="mock-side"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
                <div class="mock-main">
                  <div class="mock-kpis">
                    <div class="mock-kpi"><small>Upcoming</small><b>3</b><div class="bar"><i style="width:72%"></i></div></div>
                    <div class="mock-kpi"><small>Messages</small><b>2</b><div class="bar"><i style="width:38%"></i></div></div>
                    <div class="mock-kpi"><small>Documents</small><b>12</b><div class="bar"><i style="width:88%"></i></div></div>
                  </div>
                  <div class="mock-chart"><i style="height:36%"></i><i style="height:52%"></i><i style="height:44%"></i><i style="height:68%"></i><i style="height:58%"></i><i style="height:80%"></i><i style="height:70%"></i><i style="height:94%"></i></div>
                  <div class="mock-rows">
                    <div class="mock-row"><i></i><span></span><span></span></div>
                    <div class="mock-row"><i></i><span></span><span></span></div>
                    <div class="mock-row"><i></i><span></span><span></span></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="float-card float-card--live"><span class="live-dot"></span><div><b>Live schedule</b><small>Updated seconds ago</small></div></div>
            <div class="float-card float-card--consent">${icon('shield')}<div><b>Consent controlled</b><small>Patients decide access</small></div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="features">
      <div class="site-wrap">
        <div class="section-head">
          <span class="eyebrow"><span class="dot"></span>One workspace</span>
          <h2>Everything a clinic touches, in one connected place.</h2>
          <p>No more chasing PDFs in email threads or asking which version of the schedule is right. Each view links to the next, and every role sees only what it should.</p>
        </div>
        <div class="feature-grid">
          <article class="feature"><span class="feature-icon tone-teal">${icon('file')}</span><h3>Digital dossier</h3><p>History, allergies, conditions, treatments and emergency details in a single readable timeline.</p></article>
          <article class="feature"><span class="feature-icon tone-blue">${icon('calendar')}</span><h3>Calendar & booking</h3><p>Real free slots from each doctor's hours, double-booking protection and reschedule in two clicks.</p></article>
          <article class="feature"><span class="feature-icon tone-violet">${icon('folder')}</span><h3>Document center</h3><p>Prescriptions, lab results, imaging and summaries, searchable and previewable from any screen.</p></article>
          <article class="feature"><span class="feature-icon tone-green">${icon('pill')}</span><h3>Medication care</h3><p>Doctor-defined instructions, treatment progress and optional reminders — never self-edited.</p></article>
          <article class="feature"><span class="feature-icon tone-amber">${icon('shield')}</span><h3>Consent control</h3><p>Patients grant dossier access doctor by doctor, revoke it anytime, and every view is audited.</p></article>
          <article class="feature"><span class="feature-icon tone-teal">${icon('activity')}</span><h3>Live clinic pulse</h3><p>Status changes, notifications and schedules update in place, with a live sync across tabs.</p></article>
        </div>
        <div class="section-head" style="margin-top:34px;margin-bottom:0">
          <p class="hint">Every feature above is clickable in the demo — the same interface patients, doctors and administrators see.</p>
        </div>
      </div>
    </section>

    <section class="section section--tight" id="how" style="background:#fff;border-block:1px solid var(--line)">
      <div class="site-wrap">
        <div class="section-head section-head--center">
          <span class="eyebrow"><span class="dot"></span>How it works</span>
          <h2>Three steps from booking to follow-up.</h2>
          <p>MediLife follows the visit, not the other way around.</p>
        </div>
        <div class="steps">
          <article class="step"><span class="step-num">1</span><h3>Book a real slot</h3><p>Pick a doctor and see genuine availability, with conflicts checked before the request is sent.</p></article>
          <article class="step"><span class="step-num">2</span><h3>Meet and document</h3><p>The doctor confirms, records the consultation, prescribes and shares documents with a consent-checked dossier.</p></article>
          <article class="step"><span class="step-num">3</span><h3>Stay connected</h3><p>Patients follow the plan, get reminders and message the care team. Administrators keep the clinic running.</p></article>
        </div>
      </div>
    </section>

    <section class="section" id="roles">
      <div class="site-wrap">
        <div class="section-head">
          <span class="eyebrow"><span class="dot"></span>For your role</span>
          <h2>One clinic, three focused workspaces.</h2>
          <p>Open any of them now — the demo data is fictional and ready to explore.</p>
        </div>
        <div class="roles">
          <article class="role role--featured">
            <span class="role-badge">${icon('user')} Patients</span>
            <h3>Your record, in your hands</h3>
            <p>See what your doctors see, and decide who else can see it.</p>
            <ul>
              <li>${icon('check')} Dossier, timeline and emergency card</li>
              <li>${icon('check')} Book, reschedule or cancel visits</li>
              <li>${icon('check')} Documents and treatment reminders</li>
              <li>${icon('check')} Grant or revoke doctor consent</li>
            </ul>
            <button class="btn btn--primary" onclick="demoSignIn('patient@medilife.demo')">Explore as a patient</button>
          </article>
          <article class="role">
            <span class="role-badge">${icon('stethoscope')} Doctors</span>
            <h3>A day that stays organized</h3>
            <p>See today's visits, pending requests and consented dossiers without switching tools.</p>
            <ul>
              <li>${icon('check')} Live day view and confirmations</li>
              <li>${icon('check')} Consent-gated clinical notes</li>
              <li>${icon('check')} Prescriptions that reach the patient</li>
              <li>${icon('check')} Upload and share documents</li>
            </ul>
            <button class="btn btn--outline" onclick="demoSignIn('doctor@medilife.demo')">Explore as a doctor</button>
          </article>
          <article class="role">
            <span class="role-badge">${icon('shield')} Clinic admin</span>
            <h3>The clinic, without the chaos</h3>
            <p>Accounts, schedules, volume and follow-ups — with clinical data kept out of reach.</p>
            <ul>
              <li>${icon('check')} Approve registrations and roles</li>
              <li>${icon('check')} Set doctor hours and rooms</li>
              <li>${icon('check')} Track no-shows and completion</li>
              <li>${icon('check')} Audit every sensitive action</li>
            </ul>
            <button class="btn btn--outline" onclick="demoSignIn('admin@medilife.demo')">Explore as an admin</button>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--tight" id="security" style="background:#fff;border-block:1px solid var(--line)">
      <div class="site-wrap">
        <div class="security">
          <div>
            <span class="eyebrow"><span class="dot"></span>Security & consent</span>
            <h2 style="font-size:clamp(1.55rem,2.6vw,2.1rem);letter-spacing:-.035em">Care data moves only where the patient allows.</h2>
            <p style="margin-top:12px">Access is a design decision, not an afterthought. Each role has a deliberate boundary, and the record itself shows what happened.</p>
            <ul class="security-list">
              <li><span class="tick">${icon('check')}</span><div><b>Doctor-by-doctor consent</b>Patients choose who can open their dossier and can revoke it at any time.</div></li>
              <li><span class="tick">${icon('check')}</span><div><b>Administrators stay non-clinical</b>Clinic management never exposes notes, documents or clinical summaries.</div></li>
              <li><span class="tick">${icon('check')}</span><div><b>Audit trail</b>Sensitive reads and writes are recorded with user, time and action.</div></li>
              <li><span class="tick">${icon('check')}</span><div><b>Clear prototype boundary</b>This demo uses fictional data in browser storage — not production security.</div></li>
            </ul>
          </div>
          <div class="security-card" aria-hidden="true">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span class="stat-icon tone-teal">${icon('lock')}</span><div><b style="color:var(--ink)">Dossier access</b><div class="hint">Amine Khelifi · controlled by the patient</div></div></div>
            <div class="consent-row">${avatar('Karim Trabelsi', 34)}<div><b>Dr Karim Trabelsi</b><small>Cardiology · granted 12 Apr</small></div><span class="switch is-on"></span></div>
            <div class="consent-row">${avatar('Leila Mansour', 34)}<div><b>Dr Leila Mansour</b><small>Dermatology · not granted</small></div><span class="switch"></span></div>
            <div class="consent-row">${avatar('Omar Jebali', 34)}<div><b>Dr Omar Jebali</b><small>General medicine · granted 3 May</small></div><span class="switch is-on"></span></div>
            <div class="divider"></div>
            <div style="display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--mut)">${icon('shield')} Every access is written to the audit log.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="site-wrap">
        <div class="cta">
          <span class="eyebrow" style="color:#7fe9dc"><span class="dot"></span>Ready when you are</span>
          <h2>See the whole clinic in one live workspace.</h2>
          <p>Open the demo as a patient, a doctor or an administrator. No sign-up, no real data, nothing to install.</p>
          <div class="cta-actions">
            <button class="btn btn--primary" onclick="demoSignIn('patient@medilife.demo')">${icon('user')} Patient demo</button>
            <button class="btn btn--on-dark" onclick="demoSignIn('doctor@medilife.demo')">${icon('stethoscope')} Doctor demo</button>
            <button class="btn btn--on-dark" onclick="demoSignIn('admin@medilife.demo')">${icon('shield')} Admin demo</button>
          </div>
        </div>
      </div>
    </section>

    <footer class="site-foot">
      <div class="site-wrap">
        <div class="foot-grid">
          <div class="foot-brand">
            <a class="brand" href="#/" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">
              <span class="brand-mark">${icon('cross')}</span>
              <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
            </a>
            <p>A connected care workspace prototype for dossiers, appointments, documents and clinic operations.</p>
          </div>
          <div class="foot-col"><h4>Product</h4><a href="#features" onclick="return jumpTo('features')">Features</a><a href="#how" onclick="return jumpTo('how')">How it works</a><a href="#roles" onclick="return jumpTo('roles')">Role workspaces</a><a href="#security" onclick="return jumpTo('security')">Security & consent</a></div>
          <div class="foot-col"><h4>Access</h4><a href="#/login">Sign in</a><a href="#/register">Create patient account</a><a href="#/login" onclick="demoSignIn('doctor@medilife.demo');return false;">Doctor demo</a><a href="#/login" onclick="demoSignIn('admin@medilife.demo');return false;">Admin demo</a></div>
          <div class="foot-col"><h4>Clinic</h4><span class="hint" style="display:block;font-size:.85rem;color:var(--ink-soft);padding:4px 0">${esc(DB.clinic.name)}</span><span class="hint" style="display:block;padding:4px 0">${esc(DB.clinic.hours)}</span><span class="hint" style="display:block;padding:4px 0">${esc(DB.clinic.phone)}</span></div>
        </div>
        <div class="foot-bottom">
          <span>© ${new Date().getFullYear()} MediLife. Fictional prototype for demonstration — not for real patient data.</span>
          <span>Built as a single-page HTML, CSS and JavaScript application.</span>
        </div>
      </div>
    </footer>
  </div>`;
  stopClock();
  window.scrollTo(0, 0);
}
function renderLogin() {
  $('#app').innerHTML = `<div class="auth">
    <aside class="auth-aside">
      <div>
        <a class="brand" href="#/" style="padding:0 0 8px">
          <span class="brand-mark">${icon('cross')}</span>
          <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
        </a>
        <h2>Care that stays connected.</h2>
        <p>One calm workspace for dossiers, appointments, documents and treatment — for patients, doctors and clinic teams.</p>
        <ul class="auth-features">
          <li>${icon('shield')} Consent-first records, audited on every access</li>
          <li>${icon('calendar')} Live scheduling with conflict protection</li>
          <li>${icon('activity')} Updates that follow you across pages and tabs</li>
        </ul>
        <div class="auth-quote">“The right record, in the right hands, at the right moment — without the chase.”<b>MediLife product preview</b></div>
      </div>
      <p class="tiny" style="color:#7f9aac">Fictional demo data · no real patient information</p>
    </aside>
    <main class="auth-main">
      <div class="auth-card">
        <a class="auth-brand" href="#/">
          <span class="brand-mark">${icon('cross')}</span>
          <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
        </a>
        <h1>Welcome back</h1>
        <p class="lead">Sign in to your MediLife workspace.</p>
        <form onsubmit="return doLogin(this)">
          <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required placeholder="you@medilife.demo"></label>
          <label class="field"><span>Password</span><input class="input" name="pass" type="password" autocomplete="current-password" required placeholder="demo"></label>
          <button class="btn btn--primary btn--block">Sign in</button>
        </form>
        <div class="auth-divider"><span>Or explore a demo role</span></div>
        <div class="demo-grid">
          <button class="demo-btn" onclick="demoSignIn('patient@medilife.demo')">${avatar('Amine Khelifi', 26)}<span>Patient<small>Records & booking</small></span></button>
          <button class="demo-btn" onclick="demoSignIn('doctor@medilife.demo')">${avatar('Karim Trabelsi', 26)}<span>Doctor<small>Consented dossiers</small></span></button>
          <button class="demo-btn" onclick="demoSignIn('admin@medilife.demo')">${avatar('Sana Ben Ali', 26)}<span>Admin<small>Clinic operations</small></span></button>
        </div>
        <p class="auth-foot">New patient? <a href="#/register">Create an account</a> · <a href="#/">Back to website</a></p>
        <p class="auth-note">Prototype: simulated sign-in, fictional records, browser-only storage. Demo password is <b>demo</b>.</p>
      </div>
    </main>
  </div>`;
  stopClock();
}
function renderRegister() {
  $('#app').innerHTML = `<div class="auth">
    <aside class="auth-aside">
      <div>
        <a class="brand" href="#/" style="padding:0 0 8px">
          <span class="brand-mark">${icon('cross')}</span>
          <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
        </a>
        <h2>Start with a record that follows you.</h2>
        <p>Create a patient account, then choose which doctors may see your dossier. An administrator approves every new account before it opens.</p>
        <ul class="auth-features">
          <li>${icon('check')} Book and manage your own appointments</li>
          <li>${icon('check')} Keep prescriptions and results together</li>
          <li>${icon('check')} Grant or revoke consent at any time</li>
        </ul>
      </div>
      <p class="tiny" style="color:#7f9aac">Fictional demo data · no real patient information</p>
    </aside>
    <main class="auth-main">
      <div class="auth-card">
        <a class="auth-brand" href="#/">
          <span class="brand-mark">${icon('cross')}</span>
          <span class="brand-word"><b>Medi<i>Life</i></b><em>${t('tagShort')}</em></span>
        </a>
        <h1>Create a patient account</h1>
        <p class="lead">An administrator will approve your request.</p>
        <form onsubmit="return doReg(this)">
          <label class="field"><span>Full name</span><input class="input" name="name" required minlength="3" placeholder="First and last name"></label>
          <label class="field"><span>Email</span><input class="input" name="email" type="email" required placeholder="you@example.com"></label>
          <label class="field"><span>Password</span><input class="input" name="pass" type="password" required minlength="4" placeholder="Choose a demo password"></label>
          <button class="btn btn--primary btn--block">Request account</button>
        </form>
        <p class="auth-foot">Already registered? <a href="#/login">Sign in</a> · <a href="#/">Back to website</a></p>
        <p class="auth-note">Prototype only — approval is simulated and no data leaves this browser.</p>
      </div>
    </main>
  </div>`;
  stopClock();
}

/* ---------------------------------------------------------------- view map */
const VIEWS = { dashboard, dossier, documents, calendar, doctors, meds, notifications, settings, patients, users, appointments, schedules, stats, audit };

/* -------------------------------------------------------------------- boot */
applyLang();
const sid = sessionStorage.getItem('ml.me');
if (sid) ME = DB.users.find(u => u.id === sid && u.active) || null;
LAST_DAY = today();
go();
