// ---------- Fase 15 · Lote 4: Pages / Layers side tabs ----------
// Figma-style: the left panel switches between "Páginas" (the artboard
// list — switch, create, rename, duplicate, delete) and "Camadas" (the
// element tree of the active artboard, which is what the panel always was).

function renderPagesPanel(){
  const list = document.getElementById('pagesList');
  if(!list) return;
  list.innerHTML = '';
  artboards.forEach(function(ab){
    const row = document.createElement('div');
    row.className = 'pageRow' + (ab.id === state.activeId ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'pageRowName';
    name.textContent = ab.name;
    name.title = ab.name + ' — duplo clique pra renomear';

    const dims = document.createElement('span');
    dims.className = 'pageRowDims';
    dims.textContent = ab.w + '×' + ab.h;

    const actions = document.createElement('span');
    actions.className = 'pageRowActions';

    const btnDup = document.createElement('button');
    btnDup.type = 'button';
    btnDup.className = 'pageRowBtn';
    btnDup.textContent = '⧉';
    btnDup.title = 'Duplicar página';
    btnDup.addEventListener('click', function(e){
      e.stopPropagation();
      duplicateArtboard(ab);
    });

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'pageRowBtn';
    btnDel.textContent = '×';
    btnDel.title = 'Excluir página';
    btnDel.addEventListener('click', function(e){
      e.stopPropagation();
      deleteArtboard(ab);
      renderPagesPanel();
    });

    actions.appendChild(btnDup);
    actions.appendChild(btnDel);
    row.appendChild(name);
    row.appendChild(dims);
    row.appendChild(actions);

    row.addEventListener('click', function(){
      setActiveArtboard(ab.id);
      ab.dom.wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
    name.addEventListener('dblclick', function(e){
      e.stopPropagation();
      renameArtboard(ab);
      // renameArtboard swaps the title for an inline input that commits on
      // blur — the list row re-syncs once that commit lands (see the commit
      // hook inside renameArtboard).
    });

    list.appendChild(row);
  });
}

function setSideTab(tab){
  const isPages = tab === 'pages';
  document.getElementById('tabPages').classList.toggle('active', isPages);
  document.getElementById('tabLayers').classList.toggle('active', !isPages);
  document.getElementById('pagesView').classList.toggle('is-hidden', !isPages);
  document.getElementById('layersView').classList.toggle('is-hidden', isPages);
  if(isPages) renderPagesPanel();
}

document.getElementById('tabPages').addEventListener('click', function(){ setSideTab('pages'); });
document.getElementById('tabLayers').addEventListener('click', function(){ setSideTab('layers'); });
document.getElementById('btnNewPage').addEventListener('click', function(){
  document.getElementById('btnNew').click();
});
