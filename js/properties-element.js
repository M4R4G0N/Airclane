"use strict";

// ---------- editing a shared CSS class rule (not just inline style) ----------
// Works on the raw text of the doc's <style> tag (not the live CSSOM) since
// CSSOM mutations don't reflect back into outerHTML/export.

function getStyleText(doc){
  const styleEl = doc.querySelector('style');
  return styleEl ? styleEl.textContent : '';
}
function setStyleText(doc, text){
  let styleEl = doc.querySelector('style');
  if(!styleEl){ styleEl = doc.createElement('style'); doc.head.appendChild(styleEl); }
  styleEl.textContent = text;
}
function findRuleBlock(cssText, selector){
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '\\s*\\{([\\s\\S]*?)\\}');
  const m = cssText.match(re);
  return m ? { full: m[0], body: m[1], index: m.index } : null;
}
function getClassRuleBody(doc, selector){
  const found = findRuleBlock(getStyleText(doc), selector);
  return found ? found.body.trim() : '';
}
function setClassRuleBody(doc, selector, newBody){
  let cssText = getStyleText(doc);
  const block = selector + ' {\n  ' + newBody.trim().replace(/\n/g, '\n  ') + '\n}';
  let firstIndex = -1;
  let found;
  while((found = findRuleBlock(cssText, selector)) !== null){
    if(firstIndex === -1) firstIndex = found.index;
    cssText = cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length);
  }
  if(firstIndex !== -1){
    cssText = cssText.slice(0, firstIndex) + block + '\n' + cssText.slice(firstIndex);
  } else {
    cssText = cssText.trim() + (cssText.trim() ? '\n\n' : '') + block + '\n';
  }
  setStyleText(doc, cssText);
}

// ---------- properties panel: element ----------

// post-processes the flat sequence of ".propsSection" headers + field divs
// that renderProps/renderArtboardProps build as one big HTML string —
// groups each header with the fields that follow it (up to the next
// header) into a collapsible body, and hides whole groups outside the
// "Ação/Texto/Container/Lista/Mídia/Indicador/Layout/Cor" set when the
// panel is in "Exibir" (simple) mode. Doing this as a DOM pass after the
// fact means every section-producing code path (element attrs, action,
// layout, appearance…) didn't need to be rewritten to nest its own fields.
function wrapPropsSections(container){
  const headers = Array.from(container.querySelectorAll('.propsSection'));
  headers.forEach(function(header){
    const key = header.childNodes[0] ? header.childNodes[0].textContent.trim() : header.textContent.trim();
    const body = document.createElement('div');
    body.className = 'propsSectionBody';
    let node = header.nextSibling;
    while(node && !(node.nodeType === 1 && node.classList && node.classList.contains('propsSection'))){
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }
    header.parentNode.insertBefore(body, header.nextSibling);

    const isSimpleSection = PROPS_SIMPLE_SECTIONS.indexOf(key) !== -1;
    if(state.propsView === 'simple' && !isSimpleSection){
      header.style.display = 'none';
      body.style.display = 'none';
      return;
    }

    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = '▾';
    header.appendChild(chev);
    header.classList.add('collapsible');
    const collapsed = collapsedPropsSections.has(key);
    header.classList.toggle('collapsed', collapsed);
    body.style.display = collapsed ? 'none' : '';
    header.addEventListener('click', function(){
      const nowCollapsed = body.style.display !== 'none';
      body.style.display = nowCollapsed ? 'none' : '';
      header.classList.toggle('collapsed', nowCollapsed);
      if(nowCollapsed) collapsedPropsSections.add(key); else collapsedPropsSections.delete(key);
    });
  });
}

