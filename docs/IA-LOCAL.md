# Assistente de IA local para tickets

Implementação em desenvolvimento para a versão proposta 0.10.0. O auxiliar usa a autorização concedida pelo ChatGPT ao aplicativo local. Nenhuma chave de API tradicional é configurada e não existe alternativa paga automática.

## Preparar e conectar

1. No Windows, com Node.js 22.22.2+ e pnpm 10+ disponíveis, execute `apps/local-helper/Iniciar-Auxiliar-IA.cmd`. Mantenha a janela aberta enquanto usar a IA.
2. Abra `http://127.0.0.1:53894`, faça o login oficial e confira a conta e a autorização de uso do plano. O login da fase inicial do protótipo não é transferido automaticamente.
3. Confira os controles de uso/créditos na conta, marque as confirmações locais, selecione um modelo disponível e salve a autorização de geração. O programa não verifica faturamento e não altera os limites da conta.
4. Gere um código de pareamento no auxiliar. Na extensão, abra **Mais opções → Inteligência artificial**, informe o endereço e o código e clique em **Parear extensão**.
5. No ticket, selecione o editor, expanda o widget e clique em **Gerar resposta com IA**.

Para carregar temporariamente o build Firefox, abra `about:debugging#/runtime/this-firefox`, escolha **Carregar extensão temporária** e selecione `.output/firefox-mv2/manifest.json` da pasta em que este código foi compilado. A cópia instalada anteriormente não se atualiza ao compilar em outro worktree.

## Gerar uma resposta

Revise o contexto e escreva a orientação. Opcionalmente, selecione até três mensagens cadastradas como exemplos de estilo. Clique em **Gerar resposta**, revise e edite a sugestão e clique em **Inserir no rascunho**. A inserção respeita a seleção/cursor capturado ao abrir e preserva o restante do rascunho. O envio continua manual.

## Resumos e chat de perguntas

A mesma janela contém **Converse sobre este ticket**:

- **Resumir última mensagem:** utiliza somente o assunto e o texto da última mensagem visível carregada, na ordem do DOM. O contexto dessa mensagem pode ser conferido e editado em uma seção própria.
- **Resumo completo:** solicita um resumo da conversa carregada, com solicitação inicial, evolução, procedimentos, situação atual e pendências. Não usa respostas anteriores do chat como fonte adicional.
- **Perguntar:** permite perguntas livres e continuidade, por exemplo “O que já foi tentado?” e depois “Qual dessas tentativas teve retorno?”. `Ctrl+Enter` também envia a pergunta.
- **Atualizar contexto:** relê as mensagens do mesmo ticket, limpa o chat e invalida a sugestão anterior. Use ao receber um novo e-mail ou após carregar mensagens antigas no Octadesk; revise novamente o contexto.
- **Limpar conversa** e **Interromper:** descartam o histórico ou interrompem a solicitação atual. Respostas tardias canceladas não entram no chat.

As respostas aparecem como texto, sem executar HTML. **Usar como rascunho** copia uma resposta do chat para a prévia editável; ainda é necessário revisar e clicar em **Inserir no rascunho**. Resumos e perguntas não alteram o editor automaticamente.

## Alcance do contexto

O contexto é capturado ao abrir ou atualizar a janela. A leitura fica restrita ao contêiner do ticket selecionado e considera as mensagens visíveis carregadas em `.content-comment-interaction`. Exclui outros tickets, editores, conteúdo oculto, scripts e históricos citados (`blockquote`, citações Gmail/Yahoo). A ordem utilizada é a do DOM; sem metadados confiáveis não se infere autor, data ou tipo público/interno. Confira a seção **Contexto da última mensagem** antes de resumir.

Não há limite de vinte mensagens: todas as mensagens elegíveis são coletadas. O transporte limita o contexto a **50.000 caracteres**; se ultrapassar, mantém o trecho mais recente e exibe um aviso. “Resumo completo” significa completo sobre o contexto disponível, não sobre mensagens antigas que o Octadesk ainda não carregou. Anexos e imagens não são analisados.

O chat guarda em memória até seis pares de pergunta/resposta, com limite agregado de 24.000 caracteres. Pares mais antigos são descartados quando necessário. A janela não salva o chat em disco nem no backup da extensão. Alterar contexto ou modelo limpa o histórico para evitar misturar fontes. Não há leitura de outros tickets nem de conversas/memórias do ChatGPT; os exemplos de estilo vêm apenas das mensagens cadastradas escolhidas pelo atendente.

Cada geração, resumo ou pergunta é uma solicitação explícita ao provedor e pode consumir o uso autorizado do plano. Falhas ou limites não acionam outra forma de cobrança. A ausência de cobrança depende dos controles e do estado da conta; não é comprovada pelo contador de tokens da resposta.

## Arquitetura

| Módulo | Responsabilidade |
| --- | --- |
| `components/settings/AiSettingsView.vue` | Configuração e pareamento no popup/painel. |
| `services/octadesk/aiTicketContext.ts` | Extração isolada e indicação de cobertura. |
| `services/octadesk/aiComposer.ts` | Rascunho, prévia, seleção e validação do editor. |
| `services/octadesk/aiTicketChat.ts` | Resumos, perguntas, histórico efêmero e cancelamento. |
| `services/background/aiRouter.ts` | Canal autenticado ao auxiliar, validação de tarefa/histórico e cancelamento por aba/frame. |
| `apps/local-helper/bridge.mjs` | Pareamento de uso único, autorização por origem/chave e geração. |
| `apps/local-helper/auth.mjs` | Login, identidade, registros por conta e renovação serializada. |
| `apps/local-helper/vault.mjs` | Proteção DPAPI do Windows, gravação atômica e bloqueio de processo concorrente. |
| `apps/local-helper/inference.mjs` | Instruções por tarefa, requisição sem armazenamento e validação da resposta concluída. |

O auxiliar escuta somente em `127.0.0.1`. Tokens OAuth ficam protegidos em `%LOCALAPPDATA%\OctaBlaster\ChatGPT-Local` e não chegam à extensão. A extensão guarda somente a chave de pareamento local; ela não participa do backup de mensagens. Códigos de pareamento expiram e são de uso único; a comunicação exige a chave e a origem da extensão. O auxiliar permite revogar os pareamentos.

Antes e depois de uma geração e antes de inserir, o editor e a identidade do ticket são conferidos. Troca de chamado, editor recriado ou alteração do rascunho exige reabrir a janela. Falhas não aprovam texto parcial. Contexto do cliente e chat não são gravados em logs pelo aplicativo.

## Validação e limites atuais

As suítes automatizadas usam tickets e respostas fictícios, incluindo fluxo de rascunho, resumo da última mensagem, contexto com mais de vinte mensagens, truncamento, perguntas de continuidade, origem/pareamento, limites de histórico, cancelamento e proteção contra mudança de ticket. A DPAPI também é exercitada com um valor fictício no Windows.

O teste real inicial confirmou login, autorização e uma chamada fictícia concluída (65 tokens). O usuário relatou não ter observado cobrança; o aplicativo não faz auditoria financeira. O fluxo integrado ainda exige homologação no Firefox e no DOM real do Octadesk antes de ser considerado pronto para uso diário.
