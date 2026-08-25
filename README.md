# Artifact Editor · Plano de Construção

Leitor e editor de artifacts, offline. App HTML, sem servidor e sem dependência de internet, pra abrir os HTML que eu gero, editar visualmente num canvas com múltiplos artboards, editar CSS e JS de verdade — e salvar/exportar direto no disco.

- **Local:** `ArtifactEditor/` (`index.html` + `style.css` + `app.js`)
- **Stack:** HTML + CSS + JS puro, sem build
- **Fase atual:** 1–14 concluídas 🎉

---

## 📊 Visão Geral do Progresso

### — Construído —
- [x] **01. Núcleo**
- [x] **02. Formas e elementos**
- [x] **03. Camadas e organização**
- [x] **04. Código ↔ Visual**
- [x] **05. Múltiplos artboards**
- [x] **06. Exportação e extras**
- [x] **07. Atributos, classes e menus**
- [x] **08. Editor de CSS estruturado**
- [x] **09. JS e ações do artboard**
- [x] **10. Barra de fórmulas (estilo Power Apps)**
- [x] **11. Gráficos (canvas)**
- [x] **12. Tabelas — melhorias**
- [x] **13. Redesenho da interface**
- [x] **14. Ajustes finos do editor**

### — Planejado —
_(nada por aqui — todas as fases concluídas)_

---

## — Construído —

### FASE 01 · Núcleo `concluído`
O essencial pra abrir um artifact, mexer nele e salvar de volta.
- Importar artifact (`.html`) por arquivo ou arrastar e soltar — inclusive direto em cima de um artboard
- Canvas com pan e zoom, artboard com tamanho ajustável (e alças de redimensionar, igual elemento)
- Seleção por clique, com contorno e alças na tela
- Mover (Shift+arrastar) e redimensionar sem distorcer o elemento
- Elementos nascem em fluxo normal (não `position:absolute`) — arrastar reordena entre irmãos; virar posição livre é opt-in
- Painel de propriedades: posição, tamanho, cor, fonte, cantos, opacidade, padding, margin, borda, z-index
- Edição de texto inline (duplo clique)
- Desfazer / refazer (por artboard)
- `Ctrl+C` / `Ctrl+V` pra copiar e colar elementos
- Exportar de volta como `.html`

### FASE 02 · Formas e elementos `concluído`
Adicionar coisas novas ao artifact, não só editar o que já existe.
- Menu "+ Elemento": div, texto, span, parágrafo, título, botão, link, lista, tabela, nav, section, header, footer, **formulário**, input, imagem
- Controle de display (block, flex, inline-block, grid, none) e position no painel
- Tabela: adicionar linha / adicionar coluna pelo menu de contexto
- Lista: adicionar item pelo menu de contexto
- Duplicar elemento (`Ctrl+D`)
- Linha e elipse/círculo
- Agrupar / desagrupar elementos
- Ferramenta de copiar estilo (pincel / eyedropper) entre elementos
- Catálogo completo com o resto do HTML comum: lista numerada `ol` e item `li` avulso, semântico `article`/`aside`/`main`/`figure`+`figcaption`, `label` avulso, `fieldset`+`legend`, mídia `video`/`audio`/`iframe`, interativo `details`+`summary`/`progress`/`meter`
- Menu "+ Elemento" bem mais enxuto (de ~50 pra 23 itens): o mesmo truque do "Tipo" no painel de Propriedades (igual o Tipo do Input ou do Botão) substitui várias entradas antes separadas —
  - **T Texto** → tipo `span`/`p`/`h1`–`h6`/`blockquote`/`strong`/`em`/`b`/`i`/`code`/`pre`
  - **Container** → tipo `div`/`section`/`article`/`aside`/`main`/`header`/`footer`/`nav`
  - **Lista** → tipo `ul`/`ol`
  - **Video / Audio** → tipo `video`/`audio`
  - **Progress / Meter** → tipo `progress`/`meter`
  - **Checkbox / Radio** → o campo já criado dentro é um `<input>` normal, troca o tipo pelo Tipo do próprio campo (já existia)
  
  Trocar o tipo depois de já ter criado também funciona — converte a tag mantendo conteúdo e atributos.
