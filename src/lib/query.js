// Which tasks appear in which view, and how they are grouped and sorted.
import { all, alive, getDB, INBOX } from '../store.js';
import { today, addDays, startOfDay, endOfDay, startOfWeek, startOfMonth, addMonths, fmtRelDay, WEEKDAYS, diffDays, fmtFullDate } from './date.js';

export const SMART = {
  today: { name: 'Today', icon: 'today' },
  tomorrow: { name: 'Tomorrow', icon: 'sunrise' },
  next7: { name: 'Next 7 Days', icon: 'week' },
  inbox: { name: 'Inbox', icon: 'inbox' },
  all: { name: 'All', icon: 'all' },
  completed: { name: 'Completed', icon: 'checkCircle' },
  wontdo: { name: "Won't Do", icon: 'xCircle' },
  summary: { name: 'Summary', icon: 'summary' },
  trash: { name: 'Trash', icon: 'trash' },
};

export const PRIORITY = {
  5: { name: 'High', color: 'var(--p-high)' },
  3: { name: 'Medium', color: 'var(--p-med)' },
  1: { name: 'Low', color: 'var(--p-low)' },
  0: { name: 'None', color: 'var(--p-none)' },
};

export function activeLists() {
  return all('lists').filter((l) => !l.archived);
}
export function isTaskVisible(t) {
  if (!alive(t) || t.trashed) return false;
  const l = getDB().lists[t.listId];
  return !!l && alive(l) && !l.archived;
}
// The day a task "lands" on for date-based views (start of range if any).
export function taskDay(t) { return t.dueAt ? startOfDay(t.startAt || t.dueAt) : null; }
export function taskEndDay(t) { return t.dueAt ? startOfDay(t.dueAt) : null; }
export function isOverdue(t) {
  if (!t.dueAt || t.status !== 0) return false;
  return t.allDay ? startOfDay(t.dueAt) < today() : t.dueAt < Date.now();
}
function overlaps(t, from, to) {
  if (!t.dueAt) return false;
  const s = taskDay(t), e = taskEndDay(t);
  return s <= to && e >= from;
}

export function matchesDateRule(t, rule) {
  const td = today();
  switch (rule) {
    case 'any': case undefined: case null: return true;
    case 'nodate': return !t.dueAt;
    case 'overdue': return isOverdue(t);
    case 'today': return overlaps(t, td, td) || isOverdue(t);
    case 'tomorrow': return overlaps(t, addDays(td, 1), addDays(td, 1));
    case 'thisweek': { const s = startOfWeek(td); return overlaps(t, s, addDays(s, 6)); }
    case 'next7': return overlaps(t, td, addDays(td, 6)) || isOverdue(t);
    case 'thismonth': { const s = startOfMonth(td); return overlaps(t, s, addDays(addMonths(s, 1), -1)); }
    case 'hasdate': return !!t.dueAt;
    default: return true;
  }
}

export function filterMatches(t, rules) {
  if (!rules) return true;
  if (rules.lists?.length && !rules.lists.includes(t.listId)) return false;
  if (rules.tags?.length) {
    const tt = t.tags || [];
    const wantNone = rules.tags.includes('__none__');
    const ok = rules.tags.some((x) => x !== '__none__' && (tt.includes(x) || tt.some((y) => tagParentOf(y) === x))) || (wantNone && tt.length === 0);
    if (!ok) return false;
  }
  if (rules.priorities?.length && !rules.priorities.includes(t.priority || 0)) return false;
  if (rules.dates?.length && !rules.dates.some((d) => matchesDateRule(t, d))) return false;
  if (rules.keyword) {
    const k = rules.keyword.toLowerCase();
    if (!(t.title || '').toLowerCase().includes(k) && !(t.content || '').toLowerCase().includes(k)) return false;
  }
  return true;
}
function tagParentOf(name) { const tag = all('tags').find((x) => x.name === name); return tag?.parent || null; }

// Returns { open: Task[], done: Task[] } for a view key: 'smart:today' | 'list:<id>' | 'tag:<name>' | 'filter:<id>'
export function tasksForView(view) {
  const [kind, id] = splitView(view);
  const tasks = all('tasks');
  if (kind === 'smart' && id === 'trash') return { open: tasks.filter((t) => t.trashed).sort((a, b) => b.trashed - a.trashed), done: [] };
  let vis = tasks.filter(isTaskVisible);
  if (kind === 'smart' && id !== 'inbox') { const lists = getDB().lists; vis = vis.filter((t) => !lists[t.listId]?.hideInSmart); }
  let pred = () => true;
  let doneMode = 'normal';
  if (kind === 'smart') {
    const td = today();
    if (id === 'today') pred = (t) => (t.status === 0 ? matchesDateRule(t, 'today') : overlaps(t, td, td) || (t.completedAt && startOfDay(t.completedAt) === td && t.dueAt && taskDay(t) <= td));
    else if (id === 'tomorrow') pred = (t) => matchesDateRule(t, 'tomorrow');
    else if (id === 'next7') pred = (t) => (t.status === 0 ? matchesDateRule(t, 'next7') : overlaps(t, td, addDays(td, 6)));
    else if (id === 'inbox') pred = (t) => t.listId === INBOX;
    else if (id === 'all') pred = () => true;
    else if (id === 'completed') { doneMode = 'only2'; }
    else if (id === 'wontdo') { doneMode = 'only-1'; }
  } else if (kind === 'list') pred = (t) => t.listId === id;
  else if (kind === 'tag') pred = (t) => (t.tags || []).includes(id) || (t.tags || []).some((x) => tagParentOf(x) === id);
  else if (kind === 'filter') { const f = getDB().filters[id]; pred = (t) => filterMatches(t, f?.rules); }
  if (doneMode === 'only2') return { open: vis.filter((t) => t.status === 2).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), done: [] };
  if (doneMode === 'only-1') return { open: vis.filter((t) => t.status === -1).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), done: [] };
  const matched = vis.filter(pred);
  return {
    open: matched.filter((t) => t.status === 0),
    done: matched.filter((t) => t.status !== 0).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
  };
}
export function splitView(view) { const i = view.indexOf(':'); return [view.slice(0, i), view.slice(i + 1)]; }

