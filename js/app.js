/* MediLife UI — views, routing, auth (simulated), permissions. */
let DB = Store.load(), ME = null, LANG = localStorage.getItem('ml.lang') || 'en';
const CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null, st: '', v: 'month' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const U = id => DB.users.find(u => u.id === id) || { name: '?', spec: '' };
const fd = f => Object.fromEntries(new FormData(f));
const toM = s => +s.slice(0, 2) * 60 + +s.slice(3), fromM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const save = () => { if (!Store.save()) toast('Storage full — use a smaller file', 1); };
const log = a => { DB.audit.unshift({ ts: new Date().toISOString().slice(0, 16).replace('T', ' '), by: ME ? ME.name + ' (' + ME.role + ')' : '-', a }); save(); };
const notify = (to, text) => DB.notifs.unshift({ id: uid('n'), to, text, date: today(), read: false });
function toast(m, err) { const e = document.createElement('div'); e.textContent = m; if (err) e.className = 'err'; $('#toast').append(e); setTimeout(() => e.remove(), 3500); }
const modal = h => { $('#modal').innerHTML = h + '<p><button class="btn sec sm" onclick="$(\'#modal\').close()">Close</button></p>'; $('#modal').showModal(); };

/* i18n (EN / FR / AR with RTL) */
const T = {
  en: { dashboard: 'Dashboard', dossier: 'My dossier', documents: 'Documents', calendar: 'Calendar', doctors: 'Doctors', meds: 'Medications', notifications: 'Notifications', settings: 'Settings', patients: 'Patients', users: 'Users & roles', appointments: 'Appointments', schedules: 'Doctor schedules', stats: 'Statistics', audit: 'Audit log', logout: 'Log out', tag: 'Your Health, Organized. Your Care, Connected.' },
  fr: { dashboard: 'Tableau de bord', dossier: 'Mon dossier', documents: 'Documents', calendar: 'Calendrier', doctors: 'Médecins', meds: 'Médicaments', notifications: 'Notifications', settings: 'Paramètres', patients: 'Patients', users: 'Utilisateurs & rôles', appointments: 'Rendez-vous', schedules: 'Horaires médecins', stats: 'Statistiques', audit: "Journal d'audit", logout: 'Déconnexion', tag: 'Votre santé, organisée. Vos soins, connectés.' },
  ar: { dashboard: 'لوحة القيادة', dossier: 'ملفي الطبي', documents: 'المستندات', calendar: 'التقويم', doctors: 'الأطباء', meds: 'الأدوية', notifications: 'الإشعارات', settings: 'الإعدادات', patients: 'المرضى', users: 'المستخدمون والأدوار', appointments: 'المواعيد', schedules: 'جداول الأطباء', stats: 'الإحصاءات', audit: 'سجل التدقيق', logout: 'تسجيل الخروج', tag: 'صحتك منظمة. رعايتك متصلة.' }
};
const t = k => (T[LANG] && T[LANG][k]) || T.en[k] || k;
const NAV = { patient: ['dashboard', 'dossier', 'documents', 'calendar', 'doctors', 'meds', 'notifications', 'settings'], doctor: ['dashboard', 'patients', 'calendar', 'documents', 'notifications', 'settings'], admin: ['dashboard', 'users', 'appointments', 'schedules', 'stats', 'audit', 'notifications', 'settings'] };
const IC = { dashboard: '🏠', dossier: '📋', documents: '📄', calendar: '📅', doctors: '🩺', meds: '💊', notifications: '🔔', settings: '⚙️', patients: '👥', users: '👤', appointments: '🗓️', schedules: '⏰', stats: '📊', audit: '🛡️' };
const PROTO = '<div class="proto">⚠ Prototype: simulated login, fictional data, browser storage only. Not secure, not for real patient data.</div>';

/* permissions: doctor sees clinical data only with patient consent; admin never sees clinical notes */
const allowed = pid => ME.role === 'patient' ? ME.id === pid : ME.role === 'doctor' && U(pid).access?.includes(ME.id);
const myAppts = () => DB.appts.filter(a => ME.role === 'admin' || a.pid === ME.id || a.did === ME.id);

