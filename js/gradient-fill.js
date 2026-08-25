// ---------- Fase 15 · Lote 3: gradient fills ----------
// Figma-style fill types for an element's background: solid / linear /
// radial. The gradient lives in style.backgroundImage as a real CSS
// linear-gradient()/radial-gradient() — no proprietary metadata, so it
// exports for free with the document and round-trips through re-import.

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
    if(sm) g.stops.push({ color: sm[1], pos: parseFloat(sm[2]) });
    else g.stops.push({ color: parts[i].trim(), pos: g.stops.length ? 100 : 0 });
  }
  return g.stops.length >= 2 ? g : null;
}

function buildGradientCss(g){
  const stops = g.stops.map(function(s){ return s.color + ' ' + s.pos + '%'; }).join(', ');
  return g.type === 'radial'
    ? 'radial-gradient(circle, ' + stops + ')'
    : 'linear-gradient(' + g.angle + 'deg, ' + stops + ')';
}

// starting point when an element without a gradient gets one: from its
// current background color into the editor's accent, so the control reads
// as "your color, becoming a gradient" instead of two random colors.
function defaultGradient(type, el){
  const cs = getComputedStyle(el);
  const solid = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'
    ? cs.backgroundColor : '#6d8bff';
  return { type: type, angle: 90, stops: [ { color: solid, pos: 0 }, { color: '#35d0a4', pos: 100 } ] };
}

function gradientStopRowHTML(stop, i){
  return '<div class="gradientStop">' +
    colorSwatchHTML('pGStop' + i, stop.color) +
    '<input type="number" min="0" max="100" value="' + stop.pos + '" title="Posição da cor no gradiente (%)">' +
    '<span class="gradientStopPct">%</span>' +
    '<button type="button" class="miniBtn gradientStopRemove" title="Remover esta cor">×</button>' +
  '</div>';
}

function gradientFillHTML(el){
  const g = parseGradientCss(el.style.backgroundImage);
  const type = g ? g.type : 'solid';
  const draft = g || defaultGradient('linear', el);
  let html = '<div class="field"><label>Tipo de fundo</label><select id="pFillType">' +
    '<option value="solid"' + (type === 'solid' ? ' selected' : '') + '>Sólido</option>' +
    '<option value="linear"' + (type === 'linear' ? ' selected' : '') + '>Linear</option>' +
    '<option value="radial"' + (type === 'radial' ? ' selected' : '') + '>Radial</option>' +
  '</select></div>';
  html += '<div id="pGradientEditor" class="' + (type === 'solid' ? 'is-hidden' : '') + '">' +
    '<div id="pGradientPreview" class="gradientPreview"></div>' +
    (type === 'linear' ? '<div class="field">' + iconFieldHTML('∠', 'pGradientAngle', draft.angle, 'Ângulo do gradiente (graus)') + '</div>' : '') +
    '<div id="pGradientStops">' + draft.stops.map(gradientStopRowHTML).join('') + '</div>' +
    '<button type="button" id="pGradientAddStop" class="miniBtn">+ Adicionar cor</button>' +
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
      pos: Math.max(0, Math.min(100, parseFloat(row.querySelector('input').value) || 0))
    });
  });
  return { type: typeSel.value, angle: angleEl ? (parseFloat(angleEl.value) || 90) : 90, stops: stops };
}

function updateGradientPreview(g){
  const preview = document.getElementById('pGradientPreview');
  if(preview) preview.style.background = buildGradientCss(g);
}

function applyGradientDraft(){
  const g = readGradientDraft();
  if(g.stops.length < 2) return;
  effectiveSelection().forEach(function(t){
    t.style.backgroundColor = '';
    t.style.backgroundImage = buildGradientCss(g);
  });
  updateGradientPreview(g);
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

  const preview = document.getElementById('pGradientPreview');
  if(!preview) return; // solid fill — no editor to wire
  updateGradientPreview(readGradientDraft());

  const angleEl = document.getElementById('pGradientAngle');
  if(angleEl) angleEl.addEventListener('input', applyGradientDraft);

  document.querySelectorAll('#pGradientStops .gradientStop').forEach(function(row){
    const swatch = row.querySelector('.colorSwatchBtn');
    swatch.addEventListener('click', function(e){
      e.stopPropagation();
      openColorPopover(swatch, swatch.dataset.color, function(rgba){
        swatch.dataset.color = rgba;
        swatch.querySelector('span').style.background = rgba;
        applyGradientDraft();
      });
    });
    row.querySelector('input').addEventListener('input', applyGradientDraft);
    row.querySelector('.gradientStopRemove').addEventListener('click', function(){
      if(document.querySelectorAll('#pGradientStops .gradientStop').length <= 2) return;
      row.remove();
      applyGradientDraft();
      pushHistory(); syncCodeFromCanvas();
    });
  });

  document.getElementById('pGradientAddStop').addEventListener('click', function(){
    const g = readGradientDraft();
    const last = g.stops[g.stops.length - 1];
    g.stops.push({ color: last ? last.color : '#ffffff', pos: 100 });
    g.stops.forEach(function(s, i){ s.pos = Math.round(i * 100 / (g.stops.length - 1)); });
    el.style.backgroundColor = '';
    el.style.backgroundImage = buildGradientCss(g);
    pushHistory(); syncCodeFromCanvas();
    renderProps();
  });
}
