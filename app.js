/* ============================================================================
   CLIENT OPENING TRACKER  —  APP LOGIC (what the page DOES)

   You normally do NOT need this file to change how things LOOK — colors and
   layout live in styles.css. This file is the behavior.

   How it's organized, top to bottom:
     1.  CONFIG ........ database connection settings
     2.  State ......... in-memory lists (clients, reminders) + translators
     3.  Auth .......... sign in / sign out
     4.  Data load ..... read everything from the database + keep it live
     5.  Helpers ....... date math, follow-up flags, text escaping
     6.  Rendering ..... draw the table, stat cards, page buttons
     7.  Add / Edit .... the client dialog
     8.  Delete ........ remove a client (with a confirm step)
     9.  Activity log .. records who changed what
     10. Reminders ..... the 🔔 feature (add/edit + Add-to-Calendar)
     11. CSV export
     12. Startup
   ============================================================================ */

/* ============================================================================
   CLIENT OPENING TRACKER
   A single-page app. All data lives in a Supabase table called `locations`.
   The page reads/writes that table directly, so every teammate sees the same
   data live. Access requires a real login (Supabase Auth); every change is
   written to an `activity_log` table.
   Sections below: CONFIG → state → AUTH → data load → helpers → rendering →
   add/edit modal → delete → activity log → CSV export → misc/startup.
   ========================================================================== */

// --- Connection settings -----------------------------------------------------
const CONFIG = {
  supabaseUrl: 'https://hhistoyrbwxyywoyhdod.supabase.co',   // the project's API URL
  supabaseKey: 'sb_publishable_odHKPTKaGUQ4VRAs5iG5pg_9VtFRgbJ' // public ("anon") key — safe to expose
};

// --- App state ---------------------------------------------------------------
const sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey); // DB client
let data = [];                 // all rows loaded from the database (camelCase form)
let reminders = [];            // all reminder rows (camelCase form)
let currentUser = null;        // the logged-in Supabase user (null when signed out)
let currentPage = 1;           // which page of the table is showing
let currentView = 'active';    // 'active' | 'opened' | 'reminders' | 'activity'
const PAGE_SIZE = 10;          // rows shown per page
const STATUS_LABELS = { "on-track":"On track","at-risk":"At risk","delayed":"Delayed","opened":"Opened" };

// The database uses snake_case column names; the app uses camelCase. These two
// helpers translate between the two shapes whenever we read or write.
function toDb(o){ return { id:o.id, client_name:o.clientName, name:o.name, tier:o.tier, opening_date:o.openingDate, tracker:o.tracker, status:o.status, notes:o.notes, pre_open_done:o.preOpenDone, post_open_done:o.postOpenDone, opened_date:o.openedDate||null, open_outcome:o.openOutcome||null }; }
function fromDb(r){ return { id:r.id, clientName:r.client_name, name:r.name, tier:r.tier, openingDate:r.opening_date, tracker:r.tracker, status:r.status, notes:r.notes, preOpenDone:r.pre_open_done, postOpenDone:r.post_open_done, openedDate:r.opened_date, openOutcome:r.open_outcome }; }

// Same translation for the reminders table.
function toDbRem(o){ return { id:o.id, location_id:o.locationId||null, title:o.title, remind_on:o.remindOn, assignee:o.assignee||null, notes:o.notes||null, done:o.done, created_by:o.createdBy||null }; }
function fromDbRem(r){ return { id:r.id, locationId:r.location_id, title:r.title, remindOn:r.remind_on, assignee:r.assignee, notes:r.notes, done:r.done, createdBy:r.created_by, createdAt:r.created_at }; }

/* --- Authentication ----------------------------------------------------------
   The app stays hidden behind a login screen until a valid session exists.
   Accounts are created by an admin in the Supabase dashboard.                */
