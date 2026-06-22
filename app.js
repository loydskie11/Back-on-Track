/* ════════════════════════════════════════════════════════════
   Back on Track — app.js
   v2: status (present/absent), calendar, icon actions,
       truncated details with view modal, offline queue
   ════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   SUPABASE CONFIGURATION
   ─────────────────────────────────────────────────────────────
   Leave SUPABASE_URL as '' to use localStorage only.
   ─────────────────────────────────────────────────────────────*/
const SUPABASE_URL      = 'https://nfskfueotzxdrxqnbwib.supabase.co';  // e.g. 'https://xyzabc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mc2tmdWVvdHp4ZHJ4cW5id2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTU4MjksImV4cCI6MjA5NzY3MTgyOX0.VJ9Gb5i3FQaL3Q1tR_2_O83HQqX7DkI528MCzgREC7o';  // e.g. 'eyJhbGciOi...'
const USE_SUPABASE = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

/* ════ OFFLINE QUEUE ════════════════════════════════════════ */
const QUEUE_KEY = 'bot_sync_queue';
const getQueue  = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
const saveQueue = q  => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

function enqueue(op) {
  const q = getQueue(); q.push({ ...op, ts: Date.now() }); saveQueue(q);
}

async function processQueue() {
  if (!USE_SUPABASE || !navigator.onLine) return;
  const q = getQueue(); if (!q.length) return;
  const failed = [];
  for (const op of q) {
    try {
      if (op.type === 'add') {
        const p = op.payload;
        await sbFetch('bot_entries', 'POST', {
          id: p.id, user_id: p.user_id, status: p.status,
          day_number: p.dayNumber, date: p.date, hours: p.hours, details: p.details
        });
      } else if (op.type === 'edit') {
        const p = op.payload;
        await sbFetch(`bot_entries?id=eq.${p.id}`, 'PATCH', {
          status: p.status, day_number: p.dayNumber,
          date: p.date, hours: p.hours, details: p.details
        });
      } else if (op.type === 'delete') {
        await sbFetch(`bot_entries?id=eq.${op.payload.id}`, 'DELETE');
      } else if (op.type === 'profile') {
        const p = op.payload;
        await sbFetch(`bot_profiles?user_id=eq.${p.user_id}`, 'DELETE');
        await sbFetch('bot_profiles', 'POST', {
          user_id: p.user_id, name: p.name, course: p.course,
          company: p.company, address: p.address,
          supervisor: p.supervisor, required_hours: p.requiredHours
        });
      }
    } catch { failed.push(op); }
  }
  saveQueue(failed);
  const synced = q.length - failed.length;
  if (synced > 0) { showToast(`☁️ Synced ${synced} pending change${synced > 1 ? 's' : ''}`); updateOfflineBanner(); }
}

