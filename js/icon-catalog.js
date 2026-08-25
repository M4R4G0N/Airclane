"use strict";

// ---------- small icon catalog ----------

const ICON_SET = {
  check: { label: 'Check', path: '<polyline points="20 6 9 17 4 12"/>' },
  close: { label: 'Fechar (X)', path: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' },
  heart: { label: 'Coração', path: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>' },
  star: { label: 'Estrela', path: '<polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.6 5.8 21 7 14.1 2 9.3 8.9 8.6"/>' },
  search: { label: 'Buscar', path: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  home: { label: 'Home', path: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>' },
  menu: { label: 'Menu (hamburger)', path: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' },
  arrow: { label: 'Seta →', path: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/>' },
  mail: { label: 'E-mail', path: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/>' },
  user: { label: 'Usuário', path: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
};

function insertIcon(key){
  const doc = getDoc();
  const def = ICON_SET[key];
  if(!doc || !def) return;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = def.path;
  svg.style.display = 'block';
  svg.style.color = '#1b1d23';
  insertionContainer(doc).appendChild(svg);
  selectElement(svg);
  renderLayers();
  pushHistory(); syncCodeFromCanvas();
}

function showIconMenu(x, y){
  const items = Object.keys(ICON_SET).map(function(key){
    return { label: '◇ ' + ICON_SET[key].label, action: function(){ insertIcon(key); } };
  });
  showContextMenu(x, y, items);
}

function showAddElementMenu(x, y){
  const items = Object.keys(ELEMENT_TEMPLATES).map(function(key){
    return { label: ELEMENT_TEMPLATES[key].label, action: function(){ addElement(key); } };
  });
  items.push({ separator: true });
  items.push({ label: 'Imagem…', action: function(){ document.getElementById('imageInput').click(); } });
  showContextMenu(x, y, items);
}

function addImageFromFile(file){
  const doc = getDoc();
  if(!doc) return;
  const reader = new FileReader();
  reader.onload = function(){
    const img = doc.createElement('img');
    img.src = reader.result;
    img.style.cssText = 'display:block; width:220px; height:auto; margin:0 0 12px;';
    insertionContainer(doc).appendChild(img);
    selectElement(img);
    renderLayers();
    pushHistory(); syncCodeFromCanvas();
  };
  reader.readAsDataURL(file);
}

