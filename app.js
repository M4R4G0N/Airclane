(function(){
"use strict";

const DEFAULT_DOC = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<style>\n  body{ margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#ffffff; }\n</style>\n</head>\n<body>\n\n<div style="display:inline-block; padding:20px; background:#35d0a4; color:#06231b; border-radius:12px; font-size:20px; font-weight:700;">Novo artboard</div>\n\n</body>\n</html>\n';

const artboardsRow = document.getElementById('artboardsRow');
const canvasWrap = document.getElementById('canvasWrap');
const layersTree = document.getElementById('layersTree');
const propsBody = document.getElementById('propsBody');
const codeArea = document.getElementById('codeArea');
const codePanel = document.getElementById('codePanel');
const dropHint = document.getElementById('dropHint');

let artboards = [];
let artboardCounter = 0;

const state = {
  zoom: 1,
  editMode: true,
  activeId: null,
  selected: null,     // selected element inside the active artboard
  artboardMode: false, // true when the *artboard itself* (not an element) is selected
  currentProject: null,
  rulePickedClass: null // which of the selected element's classes the CSS-rule editor is showing
};

// ---------- artboard model ----------

function activeArtboard(){ return artboards.find(function(a){ return a.id === state.activeId; }) || null; }
function getFrame(){ const a = activeArtboard(); return a ? a.dom.frame : null; }
function getDoc(){ const f = getFrame(); try { return f && f.contentDocument; } catch(e){ return null; } }
function getOverlay(){ const a = activeArtboard(); return a ? a.dom.overlay : null; }
function getCatcher(){ const a = activeArtboard(); return a ? a.dom.catcher : null; }

function createArtboard(opts){
  opts = opts || {};
  artboardCounter++;
  const id = 'ab' + artboardCounter;
  const name = opts.name || ('Artboard ' + artboardCounter);
  const w = opts.w || 1440, h = opts.h || 900;

  const wrap = document.createElement('div');
  wrap.className = 'artboardWrap';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'artboardTitleWrap';
  const title = document.createElement('span');
  title.className = 'artboardTitle';
  title.textContent = name;
  const dims = document.createElement('span');
  dims.className = 'artboardDims';
  dims.textContent = w + '×' + h;
  titleWrap.appendChild(title);
  titleWrap.appendChild(dims);

  const stage = document.createElement('div');
  stage.className = 'artboardStage';
  const frame = document.createElement('iframe');
  frame.className = 'artboardFrame';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  const catcher = document.createElement('div');
  catcher.className = 'dragCatcher';
  const overlay = document.createElement('div');
  overlay.className = 'overlayLayer';
  stage.appendChild(frame);
  stage.appendChild(catcher);
  stage.appendChild(overlay);

  wrap.appendChild(titleWrap);
  wrap.appendChild(stage);
  artboardsRow.insertBefore(wrap, document.getElementById('addArtboardTile'));

  const pos = opts.x != null ? { x: opts.x, y: opts.y } : nextArtboardPosition();
  const ab = {
    id: id, name: name, w: w, h: h, x: pos.x, y: pos.y,
    dom: { wrap: wrap, titleWrap: titleWrap, title: title, dims: dims, stage: stage, frame: frame, catcher: catcher, overlay: overlay },
    history: [], historyIndex: -1, suppressHistory: false
  };
  wrap.style.left = ab.x + 'px'; wrap.style.top = ab.y + 'px';
  artboards.push(ab);

  let dragMoved = false;
  titleWrap.addEventListener('mousedown', function(e){
    e.stopPropagation();
    setActiveArtboard(ab.id);
    const scale = state.zoom;
    const startX = e.clientX, startY = e.clientY;
    const origX = ab.x, origY = ab.y;
    dragMoved = false;
    function onMove(ev){
      const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
      if(Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      ab.x = Math.max(0, origX + dx); ab.y = Math.max(0, origY + dy);
      wrap.style.left = ab.x + 'px'; wrap.style.top = ab.y + 'px';
    }
    function onUp(){
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if(dragMoved) repositionAddTile();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  titleWrap.addEventListener('click', function(e){
    e.stopPropagation();
    if(dragMoved) return;
    setActiveArtboard(ab.id);
    selectArtboardOnly(ab.id);
  });
  title.addEventListener('dblclick', function(e){ e.stopPropagation(); renameArtboard(ab); });
  wrap.addEventListener('mousedown', function(){ setActiveArtboard(ab.id); }, true);
  wrap.addEventListener('contextmenu', function(e){
    if(!state.editMode) return;
    e.preventDefault(); e.stopPropagation();
    setActiveArtboard(ab.id);
    selectArtboardOnly(ab.id);
    showContextMenu(e.clientX, e.clientY, artboardContextMenuItems(ab));
  });

  loadDocumentInto(ab, opts.html || DEFAULT_DOC, true);
  repositionAddTile();
  return ab;
}

function nextArtboardPosition(){
  if(!artboards.length) return { x: 60, y: 60 };
  let maxRight = 0;
  artboards.forEach(function(a){ maxRight = Math.max(maxRight, a.x + a.w); });
  return { x: maxRight + 80, y: 60 };
}

function repositionAddTile(){
  const tile = document.getElementById('addArtboardTile');
  if(!tile) return;
  const pos = nextArtboardPosition();
  tile.style.left = pos.x + 'px'; tile.style.top = pos.y + 'px';
}

function renameArtboard(ab){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'artboardTitleInput';
  input.value = ab.name;
  ab.dom.title.replaceWith(input);
  input.focus(); input.select();
  function commit(){
    const v = input.value.trim();
    ab.name = v || ab.name;
    ab.dom.title.textContent = ab.name;
    input.replaceWith(ab.dom.title);
    if(state.artboardMode && state.activeId === ab.id) renderArtboardProps(ab);
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(ev){
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); input.blur(); }
    else if(ev.key === 'Escape'){ input.value = ab.name; input.blur(); }
  });
}

function setActiveArtboard(id){
  artboards.forEach(function(a){ a.dom.wrap.classList.toggle('active', a.id === id); });
  if(state.activeId === id) return;
  state.activeId = id;
  state.selected = null;
  state.artboardMode = false;
  artboards.forEach(function(a){ a.dom.wrap.classList.remove('selected'); });
  renderLayers();
  renderProps();
  renderOverlay();
}

function selectArtboardOnly(id){
  setActiveArtboard(id);
  state.selected = null;
  state.artboardMode = true;
  artboards.forEach(function(a){ a.dom.wrap.classList.toggle('selected', a.id === id); });
  renderOverlay();
  renderProps();
  highlightLayerRow();
}

function setArtboardSize(ab, w, h){
  ab.w = w; ab.h = h;
  ab.dom.frame.style.width = w + 'px';
  ab.dom.frame.style.height = h + 'px';
  ab.dom.dims.textContent = w + '×' + h;
  stampArtboardSizeMeta(ab);
  if(state.activeId === ab.id) updateOverlayLive();
  repositionAddTile();
}

// stamps the artboard's size into a <meta> tag in its own document head, so
// exporting the .html and importing it again restores the same resolution.
function stampArtboardSizeMeta(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc || !doc.head) return;
  let meta = doc.head.querySelector('meta[name="ae-artboard-size"]');
  if(!meta){
    meta = doc.createElement('meta');
    meta.setAttribute('name', 'ae-artboard-size');
    doc.head.appendChild(meta);
  }
  meta.setAttribute('content', ab.w + 'x' + ab.h);
}

function extractArtboardSize(html){
  const m = html.match(/<meta\s+name=["']ae-artboard-size["']\s+content=["'](\d+)x(\d+)["']/i);
  return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null;
}

function applyZoom(){
  artboardsRow.style.transform = 'scale(' + state.zoom + ')';
  document.getElementById('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
}

function deleteArtboard(ab){
  if(artboards.length <= 1) { showAlert('Precisa ter ao menos um artboard.'); return; }
  ab.dom.wrap.remove();
  artboards = artboards.filter(function(a){ return a.id !== ab.id; });
  if(state.activeId === ab.id){
    state.activeId = null; state.selected = null; state.artboardMode = false;
    setActiveArtboard(artboards[0].id);
  }
  repositionAddTile();
}

function duplicateArtboard(ab){
  const html = currentHTMLFor(ab);
  const clone = createArtboard({ name: ab.name + ' cópia', w: ab.w, h: ab.h, html: html });
  setActiveArtboard(clone.id);
  selectArtboardOnly(clone.id);
}

// ---------- document load / history (per artboard) ----------

function loadDocumentInto(ab, html, pushHist){
  ab.dom.frame.setAttribute('srcdoc', html);
  ab.dom.frame.onload = function(){
    attachCanvasListeners(ab);
    stampArtboardSizeMeta(ab);
    if(pushHist !== false) pushHistoryFor(ab);
    if(state.activeId === ab.id){
      syncCodeFromCanvas();
      renderLayers();
      if(!state.artboardMode) selectElement(null);
    }
  };
}

function currentHTMLFor(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return DEFAULT_DOC;
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

function currentHTML(){
  const a = activeArtboard();
  return a ? currentHTMLFor(a) : DEFAULT_DOC;
}

// editor-only bookkeeping (custom layer names) stripped from the file the
// user actually downloads, so the exported artifact stays clean HTML.
function cleanExportHTML(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return DEFAULT_DOC;
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll('[data-ae-name]').forEach(function(n){ n.removeAttribute('data-ae-name'); });
  return '<!doctype html>\n' + clone.outerHTML;
}

function pushHistoryFor(ab){
  if(ab.suppressHistory) return;
  const html = currentHTMLFor(ab);
  if(ab.history[ab.historyIndex] === html) return;
  ab.history = ab.history.slice(0, ab.historyIndex + 1);
  ab.history.push(html);
  ab.historyIndex = ab.history.length - 1;
  if(state.activeId === ab.id) updateUndoRedoButtons();
}
function pushHistory(){ const a = activeArtboard(); if(a) pushHistoryFor(a); }

function undo(){
  const a = activeArtboard();
  if(!a || a.historyIndex <= 0) return;
  a.historyIndex--;
  a.suppressHistory = true;
  loadDocumentInto(a, a.history[a.historyIndex], false);
  a.dom.frame.onload = function(){
    attachCanvasListeners(a);
    syncCodeFromCanvas(); renderLayers(); selectElement(null);
    a.suppressHistory = false; updateUndoRedoButtons();
  };
}
function redo(){
  const a = activeArtboard();
  if(!a || a.historyIndex >= a.history.length - 1) return;
  a.historyIndex++;
  a.suppressHistory = true;
  loadDocumentInto(a, a.history[a.historyIndex], false);
  a.dom.frame.onload = function(){
    attachCanvasListeners(a);
    syncCodeFromCanvas(); renderLayers(); selectElement(null);
    a.suppressHistory = false; updateUndoRedoButtons();
  };
}
function updateUndoRedoButtons(){
  const a = activeArtboard();
  document.getElementById('btnUndo').disabled = !a || a.historyIndex <= 0;
  document.getElementById('btnRedo').disabled = !a || a.historyIndex >= a.history.length - 1;
}

// ---------- code panel sync ----------

let codeDebounce;
function syncCodeFromCanvas(){ codeArea.value = currentHTML(); }
function applyCodeToCanvas(){
  const a = activeArtboard();
  if(a) loadDocumentInto(a, codeArea.value, true);
}

// ---------- selection & overlay ----------

function isEditableEl(el, doc){
  if(!el || !doc || el === doc.documentElement || el === doc.body) return false;
  const tag = el.tagName;
  if(tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK' || tag === 'TITLE') return false;
  return true;
}

function selectElement(el){
  state.selected = el;
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

  const el = state.selected;
  const doc = getDoc();
  if(!el || !doc) return;
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
  const box = overlay.querySelector('.sel-box');
  if(box){ box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'; }
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

function startDrag(e, el){
  if(isFreeform(el)) startFreeMove(e, el);
  else startReorder(e, el);
}

// absolute/fixed elements: drag moves them freely via left/top.
function startFreeMove(e, el){
  e.preventDefault();
  const doc = getDoc();
  const frame = getFrame();
  const scale = state.zoom;
  const iframeRect = frame.getBoundingClientRect();
  const startXParent = iframeRect.left + e.clientX * scale;
  const startYParent = iframeRect.top + e.clientY * scale;
  const origLeft = parseFloat(el.style.left) || 0, origTop = parseFloat(el.style.top) || 0;
  const bounds = el.offsetParent || doc.body;
  const maxLeft = Math.max(0, bounds.clientWidth - el.offsetWidth);
  const maxTop = Math.max(0, bounds.clientHeight - el.offsetHeight);
  let started = false;
  catchPointer('move');

  function onMove(ev){
    const dx = (ev.clientX - startXParent) / scale, dy = (ev.clientY - startYParent) / scale;
    if(!started){
      if(Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      started = true;
    }
    el.style.left = Math.min(Math.max(0, origLeft + dx), maxLeft) + 'px';
    el.style.top = Math.min(Math.max(0, origTop + dy), maxTop) + 'px';
    updateOverlayLive();
  }
  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    releasePointer();
    if(started){ pushHistory(); syncCodeFromCanvas(); }
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// elements in normal flow: drag reorders el among its siblings instead of
// moving it freely — no position:absolute involved.
function startReorder(e, el){
  e.preventDefault();
  const doc = getDoc();
  const frame = getFrame();
  const parent = el.parentElement;
  const scale = state.zoom;
  let started = false;
  let prevOpacity;
  catchPointer('grabbing');

  function pick(clientX, clientY){
    const iframeRect = frame.getBoundingClientRect();
    const ix = (clientX - iframeRect.left) / scale;
    const iy = (clientY - iframeRect.top) / scale;
    let target = doc.elementFromPoint(ix, iy);
    while(target && target.parentElement !== parent && target !== parent) target = target.parentElement;
    if(!target || target === parent || target === el || !isEditableEl(target, doc)) return;
    const r = target.getBoundingClientRect();
    const pcs = doc.defaultView.getComputedStyle(parent);
    const isRow = (pcs.display === 'flex' || pcs.display === 'inline-flex') && (pcs.flexDirection || 'row').indexOf('row') === 0;
    const before = isRow ? (ix < r.left + r.width / 2) : (iy < r.top + r.height / 2);
    parent.insertBefore(el, before ? target : target.nextSibling);
  }

  function onMove(ev){
    if(!started){
      const iframeRect = frame.getBoundingClientRect();
      const sx = iframeRect.left + e.clientX * scale, sy = iframeRect.top + e.clientY * scale;
      if(Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
      started = true;
      prevOpacity = el.style.opacity;
      el.style.opacity = '0.5';
    }
    pick(ev.clientX, ev.clientY);
    updateOverlayLive();
  }
  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    releasePointer();
    if(started){
      el.style.opacity = prevOpacity;
      pushHistory(); syncCodeFromCanvas(); renderLayers(); highlightLayerRow();
    }
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ---------- artboard resize (handles on the artboard itself) ----------

function startArtboardResize(e, handle, ab){
  e.preventDefault(); e.stopPropagation();
  const scale = state.zoom;
  const startX = e.clientX, startY = e.clientY;
  const origX = ab.x, origY = ab.y, origW = ab.w, origH = ab.h;

  function onMove(ev){
    const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
    let x = origX, y = origY, w = origW, h = origH;
    if(handle.includes('e')) w = Math.max(120, origW + dx);
    if(handle.includes('s')) h = Math.max(80, origH + dy);
    if(handle.includes('w')){ w = Math.max(120, origW - dx); x = origX + (origW - w); }
    if(handle.includes('n')){ h = Math.max(80, origH - dy); y = origY + (origH - h); }
    ab.x = Math.max(0, x); ab.y = Math.max(0, y);
    ab.dom.wrap.style.left = ab.x + 'px'; ab.dom.wrap.style.top = ab.y + 'px';
    setArtboardSize(ab, Math.round(w), Math.round(h));
    renderOverlay();
  }
  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    renderArtboardProps(ab);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ---------- resize ----------

function startResize(e, handle){
  e.preventDefault(); e.stopPropagation();
  const el = state.selected;
  if(!el) return;
  const doc = getDoc();
  const free = isFreeform(el);
  const bounds = el.offsetParent || doc.body;
  catchPointer(getComputedStyle(e.target).cursor);
  const startX = e.clientX, startY = e.clientY;
  const scale = state.zoom;
  const origLeft = free ? (parseFloat(el.style.left) || 0) : 0;
  const origTop = free ? (parseFloat(el.style.top) || 0) : 0;
  const origW = parseFloat(el.style.width) || el.offsetWidth, origH = parseFloat(el.style.height) || el.offsetHeight;

  function onMove(ev){
    const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
    let left = origLeft, top = origTop, w = origW, h = origH;
    if(handle.includes('e')) w = Math.max(4, origW + dx);
    if(handle.includes('s')) h = Math.max(4, origH + dy);
    if(free && handle.includes('w')){ w = Math.max(4, origW - dx); left = origLeft + dx; }
    if(free && handle.includes('n')){ h = Math.max(4, origH - dy); top = origTop + dy; }
    if(free){
      left = Math.max(0, left);
      top = Math.max(0, top);
      w = Math.min(w, bounds.clientWidth - left);
      h = Math.min(h, bounds.clientHeight - top);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    } else {
      w = Math.min(w, bounds.clientWidth);
      h = Math.min(h, bounds.clientHeight);
    }
    el.style.width = w + 'px'; el.style.height = h + 'px';
    updateOverlayLive();
  }
  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    releasePointer();
    pushHistory(); syncCodeFromCanvas();
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ---------- canvas listeners (inside each artboard's iframe) ----------

function attachCanvasListeners(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return;

  doc.addEventListener('mousedown', function(e){
    setActiveArtboard(ab.id);
    if(!state.editMode) return;
    let target = e.target;
    if(!isEditableEl(target, doc)){ selectArtboardOnly(ab.id); return; }
    e.preventDefault(); e.stopPropagation();
    selectElement(target);
    // dragging (move/reorder) only starts with Shift held, so a plain
    // click never risks nudging anything — it only selects. (Not Alt:
    // most Linux window managers bind Alt+drag to moving the whole
    // browser window, which steals the gesture before it reaches us.)
    if(e.shiftKey) startDrag(e, target);
  }, true);

  doc.addEventListener('click', function(e){
    if(!state.editMode) return;
    const a = e.target.closest && e.target.closest('a');
    if(a) e.preventDefault();
  }, true);

  doc.addEventListener('dblclick', function(e){
    if(!state.editMode) return;
    const target = e.target;
    if(!isEditableEl(target, doc)) return;
    e.preventDefault(); e.stopPropagation();
    target.setAttribute('contenteditable', 'true');
    target.focus();
    function onBlur(){
      target.removeAttribute('contenteditable');
      target.removeEventListener('blur', onBlur);
      pushHistory(); syncCodeFromCanvas(); renderLayers();
    }
    target.addEventListener('blur', onBlur);
  }, true);

  doc.addEventListener('contextmenu', function(e){
    if(!state.editMode) return;
    e.preventDefault(); e.stopPropagation();
    const scale = state.zoom;
    const iframeRect = ab.dom.frame.getBoundingClientRect();
    const px = iframeRect.left + e.clientX * scale, py = iframeRect.top + e.clientY * scale;
    const target = e.target;
    if(isEditableEl(target, doc)){
      setActiveArtboard(ab.id);
      selectElement(target);
      showContextMenu(px, py, elementContextMenuItems(target));
    } else {
      setActiveArtboard(ab.id);
      selectArtboardOnly(ab.id);
      showContextMenu(px, py, artboardContextMenuItems(ab));
    }
  }, true);

  doc.defaultView.addEventListener('scroll', updateOverlayLive, true);
  doc.addEventListener('keydown', function(e){ handleGlobalKeydown(e, doc); if(e.key === 'Shift') setAltCursor(true); });
  doc.addEventListener('keyup', function(e){ if(e.key === 'Shift') setAltCursor(false); });

  // an OS file drag can enter directly over this iframe before dropHint
  // (in the parent document) has had a chance to raise itself above it —
  // handle it here too so dropping right on an artboard always works.
  ['dragenter', 'dragover'].forEach(function(evt){
    doc.addEventListener(evt, function(e){ e.preventDefault(); dropHint.classList.add('show'); });
  });
  doc.addEventListener('dragleave', function(e){ e.preventDefault(); dropHint.classList.remove('show'); });
  doc.addEventListener('drop', function(e){
    e.preventDefault();
    dropHint.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if(file) importHTMLFile(file);
  });
}

// hints that shift+drag is available the instant Shift goes down,
// regardless of which document (editor chrome or an artboard iframe)
// currently has focus.
function setAltCursor(active){
  const doc = getDoc();
  if(doc && doc.body) doc.body.style.cursor = (active && state.editMode) ? 'grab' : '';
}

// ---------- layers panel ----------

function shortLabel(el){
  if(el.dataset && el.dataset.aeName) return el.dataset.aeName;
  let s = el.tagName.toLowerCase();
  if(el.id) s += '#' + el.id;
  else if(el.className && typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/)[0];
  return s;
}

function renameLayer(el, tag){
  const current = shortLabel(el);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = el.dataset.aeName || '';
  input.placeholder = current;
  input.style.cssText = 'flex:1 1 auto; min-width:0; font-size:12.5px; padding:1px 4px;';
  tag.replaceWith(input);
  input.focus(); input.select();

  function commit(){
    const v = input.value.trim();
    if(v) el.dataset.aeName = v; else delete el.dataset.aeName;
    pushHistory(); syncCodeFromCanvas(); renderLayers(); highlightLayerRow();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(ev){
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); input.blur(); }
    else if(ev.key === 'Escape'){ input.value = el.dataset.aeName || ''; input.blur(); }
  });
}

let draggedLayerEl = null;
let collapsedLayers = new WeakSet();

function renderLayers(){
  layersTree.innerHTML = '';
  const doc = getDoc();
  if(!doc || !doc.body){ layersTree.innerHTML = '<div id="layersEmpty">Nenhum artboard ativo.</div>'; return; }

  const rootRow = document.createElement('div');
  rootRow.className = 'layerRow rootRow';
  rootRow.textContent = '(raiz do artboard)';
  rootRow.addEventListener('dragover', function(ev){
    if(!draggedLayerEl || draggedLayerEl.parentElement === doc.body) return;
    ev.preventDefault();
    rootRow.classList.add('dropTarget');
  });
  rootRow.addEventListener('dragleave', function(){ rootRow.classList.remove('dropTarget'); });
  rootRow.addEventListener('drop', function(ev){
    ev.preventDefault();
    rootRow.classList.remove('dropTarget');
    if(!draggedLayerEl) return;
    if(reparentElement(draggedLayerEl, doc.body)){
      pushHistory(); syncCodeFromCanvas(); renderLayers(); selectElement(draggedLayerEl);
    }
    draggedLayerEl = null;
  });
  layersTree.appendChild(rootRow);

  buildLayerRows(doc.body, layersTree, 0);
}

function buildLayerRows(parentEl, container, depth){
  Array.from(parentEl.children).forEach(function(el){
    const doc = getDoc();
    if(!isEditableEl(el, doc)) return;
    const row = document.createElement('div');
    row.className = 'layerRow';
    row.style.paddingLeft = (6 + depth * 14) + 'px';
    row._el = el;
    row.draggable = true;
    row.addEventListener('dragstart', function(ev){
      draggedLayerEl = el;
      ev.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', function(ev){
      if(!draggedLayerEl || draggedLayerEl === el || el.contains(draggedLayerEl)) return;
      ev.preventDefault();
      row.classList.add('dropTarget');
    });
    row.addEventListener('dragleave', function(){ row.classList.remove('dropTarget'); });
    row.addEventListener('drop', function(ev){
      ev.preventDefault();
      row.classList.remove('dropTarget');
      if(!draggedLayerEl) return;
      if(reparentElement(draggedLayerEl, el)){
        pushHistory(); syncCodeFromCanvas(); renderLayers(); selectElement(draggedLayerEl);
      }
      draggedLayerEl = null;
    });
    row.addEventListener('dragend', function(){ draggedLayerEl = null; });

    const editableChildren = Array.from(el.children).filter(function(c){ return isEditableEl(c, doc); });
    if(editableChildren.length){
      const chev = document.createElement('button');
      const collapsed = collapsedLayers.has(el);
      chev.className = 'chevron' + (collapsed ? ' collapsed' : '');
      chev.textContent = '▶';
      chev.title = collapsed ? 'Expandir' : 'Recolher';
      chev.addEventListener('click', function(ev){
        ev.stopPropagation();
        if(collapsedLayers.has(el)) collapsedLayers.delete(el); else collapsedLayers.add(el);
        renderLayers();
      });
      row.appendChild(chev);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'chevronSpacer';
      row.appendChild(spacer);
    }

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⋮⋮';
    row.appendChild(grip);

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = shortLabel(el);
    tag.title = 'Duplo clique pra renomear';
    tag.addEventListener('dblclick', function(ev){
      ev.stopPropagation();
      renameLayer(el, tag);
    });
    row.appendChild(tag);

    const icons = document.createElement('span');
    icons.className = 'icons';

    const eye = document.createElement('button');
    eye.className = 'iconBtn' + (el.style.display === 'none' ? ' hidden-state' : '');
    eye.textContent = (el.style.display === 'none') ? '🚫' : '👁';
    eye.title = 'Mostrar/ocultar';
    eye.addEventListener('click', function(ev){
      ev.stopPropagation();
      el.style.display = (el.style.display === 'none') ? '' : 'none';
      eye.textContent = (el.style.display === 'none') ? '🚫' : '👁';
      eye.classList.toggle('hidden-state', el.style.display === 'none');
      pushHistory(); syncCodeFromCanvas();
    });
    icons.appendChild(eye);

    const del = document.createElement('button');
    del.className = 'iconBtn'; del.textContent = '✕'; del.title = 'Excluir';
    del.addEventListener('click', function(ev){
      ev.stopPropagation();
      if(state.selected === el) selectElement(null);
      el.remove();
      pushHistory(); syncCodeFromCanvas(); renderLayers();
    });
    icons.appendChild(del);
    row.appendChild(icons);

    row.addEventListener('click', function(ev){ ev.stopPropagation(); selectElement(el); });
    container.appendChild(row);

    if(editableChildren.length && !collapsedLayers.has(el)){
      buildLayerRows(el, container, depth + 1);
    }
  });
}

function highlightLayerRow(){
  Array.from(layersTree.children).forEach(function(row){
    row.classList.toggle('selected', row._el === state.selected);
  });
}

// ---------- properties panel: artboard ----------

const ARTBOARD_PRESETS = [
  { label: 'Personalizado', w: null, h: null },
  { label: 'Desktop 1440×900', w: 1440, h: 900 },
  { label: 'Desktop 1280×800', w: 1280, h: 800 },
  { label: 'Tablet 768×1024', w: 768, h: 1024 },
  { label: 'Mobile 375×812', w: 375, h: 812 }
];

function renderArtboardProps(ab){
  const presetIdx = ARTBOARD_PRESETS.findIndex(function(p){ return p.w === ab.w && p.h === ab.h; });
  const presetOpts = ARTBOARD_PRESETS.map(function(p, i){
    return '<option value="' + i + '"' + (i === (presetIdx < 0 ? 0 : presetIdx) ? ' selected' : '') + '>' + p.label + '</option>';
  }).join('');

  propsBody.innerHTML =
    '<div class="propsSection">Artboard</div>' +
    '<div class="field"><label>Nome</label><input type="text" id="pAbName" value="' + ab.name.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="field"><label>Tamanho da tela</label><select id="pAbPreset">' + presetOpts + '</select></div>' +
    '<div class="row2">' +
      '<div class="field"><label>Largura</label><input type="number" id="pAbW" value="' + ab.w + '"></div>' +
      '<div class="field"><label>Altura</label><input type="number" id="pAbH" value="' + ab.h + '"></div>' +
    '</div>' +
    '<div class="field"><label>Fundo do artboard</label><input type="color" id="pAbBg" value="' + getArtboardBgHex(ab) + '"></div>' +
    '<hr>' +
    '<div class="field"><button id="pAbDup" style="width:100%">Duplicar artboard</button></div>' +
    '<div class="field"><button id="pAbDel" class="dangerBtn">Excluir artboard</button></div>';

  document.getElementById('pAbName').addEventListener('change', function(){
    ab.name = this.value.trim() || ab.name;
    ab.dom.title.textContent = ab.name;
  });
  document.getElementById('pAbPreset').addEventListener('change', function(){
    const p = ARTBOARD_PRESETS[parseInt(this.value)];
    if(p && p.w){ setArtboardSize(ab, p.w, p.h); renderArtboardProps(ab); }
  });
  document.getElementById('pAbW').addEventListener('change', function(){ setArtboardSize(ab, parseInt(this.value) || ab.w, ab.h); renderArtboardProps(ab); });
  document.getElementById('pAbH').addEventListener('change', function(){ setArtboardSize(ab, ab.w, parseInt(this.value) || ab.h); renderArtboardProps(ab); });
  document.getElementById('pAbBg').addEventListener('input', function(){
    const doc = getDoc();
    if(doc && doc.body) doc.body.style.backgroundColor = this.value;
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 300);
  });
  document.getElementById('pAbDup').addEventListener('click', function(){ duplicateArtboard(ab); });
  document.getElementById('pAbDel').addEventListener('click', async function(){
    if(await showConfirm('Excluir o artboard "' + ab.name + '"? Essa ação não pode ser desfeita.', 'Excluir artboard', true)) deleteArtboard(ab);
  });
}

function getArtboardBgHex(ab){
  const doc = getDoc();
  if(!doc || !doc.body) return '#ffffff';
  return rgbToHex(doc.defaultView.getComputedStyle(doc.body).backgroundColor);
}

// ---------- element attributes (not CSS — placeholder, href, alt…) ----------

function attributesSectionHTML(el, opts){
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  const tag = el.tagName;
  if(tag === 'INPUT'){
    return '<div class="propsSection">Campo (input)</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'checkbox', 'radio'], el.getAttribute('type') || 'text') + '</select></div>' +
        '<div class="field"><label>Nome</label><input type="text" id="pAttrName" value="' + esc(el.getAttribute('name')) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Placeholder</label><input type="text" id="pAttrPlaceholder" value="' + esc(el.getAttribute('placeholder')) + '"></div>' +
      '<div class="field"><label>Valor padrão</label><input type="text" id="pAttrValue" value="' + esc(el.getAttribute('value')) + '"></div>';
  }
  if(tag === 'TEXTAREA'){
    return '<div class="propsSection">Campo (textarea)</div>' +
      '<div class="field"><label>Nome</label><input type="text" id="pAttrName" value="' + esc(el.getAttribute('name')) + '"></div>' +
      '<div class="field"><label>Placeholder</label><input type="text" id="pAttrPlaceholder" value="' + esc(el.getAttribute('placeholder')) + '"></div>';
  }
  if(tag === 'A'){
    return '<div class="propsSection">Link</div>' +
      '<div class="field"><label>Endereço (href)</label><input type="text" id="pAttrHref" value="' + esc(el.getAttribute('href')) + '"></div>' +
      '<div class="field"><label>Abrir em</label><select id="pAttrTarget">' + opts(['_self', '_blank'], el.getAttribute('target') || '_self') + '</select></div>';
  }
  if(tag === 'IMG'){
    return '<div class="propsSection">Imagem</div>' +
      '<div class="field"><label>Texto alternativo (alt)</label><input type="text" id="pAttrAlt" value="' + esc(el.getAttribute('alt')) + '"></div>';
  }
  if(tag === 'BUTTON'){
    return '<div class="propsSection">Botão</div>' +
      '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['button', 'submit', 'reset'], el.getAttribute('type') || 'button') + '</select></div>';
  }
  return '';
}

function bindAttributesSection(el){
  function bindAttr(id, attr, evt){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener(evt || 'input', function(){
      if(input.value) el.setAttribute(attr, input.value); else el.removeAttribute(attr);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  bindAttr('pAttrType', 'type', 'change');
  bindAttr('pAttrName', 'name');
  bindAttr('pAttrPlaceholder', 'placeholder');
  bindAttr('pAttrValue', 'value');
  bindAttr('pAttrHref', 'href');
  bindAttr('pAttrTarget', 'target', 'change');
  bindAttr('pAttrAlt', 'alt');
}

// ---------- background pattern (dots / grid) ----------

function applyBgPattern(el, pattern, dotColor){
  if(pattern === 'none'){
    el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = '';
    return;
  }
  const c = dotColor || '#333849';
  if(pattern === 'dots'){
    el.style.backgroundImage = 'radial-gradient(' + c + ' 1px, transparent 1px)';
    el.style.backgroundSize = '22px 22px';
  } else if(pattern === 'grid'){
    el.style.backgroundImage = 'linear-gradient(' + c + ' 1px, transparent 1px), linear-gradient(90deg, ' + c + ' 1px, transparent 1px)';
    el.style.backgroundSize = '24px 24px';
  }
}

function currentBgPattern(el){
  const img = el.style.backgroundImage || '';
  if(img.indexOf('radial-gradient') === 0) return 'dots';
  if(img.indexOf('linear-gradient') === 0) return 'grid';
  return 'none';
}

// ---------- editing a shared CSS class rule (not just inline style) ----------
// Works on the raw text of the doc's <style> tag (not the live CSSOM) since
// CSSOM mutations don't reflect back into outerHTML/export.

function getStyleText(doc){
  const styleEl = doc.querySelector('style');
  return styleEl ? styleEl.textContent : '';
}
function setStyleText(doc, text){
  let styleEl = doc.querySelector('style');
  if(!styleEl){ styleEl = doc.createElement('style'); doc.head.appendChild(styleEl); }
  styleEl.textContent = text;
}
function findRuleBlock(cssText, selector){
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '\\s*\\{([\\s\\S]*?)\\}');
  const m = cssText.match(re);
  return m ? { full: m[0], body: m[1], index: m.index } : null;
}
function getClassRuleBody(doc, selector){
  const found = findRuleBlock(getStyleText(doc), selector);
  return found ? found.body.trim() : '';
}
function setClassRuleBody(doc, selector, newBody){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, selector);
  const block = selector + ' {\n  ' + newBody.trim().replace(/\n/g, '\n  ') + '\n}';
  const updated = found
    ? cssText.slice(0, found.index) + block + cssText.slice(found.index + found.full.length)
    : cssText + '\n\n' + block + '\n';
  setStyleText(doc, updated);
}

// ---------- properties panel: element ----------

function renderProps(){
  if(state.artboardMode){
    const a = activeArtboard();
    if(a){ renderArtboardProps(a); return; }
  }
  const el = state.selected;
  const doc = getDoc();
  if(!el || !doc){ propsBody.innerHTML = '<div id="propsEmpty">Nada selecionado.<br><br>Clique em um elemento, no título de um artboard, ou na lista de camadas.</div>'; return; }

  const cs = doc.defaultView.getComputedStyle(el);
  const bg = rgbToHex(cs.backgroundColor);
  const color = rgbToHex(cs.color);
  const displayVal = el.style.display || cs.display;
  const positionVal = el.style.position || cs.position;
  const isFlex = displayVal === 'flex' || displayVal === 'inline-flex';
  const free = positionVal === 'absolute' || positionVal === 'fixed';

  function opts(list, current){
    return list.map(function(v){ return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + v + '</option>'; }).join('');
  }
  function px(v){ return Math.round(parseFloat(v)) || 0; }

  const attrsHTML = attributesSectionHTML(el, opts);
  const classList = (el.className || '').trim().split(/\s+/).filter(Boolean);
  if(classList.length && !classList.includes(state.rulePickedClass)) state.rulePickedClass = classList[0];
  const ruleClass = classList.length ? state.rulePickedClass : null;

  const classRuleHTML = !classList.length ? '' :
    '<div class="propsSection">Regra CSS da classe</div>' +
    (classList.length > 1 ?
      '<div class="field"><label>Editando a classe</label><select id="pRuleClassPick">' +
        classList.map(function(c){ return '<option value="' + c + '"' + (c === ruleClass ? ' selected' : '') + '>.' + c + '</option>'; }).join('') +
      '</select></div>'
      : '<div class="field" style="color:var(--text-dim); font-size:12px;">Classe .' + ruleClass + '</div>') +
    '<div class="field"><textarea id="pClassRuleBody" rows="8" spellcheck="false" placeholder="background: #161920;\ncolor: #eef0f4;">' + getClassRuleBody(doc, '.' + ruleClass) + '</textarea></div>' +
    '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Isso edita a regra <code>.' + ruleClass + '</code> no &lt;style&gt; — afeta todo elemento que usa essa classe, não só este.</div>';

  propsBody.innerHTML =
    '<div class="field"><label>Elemento</label><div style="color:var(--text-dim)">' + shortLabel(el) + '</div></div>' +
    '<div class="field"><label>Classe (CSS)</label><input type="text" id="pClassName" value="' + (el.className || '').replace(/"/g, '&quot;') + '" placeholder="ex: btn-primary"></div>' +

    classRuleHTML +

    attrsHTML +

    '<div class="propsSection">Layout</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Display</label><select id="pDisplay">' + opts(['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none'], displayVal) + '</select></div>' +
      '<div class="field"><label>Posição</label><select id="pPosition">' + opts(['absolute', 'relative', 'static', 'fixed'], positionVal) + '</select></div>' +
    '</div>' +
    (isFlex ?
      '<div class="row2">' +
        '<div class="field"><label>Direção</label><select id="pFlexDir">' + opts(['row', 'column', 'row-reverse', 'column-reverse'], cs.flexDirection) + '</select></div>' +
        '<div class="field"><label>Quebra</label><select id="pFlexWrap">' + opts(['nowrap', 'wrap', 'wrap-reverse'], cs.flexWrap) + '</select></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Alinhar (align-items)</label><select id="pAlign">' + opts(['stretch', 'flex-start', 'center', 'flex-end'], cs.alignItems) + '</select></div>' +
        '<div class="field"><label>Distribuir (justify)</label><select id="pJustify">' + opts(['flex-start', 'center', 'flex-end', 'space-between', 'space-around'], cs.justifyContent) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Gap (px)</label><input type="number" id="pGap" value="' + (parseFloat(cs.gap) || 0) + '"></div>'
      : '') +

    '<div class="propsSection">Posição livre</div>' +
    (free ?
      '<div class="row2">' +
        '<div class="field"><label>X</label><input type="number" id="pX"></div>' +
        '<div class="field"><label>Y</label><input type="number" id="pY"></div>' +
      '</div>' +
      '<div class="field"><label>Z-index</label><input type="number" id="pZ" value="' + (parseInt(el.style.zIndex) || 0) + '"></div>'
      : '<div class="field" style="color:var(--text-dim); font-size:12px;">Elemento em fluxo normal — arraste no artboard (Shift+arraste) pra reordenar entre os irmãos, ou mude Posição pra "absolute" aqui em cima pra posicionar livremente.</div>') +

    '<div class="propsSection">Tamanho</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Largura</label><div class="fieldRow"><input type="number" id="pW"><button type="button" class="miniBtn" id="pWFill" title="100% da largura do pai">100%</button></div></div>' +
      '<div class="field"><label>Altura</label><div class="fieldRow"><input type="number" id="pH"><button type="button" class="miniBtn" id="pHFill" title="100% da altura do pai">100%</button></div></div>' +
    '</div>' +

    '<div class="propsSection">Aparência</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fundo</label><input type="color" id="pBg" value="' + bg + '"></div>' +
      '<div class="field"><label>Texto</label><input type="color" id="pColor" value="' + color + '"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fonte (px)</label><input type="number" id="pFont" value="' + (parseFloat(cs.fontSize) || 14) + '"></div>' +
      '<div class="field"><label>Cantos (px)</label><input type="number" id="pRadius" value="' + (parseFloat(cs.borderRadius) || 0) + '"></div>' +
    '</div>' +
    '<div class="field"><label>Opacidade (' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '%)</label><input type="range" id="pOpacity" min="0" max="100" value="' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '"></div>' +
    '<div class="row2">' +
      '<div class="field"><label>Padrão de fundo</label><select id="pBgPattern">' + opts(['none', 'dots', 'grid'], currentBgPattern(el)) + '</select></div>' +
      '<div class="field"><label>Cor do padrão</label><input type="color" id="pBgPatternColor" value="' + rgbToHex(cs.borderTopColor) + '"></div>' +
    '</div>' +

    '<div class="propsSection">Padding</div>' +
    '<div class="row4">' +
      '<div class="field"><label>Topo</label><input type="number" id="pPadT" value="' + px(cs.paddingTop) + '"></div>' +
      '<div class="field"><label>Dir.</label><input type="number" id="pPadR" value="' + px(cs.paddingRight) + '"></div>' +
      '<div class="field"><label>Baixo</label><input type="number" id="pPadB" value="' + px(cs.paddingBottom) + '"></div>' +
      '<div class="field"><label>Esq.</label><input type="number" id="pPadL" value="' + px(cs.paddingLeft) + '"></div>' +
    '</div>' +

    '<div class="propsSection">Margin</div>' +
    '<div class="row4">' +
      '<div class="field"><label>Topo</label><input type="number" id="pMarT" value="' + px(cs.marginTop) + '"></div>' +
      '<div class="field"><label>Dir.</label><input type="number" id="pMarR" value="' + px(cs.marginRight) + '"></div>' +
      '<div class="field"><label>Baixo</label><input type="number" id="pMarB" value="' + px(cs.marginBottom) + '"></div>' +
      '<div class="field"><label>Esq.</label><input type="number" id="pMarL" value="' + px(cs.marginLeft) + '"></div>' +
    '</div>' +

    '<div class="propsSection">Borda</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Espessura (px)</label><input type="number" id="pBorderW" value="' + px(cs.borderTopWidth) + '"></div>' +
      '<div class="field"><label>Estilo</label><select id="pBorderStyle">' + opts(['none', 'solid', 'dashed', 'dotted'], cs.borderTopStyle === 'none' ? 'none' : cs.borderTopStyle) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Cor da borda</label><input type="color" id="pBorderColor" value="' + rgbToHex(cs.borderTopColor) + '"></div>' +

    '<hr>' +
    '<div class="field"><label>CSS livre (style)</label><textarea id="pStyle" rows="6" spellcheck="false">' + (el.getAttribute('style') || '') + '</textarea></div>';

  const rect = elRectToStage(el);
  if(free){
    document.getElementById('pX').value = Math.round(parseFloat(el.style.left) || rect.left);
    document.getElementById('pY').value = Math.round(parseFloat(el.style.top) || rect.top);
  }
  document.getElementById('pW').value = Math.round(rect.width);
  document.getElementById('pH').value = Math.round(rect.height);

  bindAttributesSection(el);
  document.getElementById('pClassName').addEventListener('change', function(){
    el.className = this.value;
    pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
  });

  if(ruleClass){
    const pickEl = document.getElementById('pRuleClassPick');
    if(pickEl) pickEl.addEventListener('change', function(){ state.rulePickedClass = this.value; renderProps(); });
    const bodyEl = document.getElementById('pClassRuleBody');
    bodyEl.addEventListener('change', function(){
      setClassRuleBody(doc, '.' + ruleClass, bodyEl.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }

  const pBgPattern = document.getElementById('pBgPattern');
  const pBgPatternColor = document.getElementById('pBgPatternColor');
  function applyPattern(){
    applyBgPattern(el, pBgPattern.value, pBgPatternColor.value);
    pushHistory(); syncCodeFromCanvas();
  }
  pBgPattern.addEventListener('change', applyPattern);
  pBgPatternColor.addEventListener('input', applyPattern);

  const pDisplay = document.getElementById('pDisplay');
  pDisplay.addEventListener('change', function(){
    el.style.display = pDisplay.value;
    pushHistory(); syncCodeFromCanvas(); renderLayers();
    renderProps();
    updateOverlayLive();
  });
  const pPosition = document.getElementById('pPosition');
  pPosition.addEventListener('change', function(){
    const v = pPosition.value;
    if(v === 'absolute' || v === 'fixed'){ ensureAbsolute(el); el.style.position = v; }
    else { el.style.position = v; }
    pushHistory(); syncCodeFromCanvas(); renderOverlay();
    renderProps();
    updateOverlayLive();
  });
  if(isFlex){
    bindProp('pFlexDir', function(v){ el.style.flexDirection = v; }, 'change');
    bindProp('pFlexWrap', function(v){ el.style.flexWrap = v; }, 'change');
    bindProp('pAlign', function(v){ el.style.alignItems = v; }, 'change');
    bindProp('pJustify', function(v){ el.style.justifyContent = v; }, 'change');
    bindProp('pGap', function(v){ el.style.gap = v + 'px'; });
  }
  if(free){ bindProp('pZ', function(v){ el.style.zIndex = v; }); }

  document.getElementById('pWFill').addEventListener('click', function(){
    el.style.width = '100%';
    pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps();
  });
  document.getElementById('pHFill').addEventListener('click', function(){
    el.style.height = '100%';
    pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps();
  });

  bindProp('pX', function(v){ el.style.left = v + 'px'; });
  bindProp('pY', function(v){ el.style.top = v + 'px'; });
  bindProp('pW', function(v){ el.style.width = v + 'px'; });
  bindProp('pH', function(v){ el.style.height = v + 'px'; });
  bindProp('pBg', function(v){ el.style.backgroundColor = v; }, 'change');
  bindProp('pColor', function(v){ el.style.color = v; }, 'change');
  bindProp('pFont', function(v){ el.style.fontSize = v + 'px'; });
  bindProp('pRadius', function(v){ el.style.borderRadius = v + 'px'; });
  bindProp('pOpacity', function(v){ el.style.opacity = (v / 100); });

  bindProp('pPadT', function(v){ el.style.paddingTop = v + 'px'; });
  bindProp('pPadR', function(v){ el.style.paddingRight = v + 'px'; });
  bindProp('pPadB', function(v){ el.style.paddingBottom = v + 'px'; });
  bindProp('pPadL', function(v){ el.style.paddingLeft = v + 'px'; });

  bindProp('pMarT', function(v){ el.style.marginTop = v + 'px'; });
  bindProp('pMarR', function(v){ el.style.marginRight = v + 'px'; });
  bindProp('pMarB', function(v){ el.style.marginBottom = v + 'px'; });
  bindProp('pMarL', function(v){ el.style.marginLeft = v + 'px'; });

  bindProp('pBorderW', function(v){ el.style.borderWidth = v + 'px'; if(parseFloat(v) > 0 && (!el.style.borderStyle || el.style.borderStyle === 'none')) el.style.borderStyle = 'solid'; });
  bindProp('pBorderStyle', function(v){ el.style.borderStyle = v; }, 'change');
  bindProp('pBorderColor', function(v){ el.style.borderColor = v; }, 'change');

  bindProp('pStyle', function(v){ el.setAttribute('style', v); }, 'change');
}

function bindProp(id, fn, evt){
  const input = document.getElementById(id);
  if(!input) return;
  input.addEventListener(evt || 'input', function(){
    fn(input.value);
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  });
}

function rgbToHex(rgb){
  if(!rgb || rgb.indexOf('rgb') !== 0) return '#ffffff';
  const nums = rgb.match(/[\d.]+/g).map(Number);
  return '#' + nums.slice(0, 3).map(function(n){ return n.toString(16).padStart(2, '0'); }).join('');
}

// ---------- add elements ----------

// new elements are appended in normal flow — inside the current selection
// if it can hold children, otherwise at the end of the active artboard's body.
function insertionContainer(doc){
  if(!state.artboardMode && state.selected && isEditableEl(state.selected, doc) && state.selected.tagName !== 'IMG') return state.selected;
  return doc.body;
}

const ELEMENT_TEMPLATES = {
  rect: { label: '▭ Div (retângulo)', build: function(doc){
    const el = doc.createElement('div');
    el.style.cssText = 'width:180px; height:100px; background:#6d8bff; border-radius:8px; margin:0 0 12px;';
    return el;
  } },
  text: { label: 'T Texto (div)', build: function(doc){
    const el = doc.createElement('div');
    el.textContent = 'Texto';
    el.style.cssText = 'font-size:20px; color:#1b1d23; margin:0 0 12px;';
    return el;
  } },
  span: { label: 'Span (texto em linha)', build: function(doc){
    const el = doc.createElement('span');
    el.textContent = 'texto';
    el.style.cssText = 'font-size:16px; color:#1b1d23;';
    return el;
  } },
  p: { label: 'Parágrafo', build: function(doc){
    const el = doc.createElement('p');
    el.textContent = 'Parágrafo de texto de exemplo.';
    el.style.cssText = 'font-size:15px; color:#333; line-height:1.6; margin:0 0 12px; max-width:480px;';
    return el;
  } },
  h1: { label: 'Título (h1)', build: function(doc){
    const el = doc.createElement('h1');
    el.textContent = 'Título';
    el.style.cssText = 'font-size:32px; font-weight:700; margin:0 0 12px; color:#1b1d23;';
    return el;
  } },
  button: { label: 'Botão', build: function(doc){
    const el = doc.createElement('button');
    el.textContent = 'Botão';
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 18px; background:#6d8bff; color:#fff; border:none; border-radius:8px; cursor:pointer; margin:0 0 12px;';
    return el;
  } },
  a: { label: 'Link', build: function(doc){
    const el = doc.createElement('a');
    el.textContent = 'Link'; el.href = '#';
    el.style.cssText = 'color:#6d8bff; text-decoration:underline; font-size:15px;';
    return el;
  } },
  ul: { label: 'Lista', build: function(doc){
    const el = doc.createElement('ul');
    el.style.cssText = 'margin:0 0 12px; padding-left:20px; font-size:15px; color:#1b1d23;';
    ['Item 1', 'Item 2', 'Item 3'].forEach(function(t){ const li = doc.createElement('li'); li.textContent = t; el.appendChild(li); });
    return el;
  } },
  table: { label: 'Tabela', build: function(doc){
    const el = doc.createElement('table');
    el.style.cssText = 'border-collapse:collapse; margin:0 0 12px; font-size:14px; color:#1b1d23;';
    function row(cells, isHead){
      const tr = doc.createElement('tr');
      cells.forEach(function(t){
        const c = doc.createElement(isHead ? 'th' : 'td');
        c.textContent = t;
        c.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
        tr.appendChild(c);
      });
      return tr;
    }
    el.appendChild(row(['Coluna A', 'Coluna B'], true));
    el.appendChild(row(['Valor 1', 'Valor 2']));
    el.appendChild(row(['Valor 3', 'Valor 4']));
    return el;
  } },
  nav: { label: 'Nav (navegação)', build: function(doc){
    const el = doc.createElement('nav');
    el.style.cssText = 'display:flex; gap:20px; align-items:center; margin:0 0 12px;';
    ['Início', 'Sobre', 'Contato'].forEach(function(t){
      const a = doc.createElement('a');
      a.textContent = t; a.href = '#';
      a.style.cssText = 'color:#1b1d23; text-decoration:none; font-size:14px; font-weight:600;';
      el.appendChild(a);
    });
    return el;
  } },
  section: { label: 'Section', build: function(doc){
    const el = doc.createElement('section');
    el.style.cssText = 'padding:24px; background:#f4f5f7; border-radius:12px; margin:0 0 12px;';
    return el;
  } },
  header: { label: 'Header', build: function(doc){
    const el = doc.createElement('header');
    el.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:16px 0; margin:0 0 12px;';
    return el;
  } },
  footer: { label: 'Footer', build: function(doc){
    const el = doc.createElement('footer');
    el.style.cssText = 'padding:16px 0; color:#666; font-size:13px; margin:0 0 12px;';
    return el;
  } },
  input: { label: 'Input (campo)', build: function(doc){
    const el = doc.createElement('input');
    el.type = 'text'; el.placeholder = 'Digite aqui...';
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block;';
    return el;
  } }
};

function addElement(type){
  const doc = getDoc();
  const tpl = ELEMENT_TEMPLATES[type];
  if(!doc || !tpl) return;
  const el = tpl.build(doc);
  insertionContainer(doc).appendChild(el);
  selectElement(el);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
  return el;
}

function showAddElementMenu(x, y){
  const items = Object.keys(ELEMENT_TEMPLATES).map(function(key){
    return { label: ELEMENT_TEMPLATES[key].label, action: function(){ addElement(key); } };
  });
  items.push({ separator: true });
  items.push({ label: '🖼 Imagem…', action: function(){ document.getElementById('imageInput').click(); } });
  showContextMenu(x, y, items);
}

function addImageFromFile(file){
  const doc = getDoc();
  if(!doc) return;
  const reader = new FileReader();
  reader.onload = function(){
    const img = doc.createElement('img');
    img.src = reader.result;
    img.style.cssText = 'display:block; width:220px; height:auto; margin:0 0 12px;';
    insertionContainer(doc).appendChild(img);
    selectElement(img);
    renderLayers();
    pushHistory(); syncCodeFromCanvas();
  };
  reader.readAsDataURL(file);
}

// ---------- duplicate / delete ----------

function duplicateSelected(){
  if(state.artboardMode){ const a = activeArtboard(); if(a) duplicateArtboard(a); return; }
  const el = state.selected;
  if(!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.insertBefore(clone, el.nextSibling);
  if(isFreeform(el)){
    const left = (parseFloat(el.style.left) || 0) + 20;
    const top = (parseFloat(el.style.top) || 0) + 20;
    clone.style.left = left + 'px'; clone.style.top = top + 'px';
  }
  selectElement(clone);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

async function deleteSelected(){
  if(state.artboardMode){
    const a = activeArtboard();
    if(a && await showConfirm('Excluir o artboard "' + a.name + '"? Essa ação não pode ser desfeita.', 'Excluir artboard', true)) deleteArtboard(a);
    return;
  }
  const el = state.selected;
  if(!el) return;
  selectElement(null);
  el.remove();
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

// ---------- projects (.json file on disk) ----------
// a project is the full set of artboards, saved together as one file.

function serializeProject(){
  return JSON.stringify({
    type: 'arclane-project', version: 1,
    savedAt: new Date().toISOString(),
    artboards: artboards.map(function(a){ return { name: a.name, w: a.w, h: a.h, html: currentHTMLFor(a) }; })
  }, null, 2);
}

function saveProjectAs(name){
  downloadFile(name + '.json', serializeProject(), 'application/json');
  state.currentProject = name;
}

function openProjectFromFile(file){
  const reader = new FileReader();
  reader.onload = function(){
    let data;
    try { data = JSON.parse(reader.result); } catch(e){ showAlert('Esse arquivo não é um projeto válido do Arclane.'); return; }
    if(!data || !Array.isArray(data.artboards)){ showAlert('Esse arquivo não é um projeto válido do Arclane.'); return; }
    clearAllArtboards();
    state.currentProject = file.name.replace(/\.json$/i, '');
    let first = null;
    data.artboards.forEach(function(a){
      const created = createArtboard({ name: a.name, w: a.w || 1440, h: a.h || 900, html: a.html });
      if(!first) first = created;
    });
    if(!first) first = createArtboard({});
    setActiveArtboard(first.id);
  };
  reader.readAsText(file);
}

function clearAllArtboards(){
  artboards.forEach(function(a){ a.dom.wrap.remove(); });
  artboards = [];
  state.activeId = null; state.selected = null; state.artboardMode = false;
}

// ---------- toolbar wiring ----------

function nextArtboardSize(){
  const v = document.getElementById('artboardPreset').value.split('x').map(Number);
  return { w: v[0], h: v[1] };
}

document.getElementById('btnNew').addEventListener('click', function(){
  const size = nextArtboardSize();
  const ab = createArtboard({ w: size.w, h: size.h });
  state.currentProject = null;
  setActiveArtboard(ab.id);
  selectArtboardOnly(ab.id);
  ab.dom.wrap.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});

document.getElementById('btnImport').addEventListener('click', function(){ document.getElementById('fileInput').click(); });
// shared by the Importar button, dropping a .html file on the canvas, and
// dropping one directly on an artboard — creates a new artboard from the
// file, restoring its original resolution when the file carries our
// ae-artboard-size meta tag (written on export).
function importHTMLFile(file){
  const reader = new FileReader();
  reader.onload = function(){
    const size = extractArtboardSize(reader.result);
    const ab = createArtboard({
      name: file.name.replace(/\.html?$/i, ''),
      html: reader.result,
      w: size ? size.w : undefined,
      h: size ? size.h : undefined
    });
    state.currentProject = null;
    setActiveArtboard(ab.id);
  };
  reader.readAsText(file);
}

document.getElementById('fileInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(file) importHTMLFile(file);
  e.target.value = '';
});

function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = filename;
  el.click();
  URL.revokeObjectURL(url);
}

function extractCSSFromDoc(doc){
  return Array.from(doc.querySelectorAll('style')).map(function(s){ return s.textContent; }).join('\n\n');
}

document.getElementById('btnExport').addEventListener('click', function(e){
  e.stopPropagation();
  const a = activeArtboard();
  if(!a) return;
  const base = a.name || 'artifact';
  const r = e.target.getBoundingClientRect();
  showContextMenu(r.left, r.bottom + 4, [
    { label: '.html completo (HTML + CSS)', action: function(){ downloadFile(base + '.html', cleanExportHTML(a), 'text/html'); } },
    { separator: true },
    { label: 'Apenas HTML (linkando ' + base + '.css)', action: function(){
      const html = cleanExportHTML(a).replace(/<style>[\s\S]*?<\/style>\n?/i, '<link rel="stylesheet" href="' + base + '.css">\n');
      downloadFile(base + '.html', html, 'text/html');
    } },
    { label: 'Apenas CSS', action: function(){
      let doc; try { doc = a.dom.frame.contentDocument; } catch(err){ doc = null; }
      downloadFile(base + '.css', doc ? extractCSSFromDoc(doc) : '', 'text/css');
    } }
  ]);
});

document.getElementById('btnSave').addEventListener('click', async function(){
  const name = state.currentProject || await showPrompt('Nome do projeto:', '', 'Salvar projeto');
  if(!name) return;
  saveProjectAs(name);
});
document.getElementById('btnSaveAs').addEventListener('click', async function(){
  const name = await showPrompt('Nome do projeto:', state.currentProject || '', 'Salvar como novo projeto');
  if(!name) return;
  saveProjectAs(name);
});
document.getElementById('btnOpenProject').addEventListener('click', function(){ document.getElementById('projectFileInput').click(); });
document.getElementById('projectFileInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(file) openProjectFromFile(file);
  e.target.value = '';
});

document.getElementById('modeEdit').addEventListener('click', function(){ setMode(true); });
document.getElementById('modePreview').addEventListener('click', function(){ setMode(false); });
function setMode(edit){
  state.editMode = edit;
  document.getElementById('modeEdit').classList.toggle('active', edit);
  document.getElementById('modePreview').classList.toggle('active', !edit);
  if(!edit){ state.selected = null; state.artboardMode = false; }
  renderOverlay();
}

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnDup').addEventListener('click', duplicateSelected);
document.getElementById('btnDelete').addEventListener('click', deleteSelected);

document.getElementById('addElementBtn').addEventListener('click', function(e){
  e.stopPropagation();
  const r = e.target.getBoundingClientRect();
  showAddElementMenu(r.left, r.bottom + 4);
});
document.getElementById('imageInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(file) addImageFromFile(file);
  e.target.value = '';
});

document.getElementById('zoomIn').addEventListener('click', function(){ state.zoom = Math.min(3, state.zoom + 0.1); applyZoom(); renderOverlay(); });
document.getElementById('zoomOut').addEventListener('click', function(){ state.zoom = Math.max(0.1, state.zoom - 0.1); applyZoom(); renderOverlay(); });
document.getElementById('zoomReset').addEventListener('click', function(){ state.zoom = 1; applyZoom(); renderOverlay(); });
canvasWrap.addEventListener('wheel', function(e){
  if(!e.ctrlKey) return;
  e.preventDefault();
  state.zoom = Math.max(0.1, Math.min(3, state.zoom + (e.deltaY < 0 ? 0.05 : -0.05)));
  applyZoom(); renderOverlay();
}, { passive: false });

document.getElementById('btnCode').addEventListener('click', function(){
  codePanel.classList.toggle('open');
  if(codePanel.classList.contains('open')) syncCodeFromCanvas();
});
document.getElementById('btnCodeApply').addEventListener('click', applyCodeToCanvas);
document.getElementById('btnCodeCopy').addEventListener('click', function(){
  codeArea.select();
  document.execCommand('copy');
});

document.getElementById('btnTheme').addEventListener('click', function(){
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ae_theme', next);
});

// click on empty canvas (not on any artboard) clears selection entirely
canvasWrap.addEventListener('mousedown', function(e){
  if(e.target === canvasWrap || e.target === artboardsRow){
    state.selected = null; state.artboardMode = false;
    artboards.forEach(function(a){ a.dom.wrap.classList.remove('selected'); });
    renderOverlay(); renderProps(); highlightLayerRow();
  }
});
canvasWrap.addEventListener('contextmenu', function(e){
  if(e.target !== canvasWrap && e.target !== artboardsRow) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, [
    { label: '+ Novo artboard', action: function(){ document.getElementById('btnNew').click(); } }
  ]);
});

// drag & drop a .html file anywhere on the canvas creates a new artboard.
// dropHint is pointer-events:auto while shown so it — not whichever
// artboard's iframe happens to be underneath — receives the drop.
['dragenter', 'dragover'].forEach(function(evt){
  canvasWrap.addEventListener(evt, function(e){ e.preventDefault(); dropHint.classList.add('show'); });
});
['dragleave', 'drop'].forEach(function(evt){
  canvasWrap.addEventListener(evt, function(e){ e.preventDefault(); dropHint.classList.remove('show'); });
});
canvasWrap.addEventListener('drop', function(e){
  const file = e.dataTransfer.files[0];
  if(file) importHTMLFile(file);
});

// ---------- clipboard ----------

let clipboardEl = null;
function copySelected(){ if(state.selected) clipboardEl = state.selected.cloneNode(true); }
function pasteClipboard(){
  const doc = getDoc();
  if(!clipboardEl || !doc) return;
  const clone = clipboardEl.cloneNode(true);
  const anchor = state.selected;
  if(anchor && anchor.parentNode){
    anchor.parentNode.insertBefore(clone, anchor.nextSibling);
    if(isFreeform(clone)){
      clone.style.left = (parseFloat(clone.style.left) || 0) + 20 + 'px';
      clone.style.top = (parseFloat(clone.style.top) || 0) + 20 + 'px';
    }
  } else {
    insertionContainer(doc).appendChild(clone);
  }
  selectElement(clone);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

// ---------- keyboard shortcuts ----------
// shared handler — attached to both the editor chrome document and every
// artboard iframe's own document, since focus (and so keydown) lands on
// whichever one the user last clicked into.
function handleGlobalKeydown(e, activeDoc){
  if(document.getElementById('modalOverlay').classList.contains('open')) return;
  const tag = (activeDoc.activeElement && activeDoc.activeElement.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || (activeDoc.activeElement && activeDoc.activeElement.isContentEditable)){
    if(e.ctrlKey && e.key.toLowerCase() === 's'){ e.preventDefault(); document.getElementById('btnSave').click(); }
    return;
  }
  if(e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey){ e.preventDefault(); undo(); }
  else if(e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))){ e.preventDefault(); redo(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'd'){ e.preventDefault(); duplicateSelected(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'c'){ if(state.selected){ e.preventDefault(); copySelected(); } }
  else if(e.ctrlKey && e.key.toLowerCase() === 'v'){ if(clipboardEl){ e.preventDefault(); pasteClipboard(); } }
  else if(e.ctrlKey && e.key.toLowerCase() === 's'){ e.preventDefault(); document.getElementById('btnSave').click(); }
  else if(e.key === 'Delete' || e.key === 'Backspace'){ if(state.selected || state.artboardMode){ e.preventDefault(); deleteSelected(); } }
  else if(e.key === 'Escape'){ state.selected = null; state.artboardMode = false; renderOverlay(); renderProps(); highlightLayerRow(); }
}

document.addEventListener('keydown', function(e){ handleGlobalKeydown(e, document); if(e.key === 'Shift') setAltCursor(true); });
document.addEventListener('keyup', function(e){ if(e.key === 'Shift') setAltCursor(false); });
window.addEventListener('blur', function(){ setAltCursor(false); });
window.addEventListener('resize', updateOverlayLive);

// ---------- modal (replaces prompt/confirm/alert) ----------

function showModal(opts){
  const overlay = document.getElementById('modalOverlay');
  const input = document.getElementById('modalInput');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  const hasInput = opts.input !== undefined;

  document.getElementById('modalTitle').textContent = opts.title || '';
  document.getElementById('modalMsg').textContent = opts.message || '';
  input.style.display = hasInput ? 'block' : 'none';
  if(hasInput){ input.value = opts.input || ''; input.placeholder = opts.placeholder || ''; }
  confirmBtn.textContent = opts.confirmText || 'OK';
  confirmBtn.className = opts.danger ? 'dangerBtn' : '';
  cancelBtn.style.display = opts.hideCancel ? 'none' : '';
  overlay.classList.add('open');
  if(hasInput) setTimeout(function(){ input.focus(); input.select(); }, 0);
  else confirmBtn.focus();

  return new Promise(function(resolve){
    function cleanup(){
      overlay.classList.remove('open');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onInputKey);
      overlay.removeEventListener('keydown', onOverlayKey);
    }
    function onConfirm(){ cleanup(); resolve(hasInput ? input.value.trim() : true); }
    function onCancel(){ cleanup(); resolve(hasInput ? null : false); }
    function onInputKey(ev){ ev.stopPropagation(); if(ev.key === 'Enter'){ ev.preventDefault(); onConfirm(); } }
    function onOverlayKey(ev){ ev.stopPropagation(); if(ev.key === 'Escape'){ onCancel(); } }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onInputKey);
    overlay.addEventListener('keydown', onOverlayKey);
  });
}
function showAlert(message, title){ return showModal({ title: title || 'Aviso', message: message, hideCancel: true, confirmText: 'OK' }); }
function showConfirm(message, title, danger){ return showModal({ title: title || 'Confirmar', message: message, confirmText: 'Confirmar', danger: danger }); }
function showPrompt(message, defaultValue, title){ return showModal({ title: title || message, message: '', input: defaultValue || '', placeholder: message }); }

// ---------- context menu ----------

let lastMenuX = 0, lastMenuY = 0;
function showContextMenu(x, y, items){
  lastMenuX = x; lastMenuY = y;
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = '';
  items.forEach(function(it){
    if(it.separator){ const sep = document.createElement('div'); sep.className = 'ctxSep'; menu.appendChild(sep); return; }
    const btn = document.createElement('button');
    btn.className = 'ctxItem' + (it.danger ? ' danger' : '');
    btn.textContent = it.label;
    if(it.disabled) btn.disabled = true;
    btn.addEventListener('click', function(ev){ ev.stopPropagation(); hideContextMenu(); it.action(); });
    menu.appendChild(btn);
  });
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.classList.add('open');
  requestAnimationFrame(function(){
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - r.width - 8) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - r.height - 8) + 'px';
  });
}
function hideContextMenu(){ document.getElementById('contextMenu').classList.remove('open'); }
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', hideContextMenu);

async function renameElementPrompt(el){
  const v = await showPrompt('Nome da camada:', el.dataset.aeName || '', 'Renomear elemento');
  if(v === null) return;
  if(v.trim()) el.dataset.aeName = v.trim(); else delete el.dataset.aeName;
  pushHistory(); syncCodeFromCanvas(); renderLayers(); highlightLayerRow();
}

function addTableRow(table){
  const doc = table.ownerDocument;
  const rows = table.querySelectorAll('tr');
  const lastRow = rows[rows.length - 1] || null;
  const cellCount = lastRow ? lastRow.children.length : 2;
  const tr = doc.createElement('tr');
  for(let i = 0; i < cellCount; i++){
    const td = doc.createElement('td');
    td.textContent = 'Valor';
    td.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    tr.appendChild(td);
  }
  table.appendChild(tr);
  selectElement(tr);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function addTableColumn(table){
  const doc = table.ownerDocument;
  table.querySelectorAll('tr').forEach(function(row){
    const isHead = !!row.querySelector('th');
    const cell = doc.createElement(isHead ? 'th' : 'td');
    cell.textContent = isHead ? 'Nova coluna' : 'Valor';
    cell.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    row.appendChild(cell);
  });
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function addListItem(list){
  const doc = list.ownerDocument;
  const li = doc.createElement('li');
  li.textContent = 'Item ' + (list.children.length + 1);
  list.appendChild(li);
  selectElement(li);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function elementContextMenuItems(el){
  const items = [
    { label: '+ Adicionar elemento aqui dentro', action: function(){ showAddElementMenu(lastMenuX, lastMenuY); } }
  ];
  const table = el.tagName === 'TABLE' ? el : (el.closest ? el.closest('table') : null);
  if(table){
    items.push({ separator: true });
    items.push({ label: '+ Adicionar linha', action: function(){ addTableRow(table); } });
    items.push({ label: '+ Adicionar coluna', action: function(){ addTableColumn(table); } });
  }
  const list = (el.tagName === 'UL' || el.tagName === 'OL') ? el : (el.closest ? el.closest('ul, ol') : null);
  if(list){
    items.push({ separator: true });
    items.push({ label: '+ Adicionar item', action: function(){ addListItem(list); } });
  }
  items.push({ separator: true });
  items.push({ label: 'Duplicar', action: duplicateSelected });
  items.push({ label: 'Copiar', action: copySelected });
  items.push({ label: 'Colar', action: pasteClipboard, disabled: !clipboardEl });
  items.push({ separator: true });
  items.push({ label: 'Renomear…', action: function(){ renameElementPrompt(el); } });
  items.push({ separator: true });
  items.push({ label: 'Excluir', danger: true, action: deleteSelected });
  return items;
}

function artboardContextMenuItems(ab){
  return [
    { label: '+ Adicionar elemento', action: function(){ showAddElementMenu(lastMenuX, lastMenuY); } },
    { separator: true },
    { label: 'Renomear…', action: function(){ renameArtboard(ab); } },
    { label: 'Duplicar artboard', action: function(){ duplicateArtboard(ab); } },
    { separator: true },
    { label: 'Excluir artboard', danger: true, action: function(){ deleteArtboard(ab); } }
  ];
}

// ---------- init ----------

(function init(){
  const savedTheme = localStorage.getItem('ae_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const addTile = document.createElement('button');
  addTile.id = 'addArtboardTile';
  addTile.className = 'addArtboardTile';
  addTile.innerHTML = '<span class="plus">+</span><span>Novo artboard</span>';
  addTile.addEventListener('click', function(){ document.getElementById('btnNew').click(); });
  artboardsRow.appendChild(addTile);

  const first = createArtboard({});
  setActiveArtboard(first.id);
  applyZoom();
})();

})();
