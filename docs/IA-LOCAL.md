# IA local — resumos do ticket

Entrega proposta 1.1.0, sobre a `main` 1.0.0 (`959b2f9`). Esta etapa contém somente resumos de mensagens e resumo geral com perguntas de continuidade. A antiga tela de gerar/responder/inserir foi removida. As respostas rápidas e licenças existentes seguem na arquitetura do projeto.

## Plano executado

1. Incorporar a arquitetura, temas e cores da `main` atual.
2. Substituir o compositor anterior por controles nos cabeçalhos nativos do ticket e das mensagens.
3. Simplificar a conexão com Native Messaging no Firefox, sessão persistente e renovação automática.
4. Validar isolamento, cancelamento, HTML Angular, iframe, responsividade e comunicação nativa; gerar o build para homologação.

## Usar no Firefox

No primeiro uso em um computador Windows, execute `apps/local-helper/Instalar-IA-Firefox.cmd` uma vez. Precisa de Node.js 22.22.2+ e pnpm 10+. O instalador não exige administrador: registra o host nativo somente para o usuário atual. Copia o runtime para `%LOCALAPPDATA%\OctaBlaster\Auxiliar` e registra `com.octablaster.ai` no Firefox, autorizado apenas para a extensão `octablaster@pulz.dev.br`.

Carregue `.output/firefox-mv2/manifest.json` em `about:debugging#/runtime/this-firefox` (ou extraia o ZIP Firefox e carregue seu manifesto). Recarregue os tickets abertos para substituir o content script antigo.

Na extensão, abra **Mais opções → Inteligência artificial → Entrar com ChatGPT**. O login abre diretamente a página oficial. Ao concluir, pode fechar a aba de confirmação. O modelo padrão é selecionado entre os disponíveis; pode alterá-lo na tela de conexão. Contas já cadastradas podem ser selecionadas sem recriar o registro, e há uma ação separada para adicionar outra conta. O uso diário não exige abrir o site local, executar testes, gerar códigos ou manter CMD aberto: o Firefox inicia o auxiliar sob demanda.

O instalador foi exercitado neste computador. O host nativo reconheceu a sessão já existente sem novo login. Existe compatibilidade com o auxiliar 0.10 já aberto, para não interromper essa autorização durante a atualização. Depois de fechar sua janela antiga, a nova cópia instalada passa a ser iniciada automaticamente.

## Login e validade

Os cinco minutos do desenho anterior eram a validade do código de pareamento, não a duração do login. Agora esse pareamento ocorre internamente, sem códigos manuais; a chave não chega à interface nem ao armazenamento da extensão.

A autorização pertence à conta ChatGPT selecionada. Access token, refresh token e registro por conta ficam protegidos pela DPAPI CurrentUser do Windows em `%LOCALAPPDATA%\OctaBlaster\ChatGPT-Local`. A renovação é serializada e salva o token substituto. Reiniciar o navegador ou o computador não apaga a sessão. Expiração definitiva, revogação ou uma permissão insuficiente podem exigir novo login.

A validade é definida pelo provedor e não pode ser configurada como um tempo arbitrário. Esta autorização é própria do aplicativo: não copia cookies do navegador e não equivale ao estado de login do site ChatGPT. Para encerrar a sessão do auxiliar, use **Sair** na extensão. Confira também os controles de acesso/uso do aplicativo na conta ChatGPT. Cada resumo/pergunta consome o uso autorizado; não há chave de API tradicional nem alternativa paga automática.

## Resumir uma mensagem

O botão **Resumir** aparece no cabeçalho de cada mensagem carregada, antes das ações nativas de abrir em outra aba. Funciona em qualquer tipo de ticket, sem depender de licença ou de selecionar o editor.

O resultado aparece em um box ao lado do e-mail, dentro da largura do comentário. O layout reserva uma coluna, mantém os nós originais do Octadesk e posiciona o box fora do contêiner de recolhimento `.comment.collapse`; assim o resultado não é cortado pelo limite nativo de 200px. O box tem altura fixa calculada da mensagem (180–440px) e rolagem interna. Em áreas estreitas, as colunas ficam empilhadas, sem sobreposição. Fechar restaura a estrutura original. O resumo envia somente o texto daquela mensagem.

