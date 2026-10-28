import { useState, useMemo } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, usePrefs, all, INBOX } from '../store.js';
import { SMART, tasksForView } from '../lib/query.js';
import { useUI, goView, toggleCollapsed } from '../ui/state.js';
import { openMenu } from '../ui/common.jsx';
import { dropAttr, dragHandlers } from '../lib/dnd.js';
import { today, addDays } from '../lib/date.js';
import { ListDialog, FolderDialog, TagDialog, FilterDialog } from './Dialogs.jsx';

const TOP = ['today', 'tomorrow', 'next7', 'inbox', 'all'];
const BOTTOM = ['completed', 'wontdo', 'summary', 'trash'];

export function Sidebar() {
  const db = useDB();
  const prefs = usePrefs();
  const ui = useUI();
  const [dialog, setDialog] = useState(null);
  const counts = useMemo(() => {
    const c = {};
    for (const id of ['today', 'tomorrow', 'next7', 'inbox', 'all']) c['smart:' + id] = tasksForView('smart:' + id).open.length;
    for (const l of all('lists')) c['list:' + l.id] = tasksForView('list:' + l.id).open.length;
    for (const f of all('filters')) c['filter:' + f.id] = tasksForView('filter:' + f.id).open.length;
    for (const t of all('tags')) c['tag:' + t.name] = tasksForView('tag:' + t.name).open.length;
    return c;
  }, [db]);
  const lists = all('lists').filter((l) => l.id !== INBOX).sort((a, b) => a.order - b.order);
  const folders = all('folders').sort((a, b) => a.order - b.order);
  const filters = all('filters').sort((a, b) => a.order - b.order);
  const tags = all('tags').sort((a, b) => a.name.localeCompare(b.name));
  const active = lists.filter((l) => !l.archived);
  const archived = lists.filter((l) => l.archived);
  const smartDrop = { today: { type: 'day', day: today() }, tomorrow: { type: 'day', day: addDays(today(), 1) }, next7: { type: 'day', day: today() }, inbox: { type: 'list', id: INBOX }, trash: { type: 'trash' }, completed: { type: 'complete' }, wontdo: { type: 'wontdo' } };

  const Item = ({ view, icon, label, color, emoji, drop, onMenu, indent, drag, count }) => (
    <div className={'side-item' + (ui.view === view && ui.section === 'tasks' ? ' active' : '') + (indent ? ' indent' : '')}
      onClick={() => goView(view)} {...(drop ? dropAttr(drop) : {})} {...(drag || {})}
      onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(e); } : undefined} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && goView(view)}>
      <span className="side-icon" style={color ? { color } : undefined}>{emoji ? <span className="side-emoji">{emoji}</span> : <Icon name={icon} size={18} />}</span>
      <span className="side-label">{label}</span>
      {onMenu && <button className="icon-btn sm side-more" onClick={(e) => { e.stopPropagation(); onMenu(e); }} aria-label="More"><Icon name="more" size={15} /></button>}
      <span className="side-count">{count || ''}</span>
    </div>
  );
  const listItem = (l, indent) => (
    <Item key={l.id} view={'list:' + l.id} icon="list" label={l.name} color={l.color} emoji={l.emoji} indent={indent} count={counts['list:' + l.id]}
      drop={{ type: 'list', id: l.id }} drag={dragHandlers({ type: 'list', id: l.id }, l.name)}
      onMenu={(e) => openMenu(e.currentTarget.closest('.side-item') || e.currentTarget, [
        { label: 'Edit', icon: 'edit', onClick: () => setDialog({ kind: 'list', item: l }) },
        { label: 'Move to folder', icon: 'folder', submenu: [{ label: 'None', checked: !l.folderId, onClick: () => S.patch('lists', l.id, { folderId: null }) }, ...folders.map((f) => ({ label: f.name, checked: l.folderId === f.id, onClick: () => S.patch('lists', l.id, { folderId: f.id }) }))] },
        { label: l.archived ? 'Unarchive' : 'Archive', icon: 'archive', onClick: () => S.patch('lists', l.id, { archived: !l.archived }) },
        { label: 'Duplicate list', icon: 'copy', onClick: () => { const nl = S.createList({ name: l.name + ' copy', color: l.color, emoji: l.emoji, folderId: l.folderId, view: l.view }); S.batch((b) => { for (const t of all('tasks')) if (t.listId === l.id && t.status === 0 && !t.trashed && !t.parentId) b.put('tasks', { ...t, id: S.uid(), listId: nl.id, sectionId: null, createdAt: null }); }); } },
        '-',
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDialog({ kind: 'list', item: l }) },
      ])} />
  );

  return (
    <nav className="sidebar" aria-label="Lists">
      <div className="side-scroll">
        {TOP.filter((id) => prefs.smartLists[id] !== false).map((id) => (
          <Item key={id} view={'smart:' + id} icon={SMART[id].icon} label={SMART[id].name} drop={smartDrop[id]} count={counts['smart:' + id]} />
        ))}
        <div className="side-sep" />
        <div className="side-head" onClick={() => toggleCollapsed('side:lists')}>
          <Icon name={ui.collapsed['side:lists'] ? 'chevronRight' : 'chevronDown'} size={12} /><span>Lists</span>
          <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); openMenu(e.currentTarget, [{ label: 'Add list', icon: 'list', onClick: () => setDialog({ kind: 'list', item: {} }) }, { label: 'Add folder', icon: 'folder', onClick: () => setDialog({ kind: 'folder', item: {} }) }]); }} aria-label="Add list"><Icon name="plus" size={15} /></button>
        </div>
        {!ui.collapsed['side:lists'] && <>
          {folders.map((f) => {
            const inF = active.filter((l) => l.folderId === f.id);
            const key = 'folder:' + f.id;
            return (
              <div key={f.id}>
                <div className="side-item folder" onClick={() => toggleCollapsed(key)} {...dropAttr({ type: 'folder', id: f.id })}>
                  <span className="side-icon"><Icon name={ui.collapsed[key] ? 'chevronRight' : 'chevronDown'} size={14} /></span>
                  <Icon name="folder" size={16} className="folder-ico" />
                  <span className="side-label">{f.name}</span>
                  <button className="icon-btn sm side-more" onClick={(e) => { e.stopPropagation(); setDialog({ kind: 'folder', item: f }); }}><Icon name="more" size={15} /></button>
                  <span className="side-count">{inF.reduce((n, l) => n + (counts['list:' + l.id] || 0), 0) || ''}</span>
                </div>
                {!ui.collapsed[key] && inF.map((l) => listItem(l, true))}
              </div>
            );
          })}
          {active.filter((l) => !l.folderId || !db.folders[l.folderId] || db.folders[l.folderId]._del).map((l) => listItem(l, false))}
          {!active.length && !folders.length && <button className="side-empty" onClick={() => setDialog({ kind: 'list', item: {} })}>+ Add your first list</button>}
        </>}
        <div className="side-head" onClick={() => toggleCollapsed('side:filters')}>
          <Icon name={ui.collapsed['side:filters'] ? 'chevronRight' : 'chevronDown'} size={12} /><span>Filters</span>
          <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); setDialog({ kind: 'filter', item: {} }); }} aria-label="Add filter"><Icon name="plus" size={15} /></button>
        </div>
        {!ui.collapsed['side:filters'] && filters.map((f) => <Item key={f.id} view={'filter:' + f.id} icon="filter" label={f.name} count={counts['filter:' + f.id]} onMenu={() => setDialog({ kind: 'filter', item: f })} />)}
        {!ui.collapsed['side:filters'] && !filters.length && <div className="side-hint">Combine lists, tags, dates and priorities</div>}
        <div className="side-head" onClick={() => toggleCollapsed('side:tags')}>
          <Icon name={ui.collapsed['side:tags'] ? 'chevronRight' : 'chevronDown'} size={12} /><span>Tags</span>
          <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); setDialog({ kind: 'tag', item: {} }); }} aria-label="Add tag"><Icon name="plus" size={15} /></button>
        </div>
        {!ui.collapsed['side:tags'] && tags.filter((t) => !t.parent || !tags.some((p) => p.name === t.parent)).map((t) => (
          <div key={t.id}>
            <Item view={'tag:' + t.name} icon="tag" label={t.name} color={t.color} count={counts['tag:' + t.name]} drop={{ type: 'tag', name: t.name }} onMenu={() => setDialog({ kind: 'tag', item: t })} />
            {tags.filter((c) => c.parent === t.name).map((c) => <Item key={c.id} view={'tag:' + c.name} icon="tag" label={c.name} color={c.color} indent count={counts['tag:' + c.name]} drop={{ type: 'tag', name: c.name }} onMenu={() => setDialog({ kind: 'tag', item: c })} />)}
          </div>
        ))}
        <div className="side-sep" />
        {BOTTOM.filter((id) => prefs.smartLists[id] !== false).map((id) => <Item key={id} view={'smart:' + id} icon={SMART[id].icon} label={SMART[id].name} drop={smartDrop[id]} />)}
        {archived.length > 0 && <>
          <div className="side-head" onClick={() => toggleCollapsed('side:archived')}>
            <Icon name={ui.collapsed['side:archived'] === false ? 'chevronDown' : 'chevronRight'} size={12} /><span>Archived lists</span>
          </div>
          {ui.collapsed['side:archived'] === false && archived.map((l) => listItem(l, false))}
        </>}
      </div>
      {dialog?.kind === 'list' && <ListDialog list={dialog.item} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'folder' && <FolderDialog folder={dialog.item} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'tag' && <TagDialog tag={dialog.item} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'filter' && <FilterDialog filter={dialog.item} onClose={() => setDialog(null)} />}
    </nav>
  );
}
