# Resumo da contribuição sobre a versão 0.7.0

Esta contribuição integra a `main` do projeto original no commit `054b298` e reúne as funcionalidades descritas abaixo. A versão proposta é **0.9.1**. O histórico detalhado está em [CHANGELOG.md](../CHANGELOG.md); a publicação de uma versão oficial depende da aprovação da manutenção.

## Escopo implementado

| Área | Comportamento resultante | Documentação |
| --- | --- | --- |
| Variáveis | Cadastro, edição, exclusão, valores salvos ou solicitados, tokens no cursor/seleção e cancelamento que preserva o rascunho. | [Guia funcional](FUNCIONALIDADES.md#variáveis) |
| Tags | Catálogo com IDs, migração de categorias, múltiplas tags por mensagem, renomeação/exclusão de associações, filtro combinado com busca. | [Tags e navegação](FUNCIONALIDADES.md#tags-e-navegação) |
| Atalhos | Gatilho configurável, busca, teclado, clique, mesma ordem e prévia por item do botão Respostas. | [Atalhos](FUNCIONALIDADES.md#atalhos-e-respostas) |
| Técnicos e licenças | Cadastro de técnicos, ativação da nota interna, espera pela confirmação nativa, menções lado a lado e resumo do formulário, incluindo motivo da troca. | [Licenças](FUNCIONALIDADES.md#técnicos-e-resumo-das-licenças) |
| Contexto de edição | Roteamento por aba/frame e token, escopo por ticket, preservação da resposta pública e cancelamento ao perder o contexto. | [Roteamento](ARQUITETURA.md#roteamento-e-contexto) |
| Persistência | Migrações de padrões, ordem preservada durante edições concorrentes, conflitos por item e erro quando ambos os armazenamentos falham. | [Persistência](ARQUITETURA.md#persistência-e-compatibilidade) |
| Backup | Exportação do estado salvo e restauração de mensagens, tags e configurações; leitura de formatos antigos. | [Backup](FUNCIONALIDADES.md#backup-e-edições-simultâneas) |
| Desenvolvimento | Testes de regressão no CI, builds de ambos os navegadores, versão centralizada, consulta de releases oficiais e script Windows para teste temporário. | [Contribuição](../CONTRIBUTING.md) |

## Arquitetura adotada

A estrutura WXT/Vue/TypeScript e os diretórios existentes foram mantidos. Validação e modelos foram extraídos para esquemas sem efeitos colaterais; o adaptador de armazenamento foi separado dos serviços de mensagens, tags e configurações. O background centraliza coordenação e serialização; componentes Vue cuidam dos formulários e a automação do Octadesk permanece nos módulos de integração com o DOM. Veja o mapa de dependências e os pontos de extensão em [ARQUITETURA.md](ARQUITETURA.md).

## Verificação automatizada

O conjunto inclui 99 testes do executor nativo do Node.js com jsdom. Os casos cobrem isolamento de tickets/frames, registro de destino, cancelamento, IME, seleção, atalhos, previews, variáveis, migrações, reordenação, conflitos, falhas de armazenamento, callbacks do Chrome, backup completo e formatos antigos. Para licenças, há sugestões lentas, confirmação por `personid`, repetição sem duplicação e os três formulários de e-mail com campos válidos, incompletos ou ambíguos.

Comandos do CI:

```sh
pnpm install --frozen-lockfile
pnpm compile
pnpm test
pnpm build
pnpm build:firefox
```

## Verificação em navegador e limites

Durante a implementação, testes com a extensão carregada no Chromium e APIs reais da extensão cobriram popup/painel, cadastros, conflitos entre painéis, exportação/restauração, gatilhos, prévias e menções/resumos nas páginas locais de teste. Esses testes não acessaram uma sessão autenticada do Octadesk. As automações de navegador usadas nessas verificações não fazem parte da suíte Node versionada; o procedimento manual reproduzível está no guia funcional.

A build do Firefox foi verificada; o comportamento na sessão autenticada deve ser conferido pelos passos de [aprovação funcional](FUNCIONALIDADES.md#roteiro-para-aprovação-funcional). O HTML do marcador e dos formulários foi fornecido durante os testes de uso e transformado em fixtures anonimizadas.

Seletores e a ordem do DOM do Octadesk podem mudar. Cancelamento sem lista explícita de códigos não tem tratamento específico. O fallback local não oferece transação entre chaves, e um backup inclui valores legíveis de variáveis. A importação de configurações restaura o conteúdo do arquivo, com proteção para mudanças concorrentes; arquivos antigos não alteram essas configurações.

A contribuição não publica release, tag ou pacote assinado. A consulta de atualizações usa o repositório oficial.
