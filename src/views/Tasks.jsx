import { useMemo, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, usePrefs, getDB, all, setViewOpts } from '../store.js';
import { tasksForView, viewTitle, splitView, defaultViewOpts, sortTasks, groupTasks, buildTree, SMART } from '../lib/query.js';
import { today, addDays, startOfDay, startOfWeek, fmtFullDate, fmtMonthDay, WD_MIN, MONTHS_SHORT, getDatePrefs, ymd, fmtTaskDate, DAY, diffDays } from '../lib/date.js';
import { TaskRow } from '../ui/TaskRow.jsx';
import { QuickAdd } from '../ui/QuickAdd.jsx';
import { openMenu, Empty, confirmDialog, promptDialog, toast, useIsMobile } from '../ui/common.jsx';
import { useUI, setUI, toggleCollapsed, clearSelection, openTask } from '../ui/state.js';
import { dateMenuItems, priorityMenuItems, moveMenuItems, tagMenuItems, doTrash, doToggle } from '../ui/actions.js';
import { dropAttr, dragHandlers } from '../lib/dnd.js';
import { ListDialog } from './Dialogs.jsx';

export function viewDefaults(view) {
  const [kind, id] = splitView(view);
  const td = today();
  const d = {};
  if (kind === 'list') d.listId = id;
  if (kind === 'tag') d.tags = [id];
  if (kind === 'smart') {
    if (id === 'today' || id === 'next7') d.dueAt = td;
    if (id === 'tomorrow') d.dueAt = addDays(td, 1);
    if (id === 'inbox') d.listId = S.INBOX;
  }
  if (kind === 'filter') {
    const f = getDB().filters[id];
    if (f?.rules?.lists?.length === 1) d.listId = f.rules.lists[0];
    const tg = f?.rules?.tags?.filter((x) => x !== '__none__');
    if (tg?.length === 1) d.tags = [tg[0]];
    if (f?.rules?.dates?.includes('today')) d.dueAt = td;
  }
  if (d.dueAt) d.allDay = true;
  return d;
}

export function useViewOpts(view) {
  const prefs = usePrefs();
  const [kind, id] = splitView(view);
  const base = defaultViewOpts(view);
  if (kind === 'list') {
    const l = getDB().lists[id];
    return { ...base, groupBy: l?.groupBy || base.groupBy, sortBy: l?.sortBy || base.sortBy, layout: l?.view || 'list', hideCompleted: !!l?.hideCompleted, hideDetails: !prefs.showDetails };
  }
  const o = prefs.viewOpts[view] || {};
  return { ...base, ...o, layout: o.layout || 'list', hideCompleted: o.hideCompleted ?? !prefs.showCompleted, hideDetails: !prefs.showDetails };
}
function setOpts(view, changes) {
  const [kind, id] = splitView(view);
  if (kind === 'list') {
    const map = { layout: 'view' };
    const c = {}; for (const k in changes) c[map[k] || k] = changes[k];
    S.patch('lists', id, c);
  } else setViewOpts(view, changes);
}

