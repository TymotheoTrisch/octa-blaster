# IA no painel lateral — proposta 1.3.0

O painel lateral abre nas respostas rápidas, sem abas extras. O chat de IA só aparece após acioná-lo no ticket; a seta de voltar retorna às respostas rápidas. Reabrir a lateral não revela conversas antigas automaticamente.

A integração opcional usa o painel lateral nativo da extensão para resumos, perguntas e respostas. Não abre modais ou campos extras na página do ticket. Auxiliar Windows 0.3.5; versão sujeita à aprovação da PR, sem release/tag publicada.

## Usar e atualizar

Extraia o pacote completo do auxiliar e execute **Instalar-IA-Firefox.exe** com dois cliques. A instalação gráfica precisa de Node.js 22.22.2+ e pnpm 10+ já instalados. Não exige administrador nem comandos digitados pelo usuário. Registra `com.octablaster.ai` em HKCU e instala o runtime em `%LOCALAPPDATA%\OctaBlaster\Auxiliar`, preservando credenciais DPAPI do usuário do Windows. O Firefox inicia o auxiliar sob demanda.

Carregue/recarregue o manifesto Firefox da extensão e atualize os tickets abertos. Configure a conexão em **Inteligência artificial**. O login ChatGPT abre a autorização oficial; as APIs usam credencial e modelo disponíveis na conta do usuário. Salvar uma credencial não faz inferência nem comprova acesso ao modelo.

Para homologar mantendo a extensão oficial, use outro perfil do Firefox: o ID é o mesmo e as duas versões não são independentes no mesmo perfil. O auxiliar/credenciais são compartilhados pelo usuário do Windows. Não desinstale a oficial para fazer um teste.

## Resumos e chat

**Resumir** no cabeçalho do e-mail abre a lateral e analisa somente a mensagem selecionada. **Resumir ticket** abre a mesma lateral, carrega as interações disponíveis e resume o ticket. O chat mostra o título do ticket; a seta de voltar retorna às respostas rápidas. O texto do chat pode ser selecionado e copiado. Mesmo enquanto um resumo processa, seu botão permite reabrir a lateral sem criar outra consulta.

A conversa é salva por ticket/origem/workspace/conexão. Perguntas seguem o contexto atualizado e usam até seis pares recentes de histórico. Perguntas próprias podem ser editadas, gerando uma continuação a partir daquele ponto. Fechar a lateral não apaga a conversa e não inicia outra consulta. Reabrir o ticket sem mudança de conteúdo recupera o chat sem gerar outro resumo.

Cada mensagem da IA tem **Copiar** e **Inserir no ticket**. Inserir usa o editor do ticket/frame de origem, exige que a aba esteja ativa e não envia nada ao cliente. Troca de ticket ou rascunho invalida referências de geração/inserção antigas.

No Chrome, o botão do ticket abre diretamente `sidePanel.open`. No Firefox, um clique dentro do site não autoriza `sidebarAction.open`: se a lateral já estiver aberta, o resumo aparece nela; se estiver fechada, o popup da extensão oferece **Abrir resumo na lateral**, cujo clique é autorizado pelo navegador. Quando o Firefox impede abrir o próprio popup, abra-o pelo ícone da extensão para usar essa ação. O resumo continua preparado por ticket, sem perder a consulta. Referência: [restrição de gestos no Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions). A página embarcada usada anteriormente foi removida porque não transfere essa autorização.

### Formato dos resumos

O ticket usa **Título do ticket**, **Objetivo**, **Status atual**, **Detalhamento**, **Pendências e próximos passos** e **A confirmar**. Até 300 palavras, fatos em ordem cronológica e distinção entre status explícito do sistema e situação confirmada nas mensagens. Responsável/prazo só aparecem se informados.

O e-mail usa **Remetente e data**, **Assunto da mensagem**, **Mensagem em resumo**, **Detalhes relevantes** e **Ação esperada**. Até 180 palavras, somente a mensagem selecionada e os metadados do cabeçalho. O título do ticket serve como referência; não se conclui o status geral a partir de um e-mail.