- Checkbox / Radio, segunda rodada: campo **Marcado por padrão** (`checked`) no painel, texto da opção editável direto pelo painel (sem precisar clicar duas vezes no canvas — edita só o texto ao lado do `<input>`, sem mexer nele), e botão **🔗 Agrupar** num rádio que dá o mesmo `name` pra todos os rádios irmãos de uma vez (grupo exclusivo, sem digitar igual em cada um)

### FASE 03 · Camadas e organização `concluído`
Enxergar e organizar a estrutura do artifact, não só os pixels.
- Painel de camadas em árvore, refletindo o DOM real, com recolher/expandir
- Mostrar/ocultar e excluir direto na camada
- Renomear camada (nome customizado, some na exportação limpa)
- Arrastar uma camada pra dentro da outra (aninhar) — inclusive uma linha "raiz" pra tirar de dentro
- Reordenar z-order (frente/trás) por botão, não só arrastando
- Alinhar e distribuir elementos selecionados
- Guias de snap ao mover (alinhamento magnético entre elementos)
- Seleção múltipla: painel de propriedades mostra e edita todos os selecionados de uma vez (mudar um campo muda todos)

### FASE 04 · Código ↔ Visual `concluído`
O ponto principal: editar exatamente o que eu gero, sem perder nada no meio do caminho.
- Painel de código com o HTML bruto do artboard ativo, editável
- Canvas → código: toda edição visual atualiza o código automaticamente
- Código → canvas: aplicar código reconstrói o artboard
- Modo Visualizar: artifact roda normalmente, com JS interativo, sem overlay de edição

### FASE 05 · Múltiplos artboards `concluído`
Pra quando um artifact tiver várias telas — um canvas livre com vários artboards lado a lado.
- Vários artboards no mesmo canvas, cada um com seu próprio arquivo por trás
- Arrastar o artboard pela barra de título pra reposicionar livremente
- Redimensionar o artboard pelas alças, igual um elemento
- Renomear (duplo clique no título), duplicar e excluir artboard
- Painel de propriedades do próprio artboard: nome, preset de tela (desktop/tablet/mobile), largura/altura, cor de fundo
- Projeto = arquivo `.json` no disco com todos os artboards (Salvar / Salvar como / Abrir projeto)
- Tela inicial com miniaturas dos últimos projetos abertos

### FASE 06 · Exportação e extras `concluído`
Polimento pra virar ferramenta do dia a dia.
- Exportar: `.html` completo, apenas HTML (linkando um `.css`), ou apenas CSS
- Tamanho do artboard sobrevive a exportar → importar de novo
- Tema claro/escuro na interface do editor
- Modais próprios no lugar de `alert`/`confirm`/`prompt` do navegador
- Exportar seleção ou artboard como PNG
- Exportar como SVG
- Atalhos de teclado adicionais (setas para mover 1px/10px)

### FASE 07 · Atributos, classes e menus `concluído`
Editar o elemento de verdade, não só a caixinha visual — atributos de HTML, a classe CSS dele, e um jeito rápido de agir sobre qualquer coisa.
- Atributos por tipo de elemento: `placeholder`, `type`, `value`, `name` (input/textarea), `href`/`target` (link), `alt` (imagem)
- Campo de classe CSS no painel, visível e editável
- Editor da regra CSS da classe direto no painel (edita o `<style>` de verdade, afeta todo mundo que usa a classe)
- Padrão de fundo (pontilhado / grade) como controle visual, sem escrever CSS
- Menu de botão direito contextual: em elemento, no artboard, e no canvas vazio
- Três templates prontos pra importar: landing page, login e cadastro (mesma identidade visual entre os três)

