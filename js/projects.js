"use strict";

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

