# Arclane — Canvas Editor

> Leitor e editor de artifacts HTML, offline. App HTML puro, sem servidor e sem dependência de internet, pra abrir arquivos `.html`, editar visualmente num canvas com múltiplos artboards, editar CSS e JS de verdade — e salvar/exportar direto no disco.

---

## Visão Geral

**Arclane** é um editor visual de artifacts HTML que roda inteiramente no navegador, sem build, sem framework e sem backend. O projeto é composto por apenas três arquivos principais:

| Arquivo | Função |
|---------|--------|
| `index.html` | Estrutura da interface do editor (toolbar, painéis laterais, canvas, modais) |
| `style.css` | Estilos da interface do editor (tema escuro/claro, painéis, overlays, componentes UI) |
| `app.js` | Toda a lógica do aplicativo (~5.300 linhas, IIFE, sem dependências externas) |

A aplicação carrega artifacts HTML dentro de iframes sandboxed, sobrepondo uma camada de edição (overlay) que permite selecionar, mover, redimensionar e editar elementos visualmente. As alterações são refletidas em tempo real no código HTML subjacente, e vice-versa.

---

## Stack Tecnológica

- **Frontend:** HTML5 + CSS3 + JavaScript puro (ES5/ES6, IIFE, sem módulos)
- **Sem build:** não há `package.json`, `vite.config.js`, webpack, ou qualquer ferramenta de bundling
- **Sem framework:** não usa React, Vue, Angular, ou bibliotecas externas
- **Fontes:** Google Fonts (`Fraunces` para display, `Manrope` para body)
- **Armazenamento:** `localStorage` (tema, projetos recentes) + File API (abrir/salvar arquivos)
- **Persistência de projeto:** arquivos `.json` no disco, com estrutura `{ type: "artifact-editor-project", version: 1, artboards: [...] }`

---

## Como Executar

Como não há processo de build, basta abrir o arquivo `index.html` em qualquer navegador moderno:

```bash
# Opção 1: abrir diretamente
open index.html

# Opção 2: servidor local simples (recomendado pra drag-and-drop de arquivos funcionar sem restrições)
npx serve .
# ou
python3 -m http.server 8080
```

> **Nota:** Alguns navegadores restringem o acesso ao File API e ao `localStorage` quando o arquivo é aberto diretamente (`file://`). Para funcionalidade completa (importar/exportar arquivos, drag-and-drop), use um servidor local HTTP.

---

## Estrutura do Projeto

```
Arclane/
├── index.html              # Interface do editor
├── style.css               # Estilos da interface do editor
├── app.js                  # Lógica principal (~5.300 linhas)
├── README.md               # Documentação detalhada (em português)
├── .gitignore              # Ignora Design System e arquivos .json
│
├── templates/              # Templates HTML prontos pra importar
│   ├── landing.html        # Landing page (identidade Arclane)
│   ├── login.html          # Tela de login
│   └── register.html       # Tela de cadastro
│
├── Arclane.json            # Projeto salvo (landing + login + register)
├── Sammacar.json           # Projeto salvo (Design System de painel veicular)
│
└── Design System para Painel Veicular/   # Design system exportado (HTMLs + assets)
    ├── *.dc.html           # Telas do design system
    └── uploads/            # Imagens e assets
```

---

## Arquitetura do Código (`app.js`)

O arquivo `app.js` é um único IIFE (Immediately Invoked Function Expression) que organiza o código em seções funcionais bem demarcadas por comentários `// ----------`. As principais áreas são:

### 1. Modelo de Artboard
- **`createArtboard(opts)`** — cria um novo artboard (iframe + overlay + título) no canvas
- Cada artboard mantém: dimensões (w/h), posição (x/y), histórico de undos, referências DOM
- Artboards são posicionados livremente num canvas de 6000×4000px com zoom e pan

### 2. Seleção e Overlay
- **`selectElement(el)`** / **`selectArtboardOnly(id)`** — gerencia o estado de seleção
- **`renderOverlay()`** — desenha caixas de seleção, alças de redimensionamento e guias de snap
- Suporta seleção múltipla (`Ctrl/Cmd+click`) com alinhamento e distribuição

### 3. Painel de Propriedades
- Duas visões: **"Exibir"** (essencial: tipo, ação, layout, cor) e **"Avançado"** (todos os campos)
- Seções recolhíveis: Layout, Cor, Padding, Margin, Borda, Cantos, Aparência, etc.
- Campos com cadeado (🔗) para vincular os 4 lados de padding/margin/cantos
- Seletor de cor customizado (saturation/value + hue + alpha + hex/rgba + conta-gotas)

