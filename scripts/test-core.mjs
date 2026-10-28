// Unit tests for the date parser, recurrence engine and sync merge. Run: node scripts/test-core.mjs
import assert from 'node:assert/strict';
import { parseQuickAdd } from '../src/lib/nlp.js';
import { nextOccurrence, advanceTask, describeRepeat, fromRRule } from '../src/lib/repeat.js';
import { today, addDays, ymd, setTime, startOfDay } from '../src/lib/date.js';
import * as store from '../src/store.js';

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n ', e.message); } }
const lists = [{ id: 'inbox', name: 'Inbox' }, { id: 'w', name: 'Work' }, { id: 'g', name: 'Grocery List' }];
const td = today();

t('tags priority list', () => {
  const r = parseQuickAdd('Buy milk #home #errand !high ~Grocery List', { lists });
  assert.equal(r.title, 'Buy milk'); assert.deepEqual(r.tags, ['home', 'errand']); assert.equal(r.priority, 5); assert.equal(r.listId, 'g');
});
t('tomorrow 5pm', () => {
  const r = parseQuickAdd('Call mom tomorrow 5pm', { lists });
  assert.equal(r.title, 'Call mom'); assert.equal(r.allDay, false); assert.equal(r.dueAt, setTime(addDays(td, 1), 17, 0));
});
t('today', () => { const r = parseQuickAdd('Report today', {}); assert.equal(r.dueAt, td); assert.equal(r.allDay, true); assert.equal(r.title, 'Report'); });
t('time range', () => {
  const r = parseQuickAdd('Meeting tomorrow 3pm-4:30pm', {});
  assert.equal(r.startAt, setTime(addDays(td, 1), 15, 0)); assert.equal(r.dueAt, setTime(addDays(td, 1), 16, 30)); assert.equal(r.title, 'Meeting');
});
t('every monday', () => {
  const r = parseQuickAdd('Gym every monday and thursday 7am', {});
  assert.equal(r.repeat.freq, 'weekly'); assert.deepEqual(r.repeat.byWeekday.sort(), [1, 4]); assert.equal(r.title, 'Gym'); assert.equal(new Date(r.dueAt).getHours(), 7);
});
t('daily', () => { const r = parseQuickAdd('Read daily', {}); assert.equal(r.repeat.freq, 'daily'); assert.equal(r.dueAt, td); assert.equal(r.title, 'Read'); });
t('in 3 days', () => { const r = parseQuickAdd('Pay rent in 3 days', {}); assert.equal(r.dueAt, addDays(td, 3)); assert.equal(r.title, 'Pay rent'); });
t('month name', () => {
  const r = parseQuickAdd('Exam 15 dec', {});
  const d = new Date(r.dueAt); assert.equal(d.getMonth(), 11); assert.equal(d.getDate(), 15); assert.equal(r.title, 'Exam');
});
t('numeric dmy', () => { const r = parseQuickAdd('Bill 5/11', {}); const d = new Date(r.dueAt); assert.equal(d.getMonth(), 10); assert.equal(d.getDate(), 5); });
t('next friday', () => { const r = parseQuickAdd('Party next friday', {}); assert.equal(new Date(r.dueAt).getDay(), 5); assert.ok(r.dueAt > td); });
t('no false positives', () => {
  const r = parseQuickAdd('Buy sun cream and a sat nav', {}); assert.equal(r.dueAt, null); assert.equal(r.title, 'Buy sun cream and a sat nav');
  const r2 = parseQuickAdd('Email Tom about the may report', {}); assert.equal(r2.dueAt, null);
});
t('smart off', () => { const r = parseQuickAdd('Call tomorrow #x', { smart: false }); assert.equal(r.dueAt, null); assert.equal(r.title, 'Call tomorrow'); });
t('keep text', () => { const r = parseQuickAdd('Call mom tomorrow #x', { keepText: true }); assert.equal(r.title, 'Call mom tomorrow'); assert.ok(r.dueAt); });

