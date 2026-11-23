# Validação — 23/11/2026

Este relatório não contém dados de contas, tokens ou clientes reais.

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
