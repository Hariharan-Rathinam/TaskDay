// Date helpers. All timestamps are epoch ms in local time.
export const DAY = 86400000;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WD_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));
export const WD_MIN = WEEKDAYS.map((d) => d.slice(0, 2));

export const now = () => Date.now();

export function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function endOfDay(t) { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); }
export function today() { return startOfDay(Date.now()); }
export function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
export function addMinutes(t, n) { return t + n * 60000; }
export function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function addMonths(t, n, anchorDay) {
  const d = new Date(t);
  const day = anchorDay || d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return target.getTime();
}
export function addYears(t, n) { return addMonths(t, n * 12); }
export function startOfWeek(t, weekStart = 1) {
  const d = new Date(startOfDay(t));
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}
export function startOfMonth(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
export function isSameDay(a, b) { return a != null && b != null && startOfDay(a) === startOfDay(b); }
export function diffDays(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
export function setTime(t, h, m) { const d = new Date(t); d.setHours(h, m, 0, 0); return d.getTime(); }
export function minutesOfDay(t) { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); }

export function ymd(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function hm(t) { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

let prefs = { h24: false, weekStart: 1, dateOrder: 'dmy' };
export function setDatePrefs(p) { prefs = { ...prefs, ...p }; }
export function getDatePrefs() { return prefs; }

export function fmtTime(t) {
  const d = new Date(t);
  const h = d.getHours(), m = d.getMinutes();
  if (prefs.h24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}`;
}
export function fmtHourLabel(h) {
  if (prefs.h24) return `${String(h).padStart(2, '0')}:00`;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}
export function fmtMonthDay(t) {
  const d = new Date(t);
  return prefs.dateOrder === 'mdy' ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export function fmtFullDate(t) {
  const d = new Date(t);
  const md = fmtMonthDay(t);
  return `${WD_SHORT[d.getDay()]}, ${md}${d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : ''}`;
}
// Relative day label: Today, Tomorrow, Yesterday, weekday within a week, else date.
export function fmtRelDay(t) {
  const n = diffDays(t, Date.now());
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WEEKDAYS[new Date(t).getDay()];
  const d = new Date(t);
  return fmtMonthDay(t) + (d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : '');
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Label for a task's date (with time / range).
export function fmtTaskDate(task) {
  if (!task.dueAt) return '';
  const base = fmtRelDay(task.startAt || task.dueAt);
  if (task.startAt && task.dueAt && task.startAt !== task.dueAt) {
    if (task.allDay) {
      return isSameDay(task.startAt, task.dueAt) ? base : `${base} - ${fmtRelDay(task.dueAt)}`;
    }
    if (isSameDay(task.startAt, task.dueAt)) return `${base}, ${fmtTime(task.startAt)} - ${fmtTime(task.dueAt)}`;
    return `${base} ${fmtTime(task.startAt)} - ${fmtRelDay(task.dueAt)} ${fmtTime(task.dueAt)}`;
  }
  return task.allDay ? base : `${base}, ${fmtTime(task.dueAt)}`;
}

export function monthMatrix(year, month, weekStart = 1) {
  const first = new Date(year, month, 1).getTime();
  const start = startOfWeek(first, weekStart);
  const weeks = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) { row.push(cur); cur = addDays(cur, 1); }
    weeks.push(row);
    if (new Date(cur).getMonth() !== month && w >= 3) break;
  }
  return weeks;
}
export function weekdayOrder(weekStart = 1) { return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7); }
