# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Arclane is an offline HTML artifact editor: open an `.html` file, edit it visually on a canvas with multiple artboards, edit its real CSS/JS, and save/export back to disk. It runs entirely in the browser — no build step, no framework, no backend, no dependencies.

The project has no build step — all logic used to live in a single `app.js` (~5,700 lines, one IIFE). It has since been split into 25 plain `<script>` files under `js/` (see Architecture below), but the runtime model is unchanged: `index.html` loads them in dependency order and, because none of them wraps itself in its own function/IIFE, their top-level `const`/`let`/`function` declarations all share one global script scope — exactly as if it were still one file. Zero dependencies either way.

| File / dir | Purpose |
|---|---|
| `index.html` | Editor UI structure (toolbar, side panels, canvas, modals) + the ordered `<script src="js/...">` list |
| `style.css` | Editor UI styling (dark/light theme via CSS vars, panels, overlays) |
| `js/*.js` | All application logic, split by concern (see Architecture) |

Each artboard is a user-imported/created HTML document rendered inside a sandboxed `<iframe>`, with an edit overlay drawn on top for selecting/moving/resizing elements. Edits sync bidirectionally between the visual canvas and the artboard's underlying HTML/CSS/JS.

There is also a separate, unrelated design-system export living in `Design System para Painel Veicular/` (a set of `.dc.html` screens for a different project, "Samma Cars") plus `Arclane.json` / `Sammacar.json` saved-project files. These are content/data, not app code — `.gitignore` excludes the design-system folder/zip and all `*.json` from version control.

## Running / testing

There is no build, package manager, or automated test suite.

```bash
# Open directly
open index.html

# Or serve locally (recommended — file:// restricts File API / localStorage)
npx serve .
# or
python3 -m http.server 8080
```

Manual test loop after any change:
1. Open `index.html` in Chrome/Edge/Firefox.
2. Create a new artboard, or import a template from `templates/` (`landing.html`, `login.html`, `register.html`).
3. Exercise selection, drag, resize, the properties panel, layers panel, and code panel.
4. Toggle Edit mode vs. Visualizar (preview/run) mode.
5. Test any "no-code" action (navigate to artboard, toggle element, set text, call JS function), then export the `.html` and open it standalone to confirm exported behavior still works.

## Architecture (`js/`)

Each file in `js/` is a plain `<script src="...">` — **not** individually wrapped in an IIFE — loaded by `index.html` in the exact order listed below. That order is load-bearing: a later file's top-level code can reference an earlier file's `const`/`let`/`function`, but not the reverse, because they all share one global script-scope lexical environment (this is standard browser behavior for classic, non-module scripts — no bundler needed). If you add a new file, add its `<script>` tag in `index.html` in the right dependency position, not just at the end.

In file (= load) order:

