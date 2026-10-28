// Simulates two devices syncing through one shared folder (what Syncthing does), each in its own process.
// Run: node scripts/test-sync.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const role = process.argv[2];
if (!role) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskday-sync-'));
  const run = (dev, step) => JSON.parse(execFileSync(process.execPath, [new URL(import.meta.url).pathname, dev, step, dir], { encoding: 'utf8' }).trim().split('\n').pop());
  let r;
  r = run('A', 'create'); assert.equal(r.count, 2);
  r = run('B', 'edit'); assert.equal(r.titleT1, 'Edited on phone'); assert.equal(r.count, 2);
  r = run('A', 'check'); assert.equal(r.titleT1, 'Edited on phone', 'A sees B title edit'); assert.equal(r.hasT2, false, 'A sees B delete'); assert.equal(r.hasT3, true, 'A sees B new task');
  r = run('B', 'final');          // B catches up first (so both know T3)
  r = run('A', 'conflictA');      // A edits T3 while B is "offline"
  r = run('B', 'conflictB');      // B edits T3 later without having seen A's edit -> newest (B) wins everywhere
  r = run('A', 'final'); assert.equal(r.titleT3, 'B wins');
  r = run('B', 'final'); assert.equal(r.titleT3, 'B wins');
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['taskday-devA.json', 'taskday-devB.json'], 'each device writes only its own file');
  console.log('sync test passed:', files.join(', '));
  process.exit(0);
}

// ----- device process -----
const [, , dev, step, dir] = process.argv;
const ls = new Map([['taskday.deviceId', 'dev' + dev], ['taskday.deviceName', 'Device ' + dev]]);
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
const fileHandle = (f) => ({ kind: 'file', name: path.basename(f),
  async getFile() { const st = fs.statSync(f); return { lastModified: st.mtimeMs, size: st.size, text: async () => fs.readFileSync(f, 'utf8') }; },
  async createWritable() { let buf = ''; return { write: async (t) => { buf += t; }, close: async () => fs.writeFileSync(f, buf) }; } });
const dirHandle = { name: path.basename(dir), kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
  async *entries() { for (const n of fs.readdirSync(dir)) yield [n, fileHandle(path.join(dir, n))]; },
  async getFileHandle(n, o = {}) { const f = path.join(dir, n); if (!fs.existsSync(f) && !o.create) throw new Error('not found'); return fileHandle(f); } };
globalThis.window = { showDirectoryPicker: async () => dirHandle };
globalThis.document = { visibilityState: 'visible', addEventListener() {} };
const S = await import('../src/store.js');
const Sync = await import('../src/lib/sync.js');
S.replaceAll({});
// "persisted local DB": reload this device's own last file if it exists
const own = path.join(dir, `taskday-dev${dev}.json`);
if (fs.existsSync(own)) S.mergeRemote(JSON.parse(fs.readFileSync(own, 'utf8')).db);
const tasks0 = () => S.all('tasks').filter((t) => !t.trashed);
const findT3 = () => tasks0().find((x) => ['T3', 'A version', 'B wins'].includes(x.title));
// offline edits happen BEFORE this device sees the other device's file
if (step === 'conflictA') { await new Promise((r) => setTimeout(r, 5)); S.updateTask(findT3().id, { title: 'A version' }); }
if (step === 'conflictB') { await new Promise((r) => setTimeout(r, 30)); S.updateTask(findT3().id, { title: 'B wins' }); }
await Sync.chooseWebFolder();
const tasks = () => S.all('tasks').filter((t) => !t.trashed);
const byTitle = (t) => tasks().find((x) => x.title === t);
const out = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (step === 'create') {
  for (const t of S.all('tasks')) S.remove('tasks', t.id); // drop seed tasks
  S.createTask({ title: 'T1', id: 'x' }); S.createTask({ title: 'T2' });
}
if (step === 'edit') {
  S.updateTask(byTitle('T1').id, { title: 'Edited on phone' });
  S.trashTasks([byTitle('T2').id]); S.deleteForever([S.all('tasks').find((t) => t.title === 'T2').id]);
  S.createTask({ title: 'T3' });
}
await Sync.syncNow({ force: true });
out.count = tasks().length;
out.titleT1 = (byTitle('Edited on phone') || byTitle('T1'))?.title;
out.hasT2 = !!byTitle('T2'); out.hasT3 = !!(byTitle('T3') || byTitle('A version') || byTitle('B wins'));
out.titleT3 = (byTitle('B wins') || byTitle('A version') || byTitle('T3'))?.title;
out.state = Sync.getSyncState().status;
console.log(JSON.stringify(out));
process.exit(0);
