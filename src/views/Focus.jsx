import { useState, useEffect, useMemo } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, usePrefs, all, getDB } from '../store.js';
import * as F from '../lib/focus.js';
import { useFocus } from '../lib/focus.js';
import { setNoise, setNoiseVolume, NOISES, unlockAudio } from '../lib/audio.js';
import { fmtClock, fmtDuration, fmtTime, fmtFullDate, startOfDay, today, addDays, ymd, hm, setTime } from '../lib/date.js';
import { Segmented, Popover, Modal, Field, Switch, useIsMobile, confirmDialog, openMenu, promptDialog } from '../ui/common.jsx';
import { useUI, setUI, openTask } from '../ui/state.js';
import { isTaskVisible, sortTasks } from '../lib/query.js';

export function FocusView({ onOpenDrawer }) {
  useDB();
  const f = useFocus();
  const prefs = usePrefs();
  const ui = useUI();
  const mobile = useIsMobile();
  const [, setTick] = useState(0);
  const [taskPick, setTaskPick] = useState(null);
  const [noiseOpen, setNoiseOpen] = useState(null);
  const [settings, setSettings] = useState(false);
  const [addRec, setAddRec] = useState(false);
  const [noise, setNoiseKind] = useState(() => localStorage.getItem('taskday.noise') || 'off');
  const [vol, setVol] = useState(() => Number(localStorage.getItem('taskday.noiseVol') || 0.5));
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 500); return () => clearInterval(t); }, []);
  useEffect(() => { if (ui.focusTaskId) { F.setFocusTask(ui.focusTaskId); setUI({ focusTaskId: null }); } }, [ui.focusTaskId]);
  // keep noise in sync with running focus
  useEffect(() => { if (f.running && f.phase === 'focus' && noise !== 'off') setNoise(noise, vol); else setNoise('off'); }, [f.running, f.phase, noise]); // eslint-disable-line

  const rem = F.remainingSecs();
  const total = F.totalSecs();
  const pct = f.mode === 'stopwatch' ? (rem % 3600) / 3600 : total ? 1 - rem / total : 0;
  const task = f.taskId ? getDB().tasks[f.taskId] : null;
  const R = 120, C = 2 * Math.PI * R;
  const phaseLabel = f.mode === 'stopwatch' ? 'Stopwatch' : f.phase === 'idle' ? (f.next === 'focus' ? 'Focus' : f.next === 'long' ? 'Long break' : 'Short break') : f.phase === 'focus' ? 'Focus' : f.phase === 'long' ? 'Long break' : 'Short break';
  const isBreak = f.mode === 'pomo' && (f.phase === 'short' || f.phase === 'long' || (f.phase === 'idle' && f.next !== 'focus'));

  return (
    <div className="pane focus-pane">
      <div className="focus-main">
        <div className="pane-head">
          {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
          <h1 className="pane-title"><span>Focus</span></h1>
          <div className="pane-actions">
            <Segmented small value={f.mode} onChange={(m) => F.setMode(m)} options={[{ value: 'pomo', label: 'Pomo' }, { value: 'stopwatch', label: 'Stopwatch' }]} />
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Focus settings"><Icon name="settings" /></button>
          </div>
        </div>
        <div className="focus-center">
          <button className="focus-task" onClick={(e) => setTaskPick(e.currentTarget)}>
            {task && !task._del ? <><span className="ft-label">Focusing on</span><span className="ft-title">{task.title}</span></> : <span className="ft-label">Select a task to focus on <Icon name="chevronDown" size={14} /></span>}
          </button>
          <div className={'focus-ring' + (isBreak ? ' break' : '')}>
            <svg viewBox="0 0 260 260" width="260" height="260">
              <circle cx="130" cy="130" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle cx="130" cy="130" r={R} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 130 130)" style={{ transition: 'stroke-dashoffset .5s linear' }} />
            </svg>
            <div className="focus-time">
              <div className="ft-phase">{phaseLabel}</div>
              <div className="ft-clock">{fmtClock(rem)}</div>
              {f.mode === 'pomo' && <div className="ft-cycle">{Array.from({ length: prefs.pomo.longEvery }, (_, i) => <span key={i} className={'pomo-dot' + (i < f.cycle % prefs.pomo.longEvery ? ' on' : '')} />)}</div>}
            </div>
          </div>
          <div className="focus-controls">
            {f.phase === 'idle' && <button className="btn btn-primary btn-lg" onClick={() => { unlockAudio(); F.start(); }}><Icon name="play" size={16} /> {isBreak ? 'Start break' : 'Start'}</button>}
            {f.phase === 'idle' && isBreak && <button className="btn btn-lg" onClick={F.skipBreak}>Skip break</button>}
            {f.phase !== 'idle' && f.running && <button className="btn btn-primary btn-lg" onClick={F.pause}><Icon name="pause" size={16} /> Pause</button>}
            {f.phase !== 'idle' && !f.running && <button className="btn btn-primary btn-lg" onClick={F.resume}><Icon name="play" size={16} /> Continue</button>}
            {f.phase !== 'idle' && <button className="btn btn-lg" onClick={async () => { if (f.mode === 'pomo' && f.phase === 'focus' && !(await confirmDialog('Sessions of at least 1 minute are saved to your focus records.', { title: 'End this focus session?', ok: 'End' }))) return; F.stop(); }}><Icon name="stop" size={16} /> {f.phase === 'focus' ? 'End' : 'Skip'}</button>}
          </div>
          <button className={'noise-btn' + (noise !== 'off' ? ' on' : '')} onClick={(e) => setNoiseOpen(e.currentTarget)}><Icon name="headphones" size={16} /> {noise === 'off' ? 'Focus sounds: Off' : NOISES[noise]}</button>
        </div>
      </div>
      <FocusStats onAdd={() => setAddRec(true)} />
      {taskPick && <TaskPicker anchor={taskPick} onClose={() => setTaskPick(null)} onPick={(id) => { F.setFocusTask(id); setTaskPick(null); }} />}
      {noiseOpen && (
        <Popover anchor={noiseOpen} onClose={() => setNoiseOpen(null)} width={240}>
          <div className="menu">
            {Object.entries(NOISES).map(([k, label]) => (
              <button key={k} className={'menu-item' + (noise === k ? ' checked' : '')} onClick={() => { unlockAudio(); setNoiseKind(k); localStorage.setItem('taskday.noise', k); if (f.running && f.phase === 'focus') setNoise(k, vol); else if (k !== 'off') { setNoise(k, vol); setTimeout(() => { if (!(F.getFocus().running)) setNoise('off'); }, 2500); } }}>
                <span className="menu-label">{label}</span>{noise === k && <Icon name="check" size={16} className="menu-check" />}
              </button>
            ))}
            <div className="menu-custom"><Icon name="volume" size={16} /><input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => { const v = Number(e.target.value); setVol(v); setNoiseVolume(v); localStorage.setItem('taskday.noiseVol', String(v)); }} /></div>
            <div className="menu-header">Plays during focus sessions</div>
          </div>
        </Popover>
      )}
      {settings && <FocusSettings onClose={() => setSettings(false)} />}
      {addRec && <AddRecord onClose={() => setAddRec(false)} />}
    </div>
  );
}