- **`core-state.js`** — shared constants (`DEFAULT_DOC`) and top-level DOM refs/state (`artboards`, counters) every other file reads/mutates.
- **`artboard.js`** (`createArtboard`) — each artboard is an iframe + overlay + title bar, with its own size/position on a free-roaming 6000×4000px pan/zoom canvas, and its own undo history.
- **`history.js`** — document load/history + code panel sync; canvas ↔ code bidirectional sync; applying code reconstructs the artboard iframe.
- **`selection-overlay.js`**, **`snap-resize.js`**, **`canvas-listeners.js`** — the direct-manipulation editing core: selection & overlay, align/distribute, drag to move/reorder, snap guides, resize, iframe-internal listeners. Supports multi-select.
- **`layers-panel.js`** — tree view of the real DOM of the active artboard; drag to reorder/nest.
- **`properties-artboard.js`**, **`actions-no-code.js`**, **`element-attributes.js`**, **`properties-element.js`**, **`color-picker.js`**, **`text-toolbar.js`** — the properties panel (element/artboard, two views: "Exibir" = essentials, "Avançado" = everything), collapsible sections (Layout, Cor, Padding, Margin, Borda, Cantos, Aparência…), linked padding/margin/corner fields, custom color picker (saturation/value + hue + alpha + hex/rgba + eyedropper), and the four no-code action types (navigate to artboard, show/hide element, set element text, call a JS function) triggered on click/hover/hoverout/load.
- **`elements-chart.js`** — add-element menu + chart element (bar/line/pie) drawn on native 2D canvas; only the config (`data-ae-chart`) is persisted, pixels are redrawn on every load.
- **`icon-catalog.js`** — small built-in icon set.
- **`group-clipboard.js`**, **`clipboard-shortcuts.js`**, **`context-menu.js`** — group/ungroup, duplicate/delete, clipboard, keyboard shortcuts, context menu, modal (replaces `alert`/`confirm`/`prompt`).
- **`projects.js`**, **`recent-projects.js`** — project files on disk (`{ type: "artifact-editor-project", version: 1, artboards: [...] }`); "Recentes" uses `localStorage` for thumbnails only.
- **`toolbar-wiring.js`**, **`side-panels.js`** — main toolbar wiring; side-panel collapse/drag-to-resize.
- **`css-class-editor.js`** (FASE 08) — structured CSS class editor + cross-project class library + global CSS variables, separate from the properties panel.
- **`formula-bar.js`** (FASE 10) — Power-Apps-style formula bar: named elements become variables backed by a `Proxy` (`hide()`/`show()`/`toggle()`/`text`/`html`/`value`, else falls through to the real DOM element). Behavioral formulas persist in an inert `<script type="text/x-ae-formula">` tag and are replayed in exported HTML; mutation formulas serialize directly into the HTML.
- **`init.js`** — entry point, runs last.

### `data-ae-*` internal metadata attributes

These are the glue between the editor UI and the artboard DOM. They must never leak into exported output (except the disposable `-eid`, added only where an action actually needs to resolve a target):

| Attribute | Purpose |
|---|---|
| `data-ae-name` | Internal element name (layers panel, formula bar) — stripped on export |
| `data-ae-user-js` | Marks the artboard's user-edited `<script>` |
| `data-ae-chart` | JSON config for a canvas chart |
| `data-ae-goto` | Target artboard id (navigate action) |
| `data-ae-toggle` / `data-ae-settext` / `data-ae-call` | Target element name / function name for the other 3 actions |
| `data-ae-evt` | Trigger event: `click`, `hover`, `hoverout`, `load` |
| `data-ae-locked` | Element locked (not selectable) |
| `data-ae-group` | Group membership |
| `data-ae-eid` | Disposable id generated only at export time, only for elements an action actually targets |

### Export pipeline

Exports (full `.html`, HTML+external CSS, CSS-only, PNG, SVG) go through a cleanup step (`cleanExportHTML`-style) that strips all editor-internal `data-ae-*`/selection/highlight artifacts and emits standalone HTML/CSS/JS with no dependency on the editor runtime. Prefer keeping exports to one file each (1 HTML + 1 CSS + 1 JS) unless the user asks for modularization.

## Code conventions (from `AGENTS.md`, in force for this repo)

- **No external dependencies, no build tooling.** The project is intentionally zero-dependency — do not add any.
- Existing code style: hybrid ES5/ES6 — `const`/`let` are used, but functions are mostly `function` declarations, not arrow functions; everything lives inside the one IIFE; no classes, state lives in plain objects (`state`, `artboards`) with closures; nested callbacks over promises (async is rare); comments are extensive and in Portuguese, explaining architecture decisions and past bugs. Match this style in the existing surrounding code rather than mixing conventions.

### Working style for large modifications

When a requested change is large, the first question is whether it can be broken into independent parts — and if so, do it that way by default. Don't spend a long stretch silently reading/planning the whole thing before touching anything: work in small visible increments, one part at a time — read/identify a part, act on it, report what was done ("fiz X"), move to the next part. Long silent up-front analysis on a big task burns time and tokens without adding value; the user would rather see fast incremental progress they can redirect early than one big careful pass planned end-to-end before any action. This does not apply to genuinely ambiguous design decisions — those still deserve real thought before acting.

