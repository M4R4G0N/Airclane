"use strict";

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
