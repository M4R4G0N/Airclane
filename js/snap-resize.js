"use strict";

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

  // Shrinking fast pulls the cursor over the iframe mid-drag — without the
  // catcher covering it, the iframe swallows mousemove/mouseup and the drag
  // "drops" (and feels laggy, because events only arrive when the cursor
  // happens to be off the frame). Cover it and listen on both worlds, like
  // every other drag in the editor does.
  catchPointer(getComputedStyle(e.target).cursor);

  function onMove(cx, cy){
    const dx = (cx - startX) / scale, dy = (cy - startY) / scale;
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
    releasePointer();
    renderArtboardProps(ab);
  }
  bindDragListeners(ab.dom.frame.contentDocument, ab.dom.frame, scale, onMove, onUp);
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

