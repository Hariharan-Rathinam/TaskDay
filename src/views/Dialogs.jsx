import { useState } from 'react';
import * as S from '../store.js';
import { all, INBOX } from '../store.js';
import { Modal, Field, ColorPicker, EmojiPicker, Segmented, Switch, confirmDialog } from '../ui/common.jsx';
import { activeLists, tasksForView, PRIORITY } from '../lib/query.js';
import { goView } from '../ui/state.js';

export function ListDialog({ list, onClose }) {
  const isNew = !list?.id;
  const [name, setName] = useState(list?.name || '');
  const [color, setColor] = useState(list?.color || null);
  const [emoji, setEmoji] = useState(list?.emoji || '');
  const [folderId, setFolderId] = useState(list?.folderId || '');
  const [view, setView] = useState(list?.view || 'list');
  const [hideInSmart, setHideInSmart] = useState(!!list?.hideInSmart);
  const folders = all('folders').sort((a, b) => a.order - b.order);
  const save = () => {
    if (!name.trim()) return;
    const fields = { name: name.trim(), color, emoji, folderId: folderId || null, view, hideInSmart };
    if (isNew) { const l = S.createList(fields); goView('list:' + l.id); } else S.patch('lists', list.id, fields);
    onClose();
  };
  const isInbox = list?.id === INBOX;
  return (
    <Modal title={isNew ? 'Add list' : 'Edit list'} onClose={onClose}
      footer={<>
        {!isNew && !isInbox && <button className="btn btn-danger-text" onClick={async () => { if (await confirmDialog('Its tasks will move to Trash.', { title: `Delete list "${list.name}"?`, ok: 'Delete', danger: true })) { S.deleteList(list.id); goView('smart:today'); onClose(); } }}>Delete</button>}
        {!isNew && !isInbox && <button className="btn" onClick={() => { S.patch('lists', list.id, { archived: !list.archived }); onClose(); }}>{list.archived ? 'Unarchive' : 'Archive'}</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>Save</button>
      </>}>
      <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="List name" disabled={isInbox} /></Field>
      <Field label="Icon"><EmojiPicker value={emoji} onChange={setEmoji} /></Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
      {!isInbox && <Field label="Folder">
        <select className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">None</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>}
      <Field label="View"><Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List', icon: 'list' }, { value: 'kanban', label: 'Kanban', icon: 'kanban' }, { value: 'timeline', label: 'Timeline', icon: 'timeline' }]} /></Field>
      {!isInbox && <Switch label="Show tasks in smart lists (Today, Next 7 Days, All…)" checked={!hideInSmart} onChange={(v) => setHideInSmart(!v)} />}
    </Modal>
  );
}

export function FolderDialog({ folder, onClose }) {
  const [name, setName] = useState(folder?.name || '');
  const isNew = !folder?.id;
  const save = () => {
    if (!name.trim()) return;
    if (isNew) S.put('folders', { id: S.uid(), name: name.trim(), order: all('folders').length });
    else S.patch('folders', folder.id, { name: name.trim() });
    onClose();
  };
  return (
    <Modal title={isNew ? 'Add folder' : 'Edit folder'} onClose={onClose} width={380}
      footer={<>
        {!isNew && <button className="btn btn-danger-text" onClick={async () => { if (await confirmDialog('Lists inside will be kept.', { title: `Delete folder "${folder.name}"?`, ok: 'Delete', danger: true })) { S.deleteFolder(folder.id); onClose(); } }}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>}>
      <Field label="Folder name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
      {isNew && <p className="muted small">Group lists into a folder from each list's Edit dialog, or drag a list onto the folder.</p>}
    </Modal>
  );
}

export function TagDialog({ tag, onClose }) {
  const isNew = !tag?.id;
  const [name, setName] = useState(tag?.name || '');
  const [color, setColor] = useState(tag?.color || null);
  const [parent, setParent] = useState(tag?.parent || '');
  const others = all('tags').filter((t) => t.id !== tag?.id && !t.parent);
  const save = () => {
    const n = name.trim().replace(/^#/, '').toLowerCase();
    if (!n) return;
    if (isNew) { const t = S.ensureTag(n); S.patch('tags', t.id, { color, parent: parent || null }); }
    else { if (n !== tag.name) S.renameTag(tag.id, n); const cur = all('tags').find((t) => t.name === n); if (cur) S.patch('tags', cur.id, { color, parent: parent || null }); }
    onClose();
  };
  return (
    <Modal title={isNew ? 'Add tag' : 'Edit tag'} onClose={onClose} width={400}
      footer={<>
        {!isNew && <button className="btn btn-danger-text" onClick={async () => { if (await confirmDialog('The tag will be removed from all tasks.', { title: `Delete #${tag.name}?`, ok: 'Delete', danger: true })) { S.deleteTag(tag.id); goView('smart:today'); onClose(); } }}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>}>
      <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="tag" /></Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
      <Field label="Parent tag">
        <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">None</option>
          {others.map((t) => <option key={t.id} value={t.name}>#{t.name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

const DATE_RULES = [['overdue', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['thisweek', 'This week'], ['next7', 'Next 7 days'], ['thismonth', 'This month'], ['nodate', 'No date'], ['hasdate', 'Has date']];
export function FilterDialog({ filter, onClose }) {
  const isNew = !filter?.id;
  const [name, setName] = useState(filter?.name || '');
  const [rules, setRules] = useState(filter?.rules || { lists: [], tags: [], priorities: [], dates: [], keyword: '' });
  const toggle = (k, v) => setRules((r) => ({ ...r, [k]: r[k]?.includes(v) ? r[k].filter((x) => x !== v) : [...(r[k] || []), v] }));
  const tags = all('tags').sort((a, b) => a.name.localeCompare(b.name));
  const save = () => {
    if (!name.trim()) return;
    if (isNew) { const id = S.uid(); S.put('filters', { id, name: name.trim(), rules, order: all('filters').length }); goView('filter:' + id); }
    else S.patch('filters', filter.id, { name: name.trim(), rules });
    onClose();
  };
  // live preview count
  const tmpId = '__preview';
  S.getDB().filters[tmpId] = { id: tmpId, rules };
  const count = tasksForView('filter:' + tmpId).open.length;
  delete S.getDB().filters[tmpId];
  return (
    <Modal title={isNew ? 'Add filter' : 'Edit filter'} onClose={onClose} width={520}
      footer={<>
        {!isNew && <button className="btn btn-danger-text" onClick={async () => { if (await confirmDialog('Tasks are not affected.', { title: `Delete filter "${filter.name}"?`, ok: 'Delete', danger: true })) { S.remove('filters', filter.id); goView('smart:today'); onClose(); } }}>Delete</button>}
        <span className="spacer muted small">{count} matching tasks</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>Save</button>
      </>}>
      <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Urgent work" /></Field>
      <Field label="Lists" hint="Any of the selected lists (none selected = all lists)">
        <div className="chips">{activeLists().map((l) => <button key={l.id} className={'chip' + (rules.lists?.includes(l.id) ? ' on' : '')} onClick={() => toggle('lists', l.id)}>{l.emoji} {l.name}</button>)}</div>
      </Field>
      <Field label="Tags">
        <div className="chips">
          {tags.map((t) => <button key={t.id} className={'chip' + (rules.tags?.includes(t.name) ? ' on' : '')} onClick={() => toggle('tags', t.name)}>#{t.name}</button>)}
          <button className={'chip' + (rules.tags?.includes('__none__') ? ' on' : '')} onClick={() => toggle('tags', '__none__')}>No tags</button>
        </div>
      </Field>
      <Field label="Date">
        <div className="chips">{DATE_RULES.map(([v, l]) => <button key={v} className={'chip' + (rules.dates?.includes(v) ? ' on' : '')} onClick={() => toggle('dates', v)}>{l}</button>)}</div>
      </Field>
      <Field label="Priority">
        <div className="chips">{[5, 3, 1, 0].map((p) => <button key={p} className={'chip' + (rules.priorities?.includes(p) ? ' on' : '')} onClick={() => toggle('priorities', p)} style={{ '--chip-c': PRIORITY[p].color }}>{PRIORITY[p].name}</button>)}</div>
      </Field>
      <Field label="Contains text"><input className="input" value={rules.keyword || ''} onChange={(e) => setRules({ ...rules, keyword: e.target.value })} placeholder="Keyword in title or description" /></Field>
    </Modal>
  );
}
