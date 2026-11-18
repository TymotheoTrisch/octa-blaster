# Histórico de versões

## 0.9.1 — 18/11/2026

- O resumo de troca inclui **Motivo:**, lido do campo **Motivo da troca de licença** do e-mail. Se o motivo estiver ausente ou divergente, a preparação é interrompida antes de alterar a anotação.

## 0.9.0 — 18/11/2026

- A marcação de licenças lê o formulário do e-mail no ticket e prepara o resumo após as menções, mantendo os técnicos na mesma linha.
- Contratação informa a quantidade total solicitada e a isenção da primeira licença; troca informa a licença; cancelamento informa a lista de licenças. O banco vem do campo do e-mail, independentemente do título do ticket.
- Códigos no formato `Lic_11822` são apresentados como `11822`. A extração usa os campos identificados do formulário e ignora CNPJ, procedimentos e observações.
- Campos obrigatórios ausentes, inválidos ou divergentes interrompem a preparação antes de alterar a anotação. Citações de e-mails e conteúdo do editor são ignorados; campos de mensagens distintas não são combinados.
- Repetir a ação preserva os marcadores confirmados e evita duplicar um resumo já presente. Sem formulário reconhecido, o botão mantém a função de apenas marcar os técnicos. A anotação fica como rascunho para revisão.

Build temporária do Firefox: `.output/firefox-mv2/manifest.json`. Após recarregar a extensão e atualizar o Octadesk, confirme a versão **0.9.0**.

## 0.8.0 — 18/11/2026

- Corrigido o retorno de sucesso quando falham tanto o armazenamento principal quanto o backup local. A API Chrome com callbacks faz uma única tentativa e verifica `runtime.lastError`.
- Backup JSON no formato 2 inclui mensagens, catálogo de tags, variáveis com seus valores e modos, técnicos e configuração do atalho. A exportação lê os dados persistidos na fila do background.
- A importação continua aceitando listas de mensagens e backups no formato 1, sem modificar variáveis, técnicos ou atalho nesses arquivos antigos.
- Ao importar o formato 2, mensagens e tags são mescladas; os cadastros de variáveis e técnicos e o atalho são restaurados do arquivo. Listas vazias são respeitadas. Alterações concorrentes independentes são preservadas e conflitos interrompem a importação antes de gravar seu conteúdo.
- Edições de variáveis e técnicos usam a versão carregada por cada painel para preservar mudanças independentes e rejeitar conflitos de edição, exclusão ou renomeação. A configuração do atalho recebe a mesma proteção.
- A versão do manifesto e da interface passa a vir de `package.json`.

Para testar no Firefox, recarregue a extensão em `about:debugging#/runtime/this-firefox`, confirme a versão **0.8.0** e atualize a página do Octadesk. A build temporária está em `.output/firefox-mv2/manifest.json`.
