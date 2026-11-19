# Registro de validação — 19/11/2026

Este arquivo não contém dados de contas, tokens ou códigos reais.

| Etapa | Estado | Evidência |
| --- | --- | --- |
| Requisitos oficiais | Conferidos | Referências no README; aplicativo aberto, execução local e consentimento separado. Elegibilidade efetiva não presumida. |
| Descoberta OIDC pública | Verificada por HTTP | Issuer, autorização, troca de tokens e JWKS correspondem aos endereços oficiais usados no protótipo. |
| Autenticação e identidade offline | Aprovadas em testes | PKCE, estado, nonce, assinatura RSA, issuer, audience, expiração, callback sem replay e escopos da resposta de tokens. |
| Serviço e comunicação local | Aprovados em testes | Loopback, sessão/CSRF/origem, barreiras antes da chamada, resposta sem vazamento de tokens. |
| Tela local em navegador | Conferida no Chromium | Script executado, botão de login habilitado e modelos/geração bloqueados antes da autorização. Nenhum login ou chamada real foi feito nessa verificação. |
| Inferência fictícia offline | Aprovada em testes | Requisição suportada, stream fragmentado, terminal obrigatório, erro/limite sem retry ou fallback pago. |
| Login na conta real | Concluído na primeira sessão | Usuário concluiu o login; estado do auxiliar confirmou sessão ativa e não expirada. |
| Identidade real e plano Plus | Identidade autenticada; plano depende da conta | O login passou pela validação criptográfica. O plano ativo e a correspondência com a conta desejada precisam ser conferidos pelo usuário. Não são registrados dados de identidade neste relatório. |
| Permissão real de franquia | Concedida na primeira sessão | O auxiliar confirmou `chatgpt.tokens.use.direct` e `resource.invoke` na resposta real de tokens. |
| Chamada real com texto fictício | Concluída com sucesso pelo usuário | O auxiliar confirmou resposta SSE concluída, mesmo sem Content-Type informado, com texto fictício e uso de 50 tokens de entrada e 15 de saída (65 no total). Sessão e permissão de uso do plano estavam válidas. Nenhuma nova geração foi disparada pelo agente para conferir o resultado. |
| Consumo da franquia e ausência de cobrança | Não comprovados | Conferência necessária nos controles da conta. Tokens de uso retornados pela resposta não comprovam faturamento. |
| Integração com atendimento | Não iniciada | Não há leitura de ticket ou dados reais neste pacote. |

Comando executado: `npm test` neste pacote — **21 testes aprovados**, sem credenciais reais ou inferência de rede. A consulta de descoberta OIDC acessou apenas metadados públicos. Os testes adicionais verificam diagnóstico HTTP estruturado, erro de admissão com `detail`, falha no stream, timeout/rede e remoção da credencial do diagnóstico. A compatibilidade de transporte cobre SSE com cabeçalho genérico/ausente, JSON concluído e rejeição de JSON parcial ou erro/HTML com HTTP 200.

Após a primeira falha de uso, o protótipo passou a manter diagnóstico sanitizado na memória e mostrá-lo na tela. A tentativa seguinte revelou uma rejeição prematura de HTTP 200 pelo cabeçalho de formato. A validação foi corrigida para examinar o corpo. Uma nova execução feita pelo usuário concluiu a geração via SSE sem Content-Type informado, confirmando esse caminho de compatibilidade. A causa da primeira mensagem genérica, cujo diagnóstico foi descartado, não pode ser reconstruída; a falha de validação de formato foi superada na execução observada.

A viabilidade técnica de login, autorização e geração foi demonstrada. O consumo efetivo na franquia e a ausência de créditos/cobrança adicional continuam pendentes de conferência na conta. A integração com os tickets permanece condicionada à conclusão dessa conferência.
