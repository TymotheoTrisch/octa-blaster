# IA no painel lateral — proposta 1.3.0

O painel lateral abre nas respostas rápidas, sem abas extras. O chat de IA só aparece após acioná-lo no ticket; a seta de voltar retorna às respostas rápidas. Reabrir a lateral não revela conversas antigas automaticamente.

A integração opcional usa o painel lateral nativo da extensão para resumos, perguntas e respostas. Não abre modais ou campos extras na página do ticket. Auxiliar Windows 0.3.3; versão sujeita à aprovação da PR, sem release/tag publicada.

## Usar e atualizar

Extraia o pacote completo do auxiliar e execute **Instalar-IA-Firefox.exe** com dois cliques. A instalação gráfica precisa de Node.js 22.22.2+ e pnpm 10+ já instalados. Não exige administrador nem comandos digitados pelo usuário. Registra `com.octablaster.ai` em HKCU e instala o runtime em `%LOCALAPPDATA%\OctaBlaster\Auxiliar`, preservando credenciais DPAPI do usuário do Windows. O Firefox inicia o auxiliar sob demanda.

Carregue/recarregue o manifesto Firefox da extensão e atualize os tickets abertos. Configure a conexão em **Inteligência artificial**. O login ChatGPT abre a autorização oficial; as APIs usam credencial e modelo disponíveis na conta do usuário. Salvar uma credencial não faz inferência nem comprova acesso ao modelo.

Para homologar mantendo a extensão oficial, use outro perfil do Firefox: o ID é o mesmo e as duas versões não são independentes no mesmo perfil. O auxiliar/credenciais são compartilhados pelo usuário do Windows. Não desinstale a oficial para fazer um teste.

## Resumos e chat

**Resumir** no cabeçalho do e-mail abre a lateral e analisa somente a mensagem selecionada. **Resumir ticket** abre a mesma lateral, carrega as interações disponíveis e resume o ticket. O chat mostra o título do ticket; a aba **Respostas** mantém as respostas rápidas da extensão.

A conversa é salva por ticket/origem/workspace/conexão. Perguntas seguem o contexto atualizado e usam até seis pares recentes de histórico. Perguntas próprias podem ser editadas, gerando uma continuação a partir daquele ponto. Fechar a lateral não apaga a conversa e não inicia outra consulta. Reabrir o ticket sem mudança de conteúdo recupera o chat sem gerar outro resumo.

Cada mensagem da IA tem **Copiar** e **Inserir no ticket**. Inserir usa o editor do ticket/frame de origem, exige que a aba esteja ativa e não envia nada ao cliente. Troca de ticket ou rascunho invalida referências de geração/inserção antigas.

