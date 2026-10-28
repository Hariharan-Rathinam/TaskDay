import { useEffect, useState, useSyncExternalStore } from 'react';
import Icon from './ui/Icon.jsx';
import * as S from './store.js';
import { useDB, usePrefs, getDB, all } from './store.js';
import { useUI, setUI, getUI, goSection, closeTask, clearSelection, openTask } from './ui/state.js';
import { MenuHost, DialogHost, ToastHost, useIsMobile, toast, Popover } from './ui/common.jsx';
import { setDropHandler } from './lib/dnd.js';
import { setDatePrefs, startOfDay, setTime, fmtClock } from './lib/date.js';
import { setAllDayHint } from './ui/DatePicker.jsx';
import { Sidebar } from './views/Sidebar.jsx';
import { TaskPane, viewDefaults, useViewOpts } from './views/Tasks.jsx';
import { TaskDetail } from './views/TaskDetail.jsx';
import { CalendarView } from './views/Calendar.jsx';
import { HabitsView } from './views/Habits.jsx';
import { FocusView } from './views/Focus.jsx';
import { CountdownView } from './views/Countdown.jsx';
import { StatsView } from './views/Stats.jsx';
import { SearchView } from './views/Search.jsx';
import { SettingsView, ACCENTS } from './views/Settings.jsx';
import { QuickAdd } from './ui/QuickAdd.jsx';
import { dateChanges, setTaskDay, doTrash, doToggle, doWontDo } from './ui/actions.js';
import { taskDay, splitView } from './lib/query.js';
import * as Sync from './lib/sync.js';
import { useFocus, remainingSecs } from './lib/focus.js';
import { isNative, onBackButton, exitApp } from './lib/native.js';

const SECTIONS = [
  ['tasks', 'checkSquare', 'Tasks'], ['calendar', 'calendar', 'Calendar'], ['habits', 'habit', 'Habit'], ['focus', 'pomo', 'Focus'],
  ['countdown', 'countdown', 'Countdown'], ['stats', 'stats', 'Statistics'], ['search', 'search', 'Search'],
];
const HOUR = 48;

// ---------- drop handling ----------
function handleDrop(payload, spec, info) {
  const db = getDB();
  if (payload.type === 'task') {
    const id = payload.id;
    const t = db.tasks[id];
    if (!t) return;
    switch (spec.type) {
      case 'task': {
        if (spec.id === id) return;
        const target = db.tasks[spec.id];
        if (!target) return;
        const ui = getUI();
        const extra = {};
        if (ui.section === 'tasks') {
          const [kind] = splitView(ui.view);
          const opts = currentOpts;
          if (opts?.groupBy === 'date' && taskDay(target) !== taskDay(t)) Object.assign(extra, dateChanges(t, taskDay(target)));
          if (opts?.groupBy === 'priority' && (target.priority || 0) !== (t.priority || 0)) extra.priority = target.priority || 0;
          if (kind === 'list' && opts?.sortBy !== 'manual') S.patch('lists', target.listId, { sortBy: 'manual' });
        }
        S.pushUndo('Moved', S.snapshot('tasks', [id]));
        if (info.pos === 'bottom') {
          const sibs = all('tasks').filter((x) => x.listId === target.listId && (x.parentId || null) === (target.parentId || null) && x.id !== id && !x.trashed).sort((a, b) => a.order - b.order);
          const next = sibs[sibs.findIndex((x) => x.id === target.id) + 1];
          if (next) S.reorderTask(id, next.id, extra);
          else S.patch('tasks', id, { order: target.order + 1024, listId: target.listId, parentId: target.parentId || null, sectionId: target.sectionId || null, ...extra });
        } else S.reorderTask(id, target.id, extra);
        return;
      }
      case 'group':
        if (spec.set) { S.pushUndo('Moved', S.snapshot('tasks', [id])); S.updateTask(id, spec.set); }
        if (spec.dayKey) setTaskDay([id], spec.day);
        if (spec.tag !== undefined) S.updateTask(id, { tags: spec.tag ? [spec.tag, ...(t.tags || []).filter((x) => x !== spec.tag)] : [] });
        return;
      case 'day': setTaskDay([id], spec.day); toast('Rescheduled', { action: 'Undo', onAction: S.undo }); return;
      case 'slot': {
        const r = info.el.getBoundingClientRect();
        const min = Math.max(0, Math.min(24 * 60 - 15, Math.round(((info.y - r.top) / HOUR) * 4) * 15));
        const dur = t.startAt && !t.allDay ? t.dueAt - t.startAt : 0;
        const start = spec.day + min * 60000;
        S.pushUndo('Rescheduled', S.snapshot('tasks', [id]));
        S.updateTask(id, dur ? { startAt: start, dueAt: start + dur, allDay: false } : { dueAt: start, startAt: null, allDay: false });
        return;
      }
      case 'list': S.pushUndo('Moved', S.snapshot('tasks', [id])); S.moveTasks([id], spec.id); toast(`Moved to ${db.lists[spec.id]?.name}`, { action: 'Undo', onAction: S.undo }); return;
      case 'tag': S.updateTask(id, { tags: [...new Set([...(t.tags || []), spec.name])] }); toast('Tagged #' + spec.name); return;
      case 'trash': doTrash([id]); return;
      case 'complete': if (t.status === 0) doToggle(id); return;
      case 'wontdo': if (t.status === 0) doWontDo(id); return;
      default: return;
    }
  }
  if (payload.type === 'list') {
    const l = db.lists[payload.id];
    if (spec.type === 'list' && spec.id !== payload.id && spec.id !== S.INBOX) {
      const target = db.lists[spec.id];
      const sorted = all('lists').filter((x) => x.id !== S.INBOX && x.id !== l.id).sort((a, b) => a.order - b.order);
      const i = sorted.findIndex((x) => x.id === target.id);
      const ins = info.pos === 'bottom' ? i + 1 : i;
      sorted.splice(ins, 0, l);
      S.batch((b) => sorted.forEach((x, k) => b.patch('lists', x.id, { order: k + 1, ...(x.id === l.id ? { folderId: target.folderId || null } : {}) })));
    } else if (spec.type === 'folder') S.patch('lists', l.id, { folderId: spec.id });
  }
}
let currentOpts = null;
function OptsTracker() { const ui = useUI(); currentOpts = useViewOpts(ui.view); return null; }

