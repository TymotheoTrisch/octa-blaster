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
| Chamada real com texto fictício | Teste acionado pelo usuário, sem sucesso aprovado | Um novo diagnóstico mostrou HTTP 200 rejeitado pela validação estrita do Content-Type. O corpo não foi conservado, portanto seu formato efetivo ainda é desconhecido. A validação foi corrigida para examinar o corpo; o teste real atualizado continua pendente. Nenhuma repetição automática foi executada. |
| Consumo da franquia e ausência de cobrança | Não comprovados | Conferência necessária nos controles da conta. Tokens de uso retornados pela resposta não comprovam faturamento. |
| Integração com atendimento | Não iniciada | Não há leitura de ticket ou dados reais neste pacote. |

Comando executado: `npm test` neste pacote — **21 testes aprovados**, sem credenciais reais ou inferência de rede. A consulta de descoberta OIDC acessou apenas metadados públicos. Os testes adicionais verificam diagnóstico HTTP estruturado, erro de admissão com `detail`, falha no stream, timeout/rede e remoção da credencial do diagnóstico. A compatibilidade de transporte cobre SSE com cabeçalho genérico/ausente, JSON concluído e rejeição de JSON parcial ou erro/HTML com HTTP 200.

Após a primeira falha de uso, o protótipo passou a manter diagnóstico sanitizado na memória e mostrá-lo na tela. O reinício necessário para aplicar essa alteração encerra a sessão em memória e exige novo login. A causa da primeira falha não é considerada corrigida sem uma nova tentativa observável.

A continuidade depende das etapas reais pendentes. O protótipo não deve ser apresentado como integração validada com a franquia até que essas etapas sejam registradas.