## Resumir o ticket

**Resumir ticket** aparece junto ao número e status. Ao clicar, abre apenas uma conversa: resumo inicial, campo de perguntas e fechamento. Não há seletor de contexto, botões de geração, exemplos, ações de inserir ou opções de rascunho nesse modal.

O resumo tenta abrir **Todas as interações** antes da análise. Se o carregamento não puder ser confirmado, avisa no contexto disponível. O chat mostra a cobertura: mensagens antigas não carregadas, anexos e imagens não foram analisados. Não presume acesso a conversas do ChatGPT ou a outros tickets.

Para perguntar, digite e pressione **Enter**; **Shift+Enter** quebra a linha. O histórico recente é enviado apenas nas perguntas de continuidade (até seis pares, 24.000 caracteres). Fica em memória nesta janela e não representa aprendizado permanente. Fechar cancela a solicitação e descarta o chat. Mudanças no ticket ou nas mensagens exigem reabrir o resumo.

## Estrutura

| Camada | Responsabilidade |
| --- | --- |
| `entrypoints/content.ts` | Inicialização dos serviços existentes e do ciclo de resumos. |
| `services/octadesk/aiSummaryLifecycle.ts` | Descoberta, ancoragem nos cabeçalhos Angular, recriação e limpeza dos controles. |
| `services/octadesk/aiTicketContext.ts` / `aiHistory.ts` | Extração isolada, identidade real do ticket e carregamento das interações. |
| `services/octadesk/aiMessageSummary.ts` / `aiTicketSummary.ts` | Box de mensagem e conversa mínima do ticket. |
| `services/octadesk/aiSummaryStyles.ts` | Estilos isolados, reutilizando os tokens de tema e marca atuais do projeto. |
| `services/ai/summaryRequest.ts` / `nativeClient.ts` | Cancelamento, histórico limitado e canal nativo compartilhado. |
| `services/background/aiRouter.ts` | Validação de origem/tarefa, bloqueio de geração de e-mails, cancelamento por aba/frame. |
| `components/settings/AiSettingsView.vue` | Conta, login, saída e modelo, no layout de gestão existente. |
| `apps/local-helper/native-protocol.mjs` | Framing binário do Native Messaging, limites e UTF-8. |
| `apps/local-helper/native-host.mjs` / `native-session.mjs` | Inicialização sem janela, sessão interna e compatibilidade com o auxiliar já aberto. |
| `apps/local-helper/auth.mjs` / `vault.mjs` / `inference.mjs` | OAuth oficial, DPAPI, renovação e inferência por tarefa. |
| `apps/local-helper/windows/` | Instalação HKCU e launcher C# que encaminha somente stdin/stdout. |

A extensão pede `nativeMessaging`; a permissão HTTP de loopback foi retirada. O programa local usa loopback internamente para compartilhar a mesma sessão entre processos e preservar o login existente. Nenhum token OAuth ou chave de pareamento fica na extensão.

## Limites e validação

Contexto limitado a 50.000 caracteres, com aviso de truncamento e preservação do trecho recente. Conteúdo do e-mail, do modelo e do chat é renderizado como texto, sem executar HTML. Não há envio, alteração do rascunho nem aprendizado automático. Troca de ticket/frame, alteração da fonte, cancelamento e respostas tardias são verificados.

Os testes usam dados fictícios, inclusive a reprodução estrutural do HTML Angular fornecido. O layout foi inspecionado em Chromium com extensão real e iframe; as respostas de IA foram simuladas. O launcher Windows e a comunicação em Firefox headless foram testados com consulta de estado real da conexão, sem inferência nem dados de clientes. A homologação visual final no Octadesk real continua a cargo do teste do atendente.

Referências: [Native Messaging no Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), [sessões e renovação oficiais](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
