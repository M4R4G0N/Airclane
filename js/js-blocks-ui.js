"use strict";

// ---------- JS Blocks: Scratch-style visual editor modal ----------
// Renders js-blocks-core.js's parsed statement tree as draggable, snap-
// together puzzle blocks (a palette on the left, a scripts area on the
// right) instead of raw text — see jsBlocksBuildStack/jsBlocksBuildBlock for
// the DOM tree and jsBlocksStartDrag/jsBlocksResolveDrop for the drag-and-
// drop engine. Standalone modal, independent of the code panel/textarea: it
// reads the active artboard's user <script> straight from the doc and, on
// "Aplicar", writes the regenerated code back the same way applyCodeToCanvas
// does for the JS tab — same contract, different editing surface.

let jsBlocksProgram = null;

const JS_BLOCKS_STATEMENT_LABELS = {
  VariableDeclaration: 'variável',
  If: 'se',
  For: 'for',
  ForOf: 'para cada (for..of)',
  ForEach: 'para cada (.forEach)',
  While: 'enquanto',
  FunctionDeclaration: 'função',
  Return: 'retornar',
  Break: 'parar',
  Continue: 'continuar',
  ExpressionStatement: 'expressão',
  RawCode: 'código'
};

function openJsBlocksModal(){
  const doc = getDoc();
  const script = getUserScriptTag(doc, false);
  jsBlocksProgram = parseJsToBlocks(script ? script.textContent : '');
  document.getElementById('jsBlocksModal').classList.remove('is-hidden');
  renderJsBlocksPalette();
  renderJsBlocksPanel();
}

function closeJsBlocksModal(){
  document.getElementById('jsBlocksModal').classList.add('is-hidden');
}

function applyJsBlocksToCanvas(){
  const a = activeArtboard();
  const doc = getDoc();
  if(!a || !doc) return;
  getUserScriptTag(doc, true).textContent = generateBlocksToCode(jsBlocksProgram);
  // srcdoc reload (not just editing the live doc in place) is what actually
  // re-executes the script — same as applyCodeToCanvas's JS-tab branch.
  loadDocumentInto(a, currentHTMLFor(a), true);
  if(state.codeTab === 'js') syncCodeFromCanvas();
}

function renderJsBlocksPanel(){
  const panel = document.getElementById('jsBlocksPanel');
  panel.innerHTML = '';

  const invalidCount = countJsBlocksInvalid(jsBlocksProgram);
  if(invalidCount){
    const warn = document.createElement('div');
    warn.className = 'jsBlocksWarning';
    warn.textContent = invalidCount === 1
      ? '1 trecho não pôde virar bloco e ficou como código bruto abaixo.'
      : invalidCount + ' trechos não puderam virar bloco e ficaram como código bruto abaixo.';
    panel.appendChild(warn);
  }

  panel.appendChild(jsBlocksBuildStack(jsBlocksProgram.body));
}

// ---------- palette (drag source for brand-new blocks) ----------

const JS_BLOCKS_PALETTE = [
  { type: 'VariableDeclaration', label: 'variável', make: jsBlocksNewVariable },
  { type: 'If', label: 'se', make: jsBlocksNewIf },
  { type: 'While', label: 'enquanto', make: jsBlocksNewWhile },
  { type: 'For', label: 'for clássico', make: jsBlocksNewFor },
  { type: 'ForEach', label: 'para cada (.forEach)', make: jsBlocksNewForEach },
  { type: 'ForOf', label: 'para cada (for..of)', make: jsBlocksNewForOf },
  { type: 'FunctionDeclaration', label: 'função', make: jsBlocksNewFunction },
  { type: 'Return', label: 'retornar', make: jsBlocksNewReturn },
  { type: 'ExpressionStatement', label: 'chamar função', make: jsBlocksNewExpressionStatement },
  { type: 'Break', label: 'parar', make: function(){ return { type: 'Break' }; } },
  { type: 'Continue', label: 'continuar', make: function(){ return { type: 'Continue' }; } }
];

