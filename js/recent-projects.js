"use strict";

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