### FASE 08 · Editor de CSS estruturado `concluído`
Um editor de CSS de verdade, não só uma textarea — e uma biblioteca de classes que dá pra reaproveitar entre elementos e entre projetos.
- Editor de CSS dedicado (abre separado, não só embutido no painel de propriedades)
- Campos estruturados por propriedade CSS — parecido com o painel de propriedades de hoje, mas editando a regra da classe, não a instância
- Criar uma classe nova a partir do próprio editor (não só editar as que já existem)
- Biblioteca de classes com nome, buscável — reaproveitar uma classe já criada em outro elemento ou artboard sem reescrever CSS (a biblioteca cobre o projeto inteiro, não só o artboard ativo — escolher uma classe de outro artboard copia a regra pra cá automaticamente)
- Variáveis globais (cores, tamanhos) reutilizáveis via CSS custom properties, editáveis num painel central
- *Pensar nisso como o painel de propriedades atual, mas para a classe em vez do elemento — e com uma lista de "todas as classes desse projeto" pra não recriar a mesma coisa duas vezes.*

### FASE 13 · Redesenho da interface `concluído`
Limpar o menu superior e deixar os painéis laterais flexíveis — antes estava tudo fixo e um pouco apertado.
- Removido o seletor de tamanho de página do menu superior (o tamanho se ajusta pelo painel de Propriedades do próprio artboard)
- Zoom (`−`, `%`, `+`, `ajustar`) saiu do menu superior — agora é uma barrinha flutuante embaixo do canvas
- Painel de Camadas: redimensionável arrastando a borda, e pode minimizar/esconder (botão "Camadas" no menu superior)
- Painel de Propriedades: mesma coisa — some com o botão "Propriedades" e volta do mesmo jeito
- Menu superior mantido: exportar, salvar/abrir projeto e afins
- Removidos os botões "Duplicar" e "Excluir" do menu superior — fica implícito (Del pra excluir, X na camada, `Ctrl+D` pra duplicar, botão direito)
- Painel de propriedades: "Posição livre" (X/Y/Z) não é mais uma seção separada com texto explicativo — aparece direto junto do Layout só quando o elemento realmente tem posição livre
- Campos de `display:flex` (Direção, Alinhar, Distribuir) viraram botões com ícone — cada ícone é um miniaturizado ao vivo daquele valor de CSS, não um desenho solto

### FASE 09 · JS e ações do artboard `concluído`
O artifact já rodava o JS que vinha pronto no HTML (modo Visualizar); agora também dá pra escrever, testar ao vivo e exportar JS novo direto no editor.
- Ação "Navegar para artboard" em link (`<a>`) e botão (`<button>`) — funciona no modo Visualizar (leva até o artboard, com aviso se ele não existir mais) e exporta de verdade: link vira `href` direto pro arquivo do outro artboard, botão/formulário ganham um pequeno script inline (só funciona se os artboards ligados forem exportados pra mesma pasta, nome do arquivo = nome do artboard)
- Segunda ação sem código: "Mostrar/ocultar elemento" num botão, escolhendo o alvo por uma lista de elementos do artboard — funciona no modo Visualizar e no `.html` exportado, mesmo esquema de resolução da ação de navegar
- Terceira ação: "Definir texto de elemento" — escolhe o elemento-alvo (mesma lista da ação anterior) e digita o texto novo; ao disparar, troca o conteúdo do alvo por esse texto. Mesmo esquema de resolução por trás
- Quarta ação: "Chamar função JS" — digita (ou escolhe por autocomplete) o nome de uma função `function nome(){ }` escrita na aba JS do mesmo artboard, e o clique chama ela de verdade (dentro da função, `this` é o próprio elemento). Funciona no modo Visualizar e no `.html` exportado, e também detecta e reaproveita uma função já existente num artboard importado que trouxe `<script>` pronto
- As quatro ações (navegar / mostrar-ocultar / definir texto / chamar função) não são mais exclusivas do botão — qualquer elemento (div, span, imagem, parágrafo, etc.) ganhou uma seção "Ação" própria no painel de propriedades
- O seletor de elemento-alvo (usado por "mostrar/ocultar" e "definir texto") mostra a tag de verdade junto com o nome interno gerado — `div (el1)`, não só `el1` — pra não perder a referência de qual elemento é qual numa lista com vários
- Campo novo **ID (pra JavaScript)** no painel de propriedades, disponível pra qualquer elemento — é um `id` de HTML de verdade (sobrevive à exportação igual qualquer atributo), pra quem quer escrever `document.getElementById('meu-id')` na aba JS na mão, em vez de usar as ações prontas
- E não é mais só "ao clicar": cada ação escolhe o **evento** que dispara ela — ao clicar, ao passar o mouse, ao tirar o mouse, ou ao carregar o artboard (esse último roda uma vez, sozinho, sem precisar de clique nem do modo Visualizar — útil pra inicializar alguma coisa)
- Botão dedicado **`{ } JS`** no menu superior (ao lado de `Código`) abre o painel de código já na aba JavaScript — não é preciso passar pelo HTML pra achar
- Editor de JavaScript do artboard: aba própria dentro do painel de código, separada da aba HTML, editando só o `<script>` do artboard sem mexer na marcação — se o artboard foi importado já com um `<script>` de verdade, a aba adota ele em vez de ficar vazia
- Aplicar roda o script imediatamente dentro do próprio editor (recarrega o artboard); testar a interatividade de verdade (cliques, etc.) pede o modo Visualizar, porque no modo Editar o overlay de seleção intercepta o clique antes — sem precisar exportar pra nenhum dos dois
- O script escrito ali é um `<script>` de verdade no HTML do artboard (marcado internamente pra ser reencontrado ao reabrir a aba) — exporta funcionando, igual o resto do documento
- *Decisão de arquitetura (resolve a pendência que estava na Fase 10):* o nome do elemento (`data-ae-name`) continua sendo metadado interno, nunca aparece no HTML limpo. Uma ação que precisa mirar outro elemento (hoje só "mostrar/ocultar") resolve esse nome pro elemento de verdade só na hora de exportar, e só ali estampa um identificador descartável (`data-ae-eid`) — só nos elementos que alguma ação realmente referencia, não em todos. O mesmo esquema serve de base pra Fase 10.

