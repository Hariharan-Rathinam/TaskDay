import { useState, useMemo } from 'react';
import Icon from '../ui/Icon.jsx';
import { useDB, all, getDB } from '../store.js';
import { TaskRow } from '../ui/TaskRow.jsx';
import { useIsMobile, Empty } from '../ui/common.jsx';
import { goView } from '../ui/state.js';
import { isTaskVisible, sortTasks } from '../lib/query.js';

export function SearchView({ onOpenDrawer }) {
  const db = useDB();
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const [incDone, setIncDone] = useState(true);
  const res = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return null;
    const terms = k.split(/\s+/);
    const hit = (s) => terms.every((t) => s.includes(t));
    const tasks = all('tasks').filter((t) => isTaskVisible(t) && (incDone || t.status === 0) && hit(`${t.title} ${t.content || ''} ${(t.checklist || []).map((c) => c.title).join(' ')} ${(t.tags || []).map((x) => '#' + x).join(' ')}`.toLowerCase()));
    const lists = all('lists').filter((l) => l.name.toLowerCase().includes(k));
    const tags = all('tags').filter((t) => t.name.includes(k.replace(/^#/, '')));
    const habits = all('habits').filter((h) => h.name.toLowerCase().includes(k));
    return { tasks: sortTasks(tasks.filter((t) => t.status === 0), 'date').concat(tasks.filter((t) => t.status !== 0)), lists, tags, habits };
  }, [q, db, incDone]);
  return (
    <div className="pane search-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
        <div className="search-box">
          <Icon name="search" size={18} />
          <input className="search-input" autoFocus placeholder="Search tasks, lists, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn sm" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
      </div>
      <div className="task-scroll">
        {!res && <Empty icon="search" title="Search everything" text="Matches titles, descriptions, checklist items and #tags." />}
        {res && (
          <>
            <label className="check-row search-opt"><input type="checkbox" checked={incDone} onChange={(e) => setIncDone(e.target.checked)} /> Include completed</label>
            {(res.lists.length > 0 || res.tags.length > 0) && (
              <div className="chips search-chips">
                {res.lists.map((l) => <button key={l.id} className="chip" onClick={() => goView('list:' + l.id)}>{l.emoji || '📋'} {l.name}</button>)}
                {res.tags.map((t) => <button key={t.id} className="chip" onClick={() => goView('tag:' + t.name)}>#{t.name}</button>)}
              </div>
            )}
            <div className="group-head static"><span className="group-title">Tasks</span><span className="group-count">{res.tasks.length}</span></div>
            {res.tasks.slice(0, 300).map((t) => <TaskRow key={t.id} task={t} showList />)}
            {!res.tasks.length && <div className="muted pad">No matching tasks</div>}
          </>
        )}
      </div>
    </div>
  );
}
export { getDB };