### 4. Painel de Camadas
- Árvore refletindo o DOM real do artboard ativo
- Arrastar para reordenar ou aninhar elementos
- Busca, mostrar/ocultar, renomear camadas

### 5. Painel de Código
- Aba **HTML**: edita o markup completo do artboard
- Aba **JS**: edita um `<script data-ae-user-js>` dedicado dentro do artboard
- Sincronização bidirecional: canvas ↔ código (aplica e recarrega o iframe)

### 6. Editor de CSS Estruturado (Fase 08)
- Modal com duas abas: **Biblioteca de Classes** e **Variáveis Globais**
- Permite criar, editar e reaproveitar classes CSS entre elementos e artboards
- Variáveis CSS no `:root` do artboard ativo

### 7. Ações Sem Código (Fase 09)
- Quatro tipos de ação configuráveis via painel de propriedades:
  1. **Navegar para artboard** — em links e botões
  2. **Mostrar/ocultar elemento** — toggle de visibilidade
  3. **Definir texto de elemento** — altera conteúdo de outro elemento
  4. **Chamar função JS** — invoca função escrita na aba JS
- Eventos: click, hover, hoverout, load

### 8. Gráficos em Canvas (Fase 11)
- Elemento `<canvas data-ae-chart>` desenhado com canvas 2D nativo
- Tipos: barra, linha, pizza
- Configuração guardada em `data-ae-chart`, redesenhado em cada carga

### 9. Tabelas (Fase 12)
- Adicionar/excluir linhas e colunas, mover, mesclar células (`colspan`/`rowspan`)
- Marcar linha como cabeçalho (`th`)
- Estilos prontos: Nenhum / Bordas / Zebrado

### 10. Exportação
- **Exportar `.html`** completo (com script de ações e gráficos embutidos)
- **Exportar só HTML** (linkando CSS externo)
- **Exportar só CSS**
- **Exportar PNG/SVG** — seleção ou artboard inteiro
- Metadados internos (`data-ae-*`) são removidos na exportação para manter HTML limpo

---

## Convenções de Código

### Estilo JavaScript
- **ES5/ES6 híbrido:** `const`/`let` são usados, mas funções são majoritariamente `function` declarations (não arrow functions)
- **IIFE:** todo o código vive dentro de `(function(){ "use strict"; ... })();`
- **Sem classes:** tudo é procedural com closures; o estado vive em objetos plain (`state`, `artboards`)
- **Callbacks aninhados:** padrão pré-Promise; async é raro
- **Comentários explicativos:** extensivos, em português, explicando decisões de arquitetura e bugs corrigidos

### Atributos `data-ae-*` (metadados internos)

| Atributo | Propósito |
|----------|-----------|
| `data-ae-name` | Nome interno do elemento (aparece na camada, não exportado) |
| `data-ae-user-js` | Marca o `<script>` editado na aba JS |
| `data-ae-chart` | Configuração JSON do gráfico canvas |
| `data-ae-goto` | ID do artboard alvo (navegação interna) |
| `data-ae-toggle` | Nome do elemento alvo (mostrar/ocultar) |
| `data-ae-settext` | Nome do elemento alvo (definir texto) |
| `data-ae-call` | Nome da função JS a chamar |
| `data-ae-evt` | Evento que dispara a ação: `click`, `hover`, `hoverout`, `load` |
| `data-ae-locked` | Elemento travado (não selecionável) |
| `data-ae-group` | Grupo de elementos |
| `data-ae-eid` | ID descartável gerado na exportação (só para targets de ação) |

### CSS da Interface
- **Variáveis CSS:** `:root` define paleta completa; `[data-theme="light"]` sobrescreve para tema claro
- **Design system interno:** `.iconField`, `.flexIconBtn`, `.colorSwatchBtn`, `.propsSection`, etc.
- **Responsividade limitada:** a interface do editor não é responsiva; espera desktop

---

## Testes

Não há suite de testes automatizados. O projeto é testado manualmente no navegador:

1. Abrir `index.html` em Chrome/Edge/Firefox
2. Criar um artboard novo
3. Importar um template (`templates/landing.html`)
4. Testar: seleção, drag, resize, propriedades, camadas, código, exportação
5. Alternar entre modo Editar e Visualizar
6. Testar ações: criar link de navegação, exportar, abrir o `.html` exportado

---

## Considerações de Segurança

