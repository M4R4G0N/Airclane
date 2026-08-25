// ---------- Fase 15 · Lote 3: gradient fills ----------
// Figma-style fill types for an element's background: solid / linear /
// radial. The gradient lives in style.backgroundImage as a real CSS
// linear-gradient()/radial-gradient() — no proprietary metadata, so it
// exports for free with the document and round-trips through re-import.
// UI: an interactive gradient bar (drag handles to move stops, click the
// bar to add one) over a stops list with position / hex / opacity per stop.

// split a CSS function's argument list on top-level commas only (colors
// like rgba(0,0,0,.5) contain commas of their own).
function splitTopLevelArgs(s){
  const out = [];
  let depth = 0, cur = '';
  for(const ch of s){
    if(ch === '(') depth++;
    else if(ch === ')') depth--;
    if(ch === ',' && depth === 0){ out.push(cur); cur = ''; }
    else cur += ch;
  }
  if(cur.trim()) out.push(cur);
  return out;
}

// resolve any CSS color to {r,g,b,a} through a probe element — the browser
// does the parsing (named colors, hsl, rgb...) so we don't have to.
function parseColorToRgba(c){
  const probe = document.createElement('div');
  probe.style.color = (c || '').trim();
  if(!probe.style.color) return null;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe).color;
  probe.remove();
  const m = cs.match(/rgba?\(([^)]+)\)/);
  if(!m) return null;
  const p = m[1].split(',').map(function(s){ return parseFloat(s); });
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

function rgbaToHex(o){
  return '#' + [o.r, o.g, o.b].map(function(v){
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  }).join('');
}

