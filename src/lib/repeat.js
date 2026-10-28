// Recurrence rules.
// rule = { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: n, byWeekday?: [0..6],
//          monthMode?: 'day'|'weekday'|'last', until?: ts, count?: n, fromCompletion?: bool, skipWeekends?: bool }
import { addDays, addMonths, addYears, startOfDay, startOfWeek, daysInMonth, WD_SHORT, MONTHS_SHORT, fmtMonthDay, DAY } from './date.js';

function nthWeekdayOfMonth(y, m, wd, n) {
  // n: 1..4 or -1 for last
  if (n === -1) {
    const last = new Date(y, m, daysInMonth(y, m));
    const diff = (last.getDay() - wd + 7) % 7;
    return new Date(y, m, last.getDate() - diff);
  }
  const first = new Date(y, m, 1);
  const diff = (wd - first.getDay() + 7) % 7;
  const day = 1 + diff + (n - 1) * 7;
  if (day > daysInMonth(y, m)) return null;
  return new Date(y, m, day);
}

function weekdayPos(t) {
  const d = new Date(t);
  const n = Math.ceil(d.getDate() / 7);
  const isLast = d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth());
  return { wd: d.getDay(), n: n > 4 || (isLast && n === 5) ? -1 : n };
}

// Next occurrence strictly after `after` for a series anchored at `anchor`.
export function nextOccurrence(rule, anchor, after) {
  if (!rule || !anchor) return null;
  const interval = Math.max(1, rule.interval || 1);
  const timeOfDay = anchor - startOfDay(anchor);
  const dayAfter = startOfDay(after);
  let cand = null;
  if (rule.freq === 'daily') {
    const k = Math.floor((dayAfter - startOfDay(anchor)) / DAY / interval) + 1;
    cand = addDays(startOfDay(anchor), Math.max(1, k) * interval);
    if (cand <= dayAfter) cand = addDays(cand, interval);
  } else if (rule.freq === 'weekly') {
    const days = rule.byWeekday && rule.byWeekday.length ? rule.byWeekday : [new Date(anchor).getDay()];
    const anchorWeek = startOfWeek(anchor, 1);
    let d = addDays(dayAfter, 1);
    for (let i = 0; i < 7 * interval * 60; i++) {
      const wk = Math.round((startOfWeek(d, 1) - anchorWeek) / (7 * DAY));
      if (wk >= 0 && wk % interval === 0 && days.includes(new Date(d).getDay())) { cand = d; break; }
      d = addDays(d, 1);
    }
  } else if (rule.freq === 'monthly') {
    const a = new Date(anchor);
    for (let k = 0; k < 600; k += interval) {
      const y = a.getFullYear(), m = a.getMonth() + k;
      const base = new Date(y, m, 1);
      let d;
      if (rule.monthMode === 'weekday') {
        const pos = weekdayPos(anchor);
        d = nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), pos.wd, pos.n);
      } else if (rule.monthMode === 'last') {
        d = new Date(base.getFullYear(), base.getMonth(), daysInMonth(base.getFullYear(), base.getMonth()));
      } else {
        d = new Date(base.getFullYear(), base.getMonth(), Math.min(a.getDate(), daysInMonth(base.getFullYear(), base.getMonth())));
      }
      if (d && d.getTime() > dayAfter) { cand = d.getTime(); break; }
    }
  } else if (rule.freq === 'yearly') {
    let k = 1;
    cand = startOfDay(addYears(anchor, 0));
    while (cand <= dayAfter && k < 400) { cand = startOfDay(addYears(anchor, k * interval)); k++; }
  }
  if (cand == null) return null;
  if (rule.skipWeekends) {
    while ([0, 6].includes(new Date(cand).getDay())) cand = addDays(cand, 1);
  }
  const result = startOfDay(cand) + timeOfDay;
  if (rule.until && startOfDay(result) > startOfDay(rule.until)) return null;
  return result;
}

// Compute the next dates for a repeating task when it is completed.
export function advanceTask(task, completedAt) {
  const r = task.repeat;
  if (!r || !task.dueAt) return null;
  if (r.count && (task.repeatDone || 0) + 1 >= r.count) return null;
  const anchor = task.repeatAnchor || task.dueAt;
  let base = task.dueAt;
  let next;
  if (r.fromCompletion) {
    const timeOfDay = task.dueAt - startOfDay(task.dueAt);
    const fake = startOfDay(completedAt) + timeOfDay;
    next = nextOccurrence({ ...r, byWeekday: r.freq === 'weekly' ? r.byWeekday : undefined }, fake, startOfDay(completedAt));
  } else {
    next = nextOccurrence(r, anchor, base);
  }
  if (!next) return null;
  const shift = next - task.dueAt;
  return {
    dueAt: next,
    startAt: task.startAt ? task.startAt + shift : null,
    repeatAnchor: r.fromCompletion ? next : anchor,
    repeatDone: (task.repeatDone || 0) + 1,
  };
}

