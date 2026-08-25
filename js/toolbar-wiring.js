"use strict";

// ---------- toolbar wiring ----------

// the preset picker moved out of the toolbar (Fase 13) — a new artboard
// just starts at the usual desktop size now; resize it from its own
// Properties panel (Tamanho da tela) same as any existing artboard.
function nextArtboardSize(){
  return { w: 1440, h: 900 };
}

document.getElementById('btnNew').addEventListener('click', function(){
  const size = nextArtboardSize();
  const ab = createArtboard({ w: size.w, h: size.h });
  state.currentProject = null;
  setActiveArtboard(ab.id);
  selectArtboardOnly(ab.id);
  ab.dom.wrap.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});

document.getElementById('btnImport').addEventListener('click', function(){ document.getElementById('fileInput').click(); });
// shared by the Importar button, dropping a .html file on the canvas, and
// dropping one directly on an artboard — creates a new artboard from the
// file, restoring its original resolution when the file carries our
// ae-artboard-size meta tag (written on export).
function importHTMLFile(file){
  const reader = new FileReader();
  reader.onload = function(){
    const size = extractArtboardSize(reader.result);
    const ab = createArtboard({
      name: file.name.replace(/\.html?$/i, ''),
      html: reader.result,
      w: size ? size.w : undefined,
      h: size ? size.h : undefined
    });
    state.currentProject = null;
    setActiveArtboard(ab.id);
  };
  reader.readAsText(file);
}

document.getElementById('fileInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(file) importHTMLFile(file);
  e.target.value = '';
});

function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = filename;
  el.click();
  URL.revokeObjectURL(url);
}

function extractCSSFromDoc(doc){
  return Array.from(doc.querySelectorAll('style')).map(function(s){ return s.textContent; }).join('\n\n');
}

// wraps the artboard's document in an SVG <foreignObject> so it can be
// rasterized to PNG (or saved as-is as an .svg). Doesn't capture anything
// loaded across origins that the browser refuses to draw into a canvas
// (e.g. remote images without CORS) — those come through blank.
function buildExportSVG(ab){
  let doc; try { doc = ab.dom.frame.contentDocument; } catch(e){ doc = null; }
  if(!doc) return null;
  const clone = doc.documentElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  ['data-ae-name', 'data-ae-locked', 'data-ae-group', 'data-ae-goto', 'data-ae-toggle', 'data-ae-call', 'data-ae-evt', 'data-ae-settext', 'data-ae-settext-value'].forEach(function(attr){
    clone.querySelectorAll('[' + attr + ']').forEach(function(n){ n.removeAttribute(attr); });
  });
  const xhtml = new XMLSerializer().serializeToString(clone);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + ab.w + '" height="' + ab.h + '" viewBox="0 0 ' + ab.w + ' ' + ab.h + '">' +
    '<foreignObject width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
}

function exportArtboardSVG(ab){
  const svg = buildExportSVG(ab);
  if(!svg){ showAlert('Não consegui ler o conteúdo desse artboard.'); return; }
  downloadFile((ab.name || 'artifact') + '.svg', svg, 'image/svg+xml');
}

// blob: URLs make Chrome treat the drawn SVG as tainted the moment it
// contains a <foreignObject> (regardless of same-origin), which throws on
// toBlob/toDataURL — a base64 data: URI avoids that entirely.
function svgToDataUri(svg){
  return 'data:image/svg+xml;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function exportArtboardPNG(ab){
  const svg = buildExportSVG(ab);
  if(!svg){ showAlert('Não consegui ler o conteúdo desse artboard.'); return; }
  const img = new Image();
  img.onload = function(){
    const canvas = document.createElement('canvas');
    canvas.width = ab.w; canvas.height = ab.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ab.w, ab.h);
    try {
      ctx.drawImage(img, 0, 0, ab.w, ab.h);
      canvas.toBlob(function(pngBlob){
        if(!pngBlob){ showAlert('Não consegui gerar o PNG desse artboard — tenta exportar como .html.'); return; }
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl; a.download = (ab.name || 'artifact') + '.png';
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    } catch(err){
      showAlert('Não consegui gerar o PNG desse artboard (o navegador recusou desenhar algo nele) — tenta exportar como .html.');
    }
  };
  img.onerror = function(){
    showAlert('Não consegui gerar o PNG desse artboard (o navegador recusou desenhar algo nele) — tenta exportar como .html.');
  };
  img.src = svgToDataUri(svg);
}

// small preview image (data URL) of an artboard, for the recent-projects
// gallery — same SVG->canvas technique as PNG export, just tiny and async.
function captureThumbnail(ab){
  return new Promise(function(resolve){
    const svg = buildExportSVG(ab);
    if(!svg){ resolve(null); return; }
    const img = new Image();
    const w = 320, h = Math.round(320 * (ab.h / ab.w));
    img.onload = function(){
      try{
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch(err){ resolve(null); }
    };
    img.onerror = function(){ resolve(null); };
    img.src = svgToDataUri(svg);
  });
}

// ---------- recent projects (localStorage, thumbnail-only — the browser
