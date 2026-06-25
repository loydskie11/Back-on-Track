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
const SUPABASE_URL      = '';  // e.g. 'https://xyzabc.supabase.co'
const SUPABASE_ANON_KEY = '';  // e.g. 'eyJhbGciOi...'
const USE_SUPABASE = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

/* ════ OFFLINE QUEUE ════════════════════════════════════════ */
const QUEUE_KEY = 'bot_sync_queue';
const getQueue  = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
const saveQueue = q  => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

function enqueue(op) {
  const q = getQueue(); q.push({ ...op, ts: Date.now() }); saveQueue(q);
}

function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('bot_theme', themeName);
}

// Apply the saved theme immediately on load
const savedTheme = localStorage.getItem('bot_theme') || 'default';
applyTheme(savedTheme);

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
          day_number: p.dayNumber, date: p.date, hours: p.hours,
          am_in: p.amIn, am_out: p.amOut, pm_in: p.pmIn, pm_out: p.pmOut, details: p.details
        });
      } else if (op.type === 'edit') {
        const p = op.payload;
        await sbFetch(`bot_entries?id=eq.${p.id}`, 'PATCH', {
          status: p.status, day_number: p.dayNumber,
          date: p.date, hours: p.hours, 
          am_in: p.amIn, am_out: p.amOut, pm_in: p.pmIn, pm_out: p.pmOut, details: p.details
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
        if (!localStorage.getItem('bot_v3_seen')) {
          setTimeout(() => showWhatsNewModal(), 500);
        }
      } else { showScreen('onboarding-screen'); }
    } catch { localStorage.removeItem(LS.session); showScreen('auth-screen'); }
  } else { showScreen('auth-screen'); }

  document.getElementById('entry-date').valueAsDate = new Date();
  document.getElementById('entry-absent-date').valueAsDate = new Date();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  initReminderChecker();
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
  const MAX_USERS = 16; // Testing phase limit
  
  if (USE_SUPABASE) {
    try {
      // 1. Check total user count to enforce the limit
      const allUsers = await sbFetch('bot_users?select=id');
      if (allUsers.length >= MAX_USERS) { 
        showAuthError('signup-error', `Testing Phase: Maximum limit of ${MAX_USERS} users reached.`); 
        return; 
      }

      // 2. Check if username is already taken
      const exists = await sbFetch(`bot_users?username=eq.${encodeURIComponent(username)}&select=id`);
      if (exists.length) { showAuthError('signup-error', 'Username already taken.'); return; }
      
      // 3. Create the account
      const created = await sbFetch('bot_users', 'POST', { id, username, password_hash: hash });
      currentUser = { id: created[0].id, username };
    } catch { showAuthError('signup-error', 'Could not create account. Check Supabase config.'); return; }
  } else {
    const users = JSON.parse(localStorage.getItem(LS.users) || '{}');
    
    // 1. Check total user count locally
    if (Object.keys(users).length >= MAX_USERS) {
      showAuthError('signup-error', `Testing Phase: Maximum limit of ${MAX_USERS} users reached.`); 
      return; 
    }
    
    // 2. Check if username is taken
    if (users[username]) { showAuthError('signup-error', 'Username already taken.'); return; }
    
    // 3. Create local account
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

/* ════ CANCEL ONBOARDING ════════════════════════════════════ */
function cancelOnboarding() {
  // Clear the active session and return to the auth screen
  currentUser = null;
  profile = null;
  entries = [];
  localStorage.removeItem(LS.session);
  showScreen('auth-screen');
  
  // Switch the view back to the Sign In tab by default
  document.querySelector('.auth-tab[data-tab="signin"]').click();
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
      
      // FIX: If Supabase doesn't have the profile yet (e.g., pending sync), recover it from local storage
      if (!profile) {
        const localP = localStorage.getItem(LS.profile(currentUser.id));
        if (localP) profile = JSON.parse(localP);
      }

      entries = ents.map(e => ({ 
        id: e.id, status: e.status || 'present', dayNumber: e.day_number, 
        date: e.date, hours: e.hours || 0, 
        amIn: e.am_in, amOut: e.am_out, pmIn: e.pm_in, pmOut: e.pm_out, 
        details: e.details || '' 
      }));
      
      // FIX: Also recover entries from local storage if Supabase returned empty
      if (entries.length === 0) {
        const localE = localStorage.getItem(LS.entries(currentUser.id));
        if (localE) entries = JSON.parse(localE);
      }

      if (profile) localStorage.setItem(LS.profile(currentUser.id), JSON.stringify(profile));
      localStorage.setItem(LS.entries(currentUser.id), JSON.stringify(entries));
      
      // Ensure status field exists on old entries
      entries = entries.map(en => ({ status: 'present', ...en }));
      return;
    } catch { /* fall through to local storage if fetch fails completely */ }
  }
  
  // Local fallback (Offline mode)
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
  
  // Updated to 2 decimal places
  const doneFmt   = doneHrs % 1 === 0 ? doneHrs : doneHrs.toFixed(2);
  const pct       = totalHrs > 0 ? Math.min((doneHrs / totalHrs) * 100, 100) : 0;
  const totalDays = presentE.length;
  const estDays   = totalHrs > 0 && doneHrs > 0 ? Math.ceil(totalHrs / (doneHrs / totalDays)) : 0;
  
  let ll, rl, pl, rql, fp;
  if (mode === 'hours') {
    const left = Math.max(totalHrs - doneHrs, 0);
    // Updated to 2 decimal places
    ll = `${doneFmt} hrs done`; rl = `${left % 1 === 0 ? left : left.toFixed(2)} hrs left`;
    pl = `${pct.toFixed(1)}%`; rql = `of ${totalHrs} hrs required`; fp = pct;
  } else if (mode === 'days') {
    ll = `${totalDays} day${totalDays !== 1 ? 's' : ''} logged`;
    rl = estDays > 0 ? `~${Math.max(estDays - totalDays, 0)} days left` : '—';
    pl = `${totalDays} days`;
    // Updated to 2 decimal places
    rql = `at avg ${totalDays > 0 ? (doneHrs / totalDays).toFixed(2) : 0} hrs/day`;
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

/* ════ VIEW TAB SWITCHER ═════════════════════════════════════ */
function switchTab(tab) {
  // Update tab buttons
  document.getElementById('tab-entries').classList.toggle('active', tab === 'entries');
  document.getElementById('tab-calendar').classList.toggle('active', tab === 'calendar');
  // Show/hide panels
  document.getElementById('panel-entries').classList.toggle('hidden', tab !== 'entries');
  document.getElementById('panel-calendar').classList.toggle('hidden', tab !== 'calendar');
  // Re-render calendar when switching to it so it's always fresh
  if (tab === 'calendar') renderCalendar();
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
    const hrs    = Number(e.hours) % 1 === 0 ? Number(e.hours) : Number(e.hours).toFixed(2);
    const badge  = isAbs
      ? `<span class="entry-absent-badge">Absent</span>`
      : `<span class="entry-hours-badge">${hrs} hrs</span>`;
    const dayNum = isAbs ? '—' : e.dayNumber;

    // Truncate details
    const detailFull = e.details || '';
    const truncated  = detailFull.length > MAX_CHARS;
    const detailShow = truncated ? detailFull.slice(0, MAX_CHARS) + '…' : detailFull;
    
    // Removed the onclick from here since the parent card will handle it
    const moreHint   = truncated
      ? `<span class="entry-details-hint">Read more</span>` : '';

    // Pending dot
    const isPending = USE_SUPABASE && getQueue().some(op =>
      (op.type === 'add' || op.type === 'edit') && op.payload?.id === e.id);

    // Added onclick and cursor:pointer to the main card
    return `<div class="entry-card${isAbs ? ' absent-card' : ''}" id="card-${e.id}" onclick="openViewModal('${e.id}')" style="cursor: pointer;">
      <div class="entry-day-badge">
        <span class="entry-day-num">${dayNum}</span>
        <span class="entry-day-label">Day</span>
      </div>
      <div class="entry-body" style="padding-right:60px;">
        <div class="entry-top">
          <span class="entry-date">${fmt}${isPending ? ' <span class="pending-dot" title="Pending sync">●</span>' : ''}</span>
          ${badge}
        </div>
        <p class="entry-details">${escHtml(detailShow)}</p>
        ${moreHint}
      </div>
      <div class="entry-actions">
        <button class="entry-icon-btn edit" onclick="event.stopPropagation(); openEditModal('${e.id}')" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="entry-icon-btn del" onclick="event.stopPropagation(); openDeleteModal('${e.id}')" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1-1v2"/>
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
  const timeDisplay = (!isAbs && e.timeIn && e.timeOut) 
    ? `<span class="entry-absent-badge" style="background:var(--indigo-50); color:var(--indigo-700); border-color:var(--indigo-100);">${e.timeIn} - ${e.timeOut}</span>` 
    : '';

  let timeDisplays = [];
  if (!isAbs) {
    if (e.amIn && e.amOut) timeDisplays.push(`<span class="entry-absent-badge" style="background:var(--indigo-50); color:var(--indigo-700); border-color:var(--indigo-100);">AM: ${e.amIn} - ${e.amOut}</span>`);
    if (e.pmIn && e.pmOut) timeDisplays.push(`<span class="entry-absent-badge" style="background:var(--indigo-50); color:var(--indigo-700); border-color:var(--indigo-100);">PM: ${e.pmIn} - ${e.pmOut}</span>`);
  }
  const timeDisplayHtml = timeDisplays.join(' ');

  document.getElementById('view-modal-hours').innerHTML = isAbs ? '' :
    `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
       <span style="font-size:.8rem;font-weight:600;color:var(--text-secondary);">Hours worked:</span>
       <span class="entry-hours-badge">${Number(e.hours) % 1 === 0 ? Number(e.hours) : Number(e.hours).toFixed(2)} hrs</span>
       ${timeDisplayHtml}
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

/* ════ HOURS CALCULATION ═════════════════════════════════════ */
/* ════ HOURS CALCULATION ═════════════════════════════════════ */
function calculateHours() {
  const amIn = document.getElementById('entry-am-in').value;
  const amOut = document.getElementById('entry-am-out').value;
  const pmIn = document.getElementById('entry-pm-in').value;
  const pmOut = document.getElementById('entry-pm-out').value;
  
  let hrs = 0;
  
  // Add Morning Hours
  if (amIn && amOut) {
    const dIn = new Date(`2000-01-01T${amIn}`);
    let dOut = new Date(`2000-01-01T${amOut}`);
    if (dOut < dIn) dOut.setDate(dOut.getDate() + 1); // handles overnight shifts safely
    hrs += (dOut - dIn) / 3600000;
  }
  
  // Add Afternoon Hours
  if (pmIn && pmOut) {
    const dIn = new Date(`2000-01-01T${pmIn}`);
    let dOut = new Date(`2000-01-01T${pmOut}`);
    if (dOut < dIn) dOut.setDate(dOut.getDate() + 1);
    hrs += (dOut - dIn) / 3600000;
  }
  
  if (hrs < 0) hrs = 0;
  
  // Round accurately to 2 decimal places to avoid floating point math errors
  hrs = Math.round(hrs * 100) / 100;
  
  document.getElementById('entry-hours').value = hrs;
  document.getElementById('calculated-hours').textContent = `${hrs % 1 === 0 ? hrs : hrs.toFixed(2)} hrs`;
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add DTR Entry';
  document.getElementById('entry-edit-id').value     = '';
  document.getElementById('entry-details').value     = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('entry-date').valueAsDate        = new Date();
  document.getElementById('entry-absent-date').valueAsDate = new Date();
  
  // Set default hours (08:00 AM - 12:00 PM, 01:00 PM - 05:00 PM)
  document.getElementById('entry-am-in').value = '08:00';
  document.getElementById('entry-am-out').value = '12:00';
  document.getElementById('entry-pm-in').value = '13:00';
  document.getElementById('entry-pm-out').value = '17:00';
  calculateHours();
  
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
    
    document.getElementById('entry-am-in').value = e.amIn || '';
    document.getElementById('entry-am-out').value = e.amOut || '';
    document.getElementById('entry-pm-in').value = e.pmIn || '';
    document.getElementById('entry-pm-out').value = e.pmOut || '';
    
    // Fallback for older legacy entries
    if (e.amIn || e.amOut || e.pmIn || e.pmOut) {
      calculateHours();
    } else {
      document.getElementById('entry-hours').value = e.hours;
      document.getElementById('calculated-hours').textContent = `${Number(e.hours) % 1 === 0 ? Number(e.hours) : Number(e.hours).toFixed(2)} hrs (Legacy)`;
    }
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
  let amIn = null, amOut = null, pmIn = null, pmOut = null;

  if (status === 'present') {
    dayNum = parseInt(document.getElementById('entry-day').value);
    date   = document.getElementById('entry-date').value;
    amIn   = document.getElementById('entry-am-in').value;
    amOut  = document.getElementById('entry-am-out').value;
    pmIn   = document.getElementById('entry-pm-in').value;
    pmOut  = document.getElementById('entry-pm-out').value;
    hours  = parseFloat(document.getElementById('entry-hours').value);
    
    if (!dayNum || !date || hours <= 0 || !details) { 
      showModalError('Please ensure hours are calculated and details are filled.'); return; 
    }
    if (hours > 24) { showModalError('Hours cannot exceed 24.'); return; }
  } else {
    date = document.getElementById('entry-absent-date').value;
    if (!date || !details) { showModalError('Please fill in the date and reason.'); return; }
  }

  const payload = { status, dayNumber: dayNum, date, hours, amIn, amOut, pmIn, pmOut, details };

  if (editId) {
    const idx = entries.findIndex(e => e.id === editId); if (idx === -1) return;
    const updated = { ...entries[idx], ...payload };
    if (USE_SUPABASE) {
      if (navigator.onLine) {
        try { await sbFetch(`bot_entries?id=eq.${editId}`, 'PATCH', { status, day_number: dayNum, date, hours, am_in: amIn, am_out: amOut, pm_in: pmIn, pm_out: pmOut, details }); }
        catch { enqueue({ type: 'edit', payload: { id: editId, ...payload } }); }
      } else {
        const q = getQueue().filter(op => !(op.payload?.id === editId && (op.type === 'edit' || op.type === 'add')));
        q.push({ type: 'edit', payload: { id: editId, ...payload }, ts: Date.now() });
        saveQueue(q); updateOfflineBanner();
      }
    }
    entries[idx] = updated;
  } else {
    const id = 'e_' + Date.now();
    const entry = { id, ...payload };
    if (USE_SUPABASE) {
      if (navigator.onLine) {
        try { await sbFetch('bot_entries', 'POST', { id, user_id: currentUser.id, status, day_number: dayNum, date, hours, am_in: amIn, am_out: amOut, pm_in: pmIn, pm_out: pmOut, details }); }
        catch { enqueue({ type: 'add', payload: { id, user_id: currentUser.id, ...payload } }); }
      } else {
        enqueue({ type: 'add', payload: { id, user_id: currentUser.id, ...payload } });
        updateOfflineBanner();
      }
    }
    entries.push(entry);
  }

  await saveEntries_data();
  closeEntryModal();
  renderDashboard(); renderCalendar(); renderEntries();
  const offline = !navigator.onLine && USE_SUPABASE;
  showToast(editId ? (offline ? 'Entry updated (syncs when online)' : 'Entry updated ✓') : (offline ? 'Entry saved (syncs when online)' : 'Entry added ✓'));
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

/* ════ CHECK PROFILE CHANGES ═════════════════════════════════ */
function checkProfileChanges() {
  if (!profile) return;
  const btn = document.getElementById('btn-save-profile');
  
  const name = document.getElementById('prof-name').value.trim();
  const course = document.getElementById('prof-course').value.trim();
  const company = document.getElementById('prof-company').value.trim();
  const address = document.getElementById('prof-address').value.trim();
  const supervisor = document.getElementById('prof-supervisor').value.trim();
  const hrs = parseFloat(document.getElementById('prof-hours').value) || 0;

  const theme = document.getElementById('prof-theme').value;
  const savedTheme = localStorage.getItem('bot_theme') || 'default';

  const settings = JSON.parse(localStorage.getItem(`bot_settings_${currentUser.id}`) || '{}');
  const remToggle = document.getElementById('prof-reminder-toggle').checked;
  const remTime = document.getElementById('prof-reminder-time').value;

  const isProfileChanged = 
    name !== profile.name || course !== profile.course ||
    company !== profile.company || address !== profile.address ||
    supervisor !== profile.supervisor || hrs !== profile.requiredHours;

  const isThemeChanged = theme !== savedTheme;
  const isRemChanged = remToggle !== (settings.reminderEnabled || false) || remTime !== (settings.reminderTime || '17:00');

  if (isProfileChanged || isThemeChanged || isRemChanged) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  }
}

/* ════ PROFILE MODAL ══════════════════════════════════════════ */
function openProfileModal() {
  if (!profile) return;
  document.body.classList.add('no-scroll'); // Locks background scrolling
  
  document.getElementById('prof-name').value       = profile.name;
  document.getElementById('prof-course').value     = profile.course;
  document.getElementById('prof-company').value    = profile.company;
  document.getElementById('prof-address').value    = profile.address;
  document.getElementById('prof-supervisor').value = profile.supervisor;
  document.getElementById('prof-hours').value      = profile.requiredHours;
  
  const savedT = localStorage.getItem('bot_theme') || 'default';
  document.getElementById('prof-theme').value = savedT;
  const labels = { 'default': 'Indigo (Default)', 'earthy': 'Warm Earth', 'high-contrast': 'Professional High-Contrast' };
  document.getElementById('theme-label').textContent = labels[savedT] || 'Indigo (Default)';

  const settings = JSON.parse(localStorage.getItem(`bot_settings_${currentUser.id}`) || '{}');
  const isEnabled = settings.reminderEnabled || false;
  document.getElementById('prof-reminder-toggle').checked = isEnabled;
  document.getElementById('prof-reminder-time').value = settings.reminderTime || '17:00';
  document.getElementById('reminder-time-row').classList.toggle('hidden', !isEnabled);
  
  checkProfileChanges(); // Set save button to disabled initially
  
  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() { 
  document.body.classList.remove('no-scroll'); // Unlocks background scrolling
  document.getElementById('profile-modal').classList.add('hidden'); 
}
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
  
  // Save Theme
  const selectedTheme = document.getElementById('prof-theme').value;
  applyTheme(selectedTheme);

  // Save Reminder Settings Locally
  const settings = {
    reminderEnabled: document.getElementById('prof-reminder-toggle').checked,
    reminderTime: document.getElementById('prof-reminder-time').value
  };
  localStorage.setItem(`bot_settings_${currentUser.id}`, JSON.stringify(settings));
  
  await saveProfile_data();
  closeProfileModal(); renderDashboard();
  showToast(!navigator.onLine && USE_SUPABASE ? 'Profile saved (syncs when online)' : 'Profile saved ✓');
  updateOfflineBanner();
}

/* ════ SIGN OUT MODAL ═════════════════════════════════════════ */
function confirmSignOut() {
  document.getElementById('signout-modal').classList.remove('hidden');
}

function closeSignOutModal() {
  document.getElementById('signout-modal').classList.add('hidden');
}

function closeSignOutOutside(e) {
  if (e.target.classList.contains('modal-overlay')) closeSignOutModal();
}

function executeSignOut() {
  currentUser = null; profile = null; entries = [];
  localStorage.removeItem(LS.session);
  closeSignOutModal();
  closeProfileModal();
  showScreen('auth-screen');
  document.getElementById('signin-username').value = '';
  document.getElementById('signin-password').value = '';
}

/* ════ CUSTOM DROPDOWN ════════════════════════════════════════ */
function toggleThemeDropdown(e) {
  e.stopPropagation();
  document.getElementById('theme-menu').classList.toggle('hidden');
}

function selectThemeOpt(val, label) {
  document.getElementById('prof-theme').value = val;
  document.getElementById('theme-label').textContent = label;
  document.getElementById('theme-menu').classList.add('hidden');
  checkProfileChanges();
}

// Close custom dropdown when clicking outside
document.addEventListener('click', () => {
  const menu = document.getElementById('theme-menu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
});

/* ════ PROGRESS DROPDOWN ══════════════════════════════════════ */
function toggleProgressDropdown(e) {
  e.stopPropagation();
  document.getElementById('progress-menu').classList.toggle('hidden');
}

function selectProgressOpt(val, label) {
  document.getElementById('progress-select').value = val;
  document.getElementById('progress-label').textContent = label;
  document.getElementById('progress-menu').classList.add('hidden');
  updateProgressBar(val);
}

/* ════ SEARCH CLEAR FUNCTIONALITY ═════════════════════════════ */
function handleSearch() {
  const val = document.getElementById('search-input').value;
  const clearBtn = document.getElementById('search-clear');
  if (val.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }
  renderEntries();
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.add('hidden');
  input.focus();
  renderEntries();
}

/* ════ CLOSE MENUS ON OUTSIDE CLICK ═══════════════════════════ */
document.addEventListener('click', () => {
  const themeMenu = document.getElementById('theme-menu');
  if (themeMenu && !themeMenu.classList.contains('hidden')) {
    themeMenu.classList.add('hidden');
  }
  
  const progressMenu = document.getElementById('progress-menu');
  if (progressMenu && !progressMenu.classList.contains('hidden')) {
    progressMenu.classList.add('hidden');
  }
});

/* ════ CSV EXPORT ═════════════════════════════════════════════ */
function exportToCSV() {
  if (!entries.length) {
    showToast('No entries to export.');
    return;
  }
  
  let csvContent = "";
  
  // 1. Add Profile Summary Header
  if (profile) {
    csvContent += `Name,${profile.name}\n`;
    csvContent += `Course,${profile.course}\n`;
    csvContent += `Company,${profile.company}\n`;
    csvContent += `Supervisor,${profile.supervisor}\n`;
    
    // Calculate total completed hours
    const presentE = entries.filter(e => e.status === 'present');
    const doneHrs = presentE.reduce((s, e) => s + Number(e.hours), 0);
    csvContent += `Total Hours Done,${doneHrs} / ${profile.requiredHours}\n\n`;
  }
  
  // 2. Add Table Columns
  csvContent += "Date,Day Number,Status,Hours,AM In,AM Out,PM In,PM Out,Work Details\n";
  
  // 3. Sort entries chronologically
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // 4. Map entries to CSV rows
  sortedEntries.forEach(e => {
    const date = e.date;
    const day = e.status === 'absent' ? 'N/A' : e.dayNumber;
    const status = e.status === 'absent' ? 'Absent' : 'Present';
    const hours = e.status === 'absent' ? 0 : e.hours;
    
    const amI = e.amIn || '';
    const amO = e.amOut || '';
    const pmI = e.pmIn || '';
    const pmO = e.pmOut || '';
    
    // Escape quotes
    const details = `"${String(e.details || '').replace(/"/g, '""')}"`;
    
    csvContent += `${date},${day},${status},${hours},${amI},${amO},${pmI},${pmO},${details}\n`;
  });
  
  // 5. Create a Blob and trigger the offline download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  link.setAttribute("href", url);
  
  // Create a clean filename
  const userName = profile && profile.name ? profile.name.replace(/\s+/g, '_') : 'OJT';
  link.setAttribute("download", `DTR_Journal_${userName}.csv`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url); // Clean up memory
  
  closeProfileModal();
  showToast('Exported to CSV ✓');
}

/* ════ DATA BACKUP & RESTORE ══════════════════════════════════ */
function backupData() {
  if (!profile && entries.length === 0) {
    showToast('No data to backup.');
    return;
  }
  
  const backupObj = {
    bot_version: "2.0",
    timestamp: new Date().toISOString(),
    profile: profile,
    entries: entries
  };
  
  // Create JSON Blob and trigger download
  const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const userName = profile && profile.name ? profile.name.replace(/\s+/g, '_') : 'User';
  link.download = `BOT_Backup_${userName}_${dateStr}.json`;
  
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('Backup saved ✓');
}

function restoreData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      // Basic validation to ensure it's our app's backup file
      if (!data.profile && !data.entries) {
        throw new Error('Invalid backup file');
      }
      
      // Ask for confirmation before overwriting
      if (confirm('Restoring data will overwrite your current profile and entries. Are you sure you want to continue?')) {
        
        if (data.profile) profile = data.profile;
        if (data.entries) entries = data.entries;
        
        // Save to local storage
        await saveProfile_data();
        await saveEntries_data();
        
        // Update UI
        renderDashboard();
        renderCalendar();
        renderEntries();
        closeProfileModal();
        
        showToast('Data restored successfully ✓');
      }
    } catch (err) {
      showToast('Error: Invalid backup file format.');
      console.error(err);
    } finally {
      // Clear the input value so the same file can be selected again if needed
      event.target.value = '';
    }
  };
  
  reader.readAsText(file);
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

/* ════ NOTIFICATIONS ══════════════════════════════════════════ */
function handleReminderToggle(e) {
  if (e.target.checked) {
    if (!('Notification' in window)) {
      showToast('Notifications not supported on this browser.');
      e.target.checked = false;
      checkProfileChanges();
      return;
    }
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm !== 'granted') {
          e.target.checked = false;
          showToast('Permission denied.');
          document.getElementById('reminder-time-row').classList.add('hidden');
        } else {
          document.getElementById('reminder-time-row').classList.remove('hidden');
        }
        checkProfileChanges();
      });
    } else if (Notification.permission === 'denied') {
      showToast('Notifications blocked in browser settings.');
      e.target.checked = false;
      checkProfileChanges();
    } else {
      document.getElementById('reminder-time-row').classList.remove('hidden');
      checkProfileChanges();
    }
  } else {
    document.getElementById('reminder-time-row').classList.add('hidden');
    checkProfileChanges();
  }
}