### FASE 11 · Gráficos (canvas) `concluído`
Gráfico de verdade no artifact, não só uma imagem estática.
- Elemento novo "📊 Gráfico" no menu "+ Elemento" — desenhado em `<canvas>`, tipos barra/linha/pizza
- Sem escrever JS na mão: painel de propriedades tem "Tipo" (barra/linha/pizza) e um campo de dados (`rótulo:valor`, um por linha) — muda o gráfico ao vivo
- **Decisão tomada:** desenho próprio direto no canvas 2D (sem biblioteca externa embutida), redesenhado sempre que o artboard carrega — os pixels de um `<canvas>` não sobrevivem a serializar/reabrir o HTML, só a configuração (guardada em `data-ae-chart`) sobrevive, e o desenho é refeito a partir dela toda vez
- Funciona no modo Editar (redesenha ao aplicar/reabrir), e no `.html` exportado (a mesma função de desenho vai embutida num `<script>` só se o artboard realmente tiver algum gráfico)
- Editar os dados depois é só reabrir o gráfico e mudar o texto — não precisa recriar do zero

### FASE 12 · Tabelas — melhorias `concluído`
Hoje só dá pra adicionar linha e coluna. Falta o resto da edição de tabela.
- Excluir linha (botão direito numa linha) / excluir coluna (botão direito numa célula) — sempre mantendo pelo menos uma de cada
- Marcar/desmarcar uma linha como cabeçalho (`th` ↔ `td`) depois de já ter criado a tabela, pelo menu de botão direito
- Selecionar e editar uma célula com clique direto — já funcionava (clique no canvas seleciona a célula de verdade, sem precisar caçar na árvore de camadas)
- Ajustar largura de coluna arrastando a borda — já funcionava: a alça de redimensionar de qualquer elemento (Fase 01) funciona numa célula também, e como a tabela usa layout automático, isso já alarga a coluna inteira
- Segunda rodada, fora da lista original:
  - **Escolher linhas/colunas ao criar** — o item "Tabela" do menu "+ Elemento" agora pergunta quantas linhas de dados e quantas colunas antes de montar a tabela, em vez de nascer sempre 2×3
  - **Mover linha/coluna** — botão direito numa linha ou célula move ela pra cima/baixo ou esquerda/direita (desabilitado na ponta), sem precisar recriar a tabela pra reordenar
  - **Mesclar células** (`colspan`/`rowspan`) — selecione 2+ células adjacentes na mesma linha ou na mesma coluna (Ctrl/Cmd+clique) e "⊞ Mesclar células" aparece no menu de botão direito; junta o texto das células e remove as extras. Cobre o caso comum (células contíguas simples); não lida com mesclar por cima de uma tabela que já tem outras mescladas
  - **Estilo pronto** — nova seção "Tabela" no painel de propriedades (aba Avançado) com um seletor Nenhum/Bordas/Zebrado, sem precisar escrever CSS na mão pra listrar linhas ou engrossar borda

