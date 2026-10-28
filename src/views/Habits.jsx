import { useState, useMemo } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, usePrefs, all, getLog, isLogDone, habitTarget, isHabitDueOn, habitStats, toggleHabit, setHabitValue } from '../store.js';
import { today, addDays, ymd, startOfWeek, WD_MIN, WD_SHORT, weekdayOrder, monthMatrix, MONTHS, fmtFullDate, parseYmd, startOfDay, DAY } from '../lib/date.js';
import { Modal, Field, ColorPicker, EmojiPicker, Segmented, Switch, openMenu, confirmDialog, promptDialog, useIsMobile, Empty, toast, COLORS } from '../ui/common.jsx';
import { useUI, setUI } from '../ui/state.js';
import { playComplete } from '../lib/audio.js';

const SECTIONS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['night', 'Night'], ['other', 'Others']];

function Ring({ value, max, color, size = 34, children }) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r;
  const pct = Math.min(1, max ? value / max : 0);
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {children}
    </svg>
  );
}

export function HabitsView({ onOpenDrawer }) {
  const db = useDB();
  const prefs = usePrefs();
  const ui = useUI();
  const mobile = useIsMobile();
  const [day, setDay] = useState(today());
  const [edit, setEdit] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const ws = prefs.weekStart;
  const weekStart = startOfWeek(day, ws);
  const habits = all('habits').filter((h) => !!h.archived === showArchived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const due = habits.filter((h) => showArchived || isHabitDueOn(h, day));
  const notDue = showArchived ? [] : habits.filter((h) => !isHabitDueOn(h, day));
  const dayKey = ymd(day);

  const check = async (h) => {
    const wasDone = isLogDone(h, getLog(h.id, dayKey));
    toggleHabit(h.id, dayKey);
    const nowDone = isLogDone(h, getLog(h.id, dayKey));
    if (!wasDone && nowDone) {
      if (prefs.sound) playComplete();
      if (prefs.habitNote) {
        const note = await promptDialog(`${h.icon || ''} ${h.name} — check-in note`, '', { placeholder: 'How did it go? (optional)', ok: 'Save' });
        if (note) S.patch('habitLogs', S.logId(h.id, dayKey), { note });
      }
    }
  };
  const dayRate = (d) => {
    const hs = all('habits').filter((h) => !h.archived && isHabitDueOn(h, d));
    if (!hs.length) return null;
    return hs.filter((h) => isLogDone(h, getLog(h.id, ymd(d)))).length / hs.length;
  };

  const card = (h) => {
    const log = getLog(h.id, dayKey);
    const done = isLogDone(h, log);
    const st = habitStats(h);
    const target = habitTarget(h);
    const color = h.color || COLORS[0];
    return (
      <div key={h.id} className={'habit-card' + (done ? ' done' : '') + (ui.habitId === h.id ? ' active' : '')} onClick={() => setUI({ habitId: h.id })}
        onContextMenu={(e) => { e.preventDefault(); habitMenu(h, { x: e.clientX, y: e.clientY }, setEdit); }}>
        <div className="habit-icon" style={{ background: color + '22', color }}>{h.icon || '✅'}</div>
        <div className="habit-main">
          <div className="habit-name">{h.name}</div>
          <div className="habit-sub">
            {h.goal?.type === 'count' ? <span>{log?.value || 0}/{target} {h.goal.unit || ''}</span> : null}
            {st.cur > 0 && <span className="streak"><Icon name="fire" size={12} /> {st.cur} {st.unit === 'weeks' ? 'wk' : 'day'}{st.cur > 1 ? 's' : ''}</span>}
            {h.freq?.type === 'weekly' && <span>{weekCount(h, weekStart)}/{h.freq.times} this week</span>}
            {log?.status === 'skip' && <span>Skipped</span>}
          </div>
        </div>
        <button className="habit-check" onClick={(e) => { e.stopPropagation(); check(h); }} aria-label={done ? 'Undo check-in' : 'Check in'}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); habitDayMenu(h, dayKey, e.currentTarget); }}>
          {h.goal?.type === 'count' && !done ? (
            <Ring value={log?.value || 0} max={target} color={color}><text x="17" y="21" textAnchor="middle" fontSize="11" fill="currentColor">+{h.goal.step || 1}</text></Ring>
          ) : (
            <span className={'habit-tick' + (done ? ' on' : '')} style={done ? { background: color, borderColor: color } : { borderColor: color }}>{done && <Icon name="check" size={16} strokeWidth={3} />}</span>
          )}
        </button>
      </div>
    );
  };

  const grouped = prefs.habitSections !== false && !showArchived
    ? SECTIONS.map(([k, label]) => [label, due.filter((h) => (h.section || 'other') === k)]).filter(([, l]) => l.length)
    : [['', due]];

  return (
    <div className="pane habits-pane">
      <div className="habits-main">
        <div className="pane-head">
          {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
          <h1 className="pane-title"><span>{showArchived ? 'Archived habits' : 'Habit'}</span></h1>
          <div className="pane-actions">
            <button className="icon-btn" onClick={() => setEdit({})} aria-label="New habit"><Icon name="plus" /></button>
            <button className="icon-btn" onClick={(e) => openMenu(e.currentTarget, [
              { label: showArchived ? 'Back to habits' : 'Archived habits', icon: 'archive', onClick: () => setShowArchived(!showArchived) },
              { label: 'Group by time of day', icon: 'all', checked: prefs.habitSections !== false, onClick: () => S.setPrefs({ habitSections: prefs.habitSections === false }) },
              { label: 'Ask for a note after check-in', icon: 'note', checked: !!prefs.habitNote, onClick: () => S.setPrefs({ habitNote: !prefs.habitNote }) },
            ], { align: 'end' })} aria-label="More"><Icon name="more" /></button>
          </div>
        </div>
        {!showArchived && (
          <div className="week-strip">
            <button className="icon-btn sm" onClick={() => setDay(addDays(day, -7))}><Icon name="chevronLeft" size={16} /></button>
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
              const rate = dayRate(d);
              return (
                <button key={d} className={'ws-day' + (d === day ? ' sel' : '') + (d === today() ? ' today' : '') + (d > today() ? ' future' : '')} onClick={() => setDay(d)}>
                  <span className="ws-wd">{WD_MIN[new Date(d).getDay()]}</span>
                  <Ring value={rate || 0} max={1} color="var(--accent)" size={30}><text x="15" y="19.5" textAnchor="middle" fontSize="11" fill="currentColor">{new Date(d).getDate()}</text></Ring>
                </button>
              );
            })}
            <button className="icon-btn sm" onClick={() => setDay(addDays(day, 7))}><Icon name="chevronRight" size={16} /></button>
          </div>
        )}
        <div className="habit-list">
          {!habits.length && <Empty icon="habit" title={showArchived ? 'No archived habits' : 'Build good habits'} text={showArchived ? '' : 'Track daily routines, count glasses of water, keep streaks going.'}>{!showArchived && <button className="btn btn-primary" onClick={() => setEdit({})}>New habit</button>}</Empty>}
          {grouped.map(([label, list]) => (
            <div key={label} className="habit-group">
              {label && <div className="group-head static"><span className="group-title">{label}</span><span className="group-count">{list.length}</span></div>}
              {list.map(card)}
            </div>
          ))}
          {notDue.length > 0 && (
            <div className="habit-group">
              <div className="group-head static"><span className="group-title muted">Not scheduled {day === today() ? 'today' : 'this day'}</span></div>
              {notDue.map(card)}
            </div>
          )}
        </div>
      </div>
      {ui.habitId && db.habits[ui.habitId] && !db.habits[ui.habitId]._del && <HabitDetail habit={db.habits[ui.habitId]} onEdit={setEdit} mobile={mobile} />}
      {edit && <HabitDialog habit={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function weekCount(h, wkStart) { let n = 0; for (let i = 0; i < 7; i++) if (isLogDone(h, getLog(h.id, ymd(addDays(wkStart, i))))) n++; return n; }

function habitDayMenu(h, dayKey, anchor) {
  const log = getLog(h.id, dayKey);
  openMenu(anchor, [
    h.goal?.type === 'count' && { label: 'Set amount…', icon: 'edit', onClick: async () => { const v = await promptDialog(`${h.name} — amount`, String(log?.value || 0)); if (v != null && !isNaN(Number(v))) setHabitValue(h.id, dayKey, Number(v)); } },
    { label: 'Add note…', icon: 'note', onClick: async () => { const v = await promptDialog('Check-in note', log?.note || ''); if (v != null) { if (!log) setHabitValue(h.id, dayKey, 0); S.patch('habitLogs', S.logId(h.id, dayKey), { note: v }); } } },
    { label: log?.status === 'skip' ? 'Unskip' : 'Skip this day', icon: 'skip', onClick: () => setHabitValue(h.id, dayKey, 0, { status: log?.status === 'skip' ? 'none' : 'skip' }) },
    { label: 'Clear check-in', icon: 'x', onClick: () => setHabitValue(h.id, dayKey, 0) },
  ].filter(Boolean));
}
function habitMenu(h, target, setEdit) {
  openMenu(target, [
    { label: 'Edit', icon: 'edit', onClick: () => setEdit(h) },
    { label: h.archived ? 'Restore' : 'Archive', icon: 'archive', onClick: () => S.patch('habits', h.id, { archived: !h.archived }) },
    { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('All check-in history for this habit will be removed.', { title: `Delete "${h.name}"?`, ok: 'Delete', danger: true })) { S.batch((b) => { for (const l of all('habitLogs')) if (l.habitId === h.id) b.remove('habitLogs', l.id); b.remove('habits', h.id); }); setUI({ habitId: null }); } } },
  ]);
}