export function viewTitle(view) {
  const [kind, id] = splitView(view);
  const db = getDB();
  if (kind === 'smart') return SMART[id]?.name || id;
  if (kind === 'list') return db.lists[id]?.name || 'List';
  if (kind === 'tag') return '#' + id;
  if (kind === 'filter') return db.filters[id]?.name || 'Filter';
  return '';
}

export function defaultViewOpts(view) {
  const [kind, id] = splitView(view);
  if (kind === 'smart') {
    if (id === 'today' || id === 'tomorrow') return { groupBy: 'date', sortBy: 'date' };
    if (id === 'next7') return { groupBy: 'date', sortBy: 'date' };
    if (id === 'all') return { groupBy: 'list', sortBy: 'date' };
    if (id === 'completed' || id === 'wontdo') return { groupBy: 'completed', sortBy: 'completed' };
    return { groupBy: 'none', sortBy: 'date' };
  }
  if (kind === 'list') return { groupBy: 'section', sortBy: 'manual' };
  return { groupBy: 'date', sortBy: 'date' };
}

const pr = (t) => t.priority || 0;
export function sortTasks(arr, sortBy) {
  const byPinned = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
  const byDate = (a, b) => (a.dueAt ? (a.startAt || a.dueAt) - (a.allDay ? 0 : 1) : Infinity) - (b.dueAt ? (b.startAt || b.dueAt) - (b.allDay ? 0 : 1) : Infinity);
  const cmp = {
    date: (a, b) => byDate(a, b) || pr(b) - pr(a) || a.order - b.order,
    priority: (a, b) => pr(b) - pr(a) || byDate(a, b) || a.order - b.order,
    title: (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }),
    manual: (a, b) => (a.order ?? 0) - (b.order ?? 0),
    created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    completed: (a, b) => (b.completedAt || 0) - (a.completedAt || 0),
    tag: (a, b) => (a.tags?.[0] || '~').localeCompare(b.tags?.[0] || '~') || byDate(a, b),
  }[sortBy] || ((a, b) => a.order - b.order);
  return [...arr].sort((a, b) => byPinned(a, b) || cmp(a, b));
}

// Group tasks. Returns [{ key, title, tasks, color?, droppable? }]
export function groupTasks(tasks, groupBy, ctx = {}) {
  const db = getDB();
  if (groupBy === 'none' || !groupBy) return [{ key: 'all', title: '', tasks }];
  const groups = new Map();
  const add = (key, title, t, extra) => { if (!groups.has(key)) groups.set(key, { key, title, tasks: [], ...extra }); if (t) groups.get(key).tasks.push(t); };
  const td = today();
  if (groupBy === 'date') {
    for (const t of tasks) {
      if (!t.dueAt) { add('nodate', 'No Date', t, { order: 9999 }); continue; }
      if (isOverdue(t) && taskEndDay(t) < td) { add('overdue', 'Overdue', t, { order: -1 }); continue; }
      const d = Math.max(taskDay(t), td);
      const n = diffDays(d, td);
      if (n <= 6) add('d' + n, n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : WEEKDAYS[new Date(d).getDay()], t, { order: n, date: d });
      else add('later', 'Later', t, { order: 100 });
    }
  } else if (groupBy === 'priority') {
    for (const t of tasks) { const p = pr(t); add('p' + p, PRIORITY[p].name, t, { order: -p, priority: p }); }
  } else if (groupBy === 'list') {
    for (const t of tasks) { const l = db.lists[t.listId]; add(t.listId, l?.name || 'Inbox', t, { order: t.listId === INBOX ? -1 : (l?.order ?? 0), listId: t.listId }); }
  } else if (groupBy === 'tag') {
    for (const t of tasks) { const tag = t.tags?.[0]; add(tag || '__none', tag ? '#' + tag : 'No Tags', t, { order: tag ? 0 : 1 }); }
  } else if (groupBy === 'section') {
    const secs = all('sections').filter((s) => s.listId === ctx.listId).sort((a, b) => a.order - b.order);
    add('__nosec', 'Not Sectioned', null, { order: -1, sectionId: null });
    secs.forEach((s, i) => add(s.id, s.name, null, { order: i, sectionId: s.id }));
    for (const t of tasks) { const s = t.sectionId && groups.has(t.sectionId) ? t.sectionId : '__nosec'; groups.get(s).tasks.push(t); }
    if (!groups.get('__nosec').tasks.length && secs.length && !ctx.keepEmpty) groups.delete('__nosec');
    if (!secs.length) { const g = groups.get('__nosec'); if (g) g.title = ''; }
  } else if (groupBy === 'completed') {
    for (const t of tasks) { const d = startOfDay(t.completedAt || 0); add('c' + d, fmtFullDate(d), t, { order: -d }); }
  }
  return [...groups.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(String(b.title)));
}

// Build parent/child tree inside a flat set of tasks.
export function buildTree(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map();
  const roots = [];
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) { if (!kids.has(t.parentId)) kids.set(t.parentId, []); kids.get(t.parentId).push(t); }
    else roots.push(t);
  }
  return { roots, kids };
}

export function smartCount(id) {
  const { open } = tasksForView('smart:' + id);
  return open.length;
}
export function relLabel(t) { return t.dueAt ? fmtRelDay(t.dueAt) : ''; }
export { endOfDay };
