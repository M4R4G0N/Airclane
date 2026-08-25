"use strict";

// ---------- context menu ----------

let lastMenuX = 0, lastMenuY = 0;
function showContextMenu(x, y, items){
  lastMenuX = x; lastMenuY = y;
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = '';
  items.forEach(function(it){
    if(it.separator){ const sep = document.createElement('div'); sep.className = 'ctxSep'; menu.appendChild(sep); return; }
    const btn = document.createElement('button');
    btn.className = 'ctxItem' + (it.danger ? ' danger' : '');
    btn.textContent = it.label;
    if(it.disabled) btn.disabled = true;
    btn.addEventListener('click', function(ev){ ev.stopPropagation(); hideContextMenu(); it.action(); });
    menu.appendChild(btn);
  });
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.classList.add('open');
  requestAnimationFrame(function(){
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - r.width - 8) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - r.height - 8) + 'px';
  });
}
function hideContextMenu(){ document.getElementById('contextMenu').classList.remove('open'); }
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', hideContextMenu);

async function renameElementPrompt(el){
  const v = await showPrompt('Nome da camada:', el.dataset.aeName || '', 'Renomear elemento');
  if(v === null) return;
  if(v.trim()) el.dataset.aeName = v.trim(); else delete el.dataset.aeName;
  pushHistory(); syncCodeFromCanvas(); renderLayers(); highlightLayerRow();
}

