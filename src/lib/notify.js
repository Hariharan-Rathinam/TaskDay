// Reminders: in the browser we check every 15s while the app is open;
// in the Android app we schedule real system notifications ahead of time.
import { all, getDB, getPrefs, onChange, isHabitDueOn, getLog, isLogDone } from '../store.js';
import { startOfDay, addDays, today, ymd, fmtTaskDate } from './date.js';
import { isNative, LocalNotif, addNativeListener } from './native.js';
import { playReminder } from './audio.js';

const HORIZON = 14;
let onFire = () => {};
export function setReminderHandler(fn) { onFire = fn; }

function hmToMin(s) { const [h, m] = (s || '09:00').split(':').map(Number); return h * 60 + (m || 0); }

export function upcomingReminders(from = Date.now() - 60000, days = HORIZON) {
  const p = getPrefs();
  const until = from + days * 86400000;
  const out = [];
  for (const t of all('tasks')) {
    if (t.status !== 0 || t.trashed || !t.dueAt || !t.reminders?.length) continue;
    const list = getDB().lists[t.listId];
    if (!list || list._del || list.archived) continue;
    const base = t.allDay ? startOfDay(t.startAt || t.dueAt) + hmToMin(p.allDayReminder) * 60000 : (t.startAt || t.dueAt);
    for (const r of t.reminders) {
      const at = t.allDay ? startOfDay(t.startAt || t.dueAt) - r * 60000 + hmToMin(p.allDayReminder) * 60000 : base - r * 60000;
      // for all-day tasks r is in minutes but measured in whole days (1440 = 1 day early)
      if (at >= from && at <= until) out.push({ key: `t:${t.id}:${t.dueAt}:${r}`, at, title: t.title || 'Task', body: fmtTaskDate(t), taskId: t.id });
    }
  }
  if (p.dailyReminder) {
    for (let i = 0; i <= Math.min(days, 7); i++) {
      const d = addDays(today(), i);
      const at = d + hmToMin(p.dailyReminder) * 60000;
      if (at < from || at > until) continue;
      const n = all('tasks').filter((t) => t.status === 0 && !t.trashed && t.dueAt && (t.allDay ? startOfDay(t.dueAt) <= d : startOfDay(t.dueAt) <= d) && getDB().lists[t.listId] && !getDB().lists[t.listId]._del).length;
      out.push({ key: `daily:${ymd(d)}`, at, title: 'Plan your day', body: n ? `${n} task${n > 1 ? 's' : ''} for today` : 'Nothing due today — add something?' });
    }
  }
  for (const h of all('habits')) {
    if (h.archived || !h.reminders?.length) continue;
    for (let i = 0; i <= Math.min(days, 7); i++) {
      const d = addDays(today(), i);
      if (!isHabitDueOn(h, d)) continue;
      if (i === 0 && isLogDone(h, getLog(h.id, ymd(d)))) continue;
      for (const r of h.reminders) {
        const at = d + hmToMin(r) * 60000;
        if (at >= from && at <= until) out.push({ key: `h:${h.id}:${ymd(d)}:${r}`, at, title: `${h.icon || '✅'} ${h.name}`, body: 'Habit check-in', habitId: h.id });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- browser ----------
const firedKey = 'taskday.fired';
function loadFired() { try { return JSON.parse(localStorage.getItem(firedKey) || '{}'); } catch { return {}; } }
function saveFired(f) {
  const cutoff = Date.now() - 3 * 86400000;
  for (const k in f) if (f[k] < cutoff) delete f[k];
  try { localStorage.setItem(firedKey, JSON.stringify(f)); } catch { /* ignore */ }
}

export async function showSystemNotification(title, body, data = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, { body, data, icon: 'icons/icon-192.png', tag: data.key }); return true; }
  } catch { /* fall through */ }
  try { new Notification(title, { body, icon: 'icons/icon-192.png' }); return true; } catch { return false; }
}

function webTick() {
  const p = getPrefs();
  if (!p.notify) return;
  const fired = loadFired();
  const now = Date.now();
  const due = upcomingReminders(now - 10 * 60000, 1).filter((r) => r.at <= now && !fired[r.key]);
  for (const r of due) {
    fired[r.key] = now;
    if (p.sound) playReminder();
    showSystemNotification(r.title, r.body, { taskId: r.taskId, key: r.key });
    onFire(r);
  }
  if (due.length) saveFired(fired);
}

// ---------- android ----------
const NOTIF_IDS = 'taskday.notifIds';
function idFor(key) { let h = 7; for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0; return Math.abs(h % 2000000000) + 1000; }
let schedTimer = null;
async function rescheduleNative() {
  const p = getPrefs();
  try {
    let old = [];
    try { old = JSON.parse(localStorage.getItem(NOTIF_IDS) || '[]'); } catch { /* ignore */ }
    if (old.length) await LocalNotif.cancel(old);
    if (!p.notify) { localStorage.setItem(NOTIF_IDS, '[]'); return; }
    const items = upcomingReminders(Date.now() + 5000).slice(0, 60);
    const notifs = items.map((r) => ({
      id: idFor(r.key), title: r.title, body: r.body || ' ', channelId: 'reminders',
      schedule: { at: new Date(r.at).toISOString(), allowWhileIdle: true },
      extra: { taskId: r.taskId || null, habitId: r.habitId || null },
    }));
    if (notifs.length) await LocalNotif.schedule(notifs);
    localStorage.setItem(NOTIF_IDS, JSON.stringify(notifs.map((n) => n.id)));
  } catch (e) { console.warn('schedule failed', e); }
}

export async function requestNotifyPermission() {
  if (isNative()) {
    try { const r = await LocalNotif.requestPermissions(); return r.display === 'granted'; } catch { return false; }
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
export function notifyPermissionState() {
  if (isNative()) return 'app';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Focus timer end alert scheduled in advance on Android (screen may be off).
const FOCUS_NOTIF = 999001;
export async function scheduleFocusAlert(at, title, body) {
  if (!isNative()) return;
  try { await LocalNotif.cancel([FOCUS_NOTIF]); await LocalNotif.schedule([{ id: FOCUS_NOTIF, title, body, channelId: 'focus', schedule: { at: new Date(at).toISOString(), allowWhileIdle: true } }]); } catch (e) { console.warn(e); }
}
export async function cancelFocusAlert() { if (isNative()) { try { await LocalNotif.cancel([FOCUS_NOTIF]); } catch { /* ignore */ } } }

export function startReminders(openTask) {
  if (isNative()) {
    (async () => {
      try {
        await LocalNotif.createChannel({ id: 'reminders', name: 'Reminders', importance: 5, visibility: 1, vibration: true });
        await LocalNotif.createChannel({ id: 'focus', name: 'Focus timer', importance: 5, visibility: 1, vibration: true });
      } catch { /* ignore */ }
      const perm = await LocalNotif.checkPermissions().catch(() => null);
      if (perm && perm.display !== 'granted') await LocalNotif.requestPermissions().catch(() => {});
      rescheduleNative();
    })();
    addNativeListener('LocalNotifications', 'localNotificationActionPerformed', (ev) => {
      const id = ev?.notification?.extra?.taskId;
      if (id) openTask(id);
    });
    onChange(() => { clearTimeout(schedTimer); schedTimer = setTimeout(rescheduleNative, 2500); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rescheduleNative(); });
  } else {
    setInterval(webTick, 15000);
    setTimeout(webTick, 3000);
    navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open-task') openTask(e.data.taskId); });
  }
}