// Try to sign in with the email + password from the login form.
async function signIn() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  document.getElementById('loginBtn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  document.getElementById('loginBtn').disabled = false;
  if (error) { document.getElementById('loginErr').textContent = error.message; }
  // On success, onAuthStateChange (below) reveals the app automatically.
}
// Sign the current user out (returns them to the login screen).
async function signOut() { await sb.auth.signOut(); }

// React to login/logout. Shows or hides the app and loads data when signed in.
function handleAuth(session) {
  currentUser = session ? session.user : null;
  const loggedIn = !!currentUser;
  document.getElementById('loginScreen').style.display = loggedIn ? 'none' : 'flex';
  document.getElementById('app').style.display = loggedIn ? 'block' : 'none';
  if (loggedIn) {
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('loginPass').value = '';
    load();
  }
}

// Fetch every row from the database into `data`, then redraw the table.
async function load() {
  if (!currentUser) return;     // only logged-in users can read data
  const { data: rows, error } = await sb.from('locations').select('*');
  if (error) { setLive(false, 'Database error: ' + error.message); return; }
  data = rows.map(fromDb);
  // Reminders live in their own table; load them too (don't fail the page if the
  // table isn't set up yet — just leave the list empty).
  const { data: remRows, error: remErr } = await sb.from('reminders').select('*');
  reminders = (remErr ? [] : remRows.map(fromDbRem));
  setLive(true, 'Live · synced with database');
  render();
}

// Update the little "Live / Database error" status line under the header.
function setLive(ok, msg) {
  document.getElementById('liveDot').className = 'dot' + (ok ? ' live' : '');
  document.getElementById('liveText').textContent = msg;
}

