// ---------- Fase 15 · numeric scrubbing ----------
// Figma-style: dragging an .iconField prefix (the little "W", "H", "X"…
// label) left/right decreases/increases the number, so common adjustments
// don't need typing. shift = ×10, alt = ×0.1. A drag without movement is
// treated as a click and just focuses the field for typing.
// Delegated from #propsPanel because the panel re-renders on every
// selection change — per-field listeners would not survive that.
(function initNumericScrub(){
  const panel = document.getElementById('propsPanel');
  if(!panel) return;

  panel.addEventListener('pointerdown', function(e){
    const prefix = e.target.closest('.iconFieldPrefix');
    if(!prefix) return;
    const input = prefix.parentElement.querySelector('input');
    if(!input || input.disabled) return;

    e.preventDefault();
    const startX = e.clientX;
    const startVal = parseFloat(input.value) || 0;
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    let moved = false;

    function onMove(ev){
      const step = ev.shiftKey ? 10 : (ev.altKey ? 0.1 : 1);
      const raw = startVal + Math.round((ev.clientX - startX) / 4) * step;
      const val = Math.max(min, Math.round(raw * 10) / 10);
      if(String(val) !== input.value){
        moved = true;
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    function onUp(){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if(moved) input.dispatchEvent(new Event('change', { bubbles: true }));
      else { input.focus(); input.select(); }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
})();
