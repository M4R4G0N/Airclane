# Artifact Editor · Plano de Construção

Leitor e editor de artifacts, offline. App HTML, sem servidor e sem dependência de internet, pra abrir os HTML que eu gero, editar visualmente num canvas com múltiplos artboards, editar CSS e (em breve) JS de verdade — e salvar/exportar direto no disco.

- **Local:** `ArtifactEditor/` (`index.html` + `style.css` + `app.js`)
- **Stack:** HTML + CSS + JS puro, sem build
- **Fase atual:** 7 concluída · planejando 8–13

---

## 📊 Visão Geral do Progresso

### — Construído —
- [x] **01. Núcleo**
- [/] **02. Formas e elementos** *(parcial)*
- [/] **03. Camadas e organização** *(parcial)*
- [x] **04. Código ↔ Visual**
- [/] **05. Múltiplos artboards** *(parcial)*
- [/] **06. Exportação e extras** *(parcial)*
- [x] **07. Atributos, classes e menus**

### — Planejado —
- [ ] **08. Editor de CSS estruturado**
- [ ] **09. JS e ações do artboard**
- [ ] **10. Barra de fórmulas (estilo Power Apps)**
- [ ] **11. Gráficos (canvas)**
- [ ] **12. Tabelas — melhorias**
- [ ] **13. Redesenho da interface**

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

### FASE 02 · Formas e elementos `parcial`
Adicionar coisas novas ao artifact, não só editar o que já existe.
- Menu "+ Elemento": div, texto, span, parágrafo, título, botão, link, lista, tabela, nav, section, header, footer, input, imagem
- Controle de display (block, flex, inline-block, grid, none) e position no painel
- Tabela: adicionar linha / adicionar coluna pelo menu de contexto
- Lista: adicionar item pelo menu de contexto
- Duplicar elemento (`Ctrl+D`)
- Linha e elipse/círculo
- Agrupar / desagrupar elementos
- Ferramenta de copiar estilo (pincel / eyedropper) entre elementos

### FASE 03 · Camadas e organização `parcial`
Enxergar e organizar a estrutura do artifact, não só os pixels.
- Painel de camadas em árvore, refletindo o DOM real, com recolher/expandir
- Mostrar/ocultar e excluir direto na camada
- Renomear camada (nome customizado, some na exportação limpa)
- Arrastar uma camada pra dentro da outra (aninhar) — inclusive uma linha "raiz" pra tirar de dentro
- Reordenar z-order (frente/trás) por botão, não só arrastando
- Alinhar e distribuir elementos selecionados
- Guias de snap ao mover (alinhamento magnético entre elementos)

### FASE 04 · Código ↔ Visual `concluído`
O ponto principal: editar exatamente o que eu gero, sem perder nada no meio do caminho.
- Painel de código com o HTML bruto do artboard ativo, editável
- Canvas → código: toda edição visual atualiza o código automaticamente
- Código → canvas: aplicar código reconstrói o artboard
- Modo Visualizar: artifact roda normalmente, com JS interativo, sem overlay de edição

### FASE 05 · Múltiplos artboards `parcial`
Pra quando um artifact tiver várias telas — um canvas livre com vários artboards lado a lado.
- Vários artboards no mesmo canvas, cada um com seu próprio arquivo por trás
- Arrastar o artboard pela barra de título pra reposicionar livremente
- Redimensionar o artboard pelas alças, igual um elemento
- Renomear (duplo clique no título), duplicar e excluir artboard
- Painel de propriedades do próprio artboard: nome, preset de tela (desktop/tablet/mobile), largura/altura, cor de fundo
- Projeto = arquivo `.json` no disco com todos os artboards (Salvar / Salvar como / Abrir projeto)
- Tela inicial com miniaturas dos últimos projetos abertos

### FASE 06 · Exportação e extras `parcial`
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

---

## — Planejado —

### FASE 08 · Editor de CSS estruturado `planejado`
Um editor de CSS de verdade, não só uma textarea — e uma biblioteca de classes que dá pra reaproveitar entre elementos e entre projetos.
- Editor de CSS dedicado (abre separado, não só embutido no painel de propriedades)
- Campos estruturados por propriedade CSS — parecido com o painel de propriedades de hoje, mas editando a regra da classe, não a instância
- Criar uma classe nova a partir do próprio editor (não só editar as que já existem)
- Biblioteca de classes com nome, buscável — reaproveitar uma classe já criada em outro elemento ou artboard sem reescrever CSS
- Variáveis globais (cores, tamanhos) reutilizáveis via CSS custom properties, editáveis num painel central
- *Pensar nisso como o painel de propriedades atual, mas para a classe em vez do elemento — e com uma lista de "todas as classes desse projeto" pra não recriar a mesma coisa duas vezes.*