/* scheduling */
function slots(did, date, ignore) {
  const h = U(did).hours, out = [];
  if (!h || !h.days.includes(new Date(date + 'T00:00').getDay()) || date < today()) return out;
  const now = new Date(), nowS = fromM(now.getHours() * 60 + now.getMinutes());
  for (let m = toM(h.start); m < toM(h.end); m += 30) {
    const s = fromM(m);
    if (date === today() && s <= nowS) continue;
    if (!DB.appts.some(a => a.id !== ignore && a.did === did && a.date === date && a.time === s && a.status !== 'cancelled')) out.push(s);
  }
  return out;
}
function bookForm(pid, did, editId) {
  const e = DB.appts.find(a => a.id === editId), docs = DB.users.filter(u => u.role === 'doctor' && u.active);
  did = e ? e.did : did || docs[0].id;
  modal(`<h3>${e ? 'Reschedule' : 'Book'} appointment</h3><form onsubmit="return book(this,'${pid}','${editId || ''}')">
  <label>Doctor<select name="did" onchange="slotRefresh()" ${e ? 'disabled' : ''}>${docs.map(d => `<option value="${d.id}" ${d.id === did ? 'selected' : ''}>Dr ${esc(d.name)} — ${esc(d.spec)}</option>`).join('')}</select></label>
  <label>Date<input type="date" name="date" min="${today()}" value="${e ? e.date : today()}" onchange="slotRefresh()" required></label>
  <label>Time slot<select name="time" required></select></label>
  <label>Reason<input name="reason" maxlength="120" required value="${esc(e ? e.reason : '')}"></label>
  <p class="hint">Suggested free slots: <span id="sug"></span> (availability only — not a medical urgency assessment)</p>
  <button class="btn">Confirm</button></form>`);
  slotRefresh();
}
function slotRefresh() {
  const f = $('#modal form').elements, did = f.did.value, s = slots(did, f.date.value, null);
  f.time.innerHTML = s.length ? s.map(x => `<option>${x}</option>`).join('') : '<option value="">No free slot this day</option>';
  const sug = []; for (let i = 0; i < 14 && sug.length < 3; i++) { const d = new Date(); d.setDate(d.getDate() + i); const ds = d.toISOString().slice(0, 10), sl = slots(did, ds); if (sl[0]) sug.push(ds + ' ' + sl[0]); }
  $('#sug').textContent = sug.join(' · ') || 'none in the next 2 weeks';
}
function book(f, pid, editId) {
  const v = fd(f), did = editId ? DB.appts.find(a => a.id === editId).did : v.did;
  if (!v.time) { toast('Pick an available slot', 1); return false; }
  if (DB.appts.some(a => a.id !== editId && a.pid === pid && a.date === v.date && a.time === v.time && a.status !== 'cancelled')) { toast('Conflict: patient already has an appointment then', 1); return false; }
  if (!slots(did, v.date, editId).includes(v.time)) { toast('Conflict: slot no longer free', 1); return false; }
  if (editId) { const a = DB.appts.find(x => x.id === editId); Object.assign(a, { date: v.date, time: v.time, reason: v.reason, status: 'pending' }); notify(a.did, `Appointment moved to ${v.date} ${v.time}`); notify(a.pid, `Appointment time changed to ${v.date} ${v.time}`); log('Rescheduled ' + editId); }
  else { const id = uid('ap'); DB.appts.push({ id, pid, did, date: v.date, time: v.time, status: ME.role === 'doctor' ? 'confirmed' : 'pending', reason: v.reason, note: '', dx: '' }); notify(did, `New booking ${v.date} ${v.time}`); notify(pid, `Appointment ${v.date} ${v.time} requested`); log('Booked ' + id); }
  save(); $('#modal').close(); toast('Saved'); go(); return false;
}
function setStatus(id, s) {
  const a = DB.appts.find(x => x.id === id);
  if (ME.role === 'patient' && s === 'cancelled' && new Date(a.date + 'T' + a.time) - Date.now() < 864e5) return toast('Clinic rule: cancel at least 24h before', 1);
  if (!confirm(`Set status to "${s}"?`)) return;
  a.status = s; notify(a.pid, `Appointment ${a.date} ${a.time}: ${s}`); notify(a.did, `Appointment ${a.date} ${a.time}: ${s}`); log(`Appt ${id} -> ${s}`); save(); go();
}
function btns(a) {
  const r = ME.role, live = ['pending', 'confirmed'].includes(a.status), o = [];
  if (live && r !== 'patient' && a.status === 'pending') o.push(['confirmed', 'Confirm']);
  if (live && r === 'doctor' && a.status === 'confirmed') o.push(['completed', 'Complete']);
  if (live && r !== 'patient') o.push(['missed', 'No-show']);
  if (live) o.push(['cancelled', 'Cancel']);
  return o.map(([s, l]) => `<button class="btn sm" onclick="setStatus('${a.id}','${s}')">${l}</button>`).join(' ') + (live && r !== 'doctor' ? ` <button class="btn sm sec" onclick="bookForm('${a.pid}','${a.did}','${a.id}')">Reschedule</button>` : '');
}
const apptTable = list => `<table><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Status</th><th></th></tr>${[...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => `<tr><td>${a.date} ${a.time}</td><td>${esc(U(a.pid).name)}</td><td>Dr ${esc(U(a.did).name)}</td><td>${esc(a.reason)}</td><td><span class="b ${a.status}">${a.status}</span></td><td>${btns(a)}</td></tr>`).join('') || '<tr><td colspan="6">No appointments yet.</td></tr>'}</table>`;