function renderJsBlocksPalette(){
  const palette = document.getElementById('jsBlocksPalette');
  palette.innerHTML = '';
  JS_BLOCKS_PALETTE.forEach(function(item){
    const chip = document.createElement('div');
    chip.className = 'jsBlockPaletteItem jsBlock--' + item.type.toLowerCase();
    chip.textContent = item.label;
    chip.addEventListener('mousedown', function(e){ jsBlocksStartDrag(e, { kind: 'new', make: item.make, el: chip }, item.label); });
    palette.appendChild(chip);
  });
}

// ---------- statement tree construction ----------
// Each container block (If/For/ForOf/While/FunctionDeclaration) nests its
// own .jsBlockStack for its body, mirroring the AST's own nesting instead of
// a flat indented list — that's what lets drop-target detection just be
// "closest .jsBlockStack under the cursor".

const JS_BLOCKS_CAP_TYPES = { Break: 1, Continue: 1 };
const JS_BLOCKS_CONTAINER_TYPES = { If: 1, For: 1, ForOf: 1, ForEach: 1, While: 1, FunctionDeclaration: 1 };

function jsBlocksBuildStack(list){
  const stack = document.createElement('div');
  stack.className = 'jsBlockStack';
  stack.__list = list;
  list.forEach(function(node){ stack.appendChild(jsBlocksBuildBlock(node, list)); });
  const addRow = document.createElement('div');
  addRow.className = 'jsBlockAddRow';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'jsBlockAddInline';
  addBtn.textContent = '+ bloco';
  addBtn.addEventListener('click', function(e){ jsBlocksOpenAddMenu(e, list, list.length); });
  addRow.appendChild(addBtn);
  stack.appendChild(addRow);
  return stack;
}

function jsBlocksBuildBlock(node, list){
  const isContainer = JS_BLOCKS_CONTAINER_TYPES[node.type];
  const el = document.createElement('div');
  el.className = 'jsBlock jsBlock--' + node.type.toLowerCase()
    + (isContainer ? ' jsBlock--container' : '')
    + (JS_BLOCKS_CAP_TYPES[node.type] ? ' jsBlock--cap' : '');

  const head = document.createElement('div');
  head.className = 'jsBlock__head';

  const handle = document.createElement('span');
  handle.className = 'jsBlock__handle';
  handle.textContent = '⠿';
  handle.title = 'Arrastar bloco';
  handle.addEventListener('mousedown', function(e){
    jsBlocksStartDrag(e, { kind: 'move', node: node, sourceList: list, el: el }, JS_BLOCKS_STATEMENT_LABELS[node.type] || node.type);
  });
  head.appendChild(handle);

  const kind = document.createElement('span');
  kind.className = 'jsBlockKind';
  kind.textContent = JS_BLOCKS_STATEMENT_LABELS[node.type] || node.type;
  head.appendChild(kind);

  jsBlocksRenderStatementFields(node, head);

  const actions = document.createElement('span');
  actions.className = 'jsBlockActions';
  actions.appendChild(jsBlocksMoveBtn(node, list, -1, '↑'));
  actions.appendChild(jsBlocksMoveBtn(node, list, 1, '↓'));
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'jsBlockDelete';
  delBtn.textContent = '×';
  delBtn.title = 'Excluir bloco';
  delBtn.addEventListener('click', function(){
    const i = list.indexOf(node);
    if(i !== -1) list.splice(i, 1);
    renderJsBlocksPanel();
  });
  actions.appendChild(delBtn);
  head.appendChild(actions);

  el.appendChild(head);

  if(node.type === 'If'){
    el.appendChild(jsBlocksBuildStack(node.consequent));
    if(node.alternate){
      const elseHead = document.createElement('div');
      elseHead.className = 'jsBlock__elseHead';
      elseHead.textContent = 'senão';
      el.appendChild(elseHead);
      el.appendChild(jsBlocksBuildStack(node.alternate));
    }
    const foot = document.createElement('div');
    foot.className = 'jsBlock__foot';
    el.appendChild(foot);
  } else if(isContainer){
    el.appendChild(jsBlocksBuildStack(node.body));
    const foot = document.createElement('div');
    foot.className = 'jsBlock__foot';
    el.appendChild(foot);
  }

  return el;
}

