"use strict";

// ---------- properties panel: artboard ----------

const ARTBOARD_PRESETS = [
  { label: 'Personalizado', w: null, h: null },
  { label: 'Desktop 1440×900', w: 1440, h: 900 },
  { label: 'Desktop 1280×800', w: 1280, h: 800 },
  { label: 'Tablet 768×1024', w: 768, h: 1024 },
  { label: 'Mobile 375×812', w: 375, h: 812 }
];

function renderArtboardProps(ab){
  const presetIdx = ARTBOARD_PRESETS.findIndex(function(p){ return p.w === ab.w && p.h === ab.h; });
  const presetOpts = ARTBOARD_PRESETS.map(function(p, i){
    return '<option value="' + i + '"' + (i === (presetIdx < 0 ? 0 : presetIdx) ? ' selected' : '') + '>' + p.label + '</option>';
  }).join('');
  const doc = getDoc();
  const bodyStyle = doc && doc.body ? doc.body.style : {};
  const overflowVal = bodyStyle.overflow || 'visible';
  const smoothingVal = bodyStyle.webkitFontSmoothing === 'antialiased' ? 'antialiased'
    : (bodyStyle.textRendering === 'optimizeLegibility' ? 'legibility' : 'auto');

  propsBody.innerHTML =
    '<div class="propsSection">Artboard</div>' +
    '<div class="field"><label>Nome</label><input type="text" id="pAbName" value="' + ab.name.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="field"><label>Tamanho da tela</label><select id="pAbPreset">' + presetOpts + '</select></div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('W', 'pAbW', ab.w, 'Largura') + '</div>' +
      '<div class="field">' + iconFieldHTML('H', 'pAbH', ab.h, 'Altura') + '</div>' +
    '</div>' +
    '<div class="field"><button type="button" id="pAbFit" style="width:100%;" title="Aumenta a largura e/ou altura do artboard até o conteúdo inteiro caber, sem precisar rolar">⤢ Expandir até caber o conteúdo (sem scroll)</button></div>' +
    '<div class="field"><label>Fundo do artboard</label>' + colorSwatchHTML('pAbBg', getArtboardBgHex(ab)) + '</div>' +
    '<div class="propsSection">Comportamento (&lt;body&gt;)</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Rolagem (overflow)</label><select id="pAbOverflow">' +
        ['visible', 'hidden', 'auto', 'scroll'].map(function(v){ return '<option value="' + v + '"' + (v === overflowVal ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Suavização de texto</label><select id="pAbSmoothing">' +
        '<option value="auto"' + (smoothingVal === 'auto' ? ' selected' : '') + '>Padrão</option>' +
        '<option value="antialiased"' + (smoothingVal === 'antialiased' ? ' selected' : '') + '>Antialiased</option>' +
        '<option value="legibility"' + (smoothingVal === 'legibility' ? ' selected' : '') + '>Legibilidade otimizada</option>' +
      '</select></div>' +
    '</div>' +
    '<hr>' +
    '<div class="field"><button id="pAbDup" style="width:100%">Duplicar artboard</button></div>' +
    '<div class="field"><button id="pAbDel" class="dangerBtn">Excluir artboard</button></div>';

  document.getElementById('pAbName').addEventListener('change', function(){
    ab.name = this.value.trim() || ab.name;
    ab.dom.title.textContent = ab.name;
  });
  document.getElementById('pAbPreset').addEventListener('change', function(){
    const p = ARTBOARD_PRESETS[parseInt(this.value)];
    if(p && p.w){ setArtboardSize(ab, p.w, p.h); renderArtboardProps(ab); }
  });
  document.getElementById('pAbW').addEventListener('change', function(){ setArtboardSize(ab, parseInt(this.value) || ab.w, ab.h); renderArtboardProps(ab); });
  document.getElementById('pAbH').addEventListener('change', function(){ setArtboardSize(ab, ab.w, parseInt(this.value) || ab.h); renderArtboardProps(ab); });
  document.getElementById('pAbFit').addEventListener('click', function(){ fitArtboardToContent(ab); renderArtboardProps(ab); });
  bindColorSwatchSimple('pAbBg', function(rgba){
    const doc = getDoc();
    if(doc && doc.body) doc.body.style.backgroundColor = rgba;
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 300);
  });
  document.getElementById('pAbOverflow').addEventListener('change', function(){
    const doc = getDoc();
    if(doc && doc.body) doc.body.style.overflow = this.value === 'visible' ? '' : this.value;
    pushHistory(); syncCodeFromCanvas();
  });
  document.getElementById('pAbSmoothing').addEventListener('change', function(){
    const doc = getDoc();
    if(doc && doc.body){
      if(this.value === 'antialiased'){ doc.body.style.webkitFontSmoothing = 'antialiased'; doc.body.style.textRendering = ''; }
      else if(this.value === 'legibility'){ doc.body.style.webkitFontSmoothing = ''; doc.body.style.textRendering = 'optimizeLegibility'; }
      else { doc.body.style.webkitFontSmoothing = ''; doc.body.style.textRendering = ''; }
    }
    pushHistory(); syncCodeFromCanvas();
  });
  document.getElementById('pAbDup').addEventListener('click', function(){ duplicateArtboard(ab); });
  document.getElementById('pAbDel').addEventListener('click', async function(){
    if(await showConfirm('Excluir o artboard "' + ab.name + '"? Essa ação não pode ser desfeita.', 'Excluir artboard', true)) deleteArtboard(ab);
  });
}

function getArtboardBgHex(ab){
  const doc = getDoc();
  if(!doc || !doc.body) return '#ffffff';
  return rgbToHex(doc.defaultView.getComputedStyle(doc.body).backgroundColor);
}

