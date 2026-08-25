"use strict";

// ---------- color swatch + rgba popover ----------
// <input type="color"> can't represent alpha at all, so overlays/shadows/
// glass panels (rgba backgrounds) couldn't be set from the properties
// panel — this swatch+popover pair fixes that: a native picker for hue/RGB,
// a slider for alpha, and a text field that accepts rgba()/hex directly.

function parseColorParts(str){
  str = (str || '').trim();
  if(!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if(str[0] === '#'){
    let hex = str.slice(1);
    if(hex.length === 3) hex = hex.split('').map(function(c){ return c + c; }).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: a };
  }
  const nums = (str.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
  return { r: nums[0] || 0, g: nums[1] || 0, b: nums[2] || 0, a: nums.length > 3 ? nums[3] : 1 };
}
function partsToRgba(p){
  return 'rgba(' + Math.round(p.r) + ', ' + Math.round(p.g) + ', ' + Math.round(p.b) + ', ' + (Math.round(p.a * 100) / 100) + ')';
}
function hexFromRgbParts(p){
  return '#' + [p.r, p.g, p.b].map(function(n){ return Math.round(n).toString(16).padStart(2, '0'); }).join('');
}
function rgbToHsv(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if(d !== 0){
    if(max === r) h = ((g - b) / d) % 6;
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if(h < 0) h += 360;
  }
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb(h, s, v){
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const table = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return { r: Math.round(table[0] * 255), g: Math.round(table[1] * 255), b: Math.round(table[2] * 255) };
}

function colorSwatchHTML(id, colorStr){
  return '<button type="button" class="colorSwatchBtn" id="' + id + '" data-color="' + (colorStr || '').replace(/"/g, '&quot;') + '"><span style="background:' + (colorStr || 'transparent') + '"></span></button>';
}

// Figma-style compact numeric field: a short letter/word chip fused to the
// input instead of a separate label row above it — same <input id=...>
// underneath, so every existing bindProp/bindLinkedBox/getElementById call
// keeps working untouched; only the surrounding markup changes.
function iconFieldHTML(prefix, id, value, title, extraAttrs){
  return '<div class="iconField" title="' + (title || '').replace(/"/g, '&quot;') + '">' +
    '<span class="iconFieldPrefix">' + prefix + '</span>' +
    '<input type="number" id="' + id + '" value="' + (value === undefined || value === null ? '' : value) + '"' + (extraAttrs || '') + '>' +
  '</div>';
}

let colorPopoverOnChange = null;
// current picker state in HSV — kept separate from RGB because dragging
// across the S/V square or hue bar needs h/s/v individually (a round-trip
// through RGB at every pixel of drag would lose hue at s=0 or v=0).
let cpHSV = { h: 0, s: 0, v: 0, a: 1 };
const CP_SWATCHES = [
  '#ffffff', '#000000', '#f3f4f7', '#8b90a0', '#e2e4e9', '#6d8bff', '#35d0a4', '#ff6d8b',
  '#ffb020', '#a06dff', '#25c2e3', '#ef5b5b', '#22c55e', '#0ea5e9', '#f59e0b', 'transparent'
];
function closeColorPopover(){
  document.getElementById('colorPopover').classList.remove('open');
  if(cpLastPicked) pushRecentColor(cpLastPicked);
  cpLastPicked = null;
  colorPopoverOnChange = null;
  stopColorPicking();
}

// eyedropper, scoped to the app's own canvas instead of the OS-level
// EyeDropper API (not available in every Chromium build) — reads whatever
// color is actually rendered at the clicked spot inside an artboard.
// Not true per-pixel sampling (a gradient or photo would read as one flat
// color): it walks up from the clicked element until it finds a non-
// transparent background, which covers the vast majority of UI mockups.
let colorPickingActive = false;
function startColorPicking(){
  colorPickingActive = true;
  document.getElementById('cpEyedrop').classList.add('active');
  artboards.forEach(function(ab){
    try { ab.dom.frame.contentDocument.documentElement.style.cursor = 'crosshair'; } catch(e){}
  });
}
function stopColorPicking(){
  colorPickingActive = false;
  const btn = document.getElementById('cpEyedrop');
  if(btn) btn.classList.remove('active');
  artboards.forEach(function(ab){
    try { ab.dom.frame.contentDocument.documentElement.style.cursor = ''; } catch(e){}
  });
  hideColorLoupe();
}
// no real per-pixel rendering (that'd mean an html2canvas-sized dependency
// just for this), so "hovering over a letter" is approximated: if the
// hit-tested element directly holds text, its ink color wins over any
// background — the whole point of pointing at a letter is the letter's
// color, not the box behind it. Only when there's no direct text does this
// fall back to walking up for the nearest solid background.
function hasDirectText(el){
  return Array.from(el.childNodes).some(function(n){ return n.nodeType === 3 && n.textContent.trim(); });
}
// Text has no natural raster either, but unlike a solid background it's
// mostly holes — inside an "o", between letters, around a comma. Picking
// the parent element's ink color for the whole box (the old approach) was
// wrong: it fired even when the cursor was over plain background next to a
// letter. So this does the same thing as pickColorFromImage — render just
// the character under the cursor onto an offscreen canvas with matching
// font metrics and sample the real pixel there. Alpha tells ink from gap.
function pickColorFromText(doc, clientX, clientY){
  try {
    if(!doc.caretRangeFromPoint) return null;
    const caret = doc.caretRangeFromPoint(clientX, clientY);
    if(!caret || caret.startContainer.nodeType !== 3) return null;
    const textNode = caret.startContainer;
    const data = textNode.data;
    let idx = caret.startOffset;
    if(idx >= data.length) idx = data.length - 1;
    if(idx < 0 || !data[idx] || !data[idx].trim()){
      idx = caret.startOffset - 1; // landed right after the glyph — try it
      if(idx < 0 || !data[idx] || !data[idx].trim()) return null;
    }
    const charRange = doc.createRange();
    charRange.setStart(textNode, idx);
    charRange.setEnd(textNode, idx + 1);
    const rect = charRange.getBoundingClientRect();
    if(rect.width <= 0 || rect.height <= 0) return null;
    if(clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const parentEl = textNode.parentElement;
    const cs = doc.defaultView.getComputedStyle(parentEl);
    const scale = 4; // supersample so antialiased edges don't get misread
    const w = Math.max(1, Math.ceil(rect.width)), h = Math.max(1, Math.ceil(rect.height));
    const canvas = doc.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cs.color;
    const m = ctx.measureText(data[idx]);
    const ascent = m.fontBoundingBoxAscent || (parseFloat(cs.fontSize) * 0.8);
    const descent = m.fontBoundingBoxDescent || (parseFloat(cs.fontSize) * 0.2);
    const baselineY = (h - (ascent + descent)) / 2 + ascent;
    ctx.fillText(data[idx], 0, baselineY);
    const px = Math.min(canvas.width - 1, Math.max(0, Math.round((clientX - rect.left) * scale)));
    const py = Math.min(canvas.height - 1, Math.max(0, Math.round((clientY - rect.top) * scale)));
    const d = ctx.getImageData(px, py, 1, 1).data;
    if(d[3] < 40) return null; // hit the transparent gap inside/around the glyph
    return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255) + ')';
  } catch(e){
    return null;
  }
}
function pickColorAt(doc, x, y){
  const target = doc.elementFromPoint(x, y);
  if(target && target.tagName === 'IMG'){
    const fromPixel = pickColorFromImage(target, x, y);
    if(fromPixel) return fromPixel;
    // fromPixel is null for a transparent pixel or a tainted (cross-origin,
    // non-data-URI) image — either way, fall through to the rest below.
  }
  if(target && hasDirectText(target)){
    const inkColor = pickColorFromText(doc, x, y);
    if(inkColor) return inkColor;
    // cursor is over this element's text box but landed on empty space
    // between/inside glyphs (or the browser lacks caretRangeFromPoint) —
    // fall through to the background walk below, same as any other spot.
  }
  let el = target;
  while(el){
    const bg = doc.defaultView.getComputedStyle(el).backgroundColor;
    if(parseColorParts(bg).a > 0) return bg;
    el = el.parentElement;
  }
  return 'rgb(255,255,255)';
}

// <img> has no background-color to walk up to — its content IS the pixels
// — so this reads the real pixel via an offscreen canvas at the image's
// natural resolution, accounting for object-fit so the sampled point
// actually matches what's under the cursor.
function pickColorFromImage(img, clientX, clientY){
  try {
    if(!img.naturalWidth || !img.naturalHeight) return null;
    const r = img.getBoundingClientRect();
    if(r.width <= 0 || r.height <= 0) return null;
    const boxAR = r.width / r.height, imgAR = img.naturalWidth / img.naturalHeight;
    const fit = img.ownerDocument.defaultView.getComputedStyle(img).objectFit;
    let drawW = r.width, drawH = r.height, offX = 0, offY = 0;
    if(fit === 'contain' || fit === 'scale-down'){
      if(imgAR > boxAR){ drawH = r.width / imgAR; offY = (r.height - drawH) / 2; }
      else { drawW = r.height * imgAR; offX = (r.width - drawW) / 2; }
    } else if(fit === 'cover'){
      if(imgAR > boxAR){ drawW = r.height * imgAR; offX = (r.width - drawW) / 2; }
      else { drawH = r.width / imgAR; offY = (r.height - drawH) / 2; }
    }
    const relX = clientX - r.left - offX, relY = clientY - r.top - offY;
    if(relX < 0 || relY < 0 || relX > drawW || relY > drawH) return null; // letterboxed empty strip
    const nx = Math.min(img.naturalWidth - 1, Math.floor((relX / drawW) * img.naturalWidth));
    const ny = Math.min(img.naturalHeight - 1, Math.floor((relY / drawH) * img.naturalHeight));
    const canvas = img.ownerDocument.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(nx, ny, 1, 1).data;
    if(d[3] === 0) return null;
    return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255) + ')';
  } catch(e){
    // canvas tainted by a cross-origin, non-data-URI <img src> — nothing
    // to do but fall back to the ancestor-background walk.
    return null;
  }
}
// maps a point in an artboard's own (unscaled) document coordinates to the
// parent page's viewport — the artboard row can be zoomed via CSS
// transform, so this goes through the fraction of the iframe's on-screen
// rect rather than assuming any particular scale factor.
function artboardPointToPage(ab, x, y){
  const doc = ab.dom.frame.contentDocument;
  const iw = (doc && doc.documentElement.clientWidth) || ab.dom.frame.clientWidth || 1;
  const ih = (doc && doc.documentElement.clientHeight) || ab.dom.frame.clientHeight || 1;
  const r = ab.dom.frame.getBoundingClientRect();
  return { x: r.left + (x / iw) * r.width, y: r.top + (y / ih) * r.height };
}
function showColorLoupe(pageX, pageY, colorStr){
  const loupe = document.getElementById('cpLoupe');
  loupe.style.left = (pageX + 18) + 'px';
  loupe.style.top = (pageY + 18) + 'px';
  loupe.style.display = 'flex';
  document.getElementById('cpLoupeSwatch').style.background = colorStr;
  document.getElementById('cpLoupeHex').textContent = hexFromRgbParts(parseColorParts(colorStr));
}
function hideColorLoupe(){
  document.getElementById('cpLoupe').style.display = 'none';
}
function currentCpRgba(){
  const rgb = hsvToRgb(cpHSV.h, cpHSV.s, cpHSV.v);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: cpHSV.a };
}
// pushes cpHSV out to every piece of UI that reflects it, then to whoever
// asked to be notified of the color (the swatch button that opened this).
function renderColorPopover(fireChange){
  const hueRgb = hsvToRgb(cpHSV.h, 1, 1);
  document.getElementById('cpSV').style.backgroundColor = 'rgb(' + hueRgb.r + ',' + hueRgb.g + ',' + hueRgb.b + ')';
  const svThumb = document.getElementById('cpSVThumb');
  svThumb.style.left = (cpHSV.s * 100) + '%';
  svThumb.style.top = ((1 - cpHSV.v) * 100) + '%';
  document.getElementById('cpHueThumb').style.left = (cpHSV.h / 360 * 100) + '%';
  document.getElementById('cpAlphaThumb').style.left = (cpHSV.a * 100) + '%';
  const p = currentCpRgba();
  document.getElementById('cpAlphaSlider').querySelector('.cpAlphaBg').style.background =
    'linear-gradient(to right, rgba(' + p.r + ',' + p.g + ',' + p.b + ',0), rgb(' + p.r + ',' + p.g + ',' + p.b + '))';
  const rgba = partsToRgba(p);
  document.getElementById('cpPreview').style.setProperty('--cp-preview', rgba);
  document.getElementById('cpText').value = p.a >= 1 ? hexFromRgbParts(p) : rgba;
  if(fireChange && colorPopoverOnChange){
    cpLastPicked = rgba;
    colorPopoverOnChange(rgba);
  }
}
// the swatch row shows the colors the user actually picked lately
// (localStorage), then fills the rest of the row from the base palette —
// so the palette becomes "yours" the more you use it.
function getRecentColors(){
  try { return JSON.parse(localStorage.getItem('ae_recent_colors') || '[]'); } catch(e){ return []; }
}
function pushRecentColor(c){
  if(!c || c === 'transparent') return;
  const list = getRecentColors().filter(function(x){ return x !== c; });
  list.unshift(c);
  localStorage.setItem('ae_recent_colors', JSON.stringify(list.slice(0, 16)));
}
function renderCpSwatches(container){
  const recents = getRecentColors();
  const all = recents.concat(CP_SWATCHES.filter(function(c){ return recents.indexOf(c) === -1; })).slice(0, 16);
  container.innerHTML = all.map(function(c){
    const bg = c === 'transparent' ? 'linear-gradient(45deg, transparent 45%, #f55 45%, #f55 55%, transparent 55%)' : c;
    return '<button type="button" class="cpSwatch" data-color="' + c + '" style="background:' + bg + '"></button>';
  }).join('');
}
// last value actually applied — pushed to recents only when the popover
// closes, so dragging around the picker doesn't flood the list
let cpLastPicked = null;

function openColorPopover(swatchBtn, currentColor, onChange){
  const pop = document.getElementById('colorPopover');
  const parts = parseColorParts(currentColor);
  const hsv = rgbToHsv(parts.r, parts.g, parts.b);
  cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
  cpLastPicked = null;
  renderColorPopover(false);
  const cpSwatchesEl = document.getElementById('cpSwatches');
  renderCpSwatches(cpSwatchesEl);
  if(!cpSwatchesEl.dataset.bound){
    cpSwatchesEl.dataset.bound = '1';
    cpSwatchesEl.addEventListener('click', function(e){
      const btn = e.target.closest('.cpSwatch');
      if(!btn) return;
      const parts2 = parseColorParts(btn.dataset.color);
      const hsv2 = rgbToHsv(parts2.r, parts2.g, parts2.b);
      cpHSV = { h: hsv2.h, s: hsv2.s, v: hsv2.v, a: parts2.a };
      renderColorPopover(true);
    });
  }
  const r = swatchBtn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 246)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  pop.classList.add('open');
  colorPopoverOnChange = onChange;
}
// applies fn(value, targetEl) to every selected element when the popover's
// color changes (bulk-edit for multi-selection, same as the other props).
function bindColorSwatch(id, fn){
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    openColorPopover(btn, btn.dataset.color, function(rgba){
      btn.dataset.color = rgba;
      btn.querySelector('span').style.background = rgba;
      effectiveSelection().forEach(function(target){ fn(rgba, target); });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  });
}
// standalone version for color pickers that aren't tied to the canvas
// selection at all (artboard background, pattern color, CSS class/variable
// editors) — just reports the picked color back, no effectiveSelection().
function bindColorSwatchSimple(id, fn){
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    openColorPopover(btn, btn.dataset.color, function(rgba){
      btn.dataset.color = rgba;
      btn.querySelector('span').style.background = rgba;
      fn(rgba);
    });
  });
}