function jsBlocksMoveBtn(node, list, dir, label){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'jsBlockMove';
  btn.textContent = label;
  btn.title = dir < 0 ? 'Mover para cima' : 'Mover para baixo';
  btn.addEventListener('click', function(){
    const i = list.indexOf(node);
    const j = i + dir;
    if(i === -1 || j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, node);
    renderJsBlocksPanel();
  });
  return btn;
}

// reuses the canvas/layers right-click menu component (showContextMenu) as a
// plain dropdown — stopPropagation keeps the document-level click listener
// that normally closes the context menu from also closing this one. Kept as
// a precise fallback alongside dragging from the palette.
function jsBlocksOpenAddMenu(e, list, atIndex){
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.left, r.bottom + 4, JS_BLOCKS_PALETTE.map(function(item){
    return { label: item.label, action: function(){
      list.splice(atIndex, 0, item.make());
      renderJsBlocksPanel();
    } };
  }));
}

// ---------- drag & drop engine ----------
// Two kinds of drag: "new" (from the palette, creates a fresh node on drop)
// and "move" (an existing block's handle, relocates it). Both resolve to the
// same target — { list, index } — found by walking up from whatever's under
// the cursor to the nearest .jsBlockStack, then comparing the cursor's Y
// against that stack's direct .jsBlock children.

