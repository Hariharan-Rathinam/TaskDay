// User-facing task actions (with sound, toasts and undo) and the task context menu.
import * as S from '../store.js';
import { toast, openMenu, promptDialog, closeMenu } from './common.jsx';
import Icon from './Icon.jsx';
import { playComplete } from '../lib/audio.js';
import { openTask, setUI, getUI, goSection } from './state.js';
import { today, addDays, startOfDay, startOfWeek, getDatePrefs, setTime, minutesOfDay } from '../lib/date.js';
import { activeLists, PRIORITY } from '../lib/query.js';

export function doToggle(id) {
  const t = S.getDB().tasks[id];
  if (!t) return;
  if (t.status === 0) {
    const r = S.completeTask(id);
    if (S.getPrefs().sound) playComplete();
    toast(r?.repeated ? 'Completed — next one scheduled' : 'Completed', { action: 'Undo', onAction: S.undo });
  } else {
    S.uncompleteTask(id);
  }
}
export function doTrash(ids) {
  S.trashTasks(ids);
  if (ids.includes(getUI().taskId)) setUI({ taskId: null });
  toast(ids.length > 1 ? `${ids.length} tasks deleted` : 'Deleted', { action: 'Undo', onAction: S.undo });
}
export function doWontDo(id) { S.wontDoTask(id); toast("Marked as Won't Do", { action: 'Undo', onAction: S.undo }); }

// Set a date but keep the time of day if the task had one.
export function dateChanges(task, day) {
  if (day == null) return { dueAt: null, startAt: null, allDay: true, repeat: null };
  if (task.dueAt && !task.allDay) {
    const dur = task.startAt ? task.dueAt - task.startAt : 0;
    const m = minutesOfDay(task.startAt || task.dueAt);
    const start = setTime(day, Math.floor(m / 60), m % 60);
    return dur ? { startAt: start, dueAt: start + dur } : { dueAt: start, startAt: null };
  }
  if (task.startAt && task.dueAt) {
    const span = startOfDay(task.dueAt) - startOfDay(task.startAt);
    return { startAt: day, dueAt: day + span };
  }
  return { dueAt: day, startAt: null, allDay: true };
}
export function setTaskDay(ids, day) {
  S.pushUndo('Date changed', S.snapshot('tasks', ids));
  S.batch((b) => { for (const id of ids) { const t = S.getDB().tasks[id]; if (t) b.patch('tasks', id, dateChanges(t, day)); } });
}

