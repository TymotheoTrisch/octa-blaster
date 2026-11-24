# Auxiliar de resumos do OctaBlaster

No Windows, extraia o pacote completo e abra **Instalar-IA-Firefox.exe** com dois cliques, uma vez. A janela de instalação prepara tudo em segundo plano, sem digitar comandos. Na extensão atualizada, abra **Inteligência artificial → Entrar com ChatGPT**. Depois, o Firefox inicia o auxiliar automaticamente e o login é renovado quando permitido. Não é necessário manter CMD aberto, abrir o site local ou gerar códigos.

Requisitos da instalação: Node.js 22.22.2+ e pnpm 10+. O instalador copia o runtime para `%LOCALAPPDATA%\OctaBlaster\Auxiliar`, compila o launcher C# com o Windows e registra o host `com.octablaster.ai` em HKCU, restrito ao ID oficial da extensão. `Desinstalar-IA-Firefox.cmd` remove esse registro; use Sair na extensão antes para encerrar a sessão.

O guia completo está em [docs/IA-LOCAL.md](../../docs/IA-LOCAL.md), com arquitetura, atualização, limites, login, testes e funcionamento dos dois resumos.

## Desenvolvimento

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

`pnpm start` inicia o servidor manualmente para diagnóstico; o fluxo normal utiliza Native Messaging. O runtime mantém compatibilidade com o auxiliar 0.10 já aberto para preservar sua autorização durante a atualização.

- `native-protocol.mjs`: frames JSON UTF-8 com prefixo uint32 little-endian, limites e rejeição de mensagens inválidas.
- `native-host.mjs`: comunicação stdio, início oculto do serviço, tarefas autorizadas e cancelamento.
- `native-session.mjs`: sessão HTTP interna, autenticação local e compatibilidade de atualização.
- `auth.mjs` e `vault.mjs`: registros por conta, validação OAuth, renovação serializada e credenciais protegidas pela DPAPI.
- `bridge.mjs` e `inference.mjs`: escopo de tarefas, modelos autorizados, resposta concluída e ausência de alternativa paga.
- `windows/Install.ps1` e `NativeLauncher.cs`: instalação local e transporte binário sem expor dados em argumentos/logs.
- `windows/InstallGui.cs` e `BuildInstaller.ps1`: instalador gráfico compilado com Windows PowerShell/.NET Framework; o EXE deve ficar junto da pasta `windows` no pacote extraído.
- `processIdentity.mjs`: diferencia o dono do lock de um PID reaproveitado pelo Windows, preservando as credenciais ao recuperar um lock antigo.

O auxiliar 0.3.5 oferece APIs OpenAI, Gemini, Claude, NVIDIA e servidor da equipe. O login ChatGPT continua disponível. Chaves, tokens, referências remotas e notas curtas de resumo são protegidos com DPAPI, sem entrar nos backups ou logs. Chaves/tokens não são devolvidos à interface. O chat completo fica no storage privado do navegador; o HTML integral não é arquivado. A retenção padrão dos tickets é 30 dias sem uso/90 dias de idade máxima. Exclusões remotas sem confirmação ficam pendentes.

`provider-engine.mjs` controla contexto, mudanças de modelo/perfil, recorte e limpeza; `provider-http.mjs` adapta as APIs. Não há retry de inferência nem fallback pago automático. Veja também [servidor da equipe](../team-gateway/README.md). Login ChatGPT exige `store: false`; usar estado remoto nas APIs não torna tokens de contexto gratuitos.

Veja [VALIDATION.md](VALIDATION.md). A licença é AGPL-3.0-or-later, conforme o LICENSE da raiz do repositório.

O perfil manual foi retirado das novas gerações. O aprendizado atual usa padrões numéricos de escrita confirmados no navegador, sem arquivar exemplos; consulte docs/IA-LOCAL.md.

A versão 0.3.2 orienta os provedores a distinguir cliente e atendente e a não gerar assinaturas; preserva metadados de autoria nos recortes de mensagens longas.

A versão 0.3.3 separa limpeza remota da inferência e aplica orçamentos de saída por tarefa nas APIs (768/1536/2048 tokens). Não altera automaticamente o modelo nem faz fallback pago.

A conexão NVIDIA permite escolher o identificador de qualquer modelo de chat compatível com o endpoint Chat Completions da NVIDIA. Não define um modelo padrão nem envia parâmetros exclusivos do Nemotron. Modelos e credenciais já salvos são preservados.

A versão 0.3.5 também aceita conversas independentes (`general`), com instruções próprias, histórico isolado e o mesmo modelo configurado. O histórico de tickets pode guardar o contexto extraído em texto no storage privado da extensão, com a retenção dos chats.
