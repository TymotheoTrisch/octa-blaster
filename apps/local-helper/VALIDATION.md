# Validação — 24/11/2026

Este relatório não contém dados de contas, tokens ou clientes reais.

## Painel lateral e orientação no editor — extensão 1.3.0 / auxiliar 0.3.3

- 155 testes da extensão, 54 do auxiliar e 4 do gateway aprovados; TypeScript e builds Chrome/Firefox verificados nesta entrega.
- Correção da validação anterior no Firefox: verificar apenas isOpen não comprovava abertura pelo botão, pois a extensão podia iniciar com a lateral aberta. O gesto do iframe não autoriza a API. Removido esse gatilho. Teste atual em Firefox real confirmou a lateral inicialmente fechada, o pedido de resumo e o clique autorizado em Abrir resumo na lateral no popup abrindo a lateral de fato. Perfil isolado, dados fictícios e Native Messaging removido do pacote de teste.
- Firefox real também confirmou limpeza do editor na sugestão direta e restauração da orientação quando o auxiliar está indisponível; nenhuma inferência real.
- Chromium com extensão real e fixture Angular em iframe: abertura do painel nativo, chat compartilhado, inserção por mensagem no editor público correto, ícone no canto do editor, nenhuma consulta ao digitar, substituição protegida do rascunho, ausência de modal e cache de resumo. Transporte de IA e respostas fictícios.
- Auxiliar 0.3.3 instalado neste computador, preservando as credenciais. Firefox real confirmou leitura de configuração pública via Native Messaging; credenciais permaneceram mascaradas e nenhuma inferência foi executada.
- Resposta direta no editor: limpa a orientação antes da consulta, preenche o resultado sem abrir/salvar chat, restaura a orientação em falha e preserva novas edições/troca de ticket. Texto do chat selecionável; resumo permite reabrir a lateral durante processamento sem nova inferência. Cobertura unitária e Chromium com respostas fictícias.
- Feedback junto ao botão: spinner, bloqueio durante a consulta, erro visível e liberação para nova tentativa. Chromium com provedor fictício indisponível confirmou rascunho intacto; Firefox real sem Native Messaging exibiu erro próximo ao botão e o reabilitou. Sem inferência real. O painel mantém o status de processamento sem botão Cancelar consulta.
- Abertura do chat exige um pedido explícito do ticket, consumido uma única vez; histórico existente não reabre o chat sozinho. Painel padrão e reload sem menus Respostas/Chat IA; seta de voltar e nova abertura por Resumir verificados em Chromium.
- Testes de roteamento cobrem histórico/rascunho persistentes, isolamento por ticket/frame, edição de perguntas, conteúdo/configuração como chave de cache, assinatura do destinatário e descarte de retorno após cancelamento ou troca de contexto.
- Auxiliar: saída limitada por tarefa nas APIs (768/1536/2048 tokens) e geração sem aguardar DELETE remoto pendente. Limpeza por expiração continua executada na manutenção e para a sessão consultada.
- Não foi medida latência de modelo real nem qualidade do atendimento no Octadesk de produção. O contador mostra tempo da consulta inteira. Não há streaming de tokens nesta entrega; o painel exibe o resultado quando a consulta termina.
- Os registros abaixo documentam versões anteriores; os antigos modais e campos separados foram removidos em 1.3.0.

## Continuidade do e-mail e orientação antes da geração — extensão 1.2.3

- 170 testes da extensão aprovados, TypeScript e builds Chrome/Firefox concluídos. Auxiliar 0.3.2 e gateway sem alterações nesta entrega; suas suítes anteriores continuam com 53 e 4 testes, respectivamente.
- Chromium com extensão carregada e fixture Angular em iframe confirmou transferência sem inferência extra, chat recuperado após reload, foco automático no campo de orientação, ausência de geração ao abrir/digitar e geração apenas no Enter. Saídas simuladas, sem chamada paga.

- Transferência de resumo de e-mail ao chat sem segunda inferência; perguntas seguintes recebem esse resumo e a identificação da mensagem no histórico.
- Importação preserva conversa e rascunho existentes, persiste após reabrir e não duplica a mesma mensagem. Referências de outro ticket ou com conteúdo alterado são rejeitadas.
- Resposta assistida abre orientação com foco automático. Abrir, focar, digitar, Shift+Enter ou enviar uma orientação vazia não chama a IA; Enter ou Gerar resposta com frase preenchida gera usando a orientação explícita.
- Regeneração exige novo envio explícito. Cancelamento e proteção do rascunho continuam cobertos, assim como a remoção do rodapé do destinatário.

## Autoria e assinatura — extensão 1.2.2 / auxiliar 0.3.2

- 166 testes da extensão, 53 do auxiliar e 4 do gateway aprovados: 223 no total. TypeScript, builds Chrome/Firefox, teste visual Chromium e consulta de configuração pública em Firefox real aprovados.

