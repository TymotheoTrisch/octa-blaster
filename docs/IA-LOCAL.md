# IA local — resumos do ticket

Entrega proposta 1.1.2, sobre a última release oficial v1.0.1 e `main` (`ff7752d`), conferidas em 23/11/2026. Esta etapa contém resumos de mensagens e resumo geral com perguntas de continuidade e histórico persistente por ticket. As respostas rápidas e licenças existentes seguem na arquitetura do projeto.

## Plano executado

1. Incorporar a arquitetura, temas e cores da `main` atual.
2. Substituir o compositor anterior por controles nos cabeçalhos nativos do ticket e das mensagens.
3. Simplificar a conexão com Native Messaging no Firefox, sessão persistente e renovação automática.
4. Validar isolamento, cancelamento, HTML Angular, iframe, responsividade e comunicação nativa; gerar o build para homologação.

## Usar no Firefox

Extraia o pacote `octablaster-local-helper-0.2.1-windows.zip` inteiro e abra **Instalar-IA-Firefox.exe** com dois cliques, uma única vez por computador. A instalação tem janela própria e executa a preparação em segundo plano; não é necessário digitar comandos ou abrir CMD. Precisa de Node.js 22.22.2+ e pnpm 10+ instalados. O instalador não exige administrador: registra o host nativo somente para o usuário atual. Copia o runtime para `%LOCALAPPDATA%\OctaBlaster\Auxiliar` e registra `com.octablaster.ai` no Firefox, autorizado apenas para a extensão `octablaster@pulz.dev.br`.

Carregue `.output/firefox-mv2/manifest.json` em `about:debugging#/runtime/this-firefox` (ou extraia o ZIP Firefox e carregue seu manifesto). Recarregue os tickets abertos para substituir o content script antigo.

Na extensão, abra **Mais opções → Inteligência artificial → Entrar com ChatGPT**. O login abre diretamente a página oficial. Ao concluir, pode fechar a aba de confirmação. O modelo padrão é selecionado entre os disponíveis; pode alterá-lo na tela de conexão. Contas já cadastradas podem ser selecionadas sem recriar o registro, e há uma ação separada para adicionar outra conta. O uso diário não exige abrir o site local, executar testes, gerar códigos ou manter CMD aberto: o Firefox inicia o auxiliar sob demanda.

O auxiliar atualizado já foi instalado neste computador. Um teste com Firefox real iniciou o serviço desligado e recuperou a sessão salva sem novo login nem inferência. A versão 0.2.1 corrige o bloqueio antigo cujo PID havia sido reutilizado por outro programa após reiniciar o computador: agora confere também o nascimento do processo, sem encerrar o programa alheio nem apagar as credenciais. Não é necessário hospedar servidor para esse fluxo local.

## Login e validade

Os cinco minutos do desenho anterior eram a validade do código de pareamento, não a duração do login. Agora esse pareamento ocorre internamente, sem códigos manuais; a chave não chega à interface nem ao armazenamento da extensão.

A autorização pertence à conta ChatGPT selecionada. Access token, refresh token e registro por conta ficam protegidos pela DPAPI CurrentUser do Windows em `%LOCALAPPDATA%\OctaBlaster\ChatGPT-Local`. A renovação é serializada e salva o token substituto. Reiniciar o navegador ou o computador não apaga a sessão. Expiração definitiva, revogação ou uma permissão insuficiente podem exigir novo login.

A validade é definida pelo provedor e não pode ser configurada como um tempo arbitrário. Esta autorização é própria do aplicativo: não copia cookies do navegador e não equivale ao estado de login do site ChatGPT. Para encerrar a sessão do auxiliar, use **Sair** na extensão. Confira também os controles de acesso/uso do aplicativo na conta ChatGPT. Cada resumo/pergunta consome o uso autorizado; não há chave de API tradicional nem alternativa paga automática.

## Resumir uma mensagem

