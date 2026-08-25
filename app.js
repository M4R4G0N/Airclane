(function(){
"use strict";

// baseline reset every new artboard starts with — box-sizing:border-box so
// padding doesn't blow up a width/height you just set, and html/body at
// height:100% so a child can actually do height:100%/flex fill instead of
// collapsing to 0 (percentage heights need a sized ancestor chain).
const DEFAULT_DOC = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<style>\n  *{ box-sizing:border-box; }\n  html, body{ height:100%; }\n  body{ margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#ffffff; }\n</style>\n</head>\n<body>\n\n<div style="display:inline-block; padding:20px; background:#35d0a4; color:#06231b; border-radius:12px; font-size:20px; font-weight:700;">Novo artboard</div>\n\n</body>\n</html>\n';

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
  rulePickedClass: null, // which of the selected element's classes the CSS-rule editor is showing
  multiSelect: new Set(), // secondary elements selected with Ctrl/Cmd+click, for align/distribute/bulk delete
  layersFilter: '',
  stylePainter: { active: false, props: null } // "copiar estilo" tool: pick a source, then apply to targets
};

// state.selected plus everything in state.multiSelect, as an array.
function effectiveSelection(){
  const set = new Set(state.multiSelect);
  if(state.selected) set.add(state.selected);
  return Array.from(set);
}

// Ctrl/Cmd+click toggles an element's membership in the multi-selection,
// without touching the primary state.selected (used for the properties
// panel) or starting any drag.
function toggleMultiSelect(el){
  if(!state.selected){ selectElement(el); return; }
  if(el === state.selected){
    if(state.multiSelect.size){
      const arr = Array.from(state.multiSelect);
      const next = arr.pop();
      state.multiSelect = new Set(arr);
      state.selected = next;
    } else {
      state.selected = null;
    }
  } else if(state.multiSelect.has(el)){
    state.multiSelect.delete(el);
  } else {
    state.multiSelect.add(el);
  }
  state.artboardMode = false;
  renderOverlay(); renderProps(); highlightLayerRow();
}

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
  // avoid the white flash of a half-parsed document: stay hidden until the
  // new srcdoc is fully loaded and styled, then reveal it in one frame.
  frame.addEventListener('load', function(){ frame.style.opacity = '1'; });
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
    if(e.button !== 0) return;
    e.stopPropagation();
    setActiveArtboard(ab.id);
    const scale = state.zoom;
    const startX = e.clientX, startY = e.clientY;
    const origX = ab.x, origY = ab.y;
    dragMoved = false;
    let snapTargets = null, guides = null;
    function onMove(ev){
      const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
      if(Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      if(dragMoved && !guides){
        snapTargets = artboards.filter(function(a){ return a.id !== ab.id; }).map(function(a){ return { left: a.x, top: a.y, width: a.w, height: a.h }; });
        guides = makeCanvasSnapGuides();
      }
      let x = Math.max(0, origX + dx), y = Math.max(0, origY + dy);
      if(guides){
        const snapped = computeSnap(x, y, ab.w, ab.h, snapTargets);
        x = Math.max(0, snapped.left); y = Math.max(0, snapped.top);
        guides.update(snapped.guideX, snapped.guideY);
      }
      ab.x = x; ab.y = y;
      wrap.style.left = ab.x + 'px'; wrap.style.top = ab.y + 'px';
    }
    function onUp(){
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if(guides) guides.remove();
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

// clicking a "Navegar para artboard" link in Visualizar mode lands here —
// scrolls that artboard into view and selects it, so testing a click-through
// flow (login -> register, etc.) actually goes somewhere instead of the
// href="#ae-goto:..." doing nothing.
function goToArtboard(id){
  const ab = artboards.find(function(a){ return a.id === id; });
  if(!ab){
    showAlert('Esse link aponta pra um artboard que não existe mais. Talvez ele tenha sido movido, editado ou excluído.', 'Página não encontrada');
    return;
  }
  ab.dom.wrap.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  selectArtboardOnly(id);
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
  ab.dom.frame.style.opacity = '0';
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
  clone.querySelectorAll('[data-ae-locked]').forEach(function(n){ n.removeAttribute('data-ae-locked'); });
  clone.querySelectorAll('[data-ae-group]').forEach(function(n){ n.removeAttribute('data-ae-group'); });
  clone.querySelectorAll('[data-ae-goto]').forEach(function(n){ n.removeAttribute('data-ae-goto'); });
  // internal bookkeeping only (round-trips artboard size through the
  // editor's own re-import) — not something someone opening the shipped
  // file should see in their <head>.
  const sizeMeta = clone.querySelector('meta[name="ae-artboard-size"]');
  if(sizeMeta) sizeMeta.remove();
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
// ---------- alignment / snap guides while dragging ----------

const SNAP_THRESHOLD = 6;

// rects (in stage space) of every other element in the artboard, plus the
// artboard's own bounds — computed once when a drag starts, not per pixel.
function collectSnapTargets(doc, el){
  const out = [];
  (function walk(node){
    Array.from(node.children).forEach(function(c){
      if(!isEditableEl(c, doc)) return;
      if(c !== el && !c.contains(el) && !el.contains(c)) out.push(elRectToStage(c));
      walk(c);
    });
  })(doc.body);
  const ab = activeArtboard();
  if(ab) out.push({ left: 0, top: 0, width: ab.w, height: ab.h });
  return out;
}

// snaps left/top (of a w×h box) against the collected targets' edges and
// centers; returns the (possibly adjusted) position plus where to draw
// guide lines, or null on an axis with no snap.
function computeSnap(left, top, w, h, targets){
  let bestX = null, bestY = null;
  const xs = [left, left + w / 2, left + w];
  const ys = [top, top + h / 2, top + h];
  targets.forEach(function(t){
    [t.left, t.left + t.width / 2, t.left + t.width].forEach(function(tx){
      xs.forEach(function(x){
        const d = x - tx;
        if(Math.abs(d) < SNAP_THRESHOLD && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d: d, pos: tx };
      });
    });
    [t.top, t.top + t.height / 2, t.top + t.height].forEach(function(ty){
      ys.forEach(function(y){
        const d = y - ty;
        if(Math.abs(d) < SNAP_THRESHOLD && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d: d, pos: ty };
      });
    });
  });
  return {
    left: bestX ? left - bestX.d : left,
    top: bestY ? top - bestY.d : top,
    guideX: bestX ? bestX.pos : null,
    guideY: bestY ? bestY.pos : null
  };
}

function makeSnapGuides(overlay){
  const gx = document.createElement('div'); gx.className = 'snapGuide v'; gx.style.display = 'none';
  const gy = document.createElement('div'); gy.className = 'snapGuide h'; gy.style.display = 'none';
  if(overlay){ overlay.appendChild(gx); overlay.appendChild(gy); }
  return {
    update: function(guideX, guideY, ab){
      if(guideX != null && ab){ gx.style.display = 'block'; gx.style.left = guideX + 'px'; gx.style.top = '0px'; gx.style.height = ab.h + 'px'; }
      else gx.style.display = 'none';
      if(guideY != null && ab){ gy.style.display = 'block'; gy.style.top = guideY + 'px'; gy.style.left = '0px'; gy.style.width = ab.w + 'px'; }
      else gy.style.display = 'none';
    },
    remove: function(){ gx.remove(); gy.remove(); }
  };
}

// same idea as makeSnapGuides, but for dragging an artboard around the
// canvas — lives in artboardsRow (canvas-space) instead of one artboard's
// own overlay, since it needs to reach across every artboard.
function makeCanvasSnapGuides(){
  const gx = document.createElement('div'); gx.className = 'snapGuide v'; gx.style.display = 'none';
  const gy = document.createElement('div'); gy.className = 'snapGuide h'; gy.style.display = 'none';
  artboardsRow.appendChild(gx); artboardsRow.appendChild(gy);
  return {
    update: function(guideX, guideY){
      if(guideX != null){ gx.style.display = 'block'; gx.style.left = guideX + 'px'; gx.style.top = '0px'; gx.style.height = '4000px'; }
      else gx.style.display = 'none';
      if(guideY != null){ gy.style.display = 'block'; gy.style.top = guideY + 'px'; gy.style.left = '0px'; gy.style.width = '6000px'; }
      else gy.style.display = 'none';
    },
    remove: function(){ gx.remove(); gy.remove(); }
  };
}

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
  const w = el.offsetWidth, h = el.offsetHeight;
  let started = false;
  let snapTargets = null;
  let guides = null;
  catchPointer('move');

  function onMove(clientX, clientY){
    const dx = (clientX - startXParent) / scale, dy = (clientY - startYParent) / scale;
    if(!started){
      if(Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      started = true;
      snapTargets = collectSnapTargets(doc, el);
      guides = makeSnapGuides(getOverlay());
    }
    let left = Math.min(Math.max(0, origLeft + dx), maxLeft);
    let top = Math.min(Math.max(0, origTop + dy), maxTop);
    const snapped = computeSnap(left, top, w, h, snapTargets);
    left = Math.min(Math.max(0, snapped.left), maxLeft);
    top = Math.min(Math.max(0, snapped.top), maxTop);
    guides.update(snapped.guideX, snapped.guideY, activeArtboard());
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    updateOverlayLive();
  }
  function onUp(){
    releasePointer();
    if(guides) guides.remove();
    if(started){ pushHistory(); syncCodeFromCanvas(); }
  }
  bindDragListeners(doc, frame, scale, onMove, onUp);
}

// elements in normal flow: drag reorders el among its siblings instead of
// moving it freely — no position:absolute involved.
// tags that can never receive children — dropping "into" one of these
// always means reordering next to it instead of nesting inside it.
const VOID_TAGS = { IMG: 1, INPUT: 1, BR: 1, HR: 1, TEXTAREA: 1 };

function startReorder(e, el){
  e.preventDefault();
  const doc = getDoc();
  const frame = getFrame();
  const overlay = getOverlay();
  const scale = state.zoom;
  let started = false;
  let prevOpacity;
  let pending = null; // { type:'nest'|'before'|'after', target }
  catchPointer('grabbing');

  // A ghost follows the cursor (fixed position, parent document — no
  // iframe/scale math needed) so you can see where you're about to drop
  // it; the real element doesn't move (and nothing reflows) until you
  // release. A highlight on the artboard shows the exact target: a
  // dashed box to nest inside, or a thin line to land next to.
  const ghost = document.createElement('div');
  ghost.className = 'dragGhost';
  ghost.textContent = shortLabel(el);
  document.body.appendChild(ghost);

  const hilite = document.createElement('div');
  hilite.className = 'dropHilite';
  if(overlay) overlay.appendChild(hilite);

  function showGhost(clientX, clientY){
    const r = el.getBoundingClientRect();
    ghost.style.width = Math.max(40, r.width * scale) + 'px';
    ghost.style.height = Math.max(22, r.height * scale) + 'px';
    ghost.style.left = (clientX + 14) + 'px';
    ghost.style.top = (clientY + 14) + 'px';
    ghost.classList.add('show');
  }

  // Follows the cursor anywhere in the document (not just el's original
  // siblings): hovering the middle of another element nests el inside it;
  // hovering its top/bottom (or left/right, in a row) edge queues el as
  // a sibling next to it instead. Hierarchy follows what's visually under
  // the cursor, same as dragging a layer onto another in the layers panel.
  // Nothing moves for real yet — this only records the pending drop.
  function pick(clientX, clientY){
    const iframeRect = frame.getBoundingClientRect();
    const ix = (clientX - iframeRect.left) / scale;
    const iy = (clientY - iframeRect.top) / scale;
    let hit = doc.elementFromPoint(ix, iy);
    while(hit && !isEditableEl(hit, doc) && hit !== doc.body) hit = hit.parentElement;
    if(!hit || hit === el || el.contains(hit) || !isEditableEl(hit, doc)){ pending = null; hilite.style.display = 'none'; return; }

    const r = hit.getBoundingClientRect();
    const parentOfHit = hit.parentElement;
    const pcs = doc.defaultView.getComputedStyle(parentOfHit);
    const isRow = (pcs.display === 'flex' || pcs.display === 'inline-flex') && (pcs.flexDirection || 'row').indexOf('row') === 0;
    const edge = isRow ? (r.width ? (ix - r.left) / r.width : .5) : (r.height ? (iy - r.top) / r.height : .5);
    const canNest = !VOID_TAGS[hit.tagName];
    const stageR = elRectToStage(hit);

    hilite.style.display = 'block';
    if(canNest && edge > 0.25 && edge < 0.75){
      pending = { type: 'nest', target: hit };
      hilite.className = 'dropHilite nest';
      hilite.style.left = stageR.left + 'px'; hilite.style.top = stageR.top + 'px';
      hilite.style.width = stageR.width + 'px'; hilite.style.height = stageR.height + 'px';
    } else {
      const before = edge <= 0.25;
      pending = { type: before ? 'before' : 'after', target: hit };
      hilite.className = 'dropHilite line';
      if(isRow){
        hilite.style.top = stageR.top + 'px'; hilite.style.height = stageR.height + 'px'; hilite.style.width = '3px';
        hilite.style.left = (before ? stageR.left - 1 : stageR.left + stageR.width - 1) + 'px';
      } else {
        hilite.style.left = stageR.left + 'px'; hilite.style.width = stageR.width + 'px'; hilite.style.height = '3px';
        hilite.style.top = (before ? stageR.top - 1 : stageR.top + stageR.height - 1) + 'px';
      }
    }
  }

  const iframeRect0 = frame.getBoundingClientRect();
  const startXParent = iframeRect0.left + e.clientX * scale, startYParent = iframeRect0.top + e.clientY * scale;

  function onMove(clientX, clientY){
    if(!started){
      if(Math.abs(clientX - startXParent) < DRAG_THRESHOLD && Math.abs(clientY - startYParent) < DRAG_THRESHOLD) return;
      started = true;
      prevOpacity = el.style.opacity;
      el.style.opacity = '0.35';
    }
    showGhost(clientX, clientY);
    pick(clientX, clientY);
  }
  function onUp(){
    releasePointer();
    ghost.remove();
    hilite.remove();
    if(started){
      el.style.opacity = prevOpacity;
      if(pending){
        if(pending.type === 'nest') pending.target.appendChild(el);
        else if(pending.type === 'before') pending.target.parentElement.insertBefore(el, pending.target);
        else pending.target.parentElement.insertBefore(el, pending.target.nextSibling);
      }
      pushHistory(); syncCodeFromCanvas(); renderLayers(); highlightLayerRow(); renderOverlay();
    }
  }
  bindDragListeners(doc, frame, scale, onMove, onUp);
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

  const isCorner = handle.length === 2;

  function onMove(ev){
    const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
    let left = origLeft, top = origTop, w = origW, h = origH;
    if(isCorner && ev.shiftKey){
      // proportional: whichever axis moved more (relative to the shape's
      // own size) drives the scale, the other axis follows to keep ratio.
      const dwSigned = handle.includes('e') ? dx : -dx;
      const dhSigned = handle.includes('s') ? dy : -dy;
      const scaleFactor = Math.abs(dwSigned) / origW > Math.abs(dhSigned) / origH
        ? (origW + dwSigned) / origW
        : (origH + dhSigned) / origH;
      w = Math.max(4, origW * scaleFactor);
      h = Math.max(4, origH * scaleFactor);
      if(free && handle.includes('w')) left = origLeft + (origW - w);
      if(free && handle.includes('n')) top = origTop + (origH - h);
    } else {
      if(handle.includes('e')) w = Math.max(4, origW + dx);
      if(handle.includes('s')) h = Math.max(4, origH + dy);
      if(free && handle.includes('w')){ w = Math.max(4, origW - dx); left = origLeft + dx; }
      if(free && handle.includes('n')){ h = Math.max(4, origH - dy); top = origTop + dy; }
    }
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
    // right (and middle) click reach here too — without this guard, a
    // right-click was running the same selectElement()/startDrag() as a
    // real click, collapsing multi-selection and arming a drag before the
    // 'contextmenu' handler even runs, no matter what that handler does.
    if(e.button !== 0) return;
    let target = e.target;
    if(!isEditableEl(target, doc)){ if(!e.ctrlKey && !e.metaKey) selectArtboardOnly(ab.id); return; }
    if(target.closest('[data-ae-locked="1"]')) return;
    // already mid-edit (double-click turned this on) — let the click place
    // the caret/selection natively instead of hijacking it into a drag.
    // preventDefault() here was blocking every click-to-position-cursor
    // inside the text, leaving arrow keys as the only way to move within it.
    if(target.isContentEditable) return;
    e.preventDefault(); e.stopPropagation();
    if(state.stylePainter.active){ useStylePainter(target); return; }
    // Ctrl/Cmd+click toggles multi-selection membership instead of dragging.
    if(e.ctrlKey || e.metaKey){ toggleMultiSelect(target); return; }
    selectElement(target);
    // click, hold, and move to drag — no modifier key needed. A plain
    // click with no real movement never nudges anything: startDrag only
    // commits a move/reorder once the pointer crosses DRAG_THRESHOLD.
    startDrag(e, target);
  }, true);

  doc.addEventListener('click', function(e){
    if(!state.editMode){
      // Visualizar mode: a link or button set to "Navegar para artboard"
      // jumps the canvas to that artboard — this is how a click-through
      // flow (login button -> next screen) is actually testable.
      const a = e.target.closest && e.target.closest('a');
      const m = a && (a.getAttribute('href') || '').match(/^#ae-goto:(.+)$/);
      if(m){ e.preventDefault(); goToArtboard(m[1]); return; }
      const btn = e.target.closest && e.target.closest('button[data-ae-goto]');
      if(btn){ e.preventDefault(); goToArtboard(btn.getAttribute('data-ae-goto')); return; }
      return;
    }
    const a = e.target.closest && e.target.closest('a');
    if(a) e.preventDefault();
  }, true);

  // Ctrl+scroll/pinch-zoom over the rendered artboard fires inside this
  // iframe's own document — it never reaches canvasWrap's wheel listener
  // in the parent page, so without this the browser's native page zoom
  // takes over instead of the app's canvas zoom. Same fix pattern as the
  // cross-iframe drag capture issue: listen inside the iframe too.
  doc.addEventListener('wheel', onCanvasWheel, { passive: false });

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
      // preserve an existing multi-selection if you right-click something
      // that's already part of it — only replace the selection outright
      // when right-clicking something new.
      if(state.selected !== target && !state.multiSelect.has(target)) selectElement(target);
      showContextMenu(px, py, elementContextMenuItems(target));
    } else {
      setActiveArtboard(ab.id);
      selectArtboardOnly(ab.id);
      showContextMenu(px, py, artboardContextMenuItems(ab));
    }
  }, true);

  doc.defaultView.addEventListener('scroll', updateOverlayLive, true);
  doc.addEventListener('keydown', function(e){ handleGlobalKeydown(e, doc); });

  // Ctrl+V with an image on the OS clipboard (a screenshot, "copy image"
  // from a browser, etc.) — the keydown-based element copy/paste above
  // can't see clipboard *contents*, only a real 'paste' event exposes
  // clipboardData, so this is handled separately.
  doc.addEventListener('paste', function(e){
    if(!state.editMode) return;
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    const imgItem = Array.from(items).find(function(it){ return it.type.indexOf('image/') === 0; });
    if(!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(){
      const img = doc.createElement('img');
      img.src = reader.result;
      img.style.cssText = 'max-width:400px; height:auto; display:block; margin:0 0 12px;';
      insertionContainer(doc).appendChild(img);
      selectElement(img);
      renderLayers();
      pushHistory(); syncCodeFromCanvas();
    };
    reader.readAsDataURL(file);
  });

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

function rowMatchesFilter(el, filter){
  if(!filter) return true;
  const doc = getDoc();
  if(shortLabel(el).toLowerCase().indexOf(filter) !== -1) return true;
  return Array.from(el.children).some(function(c){ return isEditableEl(c, doc) && rowMatchesFilter(c, filter); });
}

function buildLayerRows(parentEl, container, depth){
  Array.from(parentEl.children).forEach(function(el){
    const doc = getDoc();
    if(!isEditableEl(el, doc)) return;
    if(!rowMatchesFilter(el, state.layersFilter)) return;
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

    const eyeSVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOffSVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const lockSVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const unlockSVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

    const eye = document.createElement('button');
    eye.className = 'iconBtn' + (el.style.display === 'none' ? ' hidden-state' : '');
    eye.innerHTML = (el.style.display === 'none') ? eyeOffSVG : eyeSVG;
    eye.title = 'Mostrar/ocultar';
    eye.addEventListener('click', function(ev){
      ev.stopPropagation();
      el.style.display = (el.style.display === 'none') ? '' : 'none';
      eye.innerHTML = (el.style.display === 'none') ? eyeOffSVG : eyeSVG;
      eye.classList.toggle('hidden-state', el.style.display === 'none');
      pushHistory(); syncCodeFromCanvas();
    });
    icons.appendChild(eye);

    const lock = document.createElement('button');
    const isLocked = el.dataset.aeLocked === '1';
    lock.className = 'iconBtn' + (isLocked ? ' hidden-state' : '');
    lock.innerHTML = isLocked ? lockSVG : unlockSVG;
    lock.title = 'Bloquear/desbloquear (impede selecionar no canvas)';
    lock.addEventListener('click', function(ev){
      ev.stopPropagation();
      const nowLocked = el.dataset.aeLocked !== '1';
      if(nowLocked) el.dataset.aeLocked = '1'; else delete el.dataset.aeLocked;
      lock.innerHTML = nowLocked ? lockSVG : unlockSVG;
      lock.classList.toggle('hidden-state', nowLocked);
      if(nowLocked){
        state.multiSelect.delete(el);
        if(state.selected === el) selectElement(null);
      }
      pushHistory(); syncCodeFromCanvas();
    });
    icons.appendChild(lock);

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

    row.addEventListener('click', function(ev){
      ev.stopPropagation();
      if(ev.ctrlKey || ev.metaKey) toggleMultiSelect(el); else selectElement(el);
    });
    container.appendChild(row);

    if(editableChildren.length && (state.layersFilter || !collapsedLayers.has(el))){
      buildLayerRows(el, container, depth + 1);
    }
  });
}

function highlightLayerRow(){
  Array.from(layersTree.children).forEach(function(row){
    row.classList.toggle('selected', row._el === state.selected);
    row.classList.toggle('multiSelected', row._el && state.multiSelect.has(row._el));
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
    const href = el.getAttribute('href') || '';
    const gotoMatch = href.match(/^#ae-goto:(.+)$/);
    const isGoto = !!gotoMatch;
    const artboardOptions = artboards.map(function(a){
      return '<option value="' + a.id + '"' + (gotoMatch && gotoMatch[1] === a.id ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');
    return '<div class="propsSection">Link</div>' +
      '<div class="field"><label>Ação</label><select id="pAttrLinkMode">' +
        '<option value="url"' + (!isGoto ? ' selected' : '') + '>Endereço (URL)</option>' +
        '<option value="goto"' + (isGoto ? ' selected' : '') + '>Navegar para artboard</option>' +
      '</select></div>' +
      (isGoto ?
        '<div class="field"><label>Ir para</label><select id="pAttrGotoArtboard">' + artboardOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar — clicar no link leva até esse artboard. No .html exportado isso não navega sozinho (ainda não gera JS de verdade).</div>'
        :
        '<div class="field"><label>Endereço (href)</label><input type="text" id="pAttrHref" value="' + esc(href) + '"></div>' +
        '<div class="field"><label>Abrir em</label><select id="pAttrTarget">' + opts(['_self', '_blank'], el.getAttribute('target') || '_self') + '</select></div>');
  }
  if(tag === 'IMG'){
    return '<div class="propsSection">Imagem</div>' +
      '<div class="field"><label>Texto alternativo (alt)</label><input type="text" id="pAttrAlt" value="' + esc(el.getAttribute('alt')) + '"></div>';
  }
  if(tag === 'BUTTON'){
    const gotoId = el.getAttribute('data-ae-goto') || '';
    const artboardOptions = artboards.map(function(a){
      return '<option value="' + a.id + '"' + (gotoId === a.id ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');
    return '<div class="propsSection">Botão</div>' +
      '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['button', 'submit', 'reset'], el.getAttribute('type') || 'button') + '</select></div>' +
      '<div class="field"><label>Ao clicar</label><select id="pAttrBtnAction">' +
        '<option value=""' + (!gotoId ? ' selected' : '') + '>Nada (só visual)</option>' +
        '<option value="goto"' + (gotoId ? ' selected' : '') + '>Navegar para artboard</option>' +
      '</select></div>' +
      (gotoId ?
        '<div class="field"><label>Ir para</label><select id="pAttrGotoArtboard">' + artboardOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar — clicar no botão leva até esse artboard, tipo testar "Entrar" indo pra tela seguinte.</div>'
        : '');
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

  const linkMode = document.getElementById('pAttrLinkMode');
  if(linkMode){
    linkMode.addEventListener('change', function(){
      if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        el.setAttribute('href', other ? '#ae-goto:' + other.id : '#ae-goto:');
      } else {
        el.setAttribute('href', '');
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  const btnAction = document.getElementById('pAttrBtnAction');
  if(btnAction){
    btnAction.addEventListener('change', function(){
      if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        if(other) el.setAttribute('data-ae-goto', other.id);
      } else {
        el.removeAttribute('data-ae-goto');
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  const gotoSel = document.getElementById('pAttrGotoArtboard');
  if(gotoSel){
    gotoSel.addEventListener('change', function(){
      if(el.tagName === 'BUTTON') el.setAttribute('data-ae-goto', this.value);
      else el.setAttribute('href', '#ae-goto:' + this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
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
  let cssText = getStyleText(doc);
  const block = selector + ' {\n  ' + newBody.trim().replace(/\n/g, '\n  ') + '\n}';
  let firstIndex = -1;
  let found;
  while((found = findRuleBlock(cssText, selector)) !== null){
    if(firstIndex === -1) firstIndex = found.index;
    cssText = cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length);
  }
  if(firstIndex !== -1){
    cssText = cssText.slice(0, firstIndex) + block + '\n' + cssText.slice(firstIndex);
  } else {
    cssText = cssText.trim() + (cssText.trim() ? '\n\n' : '') + block + '\n';
  }
  setStyleText(doc, cssText);
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

  const allClassRules = getAllClassRules(doc);
  const currentClassStr = (el.className || '').trim();
  const classNamesInDoc = allClassRules.map(function(r){ return r.className; });

  let classSelectOptions = '<option value=""' + (!currentClassStr ? ' selected' : '') + '>(Sem classe)</option>';
  if(currentClassStr && !classNamesInDoc.includes(currentClassStr)){
    classSelectOptions += '<option value="' + currentClassStr.replace(/"/g, '&quot;') + '" selected>.' + currentClassStr + '</option>';
  }
  classNamesInDoc.forEach(function(c){
    const isSel = c === currentClassStr;
    classSelectOptions += '<option value="' + c + '"' + (isSel ? ' selected' : '') + '>.' + c + '</option>';
  });
  classSelectOptions += '<option value="__new__">+ Criar nova classe...</option>';
  classSelectOptions += '<option value="__custom__">✎ Texto livre...</option>';

  const selCount = effectiveSelection().length;
  propsBody.innerHTML =
    (selCount > 1 ?
      '<div class="field" style="color:var(--accent); font-size:12px; font-weight:700;">Editando ' + selCount + ' elementos selecionados — mudar um campo aqui muda todos.</div>'
      : '') +
    '<div class="field"><label>Elemento</label><div style="color:var(--text-dim)">' + shortLabel(el) + (selCount > 1 ? ' (principal)' : '') + '</div></div>' +
    '<div class="field"><label>Classe (CSS)</label><select id="pClassName">' + classSelectOptions + '</select></div>' +

    classRuleHTML +

    attrsHTML +

    '<div class="propsSection">Layout</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Display</label><select id="pDisplay">' + opts(['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none'], displayVal) + '</select></div>' +
      '<div class="field"><label>Posição</label><select id="pPosition">' + opts(['absolute', 'relative', 'static', 'fixed'], positionVal) + '</select></div>' +
    '</div>' +
    (isFlex ?
      '<div class="field"><label>Direção</label>' + flexIconGroupHTML('pFlexDir', ['row', 'column', 'row-reverse', 'column-reverse'], cs.flexDirection, dirIconIcon) + '</div>' +
      '<div class="field"><label>Alinhar (align-items)</label>' + flexIconGroupHTML('pAlign', ['stretch', 'flex-start', 'center', 'flex-end'], cs.alignItems, alignIconIcon) + '</div>' +
      '<div class="field"><label>Distribuir (justify)</label>' + flexIconGroupHTML('pJustify', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'], cs.justifyContent, justifyIconIcon) + '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Quebra</label><select id="pFlexWrap">' + opts(['nowrap', 'wrap', 'wrap-reverse'], cs.flexWrap) + '</select></div>' +
        '<div class="field"><label>Gap (px)</label><input type="number" id="pGap" value="' + (parseFloat(cs.gap) || 0) + '"></div>' +
      '</div>'
      : '') +

    (free ?
      '<div class="row3">' +
        '<div class="field"><label>X</label><input type="number" id="pX"></div>' +
        '<div class="field"><label>Y</label><input type="number" id="pY"></div>' +
        '<div class="field"><label>Z-index</label><input type="number" id="pZ" value="' + (parseInt(el.style.zIndex) || 0) + '"></div>' +
      '</div>'
      : '') +

    '<div class="propsSection">Tamanho</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Largura</label><div class="fieldRow"><input type="number" id="pW"><select id="pWUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
      '<div class="field"><label>Altura</label><div class="fieldRow"><input type="number" id="pH"><select id="pHUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
    '</div>' +

    '<div class="propsSection">Aparência</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fundo</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBg', cs.backgroundColor) + varDropdownHTML(doc, el.style.backgroundColor || el.style.background, 'pBgVar') + '</div></div>' +
      '<div class="field"><label>Texto</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pColor', cs.color) + varDropdownHTML(doc, el.style.color, 'pColorVar') + '</div></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fonte (família)</label><select id="pFontFamily">' + fontFamilyOptionsHTML(el.style.fontFamily) + '</select></div>' +
      '<div class="field"><label>Peso</label><select id="pFontWeight">' + opts(['400', '500', '600', '700', '800'], el.style.fontWeight || '400') + '</select></div>' +
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
    '<div class="field"><label>Cor da borda</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBorderColor', cs.borderTopColor) + varDropdownHTML(doc, el.style.borderColor, 'pBorderColorVar') + '</div></div>' +

    '<hr>' +
    '<div class="field">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
        '<label>CSS livre (style)</label>' +
        (getRootVariables(doc).length ?
          '<select id="pInsertVarStyle" style="max-width:130px; font-size:11px;" title="Inserir variável do :root">' +
            '<option value="">+ Inserir var()...</option>' +
            getRootVariables(doc).map(function(v){ return '<option value="var(' + v.name + ')">' + v.name + ' (' + v.value + ')</option>'; }).join('') +
          '</select>' : '') +
      '</div>' +
      '<textarea id="pStyle" rows="6" spellcheck="false">' + (el.getAttribute('style') || '') + '</textarea>' +
    '</div>';

  const rect = elRectToStage(el);
  if(free){
    document.getElementById('pX').value = Math.round(parseFloat(el.style.left) || rect.left);
    document.getElementById('pY').value = Math.round(parseFloat(el.style.top) || rect.top);
  }
  function initSizeField(inputId, unitId, styleVal, pxFallback){
    const isPct = /%\s*$/.test(styleVal || '');
    document.getElementById(unitId).value = isPct ? '%' : 'px';
    document.getElementById(inputId).value = isPct ? Math.round(parseFloat(styleVal)) : Math.round(pxFallback);
  }
  initSizeField('pW', 'pWUnit', el.style.width, rect.width);
  initSizeField('pH', 'pHUnit', el.style.height, rect.height);

  bindAttributesSection(el);
  const pClassNameSelect = document.getElementById('pClassName');
  pClassNameSelect.addEventListener('change', async function(){
    const val = this.value;
    if(val === '__new__'){
      const name = await showPrompt('Nome da nova classe CSS (ex: btn-custom):', '', 'Nova Classe CSS');
      if(name && name.trim()){
        const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
        setClassRuleBody(doc, '.' + cleanName, '/* propriedades de .' + cleanName + ' */\nbackground-color: transparent;\ncolor: inherit;');
        el.className = cleanName;
        state.rulePickedClass = cleanName;
        pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
      } else {
        renderProps();
      }
    } else if(val === '__custom__'){
      const text = await showPrompt('Digite a(s) classe(s) separadas por espaço:', el.className || '', 'Editar Classe CSS');
      if(text !== null){
        el.className = text.trim();
        pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
      } else {
        renderProps();
      }
    } else {
      el.className = val;
      pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
    }
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
    effectiveSelection().forEach(function(t){ applyBgPattern(t, pBgPattern.value, pBgPatternColor.value); });
    pushHistory(); syncCodeFromCanvas();
  }
  pBgPattern.addEventListener('change', applyPattern);
  pBgPatternColor.addEventListener('input', applyPattern);

  const pDisplay = document.getElementById('pDisplay');
  pDisplay.addEventListener('change', function(){
    effectiveSelection().forEach(function(t){ t.style.display = pDisplay.value; });
    pushHistory(); syncCodeFromCanvas(); renderLayers();
    renderProps();
    updateOverlayLive();
  });
  const pPosition = document.getElementById('pPosition');
  pPosition.addEventListener('change', function(){
    const v = pPosition.value;
    effectiveSelection().forEach(function(t){
      if(v === 'absolute' || v === 'fixed'){ ensureAbsolute(t); t.style.position = v; }
      else { t.style.position = v; }
    });
    pushHistory(); syncCodeFromCanvas(); renderOverlay();
    renderProps();
    updateOverlayLive();
  });
  if(isFlex){
    bindFlexIconGroup('pFlexDir', function(v, el){ el.style.flexDirection = v; });
    bindFlexIconGroup('pAlign', function(v, el){ el.style.alignItems = v; });
    bindFlexIconGroup('pJustify', function(v, el){ el.style.justifyContent = v; });
    bindProp('pFlexWrap', function(v, el){ el.style.flexWrap = v; }, 'change');
    bindProp('pGap', function(v, el){ el.style.gap = v + 'px'; });
  }
  if(free){ bindProp('pZ', function(v, el){ el.style.zIndex = v; }); }

  bindPropPrimaryOnly('pX', function(v){ el.style.left = v + 'px'; });
  bindPropPrimaryOnly('pY', function(v){ el.style.top = v + 'px'; });
  bindSizeProp('pW', 'pWUnit', 'width');
  bindSizeProp('pH', 'pHUnit', 'height');
  bindColorSwatch('pBg', function(v, el){ el.style.backgroundColor = v; });
  bindColorSwatch('pColor', function(v, el){ el.style.color = v; });
  bindProp('pFontFamily', applyFontFamily, 'change');
  bindProp('pFontWeight', function(v, el){ el.style.fontWeight = v; }, 'change');
  bindProp('pFont', function(v, el){ el.style.fontSize = v + 'px'; });
  bindProp('pRadius', function(v, el){ el.style.borderRadius = v + 'px'; });
  bindProp('pOpacity', function(v, el){ el.style.opacity = (v / 100); });

  bindProp('pPadT', function(v, el){ el.style.paddingTop = v + 'px'; });
  bindProp('pPadR', function(v, el){ el.style.paddingRight = v + 'px'; });
  bindProp('pPadB', function(v, el){ el.style.paddingBottom = v + 'px'; });
  bindProp('pPadL', function(v, el){ el.style.paddingLeft = v + 'px'; });

  bindProp('pMarT', function(v, el){ el.style.marginTop = v + 'px'; });
  bindProp('pMarR', function(v, el){ el.style.marginRight = v + 'px'; });
  bindProp('pMarB', function(v, el){ el.style.marginBottom = v + 'px'; });
  bindProp('pMarL', function(v, el){ el.style.marginLeft = v + 'px'; });

  bindProp('pBorderW', function(v, el){ el.style.borderWidth = v + 'px'; if(parseFloat(v) > 0 && (!el.style.borderStyle || el.style.borderStyle === 'none')) el.style.borderStyle = 'solid'; });
  bindProp('pBorderStyle', function(v, el){ el.style.borderStyle = v; if(v !== 'none' && (!el.style.borderWidth || parseFloat(el.style.borderWidth) === 0)) el.style.borderWidth = '1px'; }, 'change');
  bindColorSwatch('pBorderColor', function(v, el){ el.style.borderColor = v; });
  const pBgVar = document.getElementById('pBgVar');
  if(pBgVar){
    pBgVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.backgroundColor = pBgVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }
  const pColorVar = document.getElementById('pColorVar');
  if(pColorVar){
    pColorVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.color = pColorVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }
  const pBorderColorVar = document.getElementById('pBorderColorVar');
  if(pBorderColorVar){
    pBorderColorVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.borderColor = pBorderColorVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }

  document.getElementById('pStyle').addEventListener('change', function(){
    el.setAttribute('style', this.value);
    pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps();
  });

  const pInsertVarStyle = document.getElementById('pInsertVarStyle');
  if(pInsertVarStyle){
    pInsertVarStyle.addEventListener('change', function(){
      const val = this.value;
      if(!val) return;
      const pStyle = document.getElementById('pStyle');
      const cur = pStyle.value;
      const separator = (cur && !cur.endsWith(';') && !cur.endsWith('\n')) ? '; ' : '';
      pStyle.value = cur + separator + val;
      el.setAttribute('style', pStyle.value);
      pushHistory(); syncCodeFromCanvas();
      this.value = '';
    });
  }
}

// applies fn(value, targetEl) to every element in the current selection
// (not just the primary one), so with several elements selected, changing
// one field changes all of them at once.
function bindProp(id, fn, evt){
  const input = document.getElementById(id);
  if(!input) return;
  input.addEventListener(evt || 'input', function(){
    effectiveSelection().forEach(function(target){ fn(input.value, target); });
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  });
}

// X/Y are absolute pixel coordinates — copying the same ones onto every
// selected element would stack them on top of each other, so those two
// stay primary-only (use Alinhar/Distribuir for multi-element positioning).
function bindPropPrimaryOnly(id, fn, evt){
  const input = document.getElementById(id);
  if(!input) return;
  input.addEventListener(evt || 'input', function(){
    fn(input.value);
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  });
}

// width/height need a unit toggle (px vs %) instead of always hardcoding
// px — a flex child sized "50%" of its parent should stay 50% if the
// artboard gets resized, not a pixel number computed by hand once.
function bindSizeProp(inputId, unitId, styleProp){
  const input = document.getElementById(inputId);
  const unitSel = document.getElementById(unitId);
  if(!input || !unitSel) return;
  function apply(){
    const val = input.value + unitSel.value;
    effectiveSelection().forEach(function(t){ t.style[styleProp] = val; });
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  }
  input.addEventListener('input', apply);
  unitSel.addEventListener('change', apply);
}

function rgbToHex(rgb){
  if(!rgb || rgb.indexOf('rgb') !== 0) return '#ffffff';
  const nums = rgb.match(/[\d.]+/g).map(Number);
  return '#' + nums.slice(0, 3).map(function(n){ return n.toString(16).padStart(2, '0'); }).join('');
}

// ---------- color swatch + rgba popover ----------
// <input type="color"> can't represent alpha at all, so overlays/shadows/
// glass panels (rgba backgrounds) couldn't be set from the properties
// panel — this swatch+popover pair fixes that: a native picker for hue/RGB,
// a slider for alpha, and a text field that accepts rgba()/hex directly.

function parseColorParts(str){
  str = (str || '').trim();
  if(!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if(str[0] === '#'){
    let hex = str.slice(1);
    if(hex.length === 3) hex = hex.split('').map(function(c){ return c + c; }).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: a };
  }
  const nums = (str.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
  return { r: nums[0] || 0, g: nums[1] || 0, b: nums[2] || 0, a: nums.length > 3 ? nums[3] : 1 };
}
function partsToRgba(p){
  return 'rgba(' + Math.round(p.r) + ', ' + Math.round(p.g) + ', ' + Math.round(p.b) + ', ' + (Math.round(p.a * 100) / 100) + ')';
}
function hexFromRgbParts(p){
  return '#' + [p.r, p.g, p.b].map(function(n){ return Math.round(n).toString(16).padStart(2, '0'); }).join('');
}

function colorSwatchHTML(id, colorStr){
  return '<button type="button" class="colorSwatchBtn" id="' + id + '" data-color="' + (colorStr || '').replace(/"/g, '&quot;') + '"><span style="background:' + (colorStr || 'transparent') + '"></span></button>';
}

let colorPopoverOnChange = null;
function closeColorPopover(){
  document.getElementById('colorPopover').classList.remove('open');
  colorPopoverOnChange = null;
}
function openColorPopover(swatchBtn, currentColor, onChange){
  const pop = document.getElementById('colorPopover');
  const parts = parseColorParts(currentColor);
  document.getElementById('cpHue').value = hexFromRgbParts(parts);
  document.getElementById('cpAlpha').value = Math.round(parts.a * 100);
  document.getElementById('cpAlphaLabel').textContent = Math.round(parts.a * 100) + '%';
  document.getElementById('cpText').value = partsToRgba(parts);
  const r = swatchBtn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 246)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  pop.classList.add('open');
  colorPopoverOnChange = onChange;
}
// applies fn(value, targetEl) to every selected element when the popover's
// color changes (bulk-edit for multi-selection, same as the other props).
function bindColorSwatch(id, fn){
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    openColorPopover(btn, btn.dataset.color, function(rgba){
      btn.dataset.color = rgba;
      btn.querySelector('span').style.background = rgba;
      effectiveSelection().forEach(function(target){ fn(rgba, target); });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  });
}

// ---------- font family picker ----------
// small curated catalog — system stacks need nothing extra; Google-hosted
// ones need their stylesheet injected into the artboard's own <head> the
// first time they're used, or the browser just falls back silently.
const SYSTEM_FONTS = {
  'Padrão do sistema': '-apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  'Georgia (serif)': 'Georgia, "Times New Roman", serif',
  'Courier (mono)': '"Courier New", Courier, monospace'
};
const GOOGLE_FONTS = {
  'Inter': 'Inter:wght@400;500;600;700',
  'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Fraunces': 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700',
  'Poppins': 'Poppins:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'JetBrains Mono': 'JetBrains+Mono:wght@400;500;600'
};
function ensureGoogleFont(doc, family){
  if(!GOOGLE_FONTS[family] || !doc.head) return;
  const id = 'gf-' + family.replace(/\s+/g, '-');
  if(doc.head.querySelector('#' + id)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet'; link.id = id;
  link.href = 'https://fonts.googleapis.com/css2?family=' + GOOGLE_FONTS[family] + '&display=swap';
  doc.head.appendChild(link);
}
function fontFamilyOptionsHTML(currentFF){
  const cur = (currentFF || '').replace(/["']/g, '').split(',')[0].trim();
  let html = '<option value=""' + (!cur ? ' selected' : '') + '>(herdado do pai)</option>';
  html += '<optgroup label="Sistema">';
  Object.keys(SYSTEM_FONTS).forEach(function(label){
    const stack = SYSTEM_FONTS[label];
    const name = stack.split(',')[0].replace(/["']/g, '').trim();
    html += '<option value="' + stack.replace(/"/g, '&quot;') + '"' + (cur === name ? ' selected' : '') + '>' + label + '</option>';
  });
  html += '</optgroup><optgroup label="Google Fonts">';
  Object.keys(GOOGLE_FONTS).forEach(function(name){
    html += '<option value="' + name + '"' + (cur === name ? ' selected' : '') + '>' + name + '</option>';
  });
  html += '</optgroup>';
  return html;
}
function applyFontFamily(v, target){
  if(!v){ target.style.fontFamily = ''; return; }
  if(GOOGLE_FONTS[v]){
    ensureGoogleFont(target.ownerDocument, v);
    target.style.fontFamily = '"' + v + '", sans-serif';
  } else {
    target.style.fontFamily = v;
  }
}

// ---------- flex control icon buttons ----------
// direção/alinhar/distribuir used to be plain <select> text — each option
// here is a tiny live swatch actually laid out with that CSS value, so the
// icon can't drift out of sync with what it means.

function flexBar(w, h){ return '<span class="bar" style="width:' + w + '; height:' + h + ';"></span>'; }

function dirIconIcon(dir){
  const isCol = dir.indexOf('column') === 0;
  const bar = isCol ? flexBar('12px', '3px') : flexBar('3px', '12px');
  return '<span class="swatch" style="flex-direction:' + dir + ';">' + bar + bar + bar + '</span>';
}
function alignIconIcon(val){
  const heights = val === 'stretch' ? ['100%', '100%', '100%'] : ['8px', '14px', '6px'];
  return '<span class="swatch" style="flex-direction:row; align-items:' + val + ';">' +
    flexBar('3px', heights[0]) + flexBar('3px', heights[1]) + flexBar('3px', heights[2]) + '</span>';
}
function justifyIconIcon(val){
  const gap = val.indexOf('space') === 0 ? '0' : '2px';
  return '<span class="swatch" style="flex-direction:row; justify-content:' + val + '; align-items:center; gap:' + gap + ';">' +
    flexBar('3px', '10px') + flexBar('3px', '10px') + flexBar('3px', '10px') + '</span>';
}

function flexIconGroupHTML(id, options, current, iconFn){
  return '<div class="flexIconGroup" id="' + id + '">' + options.map(function(o){
    return '<button type="button" class="flexIconBtn' + (o === current ? ' active' : '') + '" data-value="' + o + '" title="' + o + '">' + iconFn(o) + '</button>';
  }).join('') + '</div>';
}
function bindFlexIconGroup(id, fn){
  const group = document.getElementById(id);
  if(!group) return;
  Array.from(group.querySelectorAll('.flexIconBtn')).forEach(function(btn){
    btn.addEventListener('click', function(){
      Array.from(group.querySelectorAll('.flexIconBtn')).forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      effectiveSelection().forEach(function(t){ fn(btn.dataset.value, t); });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  });
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
  } },
  textarea: { label: 'Textarea', build: function(doc){
    const el = doc.createElement('textarea');
    el.placeholder = 'Digite aqui...'; el.rows = 4;
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block; resize:vertical;';
    return el;
  } },
  select: { label: 'Select (lista suspensa)', build: function(doc){
    const el = doc.createElement('select');
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block;';
    ['Opção 1', 'Opção 2', 'Opção 3'].forEach(function(t){ const o = doc.createElement('option'); o.textContent = t; el.appendChild(o); });
    return el;
  } },
  checkbox: { label: 'Checkbox', build: function(doc){
    const el = doc.createElement('label');
    el.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:14px; margin:0 0 12px;';
    const input = doc.createElement('input'); input.type = 'checkbox';
    el.appendChild(input); el.appendChild(doc.createTextNode('Opção'));
    return el;
  } },
  radio: { label: 'Radio', build: function(doc){
    const el = doc.createElement('label');
    el.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:14px; margin:0 0 12px;';
    const input = doc.createElement('input'); input.type = 'radio'; input.name = 'radio-group';
    el.appendChild(input); el.appendChild(doc.createTextNode('Opção'));
    return el;
  } },
  hr: { label: '— Linha', build: function(doc){
    const el = doc.createElement('hr');
    el.style.cssText = 'border:none; border-top:2px solid #d9dce4; margin:16px 0;';
    return el;
  } },
  circle: { label: '○ Círculo / elipse', build: function(doc){
    const el = doc.createElement('div');
    el.style.cssText = 'width:100px; height:100px; border-radius:50%; background:#6d8bff;';
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

// ---------- small icon catalog ----------

const ICON_SET = {
  check: { label: 'Check', path: '<polyline points="20 6 9 17 4 12"/>' },
  close: { label: 'Fechar (X)', path: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' },
  heart: { label: 'Coração', path: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>' },
  star: { label: 'Estrela', path: '<polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.6 5.8 21 7 14.1 2 9.3 8.9 8.6"/>' },
  search: { label: 'Buscar', path: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  home: { label: 'Home', path: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>' },
  menu: { label: 'Menu (hamburger)', path: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' },
  arrow: { label: 'Seta →', path: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/>' },
  mail: { label: 'E-mail', path: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/>' },
  user: { label: 'Usuário', path: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
};

function insertIcon(key){
  const doc = getDoc();
  const def = ICON_SET[key];
  if(!doc || !def) return;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = def.path;
  svg.style.display = 'block';
  svg.style.color = '#1b1d23';
  insertionContainer(doc).appendChild(svg);
  selectElement(svg);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function showIconMenu(x, y){
  const items = Object.keys(ICON_SET).map(function(key){
    return { label: '◇ ' + ICON_SET[key].label, action: function(){ insertIcon(key); } };
  });
  showContextMenu(x, y, items);
}

function showAddElementMenu(x, y){
  const items = Object.keys(ELEMENT_TEMPLATES).map(function(key){
    return { label: ELEMENT_TEMPLATES[key].label, action: function(){ addElement(key); } };
  });
  items.push({ separator: true });
  items.push({ label: 'Imagem…', action: function(){ document.getElementById('imageInput').click(); } });
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

// ---------- group / ungroup ----------

function groupSelection(){
  const items = effectiveSelection();
  if(items.length < 2) return;
  const doc = getDoc();
  items.forEach(ensureAbsolute);
  const rects = items.map(function(el){ return { el: el, r: elRectToStage(el) }; });
  const minLeft = Math.min.apply(null, rects.map(function(i){ return i.r.left; }));
  const minTop = Math.min.apply(null, rects.map(function(i){ return i.r.top; }));
  const maxRight = Math.max.apply(null, rects.map(function(i){ return i.r.left + i.r.width; }));
  const maxBottom = Math.max.apply(null, rects.map(function(i){ return i.r.top + i.r.height; }));
  const bodyRect = elRectToStage(doc.body);

  const group = doc.createElement('div');
  group.dataset.aeGroup = '1';
  group.style.position = 'absolute';
  group.style.left = (minLeft - bodyRect.left) + 'px';
  group.style.top = (minTop - bodyRect.top) + 'px';
  group.style.width = (maxRight - minLeft) + 'px';
  group.style.height = (maxBottom - minTop) + 'px';
  doc.body.appendChild(group);

  rects.forEach(function(item){
    group.appendChild(item.el);
    item.el.style.left = (item.r.left - minLeft) + 'px';
    item.el.style.top = (item.r.top - minTop) + 'px';
  });

  state.multiSelect = new Set();
  selectElement(group);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function ungroupSelection(){
  const el = state.selected;
  if(!el || el.dataset.aeGroup !== '1') return;
  const parent = el.parentElement;
  const children = Array.from(el.children);
  children.forEach(function(child){
    const r = elRectToStage(child);
    parent.insertBefore(child, el);
    if(isFreeform(child)){
      const pRect = elRectToStage(parent);
      child.style.left = (r.left - pRect.left) + 'px';
      child.style.top = (r.top - pRect.top) + 'px';
    }
  });
  el.remove();
  state.multiSelect = new Set(children.slice(0, -1));
  selectElement(children[children.length - 1] || null);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

// ---------- duplicate / delete ----------

function duplicateSelected(){
  if(state.artboardMode){ const a = activeArtboard(); if(a) duplicateArtboard(a); return; }
  const items = effectiveSelection();
  if(!items.length) return;
  const clones = items.map(function(el){
    const clone = el.cloneNode(true);
    el.parentNode.insertBefore(clone, el.nextSibling);
    if(isFreeform(el)){
      const left = (parseFloat(el.style.left) || 0) + 20;
      const top = (parseFloat(el.style.top) || 0) + 20;
      clone.style.left = left + 'px'; clone.style.top = top + 'px';
    }
    return clone;
  });
  state.multiSelect = new Set(clones.slice(0, -1));
  state.selected = clones[clones.length - 1];
  state.artboardMode = false;
  renderOverlay(); renderProps(); renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

async function deleteSelected(){
  if(state.artboardMode){
    const a = activeArtboard();
    if(a && await showConfirm('Excluir o artboard "' + a.name + '"? Essa ação não pode ser desfeita.', 'Excluir artboard', true)) deleteArtboard(a);
    return;
  }
  const items = effectiveSelection();
  if(!items.length) return;
  selectElement(null);
  items.forEach(function(el){ el.remove(); });
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
  recordRecentProject(name);
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
    setTimeout(function(){ recordRecentProject(state.currentProject); }, 200);
  };
  reader.readAsText(file);
}

function clearAllArtboards(){
  artboards.forEach(function(a){ a.dom.wrap.remove(); });
  artboards = [];
  state.activeId = null; state.selected = null; state.artboardMode = false;
}

document.getElementById('layersSearch').addEventListener('input', function(){
  state.layersFilter = this.value.trim().toLowerCase();
  renderLayers();
  highlightLayerRow();
});

// ---------- toolbar wiring ----------

// the preset picker moved out of the toolbar (Fase 13) — a new artboard
// just starts at the usual desktop size now; resize it from its own
// Properties panel (Tamanho da tela) same as any existing artboard.
function nextArtboardSize(){
  return { w: 1440, h: 900 };
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

// wraps the artboard's document in an SVG <foreignObject> so it can be
// rasterized to PNG (or saved as-is as an .svg). Doesn't capture anything
// loaded across origins that the browser refuses to draw into a canvas
// (e.g. remote images without CORS) — those come through blank.
function buildExportSVG(ab){
  let doc; try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return null;
  const clone = doc.documentElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  ['data-ae-name', 'data-ae-locked', 'data-ae-group', 'data-ae-goto'].forEach(function(attr){
    clone.querySelectorAll('[' + attr + ']').forEach(function(n){ n.removeAttribute(attr); });
  });
  const xhtml = new XMLSerializer().serializeToString(clone);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + ab.w + '" height="' + ab.h + '" viewBox="0 0 ' + ab.w + ' ' + ab.h + '">' +
    '<foreignObject width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
}

function exportArtboardSVG(ab){
  const svg = buildExportSVG(ab);
  if(!svg){ showAlert('Não consegui ler o conteúdo desse artboard.'); return; }
  downloadFile((ab.name || 'artifact') + '.svg', svg, 'image/svg+xml');
}

// blob: URLs make Chrome treat the drawn SVG as tainted the moment it
// contains a <foreignObject> (regardless of same-origin), which throws on
// toBlob/toDataURL — a base64 data: URI avoids that entirely.
function svgToDataUri(svg){
  return 'data:image/svg+xml;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function exportArtboardPNG(ab){
  const svg = buildExportSVG(ab);
  if(!svg){ showAlert('Não consegui ler o conteúdo desse artboard.'); return; }
  const img = new Image();
  img.onload = function(){
    const canvas = document.createElement('canvas');
    canvas.width = ab.w; canvas.height = ab.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ab.w, ab.h);
    try {
      ctx.drawImage(img, 0, 0, ab.w, ab.h);
      canvas.toBlob(function(pngBlob){
        if(!pngBlob){ showAlert('Não consegui gerar o PNG desse artboard — tenta exportar como .html.'); return; }
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl; a.download = (ab.name || 'artifact') + '.png';
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    } catch(err){
      showAlert('Não consegui gerar o PNG desse artboard (o navegador recusou desenhar algo nele) — tenta exportar como .html.');
    }
  };
  img.onerror = function(){
    showAlert('Não consegui gerar o PNG desse artboard (o navegador recusou desenhar algo nele) — tenta exportar como .html.');
  };
  img.src = svgToDataUri(svg);
}

// small preview image (data URL) of an artboard, for the recent-projects
// gallery — same SVG->canvas technique as PNG export, just tiny and async.
function captureThumbnail(ab){
  return new Promise(function(resolve){
    const svg = buildExportSVG(ab);
    if(!svg){ resolve(null); return; }
    const img = new Image();
    const w = 320, h = Math.round(320 * (ab.h / ab.w));
    img.onload = function(){
      try{
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch(err){ resolve(null); }
    };
    img.onerror = function(){ resolve(null); };
    img.src = svgToDataUri(svg);
  });
}

// ---------- recent projects (localStorage, thumbnail-only — the browser
// won't let us remember an actual file path for security reasons, so
// clicking one just opens the file picker again) ----------

function loadRecentProjects(){
  try { return JSON.parse(localStorage.getItem('ae_recent_projects') || '[]'); } catch(e){ return []; }
}
async function recordRecentProject(name){
  const a = activeArtboard();
  const thumbnail = a ? await captureThumbnail(a) : null;
  let list = loadRecentProjects().filter(function(p){ return p.name !== name; });
  list.unshift({ name: name, thumbnail: thumbnail, savedAt: Date.now() });
  list = list.slice(0, 8);
  try { localStorage.setItem('ae_recent_projects', JSON.stringify(list)); } catch(e){ /* storage full — skip */ }
}
function renderRecentProjects(){
  const grid = document.getElementById('recentProjectsGrid');
  const list = loadRecentProjects();
  if(!list.length){ grid.innerHTML = '<div class="recentEmpty">Nenhum projeto recente ainda — salve ou abra um pra aparecer aqui.</div>'; return; }
  grid.innerHTML = '';
  list.forEach(function(p){
    const card = document.createElement('button');
    card.className = 'recentCard';
    const date = new Date(p.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    card.innerHTML =
      (p.thumbnail ? '<img class="thumb" src="' + p.thumbnail + '">' : '<div class="thumb"></div>') +
      '<div class="info"><div class="name">' + p.name + '</div><div class="date">' + date + '</div></div>';
    card.addEventListener('click', function(){
      document.getElementById('recentProjectsOverlay').classList.remove('open');
      document.getElementById('projectFileInput').click();
    });
    grid.appendChild(card);
  });
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
    } },
    { separator: true },
    { label: 'Imagem PNG', action: function(){ exportArtboardPNG(a); } },
    { label: 'Imagem SVG', action: function(){ exportArtboardSVG(a); } }
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
document.getElementById('btnRecentProjects').addEventListener('click', function(){
  renderRecentProjects();
  document.getElementById('recentProjectsOverlay').classList.add('open');
});
document.getElementById('recentProjectsClose').addEventListener('click', function(){
  document.getElementById('recentProjectsOverlay').classList.remove('open');
});
document.getElementById('recentProjectsOverlay').addEventListener('click', function(e){
  if(e.target === this) this.classList.remove('open');
});

document.getElementById('modeEdit').addEventListener('click', function(){ setMode(true); });
document.getElementById('modePreview').addEventListener('click', function(){ setMode(false); });
function setMode(edit){
  state.editMode = edit;
  document.getElementById('modeEdit').classList.toggle('active', edit);
  document.getElementById('modePreview').classList.toggle('active', !edit);
  if(!edit){ state.selected = null; state.multiSelect = new Set(); state.artboardMode = false; }
  renderOverlay();
}

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
// Duplicar/Excluir dropped from the toolbar (Fase 13) — still reachable via
// Ctrl+D / Del, the X on a layer row, and the right-click menu.

document.getElementById('addElementBtn').addEventListener('click', function(e){
  e.stopPropagation();
  const r = e.target.getBoundingClientRect();
  showAddElementMenu(r.left, r.bottom + 4);
});
document.getElementById('btnStylePainter').addEventListener('click', function(e){
  e.stopPropagation();
  if(state.stylePainter.active){ setStylePainterActive(false); return; }
  // capture from whatever is already selected — select the source first,
  // then press this button, then click the target(s) to paste onto them.
  if(!state.selected || state.artboardMode){ showAlert('Selecione o elemento de origem primeiro, depois clique em "Copiar estilo".'); return; }
  const doc = getDoc();
  const cs = doc.defaultView.getComputedStyle(state.selected);
  const props = {};
  STYLE_PAINT_PROPS.forEach(function(p){ props[p] = cs[p]; });
  state.stylePainter.active = true;
  state.stylePainter.props = props;
  document.getElementById('btnStylePainter').classList.add('active');
  document.getElementById('btnStylePainter').textContent = 'Clique pra aplicar (Esc pra sair)';
  flashPicked(state.selected);
});
document.getElementById('btnIcons').addEventListener('click', function(e){
  e.stopPropagation();
  const r = e.target.getBoundingClientRect();
  showIconMenu(r.left, r.bottom + 4);
});
document.getElementById('imageInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(file) addImageFromFile(file);
  e.target.value = '';
});

function zoomBy(delta){
  state.zoom = Math.max(0.1, Math.min(3, state.zoom + delta));
  applyZoom(); renderOverlay();
}
function onCanvasWheel(e){
  if(!e.ctrlKey) return;
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 0.05 : -0.05);
}
document.getElementById('zoomIn').addEventListener('click', function(){ zoomBy(0.1); });
document.getElementById('zoomOut').addEventListener('click', function(){ zoomBy(-0.1); });
document.getElementById('zoomReset').addEventListener('click', function(){ state.zoom = 1; applyZoom(); renderOverlay(); });
canvasWrap.addEventListener('wheel', onCanvasWheel, { passive: false });

// ---------- side panels: collapse toggle + drag-to-resize (Fase 13) ----------

function bindPanelToggle(btnId, panelId){
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener('click', function(){
    const hidden = panel.classList.toggle('collapsed');
    btn.classList.toggle('active', !hidden);
    try { localStorage.setItem('ae_' + panelId + '_collapsed', hidden ? '1' : '0'); } catch(e){}
  });
  try {
    if(localStorage.getItem('ae_' + panelId + '_collapsed') === '1'){
      panel.classList.add('collapsed');
      btn.classList.remove('active');
    }
  } catch(e){}
}
bindPanelToggle('btnToggleLayers', 'layersPanel');
bindPanelToggle('btnToggleProps', 'propsPanel');

function bindPanelResize(handleId, panelId, fromRightEdge){
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  handle.addEventListener('mousedown', function(e){
    if(e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startW = panel.getBoundingClientRect().width;
    handle.classList.add('dragging');
    // dragging past the panel edge crosses over an artboard iframe, and a
    // window-only mousemove listener stops getting events once the cursor
    // is over one (same root cause as the old element-drag bug) — a
    // full-viewport capture overlay on top of everything sidesteps that.
    const capture = document.createElement('div');
    capture.style.cssText = 'position:fixed; inset:0; z-index:9999; cursor:col-resize;';
    document.body.appendChild(capture);
    function onMove(ev){
      const dx = ev.clientX - startX;
      const w = Math.max(180, Math.min(520, startW + (fromRightEdge ? dx : -dx)));
      panel.style.width = w + 'px';
    }
    function onUp(){
      handle.classList.remove('dragging');
      capture.remove();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('ae_' + panelId + '_width', panel.style.width); } catch(e){}
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  try {
    const saved = localStorage.getItem('ae_' + panelId + '_width');
    if(saved) panel.style.width = saved;
  } catch(e){}
}
bindPanelResize('layersResizeHandle', 'layersPanel', true);
bindPanelResize('propsResizeHandle', 'propsPanel', false);

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
    state.selected = null; state.multiSelect = new Set(); state.artboardMode = false;
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
  else if(e.key === 'Escape'){
    if(state.stylePainter.active) setStylePainterActive(false);
    state.selected = null; state.multiSelect = new Set(); state.artboardMode = false;
    renderOverlay(); renderProps(); highlightLayerRow();
  }
  else if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) !== -1 && state.selected && !state.artboardMode){
    if(!isFreeform(state.selected)) return;
    e.preventDefault();
    const el = state.selected;
    const step = e.shiftKey ? 10 : 1;
    let left = parseFloat(el.style.left) || 0, top = parseFloat(el.style.top) || 0;
    if(e.key === 'ArrowUp') top -= step;
    else if(e.key === 'ArrowDown') top += step;
    else if(e.key === 'ArrowLeft') left -= step;
    else if(e.key === 'ArrowRight') left += step;
    el.style.left = Math.max(0, left) + 'px';
    el.style.top = Math.max(0, top) + 'px';
    updateOverlayLive();
    clearTimeout(nudgeDebounce);
    nudgeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  }
}
let nudgeDebounce;

document.addEventListener('keydown', function(e){ handleGlobalKeydown(e, document); });
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
  const selCount = effectiveSelection().length;
  if(selCount >= 2){
    items.push({ separator: true });
    items.push({ label: '⟸ Alinhar à esquerda', action: function(){ alignSelection('left'); } });
    items.push({ label: '⟺ Centralizar horizontal', action: function(){ alignSelection('hcenter'); } });
    items.push({ label: '⟹ Alinhar à direita', action: function(){ alignSelection('right'); } });
    items.push({ label: '⟰ Alinhar ao topo', action: function(){ alignSelection('top'); } });
    items.push({ label: '⟺ Centralizar vertical', action: function(){ alignSelection('vcenter'); } });
    items.push({ label: '⟱ Alinhar à base', action: function(){ alignSelection('bottom'); } });
    if(selCount >= 3){
      items.push({ label: 'Distribuir horizontal', action: function(){ distributeSelection('h'); } });
      items.push({ label: 'Distribuir vertical', action: function(){ distributeSelection('v'); } });
    }
    items.push({ label: 'Agrupar', action: groupSelection });
  }
  if(el.dataset.aeGroup === '1'){
    items.push({ separator: true });
    items.push({ label: 'Desagrupar', action: ungroupSelection });
  }
  items.push({ separator: true });
  items.push({ label: 'Trazer para frente', action: function(){ bringToFront(el); } });
  items.push({ label: 'Enviar para trás', action: function(){ sendToBack(el); } });
  items.push({ separator: true });
  items.push({ label: 'Duplicar', action: duplicateSelected });
  items.push({ label: 'Copiar', action: copySelected });
  items.push({ label: 'Colar', action: pasteClipboard, disabled: !clipboardEl });
  items.push({ separator: true });
  items.push({ label: 'Renomear…', action: function(){ renameElementPrompt(el); } });
  items.push({ separator: true });
  items.push({ label: 'Excluir' + (selCount > 1 ? ' (' + selCount + ')' : ''), danger: true, action: deleteSelected });
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

// ---------- FASE 08: Editor de CSS Estruturado & Biblioteca de Classes ----------

let activeCssClass = null;
let cssClassSearchFilter = '';

function getAllClassRules(doc){
  const cssText = getStyleText(doc);
  const rulesMap = new Map();
  const re = /\.([a-zA-Z0-9_-]+)\s*\{([\s\S]*?)\}/g;
  let match;
  while((match = re.exec(cssText)) !== null){
    const className = match[1];
    const selector = '.' + className;
    const body = match[2].trim();
    if(!rulesMap.has(className)){
      let usageCount = 0;
      try { usageCount = doc.querySelectorAll(selector).length; } catch(e){}
      rulesMap.set(className, { selector: selector, className: className, body: body, count: usageCount });
    }
  }
  return Array.from(rulesMap.values());
}

// the class library spans every artboard, not just the active one — this is
// what actually lets a class made on one screen get reused on another
// without retyping its CSS (each artboard's <style> is otherwise its own
// isolated document, so without this a "library" would just be a list of
// whatever happens to already be in the artboard you're looking at).
function getAllClassRulesAcrossArtboards(){
  const map = new Map();
  artboards.forEach(function(ab){
    let doc; try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
    if(!doc) return;
    getAllClassRules(doc).forEach(function(rule){
      let entry = map.get(rule.className);
      if(!entry){
        entry = { className: rule.className, body: rule.body, count: 0, artboardNames: [] };
        map.set(rule.className, entry);
      }
      entry.count += rule.count;
      entry.artboardNames.push(ab.name);
    });
  });
  return Array.from(map.values()).sort(function(a, b){ return a.className.localeCompare(b.className); });
}

// copies a class's rule body into the active artboard's <style> if it isn't
// defined there yet, sourcing it from wherever else in the project it
// already exists — the "reuse without rewriting CSS" part of the library.
function ensureClassRuleInActiveDoc(className){
  const doc = getDoc();
  if(!doc || !className) return;
  if(findRuleBlock(getStyleText(doc), '.' + className)) return;
  const found = getAllClassRulesAcrossArtboards().find(function(r){ return r.className === className; });
  if(found) setClassRuleBody(doc, '.' + className, found.body);
}

function getRootVariables(doc){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  if(!found) return [];
  const vars = [];
  const lines = found.body.split(';');
  lines.forEach(function(l){
    const parts = l.split(':');
    if(parts.length >= 2){
      const name = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      if(name.startsWith('--')){
        vars.push({ name: name, value: val });
      }
    }
  });
  return vars;
}

function varDropdownHTML(doc, currentVal, selectId){
  const vars = getRootVariables(doc);
  if(!vars.length) return '';
  let options = '<option value="">(Cor / Custom)</option>';
  vars.forEach(function(v){
    const vStr = 'var(' + v.name + ')';
    const sel = (currentVal || '').indexOf(v.name) !== -1;
    options += '<option value="' + vStr + '"' + (sel ? ' selected' : '') + '>' + v.name + '</option>';
  });
  return '<select id="' + selectId + '" style="max-width:115px; font-size:11px; padding:2px 4px;" title="Usar variável do :root">' + options + '</select>';
}

function setRootVariable(doc, varName, value){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  let vars = getRootVariables(doc);
  const existing = vars.find(function(v){ return v.name === varName; });
  if(existing){ existing.value = value; }
  else { vars.push({ name: varName, value: value }); }

  const newBody = vars.map(function(v){ return v.name + ': ' + v.value + ';'; }).join('\n  ');
  const block = ':root {\n  ' + newBody + '\n}';
  const updated = found
    ? cssText.slice(0, found.index) + block + cssText.slice(found.index + found.full.length)
    : block + '\n\n' + cssText;
  setStyleText(doc, updated);
}

function deleteRootVariable(doc, varName){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  if(!found) return;
  let vars = getRootVariables(doc).filter(function(v){ return v.name !== varName; });
  if(!vars.length){
    setStyleText(doc, cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length).trim());
  } else {
    const newBody = vars.map(function(v){ return v.name + ': ' + v.value + ';'; }).join('\n  ');
    const block = ':root {\n  ' + newBody + '\n}';
    setStyleText(doc, cssText.slice(0, found.index) + block + cssText.slice(found.index + found.full.length));
  }
}

function deleteClassRule(doc, selector){
  let cssText = getStyleText(doc);
  let found;
  while((found = findRuleBlock(cssText, selector)) !== null){
    cssText = cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length).trim();
  }
  setStyleText(doc, cssText);
}

function parseCssDeclarations(bodyText){
  const map = {};
  if(!bodyText) return map;
  const lines = bodyText.split(';');
  lines.forEach(function(line){
    const colonIdx = line.indexOf(':');
    if(colonIdx !== -1){
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      if(key) map[key] = val;
    }
  });
  return map;
}

function renderCssEditorModal(){
  const doc = getDoc();
  if(!doc) return;

  // the class picked from the sidebar may live in another artboard's
  // stylesheet only — pull it into this artboard before editing/using it.
  if(activeCssClass) ensureClassRuleInActiveDoc(activeCssClass);

  // Render Class Library List — spans every artboard in the project, not
  // just the active one, so a class made anywhere shows up as reusable here.
  const classListContainer = document.getElementById('cssClassList');
  const libraryRules = getAllClassRulesAcrossArtboards();
  const localClassNames = new Set(getAllClassRules(doc).map(function(r){ return r.className; }));
  const filtered = libraryRules.filter(function(r){
    return !cssClassSearchFilter || r.className.toLowerCase().includes(cssClassSearchFilter);
  });

  if(!activeCssClass && filtered.length > 0){
    activeCssClass = filtered[0].className;
    ensureClassRuleInActiveDoc(activeCssClass);
  } else if(activeCssClass && !libraryRules.some(function(r){ return r.className === activeCssClass; })){
    activeCssClass = filtered.length > 0 ? filtered[0].className : null;
  }

  classListContainer.innerHTML = '';
  if(!filtered.length){
    classListContainer.innerHTML = '<div style="color:var(--text-dim); font-size:12px; padding:12px; text-align:center;">Nenhuma classe encontrada.</div>';
  } else {
    filtered.forEach(function(rule){
      const item = document.createElement('div');
      const isLocal = localClassNames.has(rule.className);
      item.className = 'css-class-item' + (rule.className === activeCssClass ? ' active' : '');
      item.innerHTML = '<span class="class-name">.' + rule.className + '</span>' +
        (isLocal ? '' : '<span class="class-badge" title="Definida em: ' + rule.artboardNames.join(', ') + ' — clique pra reaproveitar aqui">outro artboard</span>') +
        '<span class="class-count">' + rule.count + ' uso' + (rule.count !== 1 ? 's' : '') + '</span>';
      item.addEventListener('click', function(){
        activeCssClass = rule.className;
        ensureClassRuleInActiveDoc(rule.className);
        renderCssEditorModal();
      });
      classListContainer.appendChild(item);
    });
  }

  // Render Form for Active Class — always edits the copy in the active
  // artboard's own stylesheet (ensureClassRuleInActiveDoc above guarantees
  // one exists there by this point).
  const formContainer = document.getElementById('cssClassFormContainer');
  const rules = getAllClassRules(doc);
  if(!activeCssClass){
    formContainer.innerHTML = '<div class="css-empty-state">Selecione ou crie uma classe na lista ao lado para editar suas propriedades.</div>';
  } else {
    const activeRule = rules.find(function(r){ return r.className === activeCssClass; }) || { selector: '.' + activeCssClass, className: activeCssClass, body: '' };
    const decls = parseCssDeclarations(activeRule.body);

    function getVal(prop){ return decls[prop] || ''; }
    function hexVal(prop){
      const v = decls[prop] || '';
      return v.startsWith('#') ? v : (v ? rgbToHex(v) : '#000000');
    }

    formContainer.innerHTML =
      '<div class="css-class-header-bar">' +
        '<h3>.' + activeCssClass + '</h3>' +
        '<div class="css-class-actions">' +
          (state.selected ? '<button type="button" class="miniBtn primary" id="btnApplyClassToSelected" title="Adiciona esta classe ao elemento atualmente selecionado">+ Aplicar ao elemento</button>' : '') +
          '<button type="button" class="miniBtn danger" id="btnDeleteCssClass">Excluir classe</button>' +
        '</div>' +
      '</div>' +

      '<div class="css-section-title">Tipografia</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Família da fonte</label><input type="text" id="css_font_family" value="' + getVal('font-family').replace(/"/g, '&quot;') + '" placeholder="ex: Inter, sans-serif"></div>' +
        '<div class="field"><label>Tamanho (font-size)</label><input type="text" id="css_font_size" value="' + getVal('font-size') + '" placeholder="ex: 16px"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Peso (font-weight)</label><input type="text" id="css_font_weight" value="' + getVal('font-weight') + '" placeholder="ex: 600, bold"></div>' +
        '<div class="field"><label>Cor do texto</label><div class="fieldRow" style="display:flex; gap:4px;"><input type="color" id="css_color" value="' + hexVal('color') + '">' + varDropdownHTML(doc, getVal('color'), 'css_color_var') + '</div></div>' +
      '</div>' +

      '<div class="css-section-title">Fundo &amp; Superfície</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Cor de fundo</label><div class="fieldRow" style="display:flex; gap:4px;"><input type="color" id="css_bg_color" value="' + hexVal('background-color') + '">' + varDropdownHTML(doc, getVal('background-color'), 'css_bg_color_var') + '</div></div>' +
        '<div class="field"><label>Cantos (border-radius)</label><input type="text" id="css_border_radius" value="' + getVal('border-radius') + '" placeholder="ex: 8px"></div>' +
      '</div>' +
      '<div class="field"><label>Sombra (box-shadow)</label><input type="text" id="css_box_shadow" value="' + getVal('box-shadow').replace(/"/g, '&quot;') + '" placeholder="ex: 0 4px 12px rgba(0,0,0,0.1)"></div>' +

      '<div class="css-section-title">Espaçamento (Padding &amp; Margin)</div>' +
      '<div class="row4">' +
        '<div class="field"><label>Pad T</label><input type="text" id="css_pad_t" value="' + getVal('padding-top') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad R</label><input type="text" id="css_pad_r" value="' + getVal('padding-right') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad B</label><input type="text" id="css_pad_b" value="' + getVal('padding-bottom') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad L</label><input type="text" id="css_pad_l" value="' + getVal('padding-left') + '" placeholder="0"></div>' +
      '</div>' +
      '<div class="row4">' +
        '<div class="field"><label>Mar T</label><input type="text" id="css_mar_t" value="' + getVal('margin-top') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar R</label><input type="text" id="css_mar_r" value="' + getVal('margin-right') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar B</label><input type="text" id="css_mar_b" value="' + getVal('margin-bottom') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar L</label><input type="text" id="css_mar_l" value="' + getVal('margin-left') + '" placeholder="0"></div>' +
      '</div>' +

      '<div class="css-section-title">Layout &amp; Tamanho</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Display</label><input type="text" id="css_display" value="' + getVal('display') + '" placeholder="ex: flex, block"></div>' +
        '<div class="field"><label>Gap</label><input type="text" id="css_gap" value="' + getVal('gap') + '" placeholder="ex: 12px"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Largura (width)</label><input type="text" id="css_width" value="' + getVal('width') + '" placeholder="ex: 100%, 300px"></div>' +
        '<div class="field"><label>Altura (height)</label><input type="text" id="css_height" value="' + getVal('height') + '" placeholder="ex: auto, 50px"></div>' +
      '</div>' +

      '<div class="css-section-title">Borda</div>' +
      '<div class="row3">' +
        '<div class="field"><label>Espessura</label><input type="text" id="css_border_w" value="' + getVal('border-width') + '" placeholder="1px"></div>' +
        '<div class="field"><label>Estilo</label><input type="text" id="css_border_s" value="' + getVal('border-style') + '" placeholder="solid"></div>' +
        '<div class="field"><label>Cor</label><div class="fieldRow" style="display:flex; gap:4px;"><input type="color" id="css_border_c" value="' + hexVal('border-color') + '">' + varDropdownHTML(doc, getVal('border-color'), 'css_border_c_var') + '</div></div>' +
      '</div>' +

      '<div class="css-section-title" style="display:flex; justify-content:space-between; align-items:center;">' +
        '<span>Corpo da Regra CSS (Texto Bruto)</span>' +
        (getRootVariables(doc).length ?
          '<select id="cssInsertVarSelect" style="max-width:180px; font-size:11.5px; padding:2px 6px;" title="Inserir variável do :root no código">' +
            '<option value="">+ Inserir var(:root)...</option>' +
            getRootVariables(doc).map(function(v){ return '<option value="var(' + v.name + ')">' + v.name + ' (' + v.value + ')</option>'; }).join('') +
          '</select>' : '') +
      '</div>' +
      '<div class="field"><textarea id="cssRawBody" rows="6" spellcheck="false" placeholder="background: var(--bg-dark);\ncolor: var(--primary-color);">' + activeRule.body + '</textarea></div>';

    const rawTextarea = document.getElementById('cssRawBody');
    const cssInsertVarSelect = document.getElementById('cssInsertVarSelect');

    function saveCurrentClassRule(newBodyText){
      setClassRuleBody(doc, '.' + activeCssClass, newBodyText);
      pushHistory(); syncCodeFromCanvas(); renderProps();
    }

    if(cssInsertVarSelect){
      cssInsertVarSelect.addEventListener('change', function(){
        const v = this.value;
        if(!v) return;
        const cur = rawTextarea.value;
        const insertText = (cur && !cur.endsWith('\n') && !cur.endsWith(' ') ? ' ' : '') + v + ';';
        rawTextarea.value = cur + insertText;
        saveCurrentClassRule(rawTextarea.value);
        this.value = '';
        renderCssEditorModal();
      });
    }

    ['css_color_var', 'css_bg_color_var', 'css_border_c_var'].forEach(function(varId){
      const selEl = document.getElementById(varId);
      if(!selEl) return;
      selEl.addEventListener('change', function(){
        if(!this.value) return;
        const propName = varId === 'css_color_var' ? 'color' : (varId === 'css_bg_color_var' ? 'background-color' : 'border-color');
        decls[propName] = this.value;
        const updatedBody = Object.keys(decls).map(function(k){ return k + ': ' + decls[k] + ';'; }).join('\n  ');
        rawTextarea.value = updatedBody;
        saveCurrentClassRule(updatedBody);
        renderCssEditorModal();
      });
    });

    rawTextarea.addEventListener('change', function(){
      saveCurrentClassRule(this.value);
      renderCssEditorModal();
    });

    const fieldMap = [
      { id: 'css_font_family', prop: 'font-family' },
      { id: 'css_font_size', prop: 'font-size' },
      { id: 'css_font_weight', prop: 'font-weight' },
      { id: 'css_color', prop: 'color', isColor: true },
      { id: 'css_bg_color', prop: 'background-color', isColor: true },
      { id: 'css_border_radius', prop: 'border-radius' },
      { id: 'css_box_shadow', prop: 'box-shadow' },
      { id: 'css_pad_t', prop: 'padding-top' },
      { id: 'css_pad_r', prop: 'padding-right' },
      { id: 'css_pad_b', prop: 'padding-bottom' },
      { id: 'css_pad_l', prop: 'padding-left' },
      { id: 'css_mar_t', prop: 'margin-top' },
      { id: 'css_mar_r', prop: 'margin-right' },
      { id: 'css_mar_b', prop: 'margin-bottom' },
      { id: 'css_mar_l', prop: 'margin-left' },
      { id: 'css_display', prop: 'display' },
      { id: 'css_gap', prop: 'gap' },
      { id: 'css_width', prop: 'width' },
      { id: 'css_height', prop: 'height' },
      { id: 'css_border_w', prop: 'border-width' },
      { id: 'css_border_s', prop: 'border-style' },
      { id: 'css_border_c', prop: 'border-color', isColor: true }
    ];

    fieldMap.forEach(function(item){
      const input = document.getElementById(item.id);
      if(!input) return;
      const eventName = item.isColor ? 'input' : 'change';
      input.addEventListener(eventName, function(){
        const val = input.value.trim();
        if(val) decls[item.prop] = val;
        else delete decls[item.prop];

        const updatedBody = Object.keys(decls).map(function(k){ return k + ': ' + decls[k] + ';'; }).join('\n  ');
        rawTextarea.value = updatedBody;
        saveCurrentClassRule(updatedBody);
      });
    });

    const btnApply = document.getElementById('btnApplyClassToSelected');
    if(btnApply){
      btnApply.addEventListener('click', function(){
        if(state.selected){
          const currentClasses = (state.selected.className || '').trim().split(/\s+/).filter(Boolean);
          if(!currentClasses.includes(activeCssClass)){
            currentClasses.push(activeCssClass);
            state.selected.className = currentClasses.join(' ');
            pushHistory(); syncCodeFromCanvas(); renderProps();
            renderCssEditorModal();
          }
        }
      });
    }

    const btnDel = document.getElementById('btnDeleteCssClass');
    if(btnDel){
      btnDel.addEventListener('click', async function(){
        if(await showConfirm('Excluir a classe .' + activeCssClass + '? Essa ação altera o estilo de todos os elementos que a usam.', 'Excluir classe CSS', true)){
          deleteClassRule(doc, '.' + activeCssClass);
          activeCssClass = null;
          pushHistory(); syncCodeFromCanvas(); renderProps();
          renderCssEditorModal();
        }
      });
    }
  }

  // Render Variables Tab
  const varListContainer = document.getElementById('cssVarList');
  const vars = getRootVariables(doc);
  varListContainer.innerHTML = '';

  if(!vars.length){
    varListContainer.innerHTML = '<div style="color:var(--text-dim); font-size:13px; padding:12px 0;">Nenhuma variável CSS definida em <code>:root</code>. Clique acima para criar a primeira!</div>';
  } else {
    vars.forEach(function(v){
      const row = document.createElement('div');
      row.className = 'css-var-row';

      const isHex = v.value.startsWith('#') || v.value.startsWith('rgb');
      const colorInputHTML = isHex ? '<input type="color" value="' + (v.value.startsWith('#') ? v.value : rgbToHex(v.value)) + '">' : '';

      row.innerHTML =
        '<input type="text" class="var-name" value="' + v.name + '" placeholder="--var-name">' +
        '<input type="text" class="var-val" value="' + v.value.replace(/"/g, '&quot;') + '" placeholder="valor">' +
        colorInputHTML +
        '<button type="button" class="miniBtn danger var-del" title="Excluir variável">✕</button>';

      const nameInput = row.querySelector('.var-name');
      const valInput = row.querySelector('.var-val');
      const colorInput = row.querySelector('input[type="color"]');
      const delBtn = row.querySelector('.var-del');

      nameInput.addEventListener('change', function(){
        deleteRootVariable(doc, v.name);
        const newName = nameInput.value.trim().startsWith('--') ? nameInput.value.trim() : '--' + nameInput.value.trim();
        setRootVariable(doc, newName, valInput.value.trim());
        pushHistory(); syncCodeFromCanvas(); renderProps();
      });

      valInput.addEventListener('change', function(){
        setRootVariable(doc, nameInput.value.trim(), valInput.value.trim());
        pushHistory(); syncCodeFromCanvas(); renderProps();
      });

      if(colorInput){
        colorInput.addEventListener('input', function(){
          valInput.value = colorInput.value;
          setRootVariable(doc, nameInput.value.trim(), colorInput.value);
          pushHistory(); syncCodeFromCanvas(); renderProps();
        });
      }

      delBtn.addEventListener('click', function(){
        deleteRootVariable(doc, v.name);
        pushHistory(); syncCodeFromCanvas(); renderProps();
        renderCssEditorModal();
      });

      varListContainer.appendChild(row);
    });
  }
}

// Open / Close / Wire Modal Events
const cssEditorModal = document.getElementById('cssEditorModal');
document.getElementById('btnCssEditor').addEventListener('click', function(){
  cssEditorModal.style.display = 'flex';
  renderCssEditorModal();
});
document.getElementById('btnCloseCssEditor').addEventListener('click', function(){
  cssEditorModal.style.display = 'none';
});

// Modal Tabs
document.getElementById('tabBtnClasses').addEventListener('click', function(){
  this.classList.add('active');
  document.getElementById('tabBtnVariables').classList.remove('active');
  document.getElementById('cssTabClasses').classList.add('active');
  document.getElementById('cssTabVariables').classList.remove('active');
});
document.getElementById('tabBtnVariables').addEventListener('click', function(){
  this.classList.add('active');
  document.getElementById('tabBtnClasses').classList.remove('active');
  document.getElementById('cssTabVariables').classList.add('active');
  document.getElementById('cssTabClasses').classList.remove('active');
});

// Search input
document.getElementById('cssClassSearchInput').addEventListener('input', function(){
  cssClassSearchFilter = this.value.trim().toLowerCase();
  renderCssEditorModal();
});

// New Class Button
document.getElementById('btnNewCssClass').addEventListener('click', async function(){
  const name = await showPrompt('Nome da nova classe CSS (ex: card-custom ou btn-highlight):', '', 'Nova Classe CSS');
  if(name && name.trim()){
    const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
    const doc = getDoc();
    if(doc){
      setClassRuleBody(doc, '.' + cleanName, '/* propriedades de .' + cleanName + ' */\nbackground-color: transparent;\ncolor: inherit;');
      activeCssClass = cleanName;
      pushHistory(); syncCodeFromCanvas(); renderProps();
      renderCssEditorModal();
    }
  }
});

// New Variable Button
document.getElementById('btnNewCssVar').addEventListener('click', async function(){
  const name = await showPrompt('Nome da nova variável CSS (ex: --accent-color ou --card-radius):', '--', 'Nova Variável CSS');
  if(name && name.trim()){
    const cleanName = name.trim().startsWith('--') ? name.trim() : '--' + name.trim();
    const doc = getDoc();
    if(doc){
      setRootVariable(doc, cleanName, '#35d0a4');
      pushHistory(); syncCodeFromCanvas(); renderProps();
      renderCssEditorModal();
    }
  }
});

// ---------- color popover wiring (one-time — #colorPopover is permanent DOM) ----------

document.getElementById('cpHue').addEventListener('input', function(){
  const alpha = parseInt(document.getElementById('cpAlpha').value, 10) / 100;
  const parts = parseColorParts(this.value);
  parts.a = alpha;
  const rgba = partsToRgba(parts);
  document.getElementById('cpText').value = rgba;
  if(colorPopoverOnChange) colorPopoverOnChange(rgba);
});
document.getElementById('cpAlpha').addEventListener('input', function(){
  const pct = parseInt(this.value, 10);
  document.getElementById('cpAlphaLabel').textContent = pct + '%';
  const parts = parseColorParts(document.getElementById('cpHue').value);
  parts.a = pct / 100;
  const rgba = partsToRgba(parts);
  document.getElementById('cpText').value = rgba;
  if(colorPopoverOnChange) colorPopoverOnChange(rgba);
});
document.getElementById('cpText').addEventListener('change', function(){
  const parts = parseColorParts(this.value);
  document.getElementById('cpHue').value = hexFromRgbParts(parts);
  document.getElementById('cpAlpha').value = Math.round(parts.a * 100);
  document.getElementById('cpAlphaLabel').textContent = Math.round(parts.a * 100) + '%';
  const rgba = partsToRgba(parts);
  this.value = rgba;
  if(colorPopoverOnChange) colorPopoverOnChange(rgba);
});
document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('colorPopover');
  if(!pop.classList.contains('open')) return;
  if(pop.contains(e.target) || e.target.closest('.colorSwatchBtn')) return;
  closeColorPopover();
});

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
