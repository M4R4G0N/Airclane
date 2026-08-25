"use strict";

// ---------- clipboard ----------

let clipboardEl = null;
// artboard-level clipboard: { name, w, h, html } — separate from the element
// clipboard so Ctrl+C/V can copy a whole artboard when no element is selected
let clipboardArtboard = null;
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
  else if(e.ctrlKey && e.key.toLowerCase() === 'c'){
    if(state.selected){ e.preventDefault(); copySelected(); }
    else if(state.artboardMode){
      const a = activeArtboard();
      if(a){ e.preventDefault(); clipboardArtboard = { name: a.name, w: a.w, h: a.h, html: currentHTMLFor(a) }; }
    }
  }
  else if(e.ctrlKey && e.key.toLowerCase() === 'v'){
    if(clipboardEl){ e.preventDefault(); pasteClipboard(); }
    else if(clipboardArtboard){
      e.preventDefault();
      const clone = createArtboard({ name: clipboardArtboard.name + ' cópia', w: clipboardArtboard.w, h: clipboardArtboard.h, html: clipboardArtboard.html });
      setActiveArtboard(clone.id);
      selectArtboardOnly(clone.id);
    }
  }
  else if(e.ctrlKey && e.key.toLowerCase() === 's'){ e.preventDefault(); document.getElementById('btnSave').click(); }
  else if(e.ctrlKey && e.key === '1'){ e.preventDefault(); zoomToFit(); }
  else if(e.ctrlKey && e.key === '0'){ e.preventDefault(); state.zoom = 1; applyZoom(); renderOverlay(); }
  else if(e.key === 'F2' && state.selected && !state.artboardMode){
    // rename the selected element's layer inline, same as double-clicking
    // its name in the layers tree
    e.preventDefault();
    const row = Array.from(document.querySelectorAll('.layerRow')).find(function(r){ return r._el === state.selected; });
    const tagEl = row && row.querySelector('.tag');
    if(tagEl) renameLayer(state.selected, tagEl);
  }
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