function HabitDetail({ habit: h, onEdit, mobile }) {
  useDB();
  const prefs = usePrefs();
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const st = habitStats(h);
  const color = h.color || COLORS[0];
  const weeks = monthMatrix(month.y, month.m, prefs.weekStart);
  const mStart = new Date(month.y, month.m, 1).getTime(), mEnd = new Date(month.y, month.m + 1, 0).getTime();
  let monthDone = 0, monthDue = 0;
  for (let d = mStart; d <= Math.min(mEnd, today()); d = addDays(d, 1)) { if (isHabitDueOn(h, d)) { monthDue++; if (st.doneDays.has(ymd(d))) monthDone++; } }
  const logs = all('habitLogs').filter((l) => l.habitId === h.id && (l.note || isLogDone(h, l))).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  return (
    <aside className={'habit-detail' + (mobile ? ' detail-mobile' : '')}>
      <div className="detail-head">
        <button className="icon-btn" onClick={() => setUI({ habitId: null })} aria-label="Close"><Icon name={mobile ? 'arrowLeft' : 'x'} /></button>
        <div className="habit-icon sm" style={{ background: color + '22', color }}>{h.icon || '✅'}</div>
        <strong className="hd-name">{h.name}</strong>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => onEdit(h)} aria-label="Edit"><Icon name="edit" /></button>
        <button className="icon-btn" onClick={(e) => habitMenu(h, e.currentTarget, onEdit)} aria-label="More"><Icon name="moreV" /></button>
      </div>
      <div className="detail-body">
        <div className="stat-tiles">
          <div className="stat-tile"><div className="stat-num">{monthDone}</div><div className="stat-lbl">Monthly check-ins</div></div>
          <div className="stat-tile"><div className="stat-num">{st.total}</div><div className="stat-lbl">Total check-ins</div></div>
          <div className="stat-tile"><div className="stat-num">{monthDue ? Math.round((monthDone / monthDue) * 100) : 0}%</div><div className="stat-lbl">Monthly rate</div></div>
          <div className="stat-tile"><div className="stat-num">{st.cur}<small> {st.cur === 1 ? st.unit.slice(0, -1) : st.unit}</small></div><div className="stat-lbl">Current streak</div></div>
          <div className="stat-tile"><div className="stat-num">{st.best}<small> {st.best === 1 ? st.unit.slice(0, -1) : st.unit}</small></div><div className="stat-lbl">Best streak</div></div>
        </div>
        <div className="hd-cal">
          <div className="minical-head">
            <span className="minical-title">{MONTHS[month.m]} {month.y}</span>
            <span className="minical-nav">
              <button className="icon-btn sm" onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><Icon name="chevronLeft" size={16} /></button>
              <button className="icon-btn sm" onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><Icon name="chevronRight" size={16} /></button>
            </span>
          </div>
          <div className="minical-grid">
            {weekdayOrder(prefs.weekStart).map((d) => <div key={d} className="minical-wd">{WD_MIN[d]}</div>)}
            {weeks.flat().map((d) => {
              const k = ymd(d);
              const done = st.doneDays.has(k);
              const log = getLog(h.id, k);
              const out = new Date(d).getMonth() !== month.m;
              const partial = !done && log && log.value > 0;
              return (
                <button key={d} className={'hd-day' + (out ? ' out' : '') + (d > today() ? ' future' : '') + (!isHabitDueOn(h, d) ? ' off' : '')}
                  style={done ? { background: color, color: '#fff' } : partial ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
                  disabled={d > today()} onClick={() => toggleHabit(h.id, k)} title={log?.note || ''}
                  onContextMenu={(e) => { e.preventDefault(); habitDayMenu(h, k, e.currentTarget); }}>
                  {new Date(d).getDate()}{log?.note && <span className="note-dot" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="detail-section-head">Check-in log</div>
        {logs.length ? logs.map((l) => (
          <div key={l.id} className="hd-log"><span className="hd-log-date">{fmtFullDate(parseYmd(l.date))}</span><span>{h.goal?.type === 'count' ? `${l.value} ${h.goal.unit || ''}` : '✓'}</span>{l.note && <div className="hd-log-note">{l.note}</div>}</div>
        )) : <div className="muted small">No check-ins yet. Tap a day above or the circle in the list.</div>}
      </div>
    </aside>
  );
}

export function HabitDialog({ habit, onClose }) {
  const isNew = !habit?.id;
  const [f, setF] = useState(() => ({
    name: '', icon: '💧', color: COLORS[0], section: 'other', reminders: [], startDate: ymd(today()), freq: { type: 'daily', days: [] }, goal: { type: 'once' }, ...habit,
  }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const [rem, setRem] = useState('');
  const save = () => {
    if (!f.name.trim()) return;
    if (isNew) S.put('habits', { ...f, id: S.uid(), name: f.name.trim(), order: all('habits').length });
    else S.put('habits', { ...f, name: f.name.trim() });
    onClose();
  };
  const presets = [['💧', 'Drink water', { type: 'count', target: 8, unit: 'glasses', step: 1 }], ['🏃', 'Exercise', { type: 'once' }], ['📖', 'Read', { type: 'count', target: 20, unit: 'pages', step: 5 }], ['🧘', 'Meditate', { type: 'once' }], ['😴', 'Sleep early', { type: 'once' }], ['🍎', 'Eat fruit', { type: 'once' }]];
  return (
    <Modal title={isNew ? 'New habit' : 'Edit habit'} onClose={onClose} width={480}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
      {isNew && <div className="chips presets">{presets.map(([ic, n, goal]) => <button key={n} className="chip" onClick={() => set({ icon: ic, name: n, goal })}>{ic} {n}</button>)}</div>}
      <Field label="Name"><input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Drink water" /></Field>
      <Field label="Icon"><EmojiPicker value={f.icon} onChange={(v) => set({ icon: v })} allowNone={false} /></Field>
      <Field label="Color"><ColorPicker value={f.color} onChange={(v) => set({ color: v })} allowNone={false} /></Field>
      <Field label="Frequency">
        <Segmented value={f.freq.type} onChange={(t) => set({ freq: t === 'daily' ? { type: 'daily', days: [] } : t === 'weekly' ? { type: 'weekly', times: 3 } : { type: 'interval', every: 2 } })}
          options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'interval', label: 'Interval' }]} />
        {f.freq.type === 'daily' && (
          <div className="wd-chips">
            {weekdayOrder(S.getPrefs().weekStart).map((d) => {
              const days = f.freq.days?.length ? f.freq.days : [0, 1, 2, 3, 4, 5, 6];
              const on = days.includes(d);
              return <button key={d} className={'chip' + (on ? ' on' : '')} onClick={() => { const next = on ? days.filter((x) => x !== d) : [...days, d]; set({ freq: { type: 'daily', days: next.length === 7 ? [] : next.length ? next : [d] } }); }}>{WD_SHORT[d]}</button>;
            })}
          </div>
        )}
        {f.freq.type === 'weekly' && <div className="row gap"><input className="input num" type="number" min="1" max="7" value={f.freq.times} onChange={(e) => set({ freq: { type: 'weekly', times: Math.min(7, Math.max(1, Number(e.target.value) || 1)) } })} /> <span>days per week</span></div>}
        {f.freq.type === 'interval' && <div className="row gap"><span>Every</span><input className="input num" type="number" min="1" value={f.freq.every} onChange={(e) => set({ freq: { type: 'interval', every: Math.max(1, Number(e.target.value) || 1) } })} /> <span>days</span></div>}
      </Field>
      <Field label="Goal">
        <Segmented value={f.goal.type} onChange={(t) => set({ goal: t === 'once' ? { type: 'once' } : { type: 'count', target: 8, unit: 'times', step: 1 } })}
          options={[{ value: 'once', label: 'Achieve it all' }, { value: 'count', label: 'Reach an amount' }]} />
        {f.goal.type === 'count' && (
          <div className="row gap wrap">
            <span>Daily</span><input className="input num" type="number" min="1" value={f.goal.target} onChange={(e) => set({ goal: { ...f.goal, target: Math.max(1, Number(e.target.value) || 1) } })} />
            <input className="input" style={{ width: 100 }} value={f.goal.unit} onChange={(e) => set({ goal: { ...f.goal, unit: e.target.value } })} placeholder="unit" />
            <span>+</span><input className="input num" type="number" min="1" value={f.goal.step || 1} onChange={(e) => set({ goal: { ...f.goal, step: Math.max(1, Number(e.target.value) || 1) } })} /><span>per tap</span>
          </div>
        )}
      </Field>
      <Field label="Section">
        <Segmented value={f.section} onChange={(v) => set({ section: v })} options={SECTIONS.map(([v, l]) => ({ value: v, label: l }))} />
      </Field>
      <Field label="Reminders">
        <div className="chips">
          {f.reminders.map((r) => <span key={r} className="chip on">{r}<button className="chip-x" onClick={() => set({ reminders: f.reminders.filter((x) => x !== r) })}><Icon name="x" size={11} /></button></span>)}
          <input className="input time" type="time" value={rem} onChange={(e) => setRem(e.target.value)} />
          <button className="btn sm" onClick={() => { if (rem && !f.reminders.includes(rem)) set({ reminders: [...f.reminders, rem].sort() }); setRem(''); }}>Add</button>
        </div>
      </Field>
      <Field label="Start date"><input className="input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
    </Modal>
  );
}
export { useMemo, startOfDay, DAY, toast, Switch };