- **Iframes sandboxed:** cada artboard roda num `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">`
- **Sem sanitização de HTML:** o editor confia no conteúdo que o usuário importa; não há DOMPurify ou similar
- **Scripts são executados:** ao aplicar código ou entrar no modo Visualizar, o JS do artboard roda de verdade
- **Ações exportadas:** na exportação, scripts inline são gerados automaticamente para tornar as ações funcionais fora do editor
- **Não há autenticação:** é uma aplicação 100% client-side

---

## Checklist para Agentes de Código

Ao modificar este projeto:

- [ ] **Mantenha o padrão de código existente:** IIFE, `function` declarations, comentários em português
- [ ] **Não adicione dependências externas:** o projeto é intencionalmente zero-dependency
- [ ] **Não quebre a compatibilidade com File API:** importar/salvar `.html` e `.json` deve continuar funcionando
- [ ] **Teste no navegador:** não há testes automatizados; toda mudança precisa de validação manual
- [ ] **Preserve atributos `data-ae-*`:** eles são a cola entre a UI e o DOM do artboard
- [ ] **Atualize `README.md`** se adicionar novas fases ou funcionalidades significativas

---

## Diretrizes de Front-end Sênior (Regras de Ouro)

> Atue como desenvolvedor Front-end Sênior: minimalista, pragmático, sem abstrações desnecessárias.

### Separação de Responsabilidades
- **HTML** = estrutura, **CSS** = estilo, **JS** = comportamento. Nunca misture.
- Proibido estilo inline (`style=`) e handlers inline (`onclick=`).

### Código
- Código sempre em **inglês** (variáveis, classes, funções, comentários).
- Comente apenas o **"porquê"**, nunca o **"o quê"**. Se precisa de comentário pra explicar, reescreva o código.
- Não gere código defensivo excessivo, `try/catch` genérico, ou validações não solicitadas.
- Antes de adicionar função/arquivo novo, verifique se já existe algo reutilizável equivalente.

### HTML
- Semântica primeiro: `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>` em vez de `<div>` genérica.
- DOM o mais plano possível — evite aninhamento profundo ("div soup").
- `alt` obrigatório em `<img>`; `aria-label` em elementos interativos sem texto visível.
- Aspas duplas em todos os atributos.
- Classes seguem **BEM estrito**: `.card`, `.card__title`, `.card--dark`. Nunca IDs para estilo.

### CSS
- **BEM estrito**: sem seletores aninhados profundos ou `.card .title span`.
- **Mobile-first**: estilo base fora de media query; `@media (min-width: ...)` só para adaptações maiores.
- CSS Custom Properties no `:root` para cores, tipografia, espaçamento e breakpoints — nenhum valor "mágico" hardcoded repetido.
- Proibido `!important`. Proibido estilizar tag crua (`button {}`) — sempre via classe.
- Um seletor, uma responsabilidade. Nunca duplique regra que já existe — centralize em variável ou classe utilitária.

### JavaScript
- `const`/`let` apenas, nunca `var`. `const` por padrão.
- camelCase para funções/variáveis, PascalCase para classes.
- Funções pequenas, puras, uma responsabilidade cada. Se passar de ~20 linhas, quebre.
- Cache de seletores DOM em variável quando usados mais de uma vez. Delegação de eventos em listas/elementos dinâmicos.
- `async/await` em vez de `.then().catch()` encadeado.
- Nunca deixe `console.log`, código morto ou `TODO` no output final.

### Regras Específicas do Editor Visual (Crítico)

- **Separe o "runtime do editor" do "output exportado"**. Código de drag-and-drop, seleção, painéis, undo/redo etc. **NUNCA** deve aparecer no HTML/CSS/JS exportado.
- O HTML exportado não deve conter atributos internos do editor (`data-editor-id`, `data-selected`, classes de highlight/grid). Faça etapa de **sanitização** antes de exportar.
- O CSS exportado deve conter apenas as classes/estilos que o usuário de fato usou — sem resíduo de estilos padrão do editor ou classes não utilizadas (tree-shaking manual de CSS).
- O JS exportado deve ser **standalone**: sem dependência do runtime do editor, sem imports de bibliotecas internas, apenas o comportamento que o usuário configurou.
- Ao gerar o export, prefira poucos arquivos (1 HTML + 1 CSS + 1 JS) em vez de fragmentar em múltiplos módulos — a menos que o usuário peça modularização explícita.
- Nomeie classes exportadas de forma legível e estável (BEM), nunca com hashes/IDs gerados automaticamente pelo editor (ex: `el-a83f2`).
- Toda funcionalidade interativa (modal, tab, accordion) deve exportar o JS **mínimo necessário para aquele componente específico**, não uma biblioteca genérica inteira.
