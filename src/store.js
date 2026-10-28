// Central data store. Every record carries `updatedAt`; deletions are tombstones (`_del`).
// This makes merging copies from other devices (via Syncthing) a simple last-writer-wins per record.
import { useSyncExternalStore } from 'react';
import { idbGet, idbSet } from './lib/idb.js';
import { advanceTask } from './lib/repeat.js';
import { today, ymd, addDays, startOfDay, DAY } from './lib/date.js';

export const COLLS = ['tasks', 'lists', 'folders', 'sections', 'tags', 'filters', 'habits', 'habitLogs', 'focus', 'countdowns', 'prefs'];
export const INBOX = 'inbox';
const TOMBSTONE_TTL = 180 * DAY;

export const DEFAULT_PREFS = {
  id: 'main',
  theme: 'system', accent: 'blue', compact: false, fontScale: 1,
  weekStart: 1, h24: false, dateOrder: 'dmy',
  defaultListId: INBOX, smartParse: true, keepParsedText: false,
  allDayReminder: '09:00', dailyReminder: '', defaultReminders: [], newTaskPosition: 'top',
  showCompleted: true, showDetails: true, sound: true, notify: true,
  smartLists: { today: true, tomorrow: true, next7: true, inbox: true, all: true, completed: true, wontdo: true, summary: true, trash: true },
  viewOpts: {},
  pomo: { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: false, autoFocus: false, dailyGoal: 4, alarm: 'bell' },
  habitNote: false, habitSections: true,
  calendar: { mode: 'month', showCompleted: true, showRepeats: true, showHabits: false },
};

function emptyDB() { const d = {}; for (const c of COLLS) d[c] = {}; return d; }

let db = emptyDB();
let version = 0;
let ready = false;
const listeners = new Set();
const changeHooks = new Set();
let lastStamp = 0;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
export function stamp() { const t = Math.max(Date.now(), lastStamp + 1); lastStamp = t; return t; }

export function getDB() { return db; }
export function isReady() { return ready; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onChange(fn) { changeHooks.add(fn); return () => changeHooks.delete(fn); }
function notify(local) { version++; for (const l of listeners) l(); for (const h of changeHooks) h(local); }
export function useDB() { useSyncExternalStore(subscribe, () => version); return db; }
export function getVersion() { return version; }

// ---------- persistence ----------
let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { idbSet('db', db).catch((e) => console.error('persist failed', e)); }, 300);
}
export function flushPersist() { clearTimeout(persistTimer); return idbSet('db', db); }

export async function loadDB() {
  let saved = null;
  try { saved = await idbGet('db'); } catch (e) { console.error(e); }
  if (saved) {
    db = emptyDB();
    for (const c of COLLS) db[c] = saved[c] || {};
  } else {
    seed();
  }
  ensureDefaults();
  ready = true;
  notify(false);
}

function rawPut(coll, rec) {
  db = { ...db, [coll]: { ...db[coll], [rec.id]: rec } };
}

function ensureDefaults() {
  const t = stamp();
  if (!db.lists[INBOX] || db.lists[INBOX]._del) rawPut('lists', { id: INBOX, name: 'Inbox', order: -1, color: null, createdAt: t, updatedAt: 1 });
  if (!db.prefs.main) rawPut('prefs', { ...DEFAULT_PREFS, updatedAt: 1 });
}

