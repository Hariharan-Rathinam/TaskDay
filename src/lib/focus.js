// Focus timer state machine (Pomodoro + stopwatch). Survives reloads via localStorage.
import { useSyncExternalStore } from 'react';
import * as S from '../store.js';
import { playAlarm, stopNoise } from './audio.js';
import { scheduleFocusAlert, cancelFocusAlert, showSystemNotification } from './notify.js';

const KEY = 'taskday.focus';
const blank = { mode: 'pomo', phase: 'idle', running: false, endsAt: 0, remaining: 0, segStart: 0, focused: 0, sessionStart: 0, taskId: null, cycle: 0, next: 'focus', swElapsed: 0 };
let st = (() => { try { return { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...blank }; } })();
const subs = new Set();
function set(p) { st = { ...st, ...p }; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } subs.forEach((f) => f()); }
export function getFocus() { return st; }
export function useFocus() { return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => st); }

const P = () => S.getPrefs().pomo;
const phaseLen = (phase) => (phase === 'focus' ? P().focus : phase === 'short' ? P().short : P().long) * 60;

export function setMode(mode) { if (st.running || st.phase !== 'idle') return; set({ mode, phase: 'idle', next: 'focus', swElapsed: 0 }); }
export function setFocusTask(taskId) { set({ taskId }); }

function taskTitle() { const t = st.taskId && S.getDB().tasks[st.taskId]; return t && !t._del ? t.title : ''; }

export function start(phase) {
  const now = Date.now();
  if (st.mode === 'stopwatch') { set({ phase: 'focus', running: true, segStart: now, sessionStart: now, swElapsed: 0 }); return; }
  const ph = phase || st.next || 'focus';
  const len = phaseLen(ph);
  set({ phase: ph, running: true, endsAt: now + len * 1000, remaining: len, segStart: now, sessionStart: ph === 'focus' ? now : st.sessionStart, focused: ph === 'focus' ? 0 : st.focused });
  scheduleFocusAlert(now + len * 1000, ph === 'focus' ? 'Focus session complete' : 'Break is over', ph === 'focus' ? 'Time for a break' : 'Ready to focus again?');
}
export function pause() {
  if (!st.running) return;
  const now = Date.now();
  const add = st.phase === 'focus' ? (now - st.segStart) / 1000 : 0;
  if (st.mode === 'stopwatch') set({ running: false, swElapsed: st.swElapsed + (now - st.segStart) / 1000 });
  else set({ running: false, remaining: Math.max(0, (st.endsAt - now) / 1000), focused: st.focused + add });
  cancelFocusAlert();
}
export function resume() {
  if (st.running || st.phase === 'idle') return;
  const now = Date.now();
  if (st.mode === 'stopwatch') { set({ running: true, segStart: now }); return; }
  set({ running: true, endsAt: now + st.remaining * 1000, segStart: now });
  scheduleFocusAlert(now + st.remaining * 1000, st.phase === 'focus' ? 'Focus session complete' : 'Break is over', '');
}
function record(seconds, end) {
  if (seconds < 60) return null;
  return S.put('focus', { id: S.uid(), kind: st.mode, taskId: st.taskId || null, title: taskTitle(), start: st.sessionStart || end - seconds * 1000, end, duration: Math.round(seconds), note: '' });
}
// End early (keeps the record if at least 1 minute of focus).
export function stop() {
  const now = Date.now();
  cancelFocusAlert();
  if (st.mode === 'stopwatch') {
    const total = st.swElapsed + (st.running ? (now - st.segStart) / 1000 : 0);
    record(total, now);
    set({ phase: 'idle', running: false, swElapsed: 0 });
    stopNoise();
    return;
  }
  if (st.phase === 'focus') {
    const total = st.focused + (st.running ? (now - st.segStart) / 1000 : 0);
    record(total, now);
  }
  set({ phase: 'idle', running: false, next: 'focus' });
}
export function skipBreak() { cancelFocusAlert(); set({ phase: 'idle', running: false, next: 'focus' }); if (P().autoFocus) start('focus'); }

function complete() {
  const now = Date.now();
  const pr = P();
  const p = S.getPrefs();
  if (p.sound) playAlarm(pr.alarm || 'bell');
  if (st.phase === 'focus') {
    const total = st.focused + (st.endsAt - st.segStart) / 1000;
    record(total, st.endsAt);
    const cycle = st.cycle + 1;
    const next = cycle % Math.max(1, pr.longEvery) === 0 ? 'long' : 'short';
    showSystemNotification('Focus session complete 🎉', `${taskTitle() || 'Nice work'} — time for a ${next === 'long' ? 'long' : 'short'} break`);
    set({ phase: 'idle', running: false, cycle, next });
    if (pr.autoBreak) start(next);
  } else {
    showSystemNotification('Break is over', 'Ready for the next focus session?');
    set({ phase: 'idle', running: false, next: 'focus' });
    if (pr.autoFocus) start('focus');
  }
}

export function remainingSecs(now = Date.now()) {
  if (st.mode === 'stopwatch') return st.swElapsed + (st.running ? (now - st.segStart) / 1000 : 0);
  if (st.phase === 'idle') return phaseLen(st.next || 'focus');
  return st.running ? Math.max(0, (st.endsAt - now) / 1000) : st.remaining;
}
export function totalSecs() { return st.mode === 'stopwatch' ? 0 : phaseLen(st.phase === 'idle' ? st.next || 'focus' : st.phase); }

let ticker = null;
export function startFocusTicker(onTick) {
  if (ticker) return;
  ticker = setInterval(() => {
    if (st.running && st.mode === 'pomo' && Date.now() >= st.endsAt) complete();
    onTick && onTick();
  }, 1000);
}
