# Protótipo isolado: ChatGPT no computador

Etapa 1 de viabilidade para gerar rascunhos no OctaBlaster com autorização de uso do plano ChatGPT. Este pacote não modifica a extensão nem o PR #46. Seu único teste de IA usa conteúdo fictício e só é executado por um clique explícito depois do login e das confirmações locais.

## O que foi confirmado na documentação

Consulta em **19/11/2026**:

- A OpenAI documenta autorização de uso do plano para aplicativos de código aberto e executados localmente. A licença AGPL do OctaBlaster e a execução no próprio computador são compatíveis com esse desenho; a elegibilidade efetiva precisa ser demonstrada pelo registro e pela permissão concedida à conta.
- O registro inicial usa `dynamic_agent_client`; o retorno fornece o identificador emitido para aquele registro. O protótipo usa esse identificador na troca do código, sem segredo de cliente e sem chave de API.
- O retorno é HTTP em `127.0.0.1`, no caminho `/auth/callback`. A porta pode variar; o URI enviado no login e na troca do código precisa ser idêntico.
- A identidade deve ser validada criptograficamente e o escopo `chatgpt.tokens.use.direct` precisa constar na resposta de tokens. Login e autorização de uso do plano são verificações separadas.
- A inferência usa a rota pública `/v1/responses`, com `store: false`, `stream: true` e histórico em `input`. O protótipo aceita somente uma mensagem fictícia fixa. Uma chamada é aprovada apenas após `response.completed`.
- Esse login não fornece acesso às conversas nem memórias do ChatGPT. O histórico de respostas do Octadesk precisará de uma fonte separada em uma etapa futura.

Fontes oficiais:

- [Visão geral](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registro e login](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Modelos e inferência](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Limitações](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Erros e recuperação](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [Uso do plano e créditos](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)

## Executar

Use Node.js 22.22.2 ou superior. A dependência de validação JWT é instalada apenas neste pacote:

```powershell
cd D:\PROJETOS\octa-blaster-ai-prototype\experiments\chatgpt-local
npm ci --ignore-scripts
npm test
npm start
```

No Windows também é possível executar `Iniciar-Prototipo-IA.cmd`. Abra o endereço `http://127.0.0.1:PORTA` mostrado pelo programa e mantenha-o aberto durante o teste.

1. Clique em **Continue with ChatGPT** e faça o login na página oficial. Leia e escolha as permissões solicitadas.
2. Após voltar, confira nome, e-mail e identificador da conta. **Franquia autorizada: sim** depende dos escopos retornados e não apenas de um login válido.
3. No ChatGPT, confira o uso do aplicativo OctaBlaster. Para este experimento, mantenha o limite do aplicativo **abaixo de 100%** e o uso de créditos após a franquia **desativado**. A documentação indica que um limite inferior a 100% impede uso de créditos naquele aplicativo. O protótipo não consulta nem altera essas preferências.
4. Marque as confirmações de identidade e créditos somente depois de verificá-las.
5. Consulte os modelos disponíveis para a conta, selecione um e clique em **Testar com texto fictício**.
6. A tela mostra apenas uma resposta concluída e o uso de tokens retornado pela requisição. Em seguida, confira o consumo do aplicativo nas configurações do ChatGPT e os controles de crédito/cobrança da conta.

Nenhuma chamada de inferência é disparada ao abrir o programa ou ao concluir o login. Consulta de modelos e teste exigem ações locais. Não há repetição automática, chave de API tradicional nem fallback para outra forma de acesso.

Se uma tentativa falhar, a seção **Diagnóstico da tentativa** mostra etapa, status HTTP quando disponível, formato do erro e código/parâmetro retornados pelo provedor. O texto é sanitizado para remover a credencial utilizada, padrões de tokens e e-mails. O corpo bruto e os cabeçalhos de autenticação não são conservados. O diagnóstico fica apenas na memória, acessível na tela local; não há registro em arquivo ou envio automático. Ele permite distinguir recusa antes do stream, falha de rede e erro durante o stream, sem assumir que todo erro representa falta de franquia.

## Limites de comprovação

Uma chamada concluída comprova a autorização técnica e o funcionamento da rota. **Ela não comprova sozinha ausência de cobrança, saldo ou consumo da franquia na conta.** As confirmações de crédito na tela são declarações manuais; não substituem a conferência no ChatGPT. O resultado mantém `billingVerified: false` e não existe uma rota para alterá-lo. Não use o protótipo como uma garantia financeira.

O plano Plus não é deduzido de login, e-mail, disponibilidade de modelo ou tokens contados. Confira também o plano ativo na conta escolhida. O relatório [VALIDATION.md](VALIDATION.md) separa o que foi testado offline do que ainda depende do login e da conta real.

## Fronteiras deste experimento

- O serviço escuta somente em `127.0.0.1`, com porta escolhida pelo sistema, valida `Host` e `Origin` e exige cookie local e token anti-CSRF nas mutações.
- Não há acesso ao Octadesk, importação de histórico, integração com a extensão, envio de e-mail ou endpoint para prompts arbitrários.
- A autenticação usa PKCE S256, `state` e `nonce` novos por tentativa. O ID token é verificado com `jose` e as chaves públicas oficiais. Scopes do callback não são usados como prova de permissão.
- Tokens ficam apenas na memória privada do processo. Não são gravados em arquivo, enviados à interface, copiados do Codex/ChatGPT, nem escritos em logs. Ao encerrar, os registros em memória são descartados.
- O único arquivo criado no perfil é `host.json`, com um identificador opaco estável do computador. No Windows, fica em `%LOCALAPPDATA%\OctaBlaster\ChatGPT-Prototype`. Esse ID não é uma credencial.
- O protótipo não implementa renovação, seleção de várias contas ou reutilização persistente do registro emitido. Reiniciar ou realizar outra tentativa de login inicia um novo registro dinâmico. Evite registrar repetidamente sem necessidade; use este pacote apenas para a prova inicial.
- Sair localmente limpa a sessão deste programa. Para revogar a autorização do aplicativo, utilize os controles de conexões do próprio ChatGPT.
- Uma falha, limite de uso ou término incompleto do stream descarta o texto parcial e não aciona alternativa paga. As credenciais de outros aplicativos e endpoints internos não são utilizados.

## Próxima etapa, condicionada ao teste real

Após comprovar login, identidade, autorização, chamada e consumo/cobrança, implementar em outra etapa: registros por conta, armazenamento protegido pelo sistema operacional, renovação e rotação atômica dos tokens, pareamento autenticado com a extensão, seleção do contexto autorizado e inserção com revalidação de ticket/editor. O envio continuará manual.