function seed() {
  db = emptyDB();
  const t = stamp();
  const td = today();
  const mk = (o) => ({ id: uid(), content: '', listId: INBOX, priority: 0, status: 0, tags: [], checklist: [], reminders: [], allDay: true, createdAt: t, updatedAt: t, ...o });
  const tasks = [
    mk({ title: 'Welcome to Taskday 👋', order: 0, dueAt: td, content: 'Tap a task to open its details. Add dates, reminders, repeats, tags, checklists and subtasks.\n\nEverything works offline. To sync between your phone and computer, open Settings → Sync and pick a folder that Syncthing shares.' }),
    mk({ title: 'Try smart quick add: "Call mom tomorrow 6pm #family !high"', order: 1024, dueAt: td, priority: 3 }),
    mk({ title: 'Swipe through views: Calendar, Habits, Focus and Countdown', order: 2048, checklist: [{ id: uid(), title: 'Open the Calendar', done: false }, { id: uid(), title: 'Create a habit', done: false }, { id: uid(), title: 'Start a 25-minute focus session', done: false }] }),
  ];
  for (const x of tasks) rawPut('tasks', x);
  rawPut('lists', { id: uid(), name: 'Personal', color: '#4772FA', emoji: '🏠', order: 1, view: 'list', createdAt: t, updatedAt: t });
  rawPut('lists', { id: uid(), name: 'Work', color: '#F2994A', emoji: '💼', order: 2, view: 'list', createdAt: t, updatedAt: t });
}

// ---------- generic mutations ----------
export function put(coll, rec, opts = {}) {
  const prev = db[coll][rec.id];
  const next = { ...rec, updatedAt: stamp() };
  if (!next.createdAt) next.createdAt = prev?.createdAt || next.updatedAt;
  rawPut(coll, next);
  if (!opts.silent) { schedulePersist(); notify(true); }
  return next;
}
export function patch(coll, id, changes, opts) {
  const prev = db[coll][id];
  if (!prev) return null;
  return put(coll, { ...prev, ...changes }, opts);
}
export function remove(coll, id, opts = {}) {
  if (!db[coll][id]) return;
  rawPut(coll, { id, _del: true, updatedAt: stamp() });
  if (!opts.silent) { schedulePersist(); notify(true); }
}
// Batch several mutations into one notification.
export function batch(fn) {
  const before = version;
  fn({
    put: (c, r) => put(c, r, { silent: true }),
    patch: (c, id, ch) => patch(c, id, ch, { silent: true }),
    remove: (c, id) => remove(c, id, { silent: true }),
  });
  schedulePersist();
  notify(true);
  return before;
}

export const alive = (r) => r && !r._del;
export const all = (coll) => Object.values(db[coll]).filter(alive);

// ---------- merge (sync) ----------
function pickWinner(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((b.updatedAt || 0) > (a.updatedAt || 0)) return b;
  if ((b.updatedAt || 0) < (a.updatedAt || 0)) return a;
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  return jb > ja ? b : a;
}
export function mergeRemote(remote) {
  let changed = false;
  const next = { ...db };
  for (const c of COLLS) {
    const r = remote?.[c];
    if (!r) continue;
    let coll = null;
    for (const id in r) {
      const mine = next[c][id];
      const theirs = r[id];
      if (!theirs || typeof theirs !== 'object') continue;
      const w = pickWinner(mine, theirs);
      if (w !== mine) {
        if (!coll) coll = { ...next[c] };
        coll[id] = w;
        changed = true;
        if (w.updatedAt > lastStamp && w.updatedAt < Date.now() + DAY) lastStamp = w.updatedAt;
      }
    }
    if (coll) next[c] = coll;
  }
  if (changed) { db = next; ensureDefaults(); schedulePersist(); notify(false); }
  return changed;
}
export function exportDB() {
  const cutoff = Date.now() - TOMBSTONE_TTL;
  const out = {};
  for (const c of COLLS) {
    out[c] = {};
    for (const id in db[c]) {
      const r = db[c][id];
      if (r._del && r.updatedAt < cutoff) continue;
      out[c][id] = r;
    }
  }
  return out;
}
export function replaceAll(data) {
  db = emptyDB();
  for (const c of COLLS) db[c] = data?.[c] || {};
  ensureDefaults();
  schedulePersist();
  notify(true);
}

