import { useState, useEffect, useSyncExternalStore } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { usePrefs, useDB, all, INBOX } from '../store.js';
import { Switch, Segmented, Field, confirmDialog, toast, useIsMobile, openMenu } from '../ui/common.jsx';
import { activeLists, SMART } from '../lib/query.js';
import * as Sync from '../lib/sync.js';
import { isNative, Storage } from '../lib/native.js';
import { requestNotifyPermission, notifyPermissionState, showSystemNotification } from '../lib/notify.js';
import { importTickTickCSV } from '../lib/importer.js';
import { fmtFullDate, fmtTime } from '../lib/date.js';

const ACCENTS = { blue: '#4772FA', green: '#2EA87A', purple: '#7B61FF', red: '#E5484D', orange: '#F2994A', pink: '#E85D9C', teal: '#1FA2B5', graphite: '#5F6B7A' };
export { ACCENTS };

function useSync() { return useSyncExternalStore(Sync.subscribeSync, Sync.getSyncState); }

async function saveFile(name, text, mime = 'application/json') {
  if (isNative()) {
    const path = '/storage/emulated/0/Download/' + name;
    try { await Storage.write(path, text); toast('Saved to Download/' + name); } catch (e) { toast('Could not save: ' + (e.message || e) + ' — allow file access in Settings → Sync first'); }
    return;
  }
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return resolve(null); f.text().then(resolve); };
    i.click();
  });
}

function Section({ icon, title, children }) {
  return <section className="set-section"><h2><Icon name={icon} size={18} /> {title}</h2><div className="set-body">{children}</div></section>;
}
function Row({ label, hint, children }) {
  return <div className="set-row"><div className="set-label">{label}{hint && <div className="set-hint">{hint}</div>}</div><div className="set-ctl">{children}</div></div>;
}

