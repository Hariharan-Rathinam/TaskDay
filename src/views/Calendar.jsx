import { useMemo, useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, usePrefs, all, getDB } from '../store.js';
import { today, addDays, addMonths, startOfDay, startOfWeek, monthMatrix, MONTHS, WD_SHORT, weekdayOrder, fmtTime, fmtHourLabel, fmtMonthDay, fmtFullDate, minutesOfDay, isSameDay, DAY, ymd, fmtTaskDate } from '../lib/date.js';
import { occurrencesBetween } from '../lib/repeat.js';
import { isTaskVisible, sortTasks, PRIORITY, isOverdue } from '../lib/query.js';
import { Segmented, openMenu, Popover, useIsMobile, Empty } from '../ui/common.jsx';
import { QuickAdd } from '../ui/QuickAdd.jsx';
import { TaskRow, Check } from '../ui/TaskRow.jsx';
import { useUI, setUI, openTask } from '../ui/state.js';
import { dragHandlers, dropAttr } from '../lib/dnd.js';
import { taskMenu } from '../ui/actions.js';

const HOUR = 48;

function useCalendarItems(from, to, opts) {
  const db = useDB();
  return useMemo(() => {
    const items = [];
    for (const t of all('tasks')) {
      if (!isTaskVisible(t) || !t.dueAt) continue;
      if (t.status !== 0 && !opts.showCompleted) continue;
      const s = startOfDay(t.startAt || t.dueAt), e = startOfDay(t.dueAt);
      if (e >= from && s <= to) items.push({ task: t, start: t.startAt || t.dueAt, end: t.dueAt, s, e });
      if (opts.showRepeats && t.repeat && t.status === 0) {
        for (const occ of occurrencesBetween(t, from, to + DAY, 40)) {
          const shift = occ - t.dueAt;
          items.push({ task: t, ghost: true, start: (t.startAt || t.dueAt) + shift, end: occ, s: startOfDay((t.startAt || t.dueAt) + shift), e: startOfDay(occ) });
        }
      }
    }
    return items;
  }, [db, from, to, opts.showCompleted, opts.showRepeats]);
}