O botão **Resumir** aparece no cabeçalho de cada mensagem carregada, antes das ações nativas de abrir em outra aba. Funciona em qualquer tipo de ticket, sem depender de licença ou de selecionar o editor.

O resultado aparece em uma camada flutuante acima da página, com sombra, bordas arredondadas e margem interna em relação ao corpo da mensagem. Não envolve, move, estreita nem altera o HTML do e-mail. Usa o top layer do navegador para escapar do recorte de `.comment.collapse`. Prefere abrir acima do botão quando houver espaço; caso contrário, abre abaixo, limitado à área visível.

A largura acompanha o corpo da mensagem até 520px, com 16px de afastamento. A altura acompanha a expansão/recolhimento do corpo, entre 180 e 440px, limitada pela janela e com rolagem interna. Um `ResizeObserver` recalcula as dimensões e o posicionamento também acompanha rolagem e redimensionamento da janela. Os botões compactos de 22px, ícones, cores, tema e sombra reutilizam a identidade visual da extensão. O resumo envia somente o texto daquela mensagem.

## Resumir o ticket

**Resumir ticket** aparece junto ao número e status. Abre uma conversa com resumo inicial, campo de perguntas e fechamento. Cada resposta da IA tem **Copiar resposta inteira**, que copia somente seu texto completo. Cada pergunta sua tem **Editar pergunta**, com Cancelar e Salvar e reenviar (ou Ctrl/Cmd+Enter). A edição refaz a resposta a partir daquele ponto e remove as interações seguintes; se falhar, preserva a conversa anterior e o texto corrigido para nova tentativa.

O resumo tenta abrir **Todas as interações** antes da análise. Se o carregamento não puder ser confirmado, avisa no contexto disponível. O chat mostra a cobertura: mensagens antigas não carregadas, anexos e imagens não foram analisados. Não presume acesso a conversas do ChatGPT ou a outros tickets.

Para perguntar, digite e pressione **Enter**; **Shift+Enter** quebra a linha. O histórico recente é enviado apenas nas perguntas de continuidade (até seis pares, 24.000 caracteres). A conversa completa e o texto ainda não enviado ficam no armazenamento privado local da extensão, separados por origem, workspace (quando disponível no shell) e número/identificador do ticket. Não são gravados no `localStorage` da página nem incluídos no backup de respostas rápidas. O conteúdo integral do e-mail não é arquivado: salva-se somente uma impressão SHA-256 do contexto junto das mensagens do chat e do rascunho da pergunta.

Fechar salva o chat, cancela a solicitação em andamento e mantém a pergunta interrompida como texto para retomar. Ao reabrir ou recarregar a página/extensão/navegador, a conversa é recuperada sem gerar outro resumo nem consumir uma nova chamada de IA. Se o ticket recebeu novas informações, o chat anterior é mantido, a tela avisa e a próxima pergunta usa o conteúdo atualizado. Uma troca de ticket durante a análise ainda cancela respostas tardias.

O armazenamento pertence ao perfil do navegador; não sincroniza com outro computador ou com o site ChatGPT. Limpar os dados da extensão ou removê-la pode apagar o histórico. O histórico de tickets pode conter dados do atendimento; não utiliza a DPAPI do auxiliar, que protege somente as credenciais de conexão. Revisões e uma fila no background impedem que duas abas sobrescrevam silenciosamente a mesma conversa. Falha de gravação/quota é informada na conversa. O limite por conversa é de 1.000 mensagens e 1.000.000 de caracteres serializados, sem descarte automático de mensagens antigas.

## Sugestões no estilo do atendente (proposta, ainda não habilitada)

É possível construir um acervo local de exemplos a partir das respostas enviadas pelo próprio atendente no HTML dos tickets carregados. Antes de automatizar a coleta, é necessário confirmar a autoria, separar respostas de outros agentes e trechos citados, e definir quais exemplos podem ser reutilizados. Um perfil de escrita pode guardar saudação, tom, extensão e forma de orientar, combinado com poucos exemplos relevantes ao novo atendimento. Isso orienta cada geração por contexto; não treina o modelo permanentemente nem dá acesso ao histórico completo do Octadesk.

