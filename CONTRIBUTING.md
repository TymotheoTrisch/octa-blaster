# Contribuindo com o OctaBlaster

Este guia descreve o fluxo de desenvolvimento e revisão compatível com a estrutura atual do projeto. Sugestões de produto e dúvidas de uso podem ser discutidas no [GitHub Discussions](https://github.com/luizGDpulz/octa-blaster/discussions); bugs e mudanças técnicas podem ser acompanhados nas [Issues](https://github.com/luizGDpulz/octa-blaster/issues).

## Preparação

Use um fork e uma branch de trabalho baseada na `main` atual. O projeto usa pnpm 10, WXT, Vue 3 e TypeScript. Para a suíte com jsdom, use uma versão compatível do Node.js: 22.22.2 ou superior na linha 22, 24.15 ou superior na linha 24, ou linha 26. O CI usa a linha 22 atualizada.

```sh
pnpm install --frozen-lockfile
pnpm dev
# ou
pnpm dev:firefox
```

Mantenha `pnpm-lock.yaml` junto de alterações em dependências. Artefatos em `.output`, `.wxt`, perfis locais, credenciais de assinatura e `node_modules` não fazem parte da contribuição.

## Estrutura e decisões

- Preserve a separação entre interface Vue, integração com o DOM, coordenação no background, regras e persistência. Consulte [Arquitetura](docs/ARQUITETURA.md) antes de acrescentar módulos.
- Centralize validações em esquemas sem dependência do DOM. As telas usam os serviços públicos; operações `Local` de armazenamento são executadas pelo background dentro da fila.
- Em alterações de cadastro, passe a base carregada pela tela para detectar conflitos e preserve dados legados, listas vazias e exclusões intencionais.
- Ações assíncronas no Octadesk precisam reconfirmar ticket e editor antes de escrever. Não use o texto de outro chamado nem mensagens arbitrárias da página para selecionar o destino.
- Preserve os tokens nativos de menção e escreva no rascunho. Uma nova automação não deve enviar respostas ou anotações como efeito implícito.
- Use o estilo TypeScript/Vue existente. Evite dependências e camadas adicionais quando os módulos atuais resolvem a necessidade.

## Verificações

Antes do PR, execute os mesmos comandos do CI:

```sh
pnpm compile
pnpm test
pnpm build
pnpm build:firefox
```

A suíte usa o executor nativo do Node.js, hooks de resolução/transpilação TypeScript e jsdom. Adicione regressões para comportamentos e falhas relevantes. Fixtures devem ser anonimizadas, sem CNPJ real, mensagens de clientes, IDs de pessoas reais, tokens ou credenciais.

Mudanças em seletores, caret, popovers ou eventos exigem também teste com a extensão carregada no navegador. Descreva separadamente testes em páginas locais e validação na sessão autenticada do Octadesk. O [roteiro funcional](docs/FUNCIONALIDADES.md#roteiro-para-aprovação-funcional) ajuda a conferir popup, painel, múltiplos tickets e Firefox.

## Descrição do PR

Informe o problema, o comportamento resultante e como reproduzir antes/depois. Relacione uma issue existente quando houver, sem inventar vínculo. Explique mudanças de dados, compatibilidade do backup, efeitos sobre configurações e limitações conhecidas. Inclua os comandos executados e seus resultados, além dos passos de teste manual que ainda faltam.

Atualize o README e a documentação quando o uso ou a arquitetura mudarem. A versão vem de `package.json`; manifeste a versão proposta e deixe a aprovação e a publicação da release para a manutenção. A criação de PR não exige publicar tag, release ou extensão assinada.

O projeto é distribuído sob a [AGPL-3.0](LICENSE). Preserve os avisos de licença e os créditos existentes.