// live filter over whatever renderProps just built — runs as a pass on top
// of wrapPropsSections' own Exibir/Avançado + collapsed-state visibility, so
// it overrides both (a search should surface a match no matter which view
// mode or collapsed state it's hiding behind). Matches against the icon
// chip / label text of each field, and the section's own header text.
function filterPropsBySearch(query){
  const container = document.getElementById('propsBody');
  if(!container) return;
  const q = query.trim().toLowerCase();
  if(!q){ renderProps(); return; }
  Array.from(container.querySelectorAll('.propsSection')).forEach(function(header){
    const body = header.nextElementSibling;
    if(!body || !body.classList.contains('propsSectionBody')) return;
    const headerText = (header.childNodes[0] ? header.childNodes[0].textContent : header.textContent).toLowerCase();
    const headerMatches = headerText.indexOf(q) !== -1;
    let sectionHasMatch = headerMatches;
    Array.from(body.querySelectorAll('.field')).forEach(function(field){
      const label = field.querySelector('label');
      const prefix = field.querySelector('.iconFieldPrefix');
      const iconField = field.querySelector('.iconField');
      const text = ((label ? label.textContent : '') + ' ' + (prefix ? prefix.textContent : '') + ' ' + (iconField ? iconField.getAttribute('title') || '' : '')).toLowerCase();
      const match = headerMatches || text.indexOf(q) !== -1;
      field.style.display = match ? '' : 'none';
      if(match) sectionHasMatch = true;
    });
    Array.from(body.querySelectorAll('.row2, .row3, .row4')).forEach(function(row){
      const anyVisible = Array.from(row.children).some(function(c){ return c.style.display !== 'none'; });
      row.style.display = anyVisible ? '' : 'none';
    });
    header.style.display = sectionHasMatch ? '' : 'none';
    body.style.display = sectionHasMatch ? '' : 'none';
  });
}

function checkboxLabelText(el){
  return Array.from(el.childNodes).filter(function(n){ return n.nodeType === 3; }).map(function(n){ return n.textContent; }).join('').trim();
}
function setCheckboxLabelText(el, text){
  Array.from(el.childNodes).filter(function(n){ return n.nodeType === 3; }).forEach(function(n){ n.remove(); });
  el.appendChild(el.ownerDocument.createTextNode(text));
}

