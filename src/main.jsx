import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadDB, flushPersist, getPrefs } from './store.js';
import { startSync } from './lib/sync.js';
import { startReminders, setReminderHandler } from './lib/notify.js';
import { startFocusTicker, getFocus, remainingSecs } from './lib/focus.js';
import { openTask, setUI } from './ui/state.js';
import { toast } from './ui/common.jsx';
import { fmtClock, setDatePrefs } from './lib/date.js';
import { isNative } from './lib/native.js';

async function boot() {
  if (isNative()) document.documentElement.classList.add('native');
  await loadDB();
  const p = getPrefs();
  setDatePrefs({ h24: p.h24, weekStart: p.weekStart, dateOrder: p.dateOrder });
  const open = (id) => { setUI({ section: 'tasks', taskId: id }); };
  createRoot(document.getElementById('root')).render(<App />);
  startSync();
  setReminderHandler((r) => toast(`⏰ ${r.title}`, { duration: 8000, action: r.taskId ? 'Open' : undefined, onAction: () => r.taskId && open(r.taskId) }));
  startReminders(open);
  const baseTitle = document.title;
  startFocusTicker(() => {
    const f = getFocus();
    document.title = f.running ? `${fmtClock(remainingSecs())} · ${f.phase === 'focus' ? 'Focus' : 'Break'}` : baseTitle;
  });
  const m = location.hash.match(/task=([\w]+)/);
  if (m) { open(m[1]); history.replaceState(null, '', location.pathname); }
  window.addEventListener('pagehide', () => { flushPersist(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPersist(); });
  if ('serviceWorker' in navigator && !isNative() && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
boot();
export { openTask };