- Regressão do rodapé do destinatário: resposta simulada contendo Atenciosamente e equipe/empresa do cliente é limpa antes de prévia, cópia e inserção. A mesma verificação passa com aprendizado desativado; os padrões armazenados são numéricos, sem nomes/assinaturas.
- Contexto passa a distinguir papéis explicitamente mostrados nos cabeçalhos, registra autoria desconhecida sem inferir pela assinatura e preserva metadados em truncamentos e recortes.
- Sugestão aguarda expansão das interações anteriores. Revalidação do editor/ticket/autoria continua ativa durante o carregamento.
- Prompts nativos dos quatro provedores por API e login ChatGPT proíbem assumir identidade do cliente e gerar assinatura.
- Chromium com extensão real e fixture Angular confirmou remoção do rodapé na prévia e no rascunho. Respostas do modelo simuladas, sem chamadas pagas e sem dados reais de atendimento.
- A proteção reconhece encerramentos e rodapés de equipe comuns; não é classificador universal de identidade em texto livre. O envio continua manual.

## Respostas e tela simplificada — extensão 1.2.1 / auxiliar 0.3.1

- 162 testes da extensão, 51 do auxiliar e 4 do gateway aprovados: 217 no total. TypeScript e builds Chrome/Firefox concluídos.
- Regressões do resumo inicial: registro salvo vazio e falha ao recuperar armazenamento geram resumo automático, com aviso quando a conversa não pode ser salva.
- Editor público: geração automática opt-in, uma geração por contexto, modo manual no widget, prévia flutuante, inserção explícita e preservação de rascunhos. Digitação cancela e descarta resposta tardia; anotação interna não dispara geração.
- Aprendizado: somente publicação nova confirmada igual ao rascunho enviado; identidade do compositor obrigatória, isolamento por usuário/conexão e retenção de padrões numéricos por 90 dias. Nenhum exemplo de atendimento armazenado nesta memória.
- Chromium com extensão real, fixture Angular e iframe confirmou resumo de mensagem flutuante, controle com 20px, chat persistente após reload, nova configuração sem formulário de perfil e sugestão automática com inserção explícita. Saídas de IA simuladas; sem inferência paga ou dados reais de clientes.
- Referências do desenho e limites do aprendizado estão em docs/IA-LOCAL.md. Qualidade de respostas reais e integração com publicação no Octadesk real ainda exigem homologação no atendimento.

## Provedores, perfil e retenção — extensão 1.2.0 / auxiliar 0.3.0

- **155 testes da extensão, 51 do auxiliar e 4 do gateway aprovados (210 no total)**. TypeScript e builds Chromium/Firefox concluídos; ZIP Firefox 1.2.0 gerado.
- OpenAI com continuação por resposta, Gemini Interactions com saída `steps`, Claude Messages/cache e NVIDIA Chat Completions exercitados com respostas fictícias nos formatos oficiais. Sem credenciais reais nem inferência paga nesses testes.
- Cobertura de contexto inicial/continuação sem repetir o ticket na requisição, troca de ticket/fonte, edição do histórico, truncamento/erros, cancelamento, ausência de retry automático, credenciais mascaradas e separação de histórico para diferentes credenciais do servidor da equipe. Cancelar antes do despacho impede a inferência posterior.
- Retenção por inatividade e idade máxima, exclusão de respostas remotas e fila de exclusões não confirmadas testadas. Alterar o domínio do servidor não reaproveita a credencial do domínio anterior.
- Navegador Chromium com extensão real e fixture Angular em iframe: seis opções de conexão, revisão de exemplo com autoria correspondente, perfil, retenção, chave limpa da tela após salvar e ausente do storage do navegador. Chat recuperado após reload e geometria flutuante preservados. Provedores simulados.
- Auxiliar atualizado instalado neste computador, preservando o login existente. Firefox headless real confirmou conexão e leitura da configuração pública por Native Messaging; credenciais não foram devolvidas. Consulta de estado/configuração apenas, sem chamada ao modelo.
- Gateway HTTP testado com autenticação individual, isolamento de usuários, quota diária persistente após reinício e AES-GCM autenticado. Compose validado com valores fictícios. Identidade de processo Linux tem teste de parsing para boot/início; não houve execução em contêiner, pois o daemon Docker estava indisponível.
- Backend preparado para homologação, sem publicação externa. Acesso real às APIs, preço, condições de retenção/contrato e qualidade de cada modelo ainda dependem da conta/endpoint escolhido. O destino de implantação da equipe não foi informado. A homologação no Octadesk real permanece pendente.

## Histórico persistente — extensão 1.1.2