/* shell + router */
function shell(page, html) {
  const unread = DB.notifs.filter(n => n.to === ME.id && !n.read).length;
  $('#app').innerHTML = `<div class="layout"><nav class="side" id="side" aria-label="Main"><div class="logo">✚ Medi<b>Life</b></div>
  ${NAV[ME.role].map(p => `<a href="#/${p}" class="${p === page ? 'on' : ''}">${IC[p]} ${t(p)}${p === 'notifications' && unread ? ` (${unread})` : ''}</a>`).join('')}
  <a href="#" onclick="logout();return false">🚪 ${t('logout')}</a></nav>
  <main class="main"><div class="top"><button class="btn sec burger" onclick="$('#side').classList.toggle('open')" aria-label="Menu">☰</button><h1 style="margin:0">${t(page)}</h1><span class="mut">${esc(ME.name)} · ${ME.role}</span></div>${PROTO}${html}</main></div>`;
}
function go() {
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  const [p, arg] = location.hash.slice(2).split('/');
  if (!ME) return ({ login, register })[p] ? ({ login, register })[p]() : landing();
  const page = NAV[ME.role].includes(p) ? p : 'dashboard';
  shell(page, VIEWS[page](arg)); window.scrollTo(0, 0);
}
function logout() { log('Logout'); ME = null; sessionStorage.removeItem('ml.me'); location.hash = ''; go(); }
window.addEventListener('hashchange', go);

/* public pages */
function landing() {
  $('#app').innerHTML = `<header class="hero"><div class="logo" style="font-size:2rem">✚ Medi<b>Life</b></div><h1>${t('tag')}</h1><p>One secure place for medical dossiers, appointments, documents and clinic operations.</p><a class="btn" style="background:#fff;color:#0f2f57" href="#/login">Sign in</a> <a class="btn sec" href="#/register">Create patient account</a>
  <div style="margin-top:16px"><select aria-label="Language" onchange="setLang(this.value)" style="width:auto"><option value="en">English</option><option value="fr" ${LANG === 'fr' ? 'selected' : ''}>Français</option><option value="ar" ${LANG === 'ar' ? 'selected' : ''}>العربية</option></select></div></header>
  <div class="wrap"><div class="grid">${[['📋', 'Digital dossier', 'History, allergies, treatments, emergency card.'], ['📅', 'Smart calendar', 'Slots, conflict detection, reminders.'], ['📄', 'Document center', 'Prescriptions, lab results, imaging.'], ['💊', 'Medication center', 'Doctor-defined schedules and reminders.'], ['🔐', 'Consent control', 'Patients decide which doctors see their dossier.'], ['📊', 'Insights', 'Workload and no-show tracking, no identities.']].map(c => `<div class="card"><h3>${c[0]} ${c[1]}</h3><p class="mut">${c[2]}</p></div>`).join('')}</div>${PROTO}</div>`;
}
function setLang(l) { LANG = l; localStorage.setItem('ml.lang', l); go(); }
function login() {
  $('#app').innerHTML = `<div class="center card"><h2>Sign in</h2><form onsubmit="return doLogin(this)"><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password<input name="pass" type="password" required autocomplete="current-password"></label><button class="btn">Sign in</button> <a href="#/register">Register</a></form>
  <p class="hint">Demo accounts (password <b>demo</b>):</p><div class="row">${[['patient@medilife.demo', 'Patient'], ['doctor@medilife.demo', 'Doctor'], ['admin@medilife.demo', 'Admin']].map(x => `<button class="btn sec sm" onclick="demo('${x[0]}')">${x[1]}</button>`).join('')}</div>${PROTO}</div>`;
}
function demo(e) { const f = $('form'); f.email.value = e; f.pass.value = 'demo'; }
function doLogin(f) {
  const v = fd(f), u = DB.users.find(x => x.email === v.email.trim().toLowerCase() && x.pass === v.pass);
  if (!u) { toast('Invalid credentials', 1); return false; }
  if (!u.active) { toast('Account pending administrator approval or deactivated', 1); return false; }
  ME = u; sessionStorage.setItem('ml.me', u.id); log('Login'); location.hash = '#/dashboard'; go(); return false;
}
function register() {
  $('#app').innerHTML = `<div class="center card"><h2>Create patient account</h2><form onsubmit="return doReg(this)"><label>Full name<input name="name" required minlength="3"></label><label>Email<input name="email" type="email" required></label><label>Password (demo)<input name="pass" type="password" required minlength="4"></label><button class="btn">Request account</button> <a href="#/login">Back</a></form><p class="hint">An administrator must approve your account.</p></div>`;
}
function doReg(f) {
  const v = fd(f); v.email = v.email.trim().toLowerCase();
  if (DB.users.some(u => u.email === v.email)) { toast('Email already used', 1); return false; }
  DB.users.push({ id: uid('p'), role: 'patient', name: v.name.trim(), email: v.email, pass: v.pass, active: false, phone: '', emergency: '', allergies: [], conditions: [], access: [] });
  DB.users.filter(u => u.role === 'admin').forEach(a => notify(a.id, `Registration request: ${v.name}`)); save(); toast('Request sent. Wait for approval.'); location.hash = '#/login'; return false;
}