### FASE 14 · Ajustes finos do editor `concluído`
Uma lista de coisas menores, a maioria do tipo "isso aqui devia dar pra ajustar e não dá".
- [x] Bug do scroll: achei duas causas reais, não só o listener que já existia — (1) `updateOverlayLive` buscava a caixa de seleção com `.sel-box`, que também bate em `.sel-box.multi` (mesma classe base) — com seleção múltipla, ele podia atualizar a caixa errada; corrigido pra `.sel-box:not(.multi)`. (2) as caixas de seleção múltipla nunca eram reposicionadas em scroll/drag, só a principal — agora cada uma guarda referência pro elemento e acompanha também. Reforcei ainda com listener direto em todo elemento que realmente tem rolagem interna (`overflow:auto/scroll` com conteúdo maior que a caixa), além do listener em modo captura que já existia
- [x] Efeito de desfoque (`filter: blur()`) como controle no painel de Aparência
- [x] Padding e Margin: cadeado 🔗 pra vincular os 4 lados de uma vez (estilo Figma) — clica pra ativar, digita em qualquer lado e os outros três acompanham
- [x] Editar o texto de um elemento direto por um campo no painel de Propriedades (aparece pra qualquer elemento "folha", sem filhos), sem precisar entrar no modo de edição inline
- [x] Propriedades do artboard: nova seção "Comportamento (`<body>`)" com rolagem (`overflow`) e suavização de texto (padrão / antialiased / legibilidade otimizada)
- [x] Bônus, fora da lista original: campo **ID (pra JavaScript)** — um `id` de HTML de verdade em qualquer elemento, pra referenciar via `document.getElementById()` na aba `{ } JS` sem depender das ações prontas
- [x] Segunda rodada de repaginação do painel de Propriedades, também fora da lista original:
  - **Seções recolhíveis** — cada divisória (Layout, Cor, Padding, Aparência...) minimiza/maximiza com um clique, e lembra o estado entre seleções
  - **Duas visões**: "Exibir" (Tipo do container, Ação, Layout e Cor — só o essencial) e "Avançado" (todos os campos), alternando por um botão no topo do painel
  - **Cantos** virou 4 campos independentes (topo-esq/dir, baixo-esq/dir) com o mesmo cadeado 🔗 do padding/margin, em vez de um valor único pra tudo
  - **"→ Virar classe"** no CSS livre — pega o estilo inline do elemento, cria uma classe CSS nova com ele, aplica a classe e limpa o inline
  - **Ícones de flex** (Direção/Alinhar/Distribuir) redesenhados — moldura com borda visível ao redor de "chips" arredondados, mais legível que os traços finos de antes
  - **Seletor de cor de verdade**: quadrado de saturação/valor + barra de matiz + barra de opacidade (com fundo xadrez) + campo hex/rgba + paleta de cores rápidas, no lugar do `<input type="color">` nativo do navegador — usado em **todo** lugar que antes tinha o color picker nativo (propriedades do elemento, fundo do artboard, cor do padrão de fundo, editor de classe CSS, variáveis globais)
  - **Conta-gotas de verdade, mas escopado ao próprio canvas** — a API nativa `EyeDropper` não está disponível em todo Chrome (confirmado indisponível até no Chrome real usado aqui), então em vez dela o conta-gotas arma um modo de "apontar" que intercepta o clique dentro do próprio artboard: mostra uma lupinha seguindo o cursor (estilo Figma) com a cor ao vivo enquanto passa o mouse, e a cor já atualiza em tempo real na janelinha do seletor aberta, não só no clique final. Funciona em fundo (percorre os ancestrais até achar uma cor sólida), em texto (renderiza o caractere sob o cursor num canvas escondido e lê o pixel de verdade, pra não confundir tinta da letra com o fundo atrás dela) e em `<img>` (lê o pixel de verdade na resolução natural da imagem, respeitando `object-fit`)
  - **Barra de formatação de texto** — selecionar um trecho de texto durante a edição inline (duplo clique) mostra uma barrinha flutuante com **Negrito**, *Itálico*, Sublinhado e A−/A+ pra aumentar/diminuir o tamanho só daquele trecho, sem precisar de CSS nem de recriar o elemento
  - **Expandir artboard até caber o conteúdo** — botão novo nas propriedades do artboard (`⤢ Expandir até caber o conteúdo (sem scroll)`) que aumenta largura e/ou altura até o conteúdo inteiro caber, sem precisar rolar; só cresce, nunca encolhe o artboard que já foi ajustado à mão