// ---------- theme ----------
function useTheme(p) {
  const dark = useSyncExternalStore((cb) => { const m = window.matchMedia('(prefers-color-scheme: dark)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); }, () => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const theme = p.theme === 'system' ? (dark ? 'dark' : 'light') : p.theme;
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.style.setProperty('--accent', ACCENTS[p.accent] || ACCENTS.blue);
    el.style.setProperty('--font-scale', p.fontScale || 1);
    el.classList.toggle('compact', !!p.compact);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#1b1b1d' : '#ffffff');
    setDatePrefs({ h24: p.h24, weekStart: p.weekStart, dateOrder: p.dateOrder });
    setAllDayHint(p.allDayReminder);
  }, [p.theme, p.accent, p.fontScale, p.compact, p.h24, p.weekStart, p.dateOrder, p.allDayReminder, dark]);
}

function SyncDot() {
  const st = useSyncExternalStore(Sync.subscribeSync, Sync.getSyncState);
  if (st.mode === 'off') return <button className="rail-btn" title="Sync is off — set up in Settings" onClick={() => goSection('settings')}><Icon name="cloudOff" size={20} /></button>;
  return (
    <button className={'rail-btn sync-' + st.status} title={st.status === 'perm' ? 'Click to reconnect the sync folder' : st.error || 'Sync now'} onClick={() => Sync.syncNow({ interactive: true })}>
      <Icon name="sync" size={20} className={st.status === 'syncing' ? 'spin' : ''} />
      {(st.status === 'error' || st.status === 'perm') && <span className="rail-badge" />}
    </button>
  );
}
function FocusBadge() {
  const f = useFocus();
  const [, setT] = useState(0);
  useEffect(() => { if (!f.running) return; const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, [f.running]);
  if (f.phase === 'idle' && !f.running) return null;
  return <span className="focus-badge">{fmtClock(remainingSecs())}</span>;
}

function Rail({ section }) {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-logo" title="Taskday"><Icon name="check" size={18} strokeWidth={3} /></div>
      {SECTIONS.map(([k, icon, label]) => (
        <button key={k} className={'rail-btn' + (section === k ? ' active' : '')} title={label} onClick={() => goSection(k)} aria-label={label}>
          <Icon name={icon} size={21} />{k === 'focus' && <FocusBadge />}
        </button>
      ))}
      <span className="spacer" />
      <SyncDot />
      <button className={'rail-btn' + (section === 'settings' ? ' active' : '')} title="Settings" onClick={() => goSection('settings')} aria-label="Settings"><Icon name="settings" size={21} /></button>
    </nav>
  );
}

function BottomNav({ section }) {
  const [more, setMore] = useState(null);
  const main = [['tasks', 'checkSquare', 'Tasks'], ['calendar', 'calendar', 'Calendar'], ['habits', 'habit', 'Habit'], ['focus', 'pomo', 'Focus']];
  const extra = [['countdown', 'countdown', 'Countdown'], ['stats', 'stats', 'Statistics'], ['search', 'search', 'Search'], ['settings', 'settings', 'Settings']];
  const inMore = extra.some(([k]) => k === section);
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {main.map(([k, icon, label]) => (
        <button key={k} className={section === k ? 'active' : ''} onClick={() => goSection(k)}><Icon name={icon} size={22} /><span>{label}</span>{k === 'focus' && <FocusBadge />}</button>
      ))}
      <button className={inMore ? 'active' : ''} onClick={(e) => setMore(e.currentTarget)}><Icon name="more" size={22} /><span>More</span></button>
      {more && (
        <Popover anchor={more} onClose={() => setMore(null)}>
          <div className="more-grid">
            {extra.map(([k, icon, label]) => <button key={k} className={section === k ? 'active' : ''} onClick={() => { setMore(null); goSection(k); }}><Icon name={icon} size={24} /><span>{label}</span></button>)}
          </div>
        </Popover>
      )}
    </nav>
  );
}

