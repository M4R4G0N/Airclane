// ---------- Fase 15 · Lote 5: canvas minimap ----------
// Bird's-eye view of every artboard plus the visible-region rectangle.
// Click or drag inside it to scroll the canvas there. Refreshes on a light
// interval instead of hooking every artboard mutation — a few absolutely
// positioned divs are cheap, and the map can never go stale this way.
(function initMinimap(){
  const wrap = document.getElementById('canvasWrap');
  const map = document.getElementById('minimap');
  const chip = document.getElementById('minimapChip');
  if(!wrap || !map || !chip) return;
  const inner = map.querySelector('.minimapInner');
  const viewport = document.createElement('div');
  viewport.className = 'minimapViewport';
  inner.appendChild(viewport);
  const rects = {}; // artboard id -> div, reused between refreshes

  function contentBounds(){
    let maxX = 0, maxY = 0;
    artboards.forEach(function(a){
      maxX = Math.max(maxX, a.x + a.w);
      maxY = Math.max(maxY, a.y + a.h);
    });
    return { w: Math.max(maxX + 300, 900), h: Math.max(maxY + 300, 650) };
  }

  function renderMinimap(){
    if(map.classList.contains('is-hidden')) return;
    const b = contentBounds();
    const s = Math.min(inner.clientWidth / b.w, inner.clientHeight / b.h);
    const seen = {};
    artboards.forEach(function(a){
      seen[a.id] = true;
      let r = rects[a.id];
      if(!r){
        r = document.createElement('div');
        r.className = 'minimapArtboard';
        rects[a.id] = r;
        inner.insertBefore(r, viewport);
      }
      r.style.left = (a.x * s) + 'px';
      r.style.top = (a.y * s) + 'px';
      r.style.width = Math.max(3, a.w * s) + 'px';
      r.style.height = Math.max(3, a.h * s) + 'px';
      r.classList.toggle('active', a.id === state.activeId);
    });
    Object.keys(rects).forEach(function(id){
      if(!seen[id]){ rects[id].remove(); delete rects[id]; }
    });
    const z = state.zoom || 1;
    viewport.style.left = (wrap.scrollLeft / z * s) + 'px';
    viewport.style.top = (wrap.scrollTop / z * s) + 'px';
    viewport.style.width = (wrap.clientWidth / z * s) + 'px';
    viewport.style.height = (wrap.clientHeight / z * s) + 'px';
  }

  // canvas coordinates of a pointer event over the map, for navigation
  function eventToCanvas(ev){
    const b = contentBounds();
    const s = Math.min(inner.clientWidth / b.w, inner.clientHeight / b.h);
    const r = inner.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s };
  }

  function navigateTo(ev){
    const p = eventToCanvas(ev);
    const z = state.zoom || 1;
    wrap.scrollLeft = p.x * z - wrap.clientWidth / 2;
    wrap.scrollTop = p.y * z - wrap.clientHeight / 2;
    renderMinimap();
  }

  inner.addEventListener('pointerdown', function(e){
    e.preventDefault();
    navigateTo(e);
    function onMove(ev){ navigateTo(ev); }
    function onUp(){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  document.getElementById('minimapToggle').addEventListener('click', function(){
    map.classList.add('is-hidden');
    chip.classList.remove('is-hidden');
  });
  chip.addEventListener('click', function(){
    map.classList.remove('is-hidden');
    chip.classList.add('is-hidden');
    renderMinimap();
  });

  wrap.addEventListener('scroll', renderMinimap, { passive: true });
  setInterval(renderMinimap, 300);
  renderMinimap();
})();
