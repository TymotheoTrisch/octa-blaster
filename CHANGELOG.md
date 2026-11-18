# Histórico de versões

## 0.8.0 — 18/11/2026

- Corrigido o retorno de sucesso quando falham tanto o armazenamento principal quanto o backup local. A API Chrome com callbacks faz uma única tentativa e verifica `runtime.lastError`.
- Backup JSON no formato 2 inclui mensagens, catálogo de tags, variáveis com seus valores e modos, técnicos e configuração do atalho. A exportação lê os dados persistidos na fila do background.
- A importação continua aceitando listas de mensagens e backups no formato 1, sem modificar variáveis, técnicos ou atalho nesses arquivos antigos.
- Ao importar o formato 2, mensagens e tags são mescladas; os cadastros de variáveis e técnicos e o atalho são restaurados do arquivo. Listas vazias são respeitadas. Alterações concorrentes independentes são preservadas e conflitos interrompem a importação antes de gravar seu conteúdo.
- Edições de variáveis e técnicos usam a versão carregada por cada painel para preservar mudanças independentes e rejeitar conflitos de edição, exclusão ou renomeação. A configuração do atalho recebe a mesma proteção.
- A versão do manifesto e da interface passa a vir de `package.json`.

Para testar no Firefox, recarregue a extensão em `about:debugging#/runtime/this-firefox`, confirme a versão **0.8.0** e atualize a página do Octadesk. A build temporária está em `.output/firefox-mv2/manifest.json`.