export default function App() {
  const db = useDB();
  const prefs = usePrefs();
  const ui = useUI();
  const mobile = useIsMobile();
  useTheme(prefs);

  useEffect(() => { setDropHandler(handleDrop); }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const inField = e.target.closest('input, textarea, select, [contenteditable]');
      const u = getUI();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); goSection('search'); return; }
      if (e.altKey && /^[1-7]$/.test(e.key)) { e.preventDefault(); goSection(SECTIONS[Number(e.key) - 1][0]); return; }
      if (inField) return;
      if (document.querySelector('.modal-backdrop, .popover, .sheet-backdrop')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const l = S.undo(); if (l) toast('Undone: ' + l); return; }
      if (e.key === 'Escape') { if (u.selectMode) clearSelection(); else if (u.taskId) closeTask(); return; }
      if (e.key === '/') { e.preventDefault(); goSection('search'); return; }
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (u.section !== 'tasks') goSection('tasks');
        setTimeout(() => document.querySelector('.qa-wrap .qa-input')?.focus(), 30);
        return;
      }
      if (u.taskId) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doTrash([u.taskId]); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doToggle(u.taskId); }
        if (e.key === 'Tab') {
          e.preventDefault();
          const t = getDB().tasks[u.taskId];
          if (e.shiftKey) S.outdentTask(u.taskId);
          else if (t) {
            const sibs = all('tasks').filter((x) => x.listId === t.listId && (x.parentId || null) === (t.parentId || null) && !x.trashed && x.status === 0).sort((a, b) => a.order - b.order);
            const prev = sibs[sibs.findIndex((x) => x.id === t.id) - 1];
            if (prev) S.indentTask(t.id, prev.id);
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Android back button
  useEffect(() => {
    if (!isNative()) return;
    onBackButton(() => {
      if (document.querySelector('.modal-backdrop, .popover, .sheet-backdrop')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      const u = getUI();
      if (u.quickAdd) setUI({ quickAdd: null });
      else if (u.taskId) closeTask();
      else if (u.habitId) setUI({ habitId: null });
      else if (u.drawer) setUI({ drawer: false });
      else if (u.selectMode) clearSelection();
      else if (u.section !== 'tasks') goSection('tasks');
      else exitApp();
    });
  }, []);

  const openDrawer = () => setUI({ drawer: true });
  const task = ui.taskId && db.tasks[ui.taskId] && !db.tasks[ui.taskId]._del ? ui.taskId : null;
  useEffect(() => { if (ui.taskId && !task) closeTask(); }, [ui.taskId, task]);

  let main;
  switch (ui.section) {
    case 'calendar': main = <CalendarView onOpenDrawer={openDrawer} />; break;
    case 'habits': main = <HabitsView onOpenDrawer={openDrawer} />; break;
    case 'focus': main = <FocusView onOpenDrawer={openDrawer} />; break;
    case 'countdown': main = <CountdownView onOpenDrawer={openDrawer} />; break;
    case 'stats': main = <StatsView onOpenDrawer={openDrawer} />; break;
    case 'search': main = <SearchView onOpenDrawer={openDrawer} />; break;
    case 'settings': main = <SettingsView onOpenDrawer={openDrawer} />; break;
    default: main = <TaskPane onOpenDrawer={openDrawer} />;
  }
  const showDetail = task && ['tasks', 'calendar', 'search'].includes(ui.section);
  const showSidebar = ui.section === 'tasks' && !mobile;

  return (
    <div className={'app' + (mobile ? ' is-mobile' : '') + (showDetail ? ' has-detail' : '')}>
      <OptsTracker />
      {!mobile && <Rail section={ui.section} />}
      {showSidebar && <Sidebar />}
      <main className="main">{main}</main>
      {showDetail && (mobile ? <div className="mobile-overlay"><TaskDetail key={task} taskId={task} /></div> : <TaskDetail key={task} taskId={task} />)}
      {mobile && <BottomNav section={ui.section} />}
      {mobile && ui.section === 'tasks' && !showDetail && !ui.selectMode && splitView(ui.view)[1] !== 'trash' && (
        <button className="fab" onClick={() => setUI({ quickAdd: viewDefaults(ui.view) })} aria-label="Add task"><Icon name="plus" size={26} strokeWidth={2.4} /></button>
      )}
      {mobile && ui.drawer && (
        <div className="drawer-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setUI({ drawer: false }); }}>
          <div className="drawer">
            <div className="drawer-head"><div className="rail-logo"><Icon name="check" size={16} strokeWidth={3} /></div><strong>Taskday</strong><span className="spacer" /><SyncDot /></div>
            <Sidebar />
          </div>
        </div>
      )}
      {mobile && ui.quickAdd && (
        <div className="sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) setUI({ quickAdd: null }); }}>
          <div className="sheet qa-sheet"><QuickAdd autoFocus defaults={ui.quickAdd} onCreated={() => setUI({ quickAdd: null })} /></div>
        </div>
      )}
      <MenuHost />
      <DialogHost />
      <ToastHost />
    </div>
  );
}
export { startOfDay, setTime, openTask };