// ---------- prefs ----------
export function getPrefs() { return { ...DEFAULT_PREFS, ...(db.prefs.main || {}) }; }
export function usePrefs() { useDB(); return getPrefs(); }
export function setPrefs(changes) {
  const cur = getPrefs();
  put('prefs', { ...cur, ...changes, id: 'main' });
}
export function setViewOpts(key, changes) {
  const p = getPrefs();
  setPrefs({ viewOpts: { ...p.viewOpts, [key]: { ...(p.viewOpts[key] || {}), ...changes } } });
}

// ---------- undo ----------
let undoStack = [];
export function snapshot(coll, ids) {
  return ids.map((id) => ({ coll, id, rec: db[coll][id] ? { ...db[coll][id] } : null }));
}
export function pushUndo(label, snaps) { undoStack.push({ label, snaps }); if (undoStack.length > 30) undoStack.shift(); }
export function undo() {
  const u = undoStack.pop();
  if (!u) return null;
  batch((b) => {
    for (const s of u.snaps) {
      if (s.rec) b.put(s.coll, { ...s.rec });
      else b.remove(s.coll, s.id);
    }
  });
  return u.label;
}

// ---------- tasks ----------
export function newTaskDefaults() {
  const p = getPrefs();
  return { title: '', content: '', listId: p.defaultListId && db.lists[p.defaultListId] && alive(db.lists[p.defaultListId]) ? p.defaultListId : INBOX, priority: 0, status: 0, tags: [], checklist: [], reminders: [], allDay: true, dueAt: null, startAt: null };
}
function topOrder(listId, parentId) {
  let min = 0;
  for (const t of Object.values(db.tasks)) if (alive(t) && t.listId === listId && (t.parentId || null) === (parentId || null) && t.order < min) min = t.order;
  return min - 1024;
}
function bottomOrder(listId, parentId) {
  let max = 0;
  for (const t of Object.values(db.tasks)) if (alive(t) && t.listId === listId && (t.parentId || null) === (parentId || null) && t.order > max) max = t.order;
  return max + 1024;
}
export function createTask(fields) {
  const p = getPrefs();
  const base = newTaskDefaults();
  const t = { ...base, ...fields, id: uid() };
  if (!t.listId || !db.lists[t.listId] || db.lists[t.listId]._del) t.listId = INBOX;
  if (t.tags) t.tags = [...new Set(t.tags.map((x) => x.toLowerCase()))];
  for (const tag of t.tags) ensureTag(tag);
  if (t.order == null) t.order = (fields.parentId || p.newTaskPosition === 'bottom') ? bottomOrder(t.listId, t.parentId) : topOrder(t.listId, t.parentId);
  if (t.dueAt && (!fields.reminders) && p.defaultReminders?.length) t.reminders = [...p.defaultReminders];
  return put('tasks', t);
}
export function ensureTag(name) {
  const n = name.toLowerCase();
  const ex = all('tags').find((t) => t.name === n);
  if (ex) return ex;
  return put('tags', { id: uid(), name: n, color: null, order: all('tags').length }, { silent: true });
}
export function updateTask(id, changes) {
  if (changes.tags) { changes = { ...changes, tags: [...new Set(changes.tags.map((x) => x.toLowerCase()))] }; changes.tags.forEach(ensureTag); }
  return patch('tasks', id, changes);
}
export function childrenOf(id) { return all('tasks').filter((t) => t.parentId === id); }
export function descendants(id) {
  const out = [];
  const walk = (pid) => { for (const c of childrenOf(pid)) { out.push(c); walk(c.id); } };
  walk(id);
  return out;
}

