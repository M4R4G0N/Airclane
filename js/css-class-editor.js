"use strict";

// ---------- FASE 08: Editor de CSS Estruturado & Biblioteca de Classes ----------

let activeCssClass = null;
let cssClassSearchFilter = '';

function getAllClassRules(doc){
  const cssText = getStyleText(doc);
  const rulesMap = new Map();
  const re = /\.([a-zA-Z0-9_-]+)\s*\{([\s\S]*?)\}/g;
  let match;
  while((match = re.exec(cssText)) !== null){
    const className = match[1];
    const selector = '.' + className;
    const body = match[2].trim();
    if(!rulesMap.has(className)){
      let usageCount = 0;
      try { usageCount = doc.querySelectorAll(selector).length; } catch(e){}
      rulesMap.set(className, { selector: selector, className: className, body: body, count: usageCount });
    }
  }
  return Array.from(rulesMap.values());
}

// the class library spans every artboard, not just the active one — this is
// what actually lets a class made on one screen get reused on another
// without retyping its CSS (each artboard's <style> is otherwise its own
// isolated document, so without this a "library" would just be a list of
// whatever happens to already be in the artboard you're looking at).
function getAllClassRulesAcrossArtboards(){
  const map = new Map();
  artboards.forEach(function(ab){
    let doc; try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
    if(!doc) return;
    getAllClassRules(doc).forEach(function(rule){
      let entry = map.get(rule.className);
      if(!entry){
        entry = { className: rule.className, body: rule.body, count: 0, artboardNames: [] };
        map.set(rule.className, entry);
      }
      entry.count += rule.count;
      entry.artboardNames.push(ab.name);
    });
  });
  return Array.from(map.values()).sort(function(a, b){ return a.className.localeCompare(b.className); });
}

// copies a class's rule body into the active artboard's <style> if it isn't
// defined there yet, sourcing it from wherever else in the project it
// already exists — the "reuse without rewriting CSS" part of the library.
function ensureClassRuleInActiveDoc(className){
  const doc = getDoc();
  if(!doc || !className) return;
  if(findRuleBlock(getStyleText(doc), '.' + className)) return;
  const found = getAllClassRulesAcrossArtboards().find(function(r){ return r.className === className; });
  if(found) setClassRuleBody(doc, '.' + className, found.body);
}

function getRootVariables(doc){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  if(!found) return [];
  const vars = [];
  const lines = found.body.split(';');
  lines.forEach(function(l){
    const parts = l.split(':');
    if(parts.length >= 2){
      const name = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      if(name.startsWith('--')){
        vars.push({ name: name, value: val });
      }
    }
  });
  return vars;
}

function varDropdownHTML(doc, currentVal, selectId){
  const vars = getRootVariables(doc);
  if(!vars.length) return '';
  let options = '<option value="">(Cor / Custom)</option>';
  vars.forEach(function(v){
    const vStr = 'var(' + v.name + ')';
    const sel = (currentVal || '').indexOf(v.name) !== -1;
    options += '<option value="' + vStr + '"' + (sel ? ' selected' : '') + '>' + v.name + '</option>';
  });
  return '<select id="' + selectId + '" style="max-width:115px; font-size:11px; padding:2px 4px;" title="Usar variável do :root">' + options + '</select>';
}

function setRootVariable(doc, varName, value){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  let vars = getRootVariables(doc);
  const existing = vars.find(function(v){ return v.name === varName; });
  if(existing){ existing.value = value; }
  else { vars.push({ name: varName, value: value }); }

  const newBody = vars.map(function(v){ return v.name + ': ' + v.value + ';'; }).join('\n  ');
  const block = ':root {\n  ' + newBody + '\n}';
  const updated = found
    ? cssText.slice(0, found.index) + block + cssText.slice(found.index + found.full.length)
    : block + '\n\n' + cssText;
  setStyleText(doc, updated);
}

function deleteRootVariable(doc, varName){
  const cssText = getStyleText(doc);
  const found = findRuleBlock(cssText, ':root');
  if(!found) return;
  let vars = getRootVariables(doc).filter(function(v){ return v.name !== varName; });
  if(!vars.length){
    setStyleText(doc, cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length).trim());
  } else {
    const newBody = vars.map(function(v){ return v.name + ': ' + v.value + ';'; }).join('\n  ');
    const block = ':root {\n  ' + newBody + '\n}';
    setStyleText(doc, cssText.slice(0, found.index) + block + cssText.slice(found.index + found.full.length));
  }
}