No Firefox, os gatilhos são botões numa pequena página da extensão embutida no cabeçalho/editor: o clique é encaminhado ao background como gesto da extensão. Isso permite abrir a lateral com um único clique respeitando a restrição do navegador. No Chrome usa o evento do botão e `sidePanel.open` diretamente no background, sem awaits antes da abertura. Referências: [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions), [Chrome](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Resposta a partir do texto digitado

Digite no **próprio editor de resposta pública** o que deseja comunicar, por exemplo: Peça ao cliente que confirme o funcionamento. Um pequeno ícone de IA aparece no canto superior direito do editor. Digitar ou focar não chama a IA. O clique no ícone abre a lateral e gera uma resposta usando a orientação e os fatos do ticket. A ação na barra do widget também utiliza o texto já digitado.

Não há input de orientação separado nem geração automática ao entrar no editor. A sugestão permanece no chat. Ao escolher **Inserir no ticket** nessa resposta, a extensão substitui a orientação somente se o rascunho continuar exatamente igual ao snapshot capturado. Se você editar durante a espera, a inserção é recusada. Mensagens comuns do chat usam a inserção normal, como as respostas rápidas.

Não infere equipe/empresa do atendente a partir do rodapé do cliente. Os cabeçalhos identificam autores/papéis quando disponíveis. O modelo deve omitir assinaturas; a resposta sugerida passa também por remoção de encerramentos e rodapés comuns. Essa proteção não é um classificador universal de identidades em texto livre. Toda saída deve ser revisada antes do envio manual.

## Espera, cache e limites

A consulta mostra preparação, espera pela IA e tempo total de consulta. A duração inclui transporte/auxiliar/provedor; não é uma medição isolada da geração no servidor. Os testes usam respostas simuladas e não permitem estimar a latência real do Nemotron na conta do usuário.

Resumos idênticos usam cache em memória de até 20 entradas/15 minutos, chaveado por conteúdo/tarefa/conexão/revisão de configuração. Mudança de conteúdo ou configuração invalida o reuso. Reabrir o chat do ticket com o mesmo digest recupera a conversa salva. O cache não é usado para gerar uma resposta nova a partir de outra orientação.

O auxiliar não espera exclusões HTTP de referências antigas antes de inferir. A limpeza remota fica no ciclo de manutenção; a expiração local do ticket consultado continua sendo validada. Orçamentos máximos nas APIs: 768 tokens para resumo de e-mail, 1536 para resumo geral e 2048 para perguntas/respostas. O login ChatGPT usa somente os parâmetros de seu fluxo autorizado. Saída interrompida/truncada é recusada, sem retry de inferência ou fallback pago automático.

O modelo/provedor ainda pode levar tempo para produzir o resultado; não há promessa de redução fixa nem benchmark real com dados de atendimento. Anexos, imagens e citações de e-mail não entram no contexto extraído; o texto é limitado a 50.000 caracteres e pode sofrer recorte nas perguntas.

## Dados, estilo e credenciais

O chat/draft ficam em `browser.storage.local`, fora dos backups de respostas rápidas e do localStorage do Octadesk. O contexto bruto permanece transitório na memória do background; não é arquivado como HTML. Mensagens do chat podem conter dados do atendimento. Falha no armazenamento é informada sem esconder a resposta gerada. Troca de conexão da equipe separa namespaces do histórico.

A adaptação opcional de estilo guarda somente médias numéricas de tamanho/parágrafos/saudação/encerramento, após publicação confirmada do rascunho. Não aprende assinaturas/nomes/empresas nem treina o modelo. Usa padrões após três respostas; permite apagar/desabilitar. Retenção de padrões: 90 dias sem novas respostas. Retenção padrão de chats: 30 dias sem uso e 90 dias de idade máxima, configurável entre 1 e 365 dias.

Credenciais, sessões e referências remotas ficam protegidas pela DPAPI no Windows. APIs disponíveis: OpenAI Responses, Gemini Interactions, Claude Messages, NVIDIA Chat Completions; gateway HTTPS de equipe opcional em `apps/team-gateway`, ainda não implantado. O endpoint NVIDIA Build exige confirmação de que o acordo permite os dados de atendimento. O login ChatGPT não importa chats/memórias do site e usa `store:false`; APIs com estado remoto não tornam tokens anteriores gratuitos.

O gateway e o auxiliar reutilizam os adaptadores e o motor de contexto. O runtime local/instalador foi homologado no Windows/Firefox. Os testes do Chrome usam transporte fictício; a instalação nativa do Chrome não é fornecida por esse instalador Firefox.

## Desenvolvimento e homologação

Use `pnpm compile`, `pnpm test`, `pnpm build`, `pnpm build:firefox`, `pnpm --dir apps/local-helper test` e `pnpm test:gateway`. `pnpm zip:firefox` gera o pacote da extensão. Compile o instalador gráfico com `windows/BuildInstaller.ps1`; inclua o executável com os arquivos do auxiliar no ZIP, sem node_modules, dados locais ou credenciais.

Validar no Octadesk real antes da aprovação: histórico longo e múltiplos autores, origem do editor, rascunho modificado durante espera, retomada de chat, cache/expiração e qualidade/latência das respostas do provedor. Resultados e limites em [VALIDATION.md](../apps/local-helper/VALIDATION.md).