As instruções pedem seções separadas, listas curtas e `[FALTA INFORMAR]` para dados necessários ausentes. Pedidos não são apresentados como ações concluídas; os resumos não são respostas ao cliente. A interface destaca títulos conhecidos sem interpretar HTML do modelo. O formato é uma instrução textual ao provedor, não um schema JSON imposto à resposta.

O contexto passa a incluir o status explícito do cabeçalho quando disponível. A versão do formato renova resumos antigos na próxima solicitação, preservando mensagens e rascunho. Resumir só um e-mail não é tratado como resumo completo do ticket; um resumo geral atualizado pode ser reaproveitado depois de resumir uma mensagem.

## Resposta a partir do texto digitado

Digite no **próprio editor de resposta pública** o que deseja comunicar, por exemplo: Peça ao cliente que confirme o funcionamento. Um pequeno ícone de IA aparece no canto superior direito do editor. Digitar ou focar não chama a IA. O clique no ícone guarda a orientação, limpa o editor e gera a resposta diretamente nesse mesmo campo, usando os fatos do ticket. A lateral não é aberta nem recebe essa geração. A ação na barra do widget também utiliza o texto já digitado.

Não há input de orientação separado nem geração automática ao entrar no editor. Enquanto aguarda, o campo fica vazio e o botão indica processamento. A resposta é preenchida quando a consulta termina. Se houver falha, a orientação original é restaurada somente se o campo não tiver sido editado. Digitação ou troca de ticket descarta o resultado pendente. Nenhuma resposta é enviada automaticamente ao cliente.

Não infere equipe/empresa do atendente a partir do rodapé do cliente. Os cabeçalhos identificam autores/papéis quando disponíveis. O modelo deve omitir assinaturas; a resposta sugerida passa também por remoção de encerramentos e rodapés comuns. Essa proteção não é um classificador universal de identidades em texto livre. Toda saída deve ser revisada antes do envio manual.

## Espera, cache e limites

A consulta mostra preparação, espera pela IA e tempo total de consulta. A duração inclui transporte/auxiliar/provedor; não é uma medição isolada da geração no servidor. Os testes usam respostas simuladas e não permitem estimar a latência real do modelo escolhido na conta do usuário.

Resumos idênticos usam cache em memória de até 20 entradas/15 minutos, chaveado por conteúdo/tarefa/conexão/revisão de configuração. Mudança de conteúdo ou configuração invalida o reuso. Reabrir o chat do ticket com o mesmo digest recupera a conversa salva. O cache não é usado para gerar uma resposta nova a partir de outra orientação.

O auxiliar não espera exclusões HTTP de referências antigas antes de inferir. A limpeza remota fica no ciclo de manutenção; a expiração local do ticket consultado continua sendo validada. Orçamentos máximos nas APIs: 768 tokens para resumo de e-mail, 1536 para resumo geral e 2048 para perguntas/respostas. O login ChatGPT usa somente os parâmetros de seu fluxo autorizado. Saída interrompida/truncada é recusada, sem retry de inferência ou fallback pago automático.

O modelo/provedor ainda pode levar tempo para produzir o resultado; não há promessa de redução fixa nem benchmark real com dados de atendimento. Anexos, imagens e citações de e-mail não entram no contexto extraído; o texto é limitado a 50.000 caracteres e pode sofrer recorte nas perguntas.

## Dados, estilo e credenciais

O chat/draft ficam em `browser.storage.local`, fora dos backups de respostas rápidas e do localStorage do Octadesk. Para retomar um ticket pelo histórico, o texto extraído e um trecho de HTML sanitizado do ticket são salvos junto da conversa, no armazenamento privado da extensão; não é arquivado como HTML. Mensagens do chat podem conter dados do atendimento. Falha no armazenamento é informada sem esconder a resposta gerada. Troca de conexão da equipe separa namespaces do histórico.

## Configurações por categoria

**Inteligência artificial** abre quatro páginas: **Conta e conexões** (login, modelo e chave), **Aprendizado e escrita** (estatísticas e início/encerramento), **Prompts e instruções** e **Histórico e retenção**. O botão de voltar retorna à lista de categorias. Campos e ações seguem o mesmo padrão visual da extensão; a seção Primeiro uso foi removida da interface.

