"use strict";

// ---------- FASE 10: Barra de fórmulas (Power Apps style) ----------
// Syntactic sugar over document.querySelector — lets users write
// JavaScript expressions referencing elements by their layer names
// (data-ae-name) instead of raw selectors.
//
// Examples:
//   div_1.hide()
//   div_1.text = "hello"
//   div_1.style.backgroundColor = "#ff0000"
//   card_1.toggle()
//   btn_ok.show() && card_1.hide()
//
// The formula is compiled to a self-contained script that runs inside
// the artboard's iframe, with a tiny runtime that maps names to elements.
// Exported HTML gets the same runtime inlined so formulas work standalone.

// Which properties/actions show up in autocomplete after typing "name."
const FORMULA_PROPERTIES = [
  { name: 'text', kind: 'prop', desc: 'textContent' },
  { name: 'html', kind: 'prop', desc: 'innerHTML' },
  { name: 'value', kind: 'prop', desc: 'input value' },
  { name: 'style', kind: 'obj', desc: 'CSSStyleDeclaration' },
  { name: 'classList', kind: 'obj', desc: 'DOMTokenList' },
  { name: 'id', kind: 'prop', desc: 'element id' },
  { name: 'hide', kind: 'fn', desc: 'style.display = "none"' },
  { name: 'show', kind: 'fn', desc: 'style.display = ""' },
  { name: 'toggle', kind: 'fn', desc: 'toggle visibility' },
  { name: 'focus', kind: 'fn', desc: 'element.focus()' },
  { name: 'click', kind: 'fn', desc: 'element.click()' },
  { name: 'remove', kind: 'fn', desc: 'element.remove()' },
  { name: 'scrollIntoView', kind: 'fn', desc: 'scroll into view' }
];

// Collect all named elements from the active artboard's document.
function getFormulaNames(){
  const doc = getDoc();
  if(!doc || !doc.body) return [];
  const names = [];
  function walk(el){
    if(!isEditableEl(el, doc)) return;
    if(el.dataset.aeName) names.push(el.dataset.aeName);
    Array.from(el.children).forEach(walk);
  }
  Array.from(doc.body.children).forEach(walk);
  return names;
}

// The proxy is the sugar: it intercepts property access so .hide(),
// .show(), .toggle() etc. work as methods, while everything else falls
// through to the real DOM element. Shared by the editor runtime and the
// runtime inlined into exported HTML (which looks elements up by the
// throwaway data-ae-eid instead of data-ae-name).
const AE_FORMULA_PROXY_SRC =
  'function _aeProxy(el){' +
    'if(!el)return{};' +
    'return new Proxy(el,{' +
      'get:function(t,k){' +
        'if(k==="hide")return function(){t.style.display="none";};' +
        'if(k==="show")return function(){t.style.display="";};' +
        'if(k==="toggle")return function(){t.style.display=t.style.display==="none"?"":"none";};' +
        'if(k==="text")return t.textContent;' +
        'if(k==="html")return t.innerHTML;' +
        'if(k==="value")return t.value;' +
        'var v=t[k];' +
        'return typeof v==="function"?v.bind(t):v;' +
      '},' +
      'set:function(t,k,v){' +
        'if(k==="text"){t.textContent=v;return true;}' +
        'if(k==="html"){t.innerHTML=v;return true;}' +
        'if(k==="value"){t.value=v;return true;}' +
        't[k]=v;return true;' +
      '}' +
    '});' +
  '}';

