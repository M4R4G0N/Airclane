"use strict";

// ---------- floating text-format toolbar (bold/italic/underline/size on a
// text selection, while inline-editing an element via double-click) ----------
let activeEditDoc = null;
let activeEditTarget = null;
let activeEditArtboard = null;

function hideTextFormatBar(){
  const bar = document.getElementById('textFormatBar');
  if(bar) bar.classList.remove('open');
}
function updateTextFormatBar(ab){
  if(!activeEditDoc || !activeEditTarget || activeEditArtboard !== ab) return;
  const doc = activeEditDoc;
  if(doc.activeElement !== activeEditTarget || activeEditTarget.getAttribute('contenteditable') !== 'true'){ hideTextFormatBar(); return; }
  const sel = doc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed){ hideTextFormatBar(); return; }
  const range = sel.getRangeAt(0);
  if(!activeEditTarget.contains(range.commonAncestorContainer)){ hideTextFormatBar(); return; }
  const rect = range.getBoundingClientRect();
  if(rect.width === 0 && rect.height === 0){ hideTextFormatBar(); return; }
  const top = artboardPointToPage(ab, rect.left + rect.width / 2, rect.top);
  const bar = document.getElementById('textFormatBar');
  bar.style.left = top.x + 'px';
  bar.style.top = top.y + 'px';
  bar.classList.add('open');
}
// wraps whatever's currently selected in a fresh <span> carrying one inline
// style — extractContents+insertNode instead of surroundContents because the
// selection can span multiple nodes/element boundaries (surroundContents
// throws in that case; this doesn't care what's inside it).
function wrapSelectionWithStyle(doc, styleProp, styleVal){
  const sel = doc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  try {
    const span = doc.createElement('span');
    span.style[styleProp] = styleVal;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const newRange = doc.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
  } catch(e){ return false; }
}
function applyTextFormatCommand(cmd){
  if(!activeEditDoc) return;
  activeEditDoc.execCommand(cmd, false, null);
  pushHistory(); syncCodeFromCanvas();
  updateTextFormatBar(activeEditArtboard);
}
function applyTextFormatSize(delta){
  if(!activeEditDoc) return;
  const sel = activeEditDoc.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  const currentSize = parseFloat(activeEditDoc.defaultView.getComputedStyle(node).fontSize) || 16;
  const nextSize = Math.max(8, Math.min(96, Math.round(currentSize + delta)));
  if(wrapSelectionWithStyle(activeEditDoc, 'fontSize', nextSize + 'px')){
    pushHistory(); syncCodeFromCanvas();
    updateTextFormatBar(activeEditArtboard);
  }
}

// ---------- font family picker ----------
// small curated catalog — system stacks need nothing extra; Google-hosted
// ones need their stylesheet injected into the artboard's own <head> the
// first time they're used, or the browser just falls back silently.
const SYSTEM_FONTS = {
  'Padrão do sistema': '-apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  'Georgia (serif)': 'Georgia, "Times New Roman", serif',
  'Courier (mono)': '"Courier New", Courier, monospace'
};
const GOOGLE_FONTS = {
  'Inter': 'Inter:wght@400;500;600;700',
  'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Fraunces': 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700',
  'Poppins': 'Poppins:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'JetBrains Mono': 'JetBrains+Mono:wght@400;500;600'
};
function ensureGoogleFont(doc, family){
  if(!GOOGLE_FONTS[family] || !doc.head) return;
  const id = 'gf-' + family.replace(/\s+/g, '-');
  if(doc.head.querySelector('#' + id)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet'; link.id = id;
  link.href = 'https://fonts.googleapis.com/css2?family=' + GOOGLE_FONTS[family] + '&display=swap';
  doc.head.appendChild(link);
}
function fontFamilyOptionsHTML(currentFF){
  const cur = (currentFF || '').replace(/["']/g, '').split(',')[0].trim();
  let html = '<option value=""' + (!cur ? ' selected' : '') + '>(herdado do pai)</option>';
  html += '<optgroup label="Sistema">';
  Object.keys(SYSTEM_FONTS).forEach(function(label){
    const stack = SYSTEM_FONTS[label];
    const name = stack.split(',')[0].replace(/["']/g, '').trim();
    html += '<option value="' + stack.replace(/"/g, '&quot;') + '"' + (cur === name ? ' selected' : '') + '>' + label + '</option>';
  });
  html += '</optgroup><optgroup label="Google Fonts">';
  Object.keys(GOOGLE_FONTS).forEach(function(name){
    html += '<option value="' + name + '"' + (cur === name ? ' selected' : '') + '>' + name + '</option>';
  });
  html += '</optgroup>';
  return html;
}
function applyFontFamily(v, target){
  if(!v){ target.style.fontFamily = ''; return; }
  if(GOOGLE_FONTS[v]){
    ensureGoogleFont(target.ownerDocument, v);
    target.style.fontFamily = '"' + v + '", sans-serif';
  } else {
    target.style.fontFamily = v;
  }
}

// ---------- flex control icon buttons ----------
// direção/alinhar/distribuir used to be plain <select> text — each option
// here is a tiny live swatch actually laid out with that CSS value, so the
// icon can't drift out of sync with what it means.

function flexBar(w, h){ return '<span class="bar" style="width:' + w + '; height:' + h + ';"></span>'; }

function dirIconIcon(dir){
  const isCol = dir.indexOf('column') === 0;
  const bar = isCol ? flexBar('100%', '3px') : flexBar('3px', '100%');
  return '<span class="swatch" style="flex-direction:' + dir + '; gap:2.5px;">' + bar + bar + bar + '</span>';
}
function alignIconIcon(val){
  const heights = val === 'stretch' ? ['100%', '100%', '100%'] : ['45%', '100%', '65%'];
  return '<span class="swatch" style="flex-direction:row; align-items:' + val + '; gap:2.5px;">' +
    flexBar('4px', heights[0]) + flexBar('4px', heights[1]) + flexBar('4px', heights[2]) + '</span>';
}
function justifyIconIcon(val){
  const gap = val.indexOf('space') === 0 ? '0' : '2.5px';
  return '<span class="swatch" style="flex-direction:row; justify-content:' + val + '; align-items:center; gap:' + gap + ';">' +
    flexBar('4px', '55%') + flexBar('4px', '55%') + flexBar('4px', '55%') + '</span>';
}

function flexIconGroupHTML(id, options, current, iconFn){
  return '<div class="flexIconGroup" id="' + id + '">' + options.map(function(o){
    return '<button type="button" class="flexIconBtn' + (o === current ? ' active' : '') + '" data-value="' + o + '" title="' + o + '">' + iconFn(o) + '</button>';
  }).join('') + '</div>';
}
function bindFlexIconGroup(id, fn){
  const group = document.getElementById(id);
  if(!group) return;
  Array.from(group.querySelectorAll('.flexIconBtn')).forEach(function(btn){
    btn.addEventListener('click', function(){
      Array.from(group.querySelectorAll('.flexIconBtn')).forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      effectiveSelection().forEach(function(t){ fn(btn.dataset.value, t); });
      updateOverlayLive();
      clearTimeout(codeDebounce);
      codeDebounce = setTimeout(function(){ pushHistory(); syncCodeFromCanvas(); }, 400);
    });
  });
}