function addTableRow(table){
  const doc = table.ownerDocument;
  const rows = table.querySelectorAll('tr');
  const lastRow = rows[rows.length - 1] || null;
  const cellCount = lastRow ? lastRow.children.length : 2;
  const tr = doc.createElement('tr');
  for(let i = 0; i < cellCount; i++){
    const td = doc.createElement('td');
    td.textContent = 'Valor';
    td.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    tr.appendChild(td);
  }
  table.appendChild(tr);
  selectElement(tr);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function addTableColumn(table){
  const doc = table.ownerDocument;
  table.querySelectorAll('tr').forEach(function(row){
    const isHead = !!row.querySelector('th');
    const cell = doc.createElement(isHead ? 'th' : 'td');
    cell.textContent = isHead ? 'Nova coluna' : 'Valor';
    cell.style.cssText = 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    row.appendChild(cell);
  });
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function applyTableStyle(table, preset){
  table.setAttribute('data-ae-table-style', preset);
  let dataRowIndex = 0;
  Array.from(table.querySelectorAll('tr')).forEach(function(row){
    const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
    const stripe = !isHead && (dataRowIndex++ % 2 === 1);
    Array.from(row.children).forEach(function(cell){
      if(preset === 'bordered'){
        cell.style.border = '2px solid #8b90a0';
        cell.style.backgroundColor = '';
      } else if(preset === 'striped'){
        cell.style.border = '1px solid #ccc';
        cell.style.backgroundColor = stripe ? 'rgba(0,0,0,0.045)' : '';
      } else {
        cell.style.border = '1px solid #ccc';
        cell.style.backgroundColor = '';
      }
    });
  });
  pushHistory(); syncCodeFromCanvas();
}

// only handles the simple, common cases: cells contiguous in one row (colspan)
// or contiguous down one column (rowspan) — enough for the everyday "merge
// this with the one next to it" case, not general spreadsheet-style merging
// across an already-merged table.
function tableCellColIndex(cell){
  return Array.from(cell.parentElement.children).indexOf(cell);
}
function getMergeableTableCells(){
  const items = effectiveSelection();
  if(items.length < 2) return null;
  if(!items.every(function(el){ return el.tagName === 'TD' || el.tagName === 'TH'; })) return null;
  const table = items[0].closest('table');
  if(!table || !items.every(function(el){ return el.closest('table') === table; })) return null;
  const sameRow = items.every(function(el){ return el.parentElement === items[0].parentElement; });
  if(sameRow){
    const sorted = items.slice().sort(function(a, b){ return tableCellColIndex(a) - tableCellColIndex(b); });
    for(let i = 1; i < sorted.length; i++){
      if(tableCellColIndex(sorted[i]) !== tableCellColIndex(sorted[i - 1]) + 1) return null;
    }
    return { type: 'h', cells: sorted };
  }
  const col = tableCellColIndex(items[0]);
  const sameCol = items.every(function(el){ return tableCellColIndex(el) === col; });
  if(sameCol){
    const rows = Array.from(table.querySelectorAll('tr'));
    const sorted = items.slice().sort(function(a, b){ return rows.indexOf(a.parentElement) - rows.indexOf(b.parentElement); });
    for(let i = 1; i < sorted.length; i++){
      if(rows.indexOf(sorted[i].parentElement) !== rows.indexOf(sorted[i - 1].parentElement) + 1) return null;
    }
    return { type: 'v', cells: sorted };
  }
  return null;
}
function mergeTableCells(group){
  const doc = group.cells[0].ownerDocument;
  const first = group.cells[0];
  const rest = group.cells.slice(1);
  const attr = group.type === 'h' ? 'colspan' : 'rowspan';
  const span = group.cells.reduce(function(sum, c){ return sum + (parseInt(c.getAttribute(attr), 10) || 1); }, 0);
  first.setAttribute(attr, String(span));
  rest.forEach(function(c){
    const text = c.textContent.trim();
    if(text) first.appendChild(doc.createTextNode((first.textContent.trim() ? ' ' : '') + text));
    c.remove();
  });
  state.multiSelect = new Set();
  selectElement(first);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function moveTableRow(row, dir){
  const table = row.closest('table');
  if(!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const target = rows[rows.indexOf(row) + dir];
  // rows can live directly under <table> (built via DOM API, like a brand
  // new table here) or under an implicit <tbody> the browser's HTML parser
  // inserts on reparse (after Aplicar código, or on reload) — use the row's
  // own parent rather than assuming which one it is.
  if(!target || target.parentNode !== row.parentNode) return;
  const parent = row.parentNode;
  if(dir < 0) parent.insertBefore(row, target); else parent.insertBefore(target, row);
  selectElement(row);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}
function moveTableColumn(table, colIndex, dir){
  const targetIndex = colIndex + dir;
  if(targetIndex < 0) return;
  Array.from(table.querySelectorAll('tr')).forEach(function(row){
    const cell = row.children[colIndex];
    const target = row.children[targetIndex];
    if(!cell || !target) return;
    if(dir < 0) row.insertBefore(cell, target); else row.insertBefore(target, cell);
  });
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function deleteTableRow(row){
  const table = row.closest('table');
  if(!table) return;
  if(table.querySelectorAll('tr').length <= 1){ showAlert('A tabela precisa ter pelo menos uma linha.'); return; }
  const wasSelected = state.selected === row || (state.selected && row.contains(state.selected));
  row.remove();
  if(wasSelected) selectElement(table);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function deleteTableColumn(table, colIndex){
  const rows = Array.from(table.querySelectorAll('tr'));
  if(rows.length && rows[0].children.length <= 1){ showAlert('A tabela precisa ter pelo menos uma coluna.'); return; }
  let wasSelected = false;
  rows.forEach(function(row){
    const cell = row.children[colIndex];
    if(cell){
      if(state.selected === cell || cell.contains(state.selected)) wasSelected = true;
      cell.remove();
    }
  });
  if(wasSelected) selectElement(table);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

// swaps every cell in a row between <td> and <th> — the quick way to mark
// (or unmark) a header row after the table already exists, instead of
// having to rebuild it from scratch.
function toggleTableRowHeader(row){
  const doc = row.ownerDocument;
  const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
  const wasSelected = state.selected === row;
  Array.from(row.children).forEach(function(cell){
    const newCell = doc.createElement(isHead ? 'td' : 'th');
    while(cell.firstChild) newCell.appendChild(cell.firstChild);
    newCell.style.cssText = cell.style.cssText || 'border:1px solid #ccc; padding:8px 12px; text-align:left;';
    Array.from(cell.attributes).forEach(function(attr){
      if(attr.name !== 'style') newCell.setAttribute(attr.name, attr.value);
    });
    row.replaceChild(newCell, cell);
  });
  if(wasSelected) selectElement(row);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function addListItem(list){
  const doc = list.ownerDocument;
  const li = doc.createElement('li');
  li.textContent = 'Item ' + (list.children.length + 1);
  list.appendChild(li);
  selectElement(li);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function elementContextMenuItems(el){
  const items = [
    { label: '+ Adicionar elemento aqui dentro', action: function(){ showAddElementMenu(lastMenuX, lastMenuY); } }
  ];
  const table = el.tagName === 'TABLE' ? el : (el.closest ? el.closest('table') : null);
  if(table){
    items.push({ separator: true });
    items.push({ label: '+ Adicionar linha', action: function(){ addTableRow(table); } });
    items.push({ label: '+ Adicionar coluna', action: function(){ addTableColumn(table); } });
    const row = el.tagName === 'TR' ? el : (el.closest ? el.closest('tr') : null);
    const cell = (el.tagName === 'TD' || el.tagName === 'TH') ? el : (el.closest ? el.closest('td, th') : null);
    if(row){
      const rows = Array.from(table.querySelectorAll('tr'));
      const rowIdx = rows.indexOf(row);
      const isHead = row.children.length > 0 && row.children[0].tagName === 'TH';
      items.push({ label: (isHead ? 'Desmarcar' : 'Marcar') + ' linha como cabeçalho', action: function(){ toggleTableRowHeader(row); } });
      items.push({ label: '↑ Mover linha pra cima', disabled: rowIdx <= 0, action: function(){ moveTableRow(row, -1); } });
      items.push({ label: '↓ Mover linha pra baixo', disabled: rowIdx >= rows.length - 1, action: function(){ moveTableRow(row, 1); } });
      items.push({ label: 'Excluir linha', action: function(){ deleteTableRow(row); } });
    }
    if(cell){
      const colIndex = tableCellColIndex(cell);
      const colCount = cell.parentElement.children.length;
      items.push({ label: '← Mover coluna pra esquerda', disabled: colIndex <= 0, action: function(){ moveTableColumn(table, colIndex, -1); } });
      items.push({ label: '→ Mover coluna pra direita', disabled: colIndex >= colCount - 1, action: function(){ moveTableColumn(table, colIndex, 1); } });
      items.push({ label: 'Excluir coluna', action: function(){ deleteTableColumn(table, colIndex); } });
    }
    const mergeable = getMergeableTableCells();
    if(mergeable){
      items.push({ label: '⊞ Mesclar células', action: function(){ mergeTableCells(mergeable); } });
    }
  }
  const list = (el.tagName === 'UL' || el.tagName === 'OL') ? el : (el.closest ? el.closest('ul, ol') : null);
  if(list){
    items.push({ separator: true });
    items.push({ label: '+ Adicionar item', action: function(){ addListItem(list); } });
  }
  const selCount = effectiveSelection().length;
  if(selCount >= 2){
    items.push({ separator: true });
    items.push({ label: '⟸ Alinhar à esquerda', action: function(){ alignSelection('left'); } });
    items.push({ label: '⟺ Centralizar horizontal', action: function(){ alignSelection('hcenter'); } });
    items.push({ label: '⟹ Alinhar à direita', action: function(){ alignSelection('right'); } });
    items.push({ label: '⟰ Alinhar ao topo', action: function(){ alignSelection('top'); } });
    items.push({ label: '⟺ Centralizar vertical', action: function(){ alignSelection('vcenter'); } });
    items.push({ label: '⟱ Alinhar à base', action: function(){ alignSelection('bottom'); } });
    if(selCount >= 3){
      items.push({ label: 'Distribuir horizontal', action: function(){ distributeSelection('h'); } });
      items.push({ label: 'Distribuir vertical', action: function(){ distributeSelection('v'); } });
    }
    items.push({ label: 'Agrupar', action: groupSelection });
  }
  if(el.dataset.aeGroup === '1'){
    items.push({ separator: true });
    items.push({ label: 'Desagrupar', action: ungroupSelection });
  }
  items.push({ separator: true });
  items.push({ label: 'Trazer para frente', action: function(){ bringToFront(el); } });
  items.push({ label: 'Enviar para trás', action: function(){ sendToBack(el); } });
  items.push({ separator: true });
  items.push({ label: 'Duplicar', action: duplicateSelected });
  items.push({ label: 'Copiar', action: copySelected });
  items.push({ label: 'Colar', action: pasteClipboard, disabled: !clipboardEl });
  items.push({ separator: true });
  items.push({ label: 'Renomear…', action: function(){ renameElementPrompt(el); } });
  items.push({ separator: true });
  items.push({ label: 'Excluir' + (selCount > 1 ? ' (' + selCount + ')' : ''), danger: true, action: deleteSelected });
  return items;
}

function artboardContextMenuItems(ab){
  return [
    { label: '+ Adicionar elemento', action: function(){ showAddElementMenu(lastMenuX, lastMenuY); } },
    { separator: true },
    { label: 'Renomear…', action: function(){ renameArtboard(ab); } },
    { label: 'Duplicar artboard', action: function(){ duplicateArtboard(ab); } },
    { separator: true },
    { label: 'Excluir artboard', danger: true, action: function(){ deleteArtboard(ab); } }
  ];
}

