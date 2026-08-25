"use strict";

// ---------- selection & overlay ----------

function isEditableEl(el, doc){
  if(!el || !doc || el === doc.documentElement || el === doc.body) return false;
  const tag = el.tagName;
  if(tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK' || tag === 'TITLE') return false;
  return true;
}

function selectElement(el){
  state.selected = el;
  state.multiSelect = new Set();
  state.artboardMode = false;
  artboards.forEach(function(a){ a.dom.wrap.classList.remove('selected'); });
  renderOverlay();
  renderProps();
  highlightLayerRow();
}

function elRectToStage(el){
  const doc = getDoc();
  const r = el.getBoundingClientRect();
  const scrollX = doc.defaultView.scrollX, scrollY = doc.defaultView.scrollY;
  return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
}

function isFreeform(el){
  const doc = getDoc();
  const cs = doc.defaultView.getComputedStyle(el);
  return cs.position === 'absolute' || cs.position === 'fixed';
}

function renderOverlay(){
  const overlay = getOverlay();
  if(!overlay) return;
  overlay.innerHTML = '';
  if(!state.editMode) return;

  if(state.artboardMode){
    const ab = activeArtboard();
    if(!ab) return;
    const r = { left: 0, top: 0, width: ab.w, height: ab.h };
    ['n', 'e', 's', 'w'].forEach(function(h){
      const ed = document.createElement('div');
      ed.className = 'edge ' + h;
      positionEdge(ed, h, r);
      ed.addEventListener('mousedown', function(e){ startArtboardResize(e, h, ab); });
      overlay.appendChild(ed);
    });
    ['nw', 'ne', 'se', 'sw'].forEach(function(h){
      const hd = document.createElement('div');
      hd.className = 'handle ' + h;
      positionCorner(hd, h, r);
      hd.addEventListener('mousedown', function(e){ startArtboardResize(e, h, ab); });
      overlay.appendChild(hd);
    });
    return;
  }

  const doc = getDoc();
  if(!doc) return;

  state.multiSelect.forEach(function(sec){
    if(!sec.isConnected) return;
    const sr = elRectToStage(sec);
    const sbox = document.createElement('div');
    sbox.className = 'sel-box multi';
    sbox._el = sec;
    sbox.style.left = sr.left + 'px'; sbox.style.top = sr.top + 'px';
    sbox.style.width = sr.width + 'px'; sbox.style.height = sr.height + 'px';
    overlay.appendChild(sbox);
  });

  const el = state.selected;
  if(!el) return;
  const r = elRectToStage(el);
  const box = document.createElement('div');
  box.className = 'sel-box';
  box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
  box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  overlay.appendChild(box);

  const free = isFreeform(el);
  const edges = free ? ['n', 'e', 's', 'w'] : ['e', 's'];
  const corners = free ? ['nw', 'ne', 'se', 'sw'] : ['se'];

  edges.forEach(function(h){
    const ed = document.createElement('div');
    ed.className = 'edge ' + h;
    positionEdge(ed, h, r);
    ed.addEventListener('mousedown', function(e){ startResize(e, h); });
    overlay.appendChild(ed);
  });
  corners.forEach(function(h){
    const hd = document.createElement('div');
    hd.className = 'handle ' + h;
    positionCorner(hd, h, r);
    hd.addEventListener('mousedown', function(e){ startResize(e, h); });
    overlay.appendChild(hd);
  });
}

function positionCorner(hd, h, r){
  const left = r.left - 4.5, top = r.top - 4.5, right = r.left + r.width - 4.5, bottom = r.top + r.height - 4.5;
  const map = { nw: [left, top], ne: [right, top], se: [right, bottom], sw: [left, bottom] };
  hd.style.left = map[h][0] + 'px'; hd.style.top = map[h][1] + 'px';
}

function positionEdge(ed, h, r){
  const EDGE = 10, MARGIN = 10;
  if(h === 'n' || h === 's'){
    ed.style.left = (r.left + MARGIN) + 'px';
    ed.style.width = Math.max(0, r.width - MARGIN * 2) + 'px';
    ed.style.height = EDGE + 'px';
    ed.style.top = (h === 'n' ? r.top - EDGE / 2 : r.top + r.height - EDGE / 2) + 'px';
  } else {
    ed.style.top = (r.top + MARGIN) + 'px';
    ed.style.height = Math.max(0, r.height - MARGIN * 2) + 'px';
    ed.style.width = EDGE + 'px';
    ed.style.left = (h === 'w' ? r.left - EDGE / 2 : r.left + r.width - EDGE / 2) + 'px';
  }
}

function updateOverlayLive(){
  if(state.artboardMode || !state.selected) return;
  const overlay = getOverlay();
  if(!overlay) return;
  const r = elRectToStage(state.selected);
  // ".sel-box" alone also matches every ".sel-box.multi" box (same base
  // class) — without :not(.multi) this grabs whichever one happens to be
  // first in the DOM, which silently becomes a *different* element's box
  // the moment there's a multi-selection, throwing off drag/resize/scroll.
  const box = overlay.querySelector('.sel-box:not(.multi)');
  if(box){ box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'; }
  // the other selected elements' outlines never moved on scroll/live
  // updates before — each multi box remembers its source element (set in
  // renderOverlay) so it can be repositioned the same way as the primary.
  overlay.querySelectorAll('.sel-box.multi').forEach(function(sbox){
    if(!sbox._el || !sbox._el.isConnected) return;
    const sr = elRectToStage(sbox._el);
    sbox.style.left = sr.left + 'px'; sbox.style.top = sr.top + 'px';
    sbox.style.width = sr.width + 'px'; sbox.style.height = sr.height + 'px';
  });
  overlay.querySelectorAll('.edge').forEach(function(ed){
    const h = ['n', 'e', 's', 'w'].find(function(x){ return ed.classList.contains(x); });
    positionEdge(ed, h, r);
  });
  overlay.querySelectorAll('.handle').forEach(function(hd){
    const h = ['nw', 'ne', 'se', 'sw'].find(function(x){ return hd.classList.contains(x); });
    positionCorner(hd, h, r);
  });
}

// ---------- convert to freeform (absolute) ----------

function ensureAbsolute(el){
  const doc = getDoc();
  const cs = doc.defaultView.getComputedStyle(el);
  if(cs.position === 'absolute' || cs.position === 'fixed') return;
  const rect = el.getBoundingClientRect();
  const parent = el.offsetParent || doc.body;
  const pRect = parent.getBoundingClientRect();
  const parentCS = doc.defaultView.getComputedStyle(parent);
  if(parentCS.position === 'static') parent.style.position = 'relative';
  el.style.position = 'absolute';
  el.style.left = (rect.left - pRect.left) + 'px';
  el.style.top = (rect.top - pRect.top) + 'px';
  el.style.width = rect.width + 'px';
  el.style.height = rect.height + 'px';
  el.style.margin = '0';
}

// ---------- align / distribute (multi-selection) ----------
// Only makes real sense for freeform elements — flow elements don't have
// an explicit x/y to align, so each target gets converted to absolute
// first (same as dragging one does), preserving its current position.

function alignSelection(mode){
  const items = effectiveSelection();
  if(items.length < 2) return;
  const doc = getDoc();
  const rects = items.map(function(el){ return { el: el, r: elRectToStage(el) }; });
  let target;
  if(mode === 'left') target = Math.min.apply(null, rects.map(function(i){ return i.r.left; }));
  else if(mode === 'right') target = Math.max.apply(null, rects.map(function(i){ return i.r.left + i.r.width; }));
  else if(mode === 'hcenter') target = (Math.min.apply(null, rects.map(function(i){ return i.r.left; })) + Math.max.apply(null, rects.map(function(i){ return i.r.left + i.r.width; }))) / 2;
  else if(mode === 'top') target = Math.min.apply(null, rects.map(function(i){ return i.r.top; }));
  else if(mode === 'bottom') target = Math.max.apply(null, rects.map(function(i){ return i.r.top + i.r.height; }));
  else if(mode === 'vcenter') target = (Math.min.apply(null, rects.map(function(i){ return i.r.top; })) + Math.max.apply(null, rects.map(function(i){ return i.r.top + i.r.height; }))) / 2;

  rects.forEach(function(item){
    ensureAbsolute(item.el);
    const r2 = elRectToStage(item.el);
    const parent = item.el.offsetParent || doc.body;
    const pRect = elRectToStage(parent);
    if(mode === 'left') item.el.style.left = (target - pRect.left) + 'px';
    else if(mode === 'right') item.el.style.left = (target - r2.width - pRect.left) + 'px';
    else if(mode === 'hcenter') item.el.style.left = (target - r2.width / 2 - pRect.left) + 'px';
    else if(mode === 'top') item.el.style.top = (target - pRect.top) + 'px';
    else if(mode === 'bottom') item.el.style.top = (target - r2.height - pRect.top) + 'px';
    else if(mode === 'vcenter') item.el.style.top = (target - r2.height / 2 - pRect.top) + 'px';
  });
  pushHistory(); syncCodeFromCanvas(); renderOverlay();
}

function distributeSelection(axis){
  const items = effectiveSelection();
  if(items.length < 3) return;
  const doc = getDoc();
  const key = axis === 'h' ? 'left' : 'top';
  const size = axis === 'h' ? 'width' : 'height';
  const rects = items.map(function(el){ return { el: el, r: elRectToStage(el) }; }).sort(function(a, b){ return a.r[key] - b.r[key]; });
  const first = rects[0], last = rects[rects.length - 1];
  const totalSpan = (last.r[key] + last.r[size]) - first.r[key];
  const totalSize = rects.reduce(function(s, i){ return s + i.r[size]; }, 0);
  const gap = (totalSpan - totalSize) / (rects.length - 1);
  let cursor = first.r[key] + first.r[size] + gap;
  rects.forEach(function(item, idx){
    if(idx === 0 || idx === rects.length - 1) return;
    ensureAbsolute(item.el);
    const parent = item.el.offsetParent || doc.body;
    const pRect = elRectToStage(parent);
    if(axis === 'h') item.el.style.left = (cursor - pRect.left) + 'px';
    else item.el.style.top = (cursor - pRect.top) + 'px';
    cursor += item.r[size] + gap;
  });
  pushHistory(); syncCodeFromCanvas(); renderOverlay();
}

// ---------- style painter ("copiar estilo" / eyedropper) ----------
// Click a source element to copy its look (not layout/position), then
// click any number of other elements to paste it onto them — a classic
// two-click format painter, armed from the toolbar until toggled off.

const STYLE_PAINT_PROPS = [
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'color', 'fontSize', 'fontWeight',
  'fontFamily', 'fontStyle', 'textDecoration', 'letterSpacing', 'lineHeight',
  'borderRadius', 'borderWidth', 'borderStyle', 'borderColor', 'boxShadow', 'opacity'
];

// Off switch only — turning it *on* happens in the toolbar button handler,
// since it needs to capture from whatever is already selected at that
// moment (select the source normally, then press the button, then click
// the targets — not a separate "click to pick" step).
function setStylePainterActive(active){
  state.stylePainter.active = active;
  if(!active) state.stylePainter.props = null;
  document.getElementById('btnStylePainter').classList.toggle('active', active);
  document.getElementById('btnStylePainter').textContent = active ? 'Clique pra aplicar (Esc pra sair)' : 'Copiar estilo';
}

// flashes a colored outline on el for a moment — visual confirmation on
// the canvas itself, since capturing has no other visible effect.
function flashPicked(el){
  const prevOutline = el.style.outline, prevOffset = el.style.outlineOffset;
  el.style.outline = '3px solid #ff3d7f';
  el.style.outlineOffset = '2px';
  setTimeout(function(){
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
  }, 550);
}

function useStylePainter(el){
  const props = state.stylePainter.props;
  if(!props) return;
  Object.keys(props).forEach(function(p){ el.style[p] = props[p]; });
  pushHistory(); syncCodeFromCanvas();
  selectElement(el);
}

function bringToFront(el){ el.parentNode.appendChild(el); pushHistory(); syncCodeFromCanvas(); renderLayers(); }
function sendToBack(el){ el.parentNode.insertBefore(el, el.parentNode.firstChild); pushHistory(); syncCodeFromCanvas(); renderLayers(); }

// re-parent el into newParent, keeping normal document flow (appended as
// the last child) — dragging a layer into another one in the layers panel
// just nests it, no absolute positioning involved.
function reparentElement(el, newParent){
  if(el === newParent || el.contains(newParent)) return false;
  newParent.appendChild(el);
  return true;
}

// ---------- drag to move / reorder ----------

const DRAG_THRESHOLD = 6; // px of real movement before a click becomes a drag
function catchPointer(cursor){ const c = getCatcher(); if(c){ c.style.pointerEvents = 'auto'; c.style.cursor = cursor || 'move'; } }
function releasePointer(){ const c = getCatcher(); if(c){ c.style.pointerEvents = 'none'; c.style.cursor = ''; } }

// A real, physical click-and-hold that starts inside an iframe can end up
// "captured" there by the browser for the rest of the gesture, even once
// our drag catcher is covering it — mousemove/mouseup then never reach
// `window` at all until release (sometimes not even then), which reads as
// "nothing happens while held, then it drags on its own afterwards". So
// every drag listens on both `window` and the iframe's own document, and
// normalizes whichever one actually fires into parent-page coordinates.
function bindDragListeners(doc, frame, scale, onMove, onUp){
  function norm(ev){
    if(ev.view && doc.defaultView && ev.view === doc.defaultView){
      const r = frame.getBoundingClientRect();
      return { clientX: r.left + ev.clientX * scale, clientY: r.top + ev.clientY * scale };
    }
    return { clientX: ev.clientX, clientY: ev.clientY };
  }
  function move(ev){ const p = norm(ev); onMove(p.clientX, p.clientY); }
  function up(ev){ const p = norm(ev); unbind(); onUp(p.clientX, p.clientY); }
  function unbind(){
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    doc.removeEventListener('mousemove', move);
    doc.removeEventListener('mouseup', up);
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  doc.addEventListener('mousemove', move);
  doc.addEventListener('mouseup', up);
  return unbind;
}

function startDrag(e, el){
  if(isFreeform(el)) startFreeMove(e, el);
  else startReorder(e, el);
}

// absolute/fixed elements: drag moves them freely via left/top.
