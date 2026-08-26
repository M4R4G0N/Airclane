"use strict";

// baseline reset every new artboard starts with — box-sizing:border-box so
// padding doesn't blow up a width/height you just set, and html/body at
// height:100% so a child can actually do height:100%/flex fill instead of
// collapsing to 0 (percentage heights need a sized ancestor chain).
const DEFAULT_DOC = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<style>\n  *{ box-sizing:border-box; }\n  html, body{ height:100%; }\n  body{ margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#ffffff; }\n</style>\n</head>\n<body>\n\n<div style="display:inline-block; padding:20px; background:#35d0a4; color:#06231b; border-radius:12px; font-size:20px; font-weight:700;">Novo artboard</div>\n\n</body>\n</html>\n';

const artboardsRow = document.getElementById('artboardsRow');
const canvasWrap = document.getElementById('canvasWrap');
const layersTree = document.getElementById('layersTree');
const propsBody = document.getElementById('propsBody');
const codeArea = document.getElementById('codeArea');
const codePanel = document.getElementById('codePanel');
const dropHint = document.getElementById('dropHint');

let artboards = [];
let artboardCounter = 0;
let elNameCounter = 0;
// populated by attributesSectionHTML(BUTTON) each render, consumed by
// bindAttributesSection right after — same synchronous render→bind pass
// used for every other props-panel field, just indexed instead of by id.
let toggleTargetCandidates = [];
// section headers the user has collapsed in the Propriedades panel —
// keyed by the header's own text ("Layout", "Cor"…), persists across
// re-renders/selections for the session, same idea as collapsedLayers.
// starts with the less-frequently-touched sections already folded, so a
// freshly selected element in "Avançado" doesn't dump everything expanded
// at once — the user can still expand/collapse any of them, and that choice
// is remembered same as before.
let collapsedPropsSections = new Set(['Cantos', 'Padding', 'Margin', 'Borda', 'Sombra', 'Sombra do texto', 'Regra CSS da classe']);
// section headers always visible in the "Exibir" (simple) props view —
// everything else only shows in "Avançado". "Ação" lives in Avançado only:
// wiring behavior is a power-user move, not an everyday adjustment.
const PROPS_SIMPLE_SECTIONS = ['Texto', 'Container', 'Lista', 'Mídia', 'Indicador', 'Layout', 'Cor', 'Cantos', 'Padding', 'Margin', 'Borda', 'Tamanho', 'Sombra', 'Sombra do texto'];

const state = {
  zoom: 1,
  editMode: true,
  activeId: null,
  selected: null,     // selected element inside the active artboard
  artboardMode: false, // true when the *artboard itself* (not an element) is selected
  currentProject: null,
  rulePickedClass: null, // which of the selected element's classes the CSS-rule editor is showing
  multiSelect: new Set(), // secondary elements selected with Ctrl/Cmd+click, for align/distribute/bulk delete
  layersFilter: '',
  propsSearchQuery: '',
  stylePainter: { active: false, props: null }, // "copiar estilo" tool: pick a source, then apply to targets
  codeTab: 'html', // which source the code panel's textarea is showing/applying: 'html' or 'js'
  propsView: 'simple' // 'simple' shows only the everyday sections (Tipo/Layout/Cor…); 'full' shows every section
};

// state.selected plus everything in state.multiSelect, as an array.
function effectiveSelection(){
  const set = new Set(state.multiSelect);
  if(state.selected) set.add(state.selected);
  return Array.from(set);
}

// Ctrl/Cmd+click toggles an element's membership in the multi-selection,
// without touching the primary state.selected (used for the properties
// panel) or starting any drag.
function toggleMultiSelect(el){
  if(!state.selected){ selectElement(el); return; }
  if(el === state.selected){
    if(state.multiSelect.size){
      const arr = Array.from(state.multiSelect);
      const next = arr.pop();
      state.multiSelect = new Set(arr);
      state.selected = next;
    } else {
      state.selected = null;
    }
  } else if(state.multiSelect.has(el)){
    state.multiSelect.delete(el);
  } else {
    state.multiSelect.add(el);
  }
  state.artboardMode = false;
  renderOverlay(); renderProps(); highlightLayerRow();
}

