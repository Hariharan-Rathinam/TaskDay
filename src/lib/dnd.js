// Pointer-based drag and drop that works with mouse and touch (long-press on touch).
// Draggables call `dragHandlers(payload, label)`; drop targets carry `data-drop="<json>"`.
let dropHandler = () => {};
export function setDropHandler(fn) { dropHandler = fn; }

let state = null; // { payload, ghost, startX, startY, active, target, pointerType, timer }
let suppressClick = false;

function findTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest('[data-drop]');
  return t;
}
function clearOver() { document.querySelectorAll('.drop-over, .drop-over-top, .drop-over-bottom').forEach((e) => e.classList.remove('drop-over', 'drop-over-top', 'drop-over-bottom')); }

function activate() {
  state.active = true;
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  g.textContent = state.label || '';
  document.body.appendChild(g);
  state.ghost = g;
  document.body.classList.add('is-dragging');
  if (state.el) state.el.classList.add('drag-source');
  try { navigator.vibrate?.(12); } catch { /* ignore */ }
  move(state.lastX, state.lastY);
}

function move(x, y) {
  if (!state?.active) return;
  state.ghost.style.transform = `translate(${x + 12}px, ${y + 10}px)`;
  const t = findTarget(x, y);
  clearOver();
  state.target = t;
  if (t) {
    const r = t.getBoundingClientRect();
    const pos = y < r.top + r.height / 2 ? 'top' : 'bottom';
    state.pos = pos;
    t.classList.add('drop-over');
    if (t.dataset.dropSide) t.classList.add(pos === 'top' ? 'drop-over-top' : 'drop-over-bottom');
  }
  autoScroll(x, y);
}

let scrollRaf = null;
function autoScroll(x, y) {
  cancelAnimationFrame(scrollRaf);
  const el = document.elementFromPoint(x, y);
  let sc = el;
  while (sc && sc !== document.body) {
    const s = getComputedStyle(sc);
    if ((/(auto|scroll)/.test(s.overflowY) && sc.scrollHeight > sc.clientHeight) || (/(auto|scroll)/.test(s.overflowX) && sc.scrollWidth > sc.clientWidth)) break;
    sc = sc.parentElement;
  }
  if (!sc || sc === document.body) return;
  const r = sc.getBoundingClientRect();
  const edge = 40;
  let dy = 0, dx = 0;
  if (y < r.top + edge) dy = -10; else if (y > r.bottom - edge) dy = 10;
  if (x < r.left + edge) dx = -10; else if (x > r.right - edge) dx = 10;
  if (dx || dy) {
    const step = () => { sc.scrollTop += dy; sc.scrollLeft += dx; if (state?.active) scrollRaf = requestAnimationFrame(step); };
    scrollRaf = requestAnimationFrame(step);
  }
}

function end(commit) {
  if (!state) return;
  clearTimeout(state.timer);
  cancelAnimationFrame(scrollRaf);
  const s = state;
  state = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  if (s.active) {
    s.ghost?.remove();
    document.body.classList.remove('is-dragging');
    s.el?.classList.remove('drag-source');
    clearOver();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 50);
    if (commit && s.target) {
      let spec;
      try { spec = JSON.parse(s.target.dataset.drop); } catch { spec = null; }
      if (spec) dropHandler(s.payload, spec, { pos: s.pos, x: s.lastX, y: s.lastY, el: s.target });
    }
  } else if (commit && s.pointerType !== 'mouse' && s.longPressed && s.onLongPress) {
    s.onLongPress(s.lastX, s.lastY);
  }
}
function onMove(e) {
  if (!state) return;
  state.lastX = e.clientX; state.lastY = e.clientY;
  const dist = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
  if (!state.active) {
    if (state.pointerType === 'mouse') { if (dist > 6) activate(); }
    else if (state.longPressed) { if (dist > 4) activate(); }
    else if (dist > 10) { end(false); }
    return;
  }
  move(e.clientX, e.clientY);
}
function onUp() { end(true); }
function onCancel() { if (state && !state.active) end(false); else end(false); }

// Prevent page scrolling while a touch drag is active.
if (typeof document !== 'undefined') {
  document.addEventListener('touchmove', (e) => { if (state && (state.active || state.longPressed)) e.preventDefault(); }, { passive: false });
  document.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}

export function dragHandlers(payload, label, opts = {}) {
  return {
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('input, textarea, button, select, [contenteditable], .no-drag')) return;
      if (state) end(false);
      state = { payload, label, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, pointerType: e.pointerType, el: e.currentTarget, onLongPress: opts.onLongPress };
      if (e.pointerType !== 'mouse') {
        state.timer = setTimeout(() => { if (state) { state.longPressed = true; try { navigator.vibrate?.(10); } catch { /* ignore */ } } }, 380);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
  };
}
export function dropAttr(spec, side = false) { return { 'data-drop': JSON.stringify(spec), ...(side ? { 'data-drop-side': '1' } : {}) }; }
export const isDragging = () => !!state?.active;
