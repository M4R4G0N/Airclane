"use strict";

// ---------- element attributes (not CSS — placeholder, href, alt…) ----------

function attributesSectionHTML(el, opts){
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  const tag = el.tagName;
  if(tag === 'INPUT'){
    const inputType = el.getAttribute('type') || 'text';
    const isCheckable = inputType === 'checkbox' || inputType === 'radio';
    return '<div class="propsSection">Campo (input)</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'checkbox', 'radio'], inputType) + '</select></div>' +
        '<div class="field"><label>Nome' + (isCheckable ? ' (grupo)' : '') + '</label><div class="fieldRow" style="display:flex; gap:4px;"><input type="text" id="pAttrName" value="' + esc(el.getAttribute('name')) + '" style="flex:1;">' +
          (inputType === 'radio' ? '<button type="button" class="miniBtn" id="pRadioGroup" title="Dá o mesmo nome pra todos os rádios irmãos, pra virarem um grupo exclusivo">🔗 Agrupar</button>' : '') +
        '</div></div>' +
      '</div>' +
      (isCheckable ?
        '<div class="field"><label class="checkField"><input type="checkbox" id="pAttrChecked"' + (el.hasAttribute('checked') ? ' checked' : '') + '> Marcado por padrão</label></div>'
        :
        '<div class="field"><label>Placeholder</label><input type="text" id="pAttrPlaceholder" value="' + esc(el.getAttribute('placeholder')) + '"></div>') +
      '<div class="field"><label>Valor' + (isCheckable ? ' (enviado quando marcado)' : ' padrão') + '</label><input type="text" id="pAttrValue" value="' + esc(el.getAttribute('value')) + '"></div>';
  }
  if(tag === 'TEXTAREA'){
    return '<div class="propsSection">Campo (textarea)</div>' +
      '<div class="field"><label>Nome</label><input type="text" id="pAttrName" value="' + esc(el.getAttribute('name')) + '"></div>' +
      '<div class="field"><label>Placeholder</label><input type="text" id="pAttrPlaceholder" value="' + esc(el.getAttribute('placeholder')) + '"></div>';
  }
  if(tag === 'A'){
    const href = el.getAttribute('href') || '';
    const gotoMatch = href.match(/^#ae-goto:(.+)$/);
    const isGoto = !!gotoMatch;
    const artboardOptions = artboards.map(function(a){
      return '<option value="' + a.id + '"' + (gotoMatch && gotoMatch[1] === a.id ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');
    return '<div class="propsSection">Link</div>' +
      '<div class="field"><label>Ação</label><select id="pAttrLinkMode">' +
        '<option value="url"' + (!isGoto ? ' selected' : '') + '>Endereço (URL)</option>' +
        '<option value="goto"' + (isGoto ? ' selected' : '') + '>Navegar para artboard</option>' +
      '</select></div>' +
      (isGoto ?
        '<div class="field"><label>Ir para</label><select id="pAttrGotoArtboard">' + artboardOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar, e no .html exportado também — vira um link direto pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
        :
        '<div class="field"><label>Endereço (href)</label><input type="text" id="pAttrHref" value="' + esc(href) + '"></div>' +
        '<div class="field"><label>Abrir em</label><select id="pAttrTarget">' + opts(['_self', '_blank'], el.getAttribute('target') || '_self') + '</select></div>') +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Isso aqui é só pra navegação por clique. Pra outro evento (hover) ou outra ação (mostrar/ocultar, chamar função), usa a seção Ação abaixo.</div>' +
      actionSectionHTML(el);
  }
  if(tag === 'IMG'){
    return '<div class="propsSection">Imagem</div>' +
      '<div class="field"><label>Texto alternativo (alt)</label><input type="text" id="pAttrAlt" value="' + esc(el.getAttribute('alt')) + '"></div>' +
      '<div class="row2">' +
        '<div class="field"><label>Ajuste (object-fit)</label><select id="pObjectFit">' + opts(['fill', 'contain', 'cover', 'none', 'scale-down'], el.style.objectFit || 'fill') + '</select></div>' +
        '<div class="field"><label>Posição</label><select id="pObjectPosition">' + opts(['center', 'top', 'bottom', 'left', 'right'], el.style.objectPosition || 'center') + '</select></div>' +
      '</div>' +
      actionSectionHTML(el);
  }
  if(tag === 'BUTTON'){
    return '<div class="propsSection">Botão</div>' +
      '<div class="field"><label>Tipo</label><select id="pAttrType">' + opts(['button', 'submit', 'reset'], el.getAttribute('type') || 'button') + '</select></div>' +
      actionSectionHTML(el);
  }
  if(tag === 'FORM'){
    const gotoId = el.getAttribute('data-ae-goto') || '';
    const artboardOptions = artboards.map(function(a){
      return '<option value="' + a.id + '"' + (gotoId === a.id ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');
    return '<div class="propsSection">Formulário</div>' +
      '<div class="field"><label>Ao enviar (submit)</label><select id="pAttrBtnAction">' +
        '<option value=""' + (!gotoId ? ' selected' : '') + '>Nada</option>' +
        '<option value="goto"' + (gotoId ? ' selected' : '') + '>Navegar para artboard</option>' +
      '</select></div>' +
      (gotoId ?
        '<div class="field"><label>Ir para</label><select id="pAttrGotoArtboard">' + artboardOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — envia o formulário (botão type="submit" dentro dele, ou Enter num campo) e vai pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
        : '') +
      '<div class="field"><label>Action (endereço de envio)</label><input type="text" id="pAttrAction" value="' + esc(el.getAttribute('action')) + '"></div>';
  }
  if(tag === 'CANVAS' && el.hasAttribute('data-ae-chart')){
    let cfg; try { cfg = JSON.parse(el.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
    const labels = cfg.labels || [], values = cfg.values || [];
    const rows = labels.map(function(l, i){ return l + ':' + (values[i] !== undefined ? values[i] : ''); }).join('\n');
    const rowsSafe = rows.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div class="propsSection">Gráfico</div>' +
      '<div class="field"><label>Tipo</label><select id="pChartType">' + opts(['bar', 'line', 'pie'], cfg.type || 'bar') + '</select></div>' +
      '<div class="field"><label>Dados (um "rótulo:valor" por linha)</label><textarea id="pChartData" rows="5" spellcheck="false">' + rowsSafe + '</textarea></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Redesenha ao vivo no editor. No .html exportado também funciona — os pixels não sobrevivem ao salvar o HTML, então o gráfico é redesenhado de novo assim que a página abre.</div>';
  }
  if(tag === 'TABLE'){
    const preset = el.getAttribute('data-ae-table-style') || 'none';
    return '<div class="propsSection">Tabela</div>' +
      '<div class="field"><label>Estilo</label><select id="pTableStyle">' +
        '<option value="none"' + (preset === 'none' ? ' selected' : '') + '>Nenhum</option>' +
        '<option value="bordered"' + (preset === 'bordered' ? ' selected' : '') + '>Bordas</option>' +
        '<option value="striped"' + (preset === 'striped' ? ' selected' : '') + '>Zebrado</option>' +
      '</select></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Selecione 2+ células adjacentes (Ctrl/Cmd+clique) e use o menu de botão direito pra mesclar. Botão direito numa linha/coluna também move ela de posição.</div>' +
      actionSectionHTML(el);
  }
  if(TEXT_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pTextType', 'Texto', tag, TEXT_TYPES) + actionSectionHTML(el);
  if(LIST_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pListType', 'Lista', tag, LIST_TYPES) +
    '<div class="field"><label>Marcador</label><select id="pListStyle">' + opts(['disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-roman', 'none'], el.style.listStyleType || 'disc') + '</select></div>' +
    actionSectionHTML(el);
  if(MEDIA_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pMediaType', 'Mídia', tag, MEDIA_TYPES) + actionSectionHTML(el);
  if(INDICATOR_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pIndicatorType', 'Indicador', tag, INDICATOR_TYPES) + actionSectionHTML(el);
  if(CONTAINER_TYPE_TAGS.indexOf(tag) !== -1) return typeSwitchHTML('pContainerType', 'Container', tag, CONTAINER_TYPES) + actionSectionHTML(el);
  // any other element (span de ícone, td, etc.) doesn't get its own
  // dedicated attribute fields, but can still carry an action.
  return actionSectionHTML(el);
}

function bindAttributesSection(el){
  function bindAttr(id, attr, evt){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener(evt || 'input', function(){
      if(input.value) el.setAttribute(attr, input.value); else el.removeAttribute(attr);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  bindAttr('pAttrType', 'type', 'change');
  bindAttr('pAttrName', 'name');
  bindAttr('pAttrPlaceholder', 'placeholder');
  bindAttr('pAttrValue', 'value');
  const checkedBox = document.getElementById('pAttrChecked');
  if(checkedBox){
    checkedBox.addEventListener('change', function(){
      if(checkedBox.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
      el.checked = checkedBox.checked; // live in the editor's own iframe too, not just the exported attribute
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const radioGroupBtn = document.getElementById('pRadioGroup');
  if(radioGroupBtn){
    radioGroupBtn.addEventListener('click', function(){
      const container = el.closest('form') || el.parentElement.closest('div, fieldset, section, form') || el.ownerDocument.body;
      const siblings = Array.from(container.querySelectorAll('input[type="radio"]'));
      const name = el.getAttribute('name') || 'grupo-' + Math.random().toString(36).slice(2, 7);
      siblings.forEach(function(r){ r.setAttribute('name', name); });
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  bindAttr('pAttrHref', 'href');
  bindAttr('pAttrTarget', 'target', 'change');
  bindAttr('pAttrAlt', 'alt');
  bindAttr('pAttrAction', 'action');
  const listStyleSel = document.getElementById('pListStyle');
  if(listStyleSel){
    listStyleSel.addEventListener('change', function(){ el.style.listStyleType = listStyleSel.value; pushHistory(); syncCodeFromCanvas(); });
  }
  const objectFitSel = document.getElementById('pObjectFit');
  if(objectFitSel){
    objectFitSel.addEventListener('change', function(){ el.style.objectFit = objectFitSel.value; pushHistory(); syncCodeFromCanvas(); });
  }
  const objectPositionSel = document.getElementById('pObjectPosition');
  if(objectPositionSel){
    objectPositionSel.addEventListener('change', function(){ el.style.objectPosition = objectPositionSel.value; pushHistory(); syncCodeFromCanvas(); });
  }

  const linkMode = document.getElementById('pAttrLinkMode');
  if(linkMode){
    linkMode.addEventListener('change', function(){
      if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        el.setAttribute('href', other ? '#ae-goto:' + other.id : '#ae-goto:');
      } else {
        el.setAttribute('href', '');
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  // FORM is the only element left using this id — its own submit-triggered
  // "Navegar para artboard" (button/link/generic elements now go through
  // the shared actionSectionHTML/bindActionSection below instead).
  const btnAction = document.getElementById('pAttrBtnAction');
  if(btnAction){
    btnAction.addEventListener('change', function(){
      el.removeAttribute('data-ae-goto');
      if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        if(other) el.setAttribute('data-ae-goto', other.id);
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  // shared by <a>'s own dedicated goto dropdown and FORM's submit-goto.
  const gotoSel = document.getElementById('pAttrGotoArtboard');
  if(gotoSel){
    gotoSel.addEventListener('change', function(){
      if(el.tagName === 'A') el.setAttribute('href', '#ae-goto:' + this.value);
      else el.setAttribute('data-ae-goto', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const tableStyle = document.getElementById('pTableStyle');
  if(tableStyle){
    tableStyle.addEventListener('change', function(){ applyTableStyle(el, this.value); });
  }
  bindTypeSwitch('pTextType', el);
  bindTypeSwitch('pListType', el);
  bindTypeSwitch('pMediaType', el);
  bindTypeSwitch('pIndicatorType', el);
  bindTypeSwitch('pContainerType', el);
  bindActionSection(el);

  // chart type/data — parses "rótulo:valor" lines back into the JSON the
  // canvas is drawn from, and redraws immediately so editing feels live.
  function updateChart(mutate){
    let cfg; try { cfg = JSON.parse(el.getAttribute('data-ae-chart') || '{}'); } catch(e){ cfg = {}; }
    mutate(cfg);
    el.setAttribute('data-ae-chart', JSON.stringify(cfg));
    aeDrawChart(el);
  }
  const chartTypeSel = document.getElementById('pChartType');
  if(chartTypeSel){
    chartTypeSel.addEventListener('change', function(){
      updateChart(function(cfg){ cfg.type = chartTypeSel.value; });
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const chartDataInput = document.getElementById('pChartData');
  if(chartDataInput){
    chartDataInput.addEventListener('input', function(){
      const labels = [], values = [];
      chartDataInput.value.split('\n').forEach(function(line){
        const i = line.indexOf(':');
        if(i < 0) return;
        labels.push(line.slice(0, i).trim());
        values.push(parseFloat(line.slice(i + 1)) || 0);
      });
      updateChart(function(cfg){ cfg.labels = labels; cfg.values = values; });
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
}

// the "mostrar/ocultar" action targets an element by its data-ae-name (same
// handle the Layers panel uses) — most elements never got one, so picking
// an unnamed element as a toggle target assigns it a name on the spot,
// same idea as an artboard getting its 'ab1' id at creation time.
function ensureAeName(el){
  if(el.dataset.aeName) return el.dataset.aeName;
  const doc = getDoc();
  let name;
  do { elNameCounter++; name = 'el' + elNameCounter; }
  while(doc && doc.querySelector('[data-ae-name="' + name + '"]'));
  el.dataset.aeName = name;
  return name;
}

// ---------- background pattern (dots / grid) ----------

function applyBgPattern(el, pattern, dotColor){
  if(pattern === 'none'){
    el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = '';
    return;
  }
  const c = dotColor || '#333849';
  if(pattern === 'dots'){
    el.style.backgroundImage = 'radial-gradient(' + c + ' 1px, transparent 1px)';
    el.style.backgroundSize = '22px 22px';
  } else if(pattern === 'grid'){
    el.style.backgroundImage = 'linear-gradient(' + c + ' 1px, transparent 1px), linear-gradient(90deg, ' + c + ' 1px, transparent 1px)';
    el.style.backgroundSize = '24px 24px';
  }
}

function currentBgPattern(el){
  const img = el.style.backgroundImage || '';
  if(img.indexOf('radial-gradient') === 0) return 'dots';
  if(img.indexOf('linear-gradient') === 0) return 'grid';
  return 'none';
}

// a photo background shares the same `background-image` property as the
// dots/grid pattern above and the Fundo swatch's gradient fill — whichever
// one is applied last simply overwrites the others, same as switching
// between dots and grid already does.
function currentBgImageUrl(el){
  const m = (el.style.backgroundImage || '').match(/^url\((['"]?)(.*?)\1\)$/);
  return m ? m[2] : '';
}

