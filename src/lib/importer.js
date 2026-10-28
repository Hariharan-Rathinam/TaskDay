// Import a TickTick CSV backup (Settings → Account → Generate backup in TickTick).
// Notes (Kind = NOTE) are skipped.
import * as S from '../store.js';
import { fromRRule } from './repeat.js';
import { startOfDay } from './date.js';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(s) {
  if (!s) return null;
  const fixed = s.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(fixed);
  return isNaN(t) ? null : t;
}
function parseReminders(s, allDay) {
  if (!s) return [];
  const out = [];
  for (const part of s.split(',')) {
    const m = part.replace('TRIGGER:', '').trim().match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) continue;
    let min = (Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 1440 + Number(m[4] || 0) * 60 + Number(m[5] || 0);
    if (!m[1] && allDay) { // all-day reminders are expressed as an offset from midnight, e.g. PT9H = on the day at 9:00
      min = 0;
    } else if (allDay && m[1]) {
      // e.g. -P0DT15H = 1 day early at 9:00 → round up to whole days
      min = Math.ceil(min / 1440) * 1440;
    }
    out.push(min);
  }
  return [...new Set(out)];
}

export function importTickTickCSV(text) {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  const hi = rows.findIndex((r) => r.includes('Title') && (r.includes('List Name') || r.includes('Folder Name')));
  if (hi < 0) throw new Error('This does not look like a TickTick backup CSV');
  const H = rows[hi];
  const col = (r, name) => { const i = H.indexOf(name); return i >= 0 ? (r[i] || '').trim() : ''; };
  const db = S.getDB();
  const listsByName = new Map(S.all('lists').map((l) => [l.name.toLowerCase(), l]));
  const foldersByName = new Map(S.all('folders').map((f) => [f.name.toLowerCase(), f]));
  const sectionKey = (listId, name) => listId + '::' + name.toLowerCase();
  const sections = new Map(S.all('sections').map((s) => [sectionKey(s.listId, s.name), s]));
  const idMap = new Map();
  const pendingParents = [];
  let count = 0, skippedNotes = 0;
  S.batch((b) => {
    for (const r of rows.slice(hi + 1)) {
      if (r.length < 3) continue;
      const title = col(r, 'Title');
      const kind = col(r, 'Kind').toUpperCase();
      if (kind === 'NOTE') { skippedNotes++; continue; }
      if (!title && !col(r, 'Content')) continue;
      // folder + list
      const folderName = col(r, 'Folder Name');
      let folderId = null;
      if (folderName) {
        let f = foldersByName.get(folderName.toLowerCase());
        if (!f) { f = { id: S.uid(), name: folderName, order: foldersByName.size }; b.put('folders', f); foldersByName.set(folderName.toLowerCase(), f); }
        folderId = f.id;
      }
      const listName = col(r, 'List Name') || 'Inbox';
      let list = listName.toLowerCase() === 'inbox' ? db.lists[S.INBOX] : listsByName.get(listName.toLowerCase());
      if (!list) {
        list = { id: S.uid(), name: listName, color: null, emoji: '', view: (col(r, 'View Mode') || 'list').toLowerCase() === 'kanban' ? 'kanban' : 'list', order: listsByName.size + 1, folderId };
        b.put('lists', list); listsByName.set(listName.toLowerCase(), list);
      }
      let sectionId = null;
      const colName = col(r, 'Column Name');
      if (colName && list.id !== S.INBOX) {
        const k = sectionKey(list.id, colName);
        let s = sections.get(k);
        if (!s) { s = { id: S.uid(), listId: list.id, name: colName, order: Number(col(r, 'Column Order')) || sections.size }; b.put('sections', s); sections.set(k, s); }
        sectionId = s.id;
      }
      const allDay = col(r, 'Is All Day').toLowerCase() === 'true';
      let dueAt = parseDate(col(r, 'Due Date'));
      let startAt = parseDate(col(r, 'Start Date'));
      if (allDay) { if (dueAt) dueAt = startOfDay(dueAt); if (startAt) startAt = startOfDay(startAt); }
      if (!dueAt && startAt) { dueAt = startAt; startAt = null; }
      if (startAt && dueAt && startAt === dueAt) startAt = null;
      if (allDay && startAt && dueAt && dueAt > startAt) dueAt = startOfDay(dueAt - 1); // TickTick end date is exclusive for all-day ranges
      const statusRaw = col(r, 'Status');
      const status = statusRaw === '0' ? 0 : statusRaw === '-1' ? -1 : 2;
      let content = col(r, 'Content');
      let checklist = [];
      if (kind === 'CHECKLIST' || col(r, 'Is Check list').toUpperCase() === 'Y') {
        const lines = content.split('\n');
        const rest = [];
        for (const ln of lines) {
          const m = ln.match(/^\s*(▫|▪|- \[ \]|- \[x\])\s*(.*)$/i);
          if (m) checklist.push({ id: S.uid(), title: m[2], done: m[1] === '▪' || /x/i.test(m[1]) });
          else if (ln.trim()) rest.push(ln);
        }
        content = rest.join('\n');
      }
      const tags = col(r, 'Tags').split(',').map((x) => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
      for (const tg of tags) S.ensureTag(tg);
      const id = S.uid();
      const tid = col(r, 'taskId');
      if (tid) idMap.set(tid, id);
      const parent = col(r, 'parentId');
      const createdAt = parseDate(col(r, 'Created Time')) || Date.now();
      const task = {
        id, title, content, listId: list.id, sectionId, priority: Number(col(r, 'Priority')) || 0, status,
        completedAt: status !== 0 ? (parseDate(col(r, 'Completed Time')) || Date.now()) : null,
        dueAt, startAt, allDay: dueAt ? allDay : true, reminders: dueAt ? parseReminders(col(r, 'Reminder'), allDay) : [],
        repeat: dueAt ? fromRRule(col(r, 'Repeat')) : null, tags, checklist, order: Number(col(r, 'Order')) || count * 1024, createdAt,
      };
      b.put('tasks', task);
      if (parent) pendingParents.push([id, parent]);
      count++;
    }
    for (const [id, p] of pendingParents) if (idMap.has(p)) b.patch('tasks', id, { parentId: idMap.get(p) });
  });
  return { count, skippedNotes };
}
