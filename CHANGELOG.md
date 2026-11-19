# Changelog

Todas as alterações notáveis deste projeto são documentadas neste arquivo.
O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [Não lançado]

### 🚀 Adicionado
- **Temas Claro, Escuro e Sistema (`Mais opções → Aparência`):** alternância persistida em `storage.local` e sincronizada em tempo real entre Popup, Painel Lateral e elementos injetados no Octadesk (widget flutuante, menu rápido `/` / `\` e modal de variáveis) (#9).
- **Cor da marca e interior do logo personalizáveis:** paleta de presets, seletor visual (`<input type="color">`) e código hexadecimal com cálculo automático de contraste (WCAG), atualizando botões, destaques, SVG interno (com cor interna seguindo o tema branco/escuro por padrão ou personalizada) e o ícone da extensão na barra do navegador (`action.setIcon` / `browserAction.setIcon` / `sidebarAction.setIcon`) (#9).
- **Cores personalizadas por Tag (`Mais opções → Tags`):** escolha opcional de cor por tag (presets, color picker e hexadecimal) aplicada com pílulas pastéis de alto contraste nos modos claro e escuro em cards, formulário, menu rápido e widget do Octadesk (#9).

### 🛠️ Modificado
- **Cabeçalho claro no Modo Claro:** barra superior (`AppHeader`) adaptada para superfície clara no plano claro, mantendo o contraste e a identidade visual alinhada ao Design System (#9).

---

## [0.9.0] - 2026-11-19

### 🚀 Adicionado
- **Tela dedicada para Técnicos (Licenças) (`Mais opções → Técnicos (Licenças)`):** separada de **Atalhos**, com padrão visual unificado (barra de busca, filtro Todos/Ativos/Inativos, cards expansíveis com drag-and-drop), toggle rápido Ativo/Desativado, sugestão automática de `@PrimeiroNome` ao digitar e botão para restaurar técnicos padrão (#52, #54).
- **Telas de gestão unificadas:** **Tags**, **Variáveis** e **Atalhos** alinhadas ao design system principal da extensão, com pílulas, gutter de arrastar e busca/filtros no topo (#51, #54).

### 🛠️ Modificado
- **Arquitetura modular por domínio:** `App.vue` (~2.190 → ~350 linhas), `content.ts` (~887 → ~15 linhas) e `background.ts` desmembrados em `components/` (`layout/`, `templates/`, `settings/`, `modals/`), `composables/` e `services/` (`storage/`, `templates/`, `octadesk/`, `background/`, `updates/`) (#53, #54).
- **Modal de variáveis e menu de atalho harmonizados:** novo visual alinhado ao design system do OctaBlaster (`#1c1b22` / `#3c3f43` / `#ffc600` / `#f7f8f9`) com backdrop suave, cabeçalho com botão fechar e foco automático no primeiro campo (#51, #54).

### 🐛 Corrigido
- **Cancelamento de slash command (`\` / `/`):** digitar espaço logo após o gatilho (`\ `, `/ `) ou dois espaços seguidos cancela o menu de atalho e mantém o texto literal (#51, #54).
- **Correspondência exata de menções no Octadesk:** busca sem espaços no `@` (compatível com o autocomplete do Octadesk), extração limpa do nome no popover ignorando avatares (`<bexs-thumb>`) e tags inline, e validação global ancorada (`^...$`) para evitar falsos positivos entre nomes parecidos e nos técnicos padrão (#52, #54).
- **Refinamento de menções (`mentionHelper.ts`):** evita espaço extra ao final quando já há separador após o token nativo (#52, #54).

---

## [0.8.0] - 2026-11-18

### 🚀 Adicionado
- **Variáveis personalizadas (`Mais opções → Variáveis`):** cadastro, edição e exclusão de variáveis nos modos **Valor salvo** ou **Preencher ao usar**, com inserção no cursor/seleção do editor e preservação das variáveis automáticas (`{{Saudacao}}`, `{{Data}}`, `{{Hora}}`) (#46).
- **Catálogo de Tags (`Mais opções → Tags`):** suporte a múltiplas tags por resposta, renomeação/exclusão preservando o conteúdo das mensagens, migração automática de categorias legadas e filtro combinado por tag + busca (#46).
- **Menu rápido por gatilho no editor (`Mais opções → Atalhos`):** abertura do seletor de respostas via `\` ou `/` (ou desativado) diretamente no editor do ticket, com navegação por teclado (`↑`/`↓`/`Enter`/`Esc`), busca em tempo real e prévia compartilhada com o botão **Respostas** (#46).
- **Cadastro de técnicos e resumo automático de licenças:** configuração dos técnicos marcados nas menções e leitura estruturada do formulário do e-mail no ticket para preparar rascunhos de **Contratação** (quantidade e isenção), **Troca** (licença e motivo) e **Cancelamento** (lista de licenças + banco), sem envio automático (#46).
- **Backup completo JSON (formato 2):** exportação e restauração unificadas de mensagens, catálogo de tags, variáveis, técnicos e configuração de atalho, mantendo compatibilidade com formato 1 e listas antigas (#46).
- **Suíte de testes automatizados (`pnpm test`):** 99 testes de regressão no executor nativo do Node.js com `jsdom`, integrados ao CI (#46).
- **Governança de contribuição:** adição de `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md` e templates de Issues com direcionamento ao GitHub Discussions (#47, #48).

### 🛠️ Modificado
- **Roteamento seguro por tab/frame e token:** o `background` registra o editor focado por token/frame e revalida contexto, identidade do ticket e rascunho após operações assíncronas (#46).
- **Fila compartilhada e detecção de conflitos:** mensagens, tags e configurações compartilham a fila serializada no `background`, preservando edições independentes entre popup e painel lateral e rejeitando conflitos no mesmo item (#46).
- **Versão centralizada:** `wxt.config.ts` passa a ler a versão diretamente de `package.json` (#46).
- **Pipeline de Release (`.github/workflows/release.yml`):** padronização do nome do pacote assinado para `octa-blaster-<versão>.xpi` e inclusão automática do guia de instalação/atualização (Firefox vs. Chromium) nas notas de release (#49).

### 🐛 Corrigido
- **Confirmação de menções e preservação de rascunho:** aguarda o marcador nativo `<person personid="...">`, mantém técnicos na mesma linha, evita duplicações em novas tentativas e preserva a resposta pública caso a aba interna não seja confirmada (#46).
- **Persistência e tratamento de erros de armazenamento:** suporte unificado a Promises e callbacks do Chrome com verificação de `runtime.lastError` e rejeição explícita quando armazenamento principal e fallback falham (#46).

---

## [0.7.0] - 2026-11-17

### 🚀 Adicionado
- Reordenação de modelos por arrastar-e-soltar e teclado, cards em acordeão compacto com ações rápidas em ícones e links diretos para GitHub e Discussions (#44, #45).

[Não lançado]: https://github.com/luizGDpulz/octa-blaster/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.5.9...v0.7.0
