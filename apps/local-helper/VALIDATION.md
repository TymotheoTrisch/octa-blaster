# Validação — 19/11/2026

Este relatório não contém dados de contas, tokens ou clientes reais.

## Etapa inicial

O usuário concluiu o login oficial, concedeu a autorização de uso do plano e executou uma chamada fictícia concluída: 50 tokens de entrada e 15 de saída. Relatou não ter observado cobrança e autorizou a integração. O contador de tokens não comprova faturamento; o aplicativo não faz auditoria financeira.

## Redesenho focado em resumos

- Base atualizada para a main 1.0.0, commit `959b2f9`, preservando a arquitetura modular, os temas e as cores.
- Tela anterior de geração, exemplos e inserção removida. Tarefas de rascunho bloqueadas na extensão, no host nativo e no novo auxiliar.
- Fixtures estruturais do HTML Angular fornecido, com nomes e conteúdo fictícios: botão após o número, ação antes do menu nativo da mensagem, box fora de `.comment.collapse`, histórico intermediário e rascunho preservado.
- Navegador Chromium com extensão e iframe de mesma origem: resumo da mensagem em coluna reservada com rolagem, adaptação em largura estreita, resumo inicial do ticket e perguntas por Enter. Respostas simuladas, sem inferência real.
- Launcher C# compilado e exercitado no Windows, com protocolo binário real: consulta de estado concluída; reconheceu o login já salvo sem repareamento manual.
- Firefox headless real com extensão temporária autorizada e `runtime.connectNative`: consulta de estado concluída, conta conectada e geração habilitada. Nenhuma solicitação ao modelo ou dado de cliente enviado nesse teste.
- OAuth, validação criptográfica, escopos, rotação, persistência, DPAPI, transporte SSE/JSON, erro sem fallback, CSRF, limites do chat e cancelamento cobertos por testes automatizados.

A homologação visual do novo build na sessão real do Octadesk ainda depende do teste do atendente. As verificações de integração acima não equivalem a uma nova inferência real com os dados de atendimento.

Verificação final: **129 testes da extensão** e **35 testes do auxiliar** aprovados, TypeScript sem erros, builds Chromium/Firefox e ZIP Firefox 1.1.0 gerados. O transporte nativo foi testado com o executável instalado e em Firefox headless; a interface foi inspecionada em desktop e largura reduzida. A reconexão de uma sessão definitivamente expirada reutiliza o registro emitido em vez de criar outra conta.
