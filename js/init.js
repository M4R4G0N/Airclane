"use strict";

// ---------- init ----------

(function init(){
  const savedTheme = localStorage.getItem('ae_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const addTile = document.createElement('button');
  addTile.id = 'addArtboardTile';
  addTile.className = 'addArtboardTile';
  addTile.innerHTML = '<span class="plus">+</span><span>Novo artboard</span>';
  addTile.addEventListener('click', function(){ document.getElementById('btnNew').click(); });
  artboardsRow.appendChild(addTile);

  const first = createArtboard({});
  setActiveArtboard(first.id);
  applyZoom();
})();