Em **Prompts e instruções**, escolha **Resumir ticket**, **Resumir mensagem** ou **Sugerir resposta**. Edite as instruções e salve. O texto atual serve como ponto de partida; **Restaurar padrão** recupera só o recurso selecionado, e exige salvar para aplicar. Alternar o recurso preserva os rascunhos ainda não salvos nesta tela. Salvar/restaurar não faz inferência.

Os prompts ficam no armazenamento privado deste navegador, separados da conexão e das estatísticas de escrita. Até 3.000 caracteres por resumo e 1.600 na sugestão, preservando o limite existente de 4.000 caracteres da instrução final. A orientação do editor e o estilo são anexados automaticamente na sugestão. O contexto do ticket não precisa de variáveis. As proteções de autoria, dados e revisão/envio manual não são editáveis por esses campos.

Alterar o prompt de resumo renova somente o resumo correspondente na próxima solicitação, preservando conversa e rascunho; os caches incluem a instrução efetiva. Gravações concorrentes são rejeitadas para evitar perda de edições. A página de histórico salva a retenção usando a conexão atual, sem substituí-la por uma configuração antiga.

## Consultar aprendizado e configurar início/encerramento

Clique no editor de resposta de um ticket e abra **Inteligência artificial → Aprendizado e escrita**. A tela identifica o atendente daquele editor e exibe publicações observadas (20 ou mais quando a contagem ponderada atinge esse limite), tamanho/parágrafos médios, frequência de saudações/fechos reconhecidos e data da última atualização. São estatísticas aproximadas com maior peso nas publicações recentes; não é um relato inventado pelo modelo sobre o que ele sabe.

O aprendizado ocorre somente quando uma nova publicação corresponde ao rascunho enviado pelo editor do Octadesk. Gerar/editar um rascunho, mensagens antigas e e-mails enviados fora do Octadesk não contam. A memória usa dados numéricos, sem arquivar exemplos, assinaturas ou dados de clientes, e só orienta sugestões após três publicações confirmadas. Não treina o modelo. O contexto do ticket e o histórico do chat são memórias separadas.

Em **Como começar e terminar**, escolha **Automático**, **Texto personalizado** ou **Sem saudação/Sem despedida** para cada limite da resposta. Campos personalizados aceitam até 160 caracteres no início e 240 no encerramento (até quatro linhas). São aplicados localmente depois da geração e da remoção de assinaturas inferidas; esses campos não são anexados como exemplos ao prompt de estilo. A assinatura do Octadesk continua separada. Preferências são vinculadas ao atendente e ambiente, respeitando o namespace da conexão quando houver; guardar a configuração não consulta a IA.

Pausar o aprendizado desativa novas observações e o uso das estatísticas neste navegador, mantendo os dados visíveis e as escolhas explícitas de início/encerramento. **Apagar aprendizado deste atendente** remove só as estatísticas daquela identidade e preserva os textos configurados. Para limpar estes textos, selecione Automático nos dois campos e salve. Os padrões automáticos expiram após 90 dias sem publicações; preferências manuais persistem até serem alteradas.

A leitura e a gravação validam o frame/token do editor registrado, a aba ativa e a identidade novamente antes de salvar. Se trocar de atendente/conexão, atualize a tela. Essa configuração está disponível sem depender de uma consulta ao auxiliar de IA.

A adaptação opcional de estilo guarda somente médias numéricas de tamanho/parágrafos/saudação/encerramento, após publicação confirmada do rascunho. Não aprende assinaturas/nomes/empresas nem treina o modelo. Usa padrões após três respostas; permite apagar/desabilitar. Retenção de padrões: 90 dias sem novas respostas. Retenção padrão de chats: 30 dias sem uso e 90 dias de idade máxima, configurável entre 1 e 365 dias.

