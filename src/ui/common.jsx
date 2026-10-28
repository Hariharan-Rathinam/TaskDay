import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// ---------- responsive ----------
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 760px)') : null;
export function useIsMobile() {
  return useSyncExternalStore((cb) => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb); }, () => !!mq?.matches);
}
export const isMobileNow = () => !!mq?.matches;

// ---------- tiny global stores ----------
function createHost(initial) {
  let value = initial; const subs = new Set();
  return {
    get: () => value,
    set: (v) => { value = typeof v === 'function' ? v(value) : v; subs.forEach((f) => f()); },
    use: () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => value),
  };
}

// ---------- Popover ----------
export function Popover({ anchor, point, onClose, children, width = 260, className = '', sheet = true, align = 'start' }) {
  const ref = useRef(null);
  const mobile = useIsMobile();
  const [pos, setPos] = useState({ left: -9999, top: -9999, maxHeight: 400 });
  const asSheet = sheet && mobile;
  useLayoutEffect(() => {
    if (asSheet) return;
    const el = ref.current; if (!el) return;
    const r = anchor ? anchor.getBoundingClientRect() : { left: point.x, right: point.x, top: point.y, bottom: point.y };
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 4;
    let maxHeight = vh - top - 8;
    if (top + h > vh - 8 && r.top - h - 4 > 8) { top = r.top - h - 4; maxHeight = r.top - 12; }
    else if (top + h > vh - 8) { top = Math.max(8, vh - h - 8); maxHeight = vh - 16; }
    setPos({ left, top, maxHeight });
  }, [anchor, point, asSheet]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target)) && !e.target.closest('.popover-layer-keep')) onClose(); };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); clearTimeout(t); };
  }, [onClose, anchor]);
  if (asSheet) {
    return createPortal(
      <div className="sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} className={'sheet ' + className}><div className="sheet-grip" />{children}</div>
      </div>, document.body);
  }
  return createPortal(
    <div ref={ref} className={'popover ' + className} style={{ left: pos.left, top: pos.top, width, maxHeight: pos.maxHeight }}>{children}</div>,
    document.body);
}

// ---------- Menus ----------
const menuHost = createHost(null);
export function openMenu(target, items, opts = {}) {
  const anchor = target instanceof Element ? target : null;
  const point = anchor ? null : target;
  menuHost.set({ anchor, point, items: items.filter(Boolean), ...opts });
}
export function closeMenu() { menuHost.set(null); }
function MenuItems({ items, onClose }) {
  const [sub, setSub] = useState(null);
  if (sub) {
    return (
      <div className="menu">
        <button className="menu-item menu-back" onClick={() => setSub(null)}><Icon name="chevronLeft" size={16} /> {sub.label}</button>
        <div className="menu-sep" />
        <MenuItems items={sub.submenu} onClose={onClose} />
      </div>
    );
  }
  return (
    <div className="menu">
      {items.map((it, i) => {
        if (it === '-' || it.sep) return <div key={i} className="menu-sep" />;
        if (it.header) return <div key={i} className="menu-header">{it.header}</div>;
        if (it.custom) return <div key={i} className="menu-custom">{it.custom}</div>;
        return (
          <button key={i} className={'menu-item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : '')} disabled={it.disabled}
            onClick={() => { if (it.submenu) { setSub(it); return; } onClose(); it.onClick && it.onClick(); }}>
            {it.icon && <span className="menu-icon" style={{ color: it.color }}>{typeof it.icon === 'string' ? <Icon name={it.icon} size={16} /> : it.icon}</span>}
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.checked && <Icon name="check" size={16} className="menu-check" />}
            {it.submenu && <Icon name="chevronRight" size={14} className="menu-sub" />}
          </button>
        );
      })}
    </div>
  );
}
export function MenuHost() {
  const m = menuHost.use();
  if (!m) return null;
  return (
    <Popover anchor={m.anchor} point={m.point} onClose={closeMenu} width={m.width || 220} align={m.align}>
      {m.title && <div className="menu-title">{m.title}</div>}
      <MenuItems items={m.items} onClose={closeMenu} />
    </Popover>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, width = 460, className = '', full }) {
  const mobile = useIsMobile();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal ' + className + (mobile || full ? ' modal-mobile' : '')} style={{ width: mobile ? undefined : width }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}

// ---------- Dialog helpers (confirm / prompt) ----------
const dialogHost = createHost(null);
export function confirmDialog(message, { title = 'Are you sure?', ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => dialogHost.set({ kind: 'confirm', message, title, ok, danger, resolve }));
}
export function promptDialog(title, value = '', { placeholder = '', ok = 'Save' } = {}) {
  return new Promise((resolve) => dialogHost.set({ kind: 'prompt', title, value, placeholder, ok, resolve }));
}
export function DialogHost() {
  const d = dialogHost.use();
  const [val, setVal] = useState('');
  useEffect(() => { if (d?.kind === 'prompt') setVal(d.value); }, [d]);
  if (!d) return null;
  const close = (r) => { dialogHost.set(null); d.resolve(r); };
  return (
    <Modal title={d.title} onClose={() => close(d.kind === 'prompt' ? null : false)} width={400}
      footer={<>
        <button className="btn" onClick={() => close(d.kind === 'prompt' ? null : false)}>Cancel</button>
        <button className={'btn ' + (d.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(d.kind === 'prompt' ? val : true)}>{d.ok}</button>
      </>}>
      {d.kind === 'confirm' ? <p className="dialog-msg">{d.message}</p> : (
        <input className="input" autoFocus value={val} placeholder={d.placeholder} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') close(val); }} />
      )}
    </Modal>
  );
}

// ---------- Toasts ----------
const toastHost = createHost([]);
let toastSeq = 0;
export function toast(message, opts = {}) {
  const id = ++toastSeq;
  toastHost.set((l) => [...l.slice(-2), { id, message, ...opts }]);
  setTimeout(() => toastHost.set((l) => l.filter((t) => t.id !== id)), opts.duration || 3500);
}
export function ToastHost() {
  const list = toastHost.use();
  return createPortal(
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className="toast" onClick={() => { t.onClick?.(); toastHost.set((l) => l.filter((x) => x.id !== t.id)); }}>
          <span>{t.message}</span>
          {t.action && <button className="toast-action" onClick={(e) => { e.stopPropagation(); t.onAction?.(); toastHost.set((l) => l.filter((x) => x.id !== t.id)); }}>{t.action}</button>}
        </div>
      ))}
    </div>, document.body);
}

