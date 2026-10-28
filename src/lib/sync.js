// Folder sync designed for Syncthing.
// Each device writes ONLY its own file `taskday-<deviceId>.json` into the shared folder and
// reads every other device's file, merging record-by-record (newest edit wins).
// Because no two devices ever write the same file, Syncthing never produces conflicts.
import { exportDB, mergeRemote, onChange } from '../store.js';
import { idbGet, idbSet, idbDel } from './idb.js';
import { isNative, Storage } from './native.js';

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };

export function deviceId() {
  let id = LS('taskday.deviceId');
  if (!id) { id = Math.random().toString(36).slice(2, 10); LS('taskday.deviceId', id); }
  return id;
}
export function deviceName() { return LS('taskday.deviceName') || (isNative() ? 'Android phone' : guessBrowser()); }
export function setDeviceName(n) { LS('taskday.deviceName', n); }
function guessBrowser() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Web';
  return `${os} browser`;
}
const ownName = () => `taskday-${deviceId()}.json`;
const isDataFile = (n) => /^taskday-.+\.json$/.test(n) && !n.startsWith('.');

// ---------- state ----------
let state = { mode: LS('taskday.syncMode') || 'off', status: 'idle', lastSync: Number(LS('taskday.lastSync')) || 0, error: '', path: LS('taskday.syncPath') || '/storage/emulated/0/Taskday', folderName: LS('taskday.syncFolderName') || '', devices: [] };
const subs = new Set();
function set(p) { state = { ...state, ...p }; subs.forEach((f) => f(state)); }
export function getSyncState() { return state; }
export function subscribeSync(fn) { subs.add(fn); return () => subs.delete(fn); }
export const webFolderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ---------- adapters ----------
let dirHandle = null;
const webAdapter = {
  async ready(interactive) {
    if (!dirHandle) { try { dirHandle = await idbGet('syncDir'); } catch { dirHandle = null; } }
    if (!dirHandle) throw new Error('No folder chosen');
    let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && interactive) perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { const e = new Error('Permission needed'); e.code = 'perm'; throw e; }
  },
  async list() {
    const out = [];
    for await (const [name, h] of dirHandle.entries()) {
      if (h.kind !== 'file' || !isDataFile(name)) continue;
      const f = await h.getFile();
      out.push({ name, mtime: f.lastModified, size: f.size });
    }
    return out;
  },
  async read(name) { const h = await dirHandle.getFileHandle(name); return (await h.getFile()).text(); },
  async write(name, text) {
    const h = await dirHandle.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  },
};
const androidAdapter = {
  async ready(interactive) {
    const r = await Storage.check();
    if (!r.granted) {
      if (interactive) await Storage.request();
      const e = new Error('Allow "All files access" for Taskday, then tap Sync now'); e.code = 'perm'; throw e;
    }
    await Storage.mkdir(state.path);
  },
  async list() {
    const r = await Storage.list(state.path);
    return (r.files || []).filter((f) => isDataFile(f.name)).map((f) => ({ name: f.name, mtime: f.mtime, size: f.size }));
  },
  async read(name) { return (await Storage.read(state.path + '/' + name)).data; },
  async write(name, text) { await Storage.write(state.path + '/' + name, text); },
};
const adapter = () => (state.mode === 'web' ? webAdapter : state.mode === 'android' ? androidAdapter : null);

// ---------- engine ----------
let seen = {};
let lastHash = LS('taskday.lastHash') || '';
let running = false;
let pending = false;
let writeTimer = null;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }

export async function syncNow({ interactive = false, force = false } = {}) {
  const a = adapter();
  if (!a) return;
  if (running) { pending = true; return; }
  running = true;
  set({ status: 'syncing', error: '' });
  try {
    await a.ready(interactive);
    const files = await a.list();
    const devices = [];
    for (const f of files) {
      if (f.name === ownName()) continue;
      let info = { file: f.name, mtime: f.mtime };
      if (force || seen[f.name] !== f.mtime + ':' + f.size) {
        try {
          const data = JSON.parse(await a.read(f.name));
          if (data && data.db) mergeRemote(data.db);
          seen[f.name] = f.mtime + ':' + f.size;
          info.name = data.deviceName; info.savedAt = data.savedAt;
          LS('taskday.dev.' + f.name, JSON.stringify({ name: data.deviceName, savedAt: data.savedAt }));
        } catch (e) { console.warn('Skipping unreadable sync file', f.name, e); info.error = true; }
      } else {
        try { Object.assign(info, JSON.parse(LS('taskday.dev.' + f.name) || '{}')); } catch { /* ignore */ }
      }
      devices.push(info);
    }
    await writeOwn(a, force);
    const t = Date.now();
    LS('taskday.lastSync', String(t));
    set({ status: 'ok', lastSync: t, devices });
  } catch (e) {
    console.warn('sync failed', e);
    set({ status: e.code === 'perm' ? 'perm' : 'error', error: e.message || String(e) });
  } finally {
    running = false;
    if (pending) { pending = false; setTimeout(() => syncNow(), 200); }
  }
}

async function writeOwn(a, force) {
  const db = exportDB();
  const body = JSON.stringify(db);
  const h = hash(body);
  if (!force && h === lastHash) return;
  const text = `{"app":"taskday","v":1,"deviceId":${JSON.stringify(deviceId())},"deviceName":${JSON.stringify(deviceName())},"savedAt":${Date.now()},"db":${body}}`;
  await a.write(ownName(), text);
  lastHash = h;
  LS('taskday.lastHash', h);
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  onChange((local) => {
    if (!local || state.mode === 'off') return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => syncNow(), 1500);
  });
  setInterval(() => { if (state.mode !== 'off' && document.visibilityState === 'visible') syncNow(); }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (state.mode === 'off') return;
    if (document.visibilityState === 'visible') syncNow();
    else syncNow(); // flush on hide
  });
  if (state.mode !== 'off') setTimeout(() => syncNow(), 500);
}

// ---------- setup ----------
export async function chooseWebFolder() {
  const h = await window.showDirectoryPicker({ id: 'taskday-sync', mode: 'readwrite' });
  dirHandle = h;
  try { await idbSet('syncDir', h); } catch (e) { console.warn('could not remember folder', e); }
  LS('taskday.syncMode', 'web');
  LS('taskday.syncFolderName', h.name);
  seen = {}; lastHash = ''; LS('taskday.lastHash', null);
  set({ mode: 'web', folderName: h.name });
  await syncNow({ interactive: true, force: true });
}
export async function setupAndroid(path) {
  LS('taskday.syncMode', 'android');
  LS('taskday.syncPath', path);
  seen = {}; lastHash = ''; LS('taskday.lastHash', null);
  set({ mode: 'android', path });
  await syncNow({ interactive: true, force: true });
}
export async function disableSync() {
  LS('taskday.syncMode', null);
  try { await idbDel('syncDir'); } catch { /* ignore */ }
  dirHandle = null;
  set({ mode: 'off', status: 'idle', error: '' });
}

// ---------- manual file sync (any browser) ----------
export function buildSyncFile() {
  return JSON.stringify({ app: 'taskday', v: 1, deviceId: deviceId(), deviceName: deviceName(), savedAt: Date.now(), db: exportDB() });
}
export function mergeSyncText(text) {
  const data = JSON.parse(text);
  if (!data || !data.db) throw new Error('Not a Taskday sync/backup file');
  return mergeRemote(data.db);
}