export function TaskPane({ onOpenDrawer }) {
  const db = useDB();
  const ui = useUI();
  const view = ui.view;
  const [kind, id] = splitView(view);
  const opts = useViewOpts(view);
  const mobile = useIsMobile();
  const [listDialog, setListDialog] = useState(null);
  const title = viewTitle(view);
  const list = kind === 'list' ? db.lists[id] : null;
  const isTrash = view === 'smart:trash';
  const isSummary = view === 'smart:summary';
  const isDoneView = view === 'smart:completed' || view === 'smart:wontdo';
  const canKanban = !isTrash && !isSummary && !isDoneView;
  const { open, done } = useMemo(() => (isSummary ? { open: [], done: [] } : tasksForView(view)), [db, view, isSummary]);
  const layout = canKanban ? opts.layout : 'list';

  const moreMenu = (e) => {
    const groupOpts = kind === 'list' ? ['section', 'date', 'priority', 'tag', 'none'] : ['date', 'list', 'priority', 'tag', 'none'];
    const sortOpts = ['date', 'priority', 'title', 'manual', 'created'];
    const names = { section: 'Section', date: 'Date', priority: 'Priority', tag: 'Tag', none: 'None', list: 'List', title: 'Title', manual: 'Custom (drag)', created: 'Created time' };
    openMenu(e.currentTarget, [
      canKanban && { header: 'Layout' },
      canKanban && { label: 'List', icon: 'list', checked: layout === 'list', onClick: () => setOpts(view, { layout: 'list' }) },
      canKanban && { label: 'Kanban', icon: 'kanban', checked: layout === 'kanban', onClick: () => setOpts(view, { layout: 'kanban' }) },
      canKanban && { label: 'Timeline', icon: 'timeline', checked: layout === 'timeline', onClick: () => setOpts(view, { layout: 'timeline' }) },
      !isDoneView && !isTrash && { label: 'Group by', icon: 'all', hint: names[opts.groupBy], submenu: groupOpts.map((g) => ({ label: names[g], checked: opts.groupBy === g, onClick: () => setOpts(view, { groupBy: g }) })) },
      !isDoneView && !isTrash && { label: 'Sort by', icon: 'sort', hint: names[opts.sortBy], submenu: sortOpts.map((g) => ({ label: names[g], checked: opts.sortBy === g, onClick: () => setOpts(view, { sortBy: g }) })) },
      '-',
      !isDoneView && !isTrash && { label: opts.hideCompleted ? 'Show completed' : 'Hide completed', icon: opts.hideCompleted ? 'eye' : 'eyeOff', onClick: () => setOpts(view, { hideCompleted: !opts.hideCompleted }) },
      { label: S.getPrefs().showDetails ? 'Hide details' : 'Show details', icon: 'note', onClick: () => S.setPrefs({ showDetails: !S.getPrefs().showDetails }) },
      !isTrash && { label: 'Select tasks', icon: 'select', onClick: () => setUI({ selectMode: true, selected: [] }) },
      kind === 'list' && '-',
      kind === 'list' && { label: 'Add section', icon: 'plus', onClick: () => addSection(id) },
      kind === 'list' && { label: 'Edit list', icon: 'edit', onClick: () => setListDialog(list) },
      isTrash && { label: 'Empty trash', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('All tasks in Trash will be permanently deleted.', { title: 'Empty Trash?', ok: 'Empty', danger: true })) S.emptyTrash(); } },
      view === 'smart:completed' && { label: 'Clear completed (to Trash)', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('Move all completed tasks to Trash?', { ok: 'Move', danger: true })) S.trashTasks(open.map((t) => t.id)); } },
    ].filter(Boolean), { width: 230, align: 'end' });
  };

  const icon = kind === 'smart' ? SMART[id]?.icon : kind === 'tag' ? 'tag' : kind === 'filter' ? 'filter' : 'list';
  return (
    <div className="pane task-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Lists"><Icon name="menu" /></button>}
        <h1 className="pane-title">
          {list?.emoji ? <span className="title-emoji">{list.emoji}</span> : !mobile && <Icon name={icon} size={20} className="title-icon" />}
          <span>{title}</span>
          {!isSummary && <span className="pane-count">{open.length || ''}</span>}
        </h1>
        <div className="pane-actions">
          {canKanban && !mobile && (
            <div className="layout-switch">
              {[['list', 'list'], ['kanban', 'kanban'], ['timeline', 'timeline']].map(([v, ic]) => (
                <button key={v} className={'icon-btn sm' + (layout === v ? ' active' : '')} title={v[0].toUpperCase() + v.slice(1)} onClick={() => setOpts(view, { layout: v })}><Icon name={ic} size={16} /></button>
              ))}
            </div>
          )}
          <button className="icon-btn" onClick={moreMenu} aria-label="View options"><Icon name="more" /></button>
        </div>
      </div>
      {ui.selectMode && <BatchBar ids={ui.selected} all={open.map((t) => t.id)} />}
      {isSummary ? <SummaryView /> : isTrash ? <TrashView tasks={open} /> : (
        <>
          {!isDoneView && layout !== 'kanban' && <div className="qa-wrap"><QuickAdd defaults={viewDefaults(view)} /></div>}
          {layout === 'kanban' ? <Kanban view={view} open={open} done={done} opts={opts} /> :
            layout === 'timeline' ? <Timeline view={view} open={open} opts={opts} /> :
              <ListLayout view={view} open={open} done={done} opts={opts} isDoneView={isDoneView} />}
        </>
      )}
      {listDialog && <ListDialog list={listDialog} onClose={() => setListDialog(null)} />}
    </div>
  );
}

