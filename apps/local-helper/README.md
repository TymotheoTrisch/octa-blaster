# Auxiliar local de IA do OctaBlaster

Aplicativo Node.js executado no Windows para autenticar a conta ChatGPT e atender a extensão pareada. Inclui geração de rascunhos, resumos e chat sobre o ticket selecionado, sempre mediante ação explícita. O envio de e-mails permanece manual.

## Executar

Pré-requisitos: Windows, Node.js 22.22.2+ e pnpm 10+.

```powershell
cd apps/local-helper
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm start
```

Também é possível abrir `Iniciar-Auxiliar-IA.cmd`. O endereço padrão é `http://127.0.0.1:53894`. Faça o login oficial, confira a identidade e a autorização de uso do plano, selecione o modelo e salve a autorização de geração. Gere um código e informe-o em **Mais opções → Inteligência artificial** na extensão.

O primeiro login deste auxiliar é independente do antigo experimento em `experiments/chatgpt-local`. Tokens daquele processo não são copiados nem reaproveitados.

O guia completo de instalação, pareamento, chat, contexto e arquitetura está em [docs/IA-LOCAL.md](../../docs/IA-LOCAL.md).

## Credenciais e comunicação

- O serviço escuta somente em `127.0.0.1`, valida o host e protege a interface local com cookie e CSRF.
- O login utiliza PKCE S256, state e nonce. A identidade é verificada criptograficamente e os escopos concedidos são conferidos separadamente.
- Registros por conta e tokens ficam protegidos pela DPAPI CurrentUser do Windows em `%LOCALAPPDATA%\OctaBlaster\ChatGPT-Local`, com gravação atômica. A renovação é serializada e persiste a rotação dos tokens.
- A extensão recebe somente uma chave de pareamento, vinculada à origem. O código tem validade de cinco minutos, no máximo cinco tentativas e uso único. Pareamentos podem ser revogados na interface local.
- O auxiliar não registra conteúdo do ticket, chat ou tokens em logs. O chat fica somente na memória da janela da extensão. Os testes usam dados fictícios e não fazem inferência real.
- Sair limpa os tokens da sessão selecionada e tenta a revogação oficial quando disponível. Para conferir e administrar a autorização do aplicativo, utilize também as configurações da conta ChatGPT.

## Inferência e limites

As tarefas usam a rota pública Responses com `store: false` e exigem resposta concluída; texto parcial não é aprovado. O decoder aceita SSE inclusive sem Content-Type, ou um objeto Responses JSON válido e concluído. Não há retries automáticos, chave de API tradicional, cookies reaproveitados ou alternativa paga.

Há limites explícitos de contexto, orientação, exemplos e histórico. Mensagens de e-mail são dados, não instruções de sistema. Cada tarefa usa instruções próprias: rascunho, resumo da última mensagem, resumo do atendimento disponível ou perguntas de continuidade.

A autorização técnica não comprova faturamento. Confira os controles de uso do plano e créditos na conta antes de habilitar a geração. As confirmações locais são declarações manuais; `billingVerified` permanece falso. Consulte [VALIDATION.md](VALIDATION.md) para separar o teste real inicial da validação automatizada e da homologação ainda pendente.

## Referências do desenho de autenticação

Documentação consultada na fase de viabilidade em 19/11/2026:

- [Visão geral](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registro e login](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Modelos e inferência](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Limitações](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Erros e recuperação](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)

Este pacote segue a licença AGPL-3.0-or-later do repositório. Não há hospedagem contratada para esse desenho.
