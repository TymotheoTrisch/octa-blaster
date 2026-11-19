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
| Login na conta real | Pendente | Requer interação no navegador oficial. |
| Identidade real e plano Plus | Pendentes | Requer comparar a identidade validada com a conta/plano desejados. |
| Permissão real de franquia | Pendente | Requer `chatgpt.tokens.use.direct` e `resource.invoke` na resposta real de tokens. |
| Chamada real com texto fictício | Não executada | Só será disparada pelo botão após as verificações da conta. |
| Consumo da franquia e ausência de cobrança | Não comprovados | Conferência necessária nos controles da conta. Tokens de uso retornados pela resposta não comprovam faturamento. |
| Integração com atendimento | Não iniciada | Não há leitura de ticket ou dados reais neste pacote. |

Comando executado: `npm test` neste pacote — **12 testes aprovados**, sem credenciais reais ou inferência de rede. A consulta de descoberta OIDC acessou apenas metadados públicos.

A continuidade depende das etapas reais pendentes. O protótipo não deve ser apresentado como integração validada com a franquia até que essas etapas sejam registradas.