export function completeTask(id) {
  const t = db.tasks[id];
  if (!t || t.status !== 0) return;
  const now = Date.now();
  const snaps = snapshot('tasks', [id, ...descendants(id).map((d) => d.id)]);
  let historyId = null;
  batch((b) => {
    const nextDates = advanceTask(t, now);
    if (nextDates) {
      // Keep a completed copy for history, roll the original forward.
      historyId = uid();
      b.put('tasks', { ...t, id: historyId, status: 2, completedAt: now, repeat: null, repeatOf: t.id, reminders: [], createdAt: t.createdAt });
      b.patch('tasks', id, { ...nextDates, checklist: (t.checklist || []).map((c) => ({ ...c, done: false })) });
      for (const d of descendants(id)) b.patch('tasks', d.id, { status: 0, completedAt: null });
    } else {
      b.patch('tasks', id, { status: 2, completedAt: now });
      for (const d of descendants(id)) if (d.status === 0) b.patch('tasks', d.id, { status: 2, completedAt: now });
    }
  });
  if (historyId) snaps.push({ coll: 'tasks', id: historyId, rec: null });
  pushUndo('Task completed', snaps);
  return { repeated: !!historyId };
}
export function uncompleteTask(id) {
  const t = db.tasks[id];
  if (!t) return;
  pushUndo('Task restored', snapshot('tasks', [id]));
  patch('tasks', id, { status: 0, completedAt: null });
  if (t.parentId && db.tasks[t.parentId]?.status === 2) patch('tasks', t.parentId, { status: 0, completedAt: null });
}
export function toggleTask(id) {
  const t = db.tasks[id];
  if (!t) return;
  if (t.status === 0) return completeTask(id); else uncompleteTask(id);
}
export function wontDoTask(id) {
  const t = db.tasks[id];
  pushUndo("Marked Won't Do", snapshot('tasks', [id]));
  if (t.repeat && t.dueAt) {
    const nextDates = advanceTask(t, Date.now());
    if (nextDates) {
      batch((b) => {
        b.put('tasks', { ...t, id: uid(), status: -1, completedAt: Date.now(), repeat: null, repeatOf: t.id, reminders: [] });
        b.patch('tasks', id, nextDates);
      });
      return;
    }
  }
  patch('tasks', id, { status: -1, completedAt: Date.now() });
}
export function trashTasks(ids) {
  const allIds = [...new Set(ids.flatMap((id) => [id, ...descendants(id).map((d) => d.id)]))];
  pushUndo(ids.length > 1 ? `${ids.length} tasks deleted` : 'Task deleted', snapshot('tasks', allIds));
  const t = Date.now();
  batch((b) => { for (const id of allIds) b.patch('tasks', id, { trashed: t }); });
}
export function restoreTasks(ids) {
  batch((b) => {
    for (const id of ids) {
      const t = db.tasks[id];
      const listOk = t && db.lists[t.listId] && alive(db.lists[t.listId]);
      b.patch('tasks', id, { trashed: null, ...(listOk ? {} : { listId: INBOX }) });
    }
  });
}
export function deleteForever(ids) { batch((b) => { for (const id of ids) b.remove('tasks', id); }); }
export function emptyTrash() { deleteForever(all('tasks').filter((t) => t.trashed).map((t) => t.id)); }
export function duplicateTask(id) {
  const t = db.tasks[id];
  if (!t) return null;
  const copy = put('tasks', { ...t, id: uid(), title: t.title, status: 0, completedAt: null, order: t.order + 1, checklist: (t.checklist || []).map((c) => ({ ...c, id: uid() })), createdAt: null });
  for (const c of childrenOf(id)) put('tasks', { ...c, id: uid(), parentId: copy.id, createdAt: null });
  return copy;
}
export function moveTasks(ids, listId, sectionId = null) {
  batch((b) => {
    for (const id of ids) {
      for (const t of [db.tasks[id], ...descendants(id)]) b.patch('tasks', t.id, { listId, ...(t.id === id ? { sectionId, parentId: db.tasks[t.parentId]?.listId === listId ? t.parentId : null } : {}) });
    }
  });
}
export function indentTask(id, newParentId) {
  const t = db.tasks[id], p = db.tasks[newParentId];
  if (!t || !p || id === newParentId || descendants(id).some((d) => d.id === newParentId)) return;
  patch('tasks', id, { parentId: newParentId, listId: p.listId, sectionId: p.sectionId || null, order: bottomOrder(p.listId, newParentId) });
}
export function outdentTask(id) {
  const t = db.tasks[id];
  if (!t || !t.parentId) return;
  const p = db.tasks[t.parentId];
  patch('tasks', id, { parentId: p?.parentId || null, order: (p?.order ?? 0) + 1 });
}
// Place task `id` right before task `beforeId` (manual ordering).
export function reorderTask(id, beforeId, extra = {}) {
  const t = db.tasks[id], b = db.tasks[beforeId];
  if (!t || !b || id === beforeId) return;
  const siblings = all('tasks').filter((x) => x.listId === b.listId && (x.parentId || null) === (b.parentId || null) && x.id !== id).sort((x, y) => x.order - y.order);
  const idx = siblings.findIndex((x) => x.id === beforeId);
  const prev = siblings[idx - 1];
  const order = prev ? (prev.order + b.order) / 2 : b.order - 1024;
  patch('tasks', id, { order, listId: b.listId, parentId: b.parentId || null, sectionId: b.sectionId || null, ...extra });
}
export function addChecklistItem(taskId, title) {
  const t = db.tasks[taskId];
  updateTask(taskId, { checklist: [...(t.checklist || []), { id: uid(), title, done: false }] });
}