// One "var name=_aeProxy(document.querySelector(...))" per pair
// ({ safe, selector }).
function buildFormulaDecls(pairs){
  return pairs.map(function(p){
    return 'var ' + p.safe + '=_aeProxy(document.querySelector(\'' + p.selector.replace(/'/g, "\\'") + '\'));';
  }).join('');
}

// Build a small runtime script that declares each named element as a
// variable pointing to a proxy. The optional body (the user's formula)
// is wrapped INSIDE the same IIFE as the declarations — running it after
// the closure would leave every name out of scope ("x is not defined").
function buildFormulaRuntime(doc, body){
  const pairs = [];
  function walk(el){
    if(!isEditableEl(el, doc)) return;
    if(el.dataset.aeName){
      pairs.push({
        safe: el.dataset.aeName.replace(/[^a-zA-Z0-9_$]/g, '_'),
        selector: '[data-ae-name="' + el.dataset.aeName.replace(/"/g, '\\"') + '"]'
      });
    }
    Array.from(el.children).forEach(walk);
  }
  if(doc && doc.body) Array.from(doc.body.children).forEach(walk);
  if(!pairs.length && !body) return '';

  // One runtime per artboard — idempotent if re-run (overwrites vars).
  return '(function(){' +
      AE_FORMULA_PROXY_SRC +
      buildFormulaDecls(pairs) +
      (body ? '\n' + body + '\n' : '') +
    '})();';
}

// Compile a user-written formula into executable JS by prefixing the
// runtime and wrapping the expression in a try/catch.
function compileFormula(formula){
  const doc = getDoc();
  if(!doc || !doc.body) return null;
  const safeNames = getFormulaNames().map(function(n){ return n.replace(/[^a-zA-Z0-9_$]/g, '_'); });
  // basic sanity: reject assignment to unknown identifiers (typos)
  const unknownIdRe = /\b([a-zA-Z_$][\w$]*)\b/g;
  let m;
  while((m = unknownIdRe.exec(formula)) !== null){
    const id = m[1];
    // skip JS keywords and built-ins
    const jsKeywords = ['var','let','const','function','return','if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','new','this','true','false','null','undefined','typeof','instanceof','in','of','void','delete','document','window','console','Math','Date','JSON','parseInt','parseFloat','isNaN','isFinite','alert','confirm','prompt','setTimeout','setInterval','clearTimeout','clearInterval','encodeURI','decodeURI','encodeURIComponent','decodeURIComponent','escape','unescape','eval','String','Number','Boolean','Array','Object','RegExp','Error','Date','Map','Set','Promise','Symbol','BigInt','Infinity','NaN'];
    if(jsKeywords.indexOf(id) !== -1) continue;
    if(safeNames.indexOf(id) === -1 && id !== 'style' && id !== 'classList'){
      // allow property chains like el.style.color — 'style' alone is ok
      // but 'unknownName.something' should warn
      const chainCheck = new RegExp('\\b' + id + '\\s*\\.');
      if(chainCheck.test(formula)){
        return { error: 'Nome desconhecido: "' + id + '". Use os nomes das camadas (data-ae-name) ou IDs do documento.' };
      }
    }
  }
  const wrapped = buildFormulaRuntime(doc, 'try{\n  ' + formula + ';\n}catch(e){\n  console.error("[Fórmula]", e.message);\n}');
  return { code: wrapped };
}

// Execute the compiled formula inside the active artboard's iframe.
function runFormula(formula){
  const doc = getDoc();
  const frame = getFrame();
  if(!doc || !frame) return { ok: false, error: 'Nenhum artboard ativo.' };
  const compiled = compileFormula(formula);
  if(compiled.error) return { ok: false, error: compiled.error };
  try {
    const script = doc.createElement('script');
    script.textContent = compiled.code;
    doc.body.appendChild(script);
    script.remove();
    return { ok: true };
  } catch(e){
    return { ok: false, error: e.message };
  }
}

// Autocomplete state
let formulaAcIndex = -1;
let formulaAcItems = [];

function updateFormulaAutocomplete(){
  const input = document.getElementById('formulaInput');
  const list = document.getElementById('formulaAutocomplete');
  if(!input || !list) return;
  const val = input.value;
  const cursor = input.selectionStart || 0;
  const before = val.slice(0, cursor);

  // Find the token before the cursor: either "name." or just "name"
  const match = before.match(/([a-zA-Z_$][\w$]*)\.$/);
  const nameMatch = before.match(/([a-zA-Z_$][\w$]*)$/);

  list.innerHTML = '';
  formulaAcItems = [];
  formulaAcIndex = -1;

  if(match){
    // After a dot — suggest properties/actions
    const prefix = match[1];
    const names = getFormulaNames().map(function(n){ return n.replace(/[^a-zA-Z0-9_$]/g, '_'); });
    // Only show props if the prefix is a known element name
    if(names.indexOf(prefix) !== -1){
      FORMULA_PROPERTIES.forEach(function(p){
        const item = document.createElement('div');
        item.className = 'formulaAutocompleteItem';
        item.innerHTML = '<span>' + p.name + '</span><span class="acDesc">' + p.desc + '</span><span class="acKind">' + p.kind + '</span>';
        item.addEventListener('mousedown', function(e){
          e.preventDefault();
          insertFormulaCompletion(p.name + (p.kind === 'fn' ? '()' : ''));
        });
        list.appendChild(item);
        formulaAcItems.push(item);
      });
    }
  } else if(nameMatch && !before.endsWith('.')){
    // Typing a name — suggest element names
    const typed = nameMatch[1].toLowerCase();
    const names = getFormulaNames();
    names.forEach(function(n){
      const safe = n.replace(/[^a-zA-Z0-9_$]/g, '_');
      if(safe.toLowerCase().indexOf(typed) === -1) return;
      const item = document.createElement('div');
      item.className = 'formulaAutocompleteItem';
      item.innerHTML = '<span>' + safe + '</span><span class="acDesc">' + n + '</span><span class="acKind">el</span>';
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        insertFormulaCompletion(safe);
      });
      list.appendChild(item);
      formulaAcItems.push(item);
    });
  }

  list.classList.toggle('open', formulaAcItems.length > 0);
}