function initReminderChecker() {
  setInterval(() => {
    if (!currentUser) return;
    const s = localStorage.getItem(`bot_settings_${currentUser.id}`);
    if (!s) return;
    const settings = JSON.parse(s);
    
    if (settings.reminderEnabled && settings.reminderTime) {
      const now = new Date();
      const currentHrs = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${currentHrs}:${currentMins}`;
      
      if (currentTime === settings.reminderTime) {
        const lastNotified = localStorage.getItem('bot_last_notified');
        const today = now.toDateString();
        // Prevent spamming multiple notifications in the same minute/day
        if (lastNotified !== today) {
          if (Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
              navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('Back on Track', {
                  body: "Time to log your DTR! Don't forget your hours today.",
                  icon: 'icons/icon-192.png',
                  badge: 'icons/icon-192.png'
                });
              });
            } else {
              new Notification('Back on Track', { body: "Time to log your DTR! Don't forget your hours today." });
            }
          }
          localStorage.setItem('bot_last_notified', today);
        }
      }
    }
  }, 60000); // Check every 60 seconds
}

/* ════ EXPORT DTR (FORM 48) ═══════════════════════════════════ */
function openDtrModal() {
  document.getElementById('dtr-format-toggle').checked = false;
  document.getElementById('dtr-month-1').value = '';
  document.getElementById('dtr-month-2').value = '';
  document.getElementById('dtr-month-2-row').classList.add('hidden');
  document.getElementById('label-month-1').textContent = 'Month';
  validateDtrExport();
  
  closeProfileModal();
  document.getElementById('dtr-modal').classList.remove('hidden');
}

function closeDtrModal() {
  document.getElementById('dtr-modal').classList.add('hidden');
}

function closeDtrOutside(e) {
  if (e.target.classList.contains('modal-overlay')) closeDtrModal();
}

function handleDtrFormatToggle(e) {
  const isTwoCopies = e.target.checked;
  const row2 = document.getElementById('dtr-month-2-row');
  const label1 = document.getElementById('label-month-1');
  
  if (isTwoCopies) {
    row2.classList.remove('hidden');
    label1.textContent = 'Month 1';
  } else {
    row2.classList.add('hidden');
    document.getElementById('dtr-month-2').value = '';
    label1.textContent = 'Month';
  }
  validateDtrExport();
}

function validateDtrExport() {
  const isTwoCopies = document.getElementById('dtr-format-toggle').checked;
  const m1 = document.getElementById('dtr-month-1').value;
  const m2 = document.getElementById('dtr-month-2').value;
  const btn = document.getElementById('btn-print-dtr');
  
  let isValid = false;
  if (isTwoCopies) {
    isValid = m1 !== '' && m2 !== '';
  } else {
    isValid = m1 !== '';
  }
  
  if (isValid) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  }
}

// Helper to generate one physical copy of Form 48
function buildDtrCopyHtml(monthValue) {
  if (!monthValue) return '';
  
  // Parse month
  const [yearStr, monthStr] = monthValue.split('-');
  const yearNum = parseInt(yearStr);
  const monthIdx = parseInt(monthStr) - 1; // 0-based
  const dateObj = new Date(yearNum, monthIdx, 1);
  const monthName = dateObj.toLocaleDateString('en-PH', { month: 'long' });
  const daysInMonth = new Date(yearNum, monthIdx + 1, 0).getDate();
  
  const empName = profile && profile.name ? profile.name : '';
  
  // Filter entries for this specific month/year
  const monthEntries = entries.filter(e => {
    if (e.status === 'absent') return false;
    const ed = new Date(e.date + 'T00:00:00');
    return ed.getFullYear() === yearNum && ed.getMonth() === monthIdx;
  });
  
  // Build lookup map by day number
  const dayMap = {};
  monthEntries.forEach(e => {
    const ed = new Date(e.date + 'T00:00:00');
    dayMap[ed.getDate()] = e;
  });

  let rowsHtml = '';
  let totalMinutes = 0; // Changed from totalHours to totalMinutes for precision
  
  for (let d = 1; d <= 31; d++) {
    if (d > daysInMonth) {
      // Blank out rows for days that don't exist in this month (e.g. Feb 30)
      rowsHtml += `<tr><td>${d}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
      continue;
    }
    
    const ent = dayMap[d];
    if (ent) {
      const amI = ent.amIn ? formatTimePrint(ent.amIn) : '';
      const amO = ent.amOut ? formatTimePrint(ent.amOut) : '';
      const pmI = ent.pmIn ? formatTimePrint(ent.pmIn) : '';
      const pmO = ent.pmOut ? formatTimePrint(ent.pmOut) : '';
      
      // Calculate exact minutes directly from timestamps for a perfect total
      let dailyMins = 0;
      let hasTimeSlots = false;
      
      if (ent.amIn && ent.amOut) {
        const dIn = new Date(`2000-01-01T${ent.amIn}`);
        let dOut = new Date(`2000-01-01T${ent.amOut}`);
        if (dOut < dIn) dOut.setDate(dOut.getDate() + 1);
        dailyMins += Math.round((dOut - dIn) / 60000);
        hasTimeSlots = true;
      }
      if (ent.pmIn && ent.pmOut) {
        const dIn = new Date(`2000-01-01T${ent.pmIn}`);
        let dOut = new Date(`2000-01-01T${ent.pmOut}`);
        if (dOut < dIn) dOut.setDate(dOut.getDate() + 1);
        dailyMins += Math.round((dOut - dIn) / 60000);
        hasTimeSlots = true;
      }
      
      // Fallback: If it's an old legacy entry with no timestamps, convert its decimal hours to minutes
      if (!hasTimeSlots && ent.hours) {
        dailyMins += Math.round(parseFloat(ent.hours) * 60);
      }
      
      totalMinutes += dailyMins;

      rowsHtml += `<tr><td>${d}</td><td>${amI}</td><td>${amO}</td><td>${pmI}</td><td>${pmO}</td><td></td><td></td></tr>`;
    } else {
      // Empty row
      rowsHtml += `<tr><td>${d}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }
  }

  // Format the total exact hours and minutes (e.g., "140:15 hrs")
  const tHours = Math.floor(totalMinutes / 60);
  const tMins = totalMinutes % 60;
  const totalDisplay = tMins > 0 ? `${tHours}:${String(tMins).padStart(2, '0')} hrs` : `${tHours} hrs`;

  return `
    <div class="dtr-copy">
      <h5>Civil Service Form No. 48</h5>
      <h2>DAILY TIME RECORD</h2>
      
      <div style="text-align: center; margin-bottom: 8px;">
        <div class="dtr-line" style="width: 80%;">${empName}</div>
        <div class="dtr-text">(Name)</div>
      </div>
      
      <div style="margin-bottom: 8px;" class="dtr-text">
        For the month of <span class="dtr-line" style="width: 120px;">${monthName}</span> 20<span class="dtr-line" style="width: 40px;">${yearStr.slice(-2)}</span><br>
        Official hours of arrival and departure:<br>
        Regular Days <span class="dtr-line" style="width: 100px;"></span> Saturdays <span class="dtr-line" style="width: 100px;"></span>
      </div>
      
      <table class="dtr-table">
        <thead>
          <tr>
            <th rowspan="2" style="width:10%;">Days</th>
            <th colspan="2" style="width:34%;">A. M.</th>
            <th colspan="2" style="width:34%;">P. M.</th>
            <th colspan="2" style="width:22%;">UNDER TIME</th>
          </tr>
          <tr>
            <th style="width:17%;">ARRIVAL</th>
            <th style="width:17%;">DEPARTURE</th>
            <th style="width:17%;">ARRIVAL</th>
            <th style="width:17%;">DEPARTURE</th>
            <th style="width:11%;">Hours</th>
            <th style="width:11%;">Minutes</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr>
            <td colspan="5" style="text-align:right; font-weight:bold; padding-right:10px;">TOTAL</td>
            <td colspan="2" style="font-weight:bold;">${totalDisplay}</td>
          </tr>
        </tbody>
      </table>
      
      <p class="dtr-cert">
        I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
      </p>
      
      <div class="dtr-signature">
        <div class="dtr-signature-line"></div>
        Verified as to the prescribed office hours:<br><br>
        <div class="dtr-signature-line"></div>
        In-Charge
      </div>
    </div>
  `;
}

function formatTimePrint(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  let hour = parseInt(h, 10);
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${String(hour).padStart(2,'0')}:${m}`;
}

function executeDtrPrint() {
  const isTwoCopies = document.getElementById('dtr-format-toggle').checked;
  const m1 = document.getElementById('dtr-month-1').value;
  const m2 = document.getElementById('dtr-month-2').value;
  
  const printArea = document.getElementById('print-area');
  
  if (isTwoCopies) {
    // Generate side-by-side
    const copy1 = buildDtrCopyHtml(m1);
    const copy2 = buildDtrCopyHtml(m2);
    printArea.innerHTML = copy1 + copy2;
  } else {
    // Generate just one
    printArea.innerHTML = buildDtrCopyHtml(m1);
  }
  
  closeDtrModal();
  
  // Slight delay to allow CSS to unhide print area
  setTimeout(() => {
    window.print();
  }, 150);
}

/* ════ WHAT'S NEW MODAL (DYNAMIC INJECTION) ═══════════════════ */
function showWhatsNewModal() {
  const container = document.getElementById('dynamic-modals');
  
  // Inject the HTML
  container.innerHTML = `
    <div id="whatsnew-modal" class="modal-overlay" onclick="closeWhatsNewOutside(event)">
      <div class="modal-card">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.5rem; background: var(--indigo-100); padding: 6px; border-radius: 12px;">🎉</span>
            <h3 style="font-size: 1.2rem;">What's New in v2.0</h3>
          </div>
        </div>
        <div class="modal-body" style="gap: 20px; padding-top: 16px;">
          <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.5;">Welcome to the biggest update for <strong>Back on Track</strong>! Here are the new features we've added based on your feedback:</p>
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            
            <!-- 1. One-Click CSV Report -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">One-Click CSV Report</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Instantly generate and download a formatted journal of all your entries for easy spreadsheet viewing.</p>
              </div>
            </div>

            <!-- 2. Custom Themes -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">Custom Themes</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Personalize your app with beautiful new color palettes, including Warm Earth and Professional High-Contrast.</p>
              </div>
            </div>

            <!-- 3. Push Notifications/Daily Reminder -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">Daily Reminders</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Set custom offline push notifications so you never forget to log your daily hours again.</p>
              </div>
            </div>

            <!-- 4. Automated Data Backup & Restore -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">Automated Data Backup & Restore</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Safeguard your offline data by exporting a JSON backup and easily restoring it on any device.</p>
              </div>
            </div>

            <!-- 5. 4-Slot Time In and Out Format -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">4-Slot Time In/Out</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Log exact Arrival and Departure times for Morning and Afternoon with automatic minute-level accuracy.</p>
              </div>
            </div>

            <!-- 6. DTR Form 48 Print/Save PDF -->
            <div style="display: flex; gap: 14px; align-items: flex-start;">
              <div class="settings-icon" style="background: var(--indigo-50); color: var(--indigo-600);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2"/><polyline points="6 14 12 20 18 14"/><line x1="12" y1="20" x2="12" y2="4"/></svg></div>
              <div style="flex: 1;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">Export DTR Form 48</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">Print or save your entries directly into the official Civil Service Form No. 48 format, including side-by-side copies.</p>
              </div>
            </div>
            
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-primary full" onclick="closeWhatsNewModal()">Awesome, let's go!</button>
        </div>
      </div>
    </div>
  `;
}
function closeWhatsNewModal() {
  document.getElementById('dynamic-modals').innerHTML = ''; // Clears the modal from the DOM
  localStorage.setItem('bot_v2_seen', 'true'); // Saves the flag
}

function closeWhatsNewOutside(e) {
  if (e.target.classList.contains('modal-overlay')) closeWhatsNewModal();
}