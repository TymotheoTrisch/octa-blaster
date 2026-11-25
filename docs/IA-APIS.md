# Inteligência artificial por API

A IA funciona na própria extensão, no Firefox e no Chrome. O usuário instala apenas a extensão e informa sua chave em **Inteligência artificial → Conexões de API**. Não há programa auxiliar, instalação de Node.js no computador do usuário, terminal, serviço Windows ou servidor da equipe.

## Configurar

1. Escolha OpenAI, Google Gemini, Anthropic Claude, NVIDIA ou API compatível com OpenAI.
2. Informe a URL base HTTPS, o identificador do modelo e a chave pessoal.
3. Salve e autorize o acesso ao endereço solicitado pelo navegador. Só esse domínio recebe a chave nas consultas.
4. Abra um ticket e use Resumir, Resumir ticket ou o chat da lateral.

O provedor define o formato das requisições: Responses para OpenAI, Interactions para Gemini, Messages para Claude e Chat Completions para NVIDIA/compatíveis. A URL deve ser a base, por exemplo `https://integrate.api.nvidia.com/v1`, sem `/chat/completions`. Não são usados parâmetros exclusivos do Nemotron; o usuário escolhe um modelo de chat disponível em sua conta.

Salvar não faz uma geração paga nem confirma acesso ao modelo. Chaves vazias preservam a credencial já salva; **Remover chave** apaga a chave daquele provedor. Trocar a URL exige informar a chave novamente, evitando encaminhar a credencial antiga a outro destino. A extensão não acompanha chaves de empresa embutidas. Custos e limites são os da API escolhida.

## Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| `components/settings/AiProviderSettings.vue` | Formulário de conexão, seguindo o tema da extensão |
| `composables/useAiApiSettings.ts` | Carregar/salvar configuração e solicitar a permissão do domínio por clique |
| `services/ai/messageClient.ts` | Mensagens da interface para o background, sem chamadas de rede |
| `services/background/aiRouter.ts` | Autorizar origem e controlar consultas/cancelamento |
| `services/background/ai/` | Rotas separadas de configuração, histórico, escrita e validação de geração |
| `services/ai/api/catalog.ts` | Provedores, bases e validação das URLs |
| `services/ai/api/configuration.ts` | Validação e visão pública sem chaves |
| `services/ai/api/state.ts` | Persistência privada em IndexedDB e atualização serializada |
| `services/ai/api/client.ts` | Operações de configuração, geração, limpeza e cancelamento |
| `services/ai/api/engine.ts` | Contexto, isolamento e continuidade por conversa |
| `services/ai/api/context.ts` | Recorte de texto longo preservando metadados de autoria |
| `services/ai/api/instructions.ts` | Regras de sistema do ticket e do chat independente |
| `services/ai/api/transport.ts` | HTTP autenticado, permissões, timeout, limites e erros |
| `services/ai/api/providers/` | Um adaptador por formato de API e contratos compartilhados |
| `services/ai/api/retention.ts` | Expiração e exclusões remotas fora do caminho de geração |

O fluxo é: interface/content script → mensagem validada no background → motor de contexto → adaptador → API. A chave não passa pelos content scripts, respostas de mensagens, DOM do Octadesk ou URL. Requisições não usam cookies e não seguem redirecionamentos.

## Chats e resumos

O ícone de IA no cabeçalho abre a área de mensagens com o histórico fechado. O número visível do ticket identifica sua conversa, junto com origem/workspace. Trocar de ticket carrega seu próprio chat e invalida consultas do ticket anterior. Voltar recupera as mensagens e o rascunho. Cada pergunta relê os dados atuais da página; sem o ticket aberto, usa a cópia de contexto salva.

Abrir o chat ou clicar em Nova conversa não cria registros vazios. O primeiro envio persiste a pergunta imediatamente, antes do retorno da API. A conversa anterior é arquivada ao enviar a primeira mensagem da nova. Títulos podem ser renomeados. Resumir um e-mail e Resumir ticket compartilham a conversa daquele atendimento, mas a geração do resumo do e-mail usa só a mensagem selecionada.

As mensagens podem ser selecionadas, copiadas e inseridas no editor do ticket. A inserção reconfirma aba, frame, token do editor, ticket e rascunho após a espera. Nenhuma geração envia e-mail automaticamente.

No Chrome, o botão de resumo abre diretamente a lateral. No Firefox, se a lateral estiver fechada, o navegador exige um gesto na interface da extensão: o popup oferece **Abrir resumo na lateral**. Com a lateral aberta, a conversa aparece nela. Não se tenta contornar a restrição de gestos do navegador.

### Formato e prompts

O resumo do ticket pede **Título do ticket**, **Objetivo**, **Status atual**, **Detalhamento**, **Pendências e próximos passos** e **A confirmar**, com até 300 palavras. O resumo do e-mail pede **Remetente e data**, **Assunto da mensagem**, **Mensagem em resumo**, **Detalhes relevantes** e **Ação esperada**, com até 180 palavras.

Em **Prompts e instruções**, o usuário edita os textos de Resumir ticket, Resumir mensagem e Sugerir resposta. As regras de autoria, revisão manual e ausência de envio automático permanecem no sistema. O texto do modelo é renderizado como texto, sem executar HTML.

