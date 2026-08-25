"use strict";

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