export function CalendarView({ onOpenDrawer }) {
  const prefs = usePrefs();
  const ui = useUI();
  const mobile = useIsMobile();
  const copts = prefs.calendar || {};
  const mode = copts.mode || 'month';
  const setMode = (m) => S.setPrefs({ calendar: { ...copts, mode: m } });
  const ws = prefs.weekStart;
  const cur = ui.calDate;
  const setCur = (d) => setUI({ calDate: d });
  const [tray, setTray] = useState(false);

  let from, to, title;
  if (mode === 'month') {
    const d = new Date(cur);
    const weeks = monthMatrix(d.getFullYear(), d.getMonth(), ws);
    from = weeks[0][0]; to = weeks[weeks.length - 1][6];
    title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } else if (mode === 'week' || mode === '3day') {
    from = mode === 'week' ? startOfWeek(cur, ws) : startOfDay(cur);
    to = addDays(from, mode === 'week' ? 6 : 2);
    const a = new Date(from), b = new Date(to);
    title = a.getMonth() === b.getMonth() ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}` : `${fmtMonthDay(from)} – ${fmtMonthDay(to)}`;
  } else if (mode === 'day') {
    from = to = startOfDay(cur); title = fmtFullDate(cur);
  } else {
    from = startOfDay(cur); to = addDays(from, 30); title = 'Agenda';
  }
  const items = useCalendarItems(from, to, copts);
  const step = (n) => {
    if (mode === 'month') setCur(addMonths(startOfDay(cur), n));
    else if (mode === 'week') setCur(addDays(cur, 7 * n));
    else if (mode === '3day') setCur(addDays(cur, 3 * n));
    else if (mode === 'day') setCur(addDays(cur, n));
    else setCur(addDays(cur, 30 * n));
  };
  const modes = [{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: '3day', label: '3 Days' }, { value: 'day', label: 'Day' }, { value: 'agenda', label: 'Agenda' }];
  return (
    <div className="pane calendar-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
        <h1 className="pane-title"><span>{title}</span></h1>
        <div className="pane-actions">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous"><Icon name="chevronLeft" /></button>
          <button className="btn sm" onClick={() => setCur(Date.now())}>Today</button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next"><Icon name="chevronRight" /></button>
          {!mobile && <Segmented small value={mode} onChange={setMode} options={modes} />}
          <button className="icon-btn" aria-label="Calendar options" onClick={(e) => openMenu(e.currentTarget, [
            mobile && { header: 'View' },
            ...(mobile ? modes.map((m) => ({ label: m.label, checked: mode === m.value, onClick: () => setMode(m.value) })) : []),
            mobile && '-',
            { label: 'Show completed', icon: 'checkCircle', checked: copts.showCompleted !== false, onClick: () => S.setPrefs({ calendar: { ...copts, showCompleted: copts.showCompleted === false } }) },
            { label: 'Show repeating occurrences', icon: 'repeat', checked: copts.showRepeats !== false, onClick: () => S.setPrefs({ calendar: { ...copts, showRepeats: copts.showRepeats === false } }) },
            { label: tray ? 'Hide unscheduled tasks' : 'Arrange unscheduled tasks', icon: 'list', onClick: () => setTray(!tray) },
          ].filter(Boolean), { align: 'end' })}><Icon name="more" /></button>
        </div>
      </div>
      <div className="cal-body">
        <div className="cal-main">
          {mode === 'month' && <MonthGrid cur={cur} ws={ws} items={items} mobile={mobile} />}
          {(mode === 'week' || mode === '3day' || mode === 'day') && <TimeGrid days={Array.from({ length: Math.round((to - from) / DAY) + 1 }, (_, i) => addDays(from, i))} items={items} />}
          {mode === 'agenda' && <Agenda from={from} to={to} items={items} />}
        </div>
        {tray && <UnscheduledTray onClose={() => setTray(false)} />}
      </div>
    </div>
  );
}

function Chip({ item, compact }) {
  const t = item.task;
  const ui = useUI();
  const p = t.priority || 0;
  return (
    <div className={`cal-chip p${p}` + (t.status !== 0 ? ' done' : '') + (item.ghost ? ' ghost' : '') + (ui.taskId === t.id ? ' active' : '')}
      {...(item.ghost ? {} : dragHandlers({ type: 'task', id: t.id }, t.title, { onLongPress: (x, y) => taskMenu(t, { x, y }) }))}
      onClick={(e) => { e.stopPropagation(); openTask(t.id); }}
      onContextMenu={(e) => { e.preventDefault(); if (!item.ghost) taskMenu(t, { x: e.clientX, y: e.clientY }); }}
      title={`${t.title} · ${fmtTaskDate(t)}`}>
      {!compact && !t.allDay && <span className="cal-chip-time">{fmtTime(item.start)}</span>}
      <span className="cal-chip-title">{t.title || 'Untitled'}</span>
    </div>
  );
}

function MonthGrid({ cur, ws, items, mobile }) {
  const d = new Date(cur);
  const weeks = monthMatrix(d.getFullYear(), d.getMonth(), ws);
  const td = today();
  const [adding, setAdding] = useState(null); // {day, anchor}
  const [sel, setSel] = useState(startOfDay(cur));
  const byDay = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      for (let x = it.s; x <= it.e; x = addDays(x, 1)) { if (!m.has(x)) m.set(x, []); m.get(x).push(it); if (it.e - it.s > 60 * DAY) break; }
    }
    for (const [, arr] of m) arr.sort((a, b) => (a.task.status !== 0) - (b.task.status !== 0) || (a.task.allDay ? 0 : 1) - (b.task.allDay ? 0 : 1) || a.start - b.start || (b.task.priority || 0) - (a.task.priority || 0));
    return m;
  }, [items]);
  const maxChips = mobile ? 2 : Math.max(2, weeks.length === 6 ? 3 : 4);
  const selItems = byDay.get(sel) || [];
  return (
    <div className={'month-wrap' + (mobile ? ' mobile' : '')}>
      <div className="month-head">{weekdayOrder(ws).map((i) => <div key={i}>{WD_SHORT[i]}</div>)}</div>
      <div className="month-grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.flat().map((day) => {
          const list = byDay.get(day) || [];
          const out = new Date(day).getMonth() !== d.getMonth();
          return (
            <div key={day} className={'month-cell' + (out ? ' out' : '') + (day === td ? ' today' : '') + (mobile && day === sel ? ' sel' : '')} {...dropAttr({ type: 'day', day })}
              onClick={(e) => { if (mobile) setSel(day); else setAdding({ day, anchor: e.currentTarget }); }}>
              <div className="month-dn"><span>{new Date(day).getDate() === 1 ? `${MONTHS[new Date(day).getMonth()].slice(0, 3)} 1` : new Date(day).getDate()}</span></div>
              <div className="month-chips">
                {list.slice(0, maxChips).map((it, i) => <Chip key={it.task.id + ':' + i} item={it} compact={mobile} />)}
                {list.length > maxChips && <div className="month-more">+{list.length - maxChips}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {mobile && (
        <div className="month-daylist">
          <div className="group-head static"><span className="group-title">{fmtFullDate(sel)}</span><span className="group-count">{selItems.length}</span></div>
          <QuickAdd defaults={{ dueAt: sel, allDay: true }} compact placeholder="Add task on this day" />
          {selItems.map((it, i) => it.ghost ? <div key={i} className="ghost-row"><Icon name="repeat" size={13} /> {it.task.title}</div> : <TaskRow key={it.task.id} task={it.task} showList />)}
        </div>
      )}
      {adding && (
        <Popover anchor={adding.anchor} onClose={() => setAdding(null)} width={320}>
          <div className="pop-title">{fmtFullDate(adding.day)}</div>
          <QuickAdd autoFocus defaults={{ dueAt: adding.day, allDay: true }} placeholder="Add task" onCreated={() => setAdding(null)} />
          {(byDay.get(adding.day) || []).length > 0 && <div className="pop-list">{(byDay.get(adding.day) || []).map((it, i) => <Chip key={i} item={it} />)}</div>}
        </Popover>
      )}
    </div>
  );
}

function layoutDay(events) {
  // assign columns to overlapping events
  const sorted = [...events].sort((a, b) => a.top - b.top || b.height - a.height);
  const cols = [];
  for (const ev of sorted) {
    let c = 0;
    while (cols[c] && cols[c].some((o) => o.top < ev.top + ev.height && ev.top < o.top + o.height)) c++;
    (cols[c] = cols[c] || []).push(ev);
    ev.col = c;
  }
  for (const ev of sorted) {
    const overl = sorted.filter((o) => o.top < ev.top + ev.height && ev.top < o.top + o.height);
    ev.ncol = Math.max(...overl.map((o) => o.col)) + 1;
  }
  return sorted;
}

function TimeGrid({ days, items }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = Math.max(0, (minutesOfDay(Date.now()) / 60 - 2) * HOUR); }, [days.length]);
  const td = today();
  const allDay = (day) => items.filter((it) => (it.task.allDay || it.e > it.s) && it.s <= day && it.e >= day);
  const timed = (day) => items.filter((it) => !it.task.allDay && it.s === it.e && it.s === day).map((it) => {
    const m = minutesOfDay(it.start);
    const dur = Math.max(30, Math.round((it.end - it.start) / 60000) || 30);
    return { ...it, top: (m / 60) * HOUR, height: Math.max(20, Math.min(dur, 24 * 60 - m) / 60 * HOUR) };
  });
  return (
    <div className="timegrid">
      <div className="tg-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => <div key={d} className={'tg-dayhead' + (d === td ? ' today' : '')}><span className="tg-wd">{WD_SHORT[new Date(d).getDay()]}</span><span className="tg-dn">{new Date(d).getDate()}</span></div>)}
      </div>
      <div className="tg-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="tg-label">all-day</div>
        {days.map((d) => <div key={d} className="tg-allday-cell" {...dropAttr({ type: 'day', day: d })} onClick={(e) => setAdding({ day: d, anchor: e.currentTarget, allDay: true })}>{allDay(d).map((it, i) => <Chip key={i} item={it} />)}</div>)}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR }}>
          <div className="tg-hours">{Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-hour" style={{ height: HOUR }}>{h ? fmtHourLabel(h) : ''}</div>)}</div>
          {days.map((d) => (
            <div key={d} className={'tg-col' + (d === td ? ' today' : '')} {...dropAttr({ type: 'slot', day: d })}
              onClick={(e) => { if (e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); const min = Math.floor(((e.clientY - r.top) / HOUR) * 4) * 15; setAdding({ day: d, min, anchor: e.currentTarget, point: { x: e.clientX, y: e.clientY } }); }}>
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-line" style={{ top: h * HOUR }} />)}
              {layoutDay(timed(d)).map((ev, i) => (
                <div key={i} className={`tg-event p${ev.task.priority || 0}` + (ev.task.status !== 0 ? ' done' : '') + (ev.ghost ? ' ghost' : '')}
                  style={{ top: ev.top, height: ev.height - 2, left: `calc(${(ev.col / ev.ncol) * 100}% + 2px)`, width: `calc(${100 / ev.ncol}% - 4px)` }}
                  {...(ev.ghost ? {} : dragHandlers({ type: 'task', id: ev.task.id }, ev.task.title))}
                  onClick={(e) => { e.stopPropagation(); openTask(ev.task.id); }}>
                  <div className="tg-ev-title">{ev.task.title}</div>
                  <div className="tg-ev-time">{fmtTime(ev.start)}{ev.end > ev.start ? ' – ' + fmtTime(ev.end) : ''}</div>
                </div>
              ))}
              {d === td && <div className="tg-now" style={{ top: (minutesOfDay(now) / 60) * HOUR }} />}
            </div>
          ))}
        </div>
      </div>
      {adding && (
        <Popover anchor={adding.point ? null : adding.anchor} point={adding.point} onClose={() => setAdding(null)} width={320}>
          <div className="pop-title">{fmtFullDate(adding.day)}{adding.min != null ? ', ' + fmtTime(adding.day + adding.min * 60000) : ''}</div>
          <QuickAdd autoFocus defaults={adding.min != null ? { dueAt: adding.day + adding.min * 60000, allDay: false } : { dueAt: adding.day, allDay: true }} placeholder="Add task" onCreated={() => setAdding(null)} />
        </Popover>
      )}
    </div>
  );
}

function Agenda({ from, to, items }) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const list = items.filter((it) => it.s <= d && it.e >= d);
    if (list.length) days.push([d, list]);
  }
  const overdue = all('tasks').filter((t) => isTaskVisible(t) && isOverdue(t) && startOfDay(t.dueAt) < today());
  return (
    <div className="agenda task-scroll">
      {overdue.length > 0 && from <= today() && (
        <div className="group"><div className="group-head static"><span className="group-title overdue">Overdue</span><span className="group-count">{overdue.length}</span></div>
          {sortTasks(overdue, 'date').map((t) => <TaskRow key={t.id} task={t} showList />)}</div>
      )}
      {days.map(([d, list]) => (
        <div key={d} className="group">
          <div className="group-head static"><span className={'group-title' + (d === today() ? ' accent' : '')}>{fmtFullDate(d)}</span><span className="group-count">{list.length}</span></div>
          {list.sort((a, b) => a.start - b.start).map((it, i) => it.ghost
            ? <div key={i} className="ghost-row"><Icon name="repeat" size={13} /> {it.task.title} <span className="muted small">{it.task.allDay ? '' : fmtTime(it.start)}</span></div>
            : <TaskRow key={it.task.id + i} task={it.task} showList />)}
        </div>
      ))}
      {!days.length && !overdue.length && <Empty icon="calendar" title="Nothing scheduled in the next 30 days" />}
    </div>
  );
}

function UnscheduledTray({ onClose }) {
  useDB();
  const tasks = sortTasks(all('tasks').filter((t) => isTaskVisible(t) && t.status === 0 && !t.dueAt), 'priority');
  return (
    <div className="cal-tray">
      <div className="cal-tray-head"><span>Unscheduled</span><span className="group-count">{tasks.length}</span><span className="spacer" /><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div>
      <div className="muted small cal-tray-hint">Drag a task onto a day or time slot</div>
      <div className="cal-tray-list">{tasks.map((t) => <TaskRow key={t.id} task={t} showList />)}</div>
    </div>
  );
}
export { Check, PRIORITY, ymd, getDB, isSameDay };