// ---------- lists / folders / sections / tags / filters ----------
export function createList(fields) {
  const order = Math.max(0, ...all('lists').map((l) => l.order || 0)) + 1;
  return put('lists', { id: uid(), name: 'New list', color: null, emoji: '', view: 'list', order, ...fields });
}
export function deleteList(id) {
  if (id === INBOX) return;
  const t = Date.now();
  batch((b) => {
    for (const task of all('tasks')) if (task.listId === id && !task.trashed) b.patch('tasks', task.id, { trashed: t });
    for (const s of all('sections')) if (s.listId === id) b.remove('sections', s.id);
    b.remove('lists', id);
  });
}
export function deleteFolder(id) {
  batch((b) => {
    for (const l of all('lists')) if (l.folderId === id) b.patch('lists', l.id, { folderId: null });
    b.remove('folders', id);
  });
}
export function renameTag(id, newName) {
  const tag = db.tags[id];
  const n = newName.trim().toLowerCase();
  if (!tag || !n || n === tag.name) return;
  const existing = all('tags').find((t) => t.name === n);
  batch((b) => {
    for (const t of all('tasks')) if (t.tags?.includes(tag.name)) b.patch('tasks', t.id, { tags: [...new Set(t.tags.map((x) => (x === tag.name ? n : x)))] });
    for (const t of all('tags')) if (t.parent === tag.name) b.patch('tags', t.id, { parent: n });
    if (existing) b.remove('tags', id); else b.patch('tags', id, { name: n });
  });
}
export function deleteTag(id) {
  const tag = db.tags[id];
  if (!tag) return;
  batch((b) => {
    for (const t of all('tasks')) if (t.tags?.includes(tag.name)) b.patch('tasks', t.id, { tags: t.tags.filter((x) => x !== tag.name) });
    for (const t of all('tags')) if (t.parent === tag.name) b.patch('tags', t.id, { parent: null });
    b.remove('tags', id);
  });
}