// Realtime: refresh instantly whenever anyone on the team changes data.
// (Requires the table to be added to the supabase_realtime publication — see docs/.)
sb.channel('locations-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => { load(); if (currentView === 'activity') renderActivity(); })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => { load(); })
  .subscribe();

// Backup auto-refresh: reload every 20s so the view stays current even if
// realtime isn't enabled. Skipped while a dialog is open so it never disrupts editing.
setInterval(() => {
  if (!currentUser) return;
  const anyOpen = ['overlay','confirmOverlay','exportOverlay','reminderOverlay'].some(id => document.getElementById(id).classList.contains('open'));
  if (!anyOpen && document.visibilityState === 'visible') { load(); if (currentView === 'activity') renderActivity(); }
}, 20000);

// --- Date + follow-up helpers ------------------------------------------------
// Whole days from today until the given YYYY-MM-DD (negative = in the past).
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
}
// Returns the HTML flag(s) a row should show: a "Pre-open due" badge when the
// opening is within 3 days (and pre-open isn't ticked), and a "Post-open due"
// badge once it's 3+ days past opening (and post-open isn't ticked).
function followFlags(loc) {
  const dd = daysUntil(loc.openingDate); const f = [];
  if (!loc.preOpenDone && dd <= 3 && dd >= 0) f.push('<span class="flag flag-pre">Pre-open due</span>');
  if (!loc.postOpenDone && dd <= -3) f.push('<span class="flag flag-post">Post-open due</span>');
  return f.join('');
}
// Escape user text before putting it in HTML, to prevent broken markup / injection.
function esc(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Returns the rows to show given the current tab/search/filters, sorted by date.
// Shared by render() and the CSV export so they always match.
function getFilteredList() {
  const q = document.getElementById('search').value.toLowerCase();   // search text
  const sf = document.getElementById('statusFilter').value;          // status filter
  const tf = document.getElementById('tierFilter').value;            // tier filter
  return data
    .filter(l => currentView === 'opened' ? l.status === 'opened' : l.status !== 'opened')
    .filter(l => (l.name + ' ' + (l.clientName||'') + ' ' + (l.tracker||'')).toLowerCase().includes(q))
    .filter(l => currentView === 'opened' || !sf || l.status === sf)
    .filter(l => !tf || l.tier === tf)
    .sort((a,b) => (a.openingDate||'').localeCompare(b.openingDate||''));
}

// --- Main rendering ----------------------------------------------------------
// Rebuilds the table from `data`, applying the current tab, search box,
// and the status/tier filters, then paginating the result.
function render() {
  // Update tab counts + which tab looks active
  const openedCount = data.filter(l => l.status === 'opened').length;
  document.getElementById('cnt-opened').textContent = openedCount;
  document.getElementById('cnt-active').textContent = data.length - openedCount;
  document.getElementById('cnt-reminders').textContent = reminders.filter(r => !r.done).length;
  document.getElementById('tab-active').classList.toggle('active', currentView === 'active');
  document.getElementById('tab-opened').classList.toggle('active', currentView === 'opened');
  document.getElementById('tab-reminders').classList.toggle('active', currentView === 'reminders');
  document.getElementById('tab-activity').classList.toggle('active', currentView === 'activity');

  // Each non-table tab swaps the table out for its own panel.
  const isActivity = currentView === 'activity';
  const isReminders = currentView === 'reminders';
  document.getElementById('tableView').style.display = (isActivity || isReminders) ? 'none' : '';
  document.getElementById('activityPanel').style.display = isActivity ? 'block' : 'none';
  document.getElementById('remindersPanel').style.display = isReminders ? 'block' : 'none';
  if (isReminders) { renderStats(); renderReminders(); return; }
  if (isActivity) { renderStats(); renderActivity(); return; }

  // Status filter only applies to the active queue
  document.getElementById('statusFilter').style.display = currentView === 'opened' ? 'none' : '';

  const list = getFilteredList();

  // Work out which slice of rows this page should show.
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  // Build the table rows. `cd` is the small countdown text under the date.
  document.getElementById('rows').innerHTML = pageItems.map(l => {
    const dd = daysUntil(l.openingDate);
    const cd = l.status === 'opened' ? 'Opened' : (dd > 0 ? `in ${dd}d` : dd === 0 ? 'today' : `${-dd}d ago`);
    return `<tr>
      <td><b>${esc(l.clientName||'—')}</b></td>
      <td>${esc(l.name)}${l.notes?`<div class="countdown">${esc(l.notes)}</div>`:''}</td>
      <td>${esc(l.tier||'—')}</td>
      <td><span style="white-space:nowrap">${esc(l.openingDate)}</span><div class="countdown">${cd}</div></td>
      <td>${esc(l.tracker||'—')}</td>
      <td><span class="badge b-${l.status}">${STATUS_LABELS[l.status]||l.status}</span></td>
      <td>${followFlags(l) || '<span class="countdown">—</span>'}</td>
      <td class="row-actions"><button onclick="openModal('${l.id}')">Edit</button> <button class="bell" onclick="openReminderModal('', '${l.id}')" title="Set a reminder for this client">🔔</button></td>
    </tr>`;
  }).join('');
  document.getElementById('empty').style.display = list.length ? 'none' : 'block';
  renderPager(list.length, totalPages, start, pageItems.length);
  renderStats();
}

// Draw the "Showing x–y of N" text and the page-number buttons.
function renderPager(total, totalPages, start, shown) {
  const pager = document.getElementById('pager');
  if (total === 0) { pager.innerHTML = ''; return; }
  let btns = `<button onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹ Prev</button>`;
  for (let p = 1; p <= totalPages; p++) {
    btns += `<button class="${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
  }
  btns += `<button onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>Next ›</button>`;
  pager.innerHTML = `<span class="info">Showing ${start+1}–${start+shown} of ${total}</span><span class="pages">${btns}</span>`;
}

// Switch between the "Active Queue", "Opened", and "Activity Log" tabs.
function switchView(v) {
  currentView = v;
  currentPage = 1;
  render();
}

// Jump to a specific page number and scroll back to the top.
function goPage(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Recompute and draw the summary cards at the top from the full dataset.
function renderStats() {
  const total = data.length;
  const upcoming = data.filter(l => l.status!=='opened' && daysUntil(l.openingDate) >= 0).length;
  const needFollow = data.filter(l => followFlags(l)).length;          // currently have a pre/post-open flag
  const atRisk = data.filter(l => l.status==='at-risk'||l.status==='delayed').length;
  const opened = data.filter(l => l.status==='opened').length;
  const remindersDue = reminders.filter(r => !r.done && daysUntil(r.remindOn) <= 0).length;  // due today or overdue
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="n">${total}</div><div class="l">Total</div></div>
    <div class="stat"><div class="n">${upcoming}</div><div class="l">Upcoming</div></div>
    <div class="stat"><div class="n" style="color:var(--blue)">${opened}</div><div class="l">Opened</div></div>
    <div class="stat"><div class="n" style="color:var(--amber)">${needFollow}</div><div class="l">Need follow-up</div></div>
    <div class="stat"><div class="n" style="color:var(--red)">${atRisk}</div><div class="l">At risk / delayed</div></div>
    <div class="stat"><div class="n" style="color:var(--accent-h)">${remindersDue}</div><div class="l">Reminders due</div></div>`;
}

// Show/hide the "Opened workflow" fields depending on the chosen status.
function toggleOpenedFields() {
  const opened = document.getElementById('f-status').value === 'opened';
  // 'contents' keeps the two inner fields flowing inside the form grid.
  document.getElementById('openedFields').style.display = opened ? 'contents' : 'none';
}

/* --- Add / Edit dialog -------------------------------------------------------
   Opens the form. Pass an id to edit an existing client; pass nothing to add. */
function openModal(id) {
  if (id) {
    // EDIT: pre-fill the form with the chosen client's current values.
    const l = data.find(x => x.id === id);
    document.getElementById('modalTitle').textContent = 'Edit Client';
    document.getElementById('f-id').value = l.id;
    document.getElementById('f-client').value = l.clientName || '';
    document.getElementById('f-name').value = l.name;
    document.getElementById('f-tier').value = l.tier || 'Basic (+)';
    document.getElementById('f-date').value = l.openingDate;
    document.getElementById('f-tracker').value = l.tracker || '';
    document.getElementById('f-status').value = l.status;
    document.getElementById('f-notes').value = l.notes || '';
    document.getElementById('f-pre').checked = !!l.preOpenDone;
    document.getElementById('f-post').checked = !!l.postOpenDone;
    document.getElementById('f-opened-date').value = l.openedDate || '';
    document.getElementById('f-open-outcome').value = l.openOutcome || '';
    document.getElementById('deleteBtn').style.display = 'block';
  } else {
    // ADD: start with a blank form and sensible defaults.
    document.getElementById('modalTitle').textContent = 'Add Client';
    ['f-id','f-client','f-name','f-tracker','f-notes','f-opened-date','f-open-outcome'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('f-date').value = '';
    document.getElementById('f-tier').value = 'Basic (+)';
    document.getElementById('f-status').value = 'on-track';
    document.getElementById('f-pre').checked = false;
    document.getElementById('f-post').checked = false;
    document.getElementById('deleteBtn').style.display = 'none';
  }
  toggleOpenedFields();   // show the opened fields only if status is already "opened"
  document.getElementById('overlay').classList.add('open');
}
function closeModal(){ document.getElementById('overlay').classList.remove('open'); }

// Validate the form and save it to the database (insert or update via upsert).
async function saveLocation() {
  const id = document.getElementById('f-id').value;
  const name = document.getElementById('f-name').value.trim();
  const date = document.getElementById('f-date').value;
  if (!name || !date) { alert('Name and opening date are required.'); return; }
  const status = document.getElementById('f-status').value;
  const existing = id ? data.find(x => x.id === id) : null;   // for change detection
  const obj = {
    id: id || 'loc-' + Date.now(),   // reuse id when editing; generate one when adding
    clientName: document.getElementById('f-client').value.trim(),
    name,
    tier: document.getElementById('f-tier').value,
    openingDate: date,
    tracker: document.getElementById('f-tracker').value.trim(),
    status,
    notes: document.getElementById('f-notes').value.trim(),
    preOpenDone: document.getElementById('f-pre').checked,
    postOpenDone: document.getElementById('f-post').checked,
    // Opened workflow: keep an actual open date (default to today) + outcome note.
    openedDate: status === 'opened' ? (document.getElementById('f-opened-date').value || new Date().toISOString().slice(0,10)) : (document.getElementById('f-opened-date').value || null),
    openOutcome: document.getElementById('f-open-outcome').value.trim() || null
  };
  document.getElementById('saveBtn').disabled = true;
  const { error } = await sb.from('locations').upsert(toDb(obj));
  document.getElementById('saveBtn').disabled = false;
  if (error) { alert('Save failed: ' + error.message); return; }

  // Record the change in the activity log (newly opened gets its own action).
  const label = `${obj.clientName || '—'} — ${obj.name}`;
  if (!existing) logActivity('created', label, '');
  else if (existing.status !== 'opened' && status === 'opened') logActivity('opened', label, obj.openOutcome ? 'Outcome: ' + obj.openOutcome : '');
  else logActivity('updated', label, '');

  closeModal(); toast('Saved'); load();
}

// --- Delete (with confirmation dialog) ---------------------------------------
// Step 1: open the confirm dialog showing which client will be removed.
function deleteLocation() {
  const id = document.getElementById('f-id').value;
  if (!id) return;
  const l = data.find(x => x.id === id);
  document.getElementById('confirmText').innerHTML =
    `This will permanently remove <b>${esc((l&&l.clientName)||(l&&l.name)||'this entry')}</b>. This can't be undone.`;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }
// Step 2: user confirmed — actually delete the row from the database.
async function confirmYes() {
  const id = document.getElementById('f-id').value;
  const l = data.find(x => x.id === id);
  closeConfirm();
  const { error } = await sb.from('locations').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  logActivity('deleted', l ? `${l.clientName || '—'} — ${l.name}` : 'entry', '');
  closeModal(); toast('Deleted'); load();
}

/* --- Activity log ------------------------------------------------------------
   Every create/update/delete/opened writes one row here, tagged with the
   logged-in user's email. The Activity Log tab reads them back.            */
// Write a single log entry (best-effort: a logging failure never blocks the action).
async function logActivity(action, entity, details) {
  try {
    await sb.from('activity_log').insert({
      user_email: currentUser ? currentUser.email : 'unknown',
      action, entity, details
    });
  } catch (e) { console.warn('activity log failed', e); }
}
// Load the most recent log entries and draw them in the Activity Log table.
async function renderActivity() {
  const { data: rows, error } = await sb.from('activity_log')
    .select('*').order('created_at', { ascending: false }).limit(200);
  const tbody = document.getElementById('activityRows');
  if (error) { tbody.innerHTML = ''; document.getElementById('activityEmpty').textContent = 'Could not load activity: ' + error.message; document.getElementById('activityEmpty').style.display = 'block'; return; }
  document.getElementById('activityEmpty').style.display = rows.length ? 'none' : 'block';
  const ACTION_LABEL = { created:'Added', updated:'Edited', deleted:'Deleted', opened:'Marked opened' };
  tbody.innerHTML = rows.map(r => {
    const when = new Date(r.created_at).toLocaleString();
    return `<tr>
      <td><span style="white-space:nowrap">${esc(when)}</span></td>
      <td>${esc(ACTION_LABEL[r.action] || r.action)}</td>
      <td>${esc(r.entity || '')}${r.details ? `<div class="countdown">${esc(r.details)}</div>` : ''}</td>
      <td>${esc(r.user_email || '')}</td>
    </tr>`;
  }).join('');
}

/* --- Reminders ---------------------------------------------------------------
   A reminder is a dated "what to do" note for a teammate, optionally linked to a
   client. The list lets you tick them done and, crucially, push each one to a
   calendar (downloadable .ics or Google Calendar) so the calendar emails/pops a
   reminder on the day — no email server needed on our side.                  */
// Draw the reminders table (sorted by date; completed ones hidden unless asked).
function renderReminders() {
  const showDone = document.getElementById('rem-show-done').checked;
  const list = reminders
    .filter(r => showDone || !r.done)
    .sort((a,b) => (a.remindOn||'').localeCompare(b.remindOn||''));
  const tbody = document.getElementById('reminderRows');
  document.getElementById('remindersEmpty').style.display = list.length ? 'none' : 'block';
  tbody.innerHTML = list.map(r => {
    const dd = daysUntil(r.remindOn);
    const cd = r.done ? 'Done' : (dd > 0 ? `in ${dd}d` : dd === 0 ? 'today' : `${-dd}d ago`);
    const overdue = !r.done && dd < 0;
    const loc = r.locationId ? data.find(l => l.id === r.locationId) : null;
    const clientLabel = loc ? `${esc(loc.clientName||'—')} — ${esc(loc.name)}` : '<span class="countdown">—</span>';
    return `<tr style="${r.done?'opacity:.55':''}">
      <td><span style="white-space:nowrap">${esc(r.remindOn)}</span><div class="countdown" style="${overdue?'color:var(--red)':''}">${cd}</div></td>
      <td><b>${esc(r.title)}</b>${r.notes?`<div class="countdown">${esc(r.notes)}</div>`:''}</td>
      <td>${esc(r.assignee||'—')}</td>
      <td>${clientLabel}</td>
      <td class="row-actions">
        <button onclick="downloadICS('${r.id}')" title="Download a calendar invite (.ics) with a reminder">📅 Calendar</button>
        <button onclick="openGoogleCal('${r.id}')" title="Add to Google Calendar">Google</button>
        <button onclick="toggleReminderDone('${r.id}')">${r.done?'Undo':'Done'}</button>
        <button onclick="openReminderModal('${r.id}')">Edit</button>
      </td>
    </tr>`;
  }).join('');
}

// Open the Add/Edit Reminder dialog. Pass an id to edit; pass a presetLocationId
// (optional) to pre-link a client when adding.
function openReminderModal(id, presetLocationId) {
  // (Re)build the client dropdown from the current client list.
  const sel = document.getElementById('r-location');
  const sorted = [...data].sort((a,b) => ((a.clientName||a.name||'')).localeCompare(b.clientName||b.name||''));
  sel.innerHTML = '<option value="">— None —</option>' + sorted.map(l =>
    `<option value="${esc(l.id)}">${esc((l.clientName ? l.clientName + ' — ' : '') + l.name)}</option>`).join('');
  if (id) {
    const r = reminders.find(x => x.id === id);
    document.getElementById('reminderTitle').textContent = 'Edit Reminder';
    document.getElementById('r-id').value = r.id;
    document.getElementById('r-title').value = r.title || '';
    document.getElementById('r-date').value = r.remindOn || '';
    document.getElementById('r-assignee').value = r.assignee || '';
    sel.value = r.locationId || '';
    document.getElementById('r-notes').value = r.notes || '';
    document.getElementById('r-done').checked = !!r.done;
    document.getElementById('r-deleteBtn').style.display = 'block';
  } else {
    document.getElementById('reminderTitle').textContent = 'Add Reminder';
    ['r-id','r-title','r-assignee','r-notes'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('r-date').value = '';
    sel.value = presetLocationId || '';
    document.getElementById('r-done').checked = false;
    document.getElementById('r-deleteBtn').style.display = 'none';
  }
  document.getElementById('reminderOverlay').classList.add('open');
}
function closeReminderModal(){ document.getElementById('reminderOverlay').classList.remove('open'); }

// Validate + save a reminder (insert or update via upsert).
async function saveReminder() {
  const id = document.getElementById('r-id').value;
  const title = document.getElementById('r-title').value.trim();
  const date = document.getElementById('r-date').value;
  if (!title || !date) { alert('A description and a date are required.'); return; }
  const obj = {
    id: id || 'rem-' + Date.now(),
    locationId: document.getElementById('r-location').value || null,
    title,
    remindOn: date,
    assignee: document.getElementById('r-assignee').value.trim() || null,
    notes: document.getElementById('r-notes').value.trim() || null,
    done: document.getElementById('r-done').checked,
    createdBy: currentUser ? currentUser.email : null
  };
  document.getElementById('r-saveBtn').disabled = true;
  const { error } = await sb.from('reminders').upsert(toDbRem(obj));
  document.getElementById('r-saveBtn').disabled = false;
  if (error) { alert('Save failed: ' + error.message); return; }
  logActivity(id ? 'reminder updated' : 'reminder set', title, 'Remind on ' + date + (obj.assignee ? ' · for ' + obj.assignee : ''));
  closeReminderModal(); toast('Reminder saved'); load();
}

// Delete the reminder currently open in the dialog.
async function deleteReminder() {
  const id = document.getElementById('r-id').value;
  if (!id) return;
  const r = reminders.find(x => x.id === id);
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  logActivity('reminder deleted', r ? r.title : 'reminder', '');
  closeReminderModal(); toast('Reminder deleted'); load();
}

// Quick tick/untick straight from the list.
async function toggleReminderDone(id) {
  const r = reminders.find(x => x.id === id);
  if (!r) return;
  const { error } = await sb.from('reminders').update({ done: !r.done }).eq('id', id);
  if (error) { alert('Update failed: ' + error.message); return; }
  logActivity(!r.done ? 'reminder completed' : 'reminder reopened', r.title, '');
  load();
}

// --- Calendar export (so the user's calendar does the actual reminding) -------
// Format a Date as floating local time: YYYYMMDDTHHMMSS (no timezone shift).
function icsStamp(d){
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
// Build the title / description / location text shared by .ics and Google links.
function reminderEventText(r){
  const loc = r.locationId ? data.find(l => l.id === r.locationId) : null;
  const client = loc ? `${loc.clientName || ''}${loc.clientName ? ' — ' : ''}${loc.name}` : '';
  let desc = r.notes || '';
  if (client)     desc += (desc ? '\n\n' : '') + 'Client: ' + client;
  if (r.assignee) desc += (desc ? '\n' : '') + 'For: ' + r.assignee;
  return { title: 'Reminder: ' + r.title, desc, location: client };
}
// Produce a valid .ics for a reminder: a 30-min event at 9am on the day, with a
// pop-up the morning of and one the day before.
function buildICS(r){
  const start = new Date(r.remindOn + 'T09:00:00');
  const end   = new Date(start.getTime() + 30*60000);
  const { title, desc, location } = reminderEventText(r);
  const fold = s => (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PodPlay//Client Opening Tracker//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:' + r.id + '@client-opening-tracker',
    'DTSTAMP:' + icsStamp(new Date()),
    'DTSTART:' + icsStamp(start),
    'DTEND:'   + icsStamp(end),
    'SUMMARY:' + fold(title),
    'DESCRIPTION:' + fold(desc)
  ];
  if (location) lines.push('LOCATION:' + fold(location));
  lines.push(
    'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:' + fold(title),'TRIGGER:PT0M','END:VALARM',
    'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:' + fold(title),'TRIGGER:-P1D','END:VALARM',
    'END:VEVENT','END:VCALENDAR'
  );
  return lines.join('\r\n');
}
// Download the .ics file (opens in Apple Calendar / Outlook / Google import).
function downloadICS(id){
  const r = reminders.find(x => x.id === id);
  if (!r) return;
  const blob = new Blob([buildICS(r)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reminder-' + r.remindOn + '.ics';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Calendar invite downloaded');
}
// Open Google Calendar's "create event" page pre-filled for this reminder.
function openGoogleCal(id){
  const r = reminders.find(x => x.id === id);
  if (!r) return;
  const start = new Date(r.remindOn + 'T09:00:00');
  const end   = new Date(start.getTime() + 30*60000);
  const { title, desc, location } = reminderEventText(r);
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(title)
    + '&dates=' + icsStamp(start) + '/' + icsStamp(end)
    + '&details=' + encodeURIComponent(desc)
    + (location ? '&location=' + encodeURIComponent(location) : '');
  window.open(url, '_blank');
}

/* --- CSV export --------------------------------------------------------------
   Lets the user choose scope (active / opened / all), status, and tier,
   then downloads exactly that selection as a CSV. */
function openExportModal() {
  // Sensible defaults based on the tab you're currently on.
  document.getElementById('x-scope').value = currentView === 'opened' ? 'opened' : 'active';
  document.getElementById('x-status').value = '';
  document.getElementById('x-tier').value = '';
  updateExportCount();
  // Recount whenever a choice changes.
  ['x-scope','x-status','x-tier'].forEach(id => document.getElementById(id).onchange = updateExportCount);
  document.getElementById('exportOverlay').classList.add('open');
}
function closeExportModal() { document.getElementById('exportOverlay').classList.remove('open'); }

// Apply the chosen scope/status/tier to the full dataset and return the rows.
function getExportRows() {
  const scope = document.getElementById('x-scope').value;
  const st = document.getElementById('x-status').value;
  const tr = document.getElementById('x-tier').value;
  return data
    .filter(l => scope === 'all' ? true : scope === 'opened' ? l.status === 'opened' : l.status !== 'opened')
    .filter(l => !st || l.status === st)
    .filter(l => !tr || l.tier === tr)
    .sort((a,b) => (a.openingDate||'').localeCompare(b.openingDate||''));
}
// Show a live "N clients will be exported" count in the dialog.
function updateExportCount() {
  const n = getExportRows().length;
  document.getElementById('x-count').textContent = `${n} client${n===1?'':'s'} will be exported.`;
}
// Build and download the CSV for the current selection.
function runExport() {
  const rows = getExportRows();
  if (!rows.length) { alert('No clients match that selection.'); return; }
  const headers = ['Client','Location','Tier','Opening Date','Tracker','Status','Notes','Pre-open done','Post-open done','Actual open date','Open outcome'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;   // quote + escape for CSV
  const lines = [headers.join(',')];
  rows.forEach(l => lines.push([
    l.clientName, l.name, l.tier, l.openingDate, l.tracker, STATUS_LABELS[l.status] || l.status,
    l.notes, l.preOpenDone ? 'Yes' : 'No', l.postOpenDone ? 'Yes' : 'No', l.openedDate, l.openOutcome
  ].map(cell).join(',')));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `client-openings-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  closeExportModal(); toast('CSV downloaded');
}

// --- Misc + startup ----------------------------------------------------------
// Brief pop-up confirmation message at the bottom of the screen.
let toastT;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2000); }

// Close each dialog when its dark backdrop (not the dialog itself) is clicked.
document.getElementById('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeModal(); });
document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target.id === 'confirmOverlay') closeConfirm(); });
document.getElementById('exportOverlay').addEventListener('click', e => { if (e.target.id === 'exportOverlay') closeExportModal(); });
document.getElementById('reminderOverlay').addEventListener('click', e => { if (e.target.id === 'reminderOverlay') closeReminderModal(); });

// Startup: react to the current session, then to any login/logout afterwards.
sb.auth.getSession().then(({ data }) => handleAuth(data.session));
sb.auth.onAuthStateChange((_event, session) => handleAuth(session));