- **149 testes da extensão aprovados**, TypeScript sem erros, builds Chromium/Firefox e ZIP Firefox 1.1.2 gerados. O runtime do auxiliar permanece 0.2.1; as mudanças de persistência ocorrem na extensão.
- Conversa e pergunta não enviada recuperadas depois de fechar/reabrir, recriar o DOM e recriar a fila de storage. Tickets e workspaces separados; rota e parâmetros de rastreamento não alteram a identidade de um ticket com número conhecido.
- Reabertura imediata aguarda a gravação anterior; revisão otimista impede sobrescrita por outra aba. Dados inválidos, papéis privilegiados e falha de quota rejeitam a gravação sem fallback para `localStorage` da página.
- Perguntas continuam com histórico salvo e contexto atual quando novas mensagens chegam. Respostas canceladas não entram no histórico, e o texto da pergunta interrompida é recuperado.
- Navegador Chromium com extensão real, fixture em iframe e IA simulada: conversa e texto não enviado restaurados após fechar e recarregar a página, sem outra inferência. A pergunta seguinte incluiu o histórico salvo. Nenhuma chamada real ao modelo ou dado de cliente foi usado.
- Não foi habilitado acervo de respostas do atendente nem coleta automática entre tickets; a documentação registra essa possibilidade como próxima etapa. A homologação no Octadesk real permanece pendente.

## Revisão de 23/11 — entrega proposta 1.1.1 / auxiliar 0.2.1

- Última release oficial v1.0.1 e main `ff7752d` incorporadas, preservando as correções do seletor de cores do colega.
- **138 testes da extensão e 37 do auxiliar aprovados**, TypeScript sem erros e builds Chromium/Firefox concluídos. ZIP Firefox 1.1.1 gerado.
- Extensão real em Chromium com fixture Angular dentro de iframe: resumo em top layer, HTML e largura do e-mail idênticos antes/depois, botão compacto, margens em janela estreita e altura acompanhando expansão de 300 para 420px. Respostas simuladas, sem inferência.
- Cópia de resposta completa, edição da própria pergunta, substituição do histórico seguinte e preservação do rascunho exercitadas no navegador. Falha ao editar restaura a conversa e conserva o texto corrigido; falha no resumo inicial não cria histórico inválido.
- Reproduzido um lock antigo cujo PID havia sido reutilizado por outro aplicativo. Corrigida a verificação com nascimento do processo; credenciais criptografadas preservadas e nenhum processo alheio encerrado.
- Instalador do auxiliar atualizado exercitado neste computador. Firefox headless real iniciou o serviço inicialmente desligado e reconheceu a sessão salva. Consulta de estado apenas, sem inferência ou conteúdo de clientes.
- Instalador gráfico `Instalar-IA-Firefox.exe` compilado com .NET Framework/Windows PowerShell e subsistema GUI verificado. O script de instalação utilizado por ele foi exercitado; a janela gráfica não foi acionada no teste automatizado.

A homologação visual no Octadesk real permanece pendente. Os testes de layout usam dados fictícios e as chamadas de IA são simuladas; a verificação no Firefox valida o transporte nativo real e a conexão salva.

## Etapa inicial

O usuário concluiu o login oficial, concedeu a autorização de uso do plano e executou uma chamada fictícia concluída: 50 tokens de entrada e 15 de saída. Relatou não ter observado cobrança e autorizou a integração. O contador de tokens não comprova faturamento; o aplicativo não faz auditoria financeira.

## Redesenho inicial de 19/11 (histórico anterior à revisão)

- Base atualizada para a main 1.0.0, commit `959b2f9`, preservando a arquitetura modular, os temas e as cores.
- Tela anterior de geração, exemplos e inserção removida. Tarefas de rascunho bloqueadas na extensão, no host nativo e no novo auxiliar.
- Fixtures estruturais do HTML Angular fornecido, com nomes e conteúdo fictícios: botão após o número, ação antes do menu nativo da mensagem, box fora de `.comment.collapse`, histórico intermediário e rascunho preservado.
- Navegador Chromium com extensão e iframe de mesma origem: resumo da mensagem em coluna reservada com rolagem, adaptação em largura estreita, resumo inicial do ticket e perguntas por Enter. Respostas simuladas, sem inferência real.
- Launcher C# compilado e exercitado no Windows, com protocolo binário real: consulta de estado concluída; reconheceu o login já salvo sem repareamento manual.
- Firefox headless real com extensão temporária autorizada e `runtime.connectNative`: consulta de estado concluída, conta conectada e geração habilitada. Nenhuma solicitação ao modelo ou dado de cliente enviado nesse teste.
- OAuth, validação criptográfica, escopos, rotação, persistência, DPAPI, transporte SSE/JSON, erro sem fallback, CSRF, limites do chat e cancelamento cobertos por testes automatizados.

A homologação visual do novo build na sessão real do Octadesk ainda depende do teste do atendente. As verificações de integração acima não equivalem a uma nova inferência real com os dados de atendimento.

Verificação final: **129 testes da extensão** e **35 testes do auxiliar** aprovados, TypeScript sem erros, builds Chromium/Firefox e ZIP Firefox 1.1.0 gerados. O transporte nativo foi testado com o executável instalado e em Firefox headless; a interface foi inspecionada em desktop e largura reduzida. A reconexão de uma sessão definitivamente expirada reutiliza o registro emitido em vez de criar outra conta.
