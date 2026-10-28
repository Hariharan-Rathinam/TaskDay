import { memo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { getDB, all } from '../store.js';
import { fmtTaskDate } from '../lib/date.js';
import { isOverdue, PRIORITY } from '../lib/query.js';
import { dragHandlers, dropAttr } from '../lib/dnd.js';
import { doToggle, taskMenu, dateMenuItems } from './actions.js';
import { openMenu } from './common.jsx';
import { openTask, toggleSelect, getUI } from './state.js';
import { isMobileNow } from './common.jsx';
import { today, startOfDay } from '../lib/date.js';

export function Check({ task, onClick, size = 18 }) {
  const p = task.priority || 0;
  const done = task.status === 2, wont = task.status === -1;
  return (
    <button className={`check p${p}` + (done ? ' done' : '') + (wont ? ' wont' : '')} style={{ width: size, height: size }} onClick={(e) => { e.stopPropagation(); onClick ? onClick() : doToggle(task.id); }}
      role="checkbox" aria-checked={done} aria-label={done ? 'Mark as not done' : 'Complete task'}>
      {done && <Icon name="check" size={size - 6} strokeWidth={3} />}
      {wont && <Icon name="x" size={size - 6} strokeWidth={3} />}
    </button>
  );
}

export function dateClass(task) {
  if (!task.dueAt) return '';
  if (task.status === 0 && isOverdue(task)) return 'overdue';
  if (startOfDay(task.startAt || task.dueAt) === today()) return 'is-today';
  return '';
}

function TaskRowInner({ task, depth = 0, hasKids, kidsCollapsed, onToggleKids, showList, selected, active, prevSiblingId, kidStats, variant = 'row', dropSpec, ver }) {
  const db = getDB();
  const list = showList ? db.lists[task.listId] : null;
  const done = task.status !== 0;
  const checklist = task.checklist || [];
  const cDone = checklist.filter((c) => c.done).length;
  const tagColors = Object.fromEntries(all('tags').map((t) => [t.name, t.color]));
  const onClick = () => {
    const ui = getUI();
    if (ui.selectMode) toggleSelect(task.id); else openTask(task.id);
  };
  const menu = (x, y) => taskMenu(task, { x, y }, { prevSibling: prevSiblingId });
  // touch swipe: right = complete, left = date menu
  const sw = useRef(null);
  const [dx, setDx] = useState(0);
  const drag = dragHandlers({ type: 'task', id: task.id }, task.title || 'Untitled', { onLongPress: (x, y) => menu(x, y) });
  const swipeable = variant === 'row' && !task.trashed;
  const onPointerDown = (e) => {
    drag.onPointerDown(e);
    if (swipeable && e.pointerType !== 'mouse') sw.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const onPointerMove = (e) => {
    const s0 = sw.current; if (!s0) return;
    const mx = e.clientX - s0.x, my = e.clientY - s0.y;
    if (!s0.active) { if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) s0.active = true; else if (Math.abs(my) > 12) { sw.current = null; return; } }
    if (s0.active) setDx(Math.max(-140, Math.min(140, mx)));
  };
  const onPointerEnd = (e) => {
    const s0 = sw.current; sw.current = null;
    if (!s0?.active) { setDx(0); return; }
    const d = e.clientX - s0.x;
    setDx(0);
    if (d > 90 && task.status === 0) doToggle(task.id);
    else if (d < -90) openMenu({ x: e.clientX, y: e.clientY }, [...dateMenuItems([task.id]), '-', { label: 'More…', icon: 'more', onClick: () => menu(e.clientX, e.clientY) }]);
  };
  return (
    <div
      className={`task-row ${variant}` + (done ? ' is-done' : '') + (selected ? ' selected' : '') + (active ? ' active' : '') + (task.pinned ? ' pinned' : '') + (dx ? ' swiping' : '')}
      style={{ '--depth': depth, ...(dx ? { transform: `translateX(${dx}px)`, background: dx > 0 ? 'color-mix(in srgb, var(--ok) ' + Math.min(30, Math.abs(dx) / 4) + '%, var(--bg))' : 'color-mix(in srgb, var(--accent) ' + Math.min(30, Math.abs(dx) / 4) + '%, var(--bg))' } : {}) }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={() => { sw.current = null; setDx(0); }}
      onClick={(e) => { if (e.shiftKey || e.metaKey || e.ctrlKey) { toggleSelect(task.id); return; } onClick(); }}
      onContextMenu={(e) => { e.preventDefault(); if (!isMobileNow()) menu(e.clientX, e.clientY); }}
      {...(dropSpec ? dropAttr(dropSpec, true) : dropAttr({ type: 'task', id: task.id }, true))}
      data-task-id={task.id}
    >
      <div className="task-row-lead">
        {hasKids ? (
          <button className="kid-toggle no-drag" onClick={(e) => { e.stopPropagation(); onToggleKids(); }} aria-label={kidsCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}>
            <Icon name={kidsCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
          </button>
        ) : <span className="kid-toggle-space" />}
        {getUI().selectMode ? (
          <span className={'sel-box' + (selected ? ' on' : '')}>{selected && <Icon name="check" size={12} strokeWidth={3} />}</span>
        ) : <Check task={task} />}
      </div>
      <div className="task-row-main">
        <div className="task-title">
          {task.pinned && <Icon name="pin" size={12} className="pin-ico" />}
          <span className="title-text">{task.title || <span className="muted">Untitled</span>}</span>
        </div>
        <div className="task-meta">
          {task.repeat && <Icon name="repeat" size={12} />}
          {task.reminders?.length > 0 && task.dueAt && <Icon name="bell" size={12} />}
          {task.content && <Icon name="note" size={12} />}
          {checklist.length > 0 && <span className="meta-chip"><Icon name="checklist" size={12} />{cDone}/{checklist.length}</span>}
          {kidStats && kidStats.total > 0 && <span className="meta-chip"><Icon name="subtask" size={12} />{kidStats.done}/{kidStats.total}</span>}
          {(task.tags || []).slice(0, 3).map((tg) => <span key={tg} className="tag-chip" style={tagColors[tg] ? { '--tag': tagColors[tg] } : undefined}>{tg}</span>)}
          {list && <span className="list-chip">{list.emoji || ''}{list.name}</span>}
          {task.dueAt && <span className={'date-chip ' + dateClass(task)}>{fmtTaskDate(task)}</span>}
        </div>
      </div>
    </div>
  );
}
export const TaskRow = memo(TaskRowInner);
export { PRIORITY };