function jsBlocksStartDrag(e, payload, label){
  e.preventDefault();
  e.stopPropagation();
  let started = false;
  const startX = e.clientX, startY = e.clientY;
  let pending = null;

  const ghost = document.createElement('div');
  ghost.className = 'jsBlockDragGhost';
  ghost.textContent = label;
  const color = getComputedStyle(payload.el).getPropertyValue('--jsblock-color');
  if(color) ghost.style.setProperty('--jsblock-drag-color', color.trim());

  const dropLine = document.createElement('div');
  dropLine.className = 'jsBlockDropLine';

  function onMove(ev){
    const x = ev.clientX, y = ev.clientY;
    if(!started){
      if(Math.abs(x - startX) < DRAG_THRESHOLD && Math.abs(y - startY) < DRAG_THRESHOLD) return;
      started = true;
      document.body.appendChild(ghost);
      document.body.appendChild(dropLine);
      if(payload.kind === 'move') payload.el.classList.add('jsBlock--dragging');
    }
    ghost.style.left = (x + 14) + 'px';
    ghost.style.top = (y + 14) + 'px';
    pending = jsBlocksResolveDrop(x, y, payload);
    jsBlocksShowDropIndicator(dropLine, pending);
  }

  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if(!started) return;
    ghost.remove();
    dropLine.remove();
    if(pending) jsBlocksCommitDrop(payload, pending);
    renderJsBlocksPanel();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function jsBlocksResolveDrop(x, y, payload){
  const panel = document.getElementById('jsBlocksPanel');
  const panelRect = panel.getBoundingClientRect();
  if(x < panelRect.left || x > panelRect.right || y < panelRect.top || y > panelRect.bottom) return null;
  const el = document.elementFromPoint(x, y);
  if(!el) return null;
  const stackEl = el.closest('.jsBlockStack');
  if(!stackEl || !panel.contains(stackEl)) return null;
  const list = stackEl.__list;
  if(payload.kind === 'move' && jsBlocksIsNodeOrDescendantList(payload.node, list)) return null;

  const children = Array.prototype.filter.call(stackEl.children, function(c){ return c.classList.contains('jsBlock'); });
  let index = children.length;
  for(let i = 0; i < children.length; i++){
    const r = children[i].getBoundingClientRect();
    if(y < r.top + r.height / 2){ index = i; break; }
  }
  return { list: list, index: index, stackEl: stackEl };
}

// true if `list` is (or lives inside) one of node's own nested bodies —
// dropping node there would nest it inside itself.
function jsBlocksIsNodeOrDescendantList(node, list){
  const subLists = [node.consequent, node.alternate, node.body].filter(Boolean);
  for(let i = 0; i < subLists.length; i++){
    if(subLists[i] === list) return true;
    for(let j = 0; j < subLists[i].length; j++){
      if(jsBlocksIsNodeOrDescendantList(subLists[i][j], list)) return true;
    }
  }
  return false;
}

function jsBlocksShowDropIndicator(dropLine, pending){
  if(!pending){ dropLine.style.display = 'none'; return; }
  const children = Array.prototype.filter.call(pending.stackEl.children, function(c){ return c.classList.contains('jsBlock'); });
  const stackRect = pending.stackEl.getBoundingClientRect();
  let top;
  if(!children.length) top = stackRect.top + 8;
  else if(pending.index >= children.length) top = children[children.length - 1].getBoundingClientRect().bottom;
  else top = children[pending.index].getBoundingClientRect().top;
  dropLine.style.display = 'block';
  dropLine.style.left = stackRect.left + 'px';
  dropLine.style.width = Math.max(40, stackRect.width) + 'px';
  dropLine.style.top = (top - 1) + 'px';
}

function jsBlocksCommitDrop(payload, pending){
  let index = pending.index;
  if(payload.kind === 'new'){
    pending.list.splice(index, 0, payload.make());
    return;
  }
  const srcIndex = payload.sourceList.indexOf(payload.node);
  if(srcIndex === -1) return;
  payload.sourceList.splice(srcIndex, 1);
  if(pending.list === payload.sourceList && index > srcIndex) index -= 1;
  pending.list.splice(index, 0, payload.node);
}

// ---------- new-block factories ----------

function jsBlocksNewVariable(){
  return { type: 'VariableDeclaration', kind: 'let', name: 'novaVar', init: { type: 'Literal', value: 0, literalType: 'number' } };
}
function jsBlocksNewIf(){
  return { type: 'If', test: { type: 'Literal', value: true, literalType: 'boolean' }, consequent: [], alternate: null };
}
function jsBlocksNewFor(){
  return {
    type: 'For',
    init: { type: 'VariableDeclaration', kind: 'let', name: 'i', init: { type: 'Literal', value: 0, literalType: 'number' } },
    test: { type: 'BinaryExpression', operator: '<', left: { type: 'Identifier', name: 'i' }, right: { type: 'Literal', value: 10, literalType: 'number' } },
    update: { type: 'UpdateExpression', operator: '++', argument: { type: 'Identifier', name: 'i' }, prefix: false },
    body: []
  };
}
function jsBlocksNewForOf(){
  return { type: 'ForOf', kind: 'const', name: 'item', iterKind: 'of', iterable: { type: 'Identifier', name: 'lista' }, body: [] };
}
function jsBlocksNewForEach(){
  return { type: 'ForEach', iterable: { type: 'Identifier', name: 'lista' }, itemName: 'item', indexName: null, body: [] };
}
function jsBlocksNewWhile(){
  return { type: 'While', test: { type: 'Literal', value: true, literalType: 'boolean' }, body: [] };
}
function jsBlocksNewFunction(){
  return { type: 'FunctionDeclaration', name: 'minhaFuncao', params: [], body: [] };
}
function jsBlocksNewReturn(){
  return { type: 'Return', argument: null };
}
function jsBlocksNewExpressionStatement(){
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'console' }, property: 'log', computed: false },
      arguments: []
    }
  };
}

