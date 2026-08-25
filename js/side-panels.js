"use strict";

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