// ---------- small controls ----------
export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch-row">
      {label && <span>{label}</span>}
      <span className={'switch' + (checked ? ' on' : '')} role="switch" aria-checked={checked} tabIndex={0}
        onClick={() => onChange(!checked)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}>
        <span className="switch-knob" />
      </span>
    </label>
  );
}
export function Segmented({ value, options, onChange, small }) {
  return (
    <div className={'segmented' + (small ? ' small' : '')} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon && <Icon name={o.icon} size={15} />}{o.label}
        </button>
      ))}
    </div>
  );
}
export const COLORS = ['#4772FA', '#2BA6F0', '#20B2AA', '#35B866', '#8BC34A', '#F7C744', '#F2994A', '#EB5757', '#E85D9C', '#9B51E0', '#7B61FF', '#8D6E63', '#828282'];
export function ColorPicker({ value, onChange, allowNone = true }) {
  return (
    <div className="color-picker">
      {allowNone && <button className={'swatch none' + (!value ? ' sel' : '')} onClick={() => onChange(null)} title="No color"><Icon name="x" size={12} /></button>}
      {COLORS.map((c) => <button key={c} className={'swatch' + (value === c ? ' sel' : '')} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />)}
    </div>
  );
}
export const EMOJIS = ['📋', '🏠', '💼', '🛒', '📚', '🎯', '💡', '✈️', '🏃', '💪', '🧘', '🍎', '💧', '😴', '📖', '✍️', '🎵', '🎨', '💻', '📞', '💰', '🧹', '🌱', '🐶', '❤️', '⭐', '🔥', '🎉', '🎂', '🎓', '🏆', '⚽', '🚴', '🥗', '☕', '🚭', '💊', '🦷', '🌞', '🌙', '📝', '📅', '⏰', '🔔', '🧠', '🙏', '👨‍👩‍👧', '🎁'];
export function EmojiPicker({ value, onChange, allowNone = true }) {
  return (
    <div className="emoji-picker">
      {allowNone && <button className={'emoji-opt' + (!value ? ' sel' : '')} onClick={() => onChange('')}><Icon name="x" size={14} /></button>}
      {EMOJIS.map((e) => <button key={e} className={'emoji-opt' + (value === e ? ' sel' : '')} onClick={() => onChange(e)}>{e}</button>)}
    </div>
  );
}
export function Field({ label, children, hint }) {
  return <div className="field"><div className="field-label">{label}</div>{children}{hint && <div className="field-hint">{hint}</div>}</div>;
}
export function Empty({ icon = 'checkCircle', title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={40} strokeWidth={1.3} /></div>
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {children}
    </div>
  );
}
export function AutoTextarea({ value, onChange, className = '', ref: outerRef, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [value]);
  const setRef = (el) => { ref.current = el; if (typeof outerRef === 'function') outerRef(el); else if (outerRef) outerRef.current = el; };
  return <textarea ref={setRef} rows={1} className={'autotext ' + className} value={value} onChange={onChange} {...rest} />;
}
// Text input that commits on blur/enter (avoids writing a record per keystroke).
export function useDraft(value, commit) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(value); }, [value]);
  return [draft, (v) => { dirty.current = true; setDraft(v); }, () => { if (dirty.current) { dirty.current = false; if (draft !== value) commit(draft); } }];
}