// ---------- per-statement inline field editors ----------

function jsBlocksLabel(text){
  const s = document.createElement('span');
  s.className = 'jsBlockLabel';
  s.textContent = text;
  return s;
}

function jsBlocksRenderStatementFields(node, head){
  switch(node.type){
    case 'VariableDeclaration':
      head.appendChild(jsBlocksKindSelect(['const', 'let', 'var'], function(){ return node.kind; }, function(v){ node.kind = v; }));
      head.appendChild(jsBlocksNameInput(function(){ return node.name; }, function(v){ node.name = v; }));
      head.appendChild(jsBlocksLabel('='));
      head.appendChild(jsBlocksExprInput(function(){ return node.init; }, function(v){ node.init = v; }, 'valor'));
      break;
    case 'If':
      head.appendChild(jsBlocksExprInput(function(){ return node.test; }, function(v){ node.test = v; }, 'condição', 'jsBlockExprInput--bool'));
      break;
    case 'While':
      head.appendChild(jsBlocksExprInput(function(){ return node.test; }, function(v){ node.test = v; }, 'condição', 'jsBlockExprInput--bool'));
      break;
    case 'For':
      head.appendChild(jsBlocksLabel('('));
      head.appendChild(jsBlocksForInitInput(node));
      head.appendChild(jsBlocksLabel(';'));
      head.appendChild(jsBlocksExprInput(function(){ return node.test; }, function(v){ node.test = v; }, 'condição', 'jsBlockExprInput--bool'));
      head.appendChild(jsBlocksLabel(';'));
      head.appendChild(jsBlocksExprInput(function(){ return node.update; }, function(v){ node.update = v; }, 'incremento'));
      head.appendChild(jsBlocksLabel(')'));
      break;
    case 'ForOf':
      head.appendChild(jsBlocksKindSelect(['const', 'let', 'var'], function(){ return node.kind; }, function(v){ node.kind = v; }));
      head.appendChild(jsBlocksNameInput(function(){ return node.name; }, function(v){ node.name = v; }));
      head.appendChild(jsBlocksKindSelect(['of', 'in'], function(){ return node.iterKind; }, function(v){ node.iterKind = v; }));
      head.appendChild(jsBlocksExprInput(function(){ return node.iterable; }, function(v){ node.iterable = v; }, 'lista'));
      break;
    case 'ForEach':
      // .forEach's callback params are plain parameter names, not a
      // const/let/var declaration — no kind selector here, unlike ForOf.
      head.appendChild(jsBlocksExprInput(function(){ return node.iterable; }, function(v){ node.iterable = v; }, 'lista'));
      head.appendChild(jsBlocksLabel('como'));
      head.appendChild(jsBlocksNameInput(function(){ return node.itemName; }, function(v){ node.itemName = v; }));
      head.appendChild(jsBlocksLabel(', índice'));
      head.appendChild(jsBlocksOptionalNameInput(function(){ return node.indexName; }, function(v){ node.indexName = v; }, '(opcional)'));
      break;
    case 'FunctionDeclaration':
      head.appendChild(jsBlocksNameInput(function(){ return node.name; }, function(v){ node.name = v; }));
      head.appendChild(jsBlocksLabel('('));
      head.appendChild(jsBlocksParamsInput(node));
      head.appendChild(jsBlocksLabel(')'));
      break;
    case 'Return':
      head.appendChild(jsBlocksExprInput(function(){ return node.argument; }, function(v){ node.argument = v; }, '(vazio)'));
      break;
    case 'Break':
    case 'Continue':
      break;
    case 'ExpressionStatement':
      head.appendChild(jsBlocksExprInput(function(){ return node.expression; }, function(v){ node.expression = v; }, 'expressão'));
      break;
    case 'RawCode':
      head.appendChild(jsBlocksRawCodeField(node));
      break;
  }
}