function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const qCount = getQueue().length;
  const offline = !navigator.onLine;
  if (!USE_SUPABASE) { banner.classList.add('hidden'); return; }
  if (offline) {
    banner.className = 'offline-banner offline';
    banner.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg><span>You're offline — changes saved locally${qCount > 0 ? ` (${qCount} pending)` : ''}</span>`;
    banner.classList.remove('hidden');
  } else if (qCount > 0) {
    banner.className = 'offline-banner syncing';
    banner.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Syncing ${qCount} pending change${qCount > 1 ? 's' : ''}…</span>`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

window.addEventListener('online',  async () => { updateOfflineBanner(); await processQueue(); updateOfflineBanner(); });
window.addEventListener('offline', () => updateOfflineBanner());

/* ════ SUPABASE HELPERS ═════════════════════════════════════ */
async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json', 'Prefer': 'return=representation', ...extra
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text(); return text ? JSON.parse(text) : [];
}

/* ════ PASSWORD HASH ════════════════════════════════════════ */
async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ════ LOCAL STORAGE KEYS ══════════════════════════════════ */
const LS = {
  users:   'bot_users',
  session: 'bot_session',
  profile: uid => `bot_profile_${uid}`,
  entries: uid => `bot_entries_${uid}`,
};

/* ════ STATE ════════════════════════════════════════════════ */
let currentUser    = null;
let profile        = null;
let entries        = [];       // {id, status:'present'|'absent', dayNumber, date, hours, details}
let deleteTargetId = null;
let calYear        = 0;
let calMonth       = 0;        // 0-based

/* ════ INIT ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthTabs();
  const saved = localStorage.getItem(LS.session);
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      await loadUserData();
      if (profile) {
        showScreen('app-screen');
        initCalendar();
        renderDashboard();
        renderCalendar();
        renderEntries();
        updateOfflineBanner();
        await processQueue();
        updateOfflineBanner();
      } else { showScreen('onboarding-screen'); }
    } catch { localStorage.removeItem(LS.session); showScreen('auth-screen'); }
  } else { showScreen('auth-screen'); }

  document.getElementById('entry-date').valueAsDate = new Date();
  document.getElementById('entry-absent-date').valueAsDate = new Date();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ════ AUTH TABS ════════════════════════════════════════════ */
function setupAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
      clearAuthErrors();
    });
  });
}
function clearAuthErrors() {
  ['signin-error','signup-error'].forEach(id => { const el = document.getElementById(id); el.classList.add('hidden'); el.textContent = ''; });
}
function showAuthError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); }

/* ════ SIGN IN ══════════════════════════════════════════════ */
async function handleSignIn() {
  const username = document.getElementById('signin-username').value.trim();
  const password = document.getElementById('signin-password').value;
  if (!username || !password) { showAuthError('signin-error', 'Please fill in all fields.'); return; }
  const hash = await hashPassword(password);
  if (USE_SUPABASE) {
    try {
      const rows = await sbFetch(`bot_users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(hash)}&select=id,username`);
      if (!rows.length) { showAuthError('signin-error', 'Incorrect username or password.'); return; }
      currentUser = { id: rows[0].id, username: rows[0].username };
    } catch { showAuthError('signin-error', 'Connection error. Are you offline?'); return; }
  } else {
    const users = JSON.parse(localStorage.getItem(LS.users) || '{}');
    const user  = users[username];
    if (!user || user.passwordHash !== hash) { showAuthError('signin-error', 'Incorrect username or password.'); return; }
    currentUser = { id: user.id, username };
  }
  localStorage.setItem(LS.session, JSON.stringify(currentUser));
  await loadUserData();
  if (profile) {
    showScreen('app-screen'); initCalendar(); renderDashboard(); renderCalendar(); renderEntries();
    updateOfflineBanner(); await processQueue(); updateOfflineBanner();
  } else { showScreen('onboarding-screen'); }
}

/* ════ SIGN UP ══════════════════════════════════════════════ */
async function handleSignUp() {
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm  = document.getElementById('signup-confirm').value;
  if (!username || !password || !confirm) { showAuthError('signup-error', 'Please fill in all fields.'); return; }
  if (username.length < 3) { showAuthError('signup-error', 'Username must be at least 3 characters.'); return; }
  if (password.length < 6) { showAuthError('signup-error', 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { showAuthError('signup-error', 'Passwords do not match.'); return; }
  const hash = await hashPassword(password);
  const id   = 'u_' + Date.now();
  if (USE_SUPABASE) {
    try {
      const exists = await sbFetch(`bot_users?username=eq.${encodeURIComponent(username)}&select=id`);
      if (exists.length) { showAuthError('signup-error', 'Username already taken.'); return; }
      const created = await sbFetch('bot_users', 'POST', { id, username, password_hash: hash });
      currentUser = { id: created[0].id, username };
    } catch { showAuthError('signup-error', 'Could not create account. Check Supabase config.'); return; }
  } else {
    const users = JSON.parse(localStorage.getItem(LS.users) || '{}');
    if (users[username]) { showAuthError('signup-error', 'Username already taken.'); return; }
    users[username] = { id, passwordHash: hash };
    localStorage.setItem(LS.users, JSON.stringify(users));
    currentUser = { id, username };
  }
  localStorage.setItem(LS.session, JSON.stringify(currentUser));
  profile = null; entries = []; showScreen('onboarding-screen');
}

/* ════ ONBOARDING ═══════════════════════════════════════════ */
async function handleOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  const course = document.getElementById('ob-course').value.trim();
  const company = document.getElementById('ob-company').value.trim();
  const address = document.getElementById('ob-address').value.trim();
  const supervisor = document.getElementById('ob-supervisor').value.trim();
  const hrs = parseFloat(document.getElementById('ob-hours').value);
  if (!name || !course || !company || !address || !supervisor || !hrs || hrs < 1) {
    const el = document.getElementById('ob-error');
    el.textContent = 'Please fill in all fields correctly.'; el.classList.remove('hidden'); return;
  }
  profile = { name, course, company, address, supervisor, requiredHours: hrs };
  await saveProfile_data();
  showScreen('app-screen'); initCalendar(); renderDashboard(); renderCalendar(); renderEntries(); updateOfflineBanner();
}

/* ════ LOAD / SAVE DATA ══════════════════════════════════════ */
async function loadUserData() {
  if (USE_SUPABASE && navigator.onLine) {
    try {
      const [profs, ents] = await Promise.all([
        sbFetch(`bot_profiles?user_id=eq.${currentUser.id}&select=*`),
        sbFetch(`bot_entries?user_id=eq.${currentUser.id}&select=*&order=day_number.asc`)
      ]);
      profile = profs.length ? { name: profs[0].name, course: profs[0].course, company: profs[0].company, address: profs[0].address, supervisor: profs[0].supervisor, requiredHours: profs[0].required_hours } : null;
      entries = ents.map(e => ({ id: e.id, status: e.status || 'present', dayNumber: e.day_number, date: e.date, hours: e.hours || 0, details: e.details || '' }));
      if (profile) localStorage.setItem(LS.profile(currentUser.id), JSON.stringify(profile));
      localStorage.setItem(LS.entries(currentUser.id), JSON.stringify(entries));
      return;
    } catch { /* fall through */ }
  }
  const p = localStorage.getItem(LS.profile(currentUser.id));
  profile  = p ? JSON.parse(p) : null;
  const e  = localStorage.getItem(LS.entries(currentUser.id));
  entries  = e ? JSON.parse(e) : [];
  // Ensure status field exists on old entries
  entries = entries.map(en => ({ status: 'present', ...en }));
}

async function saveProfile_data() {
  if (profile) localStorage.setItem(LS.profile(currentUser.id), JSON.stringify(profile));
  if (!USE_SUPABASE) return;
  if (navigator.onLine) {
    try {
      await sbFetch(`bot_profiles?user_id=eq.${currentUser.id}`, 'DELETE');
      await sbFetch('bot_profiles', 'POST', { user_id: currentUser.id, name: profile.name, course: profile.course, company: profile.company, address: profile.address, supervisor: profile.supervisor, required_hours: profile.requiredHours });
      return;
    } catch { /* queue */ }
  }
  const q = getQueue().filter(op => op.type !== 'profile');
  q.push({ type: 'profile', payload: { user_id: currentUser.id, ...profile }, ts: Date.now() });
  saveQueue(q); updateOfflineBanner();
}

async function saveEntries_data() {
  localStorage.setItem(LS.entries(currentUser.id), JSON.stringify(entries));
}

/* ════ DASHBOARD ════════════════════════════════════════════ */
function renderDashboard() {
  if (!profile) return;
  document.getElementById('dash-name').textContent    = profile.name;
  document.getElementById('dash-company').textContent = profile.company;
  updateProgressBar(document.getElementById('progress-select').value);
}

function updateProgressBar(mode) {
  if (!profile) return;
  const totalHrs  = profile.requiredHours;
  const presentE  = entries.filter(e => e.status === 'present');
  const doneHrs   = presentE.reduce((s, e) => s + Number(e.hours), 0);
  const doneFmt   = doneHrs % 1 === 0 ? doneHrs : doneHrs.toFixed(1);
  const pct       = totalHrs > 0 ? Math.min((doneHrs / totalHrs) * 100, 100) : 0;
  const totalDays = presentE.length;
  const estDays   = totalHrs > 0 && doneHrs > 0 ? Math.ceil(totalHrs / (doneHrs / totalDays)) : 0;
  let ll, rl, pl, rql, fp;
  if (mode === 'hours') {
    const left = Math.max(totalHrs - doneHrs, 0);
    ll = `${doneFmt} hrs done`; rl = `${left % 1 === 0 ? left : left.toFixed(1)} hrs left`;
    pl = `${pct.toFixed(1)}%`; rql = `of ${totalHrs} hrs required`; fp = pct;
  } else if (mode === 'days') {
    ll = `${totalDays} day${totalDays !== 1 ? 's' : ''} logged`;
    rl = estDays > 0 ? `~${Math.max(estDays - totalDays, 0)} days left` : '—';
    pl = `${totalDays} days`;
    rql = `at avg ${totalDays > 0 ? (doneHrs / totalDays).toFixed(1) : 0} hrs/day`;
    fp  = estDays > 0 ? Math.min((totalDays / estDays) * 100, 100) : pct;
  } else {
    ll = `${pct.toFixed(1)}% complete`; rl = `${(100 - pct).toFixed(1)}% remaining`;
    pl = `${pct.toFixed(1)}%`; rql = `of ${totalHrs} hrs required`; fp = pct;
  }
  document.getElementById('progress-label-left').textContent  = ll;
  document.getElementById('progress-label-right').textContent = rl;
  document.getElementById('progress-pct').textContent         = pl;
  document.getElementById('progress-required').textContent    = rql;
  document.getElementById('progress-fill').style.width        = `${fp}%`;
}

/* ════ CALENDAR ═════════════════════════════════════════════ */
function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
}

function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }

function renderCalendar() {
  const label = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = label;

  const grid   = document.getElementById('cal-grid');
  const today  = new Date();
  const first  = new Date(calYear, calMonth, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // Build date→entry map (by date string YYYY-MM-DD)
  const dateMap = {};
  entries.forEach(e => { dateMap[e.date] = e; });

  let html = '';

  // Leading blanks from previous month
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month"><span class="cal-day-num">${prevDays - i}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const entry   = dateMap[dateStr];
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    let dotHtml = '';
    if (entry) {
      cls += ' has-entry';
      cls += entry.status === 'absent' ? ' is-absent' : ' is-present';
      dotHtml = `<span class="cal-dot ${entry.status}"></span>`;
    }
    html += `<div class="${cls}" onclick="calDayClick('${dateStr}')" title="${dateStr}">
      <span class="cal-day-num">${d}</span>${dotHtml}
    </div>`;
  }

  // Trailing blanks
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const trailing   = totalCells - startDow - daysInMonth;
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="cal-day other-month"><span class="cal-day-num">${i}</span></div>`;
  }

  grid.innerHTML = html;
}