// ---------- habits ----------
export const logId = (habitId, day) => `${habitId}_${day}`;
export function getLog(habitId, day) { const l = db.habitLogs[logId(habitId, day)]; return alive(l) ? l : null; }
export function habitTarget(h) { return h.goal?.type === 'count' ? Math.max(1, h.goal.target || 1) : 1; }
export function isLogDone(h, log) { return !!log && log.status !== 'skip' && log.status !== 'fail' && (log.value || 0) >= habitTarget(h); }
export function setHabitValue(habitId, day, value, extra = {}) {
  const h = db.habits[habitId];
  const id = logId(habitId, day);
  const prev = getLog(habitId, day);
  const v = Math.max(0, value);
  put('habitLogs', { ...(prev || {}), id, habitId, date: day, value: v, status: v >= habitTarget(h) ? 'done' : (v > 0 ? 'partial' : 'none'), ...extra });
}
export function toggleHabit(habitId, day) {
  const h = db.habits[habitId];
  const log = getLog(habitId, day);
  if (isLogDone(h, log)) setHabitValue(habitId, day, 0);
  else if (h.goal?.type === 'count') setHabitValue(habitId, day, (log?.value || 0) + (h.goal.step || 1));
  else setHabitValue(habitId, day, 1);
}
export function isHabitDueOn(h, dayTs) {
  const start = h.startDate ? new Date(h.startDate + 'T00:00').getTime() : 0;
  if (dayTs < startOfDay(start)) return false;
  const f = h.freq || { type: 'daily' };
  if (f.type === 'daily') return !f.days || f.days.length === 0 || f.days.includes(new Date(dayTs).getDay());
  if (f.type === 'interval') return Math.round((startOfDay(dayTs) - startOfDay(start || h.createdAt)) / DAY) % Math.max(1, f.every || 1) === 0;
  return true; // weekly N times: any day
}
export function habitStats(h) {
  const logs = all('habitLogs').filter((l) => l.habitId === h.id);
  const doneDays = new Set(logs.filter((l) => isLogDone(h, l)).map((l) => l.date));
  const total = doneDays.size;
  const f = h.freq || { type: 'daily' };
  let cur = 0, best = 0;
  if (f.type === 'weekly') {
    // streak in weeks meeting the weekly target
    const need = Math.max(1, f.times || 1);
    const weekCount = (wkStart) => { let n = 0; for (let i = 0; i < 7; i++) if (doneDays.has(ymd(addDays(wkStart, i)))) n++; return n; };
    const p = getPrefs();
    let wk = startOfWeekLocal(today(), p.weekStart);
    let run = 0; let first = true;
    for (let i = 0; i < 260; i++) {
      const ok = weekCount(wk) >= need;
      if (ok) { run++; } else if (!first) { break; }
      first = false;
      wk = addDays(wk, -7);
    }
    cur = run;
    // best: scan back two years
    let b = 0, r = 0; wk = startOfWeekLocal(today(), p.weekStart);
    for (let i = 0; i < 104; i++) { if (weekCount(wk) >= need) { r++; b = Math.max(b, r); } else r = 0; wk = addDays(wk, -7); }
    best = Math.max(b, cur);
    return { total, cur, best, unit: 'weeks', doneDays };
  }
  // daily / interval: consecutive scheduled days completed
  let d = today();
  if (!doneDays.has(ymd(d))) d = addDays(d, -1);
  for (let i = 0; i < 2000; i++) {
    if (!isHabitDueOn(h, d)) { d = addDays(d, -1); if (h.startDate && ymd(d) < h.startDate) break; continue; }
    if (doneDays.has(ymd(d))) { cur++; d = addDays(d, -1); } else break;
  }
  const sorted = [...doneDays].sort();
  if (sorted.length) {
    let r = 0; let dd = new Date(sorted[0] + 'T00:00').getTime();
    const end = today();
    for (let i = 0; i < 3000 && dd <= end; i++) {
      if (isHabitDueOn(h, dd)) { if (doneDays.has(ymd(dd))) { r++; best = Math.max(best, r); } else if (dd < end) r = 0; }
      dd = addDays(dd, 1);
    }
  }
  best = Math.max(best, cur);
  return { total, cur, best, unit: 'days', doneDays };
}
function startOfWeekLocal(t, ws) { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() - ws + 7) % 7)); return d.getTime(); }
