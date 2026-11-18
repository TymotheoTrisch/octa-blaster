# Guia das funcionalidades e teste manual

Este guia descreve a contribuição sobre a base 0.7.0. A versão proposta no código é **0.9.1**; isso não significa que uma release oficial já foi publicada.

## Variáveis

Abra **Mais opções → Variáveis** para criar, editar ou excluir. O modo **Valor salvo** reutiliza o valor cadastrado; **Preencher ao usar** solicita um valor a cada resposta. Os nomes são únicos sem diferenciar maiúsculas e minúsculas. `Saudacao`, `Data` e `Hora` continuam automáticas e reservadas.

No formulário de mensagem, clique em uma variável para inserir seu token na posição do cursor ou substituir o trecho selecionado. Os tokens aceitam `{{Nome}}` e `{Nome}`. Uma variável não cadastrada também pode solicitar preenchimento ao usar a resposta. Renomear um cadastro exige atualizar os tokens das mensagens que o referenciam.

Cancelar o preenchimento mantém o rascunho. Trocar de ticket ou alterar o rascunho durante esse diálogo descarta a inserção pendente.

## Tags e navegação

Em **Mais opções → Tags**, cadastre, renomeie ou exclua tags. Categorias legadas são expostas como tags para preservar as mensagens existentes. Uma mensagem pode ter várias tags, selecionadas pelo menu do formulário. A lista de mensagens permite combinar a busca com o filtro de tag ao lado dela.

Renomear tag atualiza sua apresentação nas mensagens. Excluir tag remove a associação e preserva o texto da mensagem. A seta do formulário de cadastro volta para sua lista; a seta da lista volta para a tela visitada anteriormente. Navegar para cadastros durante uma edição mantém o rascunho da mensagem.

## Atalhos e respostas

Abra **Mais opções → Atalhos** para escolher `\`, `/` ou desativar o menu. No campo de resposta do Octadesk, digite o gatilho no início ou após um espaço e depois parte do título. Setas navegam, Enter escolhe e Esc fecha; clicar no item também seleciona.

O atalho mostra a mesma lista e ordem do botão **Respostas**, com prévia abaixo de cada título e suas tags. A escolha substitui o gatilho e a busca, preservando o texto ao redor. A mensagem fica no rascunho para revisão.

## Técnicos e resumo das licenças

A tela **Atalhos** também permite criar, editar, desativar e excluir os técnicos da marcação. Use o nome completo exibido nas sugestões do Octadesk e a busca, como `@nome`. Os técnicos habilitados são marcados sequencialmente na Anotação Interna e permanecem lado a lado. A próxima busca começa após a confirmação do marcador anterior; respostas lentas do Octadesk são aguardadas dentro do limite de 15 segundos por pessoa.

Quando o ticket contém o formulário de solicitação, **Marcar Licenças** também acrescenta o resumo após os técnicos. O banco vem do campo do e-mail, mesmo que o título mostre outro número. Os nomes abaixo são exemplos; o cadastro define quem será marcado.

Contratação:

```text
@Jorge Tigre  @Roberto Renck

Contratação 2 lics (com isenção da primeira licença)

Banco: 135558
```

A quantidade é o total solicitado; a licença isenta não é subtraída. Se **Isenção da Primeira Licença** for **Não**, a descrição usa **sem isenção**.

Troca:

```text
@Jorge Tigre  @Roberto Renck

Troca lic 11822
Motivo: Licença corrompida.

Banco: 158750
```

Cancelamento:

```text
@Jorge Tigre  @Roberto Renck

Cancelamento lics: 13039, 13041, 13042

Banco: 151303
```

Os campos usados são **Número do Banco de Dados**, **Número de Licenças**, **Isenção da Primeira Licença**, **Número da licença**, **Motivo da troca de licença** e **Números das licenças**, conforme a operação. `Lic_11822` é apresentado como `11822`. Um campo obrigatório ausente ou inválido gera aviso antes de alterar a anotação. Sem formulário reconhecido, permanece a marcação dos técnicos. Não há envio automático da anotação.

Repetir a ação preserva marcadores confirmados e evita duplicar um resumo idêntico. Se editar o resumo manualmente ou se o e-mail mudar, confira o rascunho antes de repetir. Não há suporte específico para cancelamento de todas as licenças sem uma lista explícita de códigos.

## Backup e edições simultâneas

**Exportar backup completo (JSON)** baixa mensagens, tags, variáveis com valores e modos, técnicos e atalho. A exportação inclui o que já foi salvo por outros painéis. O arquivo é legível e contém os valores das variáveis.

**Importar backup ou modelos (JSON)** aceita o formato completo 2, o formato anterior 1 e listas antigas de mensagens. Mensagens e tags são mescladas. No formato 2, variáveis, técnicos e atalho são restaurados do arquivo, inclusive listas vazias. Arquivos antigos mantêm essas configurações como estão.

Popup e painel lateral podem editar dados ao mesmo tempo. Mudanças em itens diferentes são preservadas; conflitos no mesmo item exibem erro. Reabra a tela para carregar a versão atual antes de reaplicar a edição. Se os armazenamentos principal e local falharem, a tela recebe erro em vez de informar sucesso.

## Instalação temporária no Firefox

Com Node.js e pnpm instalados:

```powershell
pnpm install --frozen-lockfile
pnpm build:firefox
```

Abra `about:debugging#/runtime/this-firefox`, escolha **Carregar extensão temporária** e selecione `.output/firefox-mv2/manifest.json`. Em atualizações, clique em **Recarregar** e atualize o Octadesk com F5. Confira a versão instalada na extensão.

No Windows, `Executar-Firefox.cmd` abre um Firefox de teste após instalar dependências e gerar a build. O script procura o Firefox nas pastas usuais e mantém um perfil em `%LOCALAPPDATA%\OctaBlaster\Firefox-Teste`. Ele cria os diretórios necessários e deve permanecer aberto durante a sessão. Esse perfil tem login próprio no Octadesk. O script não assina nem instala permanentemente a extensão. A instalação temporária manual funciona sem esse script.

## Roteiro para aprovação funcional

1. No popup e no painel lateral, crie e edite variável, tag e técnico. Abra e feche os formulários para conferir a navegação e a preservação do rascunho.
2. Insira variáveis no meio do texto e sobre uma seleção. Confira o preenchimento pendente e seu cancelamento.
3. Teste `\` e `/`, busca por título, prévias, teclado e inserção no cursor. Combine busca e filtro de tags.
4. Abra dois painéis: edite itens diferentes, depois o mesmo item. Confira a mesclagem e a mensagem de conflito, respectivamente.
5. Exporte o backup, altere cadastros em um perfil de teste e restaure. Confira valores de variáveis, estado dos técnicos e atalho desativado. Importe uma lista antiga e confirme que configurações não mudaram.
6. Em tickets de contratação, troca e cancelamento, confira banco, quantidade, isenção, motivo e códigos contra o e-mail. Confira os tokens dos técnicos na mesma linha e o resumo abaixo. Não é necessário enviar a anotação para validar.
7. Repita a marcação e teste sugestões lentas. Troque de ticket durante a espera e confirme que nada é escrito no outro chamado. Um e-mail incompleto deve mostrar erro.
8. Teste um editor em iframe e vários tickets abertos, preservando a resposta pública. Confirme que mensagens escolhidas chegam ao editor que estava registrado.

Os testes automatizados cobrem fixtures locais. A revisão final do comportamento em uma sessão autenticada do Octadesk, especialmente no Firefox, continua sendo necessária para confirmar os seletores atuais da plataforma.