Para sugerir uma resposta, digite a orientação no próprio editor público e clique no ícone de IA. Focar ou digitar não inicia a API. A orientação é guardada em memória e o campo é limpo durante a geração; a resposta entra no próprio editor. Se ocorrer erro, restaura a orientação apenas se o campo ainda não foi editado. Digitação ou troca de ticket descarta o resultado antigo.

O modelo deve distinguir atendente e cliente e omitir assinaturas; a extensão também filtra rodapés comuns. Essa proteção não substitui a revisão humana.

## Histórico, credenciais e custos

- Chats, rascunhos e contexto extraído ficam em `browser.storage.local`, separados do localStorage do site e do backup de respostas rápidas.
- Chaves e referências de contexto remoto ficam no IndexedDB da origem da extensão. Não são sincronizadas nem exportadas pelo backup. O navegador/usuário com acesso ao perfil ainda pode inspecioná-las; não há promessa de criptografia pelo sistema operacional.
- Prompts e aprendizado de escrita continuam no navegador. O aprendizado registra padrões numéricos de respostas confirmadas do atendente, não textos de exemplo de clientes. Permite pausar, apagar padrões e definir início/encerramento.
- Retenção padrão: 30 dias sem uso ou 90 dias de idade máxima. A tela Histórico e retenção permite configurar e limpar expirados.
- Contexto remoto é opcional para OpenAI e Gemini, desativado inicialmente. Quando ativado, a extensão reutiliza a referência somente se contexto, histórico, modelo e credencial coincidirem. Cada ticket mantém referências separadas. Mudanças invalidam o reuso; a limpeza pede exclusão e preserva pendências não confirmadas.
- Apagar/trocar uma chave ou revogar a permissão pode impedir a exclusão de referências antigas. A exclusão remota exige o acesso original; políticas e logs do provedor continuam valendo. Salvar contexto no provedor não torna os tokens anteriores gratuitos.

O texto extraído, incluindo HTML sanitizado limitado ao ticket, não passa de 50.000 caracteres. Scripts, recursos externos, campos ocultos/senhas, controles da extensão, outros tickets e rascunho do editor são excluídos. Não são lidos anexos ou mensagens não carregadas.

As consultas usam até seis pares recentes de histórico e podem selecionar trechos de contexto longo. Os limites de saída são 768 tokens para e-mail, 1536 para ticket e 2048 para perguntas/respostas. Saída incompleta é recusada. Não há retry de geração ou troca para outro provedor pagos automaticamente. Erros 401/403, 404, 429, rede e timeout aparecem na interface sem expor a resposta técnica ou a chave.

## Atualização da versão anterior

O login com ChatGPT, Native Messaging, instaladores Windows e servidor de equipe foram removidos do projeto. Nenhuma assinatura do ChatGPT é usada por esta versão. É necessário cadastrar a chave de API uma vez: credenciais do antigo cofre Windows não são importadas. Chats locais, prompts e preferências de escrita já existentes são preservados.

Uma extensão não desinstala programas nem apaga credenciais externas no Windows. Se o auxiliar anterior já foi instalado, esta versão não o inicia ou utiliza. A autorização antiga pode ser revogada nas configurações da conta correspondente; a remoção da instalação antiga é uma ação separada no computador.

## Desenvolvimento e validação

Execute `pnpm compile`, `pnpm test`, `pnpm build` e `pnpm build:firefox`. `pnpm zip:firefox` gera os arquivos de distribuição; `pnpm sign:firefox` exige credenciais AMO autorizadas para produzir um XPI instalável. O usuário final não precisa desses comandos.

`tests/aiApi.test.mjs` verifica persistência com IndexedDB simulado, credenciais públicas, permissões/URLs, os cinco adaptadores com HTTP simulado, isolamento/reuso de contexto, erros, cancelamento, mudanças de configuração e retenção. Os demais testes cobrem roteamento, chats e proteção do editor. Não há inferência paga durante os testes.

Antes da aprovação, valide com uma chave real: concessão de permissão do navegador, acesso ao modelo, resumo e continuação, troca de ticket durante espera, edição do rascunho e retomada após reiniciar. Testes simulados não comprovam a compatibilidade de todos os modelos ou contratos, nem a latência real do provedor.

Referências dos contratos: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Gemini Interactions](https://aistudio.google.com/docs/interactions-overview), [Claude e acesso pelo navegador](https://platform.claude.com/docs/en/manage-claude/authentication), [NVIDIA Chat Completions](https://docs.api.nvidia.com/nim/reference/llm-apis).

### Resultado desta alteração

Em 25/11/2026: TypeScript e 203 testes passaram; builds Chrome MV3 e Firefox MV2 concluídos. Os dois manifestos foram conferidos: acesso de API é opcional e Native Messaging não está presente. O lint Firefox não apresentou erros e manteve 18 avisos sobre declaração de coleta de dados e atribuições a innerHTML nos bundles. Esses avisos não equivalem à aprovação/assinatura pela Mozilla. Nenhuma chave real foi usada para inferência nesta validação.
