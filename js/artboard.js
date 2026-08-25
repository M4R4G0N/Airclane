"use strict";

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
  renderPagesPanel();
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
    renderPagesPanel();
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
  if(state.activeId === id){ renderPagesPanel(); return; }
  state.activeId = id;
  state.selected = null;
  state.artboardMode = false;
  artboards.forEach(function(a){ a.dom.wrap.classList.remove('selected'); });
  renderLayers();
  renderProps();
  renderOverlay();
  renderPagesPanel();
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

// fits every artboard into the visible canvas area and centers them —
// the fastest way back to "where is everything?" after roaming the canvas.
function zoomToFit(){
  const wrap = document.getElementById('canvasWrap');
  if(!wrap || !artboards.length) return;
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  artboards.forEach(function(a){
    minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x + a.w); maxY = Math.max(maxY, a.y + a.h);
  });
  const pad = 80;
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  state.zoom = Math.max(0.1, Math.min(1.5, Math.min(wrap.clientWidth / bw, wrap.clientHeight / bh)));
  applyZoom();
  wrap.scrollLeft = ((minX + maxX) / 2) * state.zoom - wrap.clientWidth / 2;
  wrap.scrollTop = ((minY + maxY) / 2) * state.zoom - wrap.clientHeight / 2;
  renderOverlay();
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
  renderPagesPanel();
}

function duplicateArtboard(ab){
  const html = currentHTMLFor(ab);
  const clone = createArtboard({ name: ab.name + ' cópia', w: ab.w, h: ab.h, html: html });
  setActiveArtboard(clone.id);
  selectArtboardOnly(clone.id);
}

