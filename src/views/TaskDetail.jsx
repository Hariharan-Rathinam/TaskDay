import { useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, all, getDB, INBOX } from '../store.js';
import { Check, dateClass } from '../ui/TaskRow.jsx';
import { DatePicker, reminderLabel } from '../ui/DatePicker.jsx';
import { AutoTextarea, openMenu, useIsMobile, Empty, toast } from '../ui/common.jsx';
import { fmtTaskDate, fmtFullDate, fmtTime, fmtDuration } from '../lib/date.js';
import { describeRepeat } from '../lib/repeat.js';
import { PRIORITY, activeLists, sortTasks } from '../lib/query.js';
import { closeTask, openTask, setUI, goSection } from '../ui/state.js';
import { doTrash, doWontDo, moveMenuItems } from '../ui/actions.js';

function useDebouncedField(value, commit, delay = 500) {
  const [draft, setDraft] = useState(value ?? '');
  const timer = useRef(null);
  const latest = useRef(draft);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) { setDraft(value ?? ''); latest.current = value ?? ''; } }, [value]);
  const flush = () => { clearTimeout(timer.current); if (editing.current) { editing.current = false; if (latest.current !== (value ?? '')) commit(latest.current); } };
  useEffect(() => () => flush(), []); // eslint-disable-line
  return [draft, (v) => { editing.current = true; latest.current = v; setDraft(v); clearTimeout(timer.current); timer.current = setTimeout(() => { editing.current = false; commit(latest.current); }, delay); }, flush];
}