function hexToRgb(hex){
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return null;
  let h = m[1];
  if(h.length === 3) h = h.split('').map(function(c){ return c + c; }).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// a stop keeps color (hex) and opacity (0-100) apart so each gets its own
// input in the UI; they only merge into rgba() when building CSS.
function stopCssColor(stop){
  if(stop.opacity >= 100) return stop.color;
  const rgb = hexToRgb(stop.color);
  if(!rgb) return stop.color; // unparseable color kept raw — opacity can't apply
  const a = Math.round(stop.opacity) / 100;
  return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + a + ')';
}

function cssColorToStop(colorStr, pos){
  const rgba = parseColorToRgba(colorStr);
  if(!rgba) return { color: colorStr, opacity: 100, pos: pos };
  return { color: rgbaToHex(rgba), opacity: Math.round(rgba.a * 100), pos: pos };
}

function parseGradientCss(bg){
  const m = (bg || '').match(/^\s*(linear|radial)-gradient\((.*)\)\s*$/);
  if(!m) return null;
  const parts = splitTopLevelArgs(m[2]);
  const g = { type: m[1], angle: 90, stops: [] };
  let start = 0;
  // a first argument without a % position is a directive: "<angle>deg" for
  // linear, "circle at …" for radial — not a color stop.
  if(parts.length && parts[0].indexOf('%') === -1){
    const am = parts[0].trim().match(/^(-?\d+(?:\.\d+)?)deg$/);
    if(am) g.angle = parseFloat(am[1]);
    start = 1;
  }
  for(let i = start; i < parts.length; i++){
    const sm = parts[i].trim().match(/^(.*?)\s+(-?\d+(?:\.\d+)?)%$/);
    if(sm) g.stops.push(cssColorToStop(sm[1], parseFloat(sm[2])));
    else g.stops.push(cssColorToStop(parts[i].trim(), g.stops.length ? 100 : 0));
  }
  return g.stops.length >= 2 ? g : null;
}

function buildGradientCss(g){
  const stops = g.stops.map(function(s){ return stopCssColor(s) + ' ' + s.pos + '%'; }).join(', ');
  return g.type === 'radial'
    ? 'radial-gradient(circle, ' + stops + ')'
    : 'linear-gradient(' + g.angle + 'deg, ' + stops + ')';
}

// starting point when an element without a gradient gets one: from its
// current background color into the editor's accent, so the control reads
// as "your color, becoming a gradient" instead of two random colors.
function defaultGradient(type, el){
  const rgba = parseColorToRgba(getComputedStyle(el).backgroundColor);
  const solid = rgba && rgba.a > 0 ? rgbaToHex(rgba) : '#6d8bff';
  return { type: type, angle: 90, stops: [ { color: solid, opacity: 100, pos: 0 }, { color: '#35d0a4', opacity: 100, pos: 100 } ] };
}

// interpolate the gradient's color at an arbitrary position — used when the
// user clicks the bar to drop a new stop, so it starts as the color already
// under the cursor instead of a jarring default.
function gradientStopAt(g, pos){
  const stops = g.stops.slice().sort(function(a, b){ return a.pos - b.pos; });
  const at = function(s){ return { color: s.color, opacity: s.opacity, pos: pos }; };
  if(pos <= stops[0].pos) return at(stops[0]);
  if(pos >= stops[stops.length - 1].pos) return at(stops[stops.length - 1]);
  for(let i = 0; i < stops.length - 1; i++){
    const s1 = stops[i], s2 = stops[i + 1];
    if(pos < s1.pos || pos > s2.pos) continue;
    const t = (pos - s1.pos) / (s2.pos - s1.pos || 1);
    const c1 = hexToRgb(s1.color), c2 = hexToRgb(s2.color);
    if(!c1 || !c2) return at(t < 0.5 ? s1 : s2);
    return {
      color: rgbaToHex({ r: c1.r + (c2.r - c1.r) * t, g: c1.g + (c2.g - c1.g) * t, b: c1.b + (c2.b - c1.b) * t }),
      opacity: Math.round(s1.opacity + (s2.opacity - s1.opacity) * t),
      pos: pos
    };
  }
  return at(stops[0]);
}

// ---------- UI ----------

function gradientStopRowHTML(stop, i){
  return '<div class="gradientStop" data-i="' + i + '">' +
    '<input type="number" class="gradientPosInput" min="0" max="100" value="' + stop.pos + '" title="Posição da cor no gradiente (%)">' +
    colorSwatchHTML('pGStop' + i, stop.color) +
    '<input type="text" class="gradientHexInput" value="' + stop.color.replace(/"/g, '&quot;') + '" spellcheck="false" title="Cor em hexadecimal">' +
    '<input type="number" class="gradientOpacityInput" min="0" max="100" value="' + stop.opacity + '" title="Opacidade (%)">' +
    '<button type="button" class="miniBtn gradientStopRemove" title="Remover esta cor">×</button>' +
  '</div>';
}

function gradientFillHTML(el){
  const g = parseGradientCss(el.style.backgroundImage);
  const type = g ? g.type : 'solid';
  const draft = g || defaultGradient('linear', el);
  // rotate only makes sense for linear; flip (mirror stops) works for both
  const shapeBtns = type === 'solid' ? '' :
    (type === 'linear' ? '<button type="button" id="pGradientRotate" class="miniBtn" title="Girar 90°"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-1.2-7.4L23 10"/></svg></button>' : '') +
    '<button type="button" id="pGradientFlip" class="miniBtn" title="Inverter direção"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>';
  let html = '<div class="field"><label>Tipo de fundo</label><select id="pFillType">' +
    '<option value="solid"' + (type === 'solid' ? ' selected' : '') + '>Sólido</option>' +
    '<option value="linear"' + (type === 'linear' ? ' selected' : '') + '>Linear</option>' +
    '<option value="radial"' + (type === 'radial' ? ' selected' : '') + '>Radial</option>' +
    '</select>' + shapeBtns + '</div>';
  if(type === 'solid') return html;
  html += '<div id="pGradientEditor">' +
    '<div id="pGradientBar" class="gradientBar" title="Arraste as cores ou clique para adicionar"><div class="gradientBarFill"></div>' +
      draft.stops.map(function(s, i){ return '<div class="gradientHandle" data-i="' + i + '"></div>'; }).join('') +
    '</div>' +
    (type === 'linear' ? '<div class="field">' + iconFieldHTML('∠', 'pGradientAngle', draft.angle, 'Ângulo do gradiente (graus)') + '</div>' : '') +
    '<div class="gradientStopsHead"><span>Stops</span><button type="button" id="pGradientAddStop" class="miniBtn" title="Adicionar cor">+</button></div>' +
    '<div id="pGradientStops">' + draft.stops.map(gradientStopRowHTML).join('') + '</div>' +
  '</div>';
  return html;
}

function readGradientDraft(){
  const typeSel = document.getElementById('pFillType');
  const angleEl = document.getElementById('pGradientAngle');
  const stops = [];
  document.querySelectorAll('#pGradientStops .gradientStop').forEach(function(row){
    stops.push({
      color: row.querySelector('.colorSwatchBtn').dataset.color,
      opacity: Math.max(0, Math.min(100, parseFloat(row.querySelector('.gradientOpacityInput').value) || 0)),
      pos: Math.max(0, Math.min(100, parseFloat(row.querySelector('.gradientPosInput').value) || 0))
    });
  });
  return { type: typeSel.value, angle: angleEl ? (parseFloat(angleEl.value) || 90) : 90, stops: stops };
}

// the bar always renders stops as a horizontal strip (even for radial) —
// it represents the color ramp, not the gradient's shape on the element.
function syncGradientBar(g){
  const bar = document.getElementById('pGradientBar');
  if(!bar) return;
  const ramp = 'linear-gradient(90deg, ' + g.stops.map(function(s){ return stopCssColor(s) + ' ' + s.pos + '%'; }).join(', ') + ')';
  bar.querySelector('.gradientBarFill').style.background = ramp;
  bar.querySelectorAll('.gradientHandle').forEach(function(h){
    const s = g.stops[+h.dataset.i];
    if(!s) return;
    h.style.left = s.pos + '%';
    h.style.background = stopCssColor(s);
  });
}

function selectGradientStop(i){
  document.querySelectorAll('#pGradientBar .gradientHandle, #pGradientStops .gradientStop').forEach(function(n){
    n.classList.toggle('active', +n.dataset.i === i);
  });
}

function applyGradientDraft(){
  const g = readGradientDraft();
  if(g.stops.length < 2) return;
  const css = buildGradientCss(g);
  effectiveSelection().forEach(function(t){
    t.style.backgroundColor = '';
    t.style.backgroundImage = css;
  });
  syncGradientBar(g);
  updateOverlayLive();
  clearTimeout(codeDebounce);
  codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
}

function bindGradientFill(el){
  const typeSel = document.getElementById('pFillType');
  if(!typeSel) return;

  typeSel.addEventListener('change', function(){
    const existing = parseGradientCss(el.style.backgroundImage);
    if(typeSel.value === 'solid'){
      // keep the gradient's first color as the new solid fill instead of
      // dropping the user onto a transparent background
      const c = existing ? existing.stops[0].color : '';
      effectiveSelection().forEach(function(t){
        t.style.backgroundImage = '';
        if(c) t.style.backgroundColor = c;
      });
    } else {
      const g = existing || defaultGradient(typeSel.value, el);
      g.type = typeSel.value; // keep the user's stops, just change the shape
      const css = buildGradientCss(g);
      effectiveSelection().forEach(function(t){
        t.style.backgroundColor = '';
        t.style.backgroundImage = css;
      });
    }
    pushHistory(); syncCodeFromCanvas();
    renderProps();
  });

  const bar = document.getElementById('pGradientBar');
  if(!bar) return; // solid fill — no editor to wire
  syncGradientBar(readGradientDraft());

  const angleEl = document.getElementById('pGradientAngle');
  if(angleEl) angleEl.addEventListener('input', applyGradientDraft);

  const rotateBtn = document.getElementById('pGradientRotate');
  if(rotateBtn) rotateBtn.addEventListener('click', function(){
    angleEl.value = ((parseFloat(angleEl.value) || 0) + 90) % 360;
    applyGradientDraft();
  });

  const flipBtn = document.getElementById('pGradientFlip');
  if(flipBtn) flipBtn.addEventListener('click', function(){
    document.querySelectorAll('#pGradientStops .gradientPosInput').forEach(function(inp){
      inp.value = 100 - (parseFloat(inp.value) || 0);
    });
    applyGradientDraft();
    pushHistory(); syncCodeFromCanvas();
    renderProps();
  });

  // gradient bar: drag a handle to move its stop, click empty bar to drop a
  // new stop right where the cursor is (with the interpolated color).
  bar.addEventListener('mousedown', function(e){
    const handle = e.target.closest('.gradientHandle');
    const rect = bar.getBoundingClientRect();
    const posAt = function(ev){
      return Math.round(Math.max(0, Math.min(100, (ev.clientX - rect.left) / rect.width * 100)));
    };
    if(handle){
      e.preventDefault();
      const i = +handle.dataset.i;
      selectGradientStop(i);
      const posInput = document.querySelectorAll('#pGradientStops .gradientStop')[i].querySelector('.gradientPosInput');
      const move = function(ev){
        posInput.value = posAt(ev);
        applyGradientDraft();
      };
      const up = function(){
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        pushHistory(); syncCodeFromCanvas();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    } else {
      const g = readGradientDraft();
      g.stops.push(gradientStopAt(g, posAt(e)));
      const css = buildGradientCss(g);
      effectiveSelection().forEach(function(t){
        t.style.backgroundColor = '';
        t.style.backgroundImage = css;
      });
      pushHistory(); syncCodeFromCanvas();
      renderProps();
      selectGradientStop(g.stops.length - 1);
    }
  });

  document.querySelectorAll('#pGradientStops .gradientStop').forEach(function(row){
    const i = +row.dataset.i;
    const swatch = row.querySelector('.colorSwatchBtn');
    const hexInput = row.querySelector('.gradientHexInput');
    const posInput = row.querySelector('.gradientPosInput');
    const opInput = row.querySelector('.gradientOpacityInput');

    row.addEventListener('mousedown', function(){ selectGradientStop(i); });

    swatch.addEventListener('click', function(e){
      e.stopPropagation();
      const g = readGradientDraft();
      openColorPopover(swatch, stopCssColor(g.stops[i]), function(rgbaStr){
        const stop = cssColorToStop(rgbaStr, 0);
        swatch.dataset.color = stop.color;
        swatch.querySelector('span').style.background = stop.color;
        hexInput.value = stop.color;
        opInput.value = stop.opacity;
        applyGradientDraft();
      });
    });

    hexInput.addEventListener('change', function(){
      let v = hexInput.value.trim();
      if(v && v[0] !== '#') v = '#' + v;
      const rgba = parseColorToRgba(v);
      if(rgba){
        swatch.dataset.color = rgbaToHex(rgba);
        swatch.querySelector('span').style.background = rgbaToHex(rgba);
        hexInput.value = rgbaToHex(rgba);
        opInput.value = Math.round(rgba.a * 100);
        applyGradientDraft();
      } else {
        hexInput.value = swatch.dataset.color; // invalid color — revert
      }
    });

    posInput.addEventListener('input', applyGradientDraft);
    opInput.addEventListener('input', applyGradientDraft);

    row.querySelector('.gradientStopRemove').addEventListener('click', function(){
      if(document.querySelectorAll('#pGradientStops .gradientStop').length <= 2) return;
      row.remove();
      applyGradientDraft();
      pushHistory(); syncCodeFromCanvas();
      renderProps();
    });
  });

  document.getElementById('pGradientAddStop').addEventListener('click', function(){
    const g = readGradientDraft();
    // drop the new stop in the middle of the widest gap so it lands where
    // the ramp is least defined, not always at the end
    const sorted = g.stops.slice().sort(function(a, b){ return a.pos - b.pos; });
    let gapPos = 50, gapSize = -1;
    for(let i = 0; i < sorted.length - 1; i++){
      if(sorted[i + 1].pos - sorted[i].pos > gapSize){
        gapSize = sorted[i + 1].pos - sorted[i].pos;
        gapPos = Math.round((sorted[i].pos + sorted[i + 1].pos) / 2);
      }
    }
    g.stops.push(gradientStopAt(g, gapPos));
    const css = buildGradientCss(g);
    effectiveSelection().forEach(function(t){
      t.style.backgroundColor = '';
      t.style.backgroundImage = css;
    });
    pushHistory(); syncCodeFromCanvas();
    renderProps();
    selectGradientStop(g.stops.length - 1);
  });
}
