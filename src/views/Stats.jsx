import { useMemo, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { useDB, usePrefs, all, getDB, isLogDone, isHabitDueOn, getLog, INBOX } from '../store.js';
import { today, addDays, startOfDay, fmtMonthDay, WD_MIN, fmtDuration, ymd, startOfWeek } from '../lib/date.js';
import { Segmented, useIsMobile } from '../ui/common.jsx';
import { PRIORITY } from '../lib/query.js';

function Bars({ data, color = 'var(--accent)', fmt = (v) => v, height = 150 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${fmt(d.value)}`}>
          <div className="bar-val">{d.value ? fmt(d.value) : ''}</div>
          <div className="bar" style={{ height: `${(d.value / max) * 100}%`, background: d.color || color }} />
          <div className="bar-lbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
function HBars({ data, fmt = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d, i) => (
        <div key={i} className="hbar-row">
          <span className="hbar-lbl">{d.label}</span>
          <span className="hbar-track"><span className="hbar" style={{ width: `${(d.value / max) * 100}%`, background: d.color || 'var(--accent)' }} /></span>
          <span className="hbar-val">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsView({ onOpenDrawer }) {
  const db = useDB();
  const prefs = usePrefs();
  const mobile = useIsMobile();
  const [range, setRange] = useState(7);
  const td = today();
  const s = useMemo(() => {
    const tasks = all('tasks').filter((t) => !t.trashed);
    const done = tasks.filter((t) => t.status === 2 && t.completedAt);
    const from = addDays(td, -(range - 1));
    const inRange = done.filter((t) => startOfDay(t.completedAt) >= from);
    const days = Array.from({ length: range }, (_, i) => addDays(from, i));
    const perDay = days.map((d) => ({ label: range <= 7 ? WD_MIN[new Date(d).getDay()] : new Date(d).getDate() === 1 || d === from ? fmtMonthDay(d) : String(new Date(d).getDate()), value: inRange.filter((t) => startOfDay(t.completedAt) === d).length }));
    const onTime = inRange.filter((t) => t.dueAt && (t.allDay ? startOfDay(t.completedAt) <= startOfDay(t.dueAt) : t.completedAt <= t.dueAt + 60000)).length;
    const late = inRange.filter((t) => t.dueAt && !(t.allDay ? startOfDay(t.completedAt) <= startOfDay(t.dueAt) : t.completedAt <= t.dueAt + 60000)).length;
    const noDate = inRange.filter((t) => !t.dueAt).length;
    const byList = new Map();
    for (const t of inRange) byList.set(t.listId, (byList.get(t.listId) || 0) + 1);
    const lists = [...byList].map(([id, v]) => ({ label: getDB().lists[id]?.name || 'Inbox', value: v, color: getDB().lists[id]?.color })).sort((a, b) => b.value - a.value).slice(0, 8);
    const byPri = [5, 3, 1, 0].map((p) => ({ label: PRIORITY[p].name, value: inRange.filter((t) => (t.priority || 0) === p).length, color: PRIORITY[p].color }));
    const open = tasks.filter((t) => t.status === 0);
    const overdue = open.filter((t) => t.dueAt && (t.allDay ? startOfDay(t.dueAt) < td : t.dueAt < Date.now())).length;
    // focus
    const focus = all('focus');
    const fIn = focus.filter((r) => startOfDay(r.start) >= from);
    const fPerDay = days.map((d, i) => ({ label: perDay[i].label, value: Math.round(fIn.filter((r) => startOfDay(r.start) === d).reduce((n, r) => n + r.duration, 0) / 60) }));
    const fByTask = new Map();
    for (const r of fIn) { const k = (r.taskId && getDB().tasks[r.taskId]?.title) || r.title || 'No task'; fByTask.set(k, (fByTask.get(k) || 0) + r.duration); }
    const fTasks = [...fByTask].map(([label, v]) => ({ label, value: v })).sort((a, b) => b.value - a.value).slice(0, 8);
    const hours = Array.from({ length: 24 }, (_, h) => ({ label: h % 6 === 0 ? String(h) : '', value: 0 }));
    for (const r of fIn) hours[new Date(r.start).getHours()].value += Math.round(r.duration / 60);
    // habits
    const habits = all('habits').filter((h) => !h.archived);
    const hPerDay = days.map((d, i) => {
      const due = habits.filter((h) => isHabitDueOn(h, d));
      const ok = due.filter((h) => isLogDone(h, getLog(h.id, ymd(d)))).length;
      return { label: perDay[i].label, value: due.length ? Math.round((ok / due.length) * 100) : 0 };
    });
    // score: simple achievement points
    const allDone = done.length, allFocusMin = focus.reduce((n, r) => n + r.duration, 0) / 60;
    const checkins = all('habitLogs').filter((l) => { const h = getDB().habits[l.habitId]; return h && isLogDone(h, l); }).length;
    const score = Math.round(allDone * 5 + allFocusMin / 5 + checkins * 2);
    const level = Math.floor(Math.sqrt(score / 50)) + 1;
    const nextAt = Math.pow(level, 2) * 50;
    return { inRange, perDay, onTime, late, noDate, lists, byPri, open: open.length, overdue, total: done.length, fIn, fPerDay, fTasks, hours, hPerDay, score, level, nextAt, prevAt: Math.pow(level - 1, 2) * 50, fTotal: fIn.reduce((n, r) => n + r.duration, 0) };
  }, [db, range, td]);
  const completionRate = s.inRange.length + s.overdue ? Math.round((s.inRange.length / (s.inRange.length + s.overdue)) * 100) : 0;
  return (
    <div className="pane stats-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
        <h1 className="pane-title"><span>Statistics</span></h1>
        <div className="pane-actions"><Segmented small value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} /></div>
      </div>
      <div className="stats-scroll">
        <div className="score-card">
          <Icon name="trophy" size={28} />
          <div className="score-main"><div className="score-lvl">Level {s.level}</div><div className="score-pts">{s.score} points</div>
            <div className="score-bar"><span style={{ width: `${Math.min(100, ((s.score - s.prevAt) / (s.nextAt - s.prevAt)) * 100)}%` }} /></div>
            <div className="muted small">{s.nextAt - s.score} points to level {s.level + 1} · tasks +5, focus +1 per 5 min, habit check-ins +2</div>
          </div>
        </div>
        <div className="stat-tiles four">
          <div className="stat-tile"><div className="stat-num">{s.inRange.length}</div><div className="stat-lbl">Completed ({range}d)</div></div>
          <div className="stat-tile"><div className="stat-num">{s.total}</div><div className="stat-lbl">Completed all time</div></div>
          <div className="stat-tile"><div className="stat-num">{s.open}</div><div className="stat-lbl">Open tasks</div></div>
          <div className="stat-tile"><div className="stat-num" style={{ color: s.overdue ? 'var(--danger)' : undefined }}>{s.overdue}</div><div className="stat-lbl">Overdue</div></div>
        </div>
        <div className="stats-grid">
          <section className="stat-card wide"><h3>Completed tasks</h3><Bars data={s.perDay} /></section>
          <section className="stat-card">
            <h3>On time</h3>
            <HBars data={[{ label: 'On time', value: s.onTime, color: 'var(--ok)' }, { label: 'Late', value: s.late, color: 'var(--danger)' }, { label: 'No date', value: s.noDate, color: 'var(--p-none)' }]} />
            <div className="muted small">Completion vs overdue: {completionRate}%</div>
          </section>
          <section className="stat-card"><h3>By list</h3>{s.lists.length ? <HBars data={s.lists} /> : <div className="muted small">No data yet</div>}</section>
          <section className="stat-card"><h3>By priority</h3><HBars data={s.byPri} /></section>
          <section className="stat-card wide"><h3>Focus minutes <span className="muted">· {fmtDuration(s.fTotal)} total</span></h3><Bars data={s.fPerDay} color="var(--focus)" fmt={(v) => v} /></section>
          <section className="stat-card"><h3>Focus by task</h3>{s.fTasks.length ? <HBars data={s.fTasks} fmt={fmtDuration} /> : <div className="muted small">No focus sessions yet</div>}</section>
          <section className="stat-card"><h3>Focus by hour</h3><Bars data={s.hours} color="var(--focus)" height={110} /></section>
          <section className="stat-card wide"><h3>Habit completion %</h3><Bars data={s.hPerDay} color="var(--ok)" fmt={(v) => v + '%'} /></section>
        </div>
      </div>
    </div>
  );
}
export { startOfWeek, INBOX };