### Checklist for any change to this project
- Keep the existing code pattern: IIFE, `function` declarations, comments in Portuguese (for code that follows the existing style).
- Don't add external dependencies — zero-dependency is intentional.
- Don't break File API compatibility — importing/saving `.html` and `.json` must keep working.
- Test in the browser — there are no automated tests; every change needs manual validation.
- Preserve `data-ae-*` attributes — they're the glue between the editor UI and the artboard DOM.
- Update `README.md` if you add new phases or significant features (it tracks completed "Fases" in detail, in Portuguese).

### Senior front-end rules ("Regras de Ouro") — apply to new/refactored code
Act like a minimalist, pragmatic senior front-end dev; avoid unnecessary abstractions.

**Separation of concerns**
- HTML = structure, CSS = style, JS = behavior. Never mix them.
- No inline `style=` and no inline event handlers (`onclick=`, etc.) — neither in the editor UI nor in generated/exported markup.

**General code**
- Code (variables, classes, functions, comments) in English going forward.
- Comment only the *why*, never the *what*. If code needs a comment to explain what it does, rewrite the code instead.
- No excessive defensive code, generic `try/catch`, or unrequested validation.
- Before adding a new function/file, check whether an equivalent reusable one already exists.

**HTML**
- Semantics first: `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>` instead of generic `<div>`.
- Keep the DOM as flat as possible — avoid deep nesting ("div soup").
- `alt` is required on `<img>`; `aria-label` on interactive elements with no visible text.
- Double quotes on all attributes.
- Strict BEM class naming: `.card`, `.card__title`, `.card--dark`. Never use IDs for styling.

**CSS**
- Strict BEM — no deeply nested selectors or `.card .title span`-style chains.
- Mobile-first: base styles outside media queries; `@media (min-width: ...)` only for larger-viewport adaptations.
- CSS custom properties in `:root` for colors, typography, spacing, breakpoints — no repeated "magic" hardcoded values.
- No `!important`. No styling bare tags (`button {}`) — always through a class.
- One selector, one responsibility. Never duplicate a rule that already exists — centralize it in a variable or utility class.

**JavaScript**
- `const`/`let` only, never `var`; `const` by default.
- camelCase for functions/variables, PascalCase for classes.
- Small, pure, single-responsibility functions — split anything over ~20 lines.
- Cache DOM selectors in a variable when used more than once. Use event delegation for dynamic lists/elements.
- `async/await` instead of chained `.then().catch()`.
- Never leave `console.log`, dead code, or `TODO`s in final output.

**Visual-editor-specific rules (critical)**
- Keep the "editor runtime" separate from the "exported output". Drag-and-drop, selection, panels, undo/redo, etc. must **NEVER** appear in exported HTML/CSS/JS.
- Exported HTML must not contain internal editor attributes (`data-ae-*` beyond the disposable `data-ae-eid`, selection/highlight classes). Run a sanitization step before export, matching the existing `cleanExportHTML`-style pipeline.
- Exported CSS must contain only the classes/styles the user actually used — no leftover editor default styles or unused classes (manual CSS tree-shaking).
- Exported JS must be standalone: no dependency on the editor runtime, no internal library imports — only the behavior the user configured.
- Prefer few output files (1 HTML + 1 CSS + 1 JS) over fragmenting into multiple modules, unless the user explicitly asks for modularization.
- Name exported classes readably and stably (BEM), never with editor-generated hashes/IDs (e.g. avoid `el-a83f2`).
- Any interactive component (modal, tab, accordion) should export only the minimal JS needed for that specific component, not a generic library.

## Security notes

- Each artboard runs in `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">`.
- No HTML sanitization — the editor trusts imported content by design (it's a local, single-user tool). Don't add sanitization/validation that isn't already there unless asked.
- The app is 100% client-side with no authentication layer.