export async function addSection(listId) {
  const name = await promptDialog('New section', '', { placeholder: 'Section name', ok: 'Add' });
  if (!name?.trim()) return;
  const order = Math.max(0, ...all('sections').filter((s) => s.listId === listId).map((s) => s.order + 1));
  S.put('sections', { id: S.uid(), listId, name: name.trim(), order });
}
function sectionMenu(e, g, listId) {
  openMenu(e.currentTarget, [
    { label: 'Rename', icon: 'edit', onClick: async () => { const n = await promptDialog('Rename section', g.title); if (n?.trim()) S.patch('sections', g.sectionId, { name: n.trim() }); } },
    { label: 'Move left/up', icon: 'chevronUp', onClick: () => moveSection(listId, g.sectionId, -1) },
    { label: 'Move right/down', icon: 'chevronDown', onClick: () => moveSection(listId, g.sectionId, 1) },
    { label: 'Delete section', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('Tasks in this section will stay in the list.', { title: `Delete "${g.title}"?`, ok: 'Delete', danger: true })) S.batch((b) => { for (const t of all('tasks')) if (t.sectionId === g.sectionId) b.patch('tasks', t.id, { sectionId: null }); b.remove('sections', g.sectionId); }); } },
  ]);
}
function moveSection(listId, secId, dir) {
  const secs = all('sections').filter((s) => s.listId === listId).sort((a, b) => a.order - b.order);
  const i = secs.findIndex((s) => s.id === secId); const j = i + dir;
  if (j < 0 || j >= secs.length) return;
  [secs[i], secs[j]] = [secs[j], secs[i]];
  S.batch((b) => secs.forEach((s, k) => b.patch('sections', s.id, { order: k })));
}

// Groups → list of rows with subtask tree.
function ListLayout({ view, open, done, opts, isDoneView }) {
  const ui = useUI();
  const db = getDB();
  const [kind, id] = splitView(view);
  const showList = kind !== 'list';
  const sorted = sortTasks(open, opts.sortBy);
  const groups = isDoneView ? groupTasks(sorted, 'completed') : groupTasks(sorted, opts.groupBy, { listId: id });
  const allKids = useMemo(() => {
    const m = new Map();
    for (const t of all('tasks')) if (t.parentId && !t.trashed) { if (!m.has(t.parentId)) m.set(t.parentId, { total: 0, done: 0 }); const s = m.get(t.parentId); s.total++; if (t.status !== 0) s.done++; }
    return m;
  }, [db]);
  if (!open.length && !done.length) {
    const msg = { 'smart:today': 'Nothing due today. Enjoy your day!', 'smart:completed': 'No completed tasks yet', 'smart:wontdo': "No Won't Do tasks" }[view];
    return <div className="task-scroll"><Empty icon={view === 'smart:today' ? 'sun' : 'checkCircle'} title={msg || 'No tasks'} text={isDoneView ? '' : 'Add a task above. Try "Read 20 pages tomorrow 9pm #study"'} /></div>;
  }
  const renderTree = (tasks, depth, parentKey) => {
    const { roots, kids } = buildTree(tasks);
    const out = [];
    const walk = (list, d) => {
      list.forEach((t, i) => {
        const ch = sortTasks(kids.get(t.id) || [], opts.sortBy === 'manual' ? 'manual' : opts.sortBy);
        const collapsed = t.collapsed;
        out.push(<TaskRow key={t.id} task={t} depth={d} hasKids={ch.length > 0} kidsCollapsed={collapsed} onToggleKids={() => S.updateTask(t.id, { collapsed: !collapsed })}
          showList={showList && !opts.hideDetails} selected={ui.selected.includes(t.id)} active={ui.taskId === t.id} prevSiblingId={i > 0 ? list[i - 1].id : null}
          kidStats={allKids.get(t.id)} ver={db.lists} />);
        if (ch.length && !collapsed) walk(ch, d + 1);
      });
    };
    walk(roots, depth);
    return out;
  };
  return (
    <div className={'task-scroll' + (opts.hideDetails ? ' hide-details' : '')}>
      {groups.map((g) => {
        const ckey = view + ':' + g.key;
        const collapsed = ui.collapsed[ckey];
        const spec = groupDropSpec(view, opts.groupBy, g);
        return (
          <div key={g.key} className="group">
            {g.title && (
              <div className="group-head" {...(spec ? dropAttr(spec) : {})} onClick={() => toggleCollapsed(ckey)}>
                <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} />
                <span className="group-title">{g.title}</span>
                <span className="group-count">{g.tasks.length}</span>
                {g.sectionId && <button className="icon-btn sm group-menu" onClick={(e) => { e.stopPropagation(); sectionMenu(e, g, id); }}><Icon name="more" size={16} /></button>}
              </div>
            )}
            {!collapsed && renderTree(g.tasks, 0, g.key)}
            {!collapsed && g.sectionId && <SectionAdd listId={id} sectionId={g.sectionId} />}
          </div>
        );
      })}
      {!opts.hideCompleted && done.length > 0 && (
        <div className="group done-group">
          <div className="group-head" onClick={() => toggleCollapsed(view + ':__done')}>
            <Icon name={ui.collapsed[view + ':__done'] === false ? 'chevronDown' : 'chevronRight'} size={14} />
            <span className="group-title">Completed</span><span className="group-count">{done.length}</span>
          </div>
          {ui.collapsed[view + ':__done'] === false && done.slice(0, 200).map((t) => <TaskRow key={t.id} task={t} showList={showList} selected={ui.selected.includes(t.id)} active={ui.taskId === t.id} />)}
        </div>
      )}
      <div className="list-end-pad" />
    </div>
  );
}
function SectionAdd({ listId, sectionId }) {
  const [on, setOn] = useState(false);
  if (!on) return <button className="section-add" onClick={() => setOn(true)}><Icon name="plus" size={14} /> Add task</button>;
  return <div className="section-qa"><QuickAdd compact autoFocus defaults={{ listId, sectionId }} placeholder="Task name" onCancel={() => setOn(false)} /></div>;
}

