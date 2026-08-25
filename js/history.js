"use strict";

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