function deleteClassRule(doc, selector){
  let cssText = getStyleText(doc);
  let found;
  while((found = findRuleBlock(cssText, selector)) !== null){
    cssText = cssText.slice(0, found.index) + cssText.slice(found.index + found.full.length).trim();
  }
  setStyleText(doc, cssText);
}

function parseCssDeclarations(bodyText){
  const map = {};
  if(!bodyText) return map;
  const lines = bodyText.split(';');
  lines.forEach(function(line){
    const colonIdx = line.indexOf(':');
    if(colonIdx !== -1){
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      if(key) map[key] = val;
    }
  });
  return map;
}

function renderCssEditorModal(){
  const doc = getDoc();
  if(!doc) return;

  // the class picked from the sidebar may live in another artboard's
  // stylesheet only — pull it into this artboard before editing/using it.
  if(activeCssClass) ensureClassRuleInActiveDoc(activeCssClass);

  // Render Class Library List — spans every artboard in the project, not
  // just the active one, so a class made anywhere shows up as reusable here.
  const classListContainer = document.getElementById('cssClassList');
  const libraryRules = getAllClassRulesAcrossArtboards();
  const localClassNames = new Set(getAllClassRules(doc).map(function(r){ return r.className; }));
  const filtered = libraryRules.filter(function(r){
    return !cssClassSearchFilter || r.className.toLowerCase().includes(cssClassSearchFilter);
  });

  if(!activeCssClass && filtered.length > 0){
    activeCssClass = filtered[0].className;
    ensureClassRuleInActiveDoc(activeCssClass);
  } else if(activeCssClass && !libraryRules.some(function(r){ return r.className === activeCssClass; })){
    activeCssClass = filtered.length > 0 ? filtered[0].className : null;
  }

  classListContainer.innerHTML = '';
  if(!filtered.length){
    classListContainer.innerHTML = '<div style="color:var(--text-dim); font-size:12px; padding:12px; text-align:center;">Nenhuma classe encontrada.</div>';
  } else {
    filtered.forEach(function(rule){
      const item = document.createElement('div');
      const isLocal = localClassNames.has(rule.className);
      item.className = 'css-class-item' + (rule.className === activeCssClass ? ' active' : '');
      item.innerHTML = '<span class="class-name">.' + rule.className + '</span>' +
        (isLocal ? '' : '<span class="class-badge" title="Definida em: ' + rule.artboardNames.join(', ') + ' — clique pra reaproveitar aqui">outro artboard</span>') +
        '<span class="class-count">' + rule.count + ' uso' + (rule.count !== 1 ? 's' : '') + '</span>';
      item.addEventListener('click', function(){
        activeCssClass = rule.className;
        ensureClassRuleInActiveDoc(rule.className);
        renderCssEditorModal();
      });
      classListContainer.appendChild(item);
    });
  }

  // Render Form for Active Class — always edits the copy in the active
  // artboard's own stylesheet (ensureClassRuleInActiveDoc above guarantees
  // one exists there by this point).
  const formContainer = document.getElementById('cssClassFormContainer');
  const rules = getAllClassRules(doc);
  if(!activeCssClass){
    formContainer.innerHTML = '<div class="css-empty-state">Selecione ou crie uma classe na lista ao lado para editar suas propriedades.</div>';
  } else {
    const activeRule = rules.find(function(r){ return r.className === activeCssClass; }) || { selector: '.' + activeCssClass, className: activeCssClass, body: '' };
    const decls = parseCssDeclarations(activeRule.body);

    function getVal(prop){ return decls[prop] || ''; }

    formContainer.innerHTML =
      '<div class="css-class-header-bar">' +
        '<h3>.' + activeCssClass + '</h3>' +
        '<div class="css-class-actions">' +
          (state.selected ? '<button type="button" class="miniBtn primary" id="btnApplyClassToSelected" title="Adiciona esta classe ao elemento atualmente selecionado">+ Aplicar ao elemento</button>' : '') +
          '<button type="button" class="miniBtn danger" id="btnDeleteCssClass">Excluir classe</button>' +
        '</div>' +
      '</div>' +

      '<div class="css-section-title">Tipografia</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Família da fonte</label><input type="text" id="css_font_family" value="' + getVal('font-family').replace(/"/g, '&quot;') + '" placeholder="ex: Inter, sans-serif"></div>' +
        '<div class="field"><label>Tamanho (font-size)</label><input type="text" id="css_font_size" value="' + getVal('font-size') + '" placeholder="ex: 16px"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Peso (font-weight)</label><input type="text" id="css_font_weight" value="' + getVal('font-weight') + '" placeholder="ex: 600, bold"></div>' +
        '<div class="field"><label>Cor do texto</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_color', getVal('color') || '#000000') + varDropdownHTML(doc, getVal('color'), 'css_color_var') + '</div></div>' +
      '</div>' +

      '<div class="css-section-title">Fundo &amp; Superfície</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Cor de fundo</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_bg_color', getVal('background-color') || '#000000') + varDropdownHTML(doc, getVal('background-color'), 'css_bg_color_var') + '</div></div>' +
        '<div class="field"><label>Cantos (border-radius)</label><input type="text" id="css_border_radius" value="' + getVal('border-radius') + '" placeholder="ex: 8px"></div>' +
      '</div>' +
      '<div class="field"><label>Sombra (box-shadow)</label><input type="text" id="css_box_shadow" value="' + getVal('box-shadow').replace(/"/g, '&quot;') + '" placeholder="ex: 0 4px 12px rgba(0,0,0,0.1)"></div>' +

      '<div class="css-section-title">Espaçamento (Padding &amp; Margin)</div>' +
      '<div class="row4">' +
        '<div class="field"><label>Pad T</label><input type="text" id="css_pad_t" value="' + getVal('padding-top') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad R</label><input type="text" id="css_pad_r" value="' + getVal('padding-right') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad B</label><input type="text" id="css_pad_b" value="' + getVal('padding-bottom') + '" placeholder="0"></div>' +
        '<div class="field"><label>Pad L</label><input type="text" id="css_pad_l" value="' + getVal('padding-left') + '" placeholder="0"></div>' +
      '</div>' +
      '<div class="row4">' +
        '<div class="field"><label>Mar T</label><input type="text" id="css_mar_t" value="' + getVal('margin-top') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar R</label><input type="text" id="css_mar_r" value="' + getVal('margin-right') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar B</label><input type="text" id="css_mar_b" value="' + getVal('margin-bottom') + '" placeholder="0"></div>' +
        '<div class="field"><label>Mar L</label><input type="text" id="css_mar_l" value="' + getVal('margin-left') + '" placeholder="0"></div>' +
      '</div>' +

      '<div class="css-section-title">Layout &amp; Tamanho</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Display</label><input type="text" id="css_display" value="' + getVal('display') + '" placeholder="ex: flex, block"></div>' +
        '<div class="field"><label>Gap</label><input type="text" id="css_gap" value="' + getVal('gap') + '" placeholder="ex: 12px"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Largura (width)</label><input type="text" id="css_width" value="' + getVal('width') + '" placeholder="ex: 100%, 300px"></div>' +
        '<div class="field"><label>Altura (height)</label><input type="text" id="css_height" value="' + getVal('height') + '" placeholder="ex: auto, 50px"></div>' +
      '</div>' +

      '<div class="css-section-title">Borda</div>' +
      '<div class="row3">' +
        '<div class="field"><label>Espessura</label><input type="text" id="css_border_w" value="' + getVal('border-width') + '" placeholder="1px"></div>' +
        '<div class="field"><label>Estilo</label><input type="text" id="css_border_s" value="' + getVal('border-style') + '" placeholder="solid"></div>' +
        '<div class="field"><label>Cor</label><div class="fieldRow" style="display:flex; gap:4px;">' + colorSwatchHTML('css_border_c', getVal('border-color') || '#000000') + varDropdownHTML(doc, getVal('border-color'), 'css_border_c_var') + '</div></div>' +
      '</div>' +

      '<div class="css-section-title" style="display:flex; justify-content:space-between; align-items:center;">' +
        '<span>Corpo da Regra CSS (Texto Bruto)</span>' +
        (getRootVariables(doc).length ?
          '<select id="cssInsertVarSelect" style="max-width:180px; font-size:11.5px; padding:2px 6px;" title="Inserir variável do :root no código">' +
            '<option value="">+ Inserir var(:root)...</option>' +
            getRootVariables(doc).map(function(v){ return '<option value="var(' + v.name + ')">' + v.name + ' (' + v.value + ')</option>'; }).join('') +
          '</select>' : '') +
      '</div>' +
      '<div class="field"><textarea id="cssRawBody" rows="6" spellcheck="false" placeholder="background: var(--bg-dark);\ncolor: var(--primary-color);">' + activeRule.body + '</textarea></div>';

    const rawTextarea = document.getElementById('cssRawBody');
    const cssInsertVarSelect = document.getElementById('cssInsertVarSelect');

    function saveCurrentClassRule(newBodyText){
      setClassRuleBody(doc, '.' + activeCssClass, newBodyText);
      pushHistory(); syncCodeFromCanvas(); renderProps();
    }

    if(cssInsertVarSelect){
      cssInsertVarSelect.addEventListener('change', function(){
        const v = this.value;
        if(!v) return;
        const cur = rawTextarea.value;
        const insertText = (cur && !cur.endsWith('\n') && !cur.endsWith(' ') ? ' ' : '') + v + ';';
        rawTextarea.value = cur + insertText;
        saveCurrentClassRule(rawTextarea.value);
        this.value = '';
        renderCssEditorModal();
      });
    }

    ['css_color_var', 'css_bg_color_var', 'css_border_c_var'].forEach(function(varId){
      const selEl = document.getElementById(varId);
      if(!selEl) return;
      selEl.addEventListener('change', function(){
        if(!this.value) return;
        const propName = varId === 'css_color_var' ? 'color' : (varId === 'css_bg_color_var' ? 'background-color' : 'border-color');
        decls[propName] = this.value;
        const updatedBody = Object.keys(decls).map(function(k){ return k + ': ' + decls[k] + ';'; }).join('\n  ');
        rawTextarea.value = updatedBody;
        saveCurrentClassRule(updatedBody);
        renderCssEditorModal();
      });
    });

    rawTextarea.addEventListener('change', function(){
      saveCurrentClassRule(this.value);
      renderCssEditorModal();
    });

    const fieldMap = [
      { id: 'css_font_family', prop: 'font-family' },
      { id: 'css_font_size', prop: 'font-size' },
      { id: 'css_font_weight', prop: 'font-weight' },
      { id: 'css_border_radius', prop: 'border-radius' },
      { id: 'css_box_shadow', prop: 'box-shadow' },
      { id: 'css_pad_t', prop: 'padding-top' },
      { id: 'css_pad_r', prop: 'padding-right' },
      { id: 'css_pad_b', prop: 'padding-bottom' },
      { id: 'css_pad_l', prop: 'padding-left' },
      { id: 'css_mar_t', prop: 'margin-top' },
      { id: 'css_mar_r', prop: 'margin-right' },
      { id: 'css_mar_b', prop: 'margin-bottom' },
      { id: 'css_mar_l', prop: 'margin-left' },
      { id: 'css_display', prop: 'display' },
      { id: 'css_gap', prop: 'gap' },
      { id: 'css_width', prop: 'width' },
      { id: 'css_height', prop: 'height' },
      { id: 'css_border_w', prop: 'border-width' },
      { id: 'css_border_s', prop: 'border-style' }
    ];

    function setDecl(prop, val){
      if(val) decls[prop] = val;
      else delete decls[prop];
      const updatedBody = Object.keys(decls).map(function(k){ return k + ': ' + decls[k] + ';'; }).join('\n  ');
      rawTextarea.value = updatedBody;
      saveCurrentClassRule(updatedBody);
    }

    fieldMap.forEach(function(item){
      const input = document.getElementById(item.id);
      if(!input) return;
      input.addEventListener('change', function(){
        setDecl(item.prop, input.value.trim());
      });
    });

    [
      { id: 'css_color', prop: 'color' },
      { id: 'css_bg_color', prop: 'background-color' },
      { id: 'css_border_c', prop: 'border-color' }
    ].forEach(function(item){
      bindColorSwatchSimple(item.id, function(rgba){ setDecl(item.prop, rgba); });
    });

    const btnApply = document.getElementById('btnApplyClassToSelected');
    if(btnApply){
      btnApply.addEventListener('click', function(){
        if(state.selected){
          const currentClasses = (state.selected.className || '').trim().split(/\s+/).filter(Boolean);
          if(!currentClasses.includes(activeCssClass)){
            currentClasses.push(activeCssClass);
            state.selected.className = currentClasses.join(' ');
            pushHistory(); syncCodeFromCanvas(); renderProps();
            renderCssEditorModal();
          }
        }
      });
    }

    const btnDel = document.getElementById('btnDeleteCssClass');
    if(btnDel){
      btnDel.addEventListener('click', async function(){
        if(await showConfirm('Excluir a classe .' + activeCssClass + '? Essa ação altera o estilo de todos os elementos que a usam.', 'Excluir classe CSS', true)){
          deleteClassRule(doc, '.' + activeCssClass);
          activeCssClass = null;
          pushHistory(); syncCodeFromCanvas(); renderProps();
          renderCssEditorModal();
        }
      });
    }
  }

  // Render Variables Tab
  const varListContainer = document.getElementById('cssVarList');
  const vars = getRootVariables(doc);
  varListContainer.innerHTML = '';

  if(!vars.length){
    varListContainer.innerHTML = '<div style="color:var(--text-dim); font-size:13px; padding:12px 0;">Nenhuma variável CSS definida em <code>:root</code>. Clique acima para criar a primeira!</div>';
  } else {
    vars.forEach(function(v){
      const row = document.createElement('div');
      row.className = 'css-var-row';

      const isHex = v.value.startsWith('#') || v.value.startsWith('rgb');
      const rowColor = v.value.startsWith('#') ? v.value : rgbToHex(v.value);
      const colorInputHTML = isHex ? '<button type="button" class="colorSwatchBtn" data-color="' + rowColor.replace(/"/g, '&quot;') + '"><span style="background:' + rowColor + '"></span></button>' : '';

      row.innerHTML =
        '<input type="text" class="var-name" value="' + v.name + '" placeholder="--var-name">' +
        '<input type="text" class="var-val" value="' + v.value.replace(/"/g, '&quot;') + '" placeholder="valor">' +
        colorInputHTML +
        '<button type="button" class="miniBtn danger var-del" title="Excluir variável">✕</button>';

      const nameInput = row.querySelector('.var-name');
      const valInput = row.querySelector('.var-val');
      const colorInput = row.querySelector('.colorSwatchBtn');
      const delBtn = row.querySelector('.var-del');

      nameInput.addEventListener('change', function(){
        deleteRootVariable(doc, v.name);
        const newName = nameInput.value.trim().startsWith('--') ? nameInput.value.trim() : '--' + nameInput.value.trim();
        setRootVariable(doc, newName, valInput.value.trim());
        pushHistory(); syncCodeFromCanvas(); renderProps();
      });

      valInput.addEventListener('change', function(){
        setRootVariable(doc, nameInput.value.trim(), valInput.value.trim());
        pushHistory(); syncCodeFromCanvas(); renderProps();
      });

      if(colorInput){
        colorInput.addEventListener('click', function(e){
          e.stopPropagation();
          openColorPopover(colorInput, colorInput.dataset.color, function(rgba){
            colorInput.dataset.color = rgba;
            colorInput.querySelector('span').style.background = rgba;
            valInput.value = rgba;
            setRootVariable(doc, nameInput.value.trim(), rgba);
            pushHistory(); syncCodeFromCanvas(); renderProps();
          });
        });
      }

      delBtn.addEventListener('click', function(){
        deleteRootVariable(doc, v.name);
        pushHistory(); syncCodeFromCanvas(); renderProps();
        renderCssEditorModal();
      });

      varListContainer.appendChild(row);
    });
  }
}

// Open / Close / Wire Modal Events
const cssEditorModal = document.getElementById('cssEditorModal');
document.getElementById('btnCssEditor').addEventListener('click', function(){
  cssEditorModal.style.display = 'flex';
  renderCssEditorModal();
});
document.getElementById('btnCloseCssEditor').addEventListener('click', function(){
  cssEditorModal.style.display = 'none';
});

// Modal Tabs
document.getElementById('tabBtnClasses').addEventListener('click', function(){
  this.classList.add('active');
  document.getElementById('tabBtnVariables').classList.remove('active');
  document.getElementById('cssTabClasses').classList.add('active');
  document.getElementById('cssTabVariables').classList.remove('active');
});
document.getElementById('tabBtnVariables').addEventListener('click', function(){
  this.classList.add('active');
  document.getElementById('tabBtnClasses').classList.remove('active');
  document.getElementById('cssTabVariables').classList.add('active');
  document.getElementById('cssTabClasses').classList.remove('active');
});

// Search input
document.getElementById('cssClassSearchInput').addEventListener('input', function(){
  cssClassSearchFilter = this.value.trim().toLowerCase();
  renderCssEditorModal();
});

// New Class Button
document.getElementById('btnNewCssClass').addEventListener('click', async function(){
  const name = await showPrompt('Nome da nova classe CSS (ex: card-custom ou btn-highlight):', '', 'Nova Classe CSS');
  if(name && name.trim()){
    const cleanName = name.trim().replace(/^\./, '').replace(/\s+/g, '-');
    const doc = getDoc();
    if(doc){
      setClassRuleBody(doc, '.' + cleanName, '/* propriedades de .' + cleanName + ' */\nbackground-color: transparent;\ncolor: inherit;');
      activeCssClass = cleanName;
      pushHistory(); syncCodeFromCanvas(); renderProps();
      renderCssEditorModal();
    }
  }
});

// New Variable Button
document.getElementById('btnNewCssVar').addEventListener('click', async function(){
  const name = await showPrompt('Nome da nova variável CSS (ex: --accent-color ou --card-radius):', '--', 'Nova Variável CSS');
  if(name && name.trim()){
    const cleanName = name.trim().startsWith('--') ? name.trim() : '--' + name.trim();
    const doc = getDoc();
    if(doc){
      setRootVariable(doc, cleanName, '#35d0a4');
      pushHistory(); syncCodeFromCanvas(); renderProps();
      renderCssEditorModal();
    }
  }
});

// ---------- color popover wiring (one-time — #colorPopover is permanent DOM) ----------

// drags within a picker rectangle report a 0–1 fraction on each axis —
// shared by the S/V square (uses both x and y) and the hue/alpha bars
// (use only x), and keeps tracking on mousemove/mouseup at the window
// level so the pointer can leave the element mid-drag without stopping.
function bindColorDrag(el, onMove){
  function compute(e){
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  }
  el.addEventListener('mousedown', function(e){
    e.preventDefault();
    onMove(compute(e));
    function moveHandler(ev){ onMove(compute(ev)); }
    function upHandler(){
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    }
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  });
}
bindColorDrag(document.getElementById('cpSV'), function(pt){
  cpHSV.s = pt.x; cpHSV.v = 1 - pt.y;
  renderColorPopover(true);
});
bindColorDrag(document.getElementById('cpHueSlider'), function(pt){
  cpHSV.h = pt.x * 360;
  renderColorPopover(true);
});
bindColorDrag(document.getElementById('cpAlphaSlider'), function(pt){
  cpHSV.a = pt.x;
  renderColorPopover(true);
});
document.getElementById('cpText').addEventListener('change', function(){
  const parts = parseColorParts(this.value);
  const hsv = rgbToHsv(parts.r, parts.g, parts.b);
  cpHSV = { h: hsv.h, s: hsv.s, v: hsv.v, a: parts.a };
  renderColorPopover(true);
});
document.getElementById('cpEyedrop').addEventListener('click', function(e){
  e.stopPropagation();
  if(colorPickingActive) stopColorPicking(); else startColorPicking();
});
// mousedown preventDefault (not click) is what keeps focus — and the live
// selection — inside the iframe's contenteditable element while these
// buttons are used; without it the browser blurs the editable region before
// the click even fires, collapsing the selection first.
['tfbBold', 'tfbItalic', 'tfbUnderline', 'tfbSizeDown', 'tfbSizeUp'].forEach(function(id){
  const btn = document.getElementById(id);
  if(btn) btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
});
document.getElementById('tfbBold').addEventListener('click', function(){ applyTextFormatCommand('bold'); });
document.getElementById('tfbItalic').addEventListener('click', function(){ applyTextFormatCommand('italic'); });
document.getElementById('tfbUnderline').addEventListener('click', function(){ applyTextFormatCommand('underline'); });
document.getElementById('tfbSizeDown').addEventListener('click', function(){ applyTextFormatSize(-2); });
document.getElementById('tfbSizeUp').addEventListener('click', function(){ applyTextFormatSize(2); });
document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('colorPopover');
  if(!pop.classList.contains('open')) return;
  if(pop.contains(e.target) || e.target.closest('.colorSwatchBtn')) return;
  closeColorPopover();
});

document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('colorPopover');
  if(!pop.classList.contains('open')) return;
  if(pop.contains(e.target) || e.target.closest('.colorSwatchBtn')) return;
  closeColorPopover();
});

