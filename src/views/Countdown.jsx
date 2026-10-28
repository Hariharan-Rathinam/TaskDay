import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import * as S from '../store.js';
import { useDB, all } from '../store.js';
import { today, ymd, parseYmd, diffDays, fmtFullDate, addYears } from '../lib/date.js';
import { Modal, Field, ColorPicker, EmojiPicker, Segmented, Switch, openMenu, confirmDialog, useIsMobile, Empty, COLORS } from '../ui/common.jsx';

const TYPES = { countdown: 'Countdown', anniversary: 'Anniversary', birthday: 'Birthday', holiday: 'Holiday' };

export function nextOccurrenceOf(c) {
  const base = parseYmd(c.date);
  const td = today();
  if (!(c.yearly || c.type === 'birthday' || c.type === 'anniversary')) return base;
  let d = base, k = 0;
  while (d < td && k < 300) { k++; d = addYears(base, k); }
  return d;
}
export function countdownInfo(c) {
  const td = today();
  const base = parseYmd(c.date);
  const next = nextOccurrenceOf(c);
  const days = diffDays(next, td);
  const since = diffDays(td, base);
  let big, label;
  if (c.type === 'anniversary' && c.showSince !== false) { big = since; label = since >= 0 ? 'days since' : 'days until'; }
  else if (days === 0) { big = 'Today'; label = ''; }
  else if (days > 0) { big = days; label = days === 1 ? 'day left' : 'days left'; }
  else { big = -days; label = 'days ago'; }
  const years = new Date(next).getFullYear() - new Date(base).getFullYear();
  return { next, days, big: typeof big === 'number' ? Math.abs(big) : big, label, years };
}

export function CountdownView({ onOpenDrawer }) {
  useDB();
  const mobile = useIsMobile();
  const [edit, setEdit] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const items = all('countdowns').filter((c) => !!c.archived === showArchived)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || countdownInfo(a).next - countdownInfo(b).next);
  const menu = (c, target) => openMenu(target, [
    { label: 'Edit', icon: 'edit', onClick: () => setEdit(c) },
    { label: c.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onClick: () => S.patch('countdowns', c.id, { pinned: !c.pinned }) },
    { label: c.archived ? 'Restore' : 'Archive', icon: 'archive', onClick: () => S.patch('countdowns', c.id, { archived: !c.archived }) },
    { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('', { title: `Delete "${c.name}"?`, ok: 'Delete', danger: true })) S.remove('countdowns', c.id); } },
  ]);
  return (
    <div className="pane countdown-pane">
      <div className="pane-head">
        {mobile && <button className="icon-btn" onClick={onOpenDrawer} aria-label="Menu"><Icon name="menu" /></button>}
        <h1 className="pane-title"><span>{showArchived ? 'Archived countdowns' : 'Countdown'}</span></h1>
        <div className="pane-actions">
          <button className="icon-btn" onClick={() => setEdit({})} aria-label="New countdown"><Icon name="plus" /></button>
          <button className="icon-btn" onClick={(e) => openMenu(e.currentTarget, [{ label: showArchived ? 'Back' : 'Archived', icon: 'archive', onClick: () => setShowArchived(!showArchived) }], { align: 'end' })}><Icon name="more" /></button>
        </div>
      </div>
      <div className="countdown-grid">
        {!items.length && <Empty icon="countdown" title={showArchived ? 'Nothing archived' : 'Count down to what matters'} text={showArchived ? '' : 'Exams, birthdays, trips, anniversaries.'}>{!showArchived && <button className="btn btn-primary" onClick={() => setEdit({})}>New countdown</button>}</Empty>}
        {items.map((c) => {
          const info = countdownInfo(c);
          const color = c.color || COLORS[0];
          return (
            <div key={c.id} className={'cd-card' + (c.pinned ? ' pinned' : '')} style={{ '--cd': color }} onClick={() => setEdit(c)} onContextMenu={(e) => { e.preventDefault(); menu(c, { x: e.clientX, y: e.clientY }); }}>
              <div className="cd-top">
                <span className="cd-emoji">{c.emoji || '⏳'}</span>
                <span className="cd-name">{c.name}</span>
                {c.pinned && <Icon name="pin" size={13} />}
                <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); menu(c, e.currentTarget); }} aria-label="Options"><Icon name="more" size={15} /></button>
              </div>
              <div className="cd-big"><span className="cd-num">{info.big}</span><span className="cd-lbl">{info.label}</span></div>
              <div className="cd-date">
                {fmtFullDate(info.next)}
                {c.type === 'birthday' && info.years > 0 && ` · turns ${info.years}`}
                {c.type === 'anniversary' && info.years > 0 && ` · ${info.years} year${info.years > 1 ? 's' : ''}`}
                <span className="cd-type">{TYPES[c.type || 'countdown']}</span>
              </div>
            </div>
          );
        })}
      </div>
      {edit && <CountdownDialog item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CountdownDialog({ item, onClose }) {
  const isNew = !item?.id;
  const [f, setF] = useState(() => ({ name: '', type: 'countdown', date: ymd(today() + 30 * 86400000), emoji: '🎯', color: COLORS[0], yearly: false, note: '', ...item }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = () => { if (!f.name.trim()) return; S.put('countdowns', { ...f, id: f.id || S.uid(), name: f.name.trim() }); onClose(); };
  return (
    <Modal title={isNew ? 'New countdown' : 'Edit countdown'} onClose={onClose} width={440}
      footer={<>
        {!isNew && <button className="btn btn-danger-text" onClick={() => { S.remove('countdowns', f.id); onClose(); }}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button>
      </>}>
      <Field label="Type"><Segmented value={f.type} onChange={(t) => set({ type: t, yearly: t === 'birthday' || t === 'anniversary' ? true : f.yearly, emoji: { birthday: '🎂', anniversary: '❤️', holiday: '🏖️', countdown: f.emoji }[t] })} options={Object.entries(TYPES).map(([v, l]) => ({ value: v, label: l }))} /></Field>
      <Field label="Name"><input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.type === 'birthday' ? "Mom's birthday" : 'e.g. Final exam'} /></Field>
      <Field label={f.type === 'birthday' ? 'Date of birth' : f.type === 'anniversary' ? 'Start date' : 'Date'}><input className="input" type="date" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value })} /></Field>
      {(f.type === 'countdown' || f.type === 'holiday') && <Switch label="Repeat every year" checked={!!f.yearly} onChange={(v) => set({ yearly: v })} />}
      {f.type === 'anniversary' && <Switch label="Show days since start (instead of days until next)" checked={f.showSince !== false} onChange={(v) => set({ showSince: v })} />}
      <Field label="Icon"><EmojiPicker value={f.emoji} onChange={(v) => set({ emoji: v })} allowNone={false} /></Field>
      <Field label="Color"><ColorPicker value={f.color} onChange={(v) => set({ color: v })} allowNone={false} /></Field>
      <Field label="Note"><input className="input" value={f.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
    </Modal>
  );
}