---

### FASE 10 · Barra de fórmulas (estilo Power Apps) `concluído`
Um jeito de "programar" o artifact parecido com Power Apps, mas em JS de verdade por trás — chamar qualquer elemento pelo nome e ver o que dá pra fazer com ele.
- [x] Cada elemento tem um nome chamável (o mesmo nome que aparece na camada, guardado como `data-ae-name`)
- [x] Barra de fórmula (botão **ƒx Fórmulas** na toolbar): digitar o nome do elemento sugere os nomes das camadas; digitar `nome.` sugere as ações e propriedades daquele elemento — com navegação por teclado (setas, Tab/Enter pra aceitar, Esc pra fechar) e inserção na posição do cursor
- [x] Vira JS de verdade por baixo — um runtime minúsculo declara cada elemento nomeado como variável apontando pra um `Proxy`, que intercepta `hide()`, `show()`, `toggle()`, `text`, `html`, `value` e deixa todo o resto cair no elemento DOM real (`div_1.style.color = 'red'` funciona direto)
- [x] Integra com o sistema de ações da Fase 9 — `hide`/`show`/`toggle` são os mesmos "verbos" das ações prontas
- [x] Validação de nomes: digitar `nome_errado.algo` mostra erro amigável em vez de falhar em silêncio
- [x] Persistência inteligente: fórmulas **comportamentais** (`btn.onclick = ...`, `addEventListener`) são guardadas no documento (numa tag `<script type="text/x-ae-formula">` inerte) e re-executadas no HTML exportado; fórmulas de mutação (`div_1.hide()`, `.text = ...`) não precisam — a mudança já vai serializada no próprio HTML
- [x] Exportação limpa: `data-ae-name` nunca aparece no HTML final; só os elementos que uma fórmula realmente referencia ganham um `data-ae-eid` descartável gerado na hora, e o runtime exportado resolve por ele
- **Bugs encontrados e corrigidos na sessão de testes ao vivo (headless Chromium):**
  1. **Escopo do runtime** — as variáveis eram declaradas dentro de uma IIFE e a fórmula rodava *fora* dela → toda fórmula falhava com `x is not defined`. Agora a fórmula é injetada dentro da mesma closure das declarações.
  2. **Exportação quebrada** — o runtime exportado buscava elementos por `[data-ae-name]`, mas o `cleanExportHTML` remove esse atributo logo em seguida. Agora a exportação atribui `data-ae-eid` aos elementos referenciados e o runtime exportado resolve por eid (mesmo truque das ações toggle/settext).
  3. **Fórmula guardada executando crua** — a tag que guarda fórmulas no documento era um `<script>` comum e executava sem o runtime ao re-parsear o HTML. Agora usa `type="text/x-ae-formula"` (inerte pro navegador, lida só na exportação).
  4. **Persistência nunca era acionada** — `storeFormulaInDoc` existia mas nada chamava; agora o botão de rodar guarda fórmulas comportamentais (com dedupe) antes do `pushHistory`.