function TaskPicker({ anchor, onClose, onPick }) {
  const [q, setQ] = useState('');
  const tasks = sortTasks(all('tasks').filter((t) => isTaskVisible(t) && t.status === 0 && (!q || t.title.toLowerCase().includes(q.toLowerCase()))), 'date').slice(0, 50);
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <input className="input" autoFocus placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="menu picker-list">
        <button className="menu-item" onClick={() => onPick(null)}><span className="menu-label muted">No task</span></button>
        {tasks.map((t) => <button key={t.id} className="menu-item" onClick={() => onPick(t.id)}><span className="menu-label">{t.title}</span></button>)}
      </div>
    </Popover>
  );
}

function FocusSettings({ onClose }) {
  const prefs = usePrefs();
  const p = prefs.pomo;
  const set = (c) => S.setPrefs({ pomo: { ...p, ...c } });
  const num = (k, min, max) => <input className="input num" type="number" min={min} max={max} value={p[k]} onChange={(e) => set({ [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} />;
  return (
    <Modal title="Focus settings" onClose={onClose} width={420} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="settings-grid">
        <span>Pomo duration (min)</span>{num('focus', 1, 180)}
        <span>Short break (min)</span>{num('short', 1, 60)}
        <span>Long break (min)</span>{num('long', 1, 90)}
        <span>Long break after</span><span className="row gap">{num('longEvery', 1, 12)} pomos</span>
        <span>Daily goal (pomos)</span>{num('dailyGoal', 1, 30)}
      </div>
      <Switch label="Auto-start breaks" checked={p.autoBreak} onChange={(v) => set({ autoBreak: v })} />
      <Switch label="Auto-start next pomo" checked={p.autoFocus} onChange={(v) => set({ autoFocus: v })} />
      <Field label="Alarm sound">
        <select className="input" value={p.alarm || 'bell'} onChange={(e) => { set({ alarm: e.target.value }); import('../lib/audio.js').then((m) => m.playAlarm(e.target.value)); }}>
          <option value="bell">Bell</option><option value="soft">Soft chime</option><option value="digital">Digital beep</option><option value="none">None</option>
        </select>
      </Field>
    </Modal>
  );
}

function AddRecord({ onClose }) {
  const [day, setDay] = useState(ymd(today()));
  const [from, setFrom] = useState(hm(Date.now() - 25 * 60000));
  const [to, setTo] = useState(hm(Date.now()));
  const [note, setNote] = useState('');
  const [taskId, setTaskId] = useState('');
  const tasks = sortTasks(all('tasks').filter((t) => isTaskVisible(t) && t.status === 0), 'date').slice(0, 100);
  const save = () => {
    const d = new Date(day + 'T00:00').getTime();
    const [h1, m1] = from.split(':').map(Number), [h2, m2] = to.split(':').map(Number);
    const s = setTime(d, h1, m1); let e = setTime(d, h2, m2); if (e <= s) e += 86400000;
    S.put('focus', { id: S.uid(), kind: 'pomo', taskId: taskId || null, title: taskId ? getDB().tasks[taskId]?.title : '', start: s, end: e, duration: Math.round((e - s) / 1000), note });
    onClose();
  };
  return (
    <Modal title="Add focus record" onClose={onClose} width={400} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <Field label="Date"><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      <Field label="Time"><div className="row gap"><input className="input time" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /><span>–</span><input className="input time" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
      <Field label="Task"><select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">None</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function FocusStats({ onAdd }) {
  const db = useDB();
  const prefs = usePrefs();
  const recs = useMemo(() => all('focus').sort((a, b) => b.start - a.start), [db]);
  const td = today();
  const todays = recs.filter((r) => startOfDay(r.start) === td);
  const todayPomos = todays.filter((r) => r.kind === 'pomo' && r.duration >= prefs.pomo.focus * 60 * 0.9).length;
  const todaySecs = todays.reduce((n, r) => n + r.duration, 0);
  const totalSecs = recs.reduce((n, r) => n + r.duration, 0);
  const totalPomos = recs.filter((r) => r.kind === 'pomo').length;
  const byDay = new Map();
  for (const r of recs.slice(0, 200)) { const k = startOfDay(r.start); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
  return (
    <aside className="focus-side">
      <div className="fs-section-title">Overview</div>
      <div className="stat-tiles two">
        <div className="stat-tile"><div className="stat-num">{todayPomos}<small>/{prefs.pomo.dailyGoal}</small></div><div className="stat-lbl">Today's pomos</div></div>
        <div className="stat-tile"><div className="stat-num">{fmtDuration(todaySecs)}</div><div className="stat-lbl">Today's focus</div></div>
        <div className="stat-tile"><div className="stat-num">{totalPomos}</div><div className="stat-lbl">Total sessions</div></div>
        <div className="stat-tile"><div className="stat-num">{fmtDuration(totalSecs)}</div><div className="stat-lbl">Total focus</div></div>
      </div>
      <div className="fs-section-title row">Focus record <span className="spacer" /><button className="icon-btn sm" onClick={onAdd} aria-label="Add record"><Icon name="plus" size={16} /></button></div>
      <div className="fs-records">
        {!recs.length && <div className="muted small">Completed focus sessions appear here.</div>}
        {[...byDay].map(([d, list]) => (
          <div key={d} className="fs-day">
            <div className="fs-day-head">{fmtFullDate(d)}<span className="muted">{fmtDuration(list.reduce((n, r) => n + r.duration, 0))}</span></div>
            {list.map((r) => (
              <div key={r.id} className="fs-rec" onContextMenu={(e) => { e.preventDefault(); recMenu(r, { x: e.clientX, y: e.clientY }); }}>
                <Icon name={r.kind === 'pomo' ? 'pomo' : 'timer'} size={14} />
                <span className="fs-rec-time">{fmtTime(r.start)} – {fmtTime(r.end)}</span>
                <span className="fs-rec-title" onClick={() => r.taskId && getDB().tasks[r.taskId] && openTask(r.taskId)}>{(r.taskId && getDB().tasks[r.taskId]?.title) || r.title || ''}{r.note ? <em> · {r.note}</em> : null}</span>
                <span className="fs-rec-dur">{fmtDuration(r.duration)}</span>
                <button className="icon-btn xs" onClick={(e) => recMenu(r, e.currentTarget)} aria-label="Record options"><Icon name="more" size={14} /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
function recMenu(r, target) {
  openMenu(target, [
    { label: 'Edit note', icon: 'note', onClick: async () => { const n = await promptDialog('Focus note', r.note || ''); if (n != null) S.patch('focus', r.id, { note: n }); } },
    { label: 'Delete record', icon: 'trash', danger: true, onClick: () => S.remove('focus', r.id) },
  ]);
}
export { addDays };
