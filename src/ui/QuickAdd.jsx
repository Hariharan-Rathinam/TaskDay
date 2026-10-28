import { useState, useRef, useMemo } from 'react';
import Icon from './Icon.jsx';
import { createTask, getPrefs, all, getDB, INBOX } from '../store.js';
import { parseQuickAdd } from '../lib/nlp.js';
import { fmtTaskDate } from '../lib/date.js';
import { describeRepeat } from '../lib/repeat.js';
import { activeLists, PRIORITY } from '../lib/query.js';
import { DatePicker } from './DatePicker.jsx';
import { openMenu } from './common.jsx';

// defaults: fields applied to every task created here (e.g. listId, dueAt, sectionId, tags)
export function QuickAdd({ defaults = {}, placeholder, autoFocus, onCreated, compact, onCancel }) {
  const [text, setText] = useState('');
  const [manual, setManual] = useState({}); // fields picked via buttons override parsing
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const [focused, setFocused] = useState(false);
  const [sugIdx, setSugIdx] = useState(0);
  const inputRef = useRef(null);
  const prefs = getPrefs();
  const lists = activeLists();
  const parsed = useMemo(() => parseQuickAdd(text, { lists, smart: prefs.smartParse, keepText: prefs.keepParsedText }), [text, prefs.smartParse, prefs.keepParsedText, lists.length]);

  // autocomplete for #tag and ~list at the cursor
  const caret = inputRef.current?.selectionStart ?? text.length;
  const before = text.slice(0, caret);
  const tokenMatch = before.match(/(?:^|\s)([#~^])([^\s#~^!]*)$/);
  let suggestions = [];
  if (tokenMatch && focused) {
    const q = tokenMatch[2].toLowerCase();
    if (tokenMatch[1] === '#') suggestions = all('tags').filter((t) => t.name.startsWith(q) && t.name !== q).slice(0, 6).map((t) => ({ label: '#' + t.name, insert: '#' + t.name }));
    else suggestions = lists.filter((l) => l.name.toLowerCase().startsWith(q)).slice(0, 6).map((l) => ({ label: (l.emoji || '') + ' ' + l.name, insert: '~' + l.name }));
  }
  const applySuggestion = (s) => {
    const start = before.length - tokenMatch[0].length + (tokenMatch[0].startsWith(' ') ? 1 : 0);
    const next = text.slice(0, start) + s.insert + ' ' + text.slice(caret);
    setText(next);
    setSugIdx(0);
    setTimeout(() => { const pos = start + s.insert.length + 1; inputRef.current?.setSelectionRange(pos, pos); inputRef.current?.focus(); }, 0);
  };

  const final = () => {
    const f = { ...defaults };
    if (parsed.dueAt) { f.dueAt = parsed.dueAt; f.startAt = parsed.startAt; f.allDay = parsed.allDay; }
    if (parsed.repeat) f.repeat = parsed.repeat;
    if (parsed.priority != null) f.priority = parsed.priority;
    if (parsed.listId) { f.listId = parsed.listId; if (parsed.listId !== defaults.listId) f.sectionId = null; }
    if (parsed.tags.length) f.tags = [...new Set([...(defaults.tags || []), ...parsed.tags])];
    return { ...f, ...manual, title: parsed.title };
  };
  const submit = () => {
    if (!parsed.title.trim()) return;
    const t = createTask(final());
    setText(''); setManual({});
    onCreated && onCreated(t);
  };
  const preview = final();
  const listName = getDB().lists[preview.listId || defaults.listId || prefs.defaultListId]?.name;

  return (
    <div className={'quickadd' + (focused ? ' focused' : '') + (compact ? ' compact' : '')}>
      <Icon name="plus" size={18} className="qa-plus" />
      <div className="qa-field">
        <div className="qa-highlight" aria-hidden="true">{renderHighlight(text, parsed.spans)}</div>
        <input ref={inputRef} className="qa-input" value={text} placeholder={placeholder || `Add task to "${listName || 'Inbox'}", press Enter to save`} autoFocus={autoFocus}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(e) => { setText(e.target.value); setSugIdx(0); }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx((i) => (i + 1) % suggestions.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === 'Tab' || (e.key === 'Enter' && suggestions[sugIdx])) { e.preventDefault(); applySuggestion(suggestions[sugIdx]); return; }
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { setText(''); setManual({}); e.currentTarget.blur(); onCancel && onCancel(); }
          }} />
        {suggestions.length > 0 && (
          <div className="qa-suggest">
            {suggestions.map((s, i) => <button key={s.insert} className={i === sugIdx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>{s.label}</button>)}
          </div>
        )}
      </div>
      {(focused || text) && (
        <div className="qa-tools">
          <button className={'icon-btn sm' + (preview.dueAt ? ' active' : '')} title="Date" onMouseDown={(e) => e.preventDefault()} onClick={(e) => setPickerAnchor(e.currentTarget)}>
            <Icon name="calendar" size={16} />
          </button>
          <button className="icon-btn sm" title="Priority" style={{ color: PRIORITY[preview.priority || 0].color }} onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => openMenu(e.currentTarget, [5, 3, 1, 0].map((p) => ({ label: PRIORITY[p].name, icon: 'flag', color: PRIORITY[p].color, checked: (preview.priority || 0) === p, onClick: () => setManual((m) => ({ ...m, priority: p })) })))}>
            <Icon name="flag" size={16} />
          </button>
          <button className="icon-btn sm" title="List" onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => openMenu(e.currentTarget, lists.sort((a, b) => (a.id === INBOX ? -1 : a.order - b.order)).map((l) => ({ label: l.name, icon: l.emoji ? <span>{l.emoji}</span> : 'list', checked: (preview.listId || INBOX) === l.id, onClick: () => setManual((m) => ({ ...m, listId: l.id, sectionId: null })) })))}>
            <Icon name="list" size={16} />
          </button>
        </div>
      )}
      {text && (preview.dueAt || preview.repeat) && (
        <div className="qa-preview">
          {preview.dueAt && <span><Icon name="calendar" size={12} /> {fmtTaskDate(preview)}</span>}
          {preview.repeat && <span><Icon name="repeat" size={12} /> {describeRepeat(preview.repeat, preview.dueAt)}</span>}
        </div>
      )}
      {pickerAnchor && (
        <DatePicker anchor={pickerAnchor} value={preview} onClose={() => { setPickerAnchor(null); inputRef.current?.focus(); }}
          onChange={(v) => setManual((m) => ({ ...m, ...v }))} />
      )}
    </div>
  );
}

function renderHighlight(text, spans) {
  if (!spans.length) return text;
  const out = [];
  let i = 0;
  for (const s of spans) {
    if (s.start > i) out.push(text.slice(i, s.start));
    out.push(<mark key={s.start} className={'hl-' + s.type}>{text.slice(s.start, s.end)}</mark>);
    i = s.end;
  }
  out.push(text.slice(i));
  return out;
}
