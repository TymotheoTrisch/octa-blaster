# Servidor de IA da equipe — homologação

Backend opcional com credencial individual por usuário, limites de solicitações e isolamento dos tickets. Reutiliza os adaptadores de `apps/local-helper`. O administrador escolhe OpenAI, Gemini, Claude ou NVIDIA. O login ChatGPT permanece local e não é transferido para este servidor.

Não foi publicado em um servidor externo. Os testes HTTP usam provedores simulados; não comprovam preço, acesso ou qualidade de uma conta real. O Compose foi validado, mas a imagem não foi construída neste computador porque o daemon Docker estava indisponível.

## Preparação do administrador

É necessário ter domínio apontando para o servidor, Docker/Compose e acesso às APIs escolhidas. Execute a administração na pasta `apps/team-gateway`. Os usuários da extensão continuam sem CMD.

1. Copie `.env.example` para `.env`. Defina `OCTA_DOMAIN`, a chave de API no nome indicado por `apiKeyEnv` e uma `OCTA_MASTER_KEY` aleatória de 32 bytes (64 caracteres hexadecimais). Guarde a chave mestra fora do volume e do Git; sem ela, o estado não pode ser recuperado. Restrinja o `.env` ao administrador.
2. Cadastre cada usuário com um identificador e modelo disponível na conta. Este comando não chama a IA:

```sh
node provision-user.mjs --id=atendente1 --provider=openai --model=MODELO_DISPONIVEL --key-env=OCTA_OPENAI_KEY
```

O cadastro cria `users.json` com o hash da credencial individual. A credencial bruta é gravada somente em `.secrets/atendente1.txt`, com criação exclusiva e permissão restrita. Entregue o arquivo por canal privado. Nunca entregue a chave de API, o `.env` ou a chave mestra. Não publique arquivos de usuários, segredos nem o volume de dados.

3. Revise `users.json`: o padrão é 10 solicitações/minuto, 200/dia e retenção de 30 dias sem uso e 90 dias de idade máxima por usuário. Os limites contam tentativas e não são um teto financeiro. A contagem diária segue UTC e persiste no volume, inclusive após reiniciar.
4. Inicie o serviço:

```sh
docker compose up -d --build
```

O Caddy publica HTTPS nas portas 80/443. A porta 8787 do backend não é publicada no host. Preserve os volumes nas atualizações. A aplicação roda sem root, com filesystem somente leitura e volume exclusivo para estado. Não habilite logs de corpos nem cabeçalhos de autenticação no proxy.

Use uma única instância do gateway por volume. O armazenamento em arquivo não oferece coordenação distribuída para múltiplas réplicas. O lock compara a identidade do boot e o início do processo no Linux, evitando confundir um PID 1 reutilizado após reinício.

5. Na extensão atualizada, selecione **Inteligência artificial → Servidor da equipe**. Informe a origem HTTPS e a credencial individual. O auxiliar protege essa credencial com DPAPI. A chave do provedor fica no servidor; cada usuário tem estado criptografado e referências remotas separados, mesmo para um número de ticket igual.

NVIDIA começa com `approvedData: false`. O endpoint Build é de prototipagem e restringe dados pessoais/confidenciais. Só altere essa opção se o acordo aplicável ao endpoint permitir os dados enviados; a marcação não substitui essa autorização. Para outro endpoint contratado, adapte o endereço do provedor no servidor.

## Contexto, proteção e retenção

- OpenAI usa Responses com `store: true` e `previous_response_id`; Gemini usa Interactions com `previous_interaction_id`, quando habilitado. Isso reduz o conteúdo transmitido nas continuações, mas não elimina tokens de entrada nem cobrança. A cadeia é renovada após 12 interações, mudança do contexto/perfil/modelo ou edição de perguntas.
- Claude usa Messages com contexto compacto e indicações de cache efêmero. NVIDIA usa Chat Completions compatível com OpenAI. Cache e descontos dependem do provedor; não há promessa de economia fixa.
- O cliente envia somente um perfil compacto e um trecho de exemplo para estilo. Não há uso de dados de outro usuário nem acesso a memórias do site ChatGPT.
- O estado é protegido com AES-256-GCM. Contém credenciais, contadores, referências remotas e uma nota curta de resumo do ticket, sem arquivar seu HTML integral. A chave mestra fica separada do volume.
- A limpeza ocorre ao iniciar, antes de gerar e a cada hora enquanto ativo. Exclusões remotas sem confirmação ficam pendentes. Essa exclusão não controla logs do provedor. Uma chave substituída/revogada pode impedir a exclusão; confira as pendências antes de rotacionar credenciais.
- Os dias configurados na extensão controlam os dados locais. A política do servidor vem de `users.json` e não pode ser ampliada pelo cliente. Antes de retirar definitivamente um usuário ou sua chave do provedor, exclua os estados remotos. Retirar o usuário do arquivo e reiniciar revoga seu acesso ao gateway, mas não apaga automaticamente o diretório dele.

Não são registrados textos, e-mails, tokens ou chaves em logs. Há limites de tamanho/tempo e nenhuma repetição automática de inferência ou troca para outro provedor pago. O servidor não executa ferramentas nem envia respostas a clientes.

## Testes

Na raiz, com as dependências do auxiliar instaladas:

```sh
pnpm test:gateway
```

Cobertura: autenticação, recusa de origem de navegador, isolamento, continuidade remota, quotas persistentes e criptografia autenticada. Os fontes e o LICENSE acompanham a entrega; disponibilize os fontes correspondentes aos usuários do serviço.