### FASE 09 · JS e ações do artboard `planejado`
Hoje o artifact roda o JS que já vem no HTML (modo Visualizar), mas não dá pra escrever ou testar JS novo dentro do editor. E precisa dar pra exportar funcionando de verdade.
- Editor de JavaScript do artboard (parecido com o painel de código, mas focado em JS/comportamento)
- Testar o JS ao vivo dentro do próprio editor, sem precisar exportar primeiro
- Sistema de ações sem código pra coisas comuns — o caso principal: botão "Entrar"/"Criar conta" com uma ação tipo *Navegar para artboard X*, ligando as telas sem escrever JS na mão
- Essas ações ficam disponíveis em qualquer lugar que faça sentido (botão, link, formulário) — não só um caso especial
- O que for feito ali exporta funcionando de verdade no `.html` final, não é só preview do editor
- *Exemplo concreto:* no `login.html`, o botão "Criar conta" ganha a ação Navegar → artboard "register". No `register.html`, "Entrar" ganha Navegar → artboard "login". Editando visualmente, sem escrever `onclick` na mão.

### FASE 10 · Barra de fórmulas (estilo Power Apps) `planejado`
Um jeito de "programar" o artifact parecido com Power Apps, mas em JS de verdade por trás — chamar qualquer elemento pelo nome e ver o que dá pra fazer com ele.
- Cada elemento tem um nome chamável (o mesmo nome que aparece na camada)
- Uma barra/campo de fórmula onde digitar o nome do elemento sugere (autocomplete) as ações e propriedades disponíveis dele
- Isso vira JS de verdade por baixo — não é uma linguagem própria, é açúcar sintático pra não escrever `document.querySelector` toda hora
- Integra com o sistema de ações da Fase 9 (as ações viram os "verbos" que aparecem sugeridos)
- *Exemplo:* elemento renomeado pra `div_1` na camada. Na barra de fórmula, digitar `div_1.` sugere as ações e propriedades daquele elemento específico — parecido com `Button1.OnSelect` no Power Apps, só que virando JS puro.
- **Decisão em aberto:** como o "nome chamável" do elemento é guardado? Duas opções — (1) vira um `id` real no HTML exportado, o que deixa o JS gerado funcionando fora do editor também, mas polui o HTML com ids tipo `div_1`; ou (2) fica como metadado interno (parecido com o `data-ae-name` de hoje), visível só dentro do editor e no `.json` do projeto, some no HTML limpo — mas aí o JS/ações da Fase 9 precisam de outro jeito de mirar o elemento na hora de exportar (ex: injetar o id só nesse momento, ou usar seletor de classe). Precisa decidir antes de começar a Fase 9/10 de verdade.

### FASE 11 · Gráficos (canvas) `planejado`
Inserir gráfico de verdade no artifact, não só uma imagem estática.
- Elemento novo tipo "Gráfico", desenhado em `<canvas>`
- Interface pra criar/configurar o gráfico (tipo — barra, linha, pizza —, dados, cores) sem escrever JS na mão
- Decidir se isso usa uma bibliotequinha própria embutida no HTML exportado, ou desenha uma vez e "congela" o resultado
- Editar os dados do gráfico depois, pelo painel de propriedades, sem recriar do zero

### FASE 12 · Tabelas — melhorias `planejado`
Hoje só dá pra adicionar linha e coluna. Falta o resto da edição de tabela.
- Excluir linha / excluir coluna (hoje só existe excluir a tabela inteira ou célula por célula na camada)
- Selecionar e editar uma célula com mais facilidade (clique direto, sem precisar caçar na árvore de camadas)
- Ajustar largura de coluna arrastando a borda
- Marcar linha de cabeçalho (`th`) depois de já ter criado a tabela

### FASE 13 · Redesenho da interface `planejado`
Limpar o menu superior e deixar os painéis laterais flexíveis — hoje está tudo fixo e um pouco apertado.
- Remover o seletor de tamanho de página do menu superior
- Zoom (`−`, `%`, `+`, `ajustar`) muda do menu superior pra uma barra inferior
- Painel de Camadas: redimensionável, e pode minimizar/esconder
- Painel de Propriedades: mesma coisa — pode sumir, mas com botão no menu superior pra trazer de volta
- Manter no menu superior: exportar, salvar/abrir projeto e afins
- Remover os botões "Duplicar" e "Excluir" do menu superior — fica implícito (Del pra excluir, X na camada, `Ctrl+D` pra duplicar)
- Painel de propriedades: remover a seção "Posição livre" (X/Y) como bloco separado
- Campos de `display:flex` (direção, alinhar, distribuir, quebra) ganham ícones visuais em vez de só texto no dropdown