// Repeat
const d = (y, m, dd, h = 0, mi = 0) => new Date(y, m - 1, dd, h, mi).getTime();
t('daily next', () => assert.equal(nextOccurrence({ freq: 'daily', interval: 1 }, d(2026, 1, 1, 9), d(2026, 1, 1, 9)), d(2026, 1, 2, 9)));
t('every 3 days', () => assert.equal(nextOccurrence({ freq: 'daily', interval: 3 }, d(2026, 1, 1), d(2026, 1, 1)), d(2026, 1, 4)));
t('weekly mon/wed', () => {
  // 2026-01-05 is Monday
  const r = { freq: 'weekly', interval: 1, byWeekday: [1, 3] };
  assert.equal(nextOccurrence(r, d(2026, 1, 5), d(2026, 1, 5)), d(2026, 1, 7));
  assert.equal(nextOccurrence(r, d(2026, 1, 5), d(2026, 1, 7)), d(2026, 1, 12));
});
t('biweekly', () => assert.equal(nextOccurrence({ freq: 'weekly', interval: 2 }, d(2026, 1, 5), d(2026, 1, 5)), d(2026, 1, 19)));
t('monthly 31st clamps', () => {
  const r = { freq: 'monthly', interval: 1 };
  assert.equal(nextOccurrence(r, d(2026, 1, 31), d(2026, 1, 31)), d(2026, 2, 28));
  assert.equal(nextOccurrence(r, d(2026, 1, 31), d(2026, 2, 28)), d(2026, 3, 31));
});
t('monthly nth weekday', () => {
  // 2026-01-13 is 2nd Tuesday; Feb 2nd Tuesday = Feb 10
  assert.equal(nextOccurrence({ freq: 'monthly', interval: 1, monthMode: 'weekday' }, d(2026, 1, 13), d(2026, 1, 13)), d(2026, 2, 10));
});
t('yearly', () => assert.equal(nextOccurrence({ freq: 'yearly', interval: 1 }, d(2024, 2, 29), d(2024, 2, 29)), d(2025, 2, 28)));
t('advance count', () => {
  const task = { dueAt: d(2026, 1, 1), repeat: { freq: 'daily', interval: 1, count: 2 }, repeatDone: 0 };
  const a = advanceTask(task, d(2026, 1, 1)); assert.equal(a.dueAt, d(2026, 1, 2));
  assert.equal(advanceTask({ ...task, ...a }, d(2026, 1, 2)), null);
});
t('from completion', () => {
  const task = { dueAt: d(2026, 1, 1, 8), repeat: { freq: 'daily', interval: 2, fromCompletion: true } };
  assert.equal(advanceTask(task, d(2026, 1, 5, 14)).dueAt, d(2026, 1, 7, 8));
});
t('describe', () => {
  assert.equal(describeRepeat({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(describeRepeat({ freq: 'daily', interval: 2 }), 'Every 2 days');
});
t('rrule', () => {
  const r = fromRRule('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR');
  assert.equal(r.freq, 'weekly'); assert.deepEqual(r.byWeekday, [1, 5]);
});

// Merge
t('merge LWW + tombstones', () => {
  store.replaceAll({});
  const a = store.put('tasks', { id: 'x', title: 'A', status: 0, listId: 'inbox', order: 0 });
  const remote = { tasks: { x: { ...a, title: 'B', updatedAt: a.updatedAt + 10 }, y: { id: 'y', title: 'Y', updatedAt: 5, listId: 'inbox', status: 0, order: 1 } } };
  assert.equal(store.mergeRemote(remote), true);
  assert.equal(store.getDB().tasks.x.title, 'B');
  assert.equal(store.mergeRemote(remote), false); // idempotent
  store.remove('tasks', 'y');
  store.mergeRemote(remote); // older remote version must not resurrect
  assert.equal(store.getDB().tasks.y._del, true);
  // tie-break deterministic
  const r1 = { tasks: { z: { id: 'z', title: 'P', updatedAt: 100 } } }, r2 = { tasks: { z: { id: 'z', title: 'Q', updatedAt: 100 } } };
  store.mergeRemote(r1); store.mergeRemote(r2); const w1 = store.getDB().tasks.z.title;
  store.replaceAll({}); store.mergeRemote(r2); store.mergeRemote(r1); assert.equal(store.getDB().tasks.z.title, w1);
});
t('complete repeating task', () => {
  store.replaceAll({});
  const task = store.createTask({ title: 'Water plants', dueAt: today(), repeat: { freq: 'daily', interval: 1 }, checklist: [{ id: 'c', title: 'x', done: true }] });
  const r = store.completeTask(task.id);
  assert.equal(r.repeated, true);
  const cur = store.getDB().tasks[task.id];
  assert.equal(cur.dueAt, addDays(today(), 1)); assert.equal(cur.status, 0); assert.equal(cur.checklist[0].done, false);
  const hist = store.all('tasks').find((x) => x.repeatOf === task.id);
  assert.equal(hist.status, 2);
  store.undo();
  assert.equal(store.getDB().tasks[task.id].dueAt, today());
  assert.ok(!store.all('tasks').find((x) => x.repeatOf === task.id));
});
t('habit streak', () => {
  store.replaceAll({});
  const h = store.put('habits', { id: 'h1', name: 'Run', freq: { type: 'daily' }, goal: { type: 'once' }, startDate: ymd(addDays(today(), -30)) });
  for (const i of [0, 1, 2, 4, 5, 6, 7, 8]) store.setHabitValue('h1', ymd(addDays(today(), -i)), 1);
  const s = store.habitStats(h);
  assert.equal(s.cur, 3); assert.equal(s.best, 5); assert.equal(s.total, 8);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