export function SettingsView({ onOpenDrawer }) {
  useDB();
  const p = usePrefs();
  const mobile = useIsMobile();
  const set = (c) => S.setPrefs(c);
  const [perm, setPerm] = useState(notifyPermissionState());
  return (
    <div className="pane settings-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
        <h1 className="pane-title"><span>Settings</span></h1>
      </div>
      <div className="settings-scroll">
        <SyncSettings />
        <Section icon="palette" title="Appearance">
          <Row label="Theme"><Segmented small value={p.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></Row>
          <Row label="Accent color">
            <div className="color-picker">{Object.entries(ACCENTS).map(([k, c]) => <button key={k} className={'swatch' + (p.accent === k ? ' sel' : '')} style={{ background: c }} onClick={() => set({ accent: k })} aria-label={k} />)}</div>
          </Row>
          <Row label="Compact rows"><Switch checked={!!p.compact} onChange={(v) => set({ compact: v })} /></Row>
          <Row label="Text size"><Segmented small value={p.fontScale || 1} onChange={(v) => set({ fontScale: v })} options={[{ value: 0.92, label: 'Small' }, { value: 1, label: 'Default' }, { value: 1.1, label: 'Large' }]} /></Row>
        </Section>
        <Section icon="calendar" title="Date & time">
          <Row label="Start week on"><Segmented small value={p.weekStart} onChange={(v) => set({ weekStart: v })} options={[{ value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }]} /></Row>
          <Row label="Time format"><Segmented small value={p.h24 ? 24 : 12} onChange={(v) => set({ h24: v === 24 })} options={[{ value: 12, label: '12-hour' }, { value: 24, label: '24-hour' }]} /></Row>
          <Row label="Numeric dates" hint="How 5/11 is read in quick add"><Segmented small value={p.dateOrder} onChange={(v) => set({ dateOrder: v })} options={[{ value: 'dmy', label: 'Day/Month' }, { value: 'mdy', label: 'Month/Day' }]} /></Row>
        </Section>
        <Section icon="checkSquare" title="Tasks">
          <Row label="Default list for new tasks">
            <select className="input" value={p.defaultListId} onChange={(e) => set({ defaultListId: e.target.value })}>
              {activeLists().sort((a, b) => (a.id === INBOX ? -1 : a.order - b.order)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Row>
          <Row label="Smart date recognition" hint='Detects "tomorrow 5pm", "every monday", #tags, !high, ~list'><Switch checked={p.smartParse} onChange={(v) => set({ smartParse: v })} /></Row>
          <Row label="Keep recognised date text in title"><Switch checked={!!p.keepParsedText} onChange={(v) => set({ keepParsedText: v })} /></Row>
          <Row label="Add new tasks to"><Segmented small value={p.newTaskPosition} onChange={(v) => set({ newTaskPosition: v })} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} /></Row>
          <Row label="Default reminder" hint="Applied to new tasks that get a date">
            <select className="input" value={String(p.defaultReminders?.[0] ?? '')} onChange={(e) => set({ defaultReminders: e.target.value === '' ? [] : [Number(e.target.value)] })}>
              <option value="">None</option><option value="0">On time / on the day</option><option value="5">5 minutes early</option><option value="30">30 minutes early</option><option value="60">1 hour early</option><option value="1440">1 day early</option>
            </select>
          </Row>
          <Row label="All-day reminder time"><input className="input time" type="time" value={p.allDayReminder} onChange={(e) => e.target.value && set({ allDayReminder: e.target.value })} /></Row>
          <Row label="Show completed tasks in lists"><Switch checked={p.showCompleted} onChange={(v) => set({ showCompleted: v })} /></Row>
          <Row label="Completion sound"><Switch checked={p.sound} onChange={(v) => set({ sound: v })} /></Row>
        </Section>
        <Section icon="all" title="Smart lists">
          {Object.entries(SMART).map(([k, v]) => <Row key={k} label={v.name}><Switch checked={p.smartLists[k] !== false} onChange={(on) => set({ smartLists: { ...p.smartLists, [k]: on } })} /></Row>)}
        </Section>
        <Section icon="bell" title="Notifications">
          <Row label="Reminders" hint={isNative() ? 'Uses Android notifications, even when the app is closed' : 'Browser notifications appear while Taskday is open in a tab or installed as an app'}>
            <Switch checked={p.notify} onChange={(v) => set({ notify: v })} />
          </Row>
          {!isNative() && (
            <Row label="Permission" hint={perm === 'denied' ? 'Blocked — allow notifications for this site in your browser settings' : perm === 'unsupported' ? 'Not supported in this browser' : ''}>
              {perm === 'granted' ? <span className="ok-text"><Icon name="check" size={14} /> Allowed</span> : <button className="btn sm" onClick={async () => { await requestNotifyPermission(); setPerm(notifyPermissionState()); }}>Allow notifications</button>}
            </Row>
          )}
          {isNative() && <Row label="Permission"><button className="btn sm" onClick={async () => { const ok = await requestNotifyPermission(); toast(ok ? 'Notifications allowed' : 'Notifications not allowed'); }}>Request permission</button></Row>}
          <Row label="Daily reminder" hint="A morning notification with how many tasks are due today">
            <input className="input time" type="time" value={p.dailyReminder || ''} onChange={(e) => set({ dailyReminder: e.target.value })} />
            {p.dailyReminder && <button className="btn sm" onClick={() => set({ dailyReminder: '' })}>Off</button>}
          </Row>
          <Row label="Test"><button className="btn sm" onClick={() => { showSystemNotification('Taskday', 'Notifications are working'); toast('Test notification sent'); }}>Send test</button></Row>
        </Section>
        <DataSettings />
        <Section icon="keyboard" title="Keyboard shortcuts">
          <div className="shortcuts">
            {[['N', 'New task'], ['/  or  Ctrl+K', 'Search'], ['Esc', 'Close panel / clear selection'], ['Alt+1 … Alt+7', 'Tasks, Calendar, Habit, Focus, Countdown, Stats, Search'], ['Ctrl+Z', 'Undo last action'], ['Delete', 'Delete open task'], ['Ctrl+Enter', 'Complete open task'], ['Shift/Ctrl + click', 'Select multiple tasks'], ['Tab / Shift+Tab', 'Indent / outdent open task']].map(([k, d]) => <div key={k} className="sc-row"><kbd>{k}</kbd><span>{d}</span></div>)}
          </div>
        </Section>
        <Section icon="info" title="About">
          <p className="muted small">Taskday {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''} — your data lives on this device and in your sync folder. No accounts, no servers.</p>
        </Section>
      </div>
    </div>
  );
}

function SyncSettings() {
  const st = useSync();
  const [path, setPath] = useState(st.path);
  const [name, setName] = useState(Sync.deviceName());
  const native = isNative();
  const web = Sync.webFolderSupported();
  const status = { idle: 'Not synced yet', syncing: 'Syncing…', ok: 'Up to date', error: 'Error', perm: 'Needs permission' }[st.status];
  return (
    <Section icon="sync" title="Sync (Syncthing)">
      <p className="set-explain">
        Taskday keeps a file named <code>taskday-{Sync.deviceId()}.json</code> in a folder you choose, and reads the files your other devices write there.
        Share that folder with <b>Syncthing</b> between your phone and computer. Every device only writes its own file, so Syncthing never reports conflicts; edits are merged automatically (newest change wins per task).
      </p>
      <Row label="This device's name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => Sync.setDeviceName(name)} /></Row>
      {st.mode !== 'off' && (
        <Row label="Status" hint={st.error || (st.lastSync ? `Last sync ${fmtFullDate(st.lastSync)}, ${fmtTime(st.lastSync)}` : '')}>
          <span className={'sync-status ' + st.status}>{status}</span>
          {st.status === 'perm' && st.mode === 'web' ? <button className="btn sm btn-primary" onClick={() => Sync.syncNow({ interactive: true, force: true })}>Reconnect folder</button>
            : <button className="btn sm" onClick={() => Sync.syncNow({ interactive: true, force: true })}>Sync now</button>}
        </Row>
      )}
      {native ? (
        <>
          <Row label="Sync folder path" hint="Point a Syncthing folder at this path (create it in Syncthing with the same path).">
            <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} />
          </Row>
          <Row label="">
            <button className="btn sm" onClick={async () => { try { await Storage.request(); } catch (e) { toast(e.message || String(e)); } }}>1. Allow file access</button>
            <button className="btn sm btn-primary" onClick={() => Sync.setupAndroid(path.replace(/\/+$/, ''))}>2. {st.mode === 'android' ? 'Save & sync' : 'Turn on sync'}</button>
            {st.mode !== 'off' && <button className="btn sm" onClick={Sync.disableSync}>Turn off</button>}
          </Row>
        </>
      ) : web ? (
        <Row label="Sync folder" hint={st.mode === 'web' ? `Using folder "${st.folderName}". Chrome/Edge will ask you to re-allow access after restarting the browser.` : 'Choose the folder Syncthing shares on this computer (Chrome, Edge, Brave, Opera).'}>
          <button className="btn sm btn-primary" onClick={() => Sync.chooseWebFolder().catch((e) => e.name !== 'AbortError' && toast(e.message))}>{st.mode === 'web' ? 'Change folder' : 'Choose folder'}</button>
          {st.mode !== 'off' && <button className="btn sm" onClick={Sync.disableSync}>Turn off</button>}
        </Row>
      ) : (
        <p className="set-explain warn">This browser can't access folders directly (Firefox/Safari). Use Chrome or Edge for automatic folder sync, or use the manual sync file below.</p>
      )}
      {st.devices?.length > 0 && (
        <Row label="Other devices seen">
          <div className="devices">{st.devices.map((d) => <div key={d.file} className="device"><Icon name="sync" size={13} /> {d.name || d.file}{d.savedAt ? <span className="muted"> · {fmtFullDate(d.savedAt)} {fmtTime(d.savedAt)}</span> : null}</div>)}</div>
        </Row>
      )}
      <Row label="Manual sync file" hint="Works in any browser: save this device's file into the sync folder, or merge a file from another device.">
        <button className="btn sm" onClick={() => saveFile(`taskday-${Sync.deviceId()}.json`, Sync.buildSyncFile())}><Icon name="download" size={14} /> Save</button>
        <button className="btn sm" onClick={async () => { const t = await pickFile('.json,application/json'); if (!t) return; try { const ch = Sync.mergeSyncText(t); toast(ch ? 'Merged changes' : 'Already up to date'); } catch (e) { toast(e.message); } }}><Icon name="upload" size={14} /> Merge</button>
      </Row>
    </Section>
  );
}

function DataSettings() {
  return (
    <Section icon="database" title="Data">
      <Row label="Backup" hint="Everything: tasks, lists, habits, focus records, countdowns, settings">
        <button className="btn sm" onClick={() => saveFile(`taskday-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'taskday', v: 1, kind: 'backup', savedAt: Date.now(), db: S.exportDB() }, null, 1))}><Icon name="download" size={14} /> Export</button>
        <button className="btn sm" onClick={async () => {
          const t = await pickFile('.json,application/json'); if (!t) return;
          try {
            const data = JSON.parse(t); if (!data.db) throw new Error('Not a Taskday backup');
            const replace = await confirmDialog('Choose OK to replace all current data with the backup, or Cancel to merge it into your current data.', { title: 'Restore backup', ok: 'Replace all' });
            if (replace) S.replaceAll(data.db); else S.mergeRemote(data.db);
            toast('Backup restored');
          } catch (e) { toast('Import failed: ' + e.message); }
        }}><Icon name="upload" size={14} /> Restore</button>
      </Row>
      <Row label="Import from TickTick" hint="In TickTick: Settings → Account → Backup & Restore → Generate backup (.csv). Notes are skipped.">
        <button className="btn sm" onClick={async () => {
          const t = await pickFile('.csv,text/csv'); if (!t) return;
          try { const r = importTickTickCSV(t); toast(`Imported ${r.count} tasks${r.skippedNotes ? `, skipped ${r.skippedNotes} notes` : ''}`); } catch (e) { toast('Import failed: ' + e.message); }
        }}><Icon name="upload" size={14} /> Import CSV</button>
      </Row>
      <Row label="Export tasks as CSV">
        <button className="btn sm" onClick={() => {
          const db = S.getDB();
          const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const lines = [['List', 'Title', 'Description', 'Status', 'Priority', 'Due', 'Tags', 'Completed'].map(esc).join(',')];
          for (const t of all('tasks').filter((x) => !x.trashed)) lines.push([db.lists[t.listId]?.name, t.title, t.content, t.status === 0 ? 'open' : t.status === 2 ? 'done' : "won't do", t.priority, t.dueAt ? new Date(t.dueAt).toISOString() : '', (t.tags || []).join(' '), t.completedAt ? new Date(t.completedAt).toISOString() : ''].map(esc).join(','));
          saveFile('taskday-tasks.csv', lines.join('\n'), 'text/csv');
        }}><Icon name="download" size={14} /> Export CSV</button>
      </Row>
      <Row label="Erase everything" hint="Deletes all data on this device. Synced devices will also delete it on their next sync.">
        <button className="btn sm btn-danger" onClick={async () => {
          if (!(await confirmDialog('This removes all tasks, lists, habits, focus records and countdowns. Export a backup first if unsure.', { title: 'Erase all data?', ok: 'Erase', danger: true }))) return;
          S.batch((b) => { for (const c of S.COLLS) if (c !== 'prefs') for (const r of all(c)) if (!(c === 'lists' && r.id === INBOX)) b.remove(c, r.id); });
          toast('All data erased');
        }}>Erase</button>
      </Row>
    </Section>
  );
}
export { useEffect, openMenu };