// Future occurrences within [from, to] (excluding the current one), for calendar display.
export function occurrencesBetween(task, from, to, max = 60) {
  const out = [];
  if (!task.repeat || !task.dueAt) return out;
  let cur = task.dueAt;
  const anchor = task.repeatAnchor || task.dueAt;
  let done = task.repeatDone || 0;
  for (let i = 0; i < 1000 && out.length < max; i++) {
    if (task.repeat.count && done + 1 >= task.repeat.count) break;
    const nxt = nextOccurrence(task.repeat, anchor, cur);
    if (!nxt || nxt > to) break;
    done++;
    if (nxt >= from) out.push(nxt);
    cur = nxt;
  }
  return out;
}

const ORD = ['', '1st', '2nd', '3rd', '4th'];
export function describeRepeat(rule, anchor) {
  if (!rule) return 'None';
  const n = rule.interval || 1;
  let s = '';
  if (rule.freq === 'daily') s = n === 1 ? 'Daily' : `Every ${n} days`;
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday && rule.byWeekday.length ? [...rule.byWeekday].sort() : null;
    const isWorkdays = days && days.join() === '1,2,3,4,5';
    if (isWorkdays && n === 1) s = 'Weekdays';
    else if (days && days.length === 7 && n === 1) s = 'Daily';
    else s = (n === 1 ? 'Weekly' : `Every ${n} weeks`) + (days ? ` on ${sortWeekdays(days).map((d) => WD_SHORT[d]).join(', ')}` : '');
  }
  if (rule.freq === 'monthly') {
    s = n === 1 ? 'Monthly' : `Every ${n} months`;
    if (anchor) {
      const d = new Date(anchor);
      if (rule.monthMode === 'weekday') {
        const p = weekdayPos(anchor);
        s += ` on the ${p.n === -1 ? 'last' : ORD[p.n]} ${WD_SHORT[p.wd]}`;
      } else if (rule.monthMode === 'last') s += ' on the last day';
      else s += ` on day ${d.getDate()}`;
    }
  }
  if (rule.freq === 'yearly') s = (n === 1 ? 'Yearly' : `Every ${n} years`) + (anchor ? ` on ${fmtMonthDay(anchor)}` : '');
  if (rule.skipWeekends) s += ', skip weekends';
  if (rule.fromCompletion) s += ' (after completion)';
  if (rule.until) s += `, until ${fmtMonthDay(rule.until)}`;
  if (rule.count) s += `, ${rule.count} times`;
  return s;
}
function sortWeekdays(days) { return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); }

// RRULE (from TickTick CSV export) -> rule
export function fromRRule(str, fromCompletion) {
  if (!str) return null;
  const s = str.replace(/^RRULE:/i, '');
  const parts = Object.fromEntries(s.split(';').filter(Boolean).map((p) => { const [k, v] = p.split('='); return [k.toUpperCase(), v]; }));
  const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[parts.FREQ];
  if (!freq) return null;
  const rule = { freq, interval: Number(parts.INTERVAL || 1) };
  if (parts.BYDAY) {
    const map = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const days = parts.BYDAY.split(',').map((d) => d.replace(/^[-+\d]+/, '')).map((d) => map[d]).filter((d) => d != null);
    if (freq === 'weekly') rule.byWeekday = days;
    else if (freq === 'monthly' && /\d/.test(parts.BYDAY)) rule.monthMode = 'weekday';
    else if (freq === 'daily' && days.length) { rule.freq = 'weekly'; rule.byWeekday = days; }
  }
  if (parts.BYMONTHDAY === '-1') rule.monthMode = 'last';
  if (parts.COUNT) rule.count = Number(parts.COUNT);
  if (parts.UNTIL) {
    const u = parts.UNTIL;
    rule.until = new Date(Number(u.slice(0, 4)), Number(u.slice(4, 6)) - 1, Number(u.slice(6, 8))).getTime();
  }
  if (fromCompletion) rule.fromCompletion = true;
  return rule;
}