O histórico do chat implementado nesta entrega fica separado desse futuro acervo. Não há coleta automática entre tickets nem geração personalizada habilitada. A futura sugestão deve usar os fatos do ticket atual e ser revisada antes do envio.

## Estrutura

| Camada | Responsabilidade |
| --- | --- |
| `entrypoints/content.ts` | Inicialização dos serviços existentes e do ciclo de resumos. |
| `services/octadesk/aiSummaryLifecycle.ts` | Descoberta, ancoragem nos cabeçalhos Angular, recriação e limpeza dos controles. |
| `services/octadesk/aiTicketContext.ts` / `aiHistory.ts` | Extração isolada, identidade real do ticket e carregamento das interações. |
| `services/octadesk/aiMessageSummary.ts` / `aiTicketSummary.ts` | Box de mensagem e conversa mínima do ticket. |
| `services/octadesk/aiSummaryPosition.ts` / `aiChatMessages.ts` | Geometria flutuante, acompanhamento do corpo e ações de copiar/editar mensagens. |
| `services/ai/ticketChatPersistence.ts` / `services/storage/aiChatStorage.ts` | Identificação estável, recuperação, rascunho, validação e fila de persistência local com revisão contra sobrescrita. |
| `services/octadesk/aiSummaryStyles.ts` | Estilos isolados, reutilizando os tokens de tema e marca atuais do projeto. |
| `services/ai/summaryRequest.ts` / `nativeClient.ts` | Cancelamento, histórico limitado e canal nativo compartilhado. |
| `services/background/aiRouter.ts` | Validação de origem/tarefa, bloqueio de geração de e-mails, cancelamento por aba/frame. |
| `components/settings/AiSettingsView.vue` | Conta, login, saída e modelo, no layout de gestão existente. |
| `apps/local-helper/native-protocol.mjs` | Framing binário do Native Messaging, limites e UTF-8. |
| `apps/local-helper/native-host.mjs` / `native-session.mjs` | Inicialização sem janela, sessão interna e compatibilidade com o auxiliar já aberto. |
| `apps/local-helper/auth.mjs` / `vault.mjs` / `inference.mjs` | OAuth oficial, DPAPI, renovação e inferência por tarefa. |
| `apps/local-helper/windows/` | Instalação HKCU e launcher C# que encaminha somente stdin/stdout. |

A extensão pede `nativeMessaging` e `clipboardWrite` para a cópia solicitada pelo usuário; não lê a área de transferência. A permissão HTTP de loopback foi retirada. O programa local usa loopback internamente para compartilhar a mesma sessão entre processos e preservar o login existente. Nenhum token OAuth ou chave de pareamento fica na extensão. `processIdentity.mjs` verifica a identidade do processo antes de recuperar um lock antigo; `windows/InstallGui.cs` fornece o instalador gráfico.

## Limites e validação

Contexto limitado a 50.000 caracteres, com aviso de truncamento e preservação do trecho recente. Conteúdo do e-mail, do modelo e do chat é renderizado como texto, sem executar HTML. Não há envio, alteração do rascunho nem aprendizado automático. Troca de ticket/frame, alteração da fonte, cancelamento e respostas tardias são verificados.

Os testes usam dados fictícios, inclusive a reprodução estrutural do HTML Angular fornecido. O layout foi inspecionado em Chromium com extensão real e iframe; as respostas de IA foram simuladas. O launcher Windows e a comunicação em Firefox headless foram testados com consulta de estado real da conexão, sem inferência nem dados de clientes. A homologação visual final no Octadesk real continua a cargo do teste do atendente.

Referências: [Native Messaging no Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), [sessões e renovação oficiais](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