export function TaskDetail({ taskId }) {
  const db = useDB();
  const task = db.tasks[taskId];
  const mobile = useIsMobile();
  const [dpAnchor, setDpAnchor] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [newSub, setNewSub] = useState('');
  const [tagInput, setTagInput] = useState(null);
  const [title, setTitle, flushTitle] = useDebouncedField(task?.title, (v) => S.updateTask(taskId, { title: v }));
  const [content, setContent, flushContent] = useDebouncedField(task?.content, (v) => S.updateTask(taskId, { content: v }));
  const titleRef = useRef(null);
  useEffect(() => { if (task && !task.title && titleRef.current) titleRef.current.focus(); }, [taskId]); // eslint-disable-line

  if (!task || task._del) {
    return <aside className="detail"><Empty icon="checkSquare" title="Select a task to view details" /></aside>;
  }
  const list = db.lists[task.listId];
  const sections = all('sections').filter((s) => s.listId === task.listId).sort((a, b) => a.order - b.order);
  const kids = sortTasks(all('tasks').filter((t) => t.parentId === task.id && !t.trashed), 'manual');
  const parent = task.parentId ? db.tasks[task.parentId] : null;
  const focusSecs = all('focus').filter((f) => f.taskId === task.id).reduce((n, f) => n + (f.duration || 0), 0);
  const ro = !!task.trashed;
  const checklist = task.checklist || [];
  const setChecklist = (cl) => S.updateTask(task.id, { checklist: cl });
  const tagColors = Object.fromEntries(all('tags').map((t) => [t.name, t.color]));

  const more = (e) => openMenu(e.currentTarget, [
    { label: task.pinned ? 'Unpin' : 'Pin', icon: 'pin', onClick: () => S.updateTask(task.id, { pinned: !task.pinned }) },
    { label: 'Start focus', icon: 'pomo', onClick: () => { setUI({ focusTaskId: task.id }); goSection('focus'); } },
    { label: 'Duplicate', icon: 'copy', onClick: () => { const c = S.duplicateTask(task.id); openTask(c.id); toast('Task duplicated'); } },
    { label: 'Copy text', icon: 'copy', onClick: () => navigator.clipboard?.writeText(`${task.title}\n${task.content || ''}\n${checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.title}`).join('\n')}`.trim()).then(() => toast('Copied')) },
    task.parentId ? { label: 'Move out of parent', icon: 'outdent', onClick: () => S.outdentTask(task.id) } : null,
    task.status === 0 ? { label: "Won't Do", icon: 'xCircle', onClick: () => doWontDo(task.id) } : { label: 'Reopen', icon: 'undo', onClick: () => S.uncompleteTask(task.id) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => doTrash([task.id]) },
  ], { align: 'end' });

  const addTag = (name) => {
    const n = name.trim().replace(/^#/, '').toLowerCase();
    if (n) S.updateTask(task.id, { tags: [...(task.tags || []), n] });
    setTagInput(null);
  };

  return (
    <aside className={'detail' + (mobile ? ' detail-mobile' : '')} onKeyDown={(e) => { if (e.key === 'Escape' && !e.target.closest('.popover')) closeTask(); }}>
      <div className="detail-head">
        {mobile && <button className="icon-btn" onClick={() => { flushTitle(); flushContent(); closeTask(); }} aria-label="Back"><Icon name="arrowLeft" /></button>}
        <Check task={task} size={20} />
        <button className={'date-btn ' + dateClass(task)} onClick={(e) => !ro && setDpAnchor(e.currentTarget)} disabled={ro}>
          <Icon name="calendar" size={16} />
          <span>{task.dueAt ? fmtTaskDate(task) : 'Date & reminder'}</span>
          {task.repeat && <Icon name="repeat" size={13} />}
          {task.reminders?.length > 0 && task.dueAt && <Icon name="bell" size={13} />}
        </button>
        <span className="spacer" />
        <button className="icon-btn" title="Priority" style={{ color: PRIORITY[task.priority || 0].color }} disabled={ro}
          onClick={(e) => openMenu(e.currentTarget, [5, 3, 1, 0].map((p) => ({ label: PRIORITY[p].name + ' priority', icon: 'flag', color: PRIORITY[p].color, checked: (task.priority || 0) === p, onClick: () => S.updateTask(task.id, { priority: p }) })), { align: 'end' })}>
          <Icon name="flag" />
        </button>
        {ro ? (
          <button className="btn sm" onClick={() => S.restoreTasks([task.id])}>Restore</button>
        ) : <button className="icon-btn" onClick={more} aria-label="More"><Icon name="moreV" /></button>}
        {!mobile && <button className="icon-btn" onClick={closeTask} aria-label="Close"><Icon name="x" /></button>}
      </div>
      <div className="detail-body">
        {parent && <button className="parent-link" onClick={() => openTask(parent.id)}><Icon name="arrowLeft" size={13} /> {parent.title || 'Parent task'}</button>}
        {task.dueAt && (task.repeat || task.reminders?.length > 0) && (
          <div className="detail-sub muted small">
            {task.repeat && <span><Icon name="repeat" size={12} /> {describeRepeat(task.repeat, task.dueAt)}</span>}
            {task.reminders?.length > 0 && <span><Icon name="bell" size={12} /> {task.reminders.map((r) => reminderLabel(r, task.allDay)).join(', ')}</span>}
          </div>
        )}
        <AutoTextarea ref={titleRef} className={'detail-title' + (task.status !== 0 ? ' is-done' : '')} value={title} placeholder="What would you like to do?" readOnly={ro}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} onBlur={flushTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
        <div className="detail-tags">
          {(task.tags || []).map((tg) => (
            <span key={tg} className="tag-chip big" style={tagColors[tg] ? { '--tag': tagColors[tg] } : undefined}>
              #{tg}{!ro && <button onClick={() => S.updateTask(task.id, { tags: task.tags.filter((x) => x !== tg) })} aria-label={'Remove ' + tg}><Icon name="x" size={11} /></button>}
            </span>
          ))}
          {!ro && (tagInput !== null ? (
            <span className="tag-input-wrap">
              <input className="tag-input" autoFocus value={tagInput} placeholder="tag" list="tag-suggest"
                onChange={(e) => setTagInput(e.target.value)} onBlur={() => addTag(tagInput)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addTag(tagInput); } if (e.key === 'Escape') setTagInput(null); }} />
              <datalist id="tag-suggest">{all('tags').map((t) => <option key={t.id} value={t.name} />)}</datalist>
            </span>
          ) : <button className="add-tag" onClick={() => setTagInput('')}><Icon name="tag" size={13} /> Add tag</button>)}
        </div>
        <AutoTextarea className="detail-content" value={content} placeholder="Description" readOnly={ro}
          onChange={(e) => setContent(e.target.value)} onBlur={flushContent} />

        <div className="detail-section">
          {checklist.length > 0 && <div className="detail-section-head"><Icon name="checklist" size={14} /> Checklist <span className="muted">{checklist.filter((c) => c.done).length}/{checklist.length}</span></div>}
          {checklist.map((c, i) => (
            <div key={c.id} className={'cl-item' + (c.done ? ' done' : '')}>
              <button className={'cl-check' + (c.done ? ' on' : '')} onClick={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} aria-label="Toggle item">{c.done && <Icon name="check" size={11} strokeWidth={3} />}</button>
              <ChecklistInput value={c.title} readOnly={ro}
                onCommit={(v) => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, title: v } : x)))}
                onEnter={(v) => { const cl = checklist.map((x) => (x.id === c.id ? { ...x, title: v } : x)); cl.splice(i + 1, 0, { id: S.uid(), title: '', done: false }); setChecklist(cl); setTimeout(() => document.querySelectorAll('.cl-input')[i + 1]?.focus(), 30); }}
                onBackspaceEmpty={() => { setChecklist(checklist.filter((x) => x.id !== c.id)); setTimeout(() => document.querySelectorAll('.cl-input')[Math.max(0, i - 1)]?.focus(), 30); }} />
              <span className="cl-tools">
                {i > 0 && <button className="icon-btn xs" onClick={() => { const cl = [...checklist]; [cl[i - 1], cl[i]] = [cl[i], cl[i - 1]]; setChecklist(cl); }} aria-label="Move up"><Icon name="chevronUp" size={13} /></button>}
                <button className="icon-btn xs" onClick={() => { S.createTask({ title: c.title, parentId: task.id, listId: task.listId, sectionId: task.sectionId }); setChecklist(checklist.filter((x) => x.id !== c.id)); }} title="Convert to subtask"><Icon name="subtask" size={13} /></button>
                <button className="icon-btn xs" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} aria-label="Delete item"><Icon name="x" size={13} /></button>
              </span>
            </div>
          ))}
          {!ro && (
            <div className="cl-item add">
              <Icon name="plus" size={14} />
              <input className="cl-new" value={newItem} placeholder="Add checklist item" onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { setChecklist([...checklist, { id: S.uid(), title: newItem.trim(), done: false }]); setNewItem(''); } }} />
            </div>
          )}
        </div>

        <div className="detail-section">
          {kids.length > 0 && <div className="detail-section-head"><Icon name="subtask" size={14} /> Subtasks <span className="muted">{kids.filter((k) => k.status !== 0).length}/{kids.length}</span></div>}
          {kids.map((k) => (
            <div key={k.id} className={'sub-item' + (k.status !== 0 ? ' done' : '')}>
              <Check task={k} size={16} />
              <button className="sub-title" onClick={() => openTask(k.id)}>{k.title || 'Untitled'}</button>
              {k.dueAt && <span className={'date-chip ' + dateClass(k)}>{fmtTaskDate(k)}</span>}
            </div>
          ))}
          {!ro && (
            <div className="sub-item add">
              <Icon name="plus" size={14} />
              <input className="cl-new" value={newSub} placeholder="Add subtask" onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newSub.trim()) { S.createTask({ title: newSub.trim(), parentId: task.id, listId: task.listId, sectionId: task.sectionId }); setNewSub(''); } }} />
            </div>
          )}
        </div>
        <div className="detail-info muted small">
          {focusSecs > 0 && <div><Icon name="pomo" size={12} /> Focused {fmtDuration(focusSecs)}</div>}
          {task.completedAt && task.status !== 0 && <div>{task.status === 2 ? 'Completed' : "Won't do"} {fmtFullDate(task.completedAt)}, {fmtTime(task.completedAt)}</div>}
          <div>Created {fmtFullDate(task.createdAt)}</div>
        </div>
      </div>
      <div className="detail-foot">
        <button className="list-btn" disabled={ro} onClick={(e) => openMenu(e.currentTarget, moveMenuItems([task.id]))}>
          <span style={{ color: list?.color || undefined }}>{list?.emoji || <Icon name={task.listId === INBOX ? 'inbox' : 'list'} size={15} />}</span>
          <span>{list?.name || 'Inbox'}</span><Icon name="chevronDown" size={13} />
        </button>
        {sections.length > 0 && (
          <button className="list-btn" disabled={ro} onClick={(e) => openMenu(e.currentTarget, [{ label: 'Not sectioned', checked: !task.sectionId, onClick: () => S.updateTask(task.id, { sectionId: null }) }, ...sections.map((s) => ({ label: s.name, checked: task.sectionId === s.id, onClick: () => S.updateTask(task.id, { sectionId: s.id }) }))])}>
            <span>{sections.find((s) => s.id === task.sectionId)?.name || 'No section'}</span><Icon name="chevronDown" size={13} />
          </button>
        )}
        <span className="spacer" />
        {!ro && task.status === 0 && <button className="icon-btn" title="Start focus" onClick={() => { setUI({ focusTaskId: task.id }); goSection('focus'); }}><Icon name="pomo" /></button>}
      </div>
      {dpAnchor && <DatePicker anchor={dpAnchor} value={task} onClose={() => setDpAnchor(null)}
        onChange={(v) => S.updateTask(task.id, { ...v, repeatAnchor: v.repeat ? v.dueAt : null, repeatDone: 0 })} />}
    </aside>
  );
}

function ChecklistInput({ value, onCommit, onEnter, onBackspaceEmpty, readOnly }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="cl-input" value={v} readOnly={readOnly} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onEnter(v); }
        if (e.key === 'Backspace' && v === '') { e.preventDefault(); onBackspaceEmpty(); }
      }} />
  );
}
export { getDB, activeLists };
