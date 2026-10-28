// UI/navigation state (not synced).
import { useSyncExternalStore } from 'react';

const saved = (() => { try { return JSON.parse(localStorage.getItem('taskday.ui') || '{}'); } catch { return {}; } })();
let state = {
  section: saved.section || 'tasks',
  view: saved.view || 'smart:today',
  taskId: null,
  drawer: false,
  selectMode: false,
  selected: [],
  habitId: null,
  calDate: Date.now(),
  quickAdd: null, // { defaults } for mobile sheet
  sidebarCollapsed: !!saved.sidebarCollapsed,
  collapsed: saved.collapsed || {},
};
const subs = new Set();
export function getUI() { return state; }
export function setUI(p) {
  state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  try { localStorage.setItem('taskday.ui', JSON.stringify({ section: state.section, view: state.view, sidebarCollapsed: state.sidebarCollapsed, collapsed: state.collapsed })); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export function useUI() { return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state); }

export function openTask(id) { setUI({ taskId: id }); }
export function closeTask() { setUI({ taskId: null }); }
export function goView(view) { setUI({ section: 'tasks', view, drawer: false, selectMode: false, selected: [], taskId: null }); }
export function goSection(section) { setUI({ section, drawer: false, selectMode: false, selected: [], taskId: section === 'tasks' || section === 'calendar' ? state.taskId : null }); }
export function toggleCollapsed(key) { setUI((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })); }
export function toggleSelect(id) {
  setUI((s) => {
    const has = s.selected.includes(id);
    const selected = has ? s.selected.filter((x) => x !== id) : [...s.selected, id];
    return { selected, selectMode: selected.length > 0 || s.selectMode };
  });
}
export function clearSelection() { setUI({ selectMode: false, selected: [] }); }