/* views */
const VIEWS = {
  dashboard() {
    const L = myAppts(), up = L.filter(a => a.date >= today() && ['pending', 'confirmed'].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), un = DB.notifs.filter(n => n.to === ME.id && !n.read).length;
    if (ME.role === 'admin') { const c = s => DB.appts.filter(a => a.status === s).length; return `<div class="grid">${[['Patients', DB.users.filter(u => u.role === 'patient').length], ['Doctors', DB.users.filter(u => u.role === 'doctor').length], ['Appointments', DB.appts.length], ['Pending requests', c('pending') + DB.users.filter(u => !u.active).length], ['Missed', c('missed')]].map(k => `<div class="card"><div class="kpi">${k[1]}</div>${k[0]}</div>`).join('')}</div><div class="card"><h3>Pending appointments</h3>${apptTable(DB.appts.filter(a => a.status === 'pending'))}</div>`; }
    const pre = ME.role === 'patient' && up[0] ? `<div class="card"><h3>✅ Preparation checklist — ${up[0].date}</h3><label><input type="checkbox" style="width:auto"> Previous lab results</label><label><input type="checkbox" style="width:auto"> Current prescriptions</label><label><input type="checkbox" style="width:auto"> Questions for the doctor</label></div>` : '';
    return `<div class="grid"><div class="card"><div class="kpi">${up.length}</div>Upcoming appointments</div><div class="card"><div class="kpi">${un}</div>Unread notifications</div>${ME.role === 'patient' ? `<div class="card"><div class="kpi">${DB.meds.filter(m => m.pid === ME.id && m.end >= today()).length}</div>Active treatments</div>` : `<div class="card"><div class="kpi">${L.filter(a => a.date === today()).length}</div>Today</div>`}</div>${pre}<div class="card"><h3>Next appointments</h3>${apptTable(up.slice(0, 5))}</div>${ME.role === 'patient' ? '<button class="btn" onclick="bookForm(ME.id)">+ Book appointment</button>' : ''}`;
  },
  dossier() { return dossier(ME.id); },
  patients(id) {
    if (id) return dossier(id);
    return `<div class="card"><label>Search<input oninput="filt(this)" placeholder="Name…"></label><table id="pt"><tr><th>Patient</th><th>Conditions</th><th>Access</th><th></th></tr>${DB.users.filter(u => u.role === 'patient' && u.active).map(p => `<tr data-q="${esc(p.name.toLowerCase())}"><td>${esc(p.name)}</td><td>${allowed(p.id) ? esc(p.conditions.join(', ')) : '—'}</td><td>${allowed(p.id) ? '✅ consent' : '🔒 no consent'}</td><td>${allowed(p.id) ? `<a class="btn sm" href="#/patients/${p.id}">Open</a>` : ''}</td></tr>`).join('')}</table></div>`;
  },
  documents() {
    const docs = DB.docs.filter(d => ME.role === 'admin' || allowed(d.pid)), cats = ['Prescription', 'Laboratory', 'Certificate', 'Imaging', 'Consultation summary'];
    const pats = ME.role === 'doctor' ? DB.users.filter(u => u.role === 'patient' && allowed(u.id)) : [];
    return `<div class="card"><div class="row"><label>Search<input oninput="filt(this)"></label><label>Category<select id="cf" onchange="go()"><option value="">All</option>${cats.map(c => `<option ${window._cf === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    <table id="pt"><tr><th>Title</th><th>Patient</th><th>Category</th><th>Date</th><th>Issued by</th><th>v</th><th></th></tr>${docs.filter(d => !window._cf || d.cat === window._cf).sort((a, b) => b.date.localeCompare(a.date)).map(d => `<tr data-q="${esc((d.title + d.tags + d.cat).toLowerCase())}"><td>${esc(d.title)}<br><span class="hint">${esc(d.tags)}</span></td><td>${esc(U(d.pid).name)}</td><td>${ME.role === 'admin' ? `<select onchange="recat('${d.id}',this.value)">${cats.map(c => `<option ${c === d.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>` : d.cat}</td><td>${d.date}</td><td>Dr ${esc(U(d.by).name)}</td><td>${d.ver}</td><td>${ME.role !== 'admin' ? `<button class="btn sm" onclick="preview('${d.id}')">Preview</button> <button class="btn sm sec" onclick="dl('${d.id}')">Download</button>` : '<span class="hint">metadata only</span>'}</td></tr>`).join('') || '<tr><td colspan="7">No documents.</td></tr>'}</table></div>
    ${ME.role !== 'admin' ? `<div class="card"><h3>Upload (PDF/JPG/PNG, max 400 KB in prototype)</h3><form onsubmit="return upload(this)"><div class="row">${ME.role === 'doctor' ? `<label>Patient<select name="pid">${pats.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}<label>Title<input name="title" required></label><label>Category<select name="cat">${cats.map(c => `<option>${c}</option>`).join('')}</select></label><label>Tags<input name="tags"></label><label>File<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required></label></div><button class="btn">Upload</button></form></div>` : ''}`;
  },
  calendar() {
    const L = myAppts().filter(a => !CAL.st || a.status === CAL.st); CAL.sel = CAL.sel || today();
    const pad = n => String(n).padStart(2, '0'), ds = d => d.toISOString().slice(0, 10);
    let body = '';
    if (CAL.v === 'month') {
      const first = new Date(CAL.y, CAL.m, 1).getDay(), n = new Date(CAL.y, CAL.m + 1, 0).getDate();
      body = `<div class="cal">${'SMTWTFS'.split('').map(x => `<div class="h">${x}</div>`).join('')}${'<div></div>'.repeat(first)}${Array.from({ length: n }, (_, i) => { const s = `${CAL.y}-${pad(CAL.m + 1)}-${pad(i + 1)}`; return `<button class="day ${s === CAL.sel ? 'sel' : ''} ${s === today() ? 'today' : ''}" onclick="CAL.sel='${s}';go()">${i + 1}<br>${L.filter(a => a.date === s).map(a => `<i class="dot ${a.status}"></i>`).join('')}</button>`; }).join('')}</div>`;
    }
    const base = new Date(CAL.sel + 'T00:00'); if (CAL.v === 'week') base.setDate(base.getDate() - base.getDay());
    const days = CAL.v === 'day' ? [CAL.sel] : CAL.v === 'week' ? Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return ds(d); }) : [CAL.sel];
    const agenda = days.map(d => `<h4>${d}</h4>${apptTable(L.filter(a => a.date === d))}`).join('');
    return `<div class="card"><div class="row"><label>View<select onchange="CAL.v=this.value;go()">${['month', 'week', 'day'].map(v => `<option ${CAL.v === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Status<select onchange="CAL.st=this.value;go()"><option value="">All</option>${['pending', 'confirmed', 'completed', 'cancelled', 'missed'].map(s => `<option ${CAL.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <div><button class="btn sec sm" onclick="CAL.m--;if(CAL.m<0){CAL.m=11;CAL.y--}go()">◀</button> <b>${CAL.y}-${pad(CAL.m + 1)}</b> <button class="btn sec sm" onclick="CAL.m++;if(CAL.m>11){CAL.m=0;CAL.y++}go()">▶</button> <button class="btn sm" onclick="window.print()">Print</button> ${ME.role === 'patient' ? '<button class="btn sm" onclick="bookForm(ME.id)">+ Book</button>' : ''}</div></div>${body}</div><div class="card">${agenda}<p class="hint">Dots: <i class="dot pending"></i>pending <i class="dot confirmed"></i>confirmed <i class="dot completed"></i>completed <i class="dot missed"></i>missed</p></div>`;
  },
  doctors() {
    return `<div class="grid">${DB.users.filter(u => u.role === 'doctor' && u.active).map(d => `<div class="card"><h3>Dr ${esc(d.name)}</h3><p>${esc(d.spec)} · ${esc(d.room)}<br>${d.hours.start}–${d.hours.end}<br>${esc(d.phone)}</p><button class="btn sm" onclick="bookForm(ME.id,'${d.id}')">Book</button> <button class="btn sm sec" onclick="msgForm('${d.id}')">Message</button></div>`).join('')}</div>`;
  },
  meds() {
    const L = DB.meds.filter(m => m.pid === ME.id);
    return `<div class="card"><p class="hint">Medications are prescribed by your doctor. This tool never changes your treatment — contact your doctor with questions.</p><table><tr><th>Medication</th><th>Instructions</th><th>Period</th><th>Reminder</th></tr>${L.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>${m.start} → ${m.end}</td><td><button class="btn sm ${m.remind ? '' : 'sec'}" onclick="toggleRem('${m.id}')">${m.remind ? 'On' : 'Off'}</button></td></tr>`).join('') || '<tr><td colspan="4">No treatments.</td></tr>'}</table></div>`;
  },
  notifications() {
    const L = DB.notifs.filter(n => n.to === ME.id || (n.to === 'all' && 0));
    return `${ME.role === 'admin' ? `<div class="card"><h3>Send announcement</h3><form onsubmit="return announce(this)"><div class="row"><label>To<select name="to"><option value="all">Everyone</option><option value="patient">Patients</option><option value="doctor">Doctors</option></select></label><label>Message<input name="text" required maxlength="200"></label></div><button class="btn">Send</button></form></div>` : ''}<div class="card"><button class="btn sm sec" onclick="DB.notifs.forEach(n=>n.to==ME.id&&(n.read=true));save();go()">Mark all read</button><table>${L.map(n => `<tr><td>${n.read ? '' : '🔵'}</td><td>${n.date}</td><td>${esc(n.text)}</td></tr>`).join('') || '<tr><td>Nothing yet.</td></tr>'}</table></div>`;
  },
  settings() {
    const p = ME.prefs || {};
    return `<div class="card"><h3>Language</h3><select onchange="setLang(this.value)" aria-label="Language"><option value="en">English</option><option value="fr" ${LANG === 'fr' ? 'selected' : ''}>Français</option><option value="ar" ${LANG === 'ar' ? 'selected' : ''}>العربية (RTL)</option></select></div>
    <div class="card"><h3>Privacy preferences</h3><label><input type="checkbox" style="width:auto" ${p.rem !== false ? 'checked' : ''} onchange="pref('rem',this.checked)"> Appointment reminders</label><label><input type="checkbox" style="width:auto" ${p.stats ? 'checked' : ''} onchange="pref('stats',this.checked)"> Allow anonymised statistics</label><button class="btn sec" onclick="exportMe()">Export my data (JSON)</button></div>
    <div class="card"><h3>Prototype tools</h3><button class="btn red" onclick="if(confirm('Reset all demo data?')){DB=Store.reset();toast('Reset');go()}">Reset demo data</button></div>`;
  },
  users() {
    return `<div class="card"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>${DB.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><select onchange="setRole('${u.id}',this.value)">${['patient', 'doctor', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td>${u.active ? 'active' : '⏳ inactive/pending'}</td><td><button class="btn sm ${u.active ? 'red' : ''}" onclick="toggleUser('${u.id}')">${u.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}</table></div>
    <div class="card"><h3>Create account</h3><form onsubmit="return addUser(this)"><div class="row"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option>patient</option><option>doctor</option></select></label><label>Specialty (doctors)<input name="spec"></label></div><button class="btn">Create (password: demo)</button></form></div>`;
  },
  appointments() { return `<div class="card">${apptTable(DB.appts)}</div><div class="card"><h3>Missed appointments — follow-up needed</h3>${apptTable(DB.appts.filter(a => a.status === 'missed'))}</div>`; },
  schedules() {
    return DB.users.filter(u => u.role === 'doctor').map(d => `<div class="card"><h3>Dr ${esc(d.name)} — ${esc(d.spec)}</h3><form onsubmit="return saveHours(this,'${d.id}')"><div class="row"><label>Start<input type="time" name="start" value="${d.hours.start}"></label><label>End<input type="time" name="end" value="${d.hours.end}"></label><label>Room<input name="room" value="${esc(d.room)}"></label></div>${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((n, i) => `<label style="display:inline-block;margin-inline-end:10px"><input type="checkbox" style="width:auto" name="d${i}" ${d.hours.days.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}<br><button class="btn sm">Save</button></form></div>`).join('');
  },
  stats() {
    const n = DB.appts.length || 1, by = s => DB.appts.filter(a => a.status === s).length, bar = (l, v, m) => `<p>${l} — ${v}<div class="bar"><i style="width:${Math.round(v / m * 100)}%"></i></div></p>`;
    return `<div class="card"><h3>By status</h3>${['pending', 'confirmed', 'completed', 'cancelled', 'missed'].map(s => bar(s, by(s), n)).join('')}<p><b>Completion rate:</b> ${Math.round(by('completed') / n * 100)}% · <b>No-show rate:</b> ${Math.round(by('missed') / n * 100)}%</p></div><div class="card"><h3>Doctor workload</h3>${DB.users.filter(u => u.role === 'doctor').map(d => bar('Dr ' + esc(d.name), DB.appts.filter(a => a.did === d.id).length, n)).join('')}<p class="hint">Aggregated — no patient identities shown.</p></div><button class="btn" onclick="window.print()">Print report</button>`;
  },
  audit() { return `<div class="card"><table><tr><th>Time</th><th>User</th><th>Action</th></tr>${DB.audit.slice(0, 200).map(a => `<tr><td>${a.ts}</td><td>${esc(a.by)}</td><td>${esc(a.a)}</td></tr>`).join('') || '<tr><td colspan="3">Empty</td></tr>'}</table></div>`; }
};

/* dossier: patient (own) or doctor (consent required; access is audited) */
function dossier(pid) {
  if (!allowed(pid)) return '<div class="card">🔒 Access denied: no patient consent.</div>';
  const p = U(pid), mine = ME.role === 'patient', isDoc = ME.role === 'doctor'; if (isDoc) log('Viewed dossier of ' + p.name);
  const ev = [...DB.appts.filter(a => a.pid === pid && a.status === 'completed').map(a => [a.date, '🩺 Consultation: ' + a.reason + (a.dx ? ' — ' + a.dx : '')]), ...DB.docs.filter(d => d.pid === pid).map(d => [d.date, '📄 ' + d.cat + ': ' + d.title]), ...DB.meds.filter(m => m.pid === pid).map(m => [m.start, '💊 Started ' + m.name]), ...DB.appts.filter(a => a.pid === pid && a.date >= today() && a.status !== 'cancelled').map(a => [a.date, '📅 Upcoming: ' + a.reason])].sort((a, b) => b[0].localeCompare(a[0]));
  const docsList = DB.users.filter(u => u.role === 'doctor');
  return `<div class="card" style="border-inline-start:6px solid var(--red)"><h3>🚑 Emergency card</h3><b>${esc(p.name)}</b><br>Allergies: ${esc(p.allergies.join(', ') || 'none recorded')}<br>Conditions: ${esc(p.conditions.join(', ') || 'none recorded')}<br>Emergency contact: ${esc(p.emergency || '—')}</div>
  <div class="grid"><div class="card"><h3>Profile</h3>${mine ? `<form onsubmit="return saveProfile(this)"><label>Phone<input name="phone" value="${esc(p.phone)}"></label><label>Emergency contact<input name="emergency" value="${esc(p.emergency)}"></label><button class="btn sm">Save</button></form>` : `Phone: ${esc(p.phone)}`}</div>
  ${mine ? `<div class="card"><h3>Who can access my dossier</h3>${docsList.map(d => `<label><input type="checkbox" style="width:auto" ${p.access.includes(d.id) ? 'checked' : ''} onchange="consent('${d.id}',this.checked)"> Dr ${esc(d.name)}</label>`).join('')}</div>` : ''}</div>
  <div class="card"><h3>Health timeline</h3><div class="tl">${ev.map(e => `<div><b>${e[0]}</b> ${esc(e[1])}</div>`).join('') || 'No events.'}</div></div>
  ${isDoc ? consultTools(pid) : `<div class="card"><h3>Consultation notes</h3>${DB.appts.filter(a => a.pid === pid && a.note).map(a => `<p><b>${a.date}</b> ${esc(a.note)}</p>`).join('') || 'None.'}</div>`}
  <button class="btn" onclick="window.print()">🖨 Print / save as PDF</button>`;
}
function consultTools(pid) {
  const p = U(pid), mine = DB.appts.filter(a => a.pid === pid && a.did === ME.id && a.status !== 'cancelled');
  return `<div class="card"><h3>Consultation</h3>${mine.length ? `<form onsubmit="return saveNote(this)"><div class="row"><label>Appointment<select name="id">${mine.map(a => `<option value="${a.id}">${a.date} ${a.time} — ${esc(a.reason)}</option>`).join('')}</select></label><label>Diagnosis<input name="dx"></label></div><label>Notes & follow-up plan<textarea name="note" rows="3"></textarea></label><button class="btn sm">Save note</button></form>` : '<p>No appointment with this patient.</p>'}
  ${DB.appts.filter(a => a.pid === pid && a.did === ME.id && a.note).map(a => `<p><b>${a.date}</b> ${esc(a.dx)} — ${esc(a.note)}</p>`).join('')}<button class="btn sm sec" onclick="bookForm('${pid}','${ME.id}')">Schedule follow-up</button></div>
  <div class="card"><h3>Prescription</h3><form onsubmit="return prescribe(this,'${pid}')"><div class="row"><label>Medication<input name="name" required></label><label>Dosage / instructions<input name="dose" required></label><label>Start<input type="date" name="start" value="${today()}" required></label><label>End<input type="date" name="end" required></label></div><button class="btn sm">Prescribe</button></form>
  <table>${DB.meds.filter(m => m.pid === pid).map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>${m.start}→${m.end}</td></tr>`).join('')}</table>
  <h4>Allergy record</h4><form onsubmit="return addAllergy(this,'${pid}')" class="row"><input name="a" placeholder="e.g. Latex" required><button class="btn sm" style="flex:0">Add</button></form></div>`;
}

/* actions */
function filt(i) { const q = i.value.toLowerCase(); document.querySelectorAll('#pt tr[data-q]').forEach(r => r.style.display = r.dataset.q.includes(q) ? '' : 'none'); }
function upload(f) {
  const v = fd(f), file = f.file.files[0]; if (!file) return false;
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || file.size > 409600) { toast('Only PDF/JPG/PNG up to 400 KB', 1); return false; }
  const r = new FileReader(); r.onload = () => {
    DB.docs.push({ id: uid('dc'), pid: v.pid || ME.id, title: v.title, cat: v.cat, date: today(), by: ME.role === 'doctor' ? ME.id : DB.users.find(u => u.role === 'doctor').id, apptId: '', tags: v.tags, ver: 1, data: r.result, mime: file.type });
    log('Uploaded ' + v.title); save(); toast('Uploaded'); go();
  }; r.readAsDataURL(file); return false;
}
function preview(id) {
  const d = DB.docs.find(x => x.id === id); log('Opened document ' + d.title);
  modal(`<h3>${esc(d.title)}</h3><p class="hint">${esc(d.cat)} · ${d.date} · Dr ${esc(U(d.by).name)}</p>${d.data ? (d.mime === 'application/pdf' ? `<iframe src="${d.data}" style="width:100%;height:360px"></iframe>` : `<img src="${d.data}" alt="${esc(d.title)}" style="max-width:100%">`) : '<div class="proto">Sample document placeholder (no file attached in demo data).</div>'}`);
}
function dl(id) {
  const d = DB.docs.find(x => x.id === id); log('Downloaded ' + d.title);
  const a = document.createElement('a'); a.href = d.data || URL.createObjectURL(new Blob([`MediLife sample document: ${d.title}\n${d.cat} ${d.date}`])); a.download = d.title.replace(/\W+/g, '_') + (d.data ? '' : '.txt'); a.click();
}
const recat = (id, c) => { DB.docs.find(d => d.id === id).cat = c; log('Recategorised ' + id); save(); };
const saveProfile = f => { Object.assign(ME, fd(f)); save(); toast('Profile saved'); return false; };
const consent = (d, on) => { const a = ME.access; on ? a.includes(d) || a.push(d) : a.splice(a.indexOf(d), 1); log(`Consent ${on ? 'granted to' : 'revoked from'} ${U(d).name}`); save(); toast('Access updated'); };
const toggleRem = id => { const m = DB.meds.find(x => x.id === id); m.remind = !m.remind; save(); go(); };
function msgForm(did) { modal(`<h3>Message to Dr ${esc(U(did).name)}</h3><p class="hint">Non-emergency only. In an emergency call your local emergency number.</p><form onsubmit="return sendMsg(this,'${did}')"><label>Message<textarea name="t" required rows="3"></textarea></label><button class="btn">Send</button></form>`); }
const sendMsg = (f, did) => { notify(did, `Message from ${ME.name}: ${fd(f).t}`); log('Message to ' + did); save(); $('#modal').close(); toast('Sent'); return false; };
const announce = f => { const v = fd(f); DB.users.filter(u => v.to === 'all' || u.role === v.to).forEach(u => notify(u.id, '📢 ' + v.text)); log('Announcement'); save(); toast('Sent'); go(); return false; };
const pref = (k, v) => { ME.prefs = { ...(ME.prefs || {}), [k]: v }; save(); };
function exportMe() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ profile: ME, appts: myAppts(), docs: DB.docs.filter(d => d.pid === ME.id).map(({ data, ...r }) => r) }, null, 2)])); a.download = 'my-data.json'; a.click(); log('Data export'); }
const setRole = (id, r) => { U(id).role = r; log(`Role ${id} -> ${r}`); save(); toast('Role updated'); };
const toggleUser = id => { const u = U(id); if (u.id === ME.id) return toast('Cannot deactivate yourself', 1); u.active = !u.active; log(`User ${u.name} active=${u.active}`); save(); go(); };
function addUser(f) {
  const v = fd(f); if (DB.users.some(u => u.email === v.email.toLowerCase())) { toast('Email exists', 1); return false; }
  DB.users.push(v.role === 'doctor' ? { id: uid('d'), role: 'doctor', name: v.name, spec: v.spec || 'General Medicine', room: 'R-200', phone: '', email: v.email.toLowerCase(), pass: 'demo', active: true, hours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] } } : { id: uid('p'), role: 'patient', name: v.name, email: v.email.toLowerCase(), pass: 'demo', active: true, phone: '', emergency: '', allergies: [], conditions: [], access: [] });
  log('Created user ' + v.name); save(); toast('Created'); go(); return false;
}
function saveHours(f, id) { const v = fd(f), d = U(id); if (v.start >= v.end) { toast('End must be after start', 1); return false; } d.hours = { start: v.start, end: v.end, days: [0, 1, 2, 3, 4, 5, 6].filter(i => v['d' + i]) }; d.room = v.room; log('Schedule ' + d.name); save(); toast('Saved'); return false; }
function saveNote(f) { const v = fd(f), a = DB.appts.find(x => x.id === v.id); a.note = v.note; a.dx = v.dx; log('Clinical note ' + a.id); save(); toast('Note saved'); go(); return false; }
function prescribe(f, pid) {
  const v = fd(f); if (v.end < v.start) { toast('End before start', 1); return false; }
  DB.meds.push({ id: uid('m'), pid, ...v, remind: true, by: ME.id }); DB.docs.push({ id: uid('dc'), pid, title: v.name + ' prescription', cat: 'Prescription', date: today(), by: ME.id, apptId: '', tags: '', ver: 1 });
  notify(pid, `New prescription: ${v.name}`); log('Prescribed ' + v.name); save(); toast('Prescribed'); go(); return false;
}
const addAllergy = (f, pid) => { U(pid).allergies.push(fd(f).a); log('Allergy added'); save(); go(); return false; };

/* boot */
const sid = sessionStorage.getItem('ml.me'); if (sid) ME = DB.users.find(u => u.id === sid && u.active) || null;
go();
