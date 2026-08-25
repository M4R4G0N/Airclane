"use strict";

// ---------- add elements ----------

// new elements are appended in normal flow — inside the current selection
// if it can hold children, otherwise at the end of the active artboard's body.
function insertionContainer(doc){
  if(!state.artboardMode && state.selected && isEditableEl(state.selected, doc) && state.selected.tagName !== 'IMG') return state.selected;
  return doc.body;
}

// ---------- gráfico (canvas) ----------
// no external charting library — this draws straight into the canvas 2D
// context from a small JSON config (data-ae-chart), redone on every load
// since canvas pixels don't survive an outerHTML round-trip. The exported
// .html gets a copy of this same function inlined into a <script>.
function aeDrawChart(canvas){
  let cfg;
  try { cfg = JSON.parse(canvas.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
  const type = cfg.type || 'bar';
  const labels = cfg.labels || [];
  const values = (cfg.values || []).map(Number);
  const colors = cfg.colors && cfg.colors.length ? cfg.colors : ['#6d8bff', '#35d0a4', '#ff6d8b', '#ffb020', '#a06dff', '#25c2e3'];
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if(!values.length) return;
  const max = Math.max.apply(null, values.concat([0]));
  if(type === 'line'){
    const pad = 24, cw = w - pad * 2, ch = h - pad * 2;
    const stepX = values.length > 1 ? cw / (values.length - 1) : 0;
    ctx.strokeStyle = colors[0]; ctx.lineWidth = 2; ctx.beginPath();
    values.forEach(function(v, i){
      const x = pad + i * stepX, y = pad + ch - (max > 0 ? (v / max) * ch : 0);
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    values.forEach(function(v, i){
      const x = pad + i * stepX, y = pad + ch - (max > 0 ? (v / max) * ch : 0);
      ctx.fillStyle = colors[0]; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillText(labels[i] || '', x, h - 6);
    });
  } else if(type === 'pie'){
    const total = values.reduce(function(a, b){ return a + b; }, 0);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 20;
    let start = -Math.PI / 2;
    values.forEach(function(v, i){
      const slice = total > 0 ? (v / total) * Math.PI * 2 : 0;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + slice); ctx.closePath(); ctx.fill();
      start += slice;
    });
  } else {
    const pad = 24, cw = w - pad * 2, ch = h - pad * 2, gap = 12;
    const barW = (cw - gap * (values.length - 1)) / values.length;
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    values.forEach(function(v, i){
      const barH = max > 0 ? (v / max) * ch : 0;
      const x = pad + i * (barW + gap), y = pad + ch - barH;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = '#888'; ctx.fillText(labels[i] || '', x + barW / 2, h - 6);
    });
  }
}

// same function, as a string, for the exported .html's own <script> — kept
// beside aeDrawChart on purpose so a future edit to the drawing logic is
// easy to remember to make in both places.
const AE_DRAW_CHART_SRC = 'function aeDrawChart(c){var cfg;try{cfg=JSON.parse(c.getAttribute("data-ae-chart")||"{}");}catch(e){cfg={};}' +
  'var type=cfg.type||"bar",labels=cfg.labels||[],values=(cfg.values||[]).map(Number),' +
  'colors=cfg.colors&&cfg.colors.length?cfg.colors:["#6d8bff","#35d0a4","#ff6d8b","#ffb020","#a06dff","#25c2e3"];' +
  'var ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);if(!values.length)return;' +
  'var max=Math.max.apply(null,values.concat([0]));' +
  'if(type==="line"){var pad=24,cw=w-pad*2,ch=h-pad*2,stepX=values.length>1?cw/(values.length-1):0;' +
    'ctx.strokeStyle=colors[0];ctx.lineWidth=2;ctx.beginPath();' +
    'values.forEach(function(v,i){var x=pad+i*stepX,y=pad+ch-(max>0?(v/max)*ch:0);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});' +
    'ctx.stroke();ctx.font="11px sans-serif";ctx.textAlign="center";' +
    'values.forEach(function(v,i){var x=pad+i*stepX,y=pad+ch-(max>0?(v/max)*ch:0);' +
      'ctx.fillStyle=colors[0];ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();' +
      'ctx.fillStyle="#888";ctx.fillText(labels[i]||"",x,h-6);});' +
  '}else if(type==="pie"){var total=values.reduce(function(a,b){return a+b;},0),cx=w/2,cy=h/2,r=Math.min(w,h)/2-20,start=-Math.PI/2;' +
    'values.forEach(function(v,i){var slice=total>0?(v/total)*Math.PI*2:0;' +
      'ctx.fillStyle=colors[i%colors.length];ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,start+slice);ctx.closePath();ctx.fill();' +
      'start+=slice;});' +
  '}else{var pad2=24,cw2=w-pad2*2,ch2=h-pad2*2,gap=12,barW=(cw2-gap*(values.length-1))/values.length;' +
    'ctx.font="11px sans-serif";ctx.textAlign="center";' +
    'values.forEach(function(v,i){var barH=max>0?(v/max)*ch2:0,x=pad2+i*(barW+gap),y=pad2+ch2-barH;' +
      'ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,y,barW,barH);' +
      'ctx.fillStyle="#888";ctx.fillText(labels[i]||"",x+barW/2,h-6);});' +
  '}}';

function redrawAllCharts(doc){
  if(!doc) return;
  Array.from(doc.querySelectorAll('canvas[data-ae-chart]')).forEach(function(c){ aeDrawChart(c); });
}

const ELEMENT_TEMPLATES = {
  rect: { label: '▭ Container', build: function(doc){
    const el = doc.createElement('div');
    el.style.cssText = 'width:180px; height:100px; background:#6d8bff; border-radius:8px; margin:0 0 12px;';
    return el;
  } },
  richtext: { label: 'T Texto', build: function(doc){
    const el = doc.createElement('p');
    el.textContent = 'Parágrafo de texto de exemplo.';
    el.style.cssText = 'font-size:15px; color:#333; line-height:1.6; margin:0 0 12px; max-width:480px;';
    return el;
  } },
  br: { label: 'Quebra de linha (br)', build: function(doc){
    return doc.createElement('br');
  } },
  figure: { label: 'Figure (com legenda)', build: function(doc){
    const el = doc.createElement('figure');
    el.style.cssText = 'margin:0 0 12px;';
    const ph = doc.createElement('div');
    ph.textContent = 'Imagem';
    ph.style.cssText = 'width:100%; height:160px; display:flex; align-items:center; justify-content:center; background:#e2e4e9; color:#8b90a0; border-radius:8px; font-size:13px;';
    const cap = doc.createElement('figcaption');
    cap.textContent = 'Legenda da imagem';
    cap.style.cssText = 'font-size:12.5px; color:#666; margin-top:6px;';
    el.appendChild(ph); el.appendChild(cap);
    return el;
  } },
  button: { label: 'Botão', build: function(doc){
    const el = doc.createElement('button');
    el.textContent = 'Botão';
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 18px; background:#6d8bff; color:#fff; border:none; border-radius:8px; cursor:pointer; margin:0 0 12px;';
    return el;
  } },
  a: { label: 'Link', build: function(doc){
    const el = doc.createElement('a');
    el.textContent = 'Link'; el.href = '#';
    el.style.cssText = 'color:#6d8bff; text-decoration:underline; font-size:15px;';
    return el;
  } },
  ul: { label: 'Lista', build: function(doc){
    const el = doc.createElement('ul');
    el.style.cssText = 'margin:0 0 12px; padding-left:20px; font-size:15px; color:#1b1d23;';
    ['Item 1', 'Item 2', 'Item 3'].forEach(function(t){ const li = doc.createElement('li'); li.textContent = t; el.appendChild(li); });
    return el;
  } },
  li: { label: 'Item de lista (li) avulso', build: function(doc){
    const el = doc.createElement('li');
    el.textContent = 'Item de lista';
    el.style.cssText = 'font-size:15px; color:#1b1d23;';
    return el;
  } },
  table: { label: 'Tabela', build: function(doc, dataRows, cols){
    dataRows = Math.max(1, Math.min(50, dataRows || 2));
    cols = Math.max(1, Math.min(20, cols || 2));
    const el = doc.createElement('table');
    el.style.cssText = 'border-collapse:collapse; margin:0 0 12px; font-size:14px; color:#1b1d23;';
    function row(cells, isHead){
      const tr = doc.createElement('tr');
      cells.forEach(function(t){
        const c = doc.createElement(isHead ? 'th' : 'td');
        c.textContent = t;
        c.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
        tr.appendChild(c);
      });
      return tr;
    }
    const letters = 'ABCDEFGHIJKLMNOPQRST';
    el.appendChild(row(Array.from({ length: cols }, function(_, i){ return 'Coluna ' + letters[i]; }), true));
    for(let r = 1; r <= dataRows; r++){
      el.appendChild(row(Array.from({ length: cols }, function(_, i){ return 'Valor ' + (r + i * dataRows); })));
    }
    return el;
  } },
  form: { label: '▤ Formulário', build: function(doc){
    const el = doc.createElement('form');
    el.style.cssText = 'display:block; margin:0 0 12px;';
    return el;
  } },
  input: { label: 'Input (campo)', build: function(doc){
    const el = doc.createElement('input');
    el.type = 'text'; el.placeholder = 'Digite aqui...';
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block;';
    return el;
  } },
  textarea: { label: 'Textarea', build: function(doc){
    const el = doc.createElement('textarea');
    el.placeholder = 'Digite aqui...'; el.rows = 4;
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block; resize:vertical;';
    return el;
  } },
  select: { label: 'Select (lista suspensa)', build: function(doc){
    const el = doc.createElement('select');
    el.style.cssText = 'font:inherit; font-size:14px; padding:10px 12px; border:1px solid #ccc; border-radius:6px; margin:0 0 12px; display:block;';
    ['Opção 1', 'Opção 2', 'Opção 3'].forEach(function(t){ const o = doc.createElement('option'); o.textContent = t; el.appendChild(o); });
    return el;
  } },
  checkbox: { label: 'Checkbox / Radio', build: function(doc){
    const el = doc.createElement('label');
    el.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:14px; margin:0 0 12px;';
    const input = doc.createElement('input'); input.type = 'checkbox';
    el.appendChild(input); el.appendChild(doc.createTextNode('Opção'));
    return el;
  } },
  labelStandalone: { label: 'Label avulso', build: function(doc){
    const el = doc.createElement('label');
    el.textContent = 'Rótulo';
    el.style.cssText = 'display:block; font-size:13px; font-weight:600; color:#333; margin:0 0 6px;';
    return el;
  } },
  fieldset: { label: 'Fieldset (grupo de campos)', build: function(doc){
    const el = doc.createElement('fieldset');
    el.style.cssText = 'border:1px solid #d9dce4; border-radius:8px; padding:16px; margin:0 0 12px;';
    const legend = doc.createElement('legend');
    legend.textContent = 'Grupo';
    legend.style.cssText = 'padding:0 6px; font-size:13px; font-weight:600; color:#333;';
    el.appendChild(legend);
    return el;
  } },
  video: { label: 'Video / Audio', build: function(doc){
    const el = doc.createElement('video');
    el.controls = true;
    el.style.cssText = 'width:320px; height:180px; background:#1b1d23; border-radius:8px; display:block; margin:0 0 12px;';
    return el;
  } },
  iframe: { label: 'Iframe (embed)', build: function(doc){
    const el = doc.createElement('iframe');
    el.src = 'about:blank';
    el.style.cssText = 'width:400px; height:220px; border:1px solid #d9dce4; border-radius:8px; display:block; margin:0 0 12px;';
    return el;
  } },
  details: { label: 'Details/summary', build: function(doc){
    const el = doc.createElement('details');
    el.style.cssText = 'margin:0 0 12px; font-size:14.5px; color:#1b1d23;';
    const summary = doc.createElement('summary');
    summary.textContent = 'Clique para expandir';
    summary.style.cssText = 'cursor:pointer; font-weight:600;';
    const p = doc.createElement('p');
    p.textContent = 'Conteúdo escondido até clicar no título.';
    p.style.cssText = 'margin:8px 0 0; color:#555;';
    el.appendChild(summary); el.appendChild(p);
    return el;
  } },
  progress: { label: 'Progress / Meter', build: function(doc){
    const el = doc.createElement('progress');
    el.max = 100; el.value = 60;
    el.style.cssText = 'width:220px; display:block; margin:0 0 12px;';
    return el;
  } },
  chart: { label: '📊 Gráfico', build: function(doc){
    const el = doc.createElement('canvas');
    el.width = 320; el.height = 200;
    el.style.cssText = 'display:block; margin:0 0 12px;';
    el.setAttribute('data-ae-chart', JSON.stringify({ type: 'bar', labels: ['A', 'B', 'C'], values: [30, 55, 20], colors: ['#6d8bff', '#35d0a4', '#ff6d8b'] }));
    aeDrawChart(el);
    return el;
  } },
  hr: { label: '— Linha', build: function(doc){
    const el = doc.createElement('hr');
    el.style.cssText = 'border:none; border-top:2px solid #d9dce4; margin:16px 0;';
    return el;
  } },
  circle: { label: '○ Círculo / elipse', build: function(doc){
    const el = doc.createElement('div');
    el.style.cssText = 'width:100px; height:100px; border-radius:50%; background:#6d8bff;';
    return el;
  } }
};

// the "Texto" element (and any of these tags already in a project) picks
// its HTML tag from this list via a "Tipo" select in Propriedades, instead
// of the "+ Elemento" menu having one entry per tag — same idea as the
// Tipo select an <input> or <button> already has.
const TEXT_TYPES = [
  ['span', 'Texto em linha (span)'],
  ['p', 'Parágrafo (p)'],
  ['h1', 'Título 1 (h1)'],
  ['h2', 'Título 2 (h2)'],
  ['h3', 'Título 3 (h3)'],
  ['h4', 'Título 4 (h4)'],
  ['h5', 'Título 5 (h5)'],
  ['h6', 'Título 6 (h6)'],
  ['blockquote', 'Citação (blockquote)'],
  ['strong', 'Negrito (strong)'],
  ['em', 'Itálico (em)'],
  ['b', 'Negrito visual (b)'],
  ['i', 'Itálico visual (i)'],
  ['code', 'Código em linha (code)'],
  ['pre', 'Bloco de código (pre)']
];
const TEXT_TYPE_TAGS = TEXT_TYPES.map(function(t){ return t[0].toUpperCase(); });

// same "Tipo" trick as TEXT_TYPES, for the other menu entries that got
// folded together: pick the specific tag from a dropdown instead of the
// "+ Elemento" menu having one entry per tag.
const CONTAINER_TYPES = [
  ['div', 'Div (genérico)'], ['section', 'Section'], ['article', 'Article'], ['aside', 'Aside'],
  ['main', 'Main'], ['header', 'Header'], ['footer', 'Footer'], ['nav', 'Nav (navegação)']
];
const CONTAINER_TYPE_TAGS = CONTAINER_TYPES.map(function(t){ return t[0].toUpperCase(); });

const LIST_TYPES = [['ul', 'Lista (não ordenada)'], ['ol', 'Lista numerada']];
const LIST_TYPE_TAGS = LIST_TYPES.map(function(t){ return t[0].toUpperCase(); });

const MEDIA_TYPES = [['video', 'Video'], ['audio', 'Audio']];
const MEDIA_TYPE_TAGS = MEDIA_TYPES.map(function(t){ return t[0].toUpperCase(); });

const INDICATOR_TYPES = [['progress', 'Progress'], ['meter', 'Meter']];
const INDICATOR_TYPE_TAGS = INDICATOR_TYPES.map(function(t){ return t[0].toUpperCase(); });

function typeSwitchHTML(fieldId, sectionLabel, tag, types){
  const options = types.map(function(t){
    return '<option value="' + t[0] + '"' + (t[0] === tag.toLowerCase() ? ' selected' : '') + '>' + t[1] + '</option>';
  }).join('');
  return '<div class="propsSection">' + sectionLabel + '</div>' +
    '<div class="field"><label>Tipo</label><select id="' + fieldId + '">' + options + '</select></div>';
}

function bindTypeSwitch(fieldId, el){
  const sel = document.getElementById(fieldId);
  if(!sel) return;
  sel.addEventListener('change', function(){
    const next = convertElementTag(el, this.value);
    renderLayers();
    selectElement(next);
    pushHistory(); syncCodeFromCanvas();
  });
}

// swaps an element's tag while keeping its content, attributes and (so
// anything already targeting it by data-ae-name/data-ae-eid/etc. keeps
// working) — the DOM has no "just change the tag" primitive, so this
// builds a replacement and moves everything over by hand.
function convertElementTag(el, newTag){
  const doc = el.ownerDocument;
  const next = doc.createElement(newTag);
  Array.from(el.attributes).forEach(function(attr){ next.setAttribute(attr.name, attr.value); });
  while(el.firstChild) next.appendChild(el.firstChild);
  el.parentNode.replaceChild(next, el);
  return next;
}

async function addElement(type){
  const doc = getDoc();
  const tpl = ELEMENT_TEMPLATES[type];
  if(!doc || !tpl) return;
  let el;
  if(type === 'table'){
    const rowsStr = await showPrompt('Quantas linhas de dados? (sem contar o cabeçalho)', '2', 'Nova tabela');
    if(rowsStr === null) return;
    const colsStr = await showPrompt('Quantas colunas?', '2', 'Nova tabela');
    if(colsStr === null) return;
    el = tpl.build(doc, parseInt(rowsStr, 10), parseInt(colsStr, 10));
  } else {
    el = tpl.build(doc);
  }
  insertionContainer(doc).appendChild(el);
  selectElement(el);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
  return el;
}