function renderProps(){
  if(state.artboardMode){
    const a = activeArtboard();
    if(a){ renderArtboardProps(a); return; }
  }
  const el = state.selected;
  const doc = getDoc();
  if(!el || !doc){ propsBody.innerHTML = '<div id="propsEmpty">Nada selecionado.<br><br>Clique em um elemento, no título de um artboard, ou na lista de camadas.</div>'; return; }

  const cs = doc.defaultView.getComputedStyle(el);
  const bg = rgbToHex(cs.backgroundColor);
  const color = rgbToHex(cs.color);
  const displayVal = el.style.display || cs.display;
  const positionVal = el.style.position || cs.position;
  const isFlex = displayVal === 'flex' || displayVal === 'inline-flex';
  const free = positionVal === 'absolute' || positionVal === 'fixed';

  function opts(list, current){
    return list.map(function(v){ return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + v + '</option>'; }).join('');
  }
  function px(v){ return Math.round(parseFloat(v)) || 0; }
  function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
  function escText(v){ return (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  const NO_TEXT_EDIT_TAGS = ['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'TABLE', 'UL', 'OL', 'IFRAME', 'VIDEO', 'AUDIO', 'HR', 'BR', 'PROGRESS', 'METER', 'FORM'];
  const canEditText = el.children.length === 0 && NO_TEXT_EDIT_TAGS.indexOf(el.tagName) === -1;
  // a checkbox/radio's option text lives as a loose text node next to the
  // <input> inside its wrapping <label> — canEditText is false for it (it
  // has a child element), so it needs its own field that only touches that
  // text node, leaving the <input> itself alone.
  const isCheckableLabel = el.tagName === 'LABEL' && el.children.length === 1 &&
    el.children[0].tagName === 'INPUT' && (el.children[0].type === 'checkbox' || el.children[0].type === 'radio');

  const attrsHTML = attributesSectionHTML(el, opts);
  const classList = (el.className || '').trim().split(/\s+/).filter(Boolean);
  if(classList.length && !classList.includes(state.rulePickedClass)) state.rulePickedClass = classList[0];
  const ruleClass = classList.length ? state.rulePickedClass : null;

  const classRuleHTML = !classList.length ? '' :
    '<div class="propsSection">Regra CSS da classe</div>' +
    (classList.length > 1 ?
      '<div class="field"><label>Editando a classe</label><select id="pRuleClassPick">' +
        classList.map(function(c){ return '<option value="' + c + '"' + (c === ruleClass ? ' selected' : '') + '>.' + c + '</option>'; }).join('') +
      '</select></div>'
      : '<div class="field" style="color:var(--text-dim); font-size:12px;">Classe .' + ruleClass + '</div>') +
    '<div class="field"><textarea id="pClassRuleBody" rows="8" spellcheck="false" placeholder="background: #161920;\ncolor: #eef0f4;">' + getClassRuleBody(doc, '.' + ruleClass) + '</textarea></div>' +
    '<div class="field" style="color:var(--text-dim); font-size:11.5px;">Isso edita a regra <code>.' + ruleClass + '</code> no &lt;style&gt; — afeta todo elemento que usa essa classe, não só este.</div>';

  const allClassRules = getAllClassRules(doc);
  const currentClassStr = (el.className || '').trim();
  const classNamesInDoc = allClassRules.map(function(r){ return r.className; });

  let classSelectOptions = '<option value=""' + (!currentClassStr ? ' selected' : '') + '>(Sem classe)</option>';
  if(currentClassStr && !classNamesInDoc.includes(currentClassStr)){
    classSelectOptions += '<option value="' + currentClassStr.replace(/"/g, '&quot;') + '" selected>.' + currentClassStr + '</option>';
  }
  classNamesInDoc.forEach(function(c){
    const isSel = c === currentClassStr;
    classSelectOptions += '<option value="' + c + '"' + (isSel ? ' selected' : '') + '>.' + c + '</option>';
  });
  classSelectOptions += '<option value="__new__">+ Criar nova classe...</option>';
  classSelectOptions += '<option value="__custom__">✎ Texto livre...</option>';

  const selCount = effectiveSelection().length;
  propsBody.innerHTML =
    (selCount > 1 ?
      '<div class="field" style="color:var(--accent); font-size:12px; font-weight:700;">Editando ' + selCount + ' elementos selecionados — mudar um campo aqui muda todos.</div>'
      : '') +
    '<div class="field"><label>Elemento</label><div style="color:var(--text-dim)">' + shortLabel(el) + (selCount > 1 ? ' (principal)' : '') + '</div></div>' +
    (canEditText && selCount <= 1 ?
      '<div class="field"><label>Texto</label><textarea id="pTextContent" rows="2" style="resize:vertical;">' + escText(el.textContent || '') + '</textarea></div>'
      : '') +
    (isCheckableLabel && selCount <= 1 ?
      '<div class="field"><label>Texto da opção</label><input type="text" id="pCheckboxLabelText" value="' + esc(checkboxLabelText(el)) + '"></div>'
      : '') +
    '<div class="field"><label>Classe (CSS)</label><select id="pClassName">' + classSelectOptions + '</select></div>' +
    '<div class="field"><label>ID (pra JavaScript)</label><input type="text" id="pElId" placeholder="ex: titulo-principal" value="' + esc(el.id) + '">' +
      '<div class="fieldHint">Um id de verdade no HTML. No seu código da aba <code>{ } JS</code>, pegue o elemento com <code>document.getElementById(\'' + (el.id || 'seu-id') + '\')</code>.</div>' +
    '</div>' +

    classRuleHTML +

    attrsHTML +

    '<div class="propsSection">Layout</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Display</label><select id="pDisplay">' + opts(['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none'], displayVal) + '</select></div>' +
      '<div class="field"><label>Posição</label><select id="pPosition">' + opts(['absolute', 'relative', 'static', 'fixed'], positionVal) + '</select></div>' +
    '</div>' +
    (isFlex ?
      '<div class="field"><label>Direção</label>' + flexIconGroupHTML('pFlexDir', ['row', 'column', 'row-reverse', 'column-reverse'], cs.flexDirection, dirIconIcon) + '</div>' +
      '<div class="field"><label>Alinhar (align-items)</label>' + flexIconGroupHTML('pAlign', ['stretch', 'flex-start', 'center', 'flex-end'], cs.alignItems, alignIconIcon) + '</div>' +
      '<div class="field"><label>Distribuir (justify)</label>' + flexIconGroupHTML('pJustify', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'], cs.justifyContent, justifyIconIcon) + '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Quebra</label><select id="pFlexWrap">' + opts(['nowrap', 'wrap', 'wrap-reverse'], cs.flexWrap) + '</select></div>' +
        '<div class="field">' + iconFieldHTML('Gap', 'pGap', parseFloat(cs.gap) || 0, 'Gap entre itens (px)') + '</div>' +
      '</div>'
      : '') +

    (free ?
      '<div class="row3">' +
        '<div class="field">' + iconFieldHTML('X', 'pX', '', 'Posição X (px)') + '</div>' +
        '<div class="field">' + iconFieldHTML('Y', 'pY', '', 'Posição Y (px)') + '</div>' +
        '<div class="field">' + iconFieldHTML('Z', 'pZ', parseInt(el.style.zIndex) || 0, 'Z-index (camada)') + '</div>' +
      '</div>'
      : '') +

    '<div class="propsSection">Tamanho</div>' +
    '<div class="row2">' +
      '<div class="field"><div class="fieldRow">' + iconFieldHTML('W', 'pW', '', 'Largura') + '<select id="pWUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
      '<div class="field"><div class="fieldRow">' + iconFieldHTML('H', 'pH', '', 'Altura') + '<select id="pHUnit" title="Unidade — % é relativo ao elemento pai"><option value="px">px</option><option value="%">%</option></select></div></div>' +
    '</div>' +

    '<div class="propsSection">Cor</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fundo</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBg', cs.backgroundColor) + varDropdownHTML(doc, el.style.backgroundColor || el.style.background, 'pBgVar') + '</div></div>' +
      '<div class="field"><label>Texto</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pColor', cs.color) + varDropdownHTML(doc, el.style.color, 'pColorVar') + '</div></div>' +
    '</div>' +

    '<div class="propsSection">Aparência</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Fonte (família)</label><select id="pFontFamily">' + fontFamilyOptionsHTML(el.style.fontFamily) + '</select></div>' +
      '<div class="field"><label>Peso</label><select id="pFontWeight">' + opts(['400', '500', '600', '700', '800'], el.style.fontWeight || '400') + '</select></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Aa', 'pFont', parseFloat(cs.fontSize) || 14, 'Tamanho da fonte (px)') + '</div>' +
      '<div class="field"><label>Opacidade (' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '%)</label><input type="range" id="pOpacity" min="0" max="100" value="' + Math.round((parseFloat(cs.opacity) || 1) * 100) + '"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Blur', 'pBlur', parseFloat(((el.style.filter || cs.filter || '').match(/blur\(([\d.]+)px\)/) || [])[1]) || 0, 'Desfoque (blur, px)', ' min="0"') + '</div>' +
      '<div class="field"><label>Padrão de fundo</label><select id="pBgPattern">' + opts(['none', 'dots', 'grid'], currentBgPattern(el)) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Cor do padrão</label>' + colorSwatchHTML('pBgPatternColor', rgbToHex(cs.borderTopColor)) + '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Cantos' +
      '<button type="button" id="pRadiusLock" class="miniBtn active" title="Vincular os 4 cantos" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('TL', 'pRadiusTL', px(cs.borderTopLeftRadius), 'Topo-esquerda') + '</div>' +
      '<div class="field">' + iconFieldHTML('TR', 'pRadiusTR', px(cs.borderTopRightRadius), 'Topo-direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('BR', 'pRadiusBR', px(cs.borderBottomRightRadius), 'Baixo-direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('BL', 'pRadiusBL', px(cs.borderBottomLeftRadius), 'Baixo-esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Padding' +
      '<button type="button" id="pPadLock" class="miniBtn" title="Vincular os 4 lados" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('T', 'pPadT', px(cs.paddingTop), 'Topo') + '</div>' +
      '<div class="field">' + iconFieldHTML('R', 'pPadR', px(cs.paddingRight), 'Direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('B', 'pPadB', px(cs.paddingBottom), 'Baixo') + '</div>' +
      '<div class="field">' + iconFieldHTML('L', 'pPadL', px(cs.paddingLeft), 'Esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection" style="display:flex; align-items:center; gap:6px;">Margin' +
      '<button type="button" id="pMarLock" class="miniBtn" title="Vincular os 4 lados" style="margin-left:auto; padding:1px 6px; font-size:11px;">🔗</button>' +
    '</div>' +
    '<div class="row4">' +
      '<div class="field">' + iconFieldHTML('T', 'pMarT', px(cs.marginTop), 'Topo') + '</div>' +
      '<div class="field">' + iconFieldHTML('R', 'pMarR', px(cs.marginRight), 'Direita') + '</div>' +
      '<div class="field">' + iconFieldHTML('B', 'pMarB', px(cs.marginBottom), 'Baixo') + '</div>' +
      '<div class="field">' + iconFieldHTML('L', 'pMarL', px(cs.marginLeft), 'Esquerda') + '</div>' +
    '</div>' +

    '<div class="propsSection">Borda</div>' +
    '<div class="row2">' +
      '<div class="field">' + iconFieldHTML('Esp', 'pBorderW', px(cs.borderTopWidth), 'Espessura da borda (px)') + '</div>' +
      '<div class="field"><label>Estilo</label><select id="pBorderStyle">' + opts(['none', 'solid', 'dashed', 'dotted'], cs.borderTopStyle === 'none' ? 'none' : cs.borderTopStyle) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>Cor da borda</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('pBorderColor', cs.borderTopColor) + varDropdownHTML(doc, el.style.borderColor, 'pBorderColorVar') + '</div></div>' +

    '<hr>' +
    '<div class="field">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
        '<label>CSS livre (style)</label>' +
        '<button type="button" id="pExtractClass" class="miniBtn" title="Cria uma classe nova com esse estilo inline e aplica no elemento" style="font-size:11px; padding:2px 8px;"' + (el.getAttribute('style') ? '' : ' disabled') + '>→ Virar classe</button>' +
        (getRootVariables(doc).length ?
          '<select id="pInsertVarStyle" style="max-width:130px; font-size:11px;" title="Inserir variável do :root">' +
            '<option value="">+ Inserir var()...</option>' +
            getRootVariables(doc).map(function(v){ return '<option value="var(' + v.name + ')">' + v.name + ' (' + v.value + ')</option>'; }).join('') +
          '</select>' : '') +
      '</div>' +
      '<textarea id="pStyle" rows="6" spellcheck="false">' + (el.getAttribute('style') || '') + '</textarea>' +
    '</div>';

  const rect = elRectToStage(el);
  if(free){
    document.getElementById('pX').value = Math.round(parseFloat(el.style.left) || rect.left);
    document.getElementById('pY').value = Math.round(parseFloat(el.style.top) || rect.top);
  }
  function initSizeField(inputId, unitId, styleVal, pxFallback){
    const isPct = /%\s*$/.test(styleVal || '');
    document.getElementById(unitId).value = isPct ? '%' : 'px';
    document.getElementById(inputId).value = isPct ? Math.round(parseFloat(styleVal)) : Math.round(pxFallback);
  }
  initSizeField('pW', 'pWUnit', el.style.width, rect.width);
  initSizeField('pH', 'pHUnit', el.style.height, rect.height);

  bindAttributesSection(el);
  const pElIdInput = document.getElementById('pElId');
  if(pElIdInput){
    pElIdInput.addEventListener('input', function(){
      const v = this.value.trim();
      if(v) el.id = v; else el.removeAttribute('id');
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const pTextContentInput = document.getElementById('pTextContent');
  if(pTextContentInput){
    pTextContentInput.addEventListener('input', function(){
      el.textContent = this.value;
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const pCheckboxLabelTextInput = document.getElementById('pCheckboxLabelText');
  if(pCheckboxLabelTextInput){
    pCheckboxLabelTextInput.addEventListener('input', function(){
      setCheckboxLabelText(el, this.value);
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  }
  const pClassNameSelect = document.getElementById('pClassName');
  pClassNameSelect.addEventListener('change', async function(){
    const val = this.value;
    if(val === '__new__'){
      const name = await showPrompt('Nome da nova classe CSS (ex: btn-custom):', '', 'Nova Classe CSS');
      if(name && name.trim()){
        const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
        setClassRuleBody(doc, '.' + cleanName, '/* propriedades de .' + cleanName + ' */\nbackground-color: transparent;\ncolor: inherit;');
        el.className = cleanName;
        state.rulePickedClass = cleanName;
        pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
      } else {
        renderProps();
      }
    } else if(val === '__custom__'){
      const text = await showPrompt('Digite a(s) classe(s) separadas por espaço:', el.className || '', 'Editar Classe CSS');
      if(text !== null){
        el.className = text.trim();
        pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
      } else {
        renderProps();
      }
    } else {
      el.className = val;
      pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
    }
  });

  if(ruleClass){
    const pickEl = document.getElementById('pRuleClassPick');
    if(pickEl) pickEl.addEventListener('change', function(){ state.rulePickedClass = this.value; renderProps(); });
    const bodyEl = document.getElementById('pClassRuleBody');
    bodyEl.addEventListener('change', function(){
      setClassRuleBody(doc, '.' + ruleClass, bodyEl.value);
      pushHistory(); syncCodeFromCanvas();
    });
  }

  const pBgPattern = document.getElementById('pBgPattern');
  const pBgPatternColorBtn = document.getElementById('pBgPatternColor');
  function applyPattern(colorOverride){
    const color = colorOverride || (pBgPatternColorBtn ? pBgPatternColorBtn.dataset.color : '');
    effectiveSelection().forEach(function(t){ applyBgPattern(t, pBgPattern.value, color); });
    pushHistory(); syncCodeFromCanvas();
  }
  pBgPattern.addEventListener('change', function(){ applyPattern(); });
  bindColorSwatchSimple('pBgPatternColor', function(rgba){ applyPattern(rgba); });

  const pDisplay = document.getElementById('pDisplay');
  pDisplay.addEventListener('change', function(){
    effectiveSelection().forEach(function(t){ t.style.display = pDisplay.value; });
    pushHistory(); syncCodeFromCanvas(); renderLayers();
    renderProps();
    updateOverlayLive();
  });
  const pPosition = document.getElementById('pPosition');
  pPosition.addEventListener('change', function(){
    const v = pPosition.value;
    effectiveSelection().forEach(function(t){
      if(v === 'absolute' || v === 'fixed'){ ensureAbsolute(t); t.style.position = v; }
      else { t.style.position = v; }
    });
    pushHistory(); syncCodeFromCanvas(); renderOverlay();
    renderProps();
    updateOverlayLive();
  });
  if(isFlex){
    bindFlexIconGroup('pFlexDir', function(v, el){ el.style.flexDirection = v; });
    bindFlexIconGroup('pAlign', function(v, el){ el.style.alignItems = v; });
    bindFlexIconGroup('pJustify', function(v, el){ el.style.justifyContent = v; });
    bindProp('pFlexWrap', function(v, el){ el.style.flexWrap = v; }, 'change');
    bindProp('pGap', function(v, el){ el.style.gap = v + 'px'; });
  }
  if(free){ bindProp('pZ', function(v, el){ el.style.zIndex = v; }); }

  bindPropPrimaryOnly('pX', function(v){ el.style.left = v + 'px'; });
  bindPropPrimaryOnly('pY', function(v){ el.style.top = v + 'px'; });
  bindSizeProp('pW', 'pWUnit', 'width');
  bindSizeProp('pH', 'pHUnit', 'height');
  bindColorSwatch('pBg', function(v, el){ el.style.backgroundColor = v; });
  bindColorSwatch('pColor', function(v, el){ el.style.color = v; });
  bindProp('pFontFamily', applyFontFamily, 'change');
  bindProp('pFontWeight', function(v, el){ el.style.fontWeight = v; }, 'change');
  bindProp('pFont', function(v, el){ el.style.fontSize = v + 'px'; });
  bindLinkedBox('pRadiusLock', ['pRadiusTL', 'pRadiusTR', 'pRadiusBR', 'pRadiusBL'], ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']);
  bindProp('pOpacity', function(v, el){ el.style.opacity = (v / 100); });
  bindProp('pBlur', function(v, el){ el.style.filter = parseFloat(v) > 0 ? 'blur(' + v + 'px)' : ''; });

  bindLinkedBox('pPadLock', ['pPadT', 'pPadR', 'pPadB', 'pPadL'], ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']);
  bindLinkedBox('pMarLock', ['pMarT', 'pMarR', 'pMarB', 'pMarL'], ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']);

  bindProp('pBorderW', function(v, el){ el.style.borderWidth = v + 'px'; if(parseFloat(v) > 0 && (!el.style.borderStyle || el.style.borderStyle === 'none')) el.style.borderStyle = 'solid'; });
  bindProp('pBorderStyle', function(v, el){ el.style.borderStyle = v; if(v !== 'none' && (!el.style.borderWidth || parseFloat(el.style.borderWidth) === 0)) el.style.borderWidth = '1px'; }, 'change');
  bindColorSwatch('pBorderColor', function(v, el){ el.style.borderColor = v; });
  const pBgVar = document.getElementById('pBgVar');
  if(pBgVar){
    pBgVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.backgroundColor = pBgVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }
  const pColorVar = document.getElementById('pColorVar');
  if(pColorVar){
    pColorVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.color = pColorVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }
  const pBorderColorVar = document.getElementById('pBorderColorVar');
  if(pBorderColorVar){
    pBorderColorVar.addEventListener('change', function(){
      if(this.value){ effectiveSelection().forEach(function(t){ t.style.borderColor = pBorderColorVar.value; }); pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps(); }
    });
  }

  document.getElementById('pStyle').addEventListener('change', function(){
    el.setAttribute('style', this.value);
    pushHistory(); syncCodeFromCanvas(); updateOverlayLive(); renderProps();
  });

  const pInsertVarStyle = document.getElementById('pInsertVarStyle');
  if(pInsertVarStyle){
    pInsertVarStyle.addEventListener('change', function(){
      const val = this.value;
      if(!val) return;
      const pStyle = document.getElementById('pStyle');
      const cur = pStyle.value;
      const separator = (cur && !cur.endsWith(';') && !cur.endsWith('\n')) ? '; ' : '';
      pStyle.value = cur + separator + val;
      el.setAttribute('style', pStyle.value);
      pushHistory(); syncCodeFromCanvas();
      this.value = '';
    });
  }
  const pExtractClass = document.getElementById('pExtractClass');
  if(pExtractClass){
    pExtractClass.addEventListener('click', async function(){
      const inline = (el.getAttribute('style') || '').trim();
      if(!inline) return;
      const name = await showPrompt('Nome da nova classe (ex: card-destaque):', '', 'Virar classe');
      if(!name || !name.trim()) return;
      const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
      const body = inline.split(';').map(function(d){ return d.trim(); }).filter(Boolean).join(';\n');
      setClassRuleBody(doc, '.' + cleanName, body);
      el.className = (el.className ? el.className + ' ' : '') + cleanName;
      el.removeAttribute('style');
      state.rulePickedClass = cleanName;
      pushHistory(); syncCodeFromCanvas(); renderLayers(); renderProps();
    });
  }
  wrapPropsSections(propsBody);
  if(state.propsSearchQuery) filterPropsBySearch(state.propsSearchQuery);
}

// applies fn(value, targetEl) to every element in the current selection
// (not just the primary one), so with several elements selected, changing
// one field changes all of them at once.
function bindProp(id, fn, evt){
  const input = document.getElementById(id);
  if(!input) return;
  input.addEventListener(evt || 'input', function(){
    effectiveSelection().forEach(function(target){ fn(input.value, target); });
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  });
}

// X/Y are absolute pixel coordinates — copying the same ones onto every
// selected element would stack them on top of each other, so those two
// stay primary-only (use Alinhar/Distribuir for multi-element positioning).
function bindPropPrimaryOnly(id, fn, evt){
  const input = document.getElementById(id);
  if(!input) return;
  input.addEventListener(evt || 'input', function(){
    fn(input.value);
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  });
}

// padding/margin's 4-sides-at-once lock — a Figma-style toggle so dragging
// one side can drive all four instead of editing each field separately.
function bindLinkedBox(lockId, sideIds, styleProps){
  const lockBtn = document.getElementById(lockId);
  if(!lockBtn) return;
  lockBtn.addEventListener('click', function(){
    lockBtn.classList.toggle('active');
  });
  sideIds.forEach(function(id, i){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener('input', function(){
      const linked = lockBtn.classList.contains('active');
      if(linked){
        sideIds.forEach(function(otherId){ if(otherId !== id) document.getElementById(otherId).value = input.value; });
      }
      effectiveSelection().forEach(function(target){
        if(linked) styleProps.forEach(function(p){ target.style[p] = input.value + 'px'; });
        else target.style[styleProps[i]] = input.value + 'px';
      });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  });
}

// width/height need a unit toggle (px vs %) instead of always hardcoding
// px — a flex child sized "50%" of its parent should stay 50% if the
// artboard gets resized, not a pixel number computed by hand once.
function bindSizeProp(inputId, unitId, styleProp){
  const input = document.getElementById(inputId);
  const unitSel = document.getElementById(unitId);
  if(!input || !unitSel) return;
  function apply(){
    const val = input.value + unitSel.value;
    effectiveSelection().forEach(function(t){ t.style[styleProp] = val; });
    updateOverlayLive();
    clearTimeout(codeDebounce);
    codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
  }
  input.addEventListener('input', apply);
  unitSel.addEventListener('change', apply);
}

function rgbToHex(rgb){
  if(!rgb || rgb.indexOf('rgb') !== 0) return '#ffffff';
  const nums = rgb.match(/[\d.]+/g).map(Number);
  return '#' + nums.slice(0, 3).map(function(n){ return n.toString(16).padStart(2, '0'); }).join('');
}