export function groupDropSpec(view, groupBy, g) {
  const [kind, id] = splitView(view);
  if (groupBy === 'section' && kind === 'list') return { type: 'group', set: { listId: id, sectionId: g.sectionId || null } };
  if (groupBy === 'priority') return { type: 'group', set: { priority: g.priority } };
  if (groupBy === 'list') return { type: 'group', set: { listId: g.listId, sectionId: null } };
  if (groupBy === 'date' && g.key !== 'overdue') return { type: 'group', day: g.key === 'nodate' ? null : g.date ?? null, dayKey: g.key };
  if (groupBy === 'tag') return { type: 'group', tag: g.key === '__none' ? null : g.key.replace(/^#/, '') };
  return null;
}

// ---------- Kanban ----------
function Kanban({ view, open, done, opts }) {
  const ui = useUI();
  const [kind, id] = splitView(view);
  const gb = opts.groupBy === 'none' ? (kind === 'list' ? 'section' : 'date') : opts.groupBy;
  const groups = groupTasks(sortTasks(open.filter((t) => !t.parentId || !open.some((p) => p.id === t.parentId)), opts.sortBy), gb, { listId: id, keepEmpty: true });
  return (
    <div className="kanban">
      {groups.map((g) => {
        const spec = groupDropSpec(view, gb, g);
        const defaults = { ...viewDefaults(view), ...(spec?.set || {}), ...(spec?.day !== undefined && gb === 'date' ? { dueAt: spec.day } : {}), ...(spec?.tag ? { tags: [spec.tag] } : {}) };
        return (
          <div key={g.key} className="kanban-col" {...(spec ? dropAttr(spec) : {})}>
            <div className="kanban-head">
              <span className="group-title">{g.title || 'Tasks'}</span><span className="group-count">{g.tasks.length}</span>
              {g.sectionId && <button className="icon-btn sm" onClick={(e) => sectionMenu(e, g, id)}><Icon name="more" size={16} /></button>}
            </div>
            <div className="kanban-add"><QuickAdd compact defaults={defaults} placeholder="Add task" /></div>
            <div className="kanban-cards">
              {g.tasks.map((t) => <TaskRow key={t.id} task={t} variant="card" showList={kind !== 'list'} selected={ui.selected.includes(t.id)} active={ui.taskId === t.id}
                dropSpec={opts.sortBy === 'manual' && kind === 'list' ? { type: 'task', id: t.id } : spec || { type: 'task', id: t.id }} />)}
            </div>
          </div>
        );
      })}
      {kind === 'list' && <button className="kanban-newcol" onClick={() => addSection(id)}><Icon name="plus" size={16} /> Add section</button>}
      {!opts.hideCompleted && done.length > 0 && (
        <div className="kanban-col done-col">
          <div className="kanban-head"><span className="group-title">Completed</span><span className="group-count">{done.length}</span></div>
          <div className="kanban-cards">{done.slice(0, 50).map((t) => <TaskRow key={t.id} task={t} variant="card" />)}</div>
        </div>
      )}
    </div>
  );
}

// ---------- Timeline ----------
const DAYW = 40;
function Timeline({ view, open }) {
  const ui = useUI();
  const ws = getDatePrefs().weekStart;
  const [start, setStart] = useState(() => addDays(startOfWeek(today(), ws), -7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const end = days[days.length - 1];
  const dated = sortTasks(open.filter((t) => t.dueAt), 'date');
  const undated = open.filter((t) => !t.dueAt);
  const td = today();
  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button className="icon-btn sm" onClick={() => setStart(addDays(start, -14))}><Icon name="chevronLeft" size={16} /></button>
        <button className="btn sm" onClick={() => setStart(addDays(startOfWeek(today(), ws), -7))}>Today</button>
        <button className="icon-btn sm" onClick={() => setStart(addDays(start, 14))}><Icon name="chevronRight" size={16} /></button>
        <span className="muted small">{fmtMonthDay(start)} – {fmtMonthDay(end)} · drag bars to reschedule, drag unscheduled tasks onto a day</span>
      </div>
      <div className="tl-body">
        <div className="tl-names">
          <div className="tl-corner" />
          {dated.map((t) => <div key={t.id} className={'tl-name' + (ui.taskId === t.id ? ' active' : '')} onClick={() => openTask(t.id)}>{t.title || 'Untitled'}</div>)}
          {undated.length > 0 && <div className="tl-name tl-sep">Unscheduled ({undated.length})</div>}
          {undated.map((t) => <div key={t.id} className="tl-name undated" {...dragHandlers({ type: 'task', id: t.id }, t.title)} onClick={() => openTask(t.id)}>{t.title || 'Untitled'}</div>)}
        </div>
        <div className="tl-grid-wrap">
          <div className="tl-grid" style={{ width: days.length * DAYW }}>
            <div className="tl-days">
              {days.map((d) => {
                const dt = new Date(d);
                return <div key={d} className={'tl-day' + (d === td ? ' today' : '') + ([0, 6].includes(dt.getDay()) ? ' wkend' : '')} style={{ width: DAYW }} {...dropAttr({ type: 'day', day: d })}>
                  {dt.getDate() === 1 || d === start ? <span className="tl-month">{MONTHS_SHORT[dt.getMonth()]}</span> : null}
                  <span className="tl-wd">{WD_MIN[dt.getDay()]}</span><span className="tl-dn">{dt.getDate()}</span>
                </div>;
              })}
            </div>
            {dated.map((t) => {
              const s = startOfDay(t.startAt || t.dueAt), e = startOfDay(t.dueAt);
              const left = diffDays(s, start) * DAYW, width = (diffDays(e, s) + 1) * DAYW - 6;
              const visible = e >= start && s <= end;
              return (
                <div key={t.id} className="tl-row">
                  {days.map((d) => <div key={d} className={'tl-cell' + (d === td ? ' today' : '') + ([0, 6].includes(new Date(d).getDay()) ? ' wkend' : '')} style={{ width: DAYW }} {...dropAttr({ type: 'day', day: d })} />)}
                  {visible && (
                    <div className={`tl-bar p${t.priority || 0}` + (ui.taskId === t.id ? ' active' : '')} style={{ left: left + 3, width: Math.max(width, 30) }}
                      {...dragHandlers({ type: 'task', id: t.id }, t.title)} onClick={() => openTask(t.id)} title={`${t.title} · ${fmtTaskDate(t)}`}>
                      <span>{t.title}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {undated.length > 0 && <div className="tl-row tl-sep" />}
            {undated.map((t) => <div key={t.id} className="tl-row">{days.map((d) => <div key={d} className="tl-cell" style={{ width: DAYW }} {...dropAttr({ type: 'day', day: d })} />)}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Batch edit ----------
function BatchBar({ ids, all: allIds }) {
  const n = ids.length;
  const act = (fn) => (e) => { if (!n) { toast('Select tasks first'); return; } fn(e); };
  return (
    <div className="batch-bar">
      <button className="btn sm" onClick={clearSelection}><Icon name="x" size={14} /> {n} selected</button>
      <button className="btn sm" onClick={() => setUI({ selected: ids.length === allIds.length ? [] : allIds })}>{ids.length === allIds.length ? 'None' : 'All'}</button>
      <span className="spacer" />
      <button className="icon-btn" title="Complete" onClick={act(() => { ids.forEach((id) => getDB().tasks[id]?.status === 0 && S.completeTask(id)); clearSelection(); toast(`${n} completed`, { action: 'Undo', onAction: () => { for (let i = 0; i < n; i++) S.undo(); } }); })}><Icon name="checkCircle" /></button>
      <button className="icon-btn" title="Date" onClick={act((e) => openMenu(e.currentTarget, dateMenuItems(ids)))}><Icon name="calendar" /></button>
      <button className="icon-btn" title="Priority" onClick={act((e) => openMenu(e.currentTarget, priorityMenuItems(ids)))}><Icon name="flag" /></button>
      <button className="icon-btn" title="Move" onClick={act((e) => openMenu(e.currentTarget, moveMenuItems(ids)))}><Icon name="arrowRight" /></button>
      <button className="icon-btn" title="Tags" onClick={act((e) => openMenu(e.currentTarget, tagMenuItems(ids)))}><Icon name="tag" /></button>
      <button className="icon-btn danger" title="Delete" onClick={act(() => { doTrash(ids); clearSelection(); })}><Icon name="trash" /></button>
    </div>
  );
}

// ---------- Trash ----------
function TrashView({ tasks }) {
  const ui = useUI();
  if (!tasks.length) return <div className="task-scroll"><Empty icon="trash" title="Trash is empty" /></div>;
  return (
    <div className="task-scroll">
      <div className="hint-bar">Tasks in Trash can be restored or deleted forever.</div>
      {tasks.map((t) => <TaskRow key={t.id} task={t} showList active={ui.taskId === t.id} />)}
    </div>
  );
}

// ---------- Summary ----------
function SummaryView() {
  useDB();
  const [range, setRange] = useState('week');
  const [incOpen, setIncOpen] = useState(false);
  const td = today();
  const ws = getDatePrefs().weekStart;
  const ranges = {
    today: [td, td], yesterday: [addDays(td, -1), addDays(td, -1)],
    week: [startOfWeek(td, ws), td], lastweek: [addDays(startOfWeek(td, ws), -7), addDays(startOfWeek(td, ws), -1)],
    month: [new Date(new Date(td).getFullYear(), new Date(td).getMonth(), 1).getTime(), td],
    last30: [addDays(td, -29), td],
  };
  const [from, to] = ranges[range];
  const done = all('tasks').filter((t) => t.status === 2 && !t.trashed && t.completedAt && startOfDay(t.completedAt) >= from && startOfDay(t.completedAt) <= to);
  const pending = incOpen ? all('tasks').filter((t) => t.status === 0 && !t.trashed && t.dueAt && startOfDay(t.dueAt) >= from && startOfDay(t.dueAt) <= to) : [];
  const byDay = new Map();
  for (const t of done.sort((a, b) => a.completedAt - b.completedAt)) { const k = startOfDay(t.completedAt); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(t); }
  const db = getDB();
  const text = () => {
    let s = `Summary ${fmtMonthDay(from)} – ${fmtMonthDay(to)}\n\n`;
    for (const [d, ts] of byDay) { s += `${fmtFullDate(d)}\n`; for (const t of ts) s += `  ✓ ${t.title}${db.lists[t.listId] ? ` (${db.lists[t.listId].name})` : ''}\n`; s += '\n'; }
    if (pending.length) { s += 'Not done\n'; for (const t of pending) s += `  ○ ${t.title}\n`; }
    return s;
  };
  return (
    <div className="task-scroll summary">
      <div className="summary-bar">
        <select className="input" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This week</option>
          <option value="lastweek">Last week</option><option value="month">This month</option><option value="last30">Last 30 days</option>
        </select>
        <label className="check-row"><input type="checkbox" checked={incOpen} onChange={(e) => setIncOpen(e.target.checked)} /> Include unfinished</label>
        <span className="spacer" />
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(text()).then(() => toast('Summary copied')); }}><Icon name="copy" size={14} /> Copy</button>
      </div>
      <div className="summary-stat">{done.length} task{done.length === 1 ? '' : 's'} completed</div>
      {[...byDay].map(([d, ts]) => (
        <div key={d} className="summary-day">
          <div className="group-head static"><span className="group-title">{fmtFullDate(d)}</span><span className="group-count">{ts.length}</span></div>
          {ts.map((t) => <TaskRow key={t.id} task={t} showList />)}
        </div>
      ))}
      {pending.length > 0 && <div className="summary-day"><div className="group-head static"><span className="group-title">Not done</span></div>{pending.map((t) => <TaskRow key={t.id} task={t} showList />)}</div>}
      {!done.length && !pending.length && <Empty icon="summary" title="Nothing completed in this period" />}
    </div>
  );
}
export { doToggle, ymd, DAY };