---

## — Em andamento —

### FASE 15 · UX do editor `em andamento`
Rodada focada em como *usa* o editor, não em features novas de documento. Referências visuais: painel de propriedades do Figma (compacto, campos com label inline) + modelo "essencial / avançado" do Power Apps.

**Lote 1 · Correções rápidas**
- [ ] Bug: redimensionar artboard rápido demais "solta" a alça no meio do arrasto (o drag morre se o cursor sai do handle) — trocar pra pointer capture / listeners globais, só termina no `mouseup`
- [ ] Delay/travamento visual ao arrastar pra redimensionar (elementos e artboard) — o overlay e o painel estão re-renderizando pesado a cada `mousemove`; atualizar ao vivo só o essencial e deixar o resto pro `mouseup`
- [ ] Botão "CSS & variáveis" → renomear pra **CSS** e mover pra ao lado do `{ } JS`
- [ ] `Ctrl+C` / `Ctrl+V` no artboard: sem elemento selecionado, copia/cola o artboard inteiro (hoje só existe o botão de duplicar)
- [ ] Seção **Ação** das Propriedades sai da visão principal e vai pro "Avançado"

**Lote 2 · Painel de Propriedades compacto (inspirado no Figma)**
- [x] Campos compactos com label inline (uma linha por propriedade, não duas) — grids de 2–4 colunas continuam empilhados, igual ao Figma
- [x] Títulos de seção discretos em caixa alta sobre divisória fina, espaçamento vertical reduzido no painel inteiro
- [x] **Scrub numérico**: arrastar o prefixo de um campo (W, H, X, Y, Gap…) pra esquerda/direita diminui/aumenta o valor — Shift = ×10, Alt = ×0,1; arrasto sem movimento vira clique e foca o campo pra digitar
- [x] Visões refinadas: "Exibir" = só o mais usado (posição, tamanho, texto, cor, fundo); "Avançado" = tudo (inclui Ação, CSS livre, atributos)

**Lote 3 · Fundo com gradiente (Fill estilo Figma)**
- [x] Preenchimento com Sólido / Gradiente linear / Gradiente radial — editor com barra de pré-visualização, ângulo (linear) e paradas de cor com posição % e remoção; gera `linear-gradient()` / `radial-gradient()` de verdade no CSS (exporta e re-importa sozinho, sem metadado extra)
- [x] Trocar de tipo preserva as cores (sólido herda a primeira cor do gradiente; linear↔radial mantém as paradas)
- [ ] Substituir a paleta atual de "cores mais usadas" por **cores recentes** de verdade

**Lote 4 · Páginas ↔ Camadas (estilo Figma)**
- [x] Painel lateral com abas no topo: **Páginas** (lista artboards com dimensões: trocar com clique, criar, renomear com duplo clique, duplicar ⧉ e excluir × no hover) e **Camadas** (árvore atual do artboard ativo)

**Lote 5 · Minimap**
- [x] Mini-mapa no canto inferior direito do canvas: todos os artboards em miniatura (o ativo destacado), retângulo da região visível, clique/arrastar pra navegar, botão − pra recolher num chip 🗺

**Lote 6 · Ícones e toolbar**
- [x] Ícones SVG consistentes (traço fino, `currentColor`, estilo Feather/Lucide) em todos os botões da toolbar — fim dos glifos unicode misturados (↶ ◇ ◐ ☰ ▤)
- [x] Toolbar responsiva: abaixo de 1240px os rótulos de texto somem e ficam só os ícones (tooltip continua), a barra não vira uma parede de botões

**Lote 7 · Depois**
- [ ] Barra de fórmulas — repensar UX (adiado por decisão)

**Extras**
- [ ] Zoom pra caber tudo (`Ctrl+1` / botão)
- [ ] `F2` pra renomear o nome da camada quando o campo dela está focado
- [ ] Guias de alinhamento (snap) — já existem, melhorar precisão/visual
