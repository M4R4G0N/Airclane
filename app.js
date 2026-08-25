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
let elNameCounter = 0;
// populated by attributesSectionHTML(BUTTON) each render, consumed by
// bindAttributesSection right after — same synchronous render→bind pass
// used for every other props-panel field, just indexed instead of by id.
let toggleTargetCandidates = [];
// section headers the user has collapsed in the Propriedades panel —
// keyed by the header's own text ("Layout", "Cor"…), persists across
// re-renders/selections for the session, same idea as collapsedLayers.
// starts with the less-frequently-touched sections already folded, so a
// freshly selected element in "Avançado" doesn't dump everything expanded
// at once — the user can still expand/collapse any of them, and that choice
// is remembered same as before.
let collapsedPropsSections = new Set(['Cantos', 'Padding', 'Margin', 'Borda', 'Regra CSS da classe']);
// section headers always visible in the "Exibir" (simple) props view —
// everything else only shows in "Avançado".
const PROPS_SIMPLE_SECTIONS = ['Ação', 'Texto', 'Container', 'Lista', 'Mídia', 'Indicador', 'Layout', 'Cor'];

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
  propsSearchQuery: '',
  stylePainter: { active: false, props: null }, // "copiar estilo" tool: pick a source, then apply to targets
  codeTab: 'html', // which source the code panel's textarea is showing/applying: 'html' or 'js'
  propsView: 'simple' // 'simple' shows only Tipo/Ação/Layout/Cor; 'full' shows every section
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

