# Auxiliar de resumos do OctaBlaster

No Windows, execute **Instalar-IA-Firefox.cmd** uma vez. Na extensão atualizada, abra **Inteligência artificial → Entrar com ChatGPT**. Depois, o Firefox inicia o auxiliar automaticamente e o login é renovado quando permitido. Não é necessário manter CMD aberto, abrir o site local ou gerar códigos.

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

Os tokens não chegam à extensão, não entram no backup e não são registrados em logs. O chat e o conteúdo de clientes não são persistidos pelo aplicativo. As tarefas habilitadas são resumo de mensagem, resumo do ticket e perguntas sobre esse contexto. A validade da autorização é definida pelo provedor, com renovação; não é um token manual de cinco minutos nem um cookie do navegador.

Veja [VALIDATION.md](VALIDATION.md). A licença é AGPL-3.0-or-later, conforme o LICENSE da raiz do repositório.