Credenciais, sessões e referências remotas ficam protegidas pela DPAPI no Windows. APIs disponíveis: OpenAI Responses, Gemini Interactions, Claude Messages, NVIDIA Chat Completions (modelo configurável pelo identificador, sem parâmetros exclusivos do Nemotron); gateway HTTPS de equipe opcional em `apps/team-gateway`, ainda não implantado. O endpoint NVIDIA Build exige confirmação de que o acordo permite os dados de atendimento. O login ChatGPT não importa chats/memórias do site e usa `store:false`; APIs com estado remoto não tornam tokens anteriores gratuitos.

O gateway e o auxiliar reutilizam os adaptadores e o motor de contexto. O runtime local/instalador foi homologado no Windows/Firefox. Os testes do Chrome usam transporte fictício; a instalação nativa do Chrome não é fornecida por esse instalador Firefox.

## Desenvolvimento e homologação

Use `pnpm compile`, `pnpm test`, `pnpm build`, `pnpm build:firefox`, `pnpm --dir apps/local-helper test` e `pnpm test:gateway`. `pnpm zip:firefox` gera o pacote da extensão. Compile o instalador gráfico com `windows/BuildInstaller.ps1`; inclua o executável com os arquivos do auxiliar no ZIP, sem node_modules, dados locais ou credenciais.

Validar no Octadesk real antes da aprovação: histórico longo e múltiplos autores, origem do editor, rascunho modificado durante espera, retomada de chat, cache/expiração e qualidade/latência das respostas do provedor. Resultados e limites em [VALIDATION.md](../apps/local-helper/VALIDATION.md).

Ao acionar uma consulta, o botão mostra processamento. A geração de resposta bloqueia cliques repetidos; os botões de resumo continuam permitindo reabrir a lateral sem duplicar consultas. Um aviso próximo informa carregamento, conclusão ou erro; falhas ficam visíveis até fechar o aviso ou tentar novamente. Erros de resumo também aparecem no chat. Falhas na resposta direta restauram a orientação somente quando o campo segue intacto.

## Conversas independentes e histórico

Em **Inteligência artificial → Conversas com a IA**, **Novo chat** inicia uma conversa vazia com o mesmo provedor/modelo configurado, sem importar contexto de tickets ou de outros chats. O título vem da primeira pergunta, sem uma chamada extra ao modelo. O botão de histórico lista chats e tickets por atualização, permite buscar pelo título/número e retomar mensagens e rascunho. Não há abas permanentes de IA na tela inicial.

Cada ticket conserva sua chave e sua única conversa, compartilhada entre Resumir mensagem e Resumir ticket. O histórico permite conversar usando a última cópia de texto salva, mesmo sem o ticket aberto. Um aviso identifica esse contexto salvo. Ao retomar com o mesmo ticket ativo, o chat reconecta à página e habilita a inserção no editor validado. Cada pergunta relê o DOM. Sem o ticket correspondente aberto, mantém a cópia salva e informa isso. Chats antigos sem metadados aparecem como Ticket salvo até serem reabertos pelo ticket.

Chats, rascunhos e contexto em texto seguem a retenção configurada e não entram no backup das respostas rápidas. O histórico completo é preservado localmente dentro dos limites de armazenamento; consultas usam um recorte limitado do contexto e do histórico para caber no contrato do modelo. Contextos remotos continuam sujeitos às regras e custos do provedor. A conexão do servidor de equipe usa um histórico separado por credencial.

## Consultar a página do ticket no chat

**Usar ticket aberto** conecta a conversa à aba ativa do Octadesk, inclusive quando o atendimento está dentro do iframe, sem depender do foco no editor. Mantém a única conversa daquele ticket e não gera uma resposta por si só. O chat passa a reler a página a cada pergunta; título, status, campos com valores atuais, mensagens e trecho de HTML sanitizado entram como dados para o modelo.

A leitura se restringe ao contêiner do ticket. Remove scripts, atributos de execução, URLs de recursos, senhas/campos ocultos, controles da extensão, outros tickets e o rascunho do editor. Tenta expandir as interações disponíveis; não lê anexos nem dados ainda não carregados. O contexto enviado, incluindo o trecho HTML, permanece abaixo de 50.000 caracteres e segue a retenção dos chats. A navegação para outro ticket não troca silenciosamente o contexto de uma conversa existente.
