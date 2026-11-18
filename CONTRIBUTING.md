# Contribuindo com o OctaBlaster

Obrigado pelo interesse em contribuir com o **OctaBlaster**! Este guia reúne o fluxo de desenvolvimento, os padrões técnicos e os critérios de validação adotados no repositório oficial (`luizGDpulz/octa-blaster`).

> 💬 **Dúvidas, ideias rápidas ou sugestões de novos modelos?**  
> Use o [GitHub Discussions](https://github.com/luizGDpulz/octa-blaster/discussions) para conversas abertas antes de abrir uma Issue técnica ou um Pull Request.

---

## 1. Pré-requisitos e Setup Local

O projeto utiliza **WXT**, **Vue 3**, **TypeScript** e **pnpm** (versão 10+, conforme o CI).

- **Node.js:** versão **22** (22.22.2+ para compatibilidade com a suíte `jsdom`, mesma linha usada no GitHub Actions).
- **Gerenciador de pacotes:** **pnpm** (não utilize `npm` ou `yarn` para instalar dependências nem gere `package-lock.json` / `yarn.lock`).

```sh
pnpm install --frozen-lockfile
```

### Comandos principais

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Modo de desenvolvimento para Chromium (Chrome/Edge/Brave) |
| `pnpm dev:firefox` | Modo de desenvolvimento com Live Reload no Firefox |
| `pnpm compile` | Verificação estrita de tipos (`vue-tsc --noEmit`) |
| `pnpm test` | Suíte de testes de regressão com Node test runner + `jsdom` |
| `pnpm build` | Build de produção para Chromium (`.output/chrome-mv3`) |
| `pnpm build:firefox` | Build de produção para Firefox (`.output/firefox-mv2`) |
| `pnpm zip` | Gera `.zip` distribuível para Chromium |
| `pnpm zip:firefox` | Gera `.zip` distribuível para Firefox |

> ⚠️ **Arquivos ignorados:** Não versione `node_modules/`, `.output/`, `.wxt/`, perfis de navegador nem credenciais de assinatura. Caso altere dependências, mantenha `pnpm-lock.yaml` sincronizado.

---

## 2. Fluxo de Contribuição (Git & GitHub)

1. **Alinhe antes mudanças grandes:** Para novas funcionalidades ou alterações estruturais, abra ou comente em uma [Issue](https://github.com/luizGDpulz/octa-blaster/issues) ou [Discussion](https://github.com/luizGDpulz/octa-blaster/discussions) antes de codificar.
2. **Crie uma branch a partir da `main` atualizada:**
   - Contribuidores externos: faça um **fork** e abra uma branch descritiva (ex.: `feat/minha-melhoria`, `fix/corrigir-mencoes`).
   - Mantenedores: siga o padrão `<tipo>/issue-<id>-<escopo>` (ex.: `feat/issue-44-reorder-templates`).
3. **Commits semânticos e atômicos (Conventional Commits):**
   - Prefira commits pequenos e coesos por responsabilidade lógica, em vez de um único commit monolítico.
   - Formato: `<tipo>(<escopo>): <descrição concisa>`
   - Tipos aceitos: `feat`, `fix`, `style`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`.
   - Referencie a Issue quando aplicável: `refs #<id>` ou `closes #<id>`.
4. **Versão e Releases:**
   - Não publique tags (`v*`), GitHub Releases ou pacotes assinados no PR. A versão vem de `package.json` — caso sugira alteração de versão, deixe explícito na descrição do PR para avaliação dos mantenedores.

---

## 3. Diretrizes Técnicas e Arquitetura

Consulte também [docs/ARQUITETURA.md](docs/ARQUITETURA.md) antes de adicionar módulos:

- **Separação de responsabilidades:**
  - `entrypoints/popup/` e `entrypoints/sidepanel/`: interface Vue 3 (`<script setup lang="ts">`) e estilos locais;
  - `entrypoints/content.ts`: integração com o DOM do Octadesk e widget flutuante por ticket;
  - `entrypoints/background.ts`: coordenação em segundo plano, roteamento por frame/token e fila serializada de gravações;
  - `utils/` e `types/`: regras de negócio, validadores sem dependência de DOM, armazenamento e contratos TypeScript.
- **Segurança e isolamento no Octadesk:**
  - Sempre isole leituras e ações no escopo do ticket/frame ativo — nunca leia ou escreva no rascunho de outro ticket aberto.
  - Em operações assíncronas no DOM, revalide que o editor e o ticket continuam ativos antes de inserir texto.
  - Preserve os tokens nativos de menção (`person[personid]`) e nunca envie respostas ou anotações internas automaticamente — toda automação deve preparar o rascunho para revisão do atendente.
  - Evite `innerHTML` com dados fornecidos pelo usuário (prefira `textContent` ou bindings seguros do Vue).
  - Não altere a URL do verificador de atualizações (`luizGDpulz/octa-blaster`).
- **Persistência segura e compatibilidade:**
  - Passe a base carregada pela tela para detectar conflitos concorrentes e mantenha compatibilidade com backups JSON existentes e migrações não destrutivas (preservando dados personalizados, listas vazias e exclusões intencionais).
- **Estilo visual (Design System):**
  - Mantenha a paleta neutra e corporativa do projeto (`#1c1b1c` / `#3c3f43`, destaque `#ffc600` e superfície clara `#f7f8f9` / `#ffffff`) com ícones SVG via `lucide-vue-next` e zero poluição visual.
- **Privacidade em fixtures/exemplos:**
  - Nunca inclua CNPJs reais, dados de clientes, IDs reais de colaboradores, tokens ou credenciais em código, testes, prints ou exemplos.

---

## 4. Checklist Antes de Abrir o Pull Request

Antes de enviar o PR para `main`, execute e confirme localmente os mesmos comandos do CI:

```sh
pnpm compile
pnpm test
pnpm build
pnpm build:firefox
```

Para alterações que afetam DOM, seletores do Octadesk, popup ou painel lateral:
- Carregue a extensão buildada (`.output/chrome-mv3` no Chromium e `.output/firefox-mv2` em `about:debugging#/runtime/this-firefox` no Firefox) e informe claramente no PR o que foi validado em página local vs. sessão real do Octadesk (veja o [roteiro funcional](docs/FUNCIONALIDADES.md#roteiro-para-aprovação-funcional)).

---

## 5. Licença

O OctaBlaster é licenciado sob a **GNU Affero General Public License v3.0 (AGPL-3.0)** — consulte [LICENSE](LICENSE). Ao contribuir, você concorda que suas contribuições serão distribuídas sob os termos da mesma licença.