function calDayClick(dateStr) {
  const entry = entries.find(e => e.date === dateStr);
  const d     = new Date(dateStr + 'T00:00:00');
  const fmt   = d.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const modal = document.getElementById('cal-modal');
  document.getElementById('cal-modal-date').textContent = fmt;

  if (!entry) {
    document.getElementById('cal-modal-title').textContent = 'No Duty';
    document.getElementById('cal-modal-body').innerHTML =
      `<p style="color:var(--text-secondary);font-size:.9rem;line-height:1.5;">No added duty for this day.</p>`;
    document.getElementById('cal-modal-footer').innerHTML =
      `<button class="btn-primary full" onclick="closeCalModal()">Close</button>`;
    modal.classList.remove('hidden'); return;
  }

  const isPresent = entry.status !== 'absent';
  document.getElementById('cal-modal-title').textContent = isPresent ? `Day ${entry.dayNumber}` : 'Absent';
  const hoursLine = isPresent
    ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span style="font-size:.8rem;font-weight:600;color:var(--text-secondary);">Hours:</span>
        <span class="entry-hours-badge">${entry.hours} hrs</span>
       </div>` : '';
  document.getElementById('cal-modal-body').innerHTML = `
    <div>
      <span class="status-badge ${entry.status}">
        ${isPresent
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Present`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Absent`}
      </span>
      ${hoursLine}
    </div>
    <div class="field-group">
      <label class="field-label">${isPresent ? 'Work Details' : 'Reason'}</label>
      <p style="font-size:.9rem;line-height:1.6;color:var(--text-primary);white-space:pre-wrap;">${escHtml(entry.details)}</p>
    </div>`;
  document.getElementById('cal-modal-footer').innerHTML = `
    <button class="btn-ghost" onclick="closeCalModal();openEditModal('${entry.id}')">Edit</button>
    <button class="btn-primary" onclick="closeCalModal()">Close</button>`;
  modal.classList.remove('hidden');
}

function closeCalModal()        { document.getElementById('cal-modal').classList.add('hidden'); }
function closeCalModalOutside(e){ if (e.target.classList.contains('modal-overlay')) closeCalModal(); }

/* ════ ENTRIES RENDER ═══════════════════════════════════════ */
function renderEntries() {
  const q      = document.getElementById('search-input').value.trim().toLowerCase();
  const list   = document.getElementById('entries-list');
  const filtered = entries.filter(e =>
    !q || e.details.toLowerCase().includes(q) || e.date.includes(q) ||
    String(e.dayNumber).includes(q) || (e.status && e.status.includes(q))
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>
        <path d="M8 15h4M8 18h8" stroke-linecap="round"/>
      </svg>
      <h3>${q ? 'No matching entries' : 'No entries yet'}</h3>
      <p>${q ? 'Try a different search term.' : 'Tap the + button below to log your first DTR entry.'}</p>
    </div>`; return;
  }

  const MAX_CHARS = 100;

  list.innerHTML = filtered.slice().reverse().map(e => {
    const d      = new Date(e.date + 'T00:00:00');
    const fmt    = d.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
    const isAbs  = e.status === 'absent';
    const hrs    = Number(e.hours) % 1 === 0 ? Number(e.hours) : Number(e.hours).toFixed(1);
    const badge  = isAbs
      ? `<span class="entry-absent-badge">Absent</span>`
      : `<span class="entry-hours-badge">${hrs} hrs</span>`;
    const dayNum = isAbs ? '—' : e.dayNumber;

    // Truncate details
    const detailFull = e.details || '';
    const truncated  = detailFull.length > MAX_CHARS;
    const detailShow = truncated ? detailFull.slice(0, MAX_CHARS) + '…' : detailFull;
    const moreHint   = truncated
      ? `<span class="entry-details-hint" onclick="openViewModal('${e.id}')">Read more</span>` : '';

    // Pending dot
    const isPending = USE_SUPABASE && getQueue().some(op =>
      (op.type === 'add' || op.type === 'edit') && op.payload?.id === e.id);

    return `<div class="entry-card${isAbs ? ' absent-card' : ''}" id="card-${e.id}">
      <div class="entry-day-badge">
        <span class="entry-day-num">${dayNum}</span>
        <span class="entry-day-label">Day</span>
      </div>
      <div class="entry-body" style="padding-right:60px;">
        <div class="entry-top">
          <span class="entry-date">${fmt}${isPending ? ' <span class="pending-dot" title="Pending sync">●</span>' : ''}</span>
          ${badge}
        </div>
        <p class="entry-details" onclick="openViewModal('${e.id}')">${escHtml(detailShow)}</p>
        ${moreHint}
      </div>
      <div class="entry-actions">
        <button class="entry-icon-btn edit" onclick="openEditModal('${e.id}')" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="entry-icon-btn del" onclick="openDeleteModal('${e.id}')" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ════ VIEW DETAILS MODAL ═══════════════════════════════════ */
function openViewModal(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  const isAbs = e.status === 'absent';
  const d     = new Date(e.date + 'T00:00:00');
  const fmt   = d.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('view-modal-title').textContent = isAbs ? 'Absent' : `Day ${e.dayNumber}`;
  document.getElementById('view-modal-date').textContent  = fmt;
  document.getElementById('view-modal-status-badge').innerHTML = `
    <span class="status-badge ${e.status}">
      ${isAbs
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Absent`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Present`}
    </span>`;
  document.getElementById('view-modal-hours').innerHTML = isAbs ? '' :
    `<div style="display:flex;align-items:center;gap:8px;">
       <span style="font-size:.8rem;font-weight:600;color:var(--text-secondary);">Hours worked:</span>
       <span class="entry-hours-badge">${Number(e.hours) % 1 === 0 ? Number(e.hours) : Number(e.hours).toFixed(1)} hrs</span>
     </div>`;
  document.getElementById('view-details-label').textContent = isAbs ? 'Reason for Absence' : 'Work Details';
  document.getElementById('view-modal-details').textContent = e.details;
  document.getElementById('view-modal').classList.remove('hidden');
}
function closeViewModal()        { document.getElementById('view-modal').classList.add('hidden'); }
function closeViewOutside(e)     { if (e.target.classList.contains('modal-overlay')) closeViewModal(); }

/* ════ STATUS TOGGLE IN MODAL ═══════════════════════════════ */
let currentModalStatus = 'present';

function setStatus(s) {
  currentModalStatus = s;
  document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === s));
  const isPresent = s === 'present';

  // Show/hide fields
  document.getElementById('present-fields').classList.toggle('hidden', !isPresent);
  document.getElementById('absent-date-field').classList.toggle('hidden', isPresent);
  document.getElementById('details-label').textContent = isPresent ? 'Work Details' : 'Reason for Absence';
  document.getElementById('entry-details').placeholder = isPresent ? 'What did you do today?' : 'Why were you absent?';

  // When switching to present, restore day number
  if (isPresent) {
    const editId = document.getElementById('entry-edit-id').value;
    if (!editId) document.getElementById('entry-day').value = nextPresentDayNumber();
  }
}

/* ════ ADD / EDIT MODAL ══════════════════════════════════════ */
function nextPresentDayNumber() {
  const presentEntries = entries.filter(e => e.status === 'present');
  return presentEntries.length > 0 ? Math.max(...presentEntries.map(e => e.dayNumber)) + 1 : 1;
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add DTR Entry';
  document.getElementById('entry-edit-id').value     = '';
  document.getElementById('entry-details').value     = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('entry-date').valueAsDate        = new Date();
  document.getElementById('entry-absent-date').valueAsDate = new Date();
  document.getElementById('entry-hours').value             = '';
  // Reset to present
  setStatus('present');
  document.getElementById('entry-day').value = nextPresentDayNumber();
  document.getElementById('entry-modal').classList.remove('hidden');
}

function openEditModal(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  document.getElementById('modal-title').textContent   = 'Edit DTR Entry';
  document.getElementById('entry-edit-id').value       = e.id;
  document.getElementById('entry-details').value       = e.details;
  document.getElementById('modal-error').classList.add('hidden');
  setStatus(e.status || 'present');
  if (e.status === 'absent') {
    document.getElementById('entry-absent-date').value = e.date;
  } else {
    document.getElementById('entry-day').value   = e.dayNumber;
    document.getElementById('entry-date').value  = e.date;
    document.getElementById('entry-hours').value = e.hours;
  }
  document.getElementById('entry-modal').classList.remove('hidden');
}

function closeEntryModal()       { document.getElementById('entry-modal').classList.add('hidden'); }
function closeModalOutside(e)    { if (e.target.classList.contains('modal-overlay')) closeEntryModal(); }

async function saveEntry() {
  const editId  = document.getElementById('entry-edit-id').value;
  const status  = currentModalStatus;
  const details = document.getElementById('entry-details').value.trim();

  let dayNum = null, date = '', hours = 0;

  if (status === 'present') {
    dayNum = parseInt(document.getElementById('entry-day').value);
    date   = document.getElementById('entry-date').value;
    hours  = parseFloat(document.getElementById('entry-hours').value);
    if (!dayNum || !date || !hours || hours <= 0 || !details) { showModalError('Please fill in all fields correctly.'); return; }
    if (hours > 24) { showModalError('Hours cannot exceed 24.'); return; }
  } else {
    date = document.getElementById('entry-absent-date').value;
    if (!date || !details) { showModalError('Please fill in the date and reason.'); return; }
    hours  = 0;
    dayNum = null; // absent has no day number
  }

  if (editId) {
    const idx = entries.findIndex(e => e.id === editId); if (idx === -1) return;
    const updated = { ...entries[idx], status, dayNumber: dayNum, date, hours, details };
    if (USE_SUPABASE) {
      if (navigator.onLine) {
        try { await sbFetch(`bot_entries?id=eq.${editId}`, 'PATCH', { status, day_number: dayNum, date, hours, details }); }
        catch { enqueue({ type: 'edit', payload: { id: editId, status, dayNumber: dayNum, date, hours, details } }); }
      } else {
        const q = getQueue().filter(op => !(op.payload?.id === editId && (op.type === 'edit' || op.type === 'add')));
        q.push({ type: 'edit', payload: { id: editId, status, dayNumber: dayNum, date, hours, details }, ts: Date.now() });
        saveQueue(q); updateOfflineBanner();
      }
    }
    entries[idx] = updated;
  } else {
    const id    = 'e_' + Date.now();
    const entry = { id, status, dayNumber: dayNum, date, hours, details };
    if (USE_SUPABASE) {
      if (navigator.onLine) {
        try { await sbFetch('bot_entries', 'POST', { id, user_id: currentUser.id, status, day_number: dayNum, date, hours, details }); }
        catch { enqueue({ type: 'add', payload: { id, user_id: currentUser.id, status, dayNumber: dayNum, date, hours, details } }); }
      } else {
        enqueue({ type: 'add', payload: { id, user_id: currentUser.id, status, dayNumber: dayNum, date, hours, details } });
        updateOfflineBanner();
      }
    }
    entries.push(entry);
  }

  await saveEntries_data();
  closeEntryModal();
  renderDashboard();
  renderCalendar();
  renderEntries();
  const offline = !navigator.onLine && USE_SUPABASE;
  showToast(editId
    ? (offline ? 'Entry updated (syncs when online)' : 'Entry updated ✓')
    : (offline ? 'Entry saved (syncs when online)'   : 'Entry added ✓'));
}

function showModalError(msg) { const el = document.getElementById('modal-error'); el.textContent = msg; el.classList.remove('hidden'); }

/* ════ DELETE ════════════════════════════════════════════════ */
function openDeleteModal(id)     { deleteTargetId = id; document.getElementById('delete-modal').classList.remove('hidden'); }
function closeDeleteModal()      { deleteTargetId = null; document.getElementById('delete-modal').classList.add('hidden'); }
function closeDeleteOutside(e)   { if (e.target.classList.contains('modal-overlay')) closeDeleteModal(); }

async function confirmDelete() {
  if (!deleteTargetId) return;
  const id = deleteTargetId;
  if (USE_SUPABASE) {
    if (navigator.onLine) {
      try { await sbFetch(`bot_entries?id=eq.${id}`, 'DELETE'); }
      catch { enqueue({ type: 'delete', payload: { id } }); }
    } else {
      const wasQueued = getQueue().some(op => op.type === 'add' && op.payload?.id === id);
      const q = getQueue().filter(op => op.payload?.id !== id);
      if (!wasQueued) q.push({ type: 'delete', payload: { id }, ts: Date.now() });
      saveQueue(q); updateOfflineBanner();
    }
  }
  entries = entries.filter(e => e.id !== id);
  await saveEntries_data();
  closeDeleteModal();
  renderDashboard(); renderCalendar(); renderEntries();
  showToast(!navigator.onLine && USE_SUPABASE ? 'Entry deleted (syncs when online)' : 'Entry deleted');
}

/* ════ PROFILE MODAL ══════════════════════════════════════════ */
function openProfileModal() {
  if (!profile) return;
  document.getElementById('prof-name').value       = profile.name;
  document.getElementById('prof-course').value     = profile.course;
  document.getElementById('prof-company').value    = profile.company;
  document.getElementById('prof-address').value    = profile.address;
  document.getElementById('prof-supervisor').value = profile.supervisor;
  document.getElementById('prof-hours').value      = profile.requiredHours;
  document.getElementById('profile-modal').classList.remove('hidden');
}
function closeProfileModal()     { document.getElementById('profile-modal').classList.add('hidden'); }
function closeProfileOutside(e)  { if (e.target.classList.contains('modal-overlay')) closeProfileModal(); }

async function saveProfile() {
  const name       = document.getElementById('prof-name').value.trim();
  const course     = document.getElementById('prof-course').value.trim();
  const company    = document.getElementById('prof-company').value.trim();
  const address    = document.getElementById('prof-address').value.trim();
  const supervisor = document.getElementById('prof-supervisor').value.trim();
  const hrs        = parseFloat(document.getElementById('prof-hours').value);
  if (!name || !course || !company || !address || !supervisor || !hrs || hrs < 1) { showToast('Please fill in all fields.'); return; }
  profile = { name, course, company, address, supervisor, requiredHours: hrs };
  await saveProfile_data();
  closeProfileModal(); renderDashboard();
  showToast(!navigator.onLine && USE_SUPABASE ? 'Profile saved (syncs when online)' : 'Profile saved ✓');
  updateOfflineBanner();
}

function confirmSignOut() {
  if (confirm('Sign out of Back on Track?')) {
    currentUser = null; profile = null; entries = [];
    localStorage.removeItem(LS.session);
    closeProfileModal(); showScreen('auth-screen');
    document.getElementById('signin-username').value = '';
    document.getElementById('signin-password').value = '';
  }
}

/* ════ UTILITIES ══════════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 200); }, 2500);
}

function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  const isText = inp.type === 'text'; inp.type = isText ? 'password' : 'text';
  btn.innerHTML = isText
    ? `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const af = document.querySelector('.auth-form.active');
    if (af) { const tab = document.querySelector('.auth-tab.active'); if (tab?.dataset.tab === 'signin') handleSignIn(); else handleSignUp(); }
  }
});