// clicking a "Mostrar/ocultar elemento" button in Visualizar mode lands
// here — flips the named element's display between 'none' and whatever it
// was before, same simple toggle the exported .html's inline script does.
function toggleElementByName(doc, name){
  if(!doc) return;
  const target = doc.querySelector('[data-ae-name="' + name.replace(/"/g, '\\"') + '"]');
  if(!target) return;
  target.style.display = target.style.display === 'none' ? '' : 'none';
}

function setElementTextByName(doc, name, text){
  if(!doc) return;
  const target = doc.querySelector('[data-ae-name="' + name.replace(/"/g, '\\"') + '"]');
  if(!target) return;
  target.textContent = text;
}

// clicking a "Chamar função JS" button in Visualizar mode calls the named
// global function inside the artboard's own iframe — a plain top-level
// `function nome(){}` written in the JS tab attaches to that window, same
// as it would in any classic (non-module) script.
function callNamedFunction(doc, el){
  const name = el.getAttribute('data-ae-call');
  if(!name || !doc || !doc.defaultView) return;
  const fn = doc.defaultView[name];
  if(typeof fn !== 'function'){
    console.warn('[Arclane] função "' + name + '" não encontrada no JS desse artboard.');
    return;
  }
  try { fn.call(el); } catch(e){ console.error('[Arclane] erro ao chamar "' + name + '":', e); }
}

// dispatches to whichever single action an element carries — used by the
// click/hover handlers above and by the one-shot "ao carregar" firing.
function runElementAction(doc, el){
  const gotoId = el.getAttribute('data-ae-goto');
  if(gotoId){ goToArtboard(gotoId); return; }
  const toggleName = el.getAttribute('data-ae-toggle');
  if(toggleName){ toggleElementByName(doc, toggleName); return; }
  const setTextName = el.getAttribute('data-ae-settext');
  if(setTextName){ setElementTextByName(doc, setTextName, el.getAttribute('data-ae-settext-value') || ''); return; }
  if(el.hasAttribute('data-ae-call')) callNamedFunction(doc, el);
}

// "ao carregar o artboard" actions aren't triggered by user interaction, so
// they aren't gated by edit/visualizar mode — they just run once whenever
// the artboard's document (re)loads, same as any top-level script code would.
function runLoadActions(doc){
  if(!doc) return;
  Array.from(doc.querySelectorAll('[data-ae-evt="load"]')).forEach(function(el){
    runElementAction(doc, el);
  });
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

// grows the artboard's width/height so the content fits without a scrollbar
// — scrollHeight/scrollWidth measure the full content extent regardless of
// the current overflow setting (hidden/auto/scroll all still report it), so
// this works no matter what "Rolagem" is set to. Only grows, never shrinks
// the artboard smaller than it already is.
function fitArtboardToContent(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc || !doc.documentElement) return;
  const neededW = Math.max(ab.w, doc.documentElement.scrollWidth, doc.body ? doc.body.scrollWidth : 0);
  const neededH = Math.max(ab.h, doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
  if(neededW === ab.w && neededH === ab.h) return;
  setArtboardSize(ab, neededW, neededH);
  pushHistory(); syncCodeFromCanvas();
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
    let loadedDoc; try { loadedDoc = ab.dom.frame.contentDocument; } catch(e){ loadedDoc = null; }
    runLoadActions(loadedDoc);
    redrawAllCharts(loadedDoc);
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

// resolves a "Navegar para artboard" target (internal artboard id) to the
// filename that artboard would export as — this only actually navigates
// once every linked artboard has been exported into the same folder, so
// it's a best-effort convenience, not a guarantee.
function gotoExportFilename(id){
  const target = artboards.find(function(a){ return a.id === id; });
  return target ? target.name + '.html' : null;
}

// turns an <a href="#ae-goto:ID"> into a plain relative link — no JS needed,
// the browser navigates on its own once the target file sits next to this one.
function wireExportGotoLinks(clone){
  clone.querySelectorAll('a[href^="#ae-goto:"]').forEach(function(a){
    const id = a.getAttribute('href').slice('#ae-goto:'.length);
    const filename = gotoExportFilename(id);
    if(filename) a.setAttribute('href', filename); else a.removeAttribute('href');
  });
}

// goto/toggle/call on anything other than <a> (button, div, span, image,
// whatever the generic Ação section was used on) has no href to navigate
// through, so it needs a real handler in the exported file — this is what
// makes the action work outside the editor, not just in Visualizar mode.
// One combined script covers all three action kinds plus every trigger
// event (click/hover/hoverout/load), instead of three separate ones.
//
// Toggle's target is resolved by data-ae-name here, before cleanExportHTML
// strips that attribute from the whole document — the target gets a
// throwaway id (only targets get one, not every element) that the runtime
// script can still find it by after the name is gone.
function wireExportActions(doc, clone){
  clone.querySelectorAll('[data-ae-goto]').forEach(function(el){
    const filename = gotoExportFilename(el.getAttribute('data-ae-goto'));
    el.removeAttribute('data-ae-goto');
    if(filename) el.setAttribute('data-ae-goto-href', filename);
    else el.removeAttribute('data-ae-evt');
  });
  let counter = 0;
  // toggle and settext both reference another element by data-ae-name and
  // need the same throwaway-id treatment, done here before that attribute
  // is stripped from the whole document.
  function resolveTarget(el, nameAttr, hrefAttr){
    const name = el.getAttribute(nameAttr);
    el.removeAttribute(nameAttr);
    const target = clone.querySelector('[data-ae-name="' + name.replace(/"/g, '\\"') + '"]');
    if(!target){ el.removeAttribute('data-ae-evt'); return; }
    let eid = target.getAttribute('data-ae-eid');
    if(!eid){ eid = 'ae-el-' + (++counter); target.setAttribute('data-ae-eid', eid); }
    el.setAttribute(hrefAttr, eid);
  }
  clone.querySelectorAll('[data-ae-toggle]').forEach(function(el){ resolveTarget(el, 'data-ae-toggle', 'data-ae-toggle-target'); });
  clone.querySelectorAll('[data-ae-settext]').forEach(function(el){ resolveTarget(el, 'data-ae-settext', 'data-ae-settext-target'); });
  if(!clone.querySelector('[data-ae-goto-href],[data-ae-toggle-target],[data-ae-settext-target],[data-ae-call]')) return;
  const script = doc.createElement('script');
  script.textContent =
    'function aeRunAction(el){' +
      'var g=el.getAttribute("data-ae-goto-href");if(g){location.href=g;return;}' +
      'var t=el.getAttribute("data-ae-toggle-target");if(t){var tg=document.querySelector(\'[data-ae-eid="\'+t+\'"]\');if(tg)tg.style.display=tg.style.display==="none"?"":"none";return;}' +
      'var s=el.getAttribute("data-ae-settext-target");if(s){var sg=document.querySelector(\'[data-ae-eid="\'+s+\'"]\');if(sg)sg.textContent=el.getAttribute("data-ae-settext-value")||"";return;}' +
      'var c=el.getAttribute("data-ae-call");if(c){var fn=window[c];if(typeof fn==="function")fn.call(el);}' +
    '}' +
    'document.querySelectorAll("[data-ae-goto-href],[data-ae-toggle-target],[data-ae-settext-target],[data-ae-call]").forEach(function(el){' +
      'var evt=el.getAttribute("data-ae-evt")||"click";' +
      'if(evt==="load"){aeRunAction(el);}' +
      'else if(evt==="click"){' +
        'if(el.tagName==="FORM"){el.addEventListener("submit",function(e){e.preventDefault();aeRunAction(el);});}' +
        'else{el.addEventListener("click",function(){aeRunAction(el);});}' +
      '}' +
      'else if(evt==="hover"){el.addEventListener("mouseenter",function(){aeRunAction(el);});}' +
      'else if(evt==="hoverout"){el.addEventListener("mouseleave",function(){aeRunAction(el);});}' +
    '});';
  clone.querySelector('body').appendChild(script);
}

// canvas pixels don't survive outerHTML, so the exported file needs its
// own copy of the drawing function, run once the file opens.
function wireExportCharts(doc, clone){
  if(!clone.querySelector('canvas[data-ae-chart]')) return;
  const script = doc.createElement('script');
  script.textContent = AE_DRAW_CHART_SRC + 'document.querySelectorAll("canvas[data-ae-chart]").forEach(aeDrawChart);';
  clone.querySelector('body').appendChild(script);
}

// shared by every export path: wires up actions/charts/formulas and strips
// editor-only bookkeeping, leaving a clone that's either serialized whole
// (cleanExportHTML) or picked apart into separate files (cleanExportSplit).
function buildExportClone(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return null;
  const clone = doc.documentElement.cloneNode(true);
  wireExportGotoLinks(clone);
  wireExportActions(doc, clone);
  wireExportCharts(doc, clone);
  wireExportFormulas(doc, clone);
  clone.querySelectorAll('[data-ae-name]').forEach(function(n){ n.removeAttribute('data-ae-name'); });
  clone.querySelectorAll('[data-ae-locked]').forEach(function(n){ n.removeAttribute('data-ae-locked'); });
  clone.querySelectorAll('[data-ae-group]').forEach(function(n){ n.removeAttribute('data-ae-group'); });
  const userScript = clone.querySelector('script[data-ae-user-js]');
  if(userScript){
    if(userScript.textContent.trim()) userScript.removeAttribute('data-ae-user-js');
    else userScript.remove();
  }
  // internal bookkeeping only (round-trips artboard size through the
  // editor's own re-import) — not something someone opening the shipped
  // file should see in their <head>.
  const sizeMeta = clone.querySelector('meta[name="ae-artboard-size"]');
  if(sizeMeta) sizeMeta.remove();
  return { doc: doc, clone: clone };
}

// editor-only bookkeeping (custom layer names) stripped from the file the
// user actually downloads, so the exported artifact stays clean HTML.
function cleanExportHTML(ab){
  const built = buildExportClone(ab);
  if(!built) return DEFAULT_DOC;
  return '<!doctype html>\n' + built.clone.outerHTML;
}

// same clean export, but with every <style> and <script> pulled out of the
// document into their own strings — so the caller can save base.html +
// base.css + base.js as three files next to each other, instead of one
// self-contained .html. Each kind collapses to a single <link>/<script src>
// pointing at the artboard's own filename (multiple <style>/<script> tags —
// e.g. one for base styles, one for the Fase 08 class library — merge into
// one file each, empty ones are dropped, and the reference is skipped
// entirely when there's nothing to link to).
function cleanExportSplit(ab, base){
  const built = buildExportClone(ab);
  if(!built) return { html: DEFAULT_DOC, css: '', js: '' };
  const doc = built.doc, clone = built.clone;

  const styles = Array.from(clone.querySelectorAll('style')).filter(function(s){ return s.textContent.trim(); });
  const css = styles.map(function(s){ return s.textContent.trim(); }).join('\n\n');
  clone.querySelectorAll('style').forEach(function(s){ s.remove(); });
  if(styles.length){
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', base + '.css');
    clone.querySelector('head').appendChild(link);
  }

  const scripts = Array.from(clone.querySelectorAll('script:not([src])')).filter(function(s){ return s.textContent.trim(); });
  const js = scripts.map(function(s){ return s.textContent.trim(); }).join('\n\n');
  clone.querySelectorAll('script:not([src])').forEach(function(s){ s.remove(); });
  if(scripts.length){
    const src = doc.createElement('script');
    src.setAttribute('src', base + '.js');
    clone.querySelector('body').appendChild(src);
  }

  return { html: '<!doctype html>\n' + clone.outerHTML, css: css, js: js };
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

// the JS tab edits one dedicated <script> tag, not the artboard's markup —
// data-ae-user-js marks it so re-opening the tab finds the same one instead
// of picking up some unrelated <script> a template/import brought along.
function getUserScriptTag(doc, create){
  if(!doc || !doc.body) return null;
  let script = doc.querySelector('script[data-ae-user-js]');
  if(script) return script;
  // an imported/hand-written HTML may already carry a plain <script> with
  // real code in it — adopt the first inline one (skip anything with a
  // src, there's no textContent to show for that) instead of creating a
  // second, disconnected script the JS tab would never display.
  script = Array.from(doc.querySelectorAll('script')).find(function(s){ return !s.src; });
  if(script){ script.setAttribute('data-ae-user-js', '1'); return script; }
  if(create){
    script = doc.createElement('script');
    script.setAttribute('data-ae-user-js', '1');
    doc.body.appendChild(script);
  }
  return script || null;
}

// feeds the "Chamar função JS" datalist — read-only scan, unlike
// getUserScriptTag it never adopts/mutates anything, so it's safe to call
// on every props-panel render.
function detectFunctionNames(doc){
  if(!doc) return [];
  const names = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  Array.from(doc.querySelectorAll('script')).filter(function(s){ return !s.src; }).forEach(function(s){
    re.lastIndex = 0;
    let m;
    while((m = re.exec(s.textContent))) names.push(m[1]);
  });
  return names;
}

function syncCodeFromCanvas(){
  if(state.codeTab === 'js'){
    const script = getUserScriptTag(getDoc(), false);
    codeArea.value = script ? script.textContent : '';
    return;
  }
  codeArea.value = currentHTML();
}

function applyCodeToCanvas(){
  const a = activeArtboard();
  if(!a) return;
  if(state.codeTab === 'js'){
    const doc = getDoc();
    if(!doc) return;
    getUserScriptTag(doc, true).textContent = codeArea.value;
    // srcdoc reload (not just editing the live doc in place) is what
    // actually re-executes the script — same as applying an HTML edit.
    loadDocumentInto(a, currentHTMLFor(a), true);
    return;
  }
  loadDocumentInto(a, codeArea.value, true);
}

function setCodeTab(tab){
  state.codeTab = tab;
  document.getElementById('codeTabHtml').classList.toggle('active', tab === 'html');
  document.getElementById('codeTabJs').classList.toggle('active', tab === 'js');
  document.getElementById('codeJsHint').style.display = tab === 'js' ? '' : 'none';
  syncCodeFromCanvas();
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

  // registered before the normal selection/drag handler below, on the same
  // capture phase, so it runs first and can swallow the click entirely
  // while the eyedropper is armed — normal editing resumes right after.
  doc.addEventListener('mousedown', function(e){
    if(!colorPickingActive) return;
    e.preventDefault(); e.stopPropagation();
    const picked = pickColorAt(doc, e.clientX, e.clientY);
    const parts = parseColorParts(picked);
    const hsv = rgbToHsv(parts.r, parts.g, parts.b);
    cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
    renderColorPopover(true);
    stopColorPicking();
  }, true);
  // hovering previews the color live — in the popover itself (SV square,
  // hue thumb, hex field) and in a little swatch+hex loupe next to the
  // cursor — without touching the actual element until the click lands.
  doc.addEventListener('mousemove', function(e){
    if(!colorPickingActive) return;
    const picked = pickColorAt(doc, e.clientX, e.clientY);
    const parts = parseColorParts(picked);
    const hsv = rgbToHsv(parts.r, parts.g, parts.b);
    cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
    renderColorPopover(false);
    const pt = artboardPointToPage(ab, e.clientX, e.clientY);
    showColorLoupe(pt.x, pt.y, picked);
  }, true);
  doc.addEventListener('mouseleave', function(){
    if(colorPickingActive) hideColorLoupe();
  }, true);

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
      // any element can carry an action now, not just <button> — FORM is
      // excluded here because its data-ae-goto is submit-triggered (below),
      // not click-triggered, even though a click inside the form bubbles
      // up to it.
      const actionEl = e.target.closest && e.target.closest('[data-ae-goto],[data-ae-toggle],[data-ae-settext],[data-ae-call]');
      if(actionEl && actionEl.tagName !== 'FORM' && (actionEl.getAttribute('data-ae-evt') || 'click') === 'click'){
        e.preventDefault();
        runElementAction(doc, actionEl);
      }
      return;
    }
    const a = e.target.closest && e.target.closest('a');
    if(a) e.preventDefault();
  }, true);

  // a <form> has no server to actually submit to — always stop the native
  // submit (which would otherwise try to reload the iframe), and in
  // Visualizar mode honor "Navegar para artboard" on the form itself, same
  // as a button/link with that action.
  doc.addEventListener('submit', function(e){
    e.preventDefault();
    if(state.editMode) return;
    const gotoId = e.target && e.target.getAttribute && e.target.getAttribute('data-ae-goto');
    if(gotoId) goToArtboard(gotoId);
  }, true);

  // mouseenter/mouseleave don't bubble, so delegation uses mouseover/mouseout
  // plus a relatedTarget containment check to emulate enter/leave without
  // re-firing on every child hovered inside the same target.
  doc.addEventListener('mouseover', function(e){
    if(state.editMode) return;
    const el = e.target.closest && e.target.closest('[data-ae-evt="hover"]');
    if(!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    runElementAction(doc, el);
  }, true);
  doc.addEventListener('mouseout', function(e){
    if(state.editMode) return;
    const el = e.target.closest && e.target.closest('[data-ae-evt="hoverout"]');
    if(!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    runElementAction(doc, el);
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
    activeEditDoc = doc; activeEditTarget = target; activeEditArtboard = ab;
    function onBlur(){
      target.removeAttribute('contenteditable');
      target.removeEventListener('blur', onBlur);
      activeEditDoc = null; activeEditTarget = null; activeEditArtboard = null;
      hideTextFormatBar();
      pushHistory(); syncCodeFromCanvas(); renderLayers();
    }
    target.addEventListener('blur', onBlur);
  }, true);
  // a text selection made while editing inline (above) shows a small
  // floating Bold/Italic/Underline/size toolbar next to it — this is what
  // notices the selection changing so the toolbar can appear/move/hide.
  doc.addEventListener('selectionchange', function(){ updateTextFormatBar(ab); });

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

  // capture-phase on the iframe's own window catches a scroll fired on any
  // descendant (capturing runs top-down regardless of whether the event
  // itself bubbles, and 'scroll' doesn't) — this is the general case.
  doc.defaultView.addEventListener('scroll', updateOverlayLive, true);
  // belt-and-suspenders: also bind directly to every element that actually
  // scrolls internally (overflow auto/scroll with real overflow), so a
  // quirk in how a specific container dispatches its scroll event can't
  // silently drop the overlay out of sync with it.
  try {
    const cs = doc.defaultView.getComputedStyle;
    Array.from(doc.querySelectorAll('*')).forEach(function(node){
      const st = cs(node);
      const scrollsY = (st.overflowY === 'auto' || st.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
      const scrollsX = (st.overflowX === 'auto' || st.overflowX === 'scroll') && node.scrollWidth > node.clientWidth;
      if(scrollsY || scrollsX) node.addEventListener('scroll', updateOverlayLive, { passive: true });
    });
  } catch(e){}
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

// like shortLabel, but for the action-target pickers (toggle/settext):
// those auto-assign a data-ae-name the moment an element is picked, and
// shortLabel would then show only that generated name — losing the "it's
// a div" context that made it recognizable in a list of several elements.
function targetPickerLabel(el){
  let s = el.tagName.toLowerCase();
  if(el.id) s += '#' + el.id;
  else if(el.className && typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/)[0];
  if(el.dataset && el.dataset.aeName) s += ' (' + el.dataset.aeName + ')';
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
  const doc = getDoc();
  const bodyStyle = doc && doc.body ? doc.body.style : {};
  const overflowVal = bodyStyle.overflow || 'visible';
  const smoothingVal = bodyStyle.webkitFontSmoothing === 'antialiased' ? 'antialiased'
    : (bodyStyle.textRendering === 'optimizeLegibility' ? 'legibility' : 'auto');

  propsBody.innerHTML =
    '<div class="propsSection">Artboard</div>' +
    '<div class="field"><label>Nome</label><input type="text" id="pAbName" value="' + ab.name.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="field"><label>Tamanho da tela</label><select id="pAbPreset">' + presetOpts + '</select></div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('W', 'pAbW', ab.w, 'Largura') + '</div>' +
      '<div class="field">' + iconFieldHTML('H', 'pAbH', ab.h, 'Altura') + '</div>' +
    '</div>' +
    '<div class="field"><button type="button" id="pAbFit" style="width:100%;" title="Aumenta a largura e/ou altura do artboard até o conteúdo inteiro caber, sem precisar rolar">⤢ Expandir até caber o conteúdo (sem scroll)</button></div>' +
    '<div class="field"><label>Fundo do artboard</label>' + colorSwatchHTML('pAbBg', getArtboardBgHex(ab)) + '</div>' +
    '<div class="propsSection">Comportamento (&lt;body&gt;)</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Rolagem (overflow)</label><select id="pAbOverflow">' +
        ['visible', 'hidden', 'auto', 'scroll'].map(function(v){ return '<option value="' + v + '"' + (v === overflowVal ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Suavização de texto</label><select id="pAbSmoothing">' +
        '<option value="auto"' + (smoothingVal === 'auto' ? ' selected' : '') + '>Padrão</option>' +
        '<option value="antialiased"' + (smoothingVal === 'antialiased' ? ' selected' : '') + '>Antialiased</option>' +
        '<option value="legibility"' + (smoothingVal === 'legibility' ? ' selected' : '') + '>Legibilidade otimizada</option>' +
      '</select></div>' +
    '</div>' +
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
  document.getElementById('pAbFit').addEventListener('click', function(){ fitArtboardToContent(ab); renderArtboardProps(ab); });
  bindColorSwatchSimple('pAbBg', function(rgba){
    const doc = getDoc();
    if(doc && doc.body) doc.body.style.backgroundColor = rgba;
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 300);
  });
  document.getElementById('pAbOverflow').addEventListener('change', function(){
    const doc = getDoc();
    if(doc && doc.body) doc.body.style.overflow = this.value === 'visible' ? '' : this.value;
    pushHistory(); syncCodeFromCanvas();
  });
  document.getElementById('pAbSmoothing').addEventListener('change', function(){
    const doc = getDoc();
    if(doc && doc.body){
      if(this.value === 'antialiased'){ doc.body.style.webkitFontSmoothing = 'antialiased'; doc.body.style.textRendering = ''; }
      else if(this.value === 'legibility'){ doc.body.style.webkitFontSmoothing = ''; doc.body.style.textRendering = 'optimizeLegibility'; }
      else { doc.body.style.webkitFontSmoothing = ''; doc.body.style.textRendering = ''; }
    }
    pushHistory(); syncCodeFromCanvas();
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

// ---------- ações sem código (navegar / mostrar-ocultar / chamar função) ----------
// shared by every element type that can carry an action — button, link,
// image, or any generic container (div, span, section…) that falls through
// attributesSectionHTML's tag-specific cases below. One element can only
// hold one action (goto/toggle/call are mutually exclusive), but it fires
// on whichever event is picked, not just click.
const AE_EVENTS = [
  ['click', 'Ao clicar'],
  ['hover', 'Ao passar o mouse'],
  ['hoverout', 'Ao tirar o mouse'],
  ['load', 'Ao carregar o artboard']
];

function actionSectionHTML(el){
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  const gotoId = el.getAttribute('data-ae-goto') || '';
  const toggleTarget = el.getAttribute('data-ae-toggle') || '';
  const callFn = el.getAttribute('data-ae-call') || '';
  const setTextTarget = el.getAttribute('data-ae-settext') || '';
  const setTextValue = el.getAttribute('data-ae-settext-value') || '';
  const actionVal = gotoId ? 'goto' : (toggleTarget ? 'toggle' : (el.hasAttribute('data-ae-call') ? 'call' : (setTextTarget ? 'settext' : '')));
  const evt = el.getAttribute('data-ae-evt') || 'click';
  const artboardOptions = artboards.map(function(a){
    return '<option value="' + a.id + '"' + (gotoId === a.id ? ' selected' : '') + '>' + a.name + '</option>';
  }).join('');
  const doc = getDoc();
  toggleTargetCandidates = doc ? Array.from(doc.querySelectorAll('*')).filter(function(n){ return n !== el && isEditableEl(n, doc); }) : [];
  const targetName = actionVal === 'settext' ? setTextTarget : toggleTarget;
  const targetOptions = toggleTargetCandidates.map(function(n, i){
    return '<option value="' + i + '"' + (targetName && n.dataset.aeName === targetName ? ' selected' : '') + '>' + esc(targetPickerLabel(n)) + '</option>';
  }).join('');
  const fnNames = detectFunctionNames(doc);
  const fnDatalist = '<datalist id="pActCallFnList">' + fnNames.map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  const evtOptions = AE_EVENTS.map(function(e){ return '<option value="' + e[0] + '"' + (evt === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('');

  return '<div class="propsSection">Ação</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Evento</label><select id="pActEvt">' + evtOptions + '</select></div>' +
      '<div class="field"><label>Ação</label><select id="pActAction">' +
        '<option value=""' + (actionVal === '' ? ' selected' : '') + '>Nada</option>' +
        '<option value="goto"' + (actionVal === 'goto' ? ' selected' : '') + '>Navegar para artboard</option>' +
        '<option value="toggle"' + (actionVal === 'toggle' ? ' selected' : '') + '>Mostrar/ocultar elemento</option>' +
        '<option value="settext"' + (actionVal === 'settext' ? ' selected' : '') + '>Definir texto de elemento</option>' +
        '<option value="call"' + (actionVal === 'call' ? ' selected' : '') + '>Chamar função JS</option>' +
      '</select></div>' +
    '</div>' +
    (actionVal === 'goto' ?
      '<div class="field"><label>Ir para</label><select id="pActGotoArtboard">' + artboardOptions + '</select></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — vira um link (se for <code>&lt;a&gt;</code>) ou um pequeno script (nos outros elementos) pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
      : '') +
    (actionVal === 'toggle' ?
      (targetOptions ?
        '<div class="field"><label>Elemento</label><select id="pActToggleTarget">' + targetOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — mostra o elemento se estiver oculto, ou oculta se estiver visível.</div>'
        : '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Não tem nenhum outro elemento nesse artboard pra escolher ainda.</div>')
      : '') +
    (actionVal === 'settext' ?
      (targetOptions ?
        '<div class="field"><label>Elemento</label><select id="pActSetTextTarget">' + targetOptions + '</select></div>' +
        '<div class="field"><label>Novo texto</label><input type="text" id="pActSetTextValue" placeholder="ex: Concluído!" value="' + esc(setTextValue) + '"></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — troca o texto do elemento escolhido por esse aqui (substitui o conteúdo dele inteiro).</div>'
        : '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Não tem nenhum outro elemento nesse artboard pra escolher ainda.</div>')
      : '') +
    (actionVal === 'call' ?
      '<div class="field"><label>Nome da função</label><input type="text" id="pActCallFn" list="pActCallFnList" placeholder="ex: minhaFuncao" value="' + esc(callFn) + '">' + fnDatalist + '</div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Chama essa função (declarada na aba <code>{ } JS</code> desse artboard, com <code>function nome(){ }</code>) — dentro dela, <code>this</code> é o elemento. Funciona no modo Visualizar e no .html exportado.</div>'
      : '');
}

function bindActionSection(el){
  const actionSel = document.getElementById('pActAction');
  if(actionSel){
    actionSel.addEventListener('change', function(){
      el.removeAttribute('data-ae-goto');
      el.removeAttribute('data-ae-toggle');
      el.removeAttribute('data-ae-call');
      el.removeAttribute('data-ae-settext');
      el.removeAttribute('data-ae-settext-value');
      if(this.value === ''){ el.removeAttribute('data-ae-evt'); }
      else if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        if(other) el.setAttribute('data-ae-goto', other.id);
      } else if(this.value === 'toggle'){
        const first = toggleTargetCandidates[0];
        if(first) el.setAttribute('data-ae-toggle', ensureAeName(first));
      } else if(this.value === 'settext'){
        const first = toggleTargetCandidates[0];
        if(first) el.setAttribute('data-ae-settext', ensureAeName(first));
        el.setAttribute('data-ae-settext-value', '');
      } else if(this.value === 'call'){
        el.setAttribute('data-ae-call', '');
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  const evtSel = document.getElementById('pActEvt');
  if(evtSel){
    evtSel.addEventListener('change', function(){
      if(this.value === 'click') el.removeAttribute('data-ae-evt');
      else el.setAttribute('data-ae-evt', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const gotoSel = document.getElementById('pActGotoArtboard');
  if(gotoSel){
    gotoSel.addEventListener('change', function(){
      el.setAttribute('data-ae-goto', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const toggleSel = document.getElementById('pActToggleTarget');
  if(toggleSel){
    toggleSel.addEventListener('change', function(){
      const target = toggleTargetCandidates[parseInt(this.value, 10)];
      if(target) el.setAttribute('data-ae-toggle', ensureAeName(target));
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const callFnInput = document.getElementById('pActCallFn');
  if(callFnInput){
    callFnInput.addEventListener('input', function(){
      el.setAttribute('data-ae-call', this.value.trim());
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const setTextSel = document.getElementById('pActSetTextTarget');
  if(setTextSel){
    setTextSel.addEventListener('change', function(){
      const target = toggleTargetCandidates[parseInt(this.value, 10)];
      if(target) el.setAttribute('data-ae-settext', ensureAeName(target));
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const setTextValueInput = document.getElementById('pActSetTextValue');
  if(setTextValueInput){
    setTextValueInput.addEventListener('input', function(){
      el.setAttribute('data-ae-settext-value', this.value);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
}

// ---------- element attributes (not CSS — placeholder, href, alt…) ----------

function attributesSectionHTML(el, opts){
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  const tag = el.tagName;
  if(tag === 'INPUT'){
    const inputType = el.getAttribute('type') || 'text';
    const isCheckable = inputType === 'checkbox' || inputType === 'radio';
    return '<div class="propsSection">Campo (input)</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'checkbox', 'radio'], inputType) + '</select></div>' +
        '<div class="field"><label>Nome' + (isCheckable ? ' (grupo)' : '') + '</label><div class="fieldRow" style="display:flex; gap:4px;"><input type="text" id="pAttrName" value="' + esc(el.getAttribute('name')) + '" style="flex:1;">' +
          (inputType === 'radio' ? '<button type="button" class="miniBtn" id="pRadioGroup" title="Dá o mesmo nome pra todos os rádios irmãos, pra virarem um grupo exclusivo">🔗 Agrupar</button>' : '') +
        '</div></div>' +
      '</div>' +
      (isCheckable ?
        '<div class="field"><label class="checkField"><input type="checkbox" id="pAttrChecked"' + (el.hasAttribute('checked') ? ' checked' : '') + '> Marcado por padrão</label></div>'
        :
        '<div class="field"><label>Placeholder</label><input type="text" id="pAttrPlaceholder" value="' + esc(el.getAttribute('placeholder')) + '"></div>') +
      '<div class="field"><label>Valor' + (isCheckable ? ' (enviado quando marcado)' : ' padrão') + '</label><input type="text" id="pAttrValue" value="' + esc(el.getAttribute('value')) + '"></div>';
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
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar, e no .html exportado também — vira um link direto pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
        :
        '<div class="field"><label>Endereço (href)</label><input type="text" id="pAttrHref" value="' + esc(href) + '"></div>' +
        '<div class="field"><label>Abrir em</label><select id="pAttrTarget">' + opts(['_self', '_blank'], el.getAttribute('target') || '_self') + '</select></div>') +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Isso aqui é só pra navegação por clique. Pra outro evento (hover) ou outra ação (mostrar/ocultar, chamar função), usa a seção Ação abaixo.</div>' +
      actionSectionHTML(el);
  }
  if(tag === 'IMG'){
    return '<div class="propsSection">Imagem</div>' +
      '<div class="field"><label>Texto alternativo (alt)</label><input type="text" id="pAttrAlt" value="' + esc(el.getAttribute('alt')) + '"></div>' +
      actionSectionHTML(el);
  }
  if(tag === 'BUTTON'){
    return '<div class="propsSection">Botão</div>' +
      '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['button', 'submit', 'reset'], el.getAttribute('type') || 'button') + '</select></div>' +
      actionSectionHTML(el);
  }
  if(tag === 'FORM'){
    const gotoId = el.getAttribute('data-ae-goto') || '';
    const artboardOptions = artboards.map(function(a){
      return '<option value="' + a.id + '"' + (gotoId === a.id ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');
    return '<div class="propsSection">Formulário</div>' +
      '<div class="field"><label>Ao enviar (submit)</label><select id="pAttrBtnAction">' +
        '<option value=""' + (!gotoId ? ' selected' : '') + '>Nada</option>' +
        '<option value="goto"' + (gotoId ? ' selected' : '') + '>Navegar para artboard</option>' +
      '</select></div>' +
      (gotoId ?
        '<div class="field"><label>Ir para</label><select id="pAttrGotoArtboard">' + artboardOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — envia o formulário (botão type="submit" dentro dele, ou Enter num campo) e vai pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
        : '') +
      '<div class="field"><label>Action (endereço de envio)</label><input type="text" id="pAttrAction" value="' + esc(el.getAttribute('action')) + '"></div>';
  }
  if(tag === 'CANVAS' && el.hasAttribute('data-ae-chart')){
    let cfg; try { cfg = JSON.parse(el.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
    const labels = cfg.labels || [], values = cfg.values || [];
    const rows = labels.map(function(l, i){ return l + ':' + (values[i] !== undefined ? values[i] : ''); }).join('\n');
    const rowsSafe = rows.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div class="propsSection">Gráfico</div>' +
      '<div class="field"><label>Tipo</label><select id="pChartType">' + opts(['bar', 'line', 'pie'], cfg.type || 'bar') + '</select></div>' +
      '<div class="field"><label>Dados (um "rótulo:valor" por linha)</label><textarea id="pChartData" rows="5" spellcheck="false">' + rowsSafe + '</textarea></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Redesenha ao vivo no editor. No .html exportado também funciona — os pixels não sobrevivem ao salvar o HTML, então o gráfico é redesenhado de novo assim que a página abre.</div>';
  }
  if(tag === 'TABLE'){
    const preset = el.getAttribute('data-ae-table-style') || 'none';
    return '<div class="propsSection">Tabela</div>' +
      '<div class="field"><label>Estilo</label><select id="pTableStyle">' +
        '<option value="none"' + (preset === 'none' ? ' selected' : '') + '>Nenhum</option>' +
        '<option value="bordered"' + (preset === 'bordered' ? ' selected' : '') + '>Bordas</option>' +
        '<option value="striped"' + (preset === 'striped' ? ' selected' : '') + '>Zebrado</option>' +
      '</select></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Selecione 2+ células adjacentes (Ctrl/Cmd+clique) e use o menu de botão direito pra mesclar. Botão direito numa linha/coluna também move ela de posição.</div>' +
      actionSectionHTML(el);
  }
  if(TEXT_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pTextType', 'Texto', tag, TEXT_TYPES) + actionSectionHTML(el);
  if(LIST_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pListType', 'Lista', tag, LIST_TYPES) + actionSectionHTML(el);
  if(MEDIA_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pMediaType', 'Mídia', tag, MEDIA_TYPES) + actionSectionHTML(el);
  if(INDICATOR_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pIndicatorType', 'Indicador', tag, INDICATOR_TYPES) + actionSectionHTML(el);
  if(CONTAINER_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pContainerType', 'Container', tag, CONTAINER_TYPES) + actionSectionHTML(el);
  // any other element (span de ícone, td, etc.) doesn't get its own
  // dedicated attribute fields, but can still carry an action.
  return actionSectionHTML(el);
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
  const checkedBox = document.getElementById('pAttrChecked');
  if(checkedBox){
    checkedBox.addEventListener('change', function(){
      if(checkedBox.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
      el.checked = checkedBox.checked; // live in the editor's own iframe too, not just the exported attribute
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const radioGroupBtn = document.getElementById('pRadioGroup');
  if(radioGroupBtn){
    radioGroupBtn.addEventListener('click', function(){
      const container = el.closest('form') || el.parentElement.closest('div, fieldset, section, form') || el.ownerDocument.body;
      const siblings = Array.from(container.querySelectorAll('input[type="radio"]'));
      const name = el.getAttribute('name') || 'grupo-' + Math.random().toString(36).slice(2, 7);
      siblings.forEach(function(r){ r.setAttribute('name', name); });
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  bindAttr('pAttrHref', 'href');
  bindAttr('pAttrTarget', 'target', 'change');
  bindAttr('pAttrAlt', 'alt');
  bindAttr('pAttrAction', 'action');

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
  // FORM is the only element left using this id — its own submit-triggered
  // "Navegar para artboard" (button/link/generic elements now go through
  // the shared actionSectionHTML/bindActionSection below instead).
  const btnAction = document.getElementById('pAttrBtnAction');
  if(btnAction){
    btnAction.addEventListener('change', function(){
      el.removeAttribute('data-ae-goto');
      if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        if(other) el.setAttribute('data-ae-goto', other.id);
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  // shared by <a>'s own dedicated goto dropdown and FORM's submit-goto.
  const gotoSel = document.getElementById('pAttrGotoArtboard');
  if(gotoSel){
    gotoSel.addEventListener('change', function(){
      if(el.tagName === 'A') el.setAttribute('href', '#ae-goto:' + this.value);
      else el.setAttribute('data-ae-goto', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const tableStyle = document.getElementById('pTableStyle');
  if(tableStyle){
    tableStyle.addEventListener('change', function(){ applyTableStyle(el, this.value); });
  }
  bindTypeSwitch('pTextType', el);
  bindTypeSwitch('pListType', el);
  bindTypeSwitch('pMediaType', el);
  bindTypeSwitch('pIndicatorType', el);
  bindTypeSwitch('pContainerType', el);
  bindActionSection(el);

  // chart type/data — parses "rótulo:valor" lines back into the JSON the
  // canvas is drawn from, and redraws immediately so editing feels live.
  function updateChart(mutate){
    let cfg; try { cfg = JSON.parse(el.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
    mutate(cfg);
    el.setAttribute('data-ae-chart', JSON.stringify(cfg));
    aeDrawChart(el);
  }
  const chartTypeSel = document.getElementById('pChartType');
  if(chartTypeSel){
    chartTypeSel.addEventListener('change', function(){
      updateChart(function(cfg){ cfg.type = chartTypeSel.value; });
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const chartDataInput = document.getElementById('pChartData');
  if(chartDataInput){
    chartDataInput.addEventListener('input', function(){
      const labels = [], values = [];
      chartDataInput.value.split('\n').forEach(function(line){
        const i = line.indexOf(':');
        if(i < 0) return;
        labels.push(line.slice(0, i).trim());
        values.push(parseFloat(line.slice(i + 1)) || 0);
      });
      updateChart(function(cfg){ cfg.labels = labels; cfg.values = values; });
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
}

// the "mostrar/ocultar" action targets an element by its data-ae-name (same
// handle the Layers panel uses) — most elements never got one, so picking
// an unnamed element as a toggle target assigns it a name on the spot,
// same idea as an artboard getting its 'ab1' id at creation time.
function ensureAeName(el){
  if(el.dataset.aeName) return el.dataset.aeName;
  const doc = getDoc();
  let name;
  do { elNameCounter++; name = 'el' + elNameCounter; }
  while(doc && doc.querySelector('[data-ae-name="' + name + '"]'));
  el.dataset.aeName = name;
  return name;
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

// post-processes the flat sequence of ".propsSection" headers + field divs
// that renderProps/renderArtboardProps build as one big HTML string —
// groups each header with the fields that follow it (up to the next
// header) into a collapsible body, and hides whole groups outside the
// "Ação/Texto/Container/Lista/Mídia/Indicador/Layout/Cor" set when the
// panel is in "Exibir" (simple) mode. Doing this as a DOM pass after the
// fact means every section-producing code path (element attrs, action,
// layout, appearance…) didn't need to be rewritten to nest its own fields.
function wrapPropsSections(container){
  const headers = Array.from(container.querySelectorAll('.propsSection'));
  headers.forEach(function(header){
    const key = header.childNodes[0] ? header.childNodes[0].textContent.trim() : header.textContent.trim();
    const body = document.createElement('div');
    body.className = 'propsSectionBody';
    let node = header.nextSibling;
    while(node && !(node.nodeType === 1 && node.classList && node.classList.contains('propsSection'))){
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }
    header.parentNode.insertBefore(body, header.nextSibling);

    const isSimpleSection = PROPS_SIMPLE_SECTIONS.indexOf(key) !== -1;
    if(state.propsView === 'simple' && !isSimpleSection){
      header.style.display = 'none';
      body.style.display = 'none';
      return;
    }

    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = '▾';
    header.appendChild(chev);
    header.classList.add('collapsible');
    const collapsed = collapsedPropsSections.has(key);
    header.classList.toggle('collapsed', collapsed);
    body.style.display = collapsed ? 'none' : '';
    header.addEventListener('click', function(){
      const nowCollapsed = body.style.display !== 'none';
      body.style.display = nowCollapsed ? 'none' : '';
      header.classList.toggle('collapsed', nowCollapsed);
      if(nowCollapsed) collapsedPropsSections.add(key); else collapsedPropsSections.delete(key);
    });
  });
}

// live filter over whatever renderProps just built — runs as a pass on top
// of wrapPropsSections' own Exibir/Avançado + collapsed-state visibility, so
// it overrides both (a search should surface a match no matter which view
// mode or collapsed state it's hiding behind). Matches against the icon
// chip / label text of each field, and the section's own header text.
function filterPropsBySearch(query){
  const container = document.getElementById('propsBody');
  if(!container) return;
  const q = query.trim().toLowerCase();
  if(!q){ renderProps(); return; }
  Array.from(container.querySelectorAll('.propsSection')).forEach(function(header){
    const body = header.nextElementSibling;
    if(!body || !body.classList.contains('propsSectionBody')) return;
    const headerText = (header.childNodes[0] ? header.childNodes[0].textContent : header.textContent).toLowerCase();
    const headerMatches = headerText.indexOf(q) !== -1;
    let sectionHasMatch = headerMatches;
    Array.from(body.querySelectorAll('.field')).forEach(function(field){
      const label = field.querySelector('label');
      const prefix = field.querySelector('.iconFieldPrefix');
      const iconField = field.querySelector('.iconField');
      const text = ((label ? label.textContent : '') + ' ' + (prefix ? prefix.textContent : '') + ' ' + (iconField ? iconField.getAttribute('title') || '' : '')).toLowerCase();
      const match = headerMatches || text.indexOf(q) !== -1;
      field.style.display = match ? '' : 'none';
      if(match) sectionHasMatch = true;
    });
    Array.from(body.querySelectorAll('.row2, .row3, .row4')).forEach(function(row){
      const anyVisible = Array.from(row.children).some(function(c){ return c.style.display !== 'none'; });
      row.style.display = anyVisible ? '' : 'none';
    });
    header.style.display = sectionHasMatch ? '' : 'none';
    body.style.display = sectionHasMatch ? '' : 'none';
  });
}

function checkboxLabelText(el){
  return Array.from(el.childNodes).filter(function(n){ return n.nodeType === 3; }).map(function(n){ return n.textContent; }).join('').trim();
}
function setCheckboxLabelText(el, text){
  Array.from(el.childNodes).filter(function(n){ return n.nodeType === 3; }).forEach(function(n){ n.remove(); });
  el.appendChild(el.ownerDocument.createTextNode(text));
}

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
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  function escText(v){ return (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  const NO_TEXT_EDIT_TAGS = ['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'TABLE', 'UL', 'OL', 'IFRAME', 'VIDEO', 'AUDIO', 'HR', 'BR', 'PROGRESS', 'METER', 'FORM'];
  const canEditText = el.children.length === 0 && NO_TEXT_EDIT_TAGS.indexOf(el.tagName) === -1;
  // a checkbox/radio's option text lives as a loose text node next to the
  // <input> inside its wrapping <label> — canEditText is false for it (it
  // has a child element), so it needs its own field that only touches that
  // text node, leaving the <input> itself alone.
  const isCheckableLabel = el.tagName === 'LABEL' && el.children.length === 1 &&
    el.children[0].tagName === 'INPUT' && (el.children[0].type === 'checkbox' || el.children[0].type === 'radio');

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
    (canEditText && selCount <= 1 ?
      '<div class="field"><label>Texto</label><textarea id="pTextContent" rows="2" style="resize:vertical;">' + escText(el.textContent || '') + '</textarea></div>'
      : '') +
    (isCheckableLabel && selCount <= 1 ?
      '<div class="field"><label>Texto da opção</label><input type="text" id="pCheckboxLabelText" value="' + esc(checkboxLabelText(el)) + '"></div>'
      : '') +
    '<div class="field"><label>Classe (CSS)</label><select id="pClassName">' + classSelectOptions + '</select></div>' +
    '<div class="field"><label>ID (pra JavaScript)</label><input type="text" id="pElId" placeholder="ex: titulo-principal" value="' + esc(el.id) + '">' +
      '<div style="color:var(--text-dim); font-size:11px; margin-top:3px;">Um id de verdade no HTML. No seu código da aba <code>{ } JS</code>, pegue o elemento com <code>document.getElementById(\'' + (el.id || 'seu-id') + '\')</code>.</div>' +
    '</div>' +

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
        '<div class="field">' + iconFieldHTML('Gap', 'pGap', parseFloat(cs.gap) || 0, 'Gap entre itens (px)') + '</div>' +
      '</div>'
      : '') +

    (free ?
      '<div class="row3">' +
        '<div class="field">' + iconFieldHTML('X', 'pX', '', 'Posição X (px)') + '</div>' +
        '<div class="field">' + iconFieldHTML('Y', 'pY', '', 'Posição Y (px)') + '</div>' +
        '<div class="field">' + iconFieldHTML('Z', 'pZ', parseInt(el.style.zIndex) || 0, 'Z-index (camada)') + '</div>' +
      '</div>'
      : '') +

    '<div class="propsSection">Tamanho</div>' +
    '<div class="row2">' +
      '<div class="field"><div class="fieldRow">' + iconFieldHTML('W', 'pW', '', 'Largura') + '<select id="pWUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
      '<div class="field"><div class="fieldRow">' + iconFieldHTML('H', 'pH', '', 'Altura') + '<select id="pHUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
    '</div>' +

    '<div class="propsSection">Cor</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fundo</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBg', cs.backgroundColor) + varDropdownHTML(doc, el.style.backgroundColor || el.style.background, 'pBgVar') + '</div></div>' +
      '<div class="field"><label>Texto</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pColor', cs.color) + varDropdownHTML(doc, el.style.color, 'pColorVar') + '</div></div>' +
    '</div>' +

    '<div class="propsSection">Aparência</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fonte (família)</label><select id="pFontFamily">' + fontFamilyOptionsHTML(el.style.fontFamily) + '</select></div>' +
      '<div class="field"><label>Peso</label><select id="pFontWeight">' + opts(['400', '500', '600', '700', '800'], el.style.fontWeight || '400') + '</select></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Aa', 'pFont', parseFloat(cs.fontSize) || 14, 'Tamanho da fonte (px)') + '</div>' +
      '<div class="field"><label>Opacidade (' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '%)</label><input type="range" id="pOpacity" min="0" max="100" value="' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Blur', 'pBlur', parseFloat(((el.style.filter || cs.filter || '').match(/blur\(([\d.]+)px\)/) || [])[1]) || 0, 'Desfoque (blur, px)', ' min="0"') + '</div>' +
      '<div class="field"><label>Padrão de fundo</label><select id="pBgPattern">' + opts(['none', 'dots', 'grid'], currentBgPattern(el)) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Cor do padrão</label>' + colorSwatchHTML('pBgPatternColor', rgbToHex(cs.borderTopColor)) + '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Cantos' +
      '<button type="button" id="pRadiusLock" class="miniBtn active" title="Vincular os 4 cantos" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('TL', 'pRadiusTL', px(cs.borderTopLeftRadius), 'Topo-esquerda') + '</div>' +
      '<div class="field">' + iconFieldHTML('TR', 'pRadiusTR', px(cs.borderTopRightRadius), 'Topo-direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('BR', 'pRadiusBR', px(cs.borderBottomRightRadius), 'Baixo-direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('BL', 'pRadiusBL', px(cs.borderBottomLeftRadius), 'Baixo-esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Padding' +
      '<button type="button" id="pPadLock" class="miniBtn" title="Vincular os 4 lados" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('T', 'pPadT', px(cs.paddingTop), 'Topo') + '</div>' +
      '<div class="field">' + iconFieldHTML('R', 'pPadR', px(cs.paddingRight), 'Direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('B', 'pPadB', px(cs.paddingBottom), 'Baixo') + '</div>' +
      '<div class="field">' + iconFieldHTML('L', 'pPadL', px(cs.paddingLeft), 'Esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Margin' +
      '<button type="button" id="pMarLock" class="miniBtn" title="Vincular os 4 lados" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('T', 'pMarT', px(cs.marginTop), 'Topo') + '</div>' +
      '<div class="field">' + iconFieldHTML('R', 'pMarR', px(cs.marginRight), 'Direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('B', 'pMarB', px(cs.marginBottom), 'Baixo') + '</div>' +
      '<div class="field">' + iconFieldHTML('L', 'pMarL', px(cs.marginLeft), 'Esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection">Borda</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Esp', 'pBorderW', px(cs.borderTopWidth), 'Espessura da borda (px)') + '</div>' +
      '<div class="field"><label>Estilo</label><select id="pBorderStyle">' + opts(['none', 'solid', 'dashed', 'dotted'], cs.borderTopStyle === 'none' ? 'none' : cs.borderTopStyle) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Cor da borda</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBorderColor', cs.borderTopColor) + varDropdownHTML(doc, el.style.borderColor, 'pBorderColorVar') + '</div></div>' +

    '<hr>' +
    '<div class="field">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
        '<label>CSS livre (style)</label>' +
        '<button type="button" id="pExtractClass" class="miniBtn" title="Cria uma classe nova com esse estilo inline e aplica no elemento" style="font-size:11px; padding:2px 8px;"' + (el.getAttribute('style') ? '' : ' disabled') + '>→ Virar classe</button>' +
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
  const pElIdInput = document.getElementById('pElId');
  if(pElIdInput){
    pElIdInput.addEventListener('input', function(){
      const v = this.value.trim();
      if(v) el.id = v; else el.removeAttribute('id');
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const pTextContentInput = document.getElementById('pTextContent');
  if(pTextContentInput){
    pTextContentInput.addEventListener('input', function(){
      el.textContent = this.value;
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const pCheckboxLabelTextInput = document.getElementById('pCheckboxLabelText');
  if(pCheckboxLabelTextInput){
    pCheckboxLabelTextInput.addEventListener('input', function(){
      setCheckboxLabelText(el, this.value);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
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
  const pBgPatternColorBtn = document.getElementById('pBgPatternColor');
  function applyPattern(colorOverride){
    const color = colorOverride || (pBgPatternColorBtn ? pBgPatternColorBtn.dataset.color : '');
    effectiveSelection().forEach(function(t){ applyBgPattern(t, pBgPattern.value, color); });
    pushHistory(); syncCodeFromCanvas();
  }
  pBgPattern.addEventListener('change', function(){ applyPattern(); });
  bindColorSwatchSimple('pBgPatternColor', function(rgba){ applyPattern(rgba); });

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
  bindLinkedBox('pRadiusLock', ['pRadiusTL', 'pRadiusTR', 'pRadiusBR', 'pRadiusBL'], ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']);
  bindProp('pOpacity', function(v, el){ el.style.opacity = (v / 100); });
  bindProp('pBlur', function(v, el){ el.style.filter = parseFloat(v) > 0 ? 'blur(' + v + 'px)' : ''; });

  bindLinkedBox('pPadLock', ['pPadT', 'pPadR', 'pPadB', 'pPadL'], ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']);
  bindLinkedBox('pMarLock', ['pMarT', 'pMarR', 'pMarB', 'pMarL'], ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']);

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
  const pExtractClass = document.getElementById('pExtractClass');
  if(pExtractClass){
    pExtractClass.addEventListener('click', async function(){
      const inline = (el.getAttribute('style') || '').trim();
      if(!inline) return;
      const name = await showPrompt('Nome da nova classe (ex: card-destaque):', '', 'Virar classe');
      if(!name || !name.trim()) return;
      const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
      const body = inline.split(';').map(function(d){ return d.trim(); }).filter(Boolean).join(';\n');
      setClassRuleBody(doc, '.' + cleanName, body);
      el.className = (el.className ? el.className + ' ' : '') + cleanName;
      el.removeAttribute('style');
      state.rulePickedClass = cleanName;
      pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
    });
  }
  wrapPropsSections(propsBody);
  if(state.propsSearchQuery) filterPropsBySearch(state.propsSearchQuery);
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

// padding/margin's 4-sides-at-once lock — a Figma-style toggle so dragging
// one side can drive all four instead of editing each field separately.
function bindLinkedBox(lockId, sideIds, styleProps){
  const lockBtn = document.getElementById(lockId);
  if(!lockBtn) return;
  lockBtn.addEventListener('click', function(){
    lockBtn.classList.toggle('active');
  });
  sideIds.forEach(function(id, i){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener('input', function(){
      const linked = lockBtn.classList.contains('active');
      if(linked){
        sideIds.forEach(function(otherId){ if(otherId !== id) document.getElementById(otherId).value = input.value; });
      }
      effectiveSelection().forEach(function(target){
        if(linked) styleProps.forEach(function(p){ target.style[p] = input.value + 'px'; });
        else target.style[styleProps[i]] = input.value + 'px';
      });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
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
function rgbToHsv(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if(d !== 0){
    if(max === r) h = ((g - b) / d) % 6;
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if(h < 0) h += 360;
  }
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb(h, s, v){
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const table = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return { r: Math.round(table[0] * 255), g: Math.round(table[1] * 255), b: Math.round(table[2] * 255) };
}

function colorSwatchHTML(id, colorStr){
  return '<button type="button" class="colorSwatchBtn" id="' + id + '" data-color="' + (colorStr || '').replace(/"/g, '&quot;') + '"><span style="background:' + (colorStr || 'transparent') + '"></span></button>';
}

// Figma-style compact numeric field: a short letter/word chip fused to the
// input instead of a separate label row above it — same <input id=...>
// underneath, so every existing bindProp/bindLinkedBox/getElementById call
// keeps working untouched; only the surrounding markup changes.
function iconFieldHTML(prefix, id, value, title, extraAttrs){
  return '<div class="iconField" title="' + (title || '').replace(/"/g, '&quot;') + '">' +
    '<span class="iconFieldPrefix">' + prefix + '</span>' +
    '<input type="number" id="' + id + '" value="' + (value === undefined || value === null ? '' : value) + '"' + (extraAttrs || '') + '>' +
  '</div>';
}

let colorPopoverOnChange = null;
// current picker state in HSV — kept separate from RGB because dragging
// across the S/V square or hue bar needs h/s/v individually (a round-trip
// through RGB at every pixel of drag would lose hue at s=0 or v=0).
let cpHSV = { h: 0, s: 0, v: 0, a: 1 };
const CP_SWATCHES = [
  '#ffffff', '#000000', '#f3f4f7', '#8b90a0', '#e2e4e9', '#6d8bff', '#35d0a4', '#ff6d8b',
  '#ffb020', '#a06dff', '#25c2e3', '#ef5b5b', '#22c55e', '#0ea5e9', '#f59e0b', 'transparent'
];
function closeColorPopover(){
  document.getElementById('colorPopover').classList.remove('open');
  colorPopoverOnChange = null;
  stopColorPicking();
}

// eyedropper, scoped to the app's own canvas instead of the OS-level
// EyeDropper API (not available in every Chromium build) — reads whatever
// color is actually rendered at the clicked spot inside an artboard.
// Not true per-pixel sampling (a gradient or photo would read as one flat
// color): it walks up from the clicked element until it finds a non-
// transparent background, which covers the vast majority of UI mockups.
let colorPickingActive = false;
function startColorPicking(){
  colorPickingActive = true;
  document.getElementById('cpEyedrop').classList.add('active');
  artboards.forEach(function(ab){
    try { ab.dom.frame.contentDocument.documentElement.style.cursor = 'crosshair'; } catch(e){}
  });
}
function stopColorPicking(){
  colorPickingActive = false;
  const btn = document.getElementById('cpEyedrop');
  if(btn) btn.classList.remove('active');
  artboards.forEach(function(ab){
    try { ab.dom.frame.contentDocument.documentElement.style.cursor = ''; } catch(e){}
  });
  hideColorLoupe();
}
// no real per-pixel rendering (that'd mean an html2canvas-sized dependency
// just for this), so "hovering over a letter" is approximated: if the
// hit-tested element directly holds text, its ink color wins over any
// background — the whole point of pointing at a letter is the letter's
// color, not the box behind it. Only when there's no direct text does this
// fall back to walking up for the nearest solid background.
function hasDirectText(el){
  return Array.from(el.childNodes).some(function(n){ return n.nodeType === 3 && n.textContent.trim(); });
}
// Text has no natural raster either, but unlike a solid background it's
// mostly holes — inside an "o", between letters, around a comma. Picking
// the parent element's ink color for the whole box (the old approach) was
// wrong: it fired even when the cursor was over plain background next to a
// letter. So this does the same thing as pickColorFromImage — render just
// the character under the cursor onto an offscreen canvas with matching
// font metrics and sample the real pixel there. Alpha tells ink from gap.
function pickColorFromText(doc, clientX, clientY){
  try {
    if(!doc.caretRangeFromPoint) return null;
    const caret = doc.caretRangeFromPoint(clientX, clientY);
    if(!caret || caret.startContainer.nodeType !== 3) return null;
    const textNode = caret.startContainer;
    const data = textNode.data;
    let idx = caret.startOffset;
    if(idx >= data.length) idx = data.length - 1;
    if(idx < 0 || !data[idx] || !data[idx].trim()){
      idx = caret.startOffset - 1; // landed right after the glyph — try it
      if(idx < 0 || !data[idx] || !data[idx].trim()) return null;
    }
    const charRange = doc.createRange();
    charRange.setStart(textNode, idx);
    charRange.setEnd(textNode, idx + 1);
    const rect = charRange.getBoundingClientRect();
    if(rect.width <= 0 || rect.height <= 0) return null;
    if(clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const parentEl = textNode.parentElement;
    const cs = doc.defaultView.getComputedStyle(parentEl);
    const scale = 4; // supersample so antialiased edges don't get misread
    const w = Math.max(1, Math.ceil(rect.width)), h = Math.max(1, Math.ceil(rect.height));
    const canvas = doc.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cs.color;
    const m = ctx.measureText(data[idx]);
    const ascent = m.fontBoundingBoxAscent || (parseFloat(cs.fontSize) * 0.8);
    const descent = m.fontBoundingBoxDescent || (parseFloat(cs.fontSize) * 0.2);
    const baselineY = (h - (ascent + descent)) / 2 + ascent;
    ctx.fillText(data[idx], 0, baselineY);
    const px = Math.min(canvas.width - 1, Math.max(0, Math.round((clientX - rect.left) * scale)));
    const py = Math.min(canvas.height - 1, Math.max(0, Math.round((clientY - rect.top) * scale)));
    const d = ctx.getImageData(px, py, 1, 1).data;
    if(d[3] < 40) return null; // hit the transparent gap inside/around the glyph
    return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255) + ')';
  } catch(e){
    return null;
  }
}
function pickColorAt(doc, x, y){
  const target = doc.elementFromPoint(x, y);
  if(target && target.tagName === 'IMG'){
    const fromPixel = pickColorFromImage(target, x, y);
    if(fromPixel) return fromPixel;
    // fromPixel is null for a transparent pixel or a tainted (cross-origin,
    // non-data-URI) image — either way, fall through to the rest below.
  }
  if(target && hasDirectText(target)){
    const inkColor = pickColorFromText(doc, x, y);
    if(inkColor) return inkColor;
    // cursor is over this element's text box but landed on empty space
    // between/inside glyphs (or the browser lacks caretRangeFromPoint) —
    // fall through to the background walk below, same as any other spot.
  }
  let el = target;
  while(el){
    const bg = doc.defaultView.getComputedStyle(el).backgroundColor;
    if(parseColorParts(bg).a > 0) return bg;
    el = el.parentElement;
  }
  return 'rgb(255,255,255)';
}

// <img> has no background-color to walk up to — its content IS the pixels
// — so this reads the real pixel via an offscreen canvas at the image's
// natural resolution, accounting for object-fit so the sampled point
// actually matches what's under the cursor.
function pickColorFromImage(img, clientX, clientY){
  try {
    if(!img.naturalWidth || !img.naturalHeight) return null;
    const r = img.getBoundingClientRect();
    if(r.width <= 0 || r.height <= 0) return null;
    const boxAR = r.width / r.height, imgAR = img.naturalWidth / img.naturalHeight;
    const fit = img.ownerDocument.defaultView.getComputedStyle(img).objectFit;
    let drawW = r.width, drawH = r.height, offX = 0, offY = 0;
    if(fit === 'contain' || fit === 'scale-down'){
      if(imgAR > boxAR){ drawH = r.width / imgAR; offY = (r.height - drawH) / 2; }
      else { drawW = r.height * imgAR; offX = (r.width - drawW) / 2; }
    } else if(fit === 'cover'){
      if(imgAR > boxAR){ drawW = r.height * imgAR; offX = (r.width - drawW) / 2; }
      else { drawH = r.width / imgAR; offY = (r.height - drawH) / 2; }
    }
    const relX = clientX - r.left - offX, relY = clientY - r.top - offY;
    if(relX < 0 || relY < 0 || relX > drawW || relY > drawH) return null; // letterboxed empty strip
    const nx = Math.min(img.naturalWidth - 1, Math.floor((relX / drawW) * img.naturalWidth));
    const ny = Math.min(img.naturalHeight - 1, Math.floor((relY / drawH) * img.naturalHeight));
    const canvas = img.ownerDocument.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(nx, ny, 1, 1).data;
    if(d[3] === 0) return null;
    return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255) + ')';
  } catch(e){
    // canvas tainted by a cross-origin, non-data-URI <img src> — nothing
    // to do but fall back to the ancestor-background walk.
    return null;
  }
}
// maps a point in an artboard's own (unscaled) document coordinates to the
// parent page's viewport — the artboard row can be zoomed via CSS
// transform, so this goes through the fraction of the iframe's on-screen
// rect rather than assuming any particular scale factor.
function artboardPointToPage(ab, x, y){
  const doc = ab.dom.frame.contentDocument;
  const iw = (doc && doc.documentElement.clientWidth) || ab.dom.frame.clientWidth || 1;
  const ih = (doc && doc.documentElement.clientHeight) || ab.dom.frame.clientHeight || 1;
  const r = ab.dom.frame.getBoundingClientRect();
  return { x: r.left + (x / iw) * r.width, y: r.top + (y / ih) * r.height };
}
function showColorLoupe(pageX, pageY, colorStr){
  const loupe = document.getElementById('cpLoupe');
  loupe.style.left = (pageX + 18) + 'px';
  loupe.style.top = (pageY + 18) + 'px';
  loupe.style.display = 'flex';
  document.getElementById('cpLoupeSwatch').style.background = colorStr;
  document.getElementById('cpLoupeHex').textContent = hexFromRgbParts(parseColorParts(colorStr));
}
function hideColorLoupe(){
  document.getElementById('cpLoupe').style.display = 'none';
}
function currentCpRgba(){
  const rgb = hsvToRgb(cpHSV.h, cpHSV.s, cpHSV.v);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: cpHSV.a };
}
// pushes cpHSV out to every piece of UI that reflects it, then to whoever
// asked to be notified of the color (the swatch button that opened this).
function renderColorPopover(fireChange){
  const hueRgb = hsvToRgb(cpHSV.h, 1, 1);
  document.getElementById('cpSV').style.backgroundColor = 'rgb(' + hueRgb.r + ',' + hueRgb.g + ',' + hueRgb.b + ')';
  const svThumb = document.getElementById('cpSVThumb');
  svThumb.style.left = (cpHSV.s * 100) + '%';
  svThumb.style.top = ((1 - cpHSV.v) * 100) + '%';
  document.getElementById('cpHueThumb').style.left = (cpHSV.h / 360 * 100) + '%';
  document.getElementById('cpAlphaThumb').style.left = (cpHSV.a * 100) + '%';
  const p = currentCpRgba();
  document.getElementById('cpAlphaSlider').querySelector('.cpAlphaBg').style.background =
    'linear-gradient(to right, rgba(' + p.r + ',' + p.g + ',' + p.b + ',0), rgb(' + p.r + ',' + p.g + ',' + p.b + '))';
  const rgba = partsToRgba(p);
  document.getElementById('cpPreview').style.setProperty('--cp-preview', rgba);
  document.getElementById('cpText').value = p.a >= 1 ? hexFromRgbParts(p) : rgba;
  if(fireChange && colorPopoverOnChange) colorPopoverOnChange(rgba);
}
function openColorPopover(swatchBtn, currentColor, onChange){
  const pop = document.getElementById('colorPopover');
  const parts = parseColorParts(currentColor);
  const hsv = rgbToHsv(parts.r, parts.g, parts.b);
  cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
  renderColorPopover(false);
  if(!document.getElementById('cpSwatches').childElementCount){
    document.getElementById('cpSwatches').innerHTML = CP_SWATCHES.map(function(c){
      const bg = c === 'transparent' ? 'linear-gradient(45deg, transparent 45%, #f55 45%, #f55 55%, transparent 55%)' : c;
      return '<button type="button" class="cpSwatch" data-color="' + c + '" style="background:' + bg + '"></button>';
    }).join('');
    document.getElementById('cpSwatches').addEventListener('click', function(e){
      const btn = e.target.closest('.cpSwatch');
      if(!btn) return;
      const parts2 = parseColorParts(btn.dataset.color);
      const hsv2 = rgbToHsv(parts2.r, parts2.g, parts2.b);
      cpHSV = { h: hsv2.h, s: hsv2.s, v: hsv2.v, a: parts2.a };
      renderColorPopover(true);
    });
  }
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
// standalone version for color pickers that aren't tied to the canvas
// selection at all (artboard background, pattern color, CSS class/variable
// editors) — just reports the picked color back, no effectiveSelection().
function bindColorSwatchSimple(id, fn){
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    openColorPopover(btn, btn.dataset.color, function(rgba){
      btn.dataset.color = rgba;
      btn.querySelector('span').style.background = rgba;
      fn(rgba);
    });
  });
}

// ---------- floating text-format toolbar (bold/italic/underline/size on a
// text selection, while inline-editing an element via double-click) ----------
let activeEditDoc = null;
let activeEditTarget = null;
let activeEditArtboard = null;

function hideTextFormatBar(){
  const bar = document.getElementById('textFormatBar');
  if(bar) bar.classList.remove('open');
}
function updateTextFormatBar(ab){
  if(!activeEditDoc || !activeEditTarget || activeEditArtboard !== ab) return;
  const doc = activeEditDoc;
  if(doc.activeElement !== activeEditTarget || activeEditTarget.getAttribute('contenteditable') !== 'true'){ hideTextFormatBar(); return; }
  const sel = doc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed){ hideTextFormatBar(); return; }
  const range = sel.getRangeAt(0);
  if(!activeEditTarget.contains(range.commonAncestorContainer)){ hideTextFormatBar(); return; }
  const rect = range.getBoundingClientRect();
  if(rect.width === 0 && rect.height === 0){ hideTextFormatBar(); return; }
  const top = artboardPointToPage(ab, rect.left + rect.width / 2, rect.top);
  const bar = document.getElementById('textFormatBar');
  bar.style.left = top.x + 'px';
  bar.style.top = top.y + 'px';
  bar.classList.add('open');
}
// wraps whatever's currently selected in a fresh <span> carrying one inline
// style — extractContents+insertNode instead of surroundContents because the
// selection can span multiple nodes/element boundaries (surroundContents
// throws in that case; this doesn't care what's inside it).
function wrapSelectionWithStyle(doc, styleProp, styleVal){
  const sel = doc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  try {
    const span = doc.createElement('span');
    span.style[styleProp] = styleVal;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const newRange = doc.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
  } catch(e){ return false; }
}
function applyTextFormatCommand(cmd){
  if(!activeEditDoc) return;
  activeEditDoc.execCommand(cmd, false, null);
  pushHistory(); syncCodeFromCanvas();
  updateTextFormatBar(activeEditArtboard);
}
function applyTextFormatSize(delta){
  if(!activeEditDoc) return;
  const sel = activeEditDoc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  const currentSize = parseFloat(activeEditDoc.defaultView.getComputedStyle(node).fontSize) || 16;
  const nextSize = Math.max(8, Math.min(96, Math.round(currentSize + delta)));
  if(wrapSelectionWithStyle(activeEditDoc, 'fontSize', nextSize + 'px')){
    pushHistory(); syncCodeFromCanvas();
    updateTextFormatBar(activeEditArtboard);
  }
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
  const bar = isCol ? flexBar('100%', '3px') : flexBar('3px', '100%');
  return '<span class="swatch" style="flex-direction:' + dir + '; gap:2.5px;">' + bar + bar + bar + '</span>';
}
function alignIconIcon(val){
  const heights = val === 'stretch' ? ['100%', '100%', '100%'] : ['45%', '100%', '65%'];
  return '<span class="swatch" style="flex-direction:row; align-items:' + val + '; gap:2.5px;">' +
    flexBar('4px', heights[0]) + flexBar('4px', heights[1]) + flexBar('4px', heights[2]) + '</span>';
}
function justifyIconIcon(val){
  const gap = val.indexOf('space') === 0 ? '0' : '2.5px';
  return '<span class="swatch" style="flex-direction:row; justify-content:' + val + '; align-items:center; gap:' + gap + ';">' +
    flexBar('4px', '55%') + flexBar('4px', '55%') + flexBar('4px', '55%') + '</span>';
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

// ---------- gráfico (canvas) ----------
// no external charting library — this draws straight into the canvas 2D
// context from a small JSON config (data-ae-chart), redone on every load
// since canvas pixels don't survive an outerHTML round-trip. The exported
// .html gets a copy of this same function inlined into a <script>.
function aeDrawChart(canvas){
  let cfg;
  try { cfg = JSON.parse(canvas.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
  const type = cfg.type || 'bar';
  const labels = cfg.labels || [];
  const values = (cfg.values || []).map(Number);
  const colors = cfg.colors && cfg.colors.length ? cfg.colors : ['#6d8bff', '#35d0a4', '#ff6d8b', '#ffb020', '#a06dff', '#25c2e3'];
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if(!values.length) return;
  const max = Math.max.apply(null, values.concat([0]));
  if(type === 'line'){
    const pad = 24, cw = w - pad * 2, ch = h - pad * 2;
    const stepX = values.length > 1 ? cw / (values.length - 1) : 0;
    ctx.strokeStyle = colors[0]; ctx.lineWidth = 2; ctx.beginPath();
    values.forEach(function(v, i){
      const x = pad + i * stepX, y = pad + ch - (max > 0 ? (v / max) * ch : 0);
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    values.forEach(function(v, i){
      const x = pad + i * stepX, y = pad + ch - (max > 0 ? (v / max) * ch : 0);
      ctx.fillStyle = colors[0]; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillText(labels[i] || '', x, h - 6);
    });
  } else if(type === 'pie'){
    const total = values.reduce(function(a, b){ return a + b; }, 0);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 20;
    let start = -Math.PI / 2;
    values.forEach(function(v, i){
      const slice = total > 0 ? (v / total) * Math.PI * 2 : 0;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + slice); ctx.closePath(); ctx.fill();
      start += slice;
    });
  } else {
    const pad = 24, cw = w - pad * 2, ch = h - pad * 2, gap = 12;
    const barW = (cw - gap * (values.length - 1)) / values.length;
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    values.forEach(function(v, i){
      const barH = max > 0 ? (v / max) * ch : 0;
      const x = pad + i * (barW + gap), y = pad + ch - barH;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = '#888'; ctx.fillText(labels[i] || '', x + barW / 2, h - 6);
    });
  }
}

// same function, as a string, for the exported .html's own <script> — kept
// beside aeDrawChart on purpose so a future edit to the drawing logic is
// easy to remember to make in both places.
const AE_DRAW_CHART_SRC = 'function aeDrawChart(c){var cfg;try{cfg=JSON.parse(c.getAttribute("data-ae-chart")||"{}");}catch(e){cfg={};}' +
  'var type=cfg.type||"bar",labels=cfg.labels||[],values=(cfg.values||[]).map(Number),' +
  'colors=cfg.colors&&cfg.colors.length?cfg.colors:["#6d8bff","#35d0a4","#ff6d8b","#ffb020","#a06dff","#25c2e3"];' +
  'var ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);if(!values.length)return;' +
  'var max=Math.max.apply(null,values.concat([0]));' +
  'if(type==="line"){var pad=24,cw=w-pad*2,ch=h-pad*2,stepX=values.length>1?cw/(values.length-1):0;' +
    'ctx.strokeStyle=colors[0];ctx.lineWidth=2;ctx.beginPath();' +
    'values.forEach(function(v,i){var x=pad+i*stepX,y=pad+ch-(max>0?(v/max)*ch:0);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});' +
    'ctx.stroke();ctx.font="11px sans-serif";ctx.textAlign="center";' +
    'values.forEach(function(v,i){var x=pad+i*stepX,y=pad+ch-(max>0?(v/max)*ch:0);' +
      'ctx.fillStyle=colors[0];ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();' +
      'ctx.fillStyle="#888";ctx.fillText(labels[i]||"",x,h-6);});' +
  '}else if(type==="pie"){var total=values.reduce(function(a,b){return a+b;},0),cx=w/2,cy=h/2,r=Math.min(w,h)/2-20,start=-Math.PI/2;' +
    'values.forEach(function(v,i){var slice=total>0?(v/total)*Math.PI*2:0;' +
      'ctx.fillStyle=colors[i%colors.length];ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,start+slice);ctx.closePath();ctx.fill();' +
      'start+=slice;});' +
  '}else{var pad2=24,cw2=w-pad2*2,ch2=h-pad2*2,gap=12,barW=(cw2-gap*(values.length-1))/values.length;' +
    'ctx.font="11px sans-serif";ctx.textAlign="center";' +
    'values.forEach(function(v,i){var barH=max>0?(v/max)*ch2:0,x=pad2+i*(barW+gap),y=pad2+ch2-barH;' +
      'ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,y,barW,barH);' +
      'ctx.fillStyle="#888";ctx.fillText(labels[i]||"",x+barW/2,h-6);});' +
  '}}';

function redrawAllCharts(doc){
  if(!doc) return;
  Array.from(doc.querySelectorAll('canvas[data-ae-chart]')).forEach(function(c){ aeDrawChart(c); });
}

const ELEMENT_TEMPLATES = {
  rect: { label: '▭ Container', build: function(doc){
    const el = doc.createElement('div');
    el.style.cssText = 'width:180px; height:100px; background:#6d8bff; border-radius:8px; margin:0 0 12px;';
    return el;
  } },
  richtext: { label: 'T Texto', build: function(doc){
    const el = doc.createElement('p');
    el.textContent = 'Parágrafo de texto de exemplo.';
    el.style.cssText = 'font-size:15px; color:#333; line-height:1.6; margin:0 0 12px; max-width:480px;';
    return el;
  } },
  br: { label: 'Quebra de linha (br)', build: function(doc){
    return doc.createElement('br');
  } },
  figure: { label: 'Figure (com legenda)', build: function(doc){
    const el = doc.createElement('figure');
    el.style.cssText = 'margin:0 0 12px;';
    const ph = doc.createElement('div');
    ph.textContent = 'Imagem';
    ph.style.cssText = 'width:100%; height:160px; display:flex; align-items:center; justify-content:center; background:#e2e4e9; color:#8b90a0; border-radius:8px; font-size:13px;';
    const cap = doc.createElement('figcaption');
    cap.textContent = 'Legenda da imagem';
    cap.style.cssText = 'font-size:12.5px; color:#666; margin-top:6px;';
    el.appendChild(ph); el.appendChild(cap);
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
  li: { label: 'Item de lista (li) avulso', build: function(doc){
    const el = doc.createElement('li');
    el.textContent = 'Item de lista';
    el.style.cssText = 'font-size:15px; color:#1b1d23;';
    return el;
  } },
  table: { label: 'Tabela', build: function(doc, dataRows, cols){
    dataRows = Math.max(1, Math.min(50, dataRows || 2));
    cols = Math.max(1, Math.min(20, cols || 2));
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
    const letters = 'ABCDEFGHIJKLMNOPQRST';
    el.appendChild(row(Array.from({ length: cols }, function(_, i){ return 'Coluna ' + letters[i]; }), true));
    for(let r = 1; r <= dataRows; r++){
      el.appendChild(row(Array.from({ length: cols }, function(_, i){ return 'Valor ' + (r + i * dataRows); })));
    }
    return el;
  } },
  form: { label: '▤ Formulário', build: function(doc){
    const el = doc.createElement('form');
    el.style.cssText = 'display:block; margin:0 0 12px;';
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
  checkbox: { label: 'Checkbox / Radio', build: function(doc){
    const el = doc.createElement('label');
    el.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:14px; margin:0 0 12px;';
    const input = doc.createElement('input'); input.type = 'checkbox';
    el.appendChild(input); el.appendChild(doc.createTextNode('Opção'));
    return el;
  } },
  labelStandalone: { label: 'Label avulso', build: function(doc){
    const el = doc.createElement('label');
    el.textContent = 'Rótulo';
    el.style.cssText = 'display:block; font-size:13px; font-weight:600; color:#333; margin:0 0 6px;';
    return el;
  } },
  fieldset: { label: 'Fieldset (grupo de campos)', build: function(doc){
    const el = doc.createElement('fieldset');
    el.style.cssText = 'border:1px solid #d9dce4; border-radius:8px; padding:16px; margin:0 0 12px;';
    const legend = doc.createElement('legend');
    legend.textContent = 'Grupo';
    legend.style.cssText = 'padding:0 6px; font-size:13px; font-weight:600; color:#333;';
    el.appendChild(legend);
    return el;
  } },
  video: { label: 'Video / Audio', build: function(doc){
    const el = doc.createElement('video');
    el.controls = true;
    el.style.cssText = 'width:320px; height:180px; background:#1b1d23; border-radius:8px; display:block; margin:0 0 12px;';
    return el;
  } },
  iframe: { label: 'Iframe (embed)', build: function(doc){
    const el = doc.createElement('iframe');
    el.src = 'about:blank';
    el.style.cssText = 'width:400px; height:220px; border:1px solid #d9dce4; border-radius:8px; display:block; margin:0 0 12px;';
    return el;
  } },
  details: { label: 'Details/summary', build: function(doc){
    const el = doc.createElement('details');
    el.style.cssText = 'margin:0 0 12px; font-size:14.5px; color:#1b1d23;';
    const summary = doc.createElement('summary');
    summary.textContent = 'Clique para expandir';
    summary.style.cssText = 'cursor:pointer; font-weight:600;';
    const p = doc.createElement('p');
    p.textContent = 'Conteúdo escondido até clicar no título.';
    p.style.cssText = 'margin:8px 0 0; color:#555;';
    el.appendChild(summary); el.appendChild(p);
    return el;
  } },
  progress: { label: 'Progress / Meter', build: function(doc){
    const el = doc.createElement('progress');
    el.max = 100; el.value = 60;
    el.style.cssText = 'width:220px; display:block; margin:0 0 12px;';
    return el;
  } },
  chart: { label: '📊 Gráfico', build: function(doc){
    const el = doc.createElement('canvas');
    el.width = 320; el.height = 200;
    el.style.cssText = 'display:block; margin:0 0 12px;';
    el.setAttribute('data-ae-chart', JSON.stringify({ type: 'bar', labels: ['A', 'B', 'C'], values: [30, 55, 20], colors: ['#6d8bff', '#35d0a4', '#ff6d8b'] }));
    aeDrawChart(el);
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

// the "Texto" element (and any of these tags already in a project) picks
// its HTML tag from this list via a "Tipo" select in Propriedades, instead
// of the "+ Elemento" menu having one entry per tag — same idea as the
// Tipo select an <input> or <button> already has.
const TEXT_TYPES = [
  ['span', 'Texto em linha (span)'],
  ['p', 'Parágrafo (p)'],
  ['h1', 'Título 1 (h1)'],
  ['h2', 'Título 2 (h2)'],
  ['h3', 'Título 3 (h3)'],
  ['h4', 'Título 4 (h4)'],
  ['h5', 'Título 5 (h5)'],
  ['h6', 'Título 6 (h6)'],
  ['blockquote', 'Citação (blockquote)'],
  ['strong', 'Negrito (strong)'],
  ['em', 'Itálico (em)'],
  ['b', 'Negrito visual (b)'],
  ['i', 'Itálico visual (i)'],
  ['code', 'Código em linha (code)'],
  ['pre', 'Bloco de código (pre)']
];
const TEXT_TYPE_TAGS = TEXT_TYPES.map(function(t){ return t[0].toUpperCase(); });

// same "Tipo" trick as TEXT_TYPES, for the other menu entries that got
// folded together: pick the specific tag from a dropdown instead of the
// "+ Elemento" menu having one entry per tag.
const CONTAINER_TYPES = [
  ['div', 'Div (genérico)'], ['section', 'Section'], ['article', 'Article'], ['aside', 'Aside'],
  ['main', 'Main'], ['header', 'Header'], ['footer', 'Footer'], ['nav', 'Nav (navegação)']
];
const CONTAINER_TYPE_TAGS = CONTAINER_TYPES.map(function(t){ return t[0].toUpperCase(); });

const LIST_TYPES = [['ul', 'Lista (não ordenada)'], ['ol', 'Lista numerada']];
const LIST_TYPE_TAGS = LIST_TYPES.map(function(t){ return t[0].toUpperCase(); });

const MEDIA_TYPES = [['video', 'Video'], ['audio', 'Audio']];
const MEDIA_TYPE_TAGS = MEDIA_TYPES.map(function(t){ return t[0].toUpperCase(); });

const INDICATOR_TYPES = [['progress', 'Progress'], ['meter', 'Meter']];
const INDICATOR_TYPE_TAGS = INDICATOR_TYPES.map(function(t){ return t[0].toUpperCase(); });

function typeSwitchHTML(fieldId, sectionLabel, tag, types){
  const options = types.map(function(t){
    return '<option value="' + t[0] + '"' + (t[0] === tag.toLowerCase() ? ' selected' : '') + '>' + t[1] + '</option>';
  }).join('');
  return '<div class="propsSection">' + sectionLabel + '</div>' +
    '<div class="field"><label>Tipo</label><select id="' + fieldId + '">' + options + '</select></div>';
}

function bindTypeSwitch(fieldId, el){
  const sel = document.getElementById(fieldId);
  if(!sel) return;
  sel.addEventListener('change', function(){
    const next = convertElementTag(el, this.value);
    renderLayers();
    selectElement(next);
    pushHistory(); syncCodeFromCanvas();
  });
}

// swaps an element's tag while keeping its content, attributes and (so
// anything already targeting it by data-ae-name/data-ae-eid/etc. keeps
// working) — the DOM has no "just change the tag" primitive, so this
// builds a replacement and moves everything over by hand.
function convertElementTag(el, newTag){
  const doc = el.ownerDocument;
  const next = doc.createElement(newTag);
  Array.from(el.attributes).forEach(function(attr){ next.setAttribute(attr.name, attr.value); });
  while(el.firstChild) next.appendChild(el.firstChild);
  el.parentNode.replaceChild(next, el);
  return next;
}

async function addElement(type){
  const doc = getDoc();
  const tpl = ELEMENT_TEMPLATES[type];
  if(!doc || !tpl) return;
  let el;
  if(type === 'table'){
    const rowsStr = await showPrompt('Quantas linhas de dados? (sem contar o cabeçalho)', '2', 'Nova tabela');
    if(rowsStr === null) return;
    const colsStr = await showPrompt('Quantas colunas?', '2', 'Nova tabela');
    if(colsStr === null) return;
    el = tpl.build(doc, parseInt(rowsStr, 10), parseInt(colsStr, 10));
  } else {
    el = tpl.build(doc);
  }
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
  ['data-ae-name', 'data-ae-locked', 'data-ae-group', 'data-ae-goto', 'data-ae-toggle', 'data-ae-call', 'data-ae-evt', 'data-ae-settext', 'data-ae-settext-value'].forEach(function(attr){
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
    { label: 'HTML + CSS + JS separados (' + base + '.html/.css/.js)', action: function(){
      const parts = cleanExportSplit(a, base);
      downloadFile(base + '.html', parts.html, 'text/html');
      if(parts.css) downloadFile(base + '.css', parts.css, 'text/css');
      if(parts.js) downloadFile(base + '.js', parts.js, 'application/javascript');
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

function setPropsView(view){
  state.propsView = view;
  document.getElementById('propsViewSimple').classList.toggle('active', view === 'simple');
  document.getElementById('propsViewFull').classList.toggle('active', view === 'full');
  renderProps();
}
document.getElementById('propsViewSimple').addEventListener('click', function(){ setPropsView('simple'); });
document.getElementById('propsViewFull').addEventListener('click', function(){ setPropsView('full'); });
document.getElementById('propsSearch').addEventListener('input', function(){
  state.propsSearchQuery = this.value;
  filterPropsBySearch(this.value);
});

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
  if(codePanel.classList.contains('open')){ setCodeTab('html'); }
});
// JS gets its own toolbar button — same panel as "Código", but it opens
// straight to the JS tab instead of making people find it by first opening
// the HTML view and then noticing the tab switcher.
document.getElementById('btnJs').addEventListener('click', function(){
  codePanel.classList.add('open');
  setCodeTab('js');
});
document.getElementById('btnCodeApply').addEventListener('click', applyCodeToCanvas);
document.getElementById('btnCodeCopy').addEventListener('click', function(){
  codeArea.select();
  document.execCommand('copy');
});
document.getElementById('codeTabHtml').addEventListener('click', function(){ setCodeTab('html'); });
document.getElementById('codeTabJs').addEventListener('click', function(){ setCodeTab('js'); });

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

function applyTableStyle(table, preset){
  table.setAttribute('data-ae-table-style', preset);
  let dataRowIndex = 0;
  Array.from(table.querySelectorAll('tr')).forEach(function(row){
    const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
    const stripe = !isHead && (dataRowIndex++ % 2 === 1);
    Array.from(row.children).forEach(function(cell){
      if(preset === 'bordered'){
        cell.style.border = '2px solid #8b90a0';
        cell.style.backgroundColor = '';
      } else if(preset === 'striped'){
        cell.style.border = '1px solid #ccc';
        cell.style.backgroundColor = stripe ? 'rgba(0,0,0,0.045)' : '';
      } else {
        cell.style.border = '1px solid #ccc';
        cell.style.backgroundColor = '';
      }
    });
  });
  pushHistory(); syncCodeFromCanvas();
}

// only handles the simple, common cases: cells contiguous in one row (colspan)
// or contiguous down one column (rowspan) — enough for the everyday "merge
// this with the one next to it" case, not general spreadsheet-style merging
// across an already-merged table.
function tableCellColIndex(cell){
  return Array.from(cell.parentElement.children).indexOf(cell);
}
function getMergeableTableCells(){
  const items = effectiveSelection();
  if(items.length < 2) return null;
  if(!items.every(function(el){ return el.tagName === 'TD' || el.tagName === 'TH'; })) return null;
  const table = items[0].closest('table');
  if(!table || !items.every(function(el){ return el.closest('table') === table; })) return null;
  const sameRow = items.every(function(el){ return el.parentElement === items[0].parentElement; });
  if(sameRow){
    const sorted = items.slice().sort(function(a, b){ return tableCellColIndex(a) - tableCellColIndex(b); });
    for(let i = 1; i < sorted.length; i++){
      if(tableCellColIndex(sorted[i]) !== tableCellColIndex(sorted[i - 1]) + 1) return null;
    }
    return { type: 'h', cells: sorted };
  }
  const col = tableCellColIndex(items[0]);
  const sameCol = items.every(function(el){ return tableCellColIndex(el) === col; });
  if(sameCol){
    const rows = Array.from(table.querySelectorAll('tr'));
    const sorted = items.slice().sort(function(a, b){ return rows.indexOf(a.parentElement) - rows.indexOf(b.parentElement); });
    for(let i = 1; i < sorted.length; i++){
      if(rows.indexOf(sorted[i].parentElement) !== rows.indexOf(sorted[i - 1].parentElement) + 1) return null;
    }
    return { type: 'v', cells: sorted };
  }
  return null;
}
function mergeTableCells(group){
  const doc = group.cells[0].ownerDocument;
  const first = group.cells[0];
  const rest = group.cells.slice(1);
  const attr = group.type === 'h' ? 'colspan' : 'rowspan';
  const span = group.cells.reduce(function(sum, c){ return sum + (parseInt(c.getAttribute(attr), 10) || 1); }, 0);
  first.setAttribute(attr, String(span));
  rest.forEach(function(c){
    const text = c.textContent.trim();
    if(text) first.appendChild(doc.createTextNode((first.textContent.trim() ? ' ' : '') + text));
    c.remove();
  });
  state.multiSelect = new Set();
  selectElement(first);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function moveTableRow(row, dir){
  const table = row.closest('table');
  if(!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const target = rows[rows.indexOf(row) + dir];
  // rows can live directly under <table> (built via DOM API, like a brand
  // new table here) or under an implicit <tbody> the browser's HTML parser
  // inserts on reparse (after Aplicar código, or on reload) — use the row's
  // own parent rather than assuming which one it is.
  if(!target || target.parentNode !== row.parentNode) return;
  const parent = row.parentNode;
  if(dir < 0) parent.insertBefore(row, target); else parent.insertBefore(target, row);
  selectElement(row);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}
function moveTableColumn(table, colIndex, dir){
  const targetIndex = colIndex + dir;
  if(targetIndex < 0) return;
  Array.from(table.querySelectorAll('tr')).forEach(function(row){
    const cell = row.children[colIndex];
    const target = row.children[targetIndex];
    if(!cell || !target) return;
    if(dir < 0) row.insertBefore(cell, target); else row.insertBefore(target, cell);
  });
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function deleteTableRow(row){
  const table = row.closest('table');
  if(!table) return;
  if(table.querySelectorAll('tr').length <= 1){ showAlert('A tabela precisa ter pelo menos uma linha.'); return; }
  const wasSelected = state.selected === row || (state.selected && row.contains(state.selected));
  row.remove();
  if(wasSelected) selectElement(table);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function deleteTableColumn(table, colIndex){
  const rows = Array.from(table.querySelectorAll('tr'));
  if(rows.length && rows[0].children.length <= 1){ showAlert('A tabela precisa ter pelo menos uma coluna.'); return; }
  let wasSelected = false;
  rows.forEach(function(row){
    const cell = row.children[colIndex];
    if(cell){
      if(state.selected === cell || cell.contains(state.selected)) wasSelected = true;
      cell.remove();
    }
  });
  if(wasSelected) selectElement(table);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

// swaps every cell in a row between <td> and <th> — the quick way to mark
// (or unmark) a header row after the table already exists, instead of
// having to rebuild it from scratch.
function toggleTableRowHeader(row){
  const doc = row.ownerDocument;
  const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
  const wasSelected = state.selected === row;
  Array.from(row.children).forEach(function(cell){
    const newCell = doc.createElement(isHead ? 'td' : 'th');
    while(cell.firstChild) newCell.appendChild(cell.firstChild);
    newCell.style.cssText = cell.style.cssText || 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    Array.from(cell.attributes).forEach(function(attr){
      if(attr.name !== 'style') newCell.setAttribute(attr.name, attr.value);
    });
    row.replaceChild(newCell, cell);
  });
  if(wasSelected) selectElement(row);
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
    const row = el.tagName === 'TR' ? el : (el.closest ? el.closest('tr') : null);
    const cell = (el.tagName === 'TD' || el.tagName === 'TH') ? el : (el.closest ? el.closest('td, th') : null);
    if(row){
      const rows = Array.from(table.querySelectorAll('tr'));
      const rowIdx = rows.indexOf(row);
      const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
      items.push({ label: (isHead ? 'Desmarcar' : 'Marcar') + ' linha como cabeçalho', action: function(){ toggleTableRowHeader(row); } });
      items.push({ label: '↑ Mover linha pra cima', disabled: rowIdx <= 0, action: function(){ moveTableRow(row, -1); } });
      items.push({ label: '↓ Mover linha pra baixo', disabled: rowIdx >= rows.length - 1, action: function(){ moveTableRow(row, 1); } });
      items.push({ label: 'Excluir linha', action: function(){ deleteTableRow(row); } });
    }
    if(cell){
      const colIndex = tableCellColIndex(cell);
      const colCount = cell.parentElement.children.length;
      items.push({ label: '← Mover coluna pra esquerda', disabled: colIndex <= 0, action: function(){ moveTableColumn(table, colIndex, -1); } });
      items.push({ label: '→ Mover coluna pra direita', disabled: colIndex >= colCount - 1, action: function(){ moveTableColumn(table, colIndex, 1); } });
      items.push({ label: 'Excluir coluna', action: function(){ deleteTableColumn(table, colIndex); } });
    }
    const mergeable = getMergeableTableCells();
    if(mergeable){
      items.push({ label: '⊞ Mesclar células', action: function(){ mergeTableCells(mergeable); } });
    }
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
        '<div class="field"><label>Cor do texto</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_color', getVal('color') || '#000000') + varDropdownHTML(doc, getVal('color'), 'css_color_var') + '</div></div>' +
      '</div>' +

      '<div class="css-section-title">Fundo &amp; Superfície</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Cor de fundo</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_bg_color', getVal('background-color') || '#000000') + varDropdownHTML(doc, getVal('background-color'), 'css_bg_color_var') + '</div></div>' +
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
        '<div class="field"><label>Cor</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_border_c', getVal('border-color') || '#000000') + varDropdownHTML(doc, getVal('border-color'), 'css_border_c_var') + '</div></div>' +
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
      { id: 'css_border_s', prop: 'border-style' }
    ];

    function setDecl(prop, val){
      if(val) decls[prop] = val;
      else delete decls[prop];
      const updatedBody = Object.keys(decls).map(function(k){ return k + ': ' + decls[k] + ';'; }).join('\n  ');
      rawTextarea.value = updatedBody;
      saveCurrentClassRule(updatedBody);
    }

    fieldMap.forEach(function(item){
      const input = document.getElementById(item.id);
      if(!input) return;
      input.addEventListener('change', function(){
        setDecl(item.prop, input.value.trim());
      });
    });

    [
      { id: 'css_color', prop: 'color' },
      { id: 'css_bg_color', prop: 'background-color' },
      { id: 'css_border_c', prop: 'border-color' }
    ].forEach(function(item){
      bindColorSwatchSimple(item.id, function(rgba){ setDecl(item.prop, rgba); });
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
      const rowColor = v.value.startsWith('#') ? v.value : rgbToHex(v.value);
      const colorInputHTML = isHex ? '<button type="button" class="colorSwatchBtn" data-color="' + rowColor.replace(/"/g, '&quot;') + '"><span style="background:' + rowColor + '"></span></button>' : '';

      row.innerHTML =
        '<input type="text" class="var-name" value="' + v.name + '" placeholder="--var-name">' +
        '<input type="text" class="var-val" value="' + v.value.replace(/"/g, '&quot;') + '" placeholder="valor">' +
        colorInputHTML +
        '<button type="button" class="miniBtn danger var-del" title="Excluir variável">✕</button>';

      const nameInput = row.querySelector('.var-name');
      const valInput = row.querySelector('.var-val');
      const colorInput = row.querySelector('.colorSwatchBtn');
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
        colorInput.addEventListener('click', function(e){
          e.stopPropagation();
          openColorPopover(colorInput, colorInput.dataset.color, function(rgba){
            colorInput.dataset.color = rgba;
            colorInput.querySelector('span').style.background = rgba;
            valInput.value = rgba;
            setRootVariable(doc, nameInput.value.trim(), rgba);
            pushHistory(); syncCodeFromCanvas(); renderProps();
          });
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

// drags within a picker rectangle report a 0–1 fraction on each axis —
// shared by the S/V square (uses both x and y) and the hue/alpha bars
// (use only x), and keeps tracking on mousemove/mouseup at the window
// level so the pointer can leave the element mid-drag without stopping.
function bindColorDrag(el, onMove){
  function compute(e){
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  }
  el.addEventListener('mousedown', function(e){
    e.preventDefault();
    onMove(compute(e));
    function moveHandler(ev){ onMove(compute(ev)); }
    function upHandler(){
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    }
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  });
}
bindColorDrag(document.getElementById('cpSV'), function(pt){
  cpHSV.s = pt.x; cpHSV.v = 1 - pt.y;
  renderColorPopover(true);
});
bindColorDrag(document.getElementById('cpHueSlider'), function(pt){
  cpHSV.h = pt.x * 360;
  renderColorPopover(true);
});
bindColorDrag(document.getElementById('cpAlphaSlider'), function(pt){
  cpHSV.a = pt.x;
  renderColorPopover(true);
});
document.getElementById('cpText').addEventListener('change', function(){
  const parts = parseColorParts(this.value);
  const hsv = rgbToHsv(parts.r, parts.g, parts.b);
  cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
  renderColorPopover(true);
});
document.getElementById('cpEyedrop').addEventListener('click', function(e){
  e.stopPropagation();
  if(colorPickingActive) stopColorPicking(); else startColorPicking();
});
// mousedown preventDefault (not click) is what keeps focus — and the live
// selection — inside the iframe's contenteditable element while these
// buttons are used; without it the browser blurs the editable region before
// the click even fires, collapsing the selection first.
['tfbBold', 'tfbItalic', 'tfbUnderline', 'tfbSizeDown', 'tfbSizeUp'].forEach(function(id){
  const btn = document.getElementById(id);
  if(btn) btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
});
document.getElementById('tfbBold').addEventListener('click', function(){ applyTextFormatCommand('bold'); });
document.getElementById('tfbItalic').addEventListener('click', function(){ applyTextFormatCommand('italic'); });
document.getElementById('tfbUnderline').addEventListener('click', function(){ applyTextFormatCommand('underline'); });
document.getElementById('tfbSizeDown').addEventListener('click', function(){ applyTextFormatSize(-2); });
document.getElementById('tfbSizeUp').addEventListener('click', function(){ applyTextFormatSize(2); });
document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('colorPopover');
  if(!pop.classList.contains('open')) return;
  if(pop.contains(e.target) || e.target.closest('.colorSwatchBtn')) return;
  closeColorPopover();
});

document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('colorPopover');
  if(!pop.classList.contains('open')) return;
  if(pop.contains(e.target) || e.target.closest('.colorSwatchBtn')) return;
  closeColorPopover();
});

// ---------- FASE 10: Barra de fórmulas (Power Apps style) ----------
// Syntactic sugar over document.querySelector — lets users write
// JavaScript expressions referencing elements by their layer names
// (data-ae-name) instead of raw selectors.
//
// Examples:
//   div_1.hide()
//   div_1.text = "hello"
//   div_1.style.backgroundColor = "#ff0000"
//   card_1.toggle()
//   btn_ok.show() && card_1.hide()
//
// The formula is compiled to a self-contained script that runs inside
// the artboard's iframe, with a tiny runtime that maps names to elements.
// Exported HTML gets the same runtime inlined so formulas work standalone.

// Which properties/actions show up in autocomplete after typing "name."
const FORMULA_PROPERTIES = [
  { name: 'text', kind: 'prop', desc: 'textContent' },
  { name: 'html', kind: 'prop', desc: 'innerHTML' },
  { name: 'value', kind: 'prop', desc: 'input value' },
  { name: 'style', kind: 'obj', desc: 'CSSStyleDeclaration' },
  { name: 'classList', kind: 'obj', desc: 'DOMTokenList' },
  { name: 'id', kind: 'prop', desc: 'element id' },
  { name: 'hide', kind: 'fn', desc: 'style.display = "none"' },
  { name: 'show', kind: 'fn', desc: 'style.display = ""' },
  { name: 'toggle', kind: 'fn', desc: 'toggle visibility' },
  { name: 'focus', kind: 'fn', desc: 'element.focus()' },
  { name: 'click', kind: 'fn', desc: 'element.click()' },
  { name: 'remove', kind: 'fn', desc: 'element.remove()' },
  { name: 'scrollIntoView', kind: 'fn', desc: 'scroll into view' }
];

// Collect all named elements from the active artboard's document.
function getFormulaNames(){
  const doc = getDoc();
  if(!doc || !doc.body) return [];
  const names = [];
  function walk(el){
    if(!isEditableEl(el, doc)) return;
    if(el.dataset.aeName) names.push(el.dataset.aeName);
    Array.from(el.children).forEach(walk);
  }
  Array.from(doc.body.children).forEach(walk);
  return names;
}

// The proxy is the sugar: it intercepts property access so .hide(),
// .show(), .toggle() etc. work as methods, while everything else falls
// through to the real DOM element. Shared by the editor runtime and the
// runtime inlined into exported HTML (which looks elements up by the
// throwaway data-ae-eid instead of data-ae-name).
const AE_FORMULA_PROXY_SRC =
  'function _aeProxy(el){' +
    'if(!el)return{};' +
    'return new Proxy(el,{' +
      'get:function(t,k){' +
        'if(k==="hide")return function(){t.style.display="none";};' +
        'if(k==="show")return function(){t.style.display="";};' +
        'if(k==="toggle")return function(){t.style.display=t.style.display==="none"?"":"none";};' +
        'if(k==="text")return t.textContent;' +
        'if(k==="html")return t.innerHTML;' +
        'if(k==="value")return t.value;' +
        'var v=t[k];' +
        'return typeof v==="function"?v.bind(t):v;' +
      '},' +
      'set:function(t,k,v){' +
        'if(k==="text"){t.textContent=v;return true;}' +
        'if(k==="html"){t.innerHTML=v;return true;}' +
        'if(k==="value"){t.value=v;return true;}' +
        't[k]=v;return true;' +
      '}' +
    '});' +
  '}';

// One "var name=_aeProxy(document.querySelector(...))" per pair
// ({ safe, selector }).
function buildFormulaDecls(pairs){
  return pairs.map(function(p){
    return 'var ' + p.safe + '=_aeProxy(document.querySelector(\'' + p.selector.replace(/'/g, "\\'") + '\'));';
  }).join('');
}

// Build a small runtime script that declares each named element as a
// variable pointing to a proxy. The optional body (the user's formula)
// is wrapped INSIDE the same IIFE as the declarations — running it after
// the closure would leave every name out of scope ("x is not defined").
function buildFormulaRuntime(doc, body){
  const pairs = [];
  function walk(el){
    if(!isEditableEl(el, doc)) return;
    if(el.dataset.aeName){
      pairs.push({
        safe: el.dataset.aeName.replace(/[^a-zA-Z0-9_$]/g, '_'),
        selector: '[data-ae-name="' + el.dataset.aeName.replace(/"/g, '\\"') + '"]'
      });
    }
    Array.from(el.children).forEach(walk);
  }
  if(doc && doc.body) Array.from(doc.body.children).forEach(walk);
  if(!pairs.length && !body) return '';

  // One runtime per artboard — idempotent if re-run (overwrites vars).
  return '(function(){' +
      AE_FORMULA_PROXY_SRC +
      buildFormulaDecls(pairs) +
      (body ? '\n' + body + '\n' : '') +
    '})();';
}

// Compile a user-written formula into executable JS by prefixing the
// runtime and wrapping the expression in a try/catch.
function compileFormula(formula){
  const doc = getDoc();
  if(!doc || !doc.body) return null;
  const safeNames = getFormulaNames().map(function(n){ return n.replace(/[^a-zA-Z0-9_$]/g, '_'); });
  // basic sanity: reject assignment to unknown identifiers (typos)
  const unknownIdRe = /\b([a-zA-Z_$][\w$]*)\b/g;
  let m;
  while((m = unknownIdRe.exec(formula)) !== null){
    const id = m[1];
    // skip JS keywords and built-ins
    const jsKeywords = ['var','let','const','function','return','if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','new','this','true','false','null','undefined','typeof','instanceof','in','of','void','delete','document','window','console','Math','Date','JSON','parseInt','parseFloat','isNaN','isFinite','alert','confirm','prompt','setTimeout','setInterval','clearTimeout','clearInterval','encodeURI','decodeURI','encodeURIComponent','decodeURIComponent','escape','unescape','eval','String','Number','Boolean','Array','Object','RegExp','Error','Date','Map','Set','Promise','Symbol','BigInt','Infinity','NaN'];
    if(jsKeywords.indexOf(id) !== -1) continue;
    if(safeNames.indexOf(id) === -1 && id !== 'style' && id !== 'classList'){
      // allow property chains like el.style.color — 'style' alone is ok
      // but 'unknownName.something' should warn
      const chainCheck = new RegExp('\\b' + id + '\\s*\\.');
      if(chainCheck.test(formula)){
        return { error: 'Nome desconhecido: "' + id + '". Use os nomes das camadas (data-ae-name) ou IDs do documento.' };
      }
    }
  }
  const wrapped = buildFormulaRuntime(doc, 'try{\n  ' + formula + ';\n}catch(e){\n  console.error("[Fórmula]", e.message);\n}');
  return { code: wrapped };
}

// Execute the compiled formula inside the active artboard's iframe.
function runFormula(formula){
  const doc = getDoc();
  const frame = getFrame();
  if(!doc || !frame) return { ok: false, error: 'Nenhum artboard ativo.' };
  const compiled = compileFormula(formula);
  if(compiled.error) return { ok: false, error: compiled.error };
  try {
    const script = doc.createElement('script');
    script.textContent = compiled.code;
    doc.body.appendChild(script);
    script.remove();
    return { ok: true };
  } catch(e){
    return { ok: false, error: e.message };
  }
}

// Autocomplete state
let formulaAcIndex = -1;
let formulaAcItems = [];

function updateFormulaAutocomplete(){
  const input = document.getElementById('formulaInput');
  const list = document.getElementById('formulaAutocomplete');
  if(!input || !list) return;
  const val = input.value;
  const cursor = input.selectionStart || 0;
  const before = val.slice(0, cursor);

  // Find the token before the cursor: either "name." or just "name"
  const match = before.match(/([a-zA-Z_$][\w$]*)\.$/);
  const nameMatch = before.match(/([a-zA-Z_$][\w$]*)$/);

  list.innerHTML = '';
  formulaAcItems = [];
  formulaAcIndex = -1;

  if(match){
    // After a dot — suggest properties/actions
    const prefix = match[1];
    const names = getFormulaNames().map(function(n){ return n.replace(/[^a-zA-Z0-9_$]/g, '_'); });
    // Only show props if the prefix is a known element name
    if(names.indexOf(prefix) !== -1){
      FORMULA_PROPERTIES.forEach(function(p){
        const item = document.createElement('div');
        item.className = 'formulaAutocompleteItem';
        item.innerHTML = '<span>' + p.name + '</span><span class="acDesc">' + p.desc + '</span><span class="acKind">' + p.kind + '</span>';
        item.addEventListener('mousedown', function(e){
          e.preventDefault();
          insertFormulaCompletion(p.name + (p.kind === 'fn' ? '()' : ''));
        });
        list.appendChild(item);
        formulaAcItems.push(item);
      });
    }
  } else if(nameMatch && !before.endsWith('.')){
    // Typing a name — suggest element names
    const typed = nameMatch[1].toLowerCase();
    const names = getFormulaNames();
    names.forEach(function(n){
      const safe = n.replace(/[^a-zA-Z0-9_$]/g, '_');
      if(safe.toLowerCase().indexOf(typed) === -1) return;
      const item = document.createElement('div');
      item.className = 'formulaAutocompleteItem';
      item.innerHTML = '<span>' + safe + '</span><span class="acDesc">' + n + '</span><span class="acKind">el</span>';
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        insertFormulaCompletion(safe);
      });
      list.appendChild(item);
      formulaAcItems.push(item);
    });
  }

  list.classList.toggle('open', formulaAcItems.length > 0);
}

function insertFormulaCompletion(text){
  const input = document.getElementById('formulaInput');
  if(!input) return;
  const val = input.value;
  const cursor = input.selectionStart || 0;
  const before = val.slice(0, cursor);
  const after = val.slice(cursor);

  // Replace the token being completed
  const replaced = before.replace(/([a-zA-Z_$][\w$]*\.?)$/, text);
  input.value = replaced + after;
  const newPos = replaced.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  updateFormulaAutocomplete();
}

function moveFormulaAc(dir){
  if(!formulaAcItems.length) return false;
  formulaAcIndex += dir;
  if(formulaAcIndex < 0) formulaAcIndex = formulaAcItems.length - 1;
  if(formulaAcIndex >= formulaAcItems.length) formulaAcIndex = 0;
  formulaAcItems.forEach(function(it, i){ it.classList.toggle('active', i === formulaAcIndex); });
  const active = formulaAcItems[formulaAcIndex];
  if(active) active.scrollIntoView({ block: 'nearest' });
  return true;
}

function acceptFormulaAc(){
  if(formulaAcIndex < 0 || !formulaAcItems[formulaAcIndex]) return false;
  formulaAcItems[formulaAcIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return true;
}

function closeFormulaAc(){
  const list = document.getElementById('formulaAutocomplete');
  if(list) list.classList.remove('open');
  formulaAcItems = [];
  formulaAcIndex = -1;
}

// Wire formula bar events
(function wireFormulaBar(){
  const input = document.getElementById('formulaInput');
  const btnRun = document.getElementById('btnFormulaRun');
  const btnToggle = document.getElementById('btnFormulaBar');
  const wrap = document.getElementById('formulaBarWrap');
  if(!input || !btnRun || !btnToggle || !wrap) return;

  btnToggle.addEventListener('click', function(){
    wrap.classList.toggle('open');
    btnToggle.classList.toggle('active', wrap.classList.contains('open'));
    if(wrap.classList.contains('open')){
      setTimeout(function(){ input.focus(); }, 0);
    }
  });

  input.addEventListener('input', function(){ updateFormulaAutocomplete(); });
  input.addEventListener('keydown', function(e){
    if(e.key === 'ArrowDown'){ e.preventDefault(); moveFormulaAc(1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); moveFormulaAc(-1); }
    else if(e.key === 'Enter'){
      e.preventDefault();
      if(formulaAcItems.length && formulaAcIndex >= 0){
        acceptFormulaAc();
      } else {
        btnRun.click();
      }
    }
    else if(e.key === 'Escape'){ closeFormulaAc(); }
    else if(e.key === 'Tab'){
      e.preventDefault();
      if(formulaAcItems.length) acceptFormulaAc();
    }
  });
  input.addEventListener('blur', function(){ setTimeout(function(){ closeFormulaAc(); }, 150); });

  btnRun.addEventListener('click', function(){
    const formula = input.value.trim();
    if(!formula) return;
    const result = runFormula(formula);
    if(!result.ok){
      showAlert(result.error || 'Erro na fórmula.', 'Fórmula');
    } else {
      if(formulaNeedsPersistence(formula)) storeFormulaInDoc(getDoc(), formula);
      pushHistory(); syncCodeFromCanvas();
      // flash success
      input.style.borderColor = 'var(--accent)';
      setTimeout(function(){ input.style.borderColor = ''; }, 400);
    }
  });
})();

// Export support: wireExportFormulas injects the same runtime + any
// stored formulas into the exported HTML so they work standalone.
// Formulas are stored as data-ae-formula on a small script tag in the
// artboard's body (invisible, no side effects until the runtime runs).
//
// Only BEHAVIORAL formulas are stored. A formula that mutates the DOM
// (div_1.hide(), card.text = "x") already persists by itself — the change
// is serialized into the exported HTML — so storing it would re-apply a
// state the user may have changed afterwards. Event bindings
// (btn.onclick = ..., addEventListener) leave no trace in serialized HTML,
// so they're the ones that need to be re-run when the file opens.
function formulaNeedsPersistence(formula){
  return /(\.on[a-z]+\s*=|addEventListener\s*\()/.test(formula);
}

function storeFormulaInDoc(doc, formula){
  if(!doc || !doc.body) return;
  let tag = doc.querySelector('script[data-ae-formula]');
  if(!tag){
    tag = doc.createElement('script');
    // a non-JS type keeps the tag INERT — without it the raw formula
    // (which expects the proxy runtime's variables in scope) would
    // execute bare every time the artboard's HTML is re-parsed
    tag.type = 'text/x-ae-formula';
    tag.setAttribute('data-ae-formula', '1');
    doc.body.appendChild(tag);
  }
  const existing = (tag.textContent || '').trim();
  const lines = existing ? existing.split('\n') : [];
  if(lines.indexOf(formula) !== -1) return; // already stored, don't duplicate
  tag.textContent = existing ? existing + '\n' + formula : formula;
}

function wireExportFormulas(doc, clone){
  const formulaTag = clone.querySelector('script[data-ae-formula]');
  if(!formulaTag) return;
  const formulas = (formulaTag.textContent || '').trim();
  formulaTag.remove();
  if(!formulas) return;
  // Formulas reference elements by layer name (data-ae-name), which
  // cleanExportHTML strips right after this runs — so every named element a
  // formula actually mentions gets a throwaway eid, and the exported runtime
  // looks elements up by that instead (same trick as toggle/settext actions).
  let counter = 0;
  const pairs = [];
  clone.querySelectorAll('[data-ae-name]').forEach(function(el){
    const name = el.getAttribute('data-ae-name');
    const safe = name.replace(/[^a-zA-Z0-9_$]/g, '_');
    const re = new RegExp('\\b' + safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if(!re.test(formulas)) return;
    let eid = el.getAttribute('data-ae-eid');
    if(!eid){ eid = 'ae-el-f' + (++counter); el.setAttribute('data-ae-eid', eid); }
    pairs.push({ safe: safe, selector: '[data-ae-eid="' + eid + '"]' });
  });
  const body = 'try{\n' + formulas + '\n}catch(e){\n  console.error("[Fórmula]", e.message);\n}';
  const script = doc.createElement('script');
  script.textContent = '(function(){' + AE_FORMULA_PROXY_SRC + buildFormulaDecls(pairs) + '\n' + body + '\n})();';
  clone.querySelector('body').appendChild(script);
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
