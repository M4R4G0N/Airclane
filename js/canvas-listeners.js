"use strict";

// ---------- canvas listeners (inside each artboard's iframe) ----------

function attachCanvasListeners(ab){
  let doc;
  try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return;

  // registered before the normal selection/drag handler below, on the same
  // capture phase, so it runs first and can swallow the click entirely
  // while the eyedropper is armed — normal editing resumes right after.
  doc.addEventListener('mousedown', function(e){
    if(!colorPickingActive) return;
    e.preventDefault(); e.stopPropagation();
    const picked = pickColorAt(doc, e.clientX, e.clientY);
    const parts = parseColorParts(picked);
    const hsv = rgbToHsv(parts.r, parts.g, parts.b);
    cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
    renderColorPopover(true);
    stopColorPicking();
  }, true);
  // hovering previews the color live — in the popover itself (SV square,
  // hue thumb, hex field) and in a little swatch+hex loupe next to the
  // cursor — without touching the actual element until the click lands.
  doc.addEventListener('mousemove', function(e){
    if(!colorPickingActive) return;
    const picked = pickColorAt(doc, e.clientX, e.clientY);
    const parts = parseColorParts(picked);
    const hsv = rgbToHsv(parts.r, parts.g, parts.b);
    cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
    renderColorPopover(false);
    const pt = artboardPointToPage(ab, e.clientX, e.clientY);
    showColorLoupe(pt.x, pt.y, picked);
  }, true);
  doc.addEventListener('mouseleave', function(){
    if(colorPickingActive) hideColorLoupe();
  }, true);

  doc.addEventListener('mousedown', function(e){
    setActiveArtboard(ab.id);
    if(!state.editMode) return;
    // right (and middle) click reach here too — without this guard, a
    // right-click was running the same selectElement()/startDrag() as a
    // real click, collapsing multi-selection and arming a drag before the
    // 'contextmenu' handler even runs, no matter what that handler does.
    if(e.button !== 0) return;
    let target = e.target;
    if(!isEditableEl(target, doc)){ if(!e.ctrlKey && !e.metaKey) selectArtboardOnly(ab.id); return; }
    if(target.closest('[data-ae-locked="1"]')) return;
    // already mid-edit (double-click turned this on) — let the click place
    // the caret/selection natively instead of hijacking it into a drag.
    // preventDefault() here was blocking every click-to-position-cursor
    // inside the text, leaving arrow keys as the only way to move within it.
    if(target.isContentEditable) return;
    e.preventDefault(); e.stopPropagation();
    if(state.stylePainter.active){ useStylePainter(target); return; }
    // Ctrl/Cmd+click toggles multi-selection membership instead of dragging.
    if(e.ctrlKey || e.metaKey){ toggleMultiSelect(target); return; }
    selectElement(target);
    // click, hold, and move to drag — no modifier key needed. A plain
    // click with no real movement never nudges anything: startDrag only
    // commits a move/reorder once the pointer crosses DRAG_THRESHOLD.
    startDrag(e, target);
  }, true);

  doc.addEventListener('click', function(e){
    if(!state.editMode){
      // Visualizar mode: a link or button set to "Navegar para artboard"
      // jumps the canvas to that artboard — this is how a click-through
      // flow (login button -> next screen) is actually testable.
      const a = e.target.closest && e.target.closest('a');
      const m = a && (a.getAttribute('href') || '').match(/^#ae-goto:(.+)$/);
      if(m){ e.preventDefault(); goToArtboard(m[1]); return; }
      // any element can carry an action now, not just <button> — FORM is
      // excluded here because its data-ae-goto is submit-triggered (below),
      // not click-triggered, even though a click inside the form bubbles
      // up to it.
      const actionEl = e.target.closest && e.target.closest('[data-ae-goto],[data-ae-toggle],[data-ae-settext],[data-ae-call]');
      if(actionEl && actionEl.tagName !== 'FORM' && (actionEl.getAttribute('data-ae-evt') || 'click') === 'click'){
        e.preventDefault();
        runElementAction(doc, actionEl);
      }
      return;
    }
    const a = e.target.closest && e.target.closest('a');
    if(a) e.preventDefault();
  }, true);

  // a <form> has no server to actually submit to — always stop the native
  // submit (which would otherwise try to reload the iframe), and in
  // Visualizar mode honor "Navegar para artboard" on the form itself, same
  // as a button/link with that action.
  doc.addEventListener('submit', function(e){
    e.preventDefault();
    if(state.editMode) return;
    const gotoId = e.target && e.target.getAttribute && e.target.getAttribute('data-ae-goto');
    if(gotoId) goToArtboard(gotoId);
  }, true);

  // mouseenter/mouseleave don't bubble, so delegation uses mouseover/mouseout
  // plus a relatedTarget containment check to emulate enter/leave without
  // re-firing on every child hovered inside the same target.
  doc.addEventListener('mouseover', function(e){
    if(state.editMode) return;
    const el = e.target.closest && e.target.closest('[data-ae-evt="hover"]');
    if(!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    runElementAction(doc, el);
  }, true);
  doc.addEventListener('mouseout', function(e){
    if(state.editMode) return;
    const el = e.target.closest && e.target.closest('[data-ae-evt="hoverout"]');
    if(!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    runElementAction(doc, el);
  }, true);

  // Ctrl+scroll/pinch-zoom over the rendered artboard fires inside this
  // iframe's own document — it never reaches canvasWrap's wheel listener
  // in the parent page, so without this the browser's native page zoom
  // takes over instead of the app's canvas zoom. Same fix pattern as the
  // cross-iframe drag capture issue: listen inside the iframe too.
  doc.addEventListener('wheel', onCanvasWheel, { passive: false });

  doc.addEventListener('dblclick', function(e){
    if(!state.editMode) return;
    const target = e.target;
    if(!isEditableEl(target, doc)) return;
    e.preventDefault(); e.stopPropagation();
    target.setAttribute('contenteditable', 'true');
    target.focus();
    activeEditDoc = doc; activeEditTarget = target; activeEditArtboard = ab;
    function onBlur(){
      target.removeAttribute('contenteditable');
      target.removeEventListener('blur', onBlur);
      activeEditDoc = null; activeEditTarget = null; activeEditArtboard = null;
      hideTextFormatBar();
      pushHistory(); syncCodeFromCanvas(); renderLayers();
    }
    target.addEventListener('blur', onBlur);
  }, true);
  // a text selection made while editing inline (above) shows a small
  // floating Bold/Italic/Underline/size toolbar next to it — this is what
  // notices the selection changing so the toolbar can appear/move/hide.
  doc.addEventListener('selectionchange', function(){ updateTextFormatBar(ab); });

  doc.addEventListener('contextmenu', function(e){
    if(!state.editMode) return;
    e.preventDefault(); e.stopPropagation();
    const scale = state.zoom;
    const iframeRect = ab.dom.frame.getBoundingClientRect();
    const px = iframeRect.left + e.clientX * scale, py = iframeRect.top + e.clientY * scale;
    const target = e.target;
    if(isEditableEl(target, doc)){
      setActiveArtboard(ab.id);
      // preserve an existing multi-selection if you right-click something
      // that's already part of it — only replace the selection outright
      // when right-clicking something new.
      if(state.selected !== target && !state.multiSelect.has(target)) selectElement(target);
      showContextMenu(px, py, elementContextMenuItems(target));
    } else {
      setActiveArtboard(ab.id);
      selectArtboardOnly(ab.id);
      showContextMenu(px, py, artboardContextMenuItems(ab));
    }
  }, true);

  // capture-phase on the iframe's own window catches a scroll fired on any
  // descendant (capturing runs top-down regardless of whether the event
  // itself bubbles, and 'scroll' doesn't) — this is the general case.
  doc.defaultView.addEventListener('scroll', updateOverlayLive, true);
  // belt-and-suspenders: also bind directly to every element that actually
  // scrolls internally (overflow auto/scroll with real overflow), so a
  // quirk in how a specific container dispatches its scroll event can't
  // silently drop the overlay out of sync with it.
  try {
    const cs = doc.defaultView.getComputedStyle;
    Array.from(doc.querySelectorAll('*')).forEach(function(node){
      const st = cs(node);
      const scrollsY = (st.overflowY === 'auto' || st.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
      const scrollsX = (st.overflowX === 'auto' || st.overflowX === 'scroll') && node.scrollWidth > node.clientWidth;
      if(scrollsY || scrollsX) node.addEventListener('scroll', updateOverlayLive, { passive: true });
    });
  } catch(e){}
  doc.addEventListener('keydown', function(e){ handleGlobalKeydown(e, doc); });

  // Ctrl+V with an image on the OS clipboard (a screenshot, "copy image"
  // from a browser, etc.) — the keydown-based element copy/paste above
  // can't see clipboard *contents*, only a real 'paste' event exposes
  // clipboardData, so this is handled separately.
  doc.addEventListener('paste', function(e){
    if(!state.editMode) return;
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    const imgItem = Array.from(items).find(function(it){ return it.type.indexOf('image/') === 0; });
    if(!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(){
      const img = doc.createElement('img');
      img.src = reader.result;
      img.style.cssText = 'max-width:400px; height:auto; display:block; margin:0 0 12px;';
      insertionContainer(doc).appendChild(img);
      selectElement(img);
      renderLayers();
      pushHistory(); syncCodeFromCanvas();
    };
    reader.readAsDataURL(file);
  });

  // an OS file drag can enter directly over this iframe before dropHint
  // (in the parent document) has had a chance to raise itself above it —
  // handle it here too so dropping right on an artboard always works.
  ['dragenter', 'dragover'].forEach(function(evt){
    doc.addEventListener(evt, function(e){ e.preventDefault(); dropHint.classList.add('show'); });
  });
  doc.addEventListener('dragleave', function(e){ e.preventDefault(); dropHint.classList.remove('show'); });
  doc.addEventListener('drop', function(e){
    e.preventDefault();
    dropHint.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if(file) importHTMLFile(file);
  });
}

