import { useState } from 'react';
import Icon from './Icon.jsx';
import { Popover, Segmented, Switch } from './common.jsx';
import { today, addDays, addMonths, startOfDay, setTime, hm, monthMatrix, MONTHS, WD_MIN, weekdayOrder, isSameDay, fmtRelDay, fmtTime, getDatePrefs, startOfWeek, ymd, parseYmd, WD_SHORT } from '../lib/date.js';
import { describeRepeat } from '../lib/repeat.js';

export function MiniCal({ value, onPick, marks, rangeEnd, compact }) {
  const ws = getDatePrefs().weekStart;
  const [cursor, setCursor] = useState(() => { const d = new Date(value || Date.now()); return { y: d.getFullYear(), m: d.getMonth() }; });
  const weeks = monthMatrix(cursor.y, cursor.m, ws);
  const td = today();
  const shift = (n) => setCursor((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <div className={'minical' + (compact ? ' compact' : '')}>
      <div className="minical-head">
        <span className="minical-title">{MONTHS[cursor.m]} {cursor.y}</span>
        <span className="minical-nav">
          <button className="icon-btn sm" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevronLeft" size={16} /></button>
          <button className="icon-btn sm" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }} aria-label="This month"><span className="dot-today" /></button>
          <button className="icon-btn sm" onClick={() => shift(1)} aria-label="Next month"><Icon name="chevronRight" size={16} /></button>
        </span>
      </div>
      <div className="minical-grid">
        {weekdayOrder(ws).map((d) => <div key={d} className="minical-wd">{WD_MIN[d]}</div>)}
        {weeks.flat().map((d) => {
          const out = new Date(d).getMonth() !== cursor.m;
          const sel = value && isSameDay(d, value);
          const inRange = rangeEnd && value && d > startOfDay(value) && d <= startOfDay(rangeEnd);
          return (
            <button key={d} className={'minical-day' + (out ? ' out' : '') + (sel ? ' sel' : '') + (d === td ? ' today' : '') + (inRange ? ' range' : '')} onClick={() => onPick(d)}>
              {new Date(d).getDate()}
              {marks && marks(d) && <span className="minical-mark" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TIMED_REMINDERS = [[0, 'On time'], [5, '5 minutes early'], [15, '15 minutes early'], [30, '30 minutes early'], [60, '1 hour early'], [120, '2 hours early'], [1440, '1 day early']];
const ALLDAY_REMINDERS = [[0, 'On the day'], [1440, '1 day early'], [2880, '2 days early'], [4320, '3 days early'], [10080, '1 week early']];
export function reminderLabel(min, allDay) {
  const list = allDay ? ALLDAY_REMINDERS : TIMED_REMINDERS;
  const f = list.find(([m]) => m === min);
  if (f) return f[1];
  if (min % 1440 === 0) return `${min / 1440} days early`;
  if (min % 60 === 0) return `${min / 60} hours early`;
  return `${min} minutes early`;
}

function RepeatEditor({ rule, anchor, onChange }) {
  const r = rule || { freq: 'weekly', interval: 1 };
  const set = (p) => onChange({ ...r, ...p });
  const wd = new Date(anchor).getDay();
  const ends = r.until ? 'date' : r.count ? 'count' : 'never';
  return (
    <div className="repeat-editor">
      <div className="row gap">
        <span>Every</span>
        <input className="input num" type="number" min="1" max="365" value={r.interval || 1} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
        <select className="input" value={r.freq} onChange={(e) => set({ freq: e.target.value, byWeekday: e.target.value === 'weekly' ? (r.byWeekday || [wd]) : undefined })}>
          <option value="daily">{(r.interval || 1) > 1 ? 'days' : 'day'}</option>
          <option value="weekly">{(r.interval || 1) > 1 ? 'weeks' : 'week'}</option>
          <option value="monthly">{(r.interval || 1) > 1 ? 'months' : 'month'}</option>
          <option value="yearly">{(r.interval || 1) > 1 ? 'years' : 'year'}</option>
        </select>
      </div>
      {r.freq === 'weekly' && (
        <div className="wd-chips">
          {weekdayOrder(getDatePrefs().weekStart).map((d) => {
            const on = (r.byWeekday || [wd]).includes(d);
            return <button key={d} className={'chip' + (on ? ' on' : '')} onClick={() => { const cur = r.byWeekday || [wd]; const next = on ? cur.filter((x) => x !== d) : [...cur, d]; set({ byWeekday: next.length ? next : [d] }); }}>{WD_SHORT[d]}</button>;
          })}
        </div>
      )}
      {r.freq === 'monthly' && (
        <select className="input" value={r.monthMode || 'day'} onChange={(e) => set({ monthMode: e.target.value })}>
          <option value="day">On day {new Date(anchor).getDate()}</option>
          <option value="weekday">{describeRepeat({ freq: 'monthly', interval: 1, monthMode: 'weekday' }, anchor).replace('Monthly ', '')}</option>
          <option value="last">On the last day</option>
        </select>
      )}
      {r.freq === 'daily' && <label className="check-row"><input type="checkbox" checked={!!r.skipWeekends} onChange={(e) => set({ skipWeekends: e.target.checked })} /> Skip weekends</label>}
      <div className="row gap wrap">
        <span>Ends</span>
        <select className="input" value={ends} onChange={(e) => { const v = e.target.value; set({ until: v === 'date' ? addMonths(anchor, 1) : undefined, count: v === 'count' ? 10 : undefined }); }}>
          <option value="never">Never</option>
          <option value="date">On date</option>
          <option value="count">After N times</option>
        </select>
        {ends === 'date' && <input className="input" type="date" value={ymd(r.until)} onChange={(e) => e.target.value && set({ until: parseYmd(e.target.value) })} />}
        {ends === 'count' && <input className="input num" type="number" min="1" value={r.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />}
      </div>
    </div>
  );
}

// value: { dueAt, startAt, allDay, reminders, repeat }
export function DatePicker({ anchor, value, onChange, onClose }) {
  const init = value || {};
  const [mode, setMode] = useState(init.startAt && init.dueAt && init.startAt !== init.dueAt ? 'duration' : 'date');
  const baseDay = init.dueAt ? startOfDay(init.startAt || init.dueAt) : null;
  const [day, setDay] = useState(baseDay);
  const [time, setTimeStr] = useState(init.dueAt && !init.allDay ? hm(init.startAt || init.dueAt) : '');
  const [endDay, setEndDay] = useState(init.dueAt ? startOfDay(init.dueAt) : null);
  const [endTime, setEndTime] = useState(init.dueAt && !init.allDay && init.startAt ? hm(init.dueAt) : '');
  const [editing, setEditing] = useState('start');
  const [reminders, setReminders] = useState(init.reminders || []);
  const [repeat, setRepeat] = useState(init.repeat || null);
  const [panel, setPanel] = useState(null); // 'reminder' | 'repeat' | 'custom'

  const allDay = mode === 'date' ? !time : !time && !endTime;
  const anchorDay = day || today();

  const pick = (d) => {
    if (mode === 'duration' && editing === 'end') { setEndDay(d < (day || d) ? day : d); }
    else {
      setDay(d);
      if (mode === 'duration') { if (!endDay || endDay < d) setEndDay(d); setEditing('end'); }
    }
  };
  const quick = (d) => { setDay(d); if (mode === 'duration' && (!endDay || endDay < d)) setEndDay(d); };

  const build = () => {
    if (!day) return { dueAt: null, startAt: null, allDay: true, reminders: [], repeat: null };
    const parse = (t) => t.split(':').map(Number);
    if (mode === 'date') {
      const dueAt = time ? setTime(day, ...parse(time)) : day;
      return { dueAt, startAt: null, allDay: !time, reminders, repeat };
    }
    const ed = endDay || day;
    let startAt = time ? setTime(day, ...parse(time)) : day;
    let dueAt = endTime ? setTime(ed, ...parse(endTime)) : (time ? setTime(ed, ...parse(time)) + 3600000 : ed);
    if (dueAt < startAt) dueAt = startAt + 3600000;
    return { dueAt, startAt, allDay: !time && !endTime, reminders, repeat };
  };

  const remOpts = allDay ? ALLDAY_REMINDERS : TIMED_REMINDERS;
  const wd = new Date(anchorDay).getDay();
  const repeatPresets = [
    ['None', null],
    ['Daily', { freq: 'daily', interval: 1 }],
    [`Weekly (${WD_SHORT[wd]})`, { freq: 'weekly', interval: 1, byWeekday: [wd] }],
    ['Weekdays (Mon-Fri)', { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }],
    [`Monthly (day ${new Date(anchorDay).getDate()})`, { freq: 'monthly', interval: 1 }],
    [`Yearly`, { freq: 'yearly', interval: 1 }],
  ];

  return (
    <Popover anchor={anchor} onClose={onClose} width={300} className="datepicker">
      {panel === null && <>
        <Segmented value={mode} onChange={(m) => { setMode(m); if (m === 'duration') { if (!day) setDay(today()); if (!endDay) setEndDay(day || today()); setEditing('start'); } }}
          options={[{ value: 'date', label: 'Date' }, { value: 'duration', label: 'Duration' }]} />
        <div className="dp-quick">
          <button title="Today" onClick={() => quick(today())}><Icon name="sun" /></button>
          <button title="Tomorrow" onClick={() => quick(addDays(today(), 1))}><Icon name="sunrise" /></button>
          <button title="Next week" onClick={() => quick(addDays(startOfWeek(today(), getDatePrefs().weekStart), 7))}><span className="dp-plus">+7</span></button>
          <button title="Next month" onClick={() => quick(addMonths(today(), 1))}><Icon name="moon" /></button>
        </div>
        {mode === 'duration' && (
          <div className="dp-range">
            <button className={'dp-range-btn' + (editing === 'start' ? ' on' : '')} onClick={() => setEditing('start')}>
              <small>Start</small><span>{day ? fmtRelDay(day) : '—'}</span>
            </button>
            <Icon name="arrowRight" size={14} />
            <button className={'dp-range-btn' + (editing === 'end' ? ' on' : '')} onClick={() => setEditing('end')}>
              <small>End</small><span>{endDay ? fmtRelDay(endDay) : '—'}</span>
            </button>
          </div>
        )}
        <MiniCal key={mode + editing} value={mode === 'duration' && editing === 'end' ? endDay : day} rangeEnd={mode === 'duration' ? endDay : null} onPick={pick} />
        <div className="dp-rows">
          {mode === 'date' ? (
            <div className="dp-row">
              <Icon name="clock" size={16} /><span>Time</span>
              <span className="dp-row-val">
                <input type="time" className="input time" value={time} onChange={(e) => { setTimeStr(e.target.value); if (!day) setDay(today()); }} />
                {time && <button className="icon-btn sm" onClick={() => setTimeStr('')} aria-label="Clear time"><Icon name="x" size={14} /></button>}
              </span>
            </div>
          ) : (
            <div className="dp-row">
              <Icon name="clock" size={16} /><span>Time</span>
              <span className="dp-row-val">
                <input type="time" className="input time" value={time} onChange={(e) => setTimeStr(e.target.value)} />
                <span>–</span>
                <input type="time" className="input time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </span>
            </div>
          )}
          <button className="dp-row" onClick={() => setPanel('reminder')} disabled={!day}>
            <Icon name="bell" size={16} /><span>Reminder</span>
            <span className="dp-row-val muted">{reminders.length ? reminders.map((r) => reminderLabel(r, allDay)).join(', ') : 'None'}</span>
            <Icon name="chevronRight" size={14} />
          </button>
          <button className="dp-row" onClick={() => setPanel('repeat')} disabled={!day}>
            <Icon name="repeat" size={16} /><span>Repeat</span>
            <span className="dp-row-val muted">{repeat ? describeRepeat(repeat, anchorDay) : 'None'}</span>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div className="dp-foot">
          <button className="btn" onClick={() => { onChange({ dueAt: null, startAt: null, allDay: true, reminders: [], repeat: null }); onClose(); }}>Clear</button>
          <button className="btn btn-primary" onClick={() => { onChange(build()); onClose(); }}>OK</button>
        </div>
      </>}
      {panel === 'reminder' && (
        <div className="dp-panel">
          <button className="menu-item menu-back" onClick={() => setPanel(null)}><Icon name="chevronLeft" size={16} /> Reminder</button>
          {remOpts.map(([m, label]) => {
            const on = reminders.includes(m);
            return <button key={m} className={'menu-item' + (on ? ' checked' : '')} onClick={() => setReminders(on ? reminders.filter((x) => x !== m) : [...reminders, m].sort((a, b) => a - b))}>
              <span className="menu-label">{label}{m === 0 && allDay ? ` (${getAllDayHint()})` : ''}</span>{on && <Icon name="check" size={16} className="menu-check" />}
            </button>;
          })}
          <div className="dp-custom-rem">
            <span>Custom:</span>
            <input className="input num" type="number" min="0" placeholder="0" id="customRem" />
            <select className="input" id="customRemUnit" defaultValue="1"><option value="1">min</option><option value="60">hours</option><option value="1440">days</option></select>
            <button className="btn sm" onClick={() => { const v = Number(document.getElementById('customRem').value); const u = Number(document.getElementById('customRemUnit').value); if (v >= 0) setReminders([...new Set([...reminders, v * u])].sort((a, b) => a - b)); }}>Add</button>
          </div>
          <div className="dp-foot"><button className="btn btn-primary" onClick={() => setPanel(null)}>Done</button></div>
        </div>
      )}
      {panel === 'repeat' && (
        <div className="dp-panel">
          <button className="menu-item menu-back" onClick={() => setPanel(null)}><Icon name="chevronLeft" size={16} /> Repeat</button>
          {repeatPresets.map(([label, r]) => {
            const on = JSON.stringify(stripRule(repeat)) === JSON.stringify(stripRule(r));
            return <button key={label} className={'menu-item' + (on ? ' checked' : '')} onClick={() => { setRepeat(r ? { ...r, fromCompletion: repeat?.fromCompletion } : null); setPanel(null); }}>
              <span className="menu-label">{label}</span>{on && <Icon name="check" size={16} className="menu-check" />}
            </button>;
          })}
          <button className="menu-item" onClick={() => { if (!repeat) setRepeat({ freq: 'weekly', interval: 1, byWeekday: [wd] }); setPanel('custom'); }}><span className="menu-label">Custom…</span><Icon name="chevronRight" size={14} /></button>
          {repeat && <div className="dp-pad"><Switch label="Repeat from completion date" checked={!!repeat.fromCompletion} onChange={(v) => setRepeat({ ...repeat, fromCompletion: v })} /></div>}
        </div>
      )}
      {panel === 'custom' && (
        <div className="dp-panel">
          <button className="menu-item menu-back" onClick={() => setPanel('repeat')}><Icon name="chevronLeft" size={16} /> Custom repeat</button>
          <RepeatEditor rule={repeat} anchor={anchorDay} onChange={setRepeat} />
          <div className="dp-pad muted small">{describeRepeat(repeat, anchorDay)}</div>
          <div className="dp-foot"><button className="btn btn-primary" onClick={() => setPanel(null)}>Done</button></div>
        </div>
      )}
    </Popover>
  );
}
function stripRule(r) { if (!r) return null; const { fromCompletion, ...rest } = r; return rest; }
let allDayHint = '09:00';
export function setAllDayHint(v) { allDayHint = v; }
function getAllDayHint() { const [h, m] = allDayHint.split(':').map(Number); return fmtTime(setTime(Date.now(), h, m)); }