function jsBlocksKindSelect(options, getValue, setValue){
  const select = document.createElement('select');
  select.className = 'jsBlockKindSelect';
  options.forEach(function(opt){
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    if(opt === getValue()) el.selected = true;
    select.appendChild(el);
  });
  select.addEventListener('change', function(){ setValue(select.value); });
  return select;
}

function jsBlocksNameInput(getValue, setValue){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'jsBlockNameInput';
  input.value = getValue();
  input.addEventListener('input', function(){ setValue(input.value); });
  return input;
}

// like jsBlocksNameInput, but an empty field means "not set" (null) instead
// of an empty identifier — for params that can legitimately be omitted,
// like .forEach's optional index.
function jsBlocksOptionalNameInput(getValue, setValue, placeholder){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'jsBlockNameInput';
  input.value = getValue() || '';
  if(placeholder) input.placeholder = placeholder;
  input.addEventListener('input', function(){ setValue(input.value.trim() || null); });
  return input;
}

function jsBlocksParamsInput(node){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'jsBlockParamsInput';
  input.value = node.params.join(', ');
  input.placeholder = 'parâmetros';
  function commit(){
    node.params = input.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter') input.blur(); });
  return input;
}

// shared by every expression-holding slot (init/test/update/argument/…):
// shows the slot's generated code as editable text, reparses it as a single
// expression on commit, and flags — without touching the tree — anything
// that doesn't parse, instead of silently discarding the user's typing.
function jsBlocksExprInput(getExpr, setExpr, placeholder, extraClass){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = extraClass ? 'jsBlockExprInput ' + extraClass : 'jsBlockExprInput';
  const current = getExpr();
  input.value = current ? jsBlocksGenerateExpression(current) : '';
  if(placeholder) input.placeholder = placeholder;
  function commit(){
    const text = input.value.trim();
    if(!text){
      setExpr(null);
      input.classList.remove('invalid');
      return;
    }
    try {
      const st = jsBlocksCreateState(text);
      const expr = jsBlocksParseExpression(st);
      if(!jsBlocksAtEnd(st)) throw new Error('trailing tokens');
      setExpr(expr);
      input.classList.remove('invalid');
    } catch(err){
      input.classList.add('invalid');
    }
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter') input.blur(); });
  return input;
}

// the for(;;) init clause can be a variable declaration OR a bare
// expression (jsBlocksParseForInit) — same idea as jsBlocksExprInput, one
// level up the grammar.
function jsBlocksForInitInput(forNode){
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'jsBlockExprInput';
  input.value = forNode.init ? jsBlocksGenerateForClause(forNode.init) : '';
  input.placeholder = 'inicialização';
  function commit(){
    const text = input.value.trim();
    if(!text){
      forNode.init = null;
      input.classList.remove('invalid');
      return;
    }
    try {
      const st = jsBlocksCreateState(text);
      const initNode = jsBlocksParseForInit(st);
      if(!jsBlocksAtEnd(st)) throw new Error('trailing tokens');
      forNode.init = initNode;
      input.classList.remove('invalid');
    } catch(err){
      input.classList.add('invalid');
    }
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter') input.blur(); });
  return input;
}

function jsBlocksRawCodeField(node){
  const textarea = document.createElement('textarea');
  textarea.className = 'jsBlockRawTextarea';
  textarea.rows = Math.min(6, Math.max(1, node.code.split('\n').length));
  textarea.value = node.code;
  textarea.spellcheck = false;
  textarea.addEventListener('input', function(){ node.code = textarea.value; });
  return textarea;
}

// ---------- modal wiring ----------

document.getElementById('btnJsBlocks').addEventListener('click', openJsBlocksModal);
document.getElementById('btnCloseJsBlocks').addEventListener('click', closeJsBlocksModal);
document.getElementById('btnJsBlocksApply').addEventListener('click', applyJsBlocksToCanvas);