export function dateMenuItems(ids) {
  const td = today();
  return [
    { label: 'Today', icon: 'sun', onClick: () => setTaskDay(ids, td) },
    { label: 'Tomorrow', icon: 'sunrise', onClick: () => setTaskDay(ids, addDays(td, 1)) },
    { label: 'Next week', icon: 'week', onClick: () => setTaskDay(ids, addDays(startOfWeek(td, getDatePrefs().weekStart), 7)) },
    { label: 'No date', icon: 'x', onClick: () => setTaskDay(ids, null) },
  ];
}
export function priorityMenuItems(ids) {
  const cur = ids.length === 1 ? S.getDB().tasks[ids[0]]?.priority || 0 : null;
  return [5, 3, 1, 0].map((p) => ({ label: PRIORITY[p].name + ' priority', icon: 'flag', color: PRIORITY[p].color, checked: cur === p, onClick: () => S.batch((b) => ids.forEach((id) => b.patch('tasks', id, { priority: p }))) }));
}
export function moveMenuItems(ids) {
  const db = S.getDB();
  const cur = ids.length === 1 ? db.tasks[ids[0]]?.listId : null;
  return activeLists().sort((a, b) => (a.id === S.INBOX ? -1 : b.id === S.INBOX ? 1 : a.order - b.order)).map((l) => ({
    label: l.name, icon: l.emoji ? <span>{l.emoji}</span> : l.id === S.INBOX ? 'inbox' : 'list', color: l.color, checked: cur === l.id,
    onClick: () => S.moveTasks(ids, l.id),
  }));
}
export function tagMenuItems(ids) {
  const db = S.getDB();
  const tags = S.all('tags').sort((a, b) => a.name.localeCompare(b.name));
  const items = tags.map((tg) => {
    const on = ids.every((id) => db.tasks[id]?.tags?.includes(tg.name));
    return { label: tg.name, icon: 'tag', color: tg.color, checked: on, onClick: () => S.batch((b) => ids.forEach((id) => { const t = db.tasks[id]; const tags2 = on ? t.tags.filter((x) => x !== tg.name) : [...new Set([...(t.tags || []), tg.name])]; b.patch('tasks', id, { tags: tags2 }); })) };
  });
  items.push('-', { label: 'New tag…', icon: 'plus', onClick: async () => { const n = await promptDialog('New tag', '', { placeholder: 'Tag name' }); if (n && n.trim()) { const name = n.trim().replace(/^#/, '').toLowerCase(); S.ensureTag(name); S.batch((b) => ids.forEach((id) => { const t = S.getDB().tasks[id]; b.patch('tasks', id, { tags: [...new Set([...(t.tags || []), name])] }); })); } } });
  return items;
}

export function taskMenu(task, target, extra = {}) {
  const ids = [task.id];
  if (task.trashed) {
    openMenu(target, [
      { label: 'Restore', icon: 'undo', onClick: () => S.restoreTasks(ids) },
      { label: 'Delete forever', icon: 'trash', danger: true, onClick: () => S.deleteForever(ids) },
    ]);
    return;
  }
  const siblings = extra.prevSibling;
  openMenu(target, [
    { custom: <div className="menu-date-row">{dateMenuItems(ids).map((it) => <button key={it.label} className="icon-btn" title={it.label} onClick={() => { it.onClick(); closeMenu(); }}>{it.icon === 'week' ? <span className="dp-plus">+7</span> : <Icon name={it.icon} size={18} />}</button>)}</div> },
    { custom: <div className="menu-date-row">{[5, 3, 1, 0].map((p) => <button key={p} className={'icon-btn' + ((task.priority || 0) === p ? ' active' : '')} title={PRIORITY[p].name} style={{ color: PRIORITY[p].color }} onClick={() => { S.updateTask(task.id, { priority: p }); closeMenu(); }}><Icon name="flag" size={18} /></button>)}</div> },
    '-',
    { label: 'Open', icon: 'edit', onClick: () => openTask(task.id) },
    { label: task.pinned ? 'Unpin' : 'Pin', icon: 'pin', onClick: () => S.updateTask(task.id, { pinned: !task.pinned }) },
    { label: 'Add subtask', icon: 'subtask', onClick: () => { const c = S.createTask({ title: '', parentId: task.id, listId: task.listId, sectionId: task.sectionId }); openTask(c.id); } },
    siblings ? { label: 'Make subtask of previous', icon: 'indent', onClick: () => S.indentTask(task.id, siblings) } : null,
    task.parentId ? { label: 'Move out of parent', icon: 'outdent', onClick: () => S.outdentTask(task.id) } : null,
    { label: 'Move to', icon: 'arrowRight', submenu: moveMenuItems(ids) },
    { label: 'Tags', icon: 'tag', submenu: tagMenuItems(ids) },
    { label: 'Start focus', icon: 'pomo', onClick: () => { setUI({ focusTaskId: task.id }); goSection('focus'); } },
    { label: 'Duplicate', icon: 'copy', onClick: () => S.duplicateTask(task.id) },
    task.status === 0 ? { label: "Won't Do", icon: 'xCircle', onClick: () => doWontDo(task.id) } : { label: 'Reopen', icon: 'undo', onClick: () => S.uncompleteTask(task.id) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => doTrash(ids) },
  ], { width: 240 });
}
