"use strict";

// ---------- ações sem código (navegar / mostrar-ocultar / chamar função) ----------
// shared by every element type that can carry an action — button, link,
// image, or any generic container (div, span, section…) that falls through
// attributesSectionHTML's tag-specific cases below. One element can only
// hold one action (goto/toggle/call are mutually exclusive), but it fires
// on whichever event is picked, not just click.
const AE_EVENTS = [
  ['click', 'Ao clicar'],
  ['hover', 'Ao passar o mouse'],
  ['hoverout', 'Ao tirar o mouse'],
  ['load', 'Ao carregar o artboard']
];

function actionSectionHTML(el){
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  const gotoId = el.getAttribute('data-ae-goto') || '';
  const toggleTarget = el.getAttribute('data-ae-toggle') || '';
  const callFn = el.getAttribute('data-ae-call') || '';
  const setTextTarget = el.getAttribute('data-ae-settext') || '';
  const setTextValue = el.getAttribute('data-ae-settext-value') || '';
  const actionVal = gotoId ? 'goto' : (toggleTarget ? 'toggle' : (el.hasAttribute('data-ae-call') ? 'call' : (setTextTarget ? 'settext' : '')));
  const evt = el.getAttribute('data-ae-evt') || 'click';
  const artboardOptions = artboards.map(function(a){
    return '<option value="' + a.id + '"' + (gotoId === a.id ? ' selected' : '') + '>' + a.name + '</option>';
  }).join('');
  const doc = getDoc();
  toggleTargetCandidates = doc ? Array.from(doc.querySelectorAll('*')).filter(function(n){ return n !== el && isEditableEl(n, doc); }) : [];
  const targetName = actionVal === 'settext' ? setTextTarget : toggleTarget;
  const targetOptions = toggleTargetCandidates.map(function(n, i){
    return '<option value="' + i + '"' + (targetName && n.dataset.aeName === targetName ? ' selected' : '') + '>' + esc(targetPickerLabel(n)) + '</option>';
  }).join('');
  const fnNames = detectFunctionNames(doc);
  const fnDatalist = '<datalist id="pActCallFnList">' + fnNames.map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  const evtOptions = AE_EVENTS.map(function(e){ return '<option value="' + e[0] + '"' + (evt === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('');

  return '<div class="propsSection">Ação</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Evento</label><select id="pActEvt">' + evtOptions + '</select></div>' +
      '<div class="field"><label>Ação</label><select id="pActAction">' +
        '<option value=""' + (actionVal === '' ? ' selected' : '') + '>Nada</option>' +
        '<option value="goto"' + (actionVal === 'goto' ? ' selected' : '') + '>Navegar para artboard</option>' +
        '<option value="toggle"' + (actionVal === 'toggle' ? ' selected' : '') + '>Mostrar/ocultar elemento</option>' +
        '<option value="settext"' + (actionVal === 'settext' ? ' selected' : '') + '>Definir texto de elemento</option>' +
        '<option value="call"' + (actionVal === 'call' ? ' selected' : '') + '>Chamar função JS</option>' +
      '</select></div>' +
    '</div>' +
    (actionVal === 'goto' ?
      '<div class="field"><label>Ir para</label><select id="pActGotoArtboard">' + artboardOptions + '</select></div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — vira um link (se for <code>&lt;a&gt;</code>) ou um pequeno script (nos outros elementos) pro arquivo desse artboard (exporte os dois pra mesma pasta).</div>'
      : '') +
    (actionVal === 'toggle' ?
      (targetOptions ?
        '<div class="field"><label>Elemento</label><select id="pActToggleTarget">' + targetOptions + '</select></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — mostra o elemento se estiver oculto, ou oculta se estiver visível.</div>'
        : '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Não tem nenhum outro elemento nesse artboard pra escolher ainda.</div>')
      : '') +
    (actionVal === 'settext' ?
      (targetOptions ?
        '<div class="field"><label>Elemento</label><select id="pActSetTextTarget">' + targetOptions + '</select></div>' +
        '<div class="field"><label>Novo texto</label><input type="text" id="pActSetTextValue" placeholder="ex: Concluído!" value="' + esc(setTextValue) + '"></div>' +
        '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Funciona no modo Visualizar e no .html exportado — troca o texto do elemento escolhido por esse aqui (substitui o conteúdo dele inteiro).</div>'
        : '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Não tem nenhum outro elemento nesse artboard pra escolher ainda.</div>')
      : '') +
    (actionVal === 'call' ?
      '<div class="field"><label>Nome da função</label><input type="text" id="pActCallFn" list="pActCallFnList" placeholder="ex: minhaFuncao" value="' + esc(callFn) + '">' + fnDatalist + '</div>' +
      '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Chama essa função (declarada na aba <code>{ } JS</code> desse artboard, com <code>function nome(){ }</code>) — dentro dela, <code>this</code> é o elemento. Funciona no modo Visualizar e no .html exportado.</div>'
      : '');
}

function bindActionSection(el){
  const actionSel = document.getElementById('pActAction');
  if(actionSel){
    actionSel.addEventListener('change', function(){
      el.removeAttribute('data-ae-goto');
      el.removeAttribute('data-ae-toggle');
      el.removeAttribute('data-ae-call');
      el.removeAttribute('data-ae-settext');
      el.removeAttribute('data-ae-settext-value');
      if(this.value === ''){ el.removeAttribute('data-ae-evt'); }
      else if(this.value === 'goto'){
        const other = artboards.find(function(a){ return a.id !== state.activeId; }) || artboards[0];
        if(other) el.setAttribute('data-ae-goto', other.id);
      } else if(this.value === 'toggle'){
        const first = toggleTargetCandidates[0];
        if(first) el.setAttribute('data-ae-toggle', ensureAeName(first));
      } else if(this.value === 'settext'){
        const first = toggleTargetCandidates[0];
        if(first) el.setAttribute('data-ae-settext', ensureAeName(first));
        el.setAttribute('data-ae-settext-value', '');
      } else if(this.value === 'call'){
        el.setAttribute('data-ae-call', '');
      }
      pushHistory(); syncCodeFromCanvas(); renderProps();
    });
  }
  const evtSel = document.getElementById('pActEvt');
  if(evtSel){
    evtSel.addEventListener('change', function(){
      if(this.value === 'click') el.removeAttribute('data-ae-evt');
      else el.setAttribute('data-ae-evt', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const gotoSel = document.getElementById('pActGotoArtboard');
  if(gotoSel){
    gotoSel.addEventListener('change', function(){
      el.setAttribute('data-ae-goto', this.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const toggleSel = document.getElementById('pActToggleTarget');
  if(toggleSel){
    toggleSel.addEventListener('change', function(){
      const target = toggleTargetCandidates[parseInt(this.value, 10)];
      if(target) el.setAttribute('data-ae-toggle', ensureAeName(target));
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const callFnInput = document.getElementById('pActCallFn');
  if(callFnInput){
    callFnInput.addEventListener('input', function(){
      el.setAttribute('data-ae-call', this.value.trim());
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const setTextSel = document.getElementById('pActSetTextTarget');
  if(setTextSel){
    setTextSel.addEventListener('change', function(){
      const target = toggleTargetCandidates[parseInt(this.value, 10)];
      if(target) el.setAttribute('data-ae-settext', ensureAeName(target));
      pushHistory(); syncCodeFromCanvas();
    });
  }
  const setTextValueInput = document.getElementById('pActSetTextValue');
  if(setTextValueInput){
    setTextValueInput.addEventListener('input', function(){
      el.setAttribute('data-ae-settext-value', this.value);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
}