function insertFormulaCompletion(text){
  const input = document.getElementById('formulaInput');
  if(!input) return;
  const val = input.value;
  const cursor = input.selectionStart || 0;
  const before = val.slice(0, cursor);
  const after = val.slice(cursor);

  // Replace the token being completed
  const replaced = before.replace(/([a-zA-Z_$][\w$]*\.?)$/, text);
  input.value = replaced + after;
  const newPos = replaced.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  updateFormulaAutocomplete();
}

function moveFormulaAc(dir){
  if(!formulaAcItems.length) return false;
  formulaAcIndex += dir;
  if(formulaAcIndex < 0) formulaAcIndex = formulaAcItems.length - 1;
  if(formulaAcIndex >= formulaAcItems.length) formulaAcIndex = 0;
  formulaAcItems.forEach(function(it, i){ it.classList.toggle('active', i === formulaAcIndex); });
  const active = formulaAcItems[formulaAcIndex];
  if(active) active.scrollIntoView({ block: 'nearest' });
  return true;
}

function acceptFormulaAc(){
  if(formulaAcIndex < 0 || !formulaAcItems[formulaAcIndex]) return false;
  formulaAcItems[formulaAcIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return true;
}

function closeFormulaAc(){
  const list = document.getElementById('formulaAutocomplete');
  if(list) list.classList.remove('open');
  formulaAcItems = [];
  formulaAcIndex = -1;
}

// Wire formula bar events
(function wireFormulaBar(){
  const input = document.getElementById('formulaInput');
  const btnRun = document.getElementById('btnFormulaRun');
  const btnToggle = document.getElementById('btnFormulaBar');
  const wrap = document.getElementById('formulaBarWrap');
  if(!input || !btnRun || !btnToggle || !wrap) return;

  btnToggle.addEventListener('click', function(){
    wrap.classList.toggle('open');
    btnToggle.classList.toggle('active', wrap.classList.contains('open'));
    if(wrap.classList.contains('open')){
      setTimeout(function(){ input.focus(); }, 0);
    }
  });

  input.addEventListener('input', function(){ updateFormulaAutocomplete(); });
  input.addEventListener('keydown', function(e){
    if(e.key === 'ArrowDown'){ e.preventDefault(); moveFormulaAc(1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); moveFormulaAc(-1); }
    else if(e.key === 'Enter'){
      e.preventDefault();
      if(formulaAcItems.length && formulaAcIndex >= 0){
        acceptFormulaAc();
      } else {
        btnRun.click();
      }
    }
    else if(e.key === 'Escape'){ closeFormulaAc(); }
    else if(e.key === 'Tab'){
      e.preventDefault();
      if(formulaAcItems.length) acceptFormulaAc();
    }
  });
  input.addEventListener('blur', function(){ setTimeout(function(){ closeFormulaAc(); }, 150); });

  btnRun.addEventListener('click', function(){
    const formula = input.value.trim();
    if(!formula) return;
    const result = runFormula(formula);
    if(!result.ok){
      showAlert(result.error || 'Erro na fórmula.', 'Fórmula');
    } else {
      if(formulaNeedsPersistence(formula)) storeFormulaInDoc(getDoc(), formula);
      pushHistory(); syncCodeFromCanvas();
      // flash success
      input.style.borderColor = 'var(--accent)';
      setTimeout(function(){ input.style.borderColor = ''; }, 400);
    }
  });
})();

// Export support: wireExportFormulas injects the same runtime + any
// stored formulas into the exported HTML so they work standalone.
// Formulas are stored as data-ae-formula on a small script tag in the
// artboard's body (invisible, no side effects until the runtime runs).
//
// Only BEHAVIORAL formulas are stored. A formula that mutates the DOM
// (div_1.hide(), card.text = "x") already persists by itself — the change
// is serialized into the exported HTML — so storing it would re-apply a
// state the user may have changed afterwards. Event bindings
// (btn.onclick = ..., addEventListener) leave no trace in serialized HTML,
// so they're the ones that need to be re-run when the file opens.
function formulaNeedsPersistence(formula){
  return /(\.on[a-z]+\s*=|addEventListener\s*\()/.test(formula);
}

function storeFormulaInDoc(doc, formula){
  if(!doc || !doc.body) return;
  let tag = doc.querySelector('script[data-ae-formula]');
  if(!tag){
    tag = doc.createElement('script');
    // a non-JS type keeps the tag INERT — without it the raw formula
    // (which expects the proxy runtime's variables in scope) would
    // execute bare every time the artboard's HTML is re-parsed
    tag.type = 'text/x-ae-formula';
    tag.setAttribute('data-ae-formula', '1');
    doc.body.appendChild(tag);
  }
  const existing = (tag.textContent || '').trim();
  const lines = existing ? existing.split('\n') : [];
  if(lines.indexOf(formula) !== -1) return; // already stored, don't duplicate
  tag.textContent = existing ? existing + '\n' + formula : formula;
}

function wireExportFormulas(doc, clone){
  const formulaTag = clone.querySelector('script[data-ae-formula]');
  if(!formulaTag) return;
  const formulas = (formulaTag.textContent || '').trim();
  formulaTag.remove();
  if(!formulas) return;
  // Formulas reference elements by layer name (data-ae-name), which
  // cleanExportHTML strips right after this runs — so every named element a
  // formula actually mentions gets a throwaway eid, and the exported runtime
  // looks elements up by that instead (same trick as toggle/settext actions).
  let counter = 0;
  const pairs = [];
  clone.querySelectorAll('[data-ae-name]').forEach(function(el){
    const name = el.getAttribute('data-ae-name');
    const safe = name.replace(/[^a-zA-Z0-9_$]/g, '_');
    const re = new RegExp('\\b' + safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if(!re.test(formulas)) return;
    let eid = el.getAttribute('data-ae-eid');
    if(!eid){ eid = 'ae-el-f' + (++counter); el.setAttribute('data-ae-eid', eid); }
    pairs.push({ safe: safe, selector: '[data-ae-eid="' + eid + '"]' });
  });
  const body = 'try{\n' + formulas + '\n}catch(e){\n  console.error("[Fórmula]", e.message);\n}';
  const script = doc.createElement('script');
  script.textContent = '(function(){' + AE_FORMULA_PROXY_SRC + buildFormulaDecls(pairs) + '\n' + body + '\n})();';
  clone.querySelector('body').appendChild(script);
}

