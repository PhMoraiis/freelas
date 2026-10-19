# 99freelas-bot

Robô que encontra projetos no [99freelas](https://www.99freelas.com.br) compatíveis com o seu perfil
e envia propostas personalizadas por você, do mais compatível para o menos, até acabarem as suas conexões.

O login é sempre feito por você (o site tem captcha). O robô só reaproveita a sessão depois.

---

## Primeira vez (5 minutos)

**1. Instale as dependências**

```bash
npm install
npx playwright install chromium
```

**2. Faça login**

```bash
npm run login
```

Um navegador abre na tela de login do 99freelas. Entre na sua conta, resolva o "Confirme que é humano"
e **feche a janela**. O terminal deve mostrar `✔ Login detectado`.

**3. Revise as suas propostas** em [`config.ts`](config.ts): textos, valores e prazos de cada perfil.
Veja [Configurando](#configurando).

**4. Faça um teste sem enviar nada**

```bash
npm run send -- --mode dry
```

O robô mostra o ranking de projetos e as propostas que **enviaria**, sem gastar conexões.

---

## Dia a dia

```bash
npm run send
```

Isso faz tudo em sequência:

1. Varre **todas as páginas** de projetos da categoria configurada.
2. Descarta o que não serve (veja [Filtro](#filtro)).
3. Pede para a IA dar uma nota a cada projeto restante (veja [Triagem por IA](#triagem-por-ia)).
4. Ranqueia os aprovados pela nota.
5. Lê quantas conexões você tem.
6. Do 1º do ranking para baixo, abre o formulário, confere se ainda vale propor e pede para a IA
   **redigir a proposta** (texto, valor e prazo; veja [Propostas escritas pela IA](#propostas-escritas-pela-ia)).
7. Envia até restar só a reserva de conexões (`minConnectionsLeft`).

Para rodar isso sozinho todos os dias, veja [Execução diária](#execução-diária).

O `npm run send` usa o modo definido em `config.ts` (`send.mode`). Para trocar só nesta execução, use `--mode`:

| Modo | O que acontece | Quando usar |
|---|---|---|
| `dry` | Só mostra o ranking e as propostas; não abre formulário | Testar filtros e textos |
| `review` | Preenche o formulário e espera você conferir e clicar em enviar | Primeiras vezes, projetos importantes |
| `auto` | Preenche e envia sozinho, com pausa aleatória entre envios | Depois de validar com alguns envios em `review` |

No modo `review`, o terminal pergunta: **Enter** = já enviei · **p** = pular · **q** = sair.

---

## Comandos

| Comando | Para quê |
|---|---|
| `npm run login` | Entrar na conta (necessário de novo quando a sessão expirar) |
| `npm run send` | Ranquear e enviar propostas |
| `npm run send -- --mode dry` | Simular o envio |
| `npm run send -- --limit 3` | Enviar no máximo 3 nesta execução |
| `npm run scan` | Só listar os projetos aprovados, sem enviar |
| `npm run scan -- --all` | Listar também os descartados, com o motivo |
| `npm run schedule -- install 09:00` | Agendar a execução diária (veja [Execução diária](#execução-diária)) |
| `npm run test` | Rodar os testes automatizados |

Opções que valem para `scan` e `send`:

- `--pages 5`: varre só as 5 primeiras páginas (padrão: `all`).
- `--headless`: roda sem abrir janela.
- `--no-ai`: desliga a triagem por IA nesta execução (`--ai` liga, se estiver desligada no config).

> Lembre do `--` antes das opções: `npm run send -- --mode dry`.

---

## Execução diária

O robô pode rodar sozinho, **no máximo uma vez por dia**, pelo agendador do macOS (`launchd`).
São dois gatilhos:

- **Ao fazer login**, depois de ligar ou reiniciar o Mac. Acordar do repouso não conta como iniciar.
- **Num horário fixo** (09:00 por padrão), para os dias em que o Mac não reinicia. Se ele estiver
  dormindo no horário, roda quando acordar.

Se um dos gatilhos já rodou com sucesso no dia, o outro não faz nada. Se a execução falhar (sem
internet, sessão expirada), o próximo gatilho tenta de novo.

```bash
npm run schedule -- install 09:00   # agenda (ou muda o horário)
npm run schedule -- status          # mostra se está agendado e a última execução bem-sucedida
npm run schedule -- run             # roda agora neste terminal, mesmo que já tenha rodado hoje
npm run schedule -- uninstall       # remove o agendamento
```

> **Atenção:** o `install` já dispara uma execução na hora, se ainda não houve uma no dia. Com
> `send.mode: 'auto'`, ela **envia de verdade**.

Como funciona:

- Roda o `npm run send` no modo definido em `config.ts` (`send.mode`).
- Antes de começar, espera a internet ficar disponível (até 10 minutos), porque logo após o login o
  Wi-Fi pode ainda não ter conectado.
- Ao terminar, uma notificação do macOS mostra o resumo ("Resumo: 2 proposta(s) enviadas") ou o erro.
- O log de cada dia fica em `data/logs/AAAA-MM-DD.log`.
- Usa o seu shell de login (fish, aqui), que carrega o Node e as chaves `GEMINI_API_KEY` e `GROQ_API_KEY`.

Cuidados:

- **Login expirado** (dura ~30 dias): o robô abre sozinho a janela de login e avisa por notificação.
  Faça login, **feche a janela**, e a execução continua. Se ninguém fizer login em 60 minutos, a janela
  fecha e o próximo gatilho do dia tenta de novo.
- **Uma execução por vez:** enquanto uma está rodando (ou esperando o login), outro gatilho não começa outra.
- **Pasta do projeto:** o agendamento aponta para a pasta onde você rodou o `install`. Se mover o projeto,
  rode o `install` de novo no lugar novo.
- O navegador abre uma janela durante a execução (é o que o `headless: false` do config pede, porque o
  Cloudflare do site desconfia menos de janela visível).

Para testar sem enviar nada: `scripts/daily.sh --mode dry`. Com argumentos, o script sempre roda e não
conta como a execução do dia.

---

## Configurando

Tudo fica em [`config.ts`](config.ts).

### Perfis e propostas

Cada perfil é um tipo de trabalho que você faz, com o texto de proposta usado para ele:

```ts
{
  name: 'UX/UI Design',
  keywords: ['ux', 'ui', 'figma', 'protótipo', 'wireframe', 'layout'],  // buscadas no título e na descrição
  skills: ['Figma', 'UX Design', 'UI Design'],                          // tags de habilidade do projeto
  proposal: { value: 1000, days: 10, template: uxuiTemplate },          // R$, prazo em dias e texto
}
```

Nos textos, estas variáveis são trocadas automaticamente:

| Variável | Vira |
|---|---|
| `{{clientName}}` | Primeiro nome do cliente |
| `{{title}}` | Título do projeto |
| `{{skills}}` | Habilidades pedidas no projeto |
| `{{matched}}` | Palavras do seu perfil encontradas no projeto |

Limite do 99freelas: **3000 caracteres** por proposta. Não coloque telefone, e-mail ou menção à
comissão da plataforma: os termos do site proíbem, e o robô para se o site sinalizar o texto.

O link do portfólio entra nas propostas por padrão. Se ele fizer o site exibir o aviso de
"dados não permitidos", troque `SHOW_PORTFOLIO_LINK` para `false`.

Perfis atuais: **Sites institucionais / Landing pages**, **Front-end React/Next.js**,
**Full-stack / Sistemas web** e **UX/UI Design**.

Um perfil pode ter regras próprias:

- `minScore`: mínimo só daquele perfil. O de sites usa 3, então "site" no título já basta.
- `excludeKeywords`: termos que zeram só aquele perfil. No de sites, `login`, `painel`, `pagamento`,
  `e-commerce` etc. tiram o projeto da categoria "site simples", mas ele ainda pode entrar no full-stack.
- `description`: frase que explica o perfil para a IA.

### Propostas escritas pela IA

Com `ai.composeProposals: true`, a IA escreve cada proposta. Ela parte do modelo do perfil (que serve de
fonte de fatos e de tom) e adapta o texto ao pedido do cliente, citando detalhes do projeto. Também
escolhe **valor e prazo dentro das faixas do perfil**, conforme a complexidade:

```ts
proposal: { value: 800, days: 7, valueRange: [500, 1500], daysRange: [5, 15], template: simpleSiteTemplate },
```

| Campo | Para quê |
|---|---|
| `valueRange` | Faixa de valor em R$. Projetos simples ficam perto do início; o topo é para escopo grande |
| `daysRange` | Faixa de prazo em dias |
| `value` / `days` | Valor e prazo fixos, usados quando a IA não redige (desligada ou com falha) |

Regras que o robô garante, independentemente do que a IA responder:

- valor dentro da faixa, em degraus de R$ 50, e nunca abaixo da oferta mínima do projeto;
- se a oferta mínima do projeto passar do teto da faixa, o projeto é pulado;
- texto vazio, com mais de 3000 caracteres ou falha da IA: usa o modelo do perfil com o valor fixo.

Na saída do `send`, cada proposta mostra quem escreveu: `texto: IA groq` ou `texto: modelo do perfil`.

A IA só redige depois que o formulário confirma que vale enviar (sem proposta anterior, com conexões),
para não gastar a cota gratuita à toa.

### Filtro

| Opção | O que faz | Atual |
|---|---|---|
| `excludeKeywords` | Descarta se o termo aparecer no título, na descrição ou nas tags | `wordpress`, `php`, `android`... |
| `maxProposals` | Descarta projetos com propostas demais | 100 |
| `maxAgeHours` | Descarta anúncios mais antigos que isso | 168 (7 dias) |
| `minClientRating` | Nota mínima do cliente (clientes sem avaliação passam) | 4 |
| `minScore` | Pontuação mínima para entrar no ranking | 5 |
| `levels` | Níveis aceitos (vazio = todos) | todos |

**Como a pontuação funciona:** palavra-chave no título vale **3**, tag de habilidade vale **2** e palavra-chave
na descrição vale **1**. Vale a do perfil que somar mais. A busca ignora acentos e maiúsculas e só casa
palavras inteiras (`bot` não casa com `robótica`).

Dicas:

- **Muitos projetos ruins no ranking?** Aumente o `minScore` ou adicione termos em `excludeKeywords`.
- **Poucos projetos?** Diminua o `minScore`, aumente o `maxAgeHours` ou adicione palavras-chave aos perfis.
- **Evite termos contidos em outros** no mesmo perfil (`sistema` já casa `sistema web`), senão a pontuação conta em dobro.
- **Cuidado com palavras comuns na exclusão:** `logo` também casa com "logo após". Prefira `logotipo`.
- Projetos **exclusivos para assinantes** são sempre descartados. Eles abrem para todos cerca de 24h
  depois de publicados e voltam a ser avaliados nas próximas execuções.

### Triagem por IA

As palavras-chave não entendem contexto: "Site para encontrar promoções na Shopee" parece um site
simples, mas é um sistema de coleta de dados. Por isso, depois das regras eliminatórias, cada projeto
restante vai para uma IA gratuita (Gemini, com o Groq como reserva), que devolve:

- **nota de 0 a 10** de compatibilidade com você (entra no ranking quem tiver `minFit` ou mais);
- **perfil** mais adequado, que define o texto da proposta;
- **tipo** (site simples, landing page, sistema, design...), **complexidade** e **alertas**.

A IA também avalia projetos que as palavras-chave reprovariam; é assim que ela acha bons projetos
descritos com outras palavras. O texto que mais pesa é o `ai.freelancer`, em `config.ts`: quem você é,
o que aceita (em ordem de preferência) e o que recusa. **Ajuste esse texto para ajustar a triagem.**

**Com a IA ligada, só ela aprova.** Um projeto que ficou sem nota (falha, cota esgotada) fica fora do
ranking e é avaliado na próxima execução, para não gastar conexão com projeto sem triagem. Só quando
nenhum provedor funciona (por exemplo, sem nenhuma chave) o robô volta a usar só as palavras-chave.

**Provedores** (`ai.providers`, em ordem de preferência):

| Provedor | Modelo | Chave | Plano gratuito |
|---|---|---|---|
| Gemini (principal) | `gemini-3.6-flash` | `GEMINI_API_KEY`, criada em [aistudio.google.com](https://aistudio.google.com/apikey) | Cota diária baixa nesse modelo |
| Groq (reserva) | `openai/gpt-oss-120b` | `GROQ_API_KEY`, criada em [console.groq.com/keys](https://console.groq.com/keys) | Limite de tokens por minuto e por dia |

Como a reserva funciona:

- **Cota esgotada ou chave recusada** no Gemini: o Groq assume todos os projetos restantes da execução.
- **Falha num projeto só** (sobrecarga, resposta inválida): aquele projeto tenta o Groq; os próximos
  continuam começando pelo Gemini.
- **Provedor sem chave** é ignorado, e o próximo assume.
- Na coluna "motivo", a nota mostra quem avaliou: `IA gemini 8/10` ou `IA groq 8/10`.

Deixe as chaves no ambiente do terminal, nunca no código. No fish, `set -Ux` grava a variável para
todos os terminais:

```fish
set -Ux GEMINI_API_KEY "..."
set -Ux GROQ_API_KEY "..."
```

No bash ou zsh, use `export GEMINI_API_KEY="..."` no `~/.zshrc` ou equivalente.

**Planos gratuitos:**

- **Uso dos dados:** no plano gratuito, o Google pode usar o que é enviado para melhorar os produtos dele.
  Aqui só vão os anúncios públicos e o seu texto de perfil; não use essas chaves com dados sigilosos.
- **Limite por minuto:** cada provedor tem um intervalo mínimo entre chamadas (`minIntervalMs`), e as
  chamadas saem uma por vez (`concurrency: 1`). No Gemini, quando a resposta é "limite atingido" (429)
  ou "sobrecarregado" (503), o robô espera e tenta de novo (o tempo sugerido pelo Google, ou 10 s, 25 s
  e 45 s). Se o Google informar que a cota **diária** acabou, ele passa para o Groq na hora. O SDK do Groq
  repete sozinho nos limites por minuto.

| Opção | O que faz | Atual |
|---|---|---|
| `enabled` | Liga ou desliga a triagem | `true` |
| `providers` | Provedores em ordem de preferência: `provider`, `model` e `minIntervalMs` | Gemini → Groq |
| `minFit` | Nota mínima para entrar no ranking | 7 |
| `maxCallsPerRun` | Teto de projetos novos avaliados por execução | 80 |
| `concurrency` | Projetos avaliados ao mesmo tempo | 1 |

**Cache:** cada projeto é avaliado uma vez e a nota fica em cache (`data/ai-cache.json`). Nas execuções
seguintes, só os projetos novos ou pendentes são enviados à IA. Ao mudar o `ai.freelancer`, os perfis ou
a lista de provedores, o cache é refeito.

### Envio

| Opção | O que faz | Atual |
|---|---|---|
| `mode` | Modo padrão do `npm run send` | `auto` |
| `minConnectionsLeft` | Conexões que o robô nunca gasta (reserva) | 1 |
| `maxPerRun` | Teto de propostas por execução (opcional) | sem teto |
| `minDelayMs` / `maxDelayMs` | Pausa aleatória entre envios no modo `auto` | 20 a 60 s |

### Categorias

`scan.categories` usa o trecho da URL `https://www.99freelas.com.br/projects?categoria=<slug>`.
O padrão é `web-mobile-e-software`.

---

## Conexões

Cada proposta gasta conexões (normalmente 1). Elas só voltam quando o cliente fecha o projeto ou
escolhe outro freelancer. Antes de cada envio, o robô confere no formulário e:

- **pula** projetos para os quais você já mandou proposta;
- **para** quando sobrariam menos conexões que a reserva;
- **pula** projetos que custam mais conexões do que você tem e tenta o próximo do ranking;
- **pula** se o seu valor estiver abaixo da oferta mínima do projeto.

---

## Problemas comuns

| Mensagem ou sintoma | O que fazer |
|---|---|
| `Login do 99freelas expirado` (janela de login abre sozinha) | Faça login e feche a janela; o `send` continua em seguida |
| `Sessão expirada ou inexistente` | Rode `npm run login` de novo |
| `Login não encontrado no perfil` | Você fechou o navegador antes de terminar o login; repita o `npm run login` |
| O captcha falha ou fica em loop no `npm run login` | Tente outra rede (redes corporativas e VPNs costumam ser bloqueadas pelo Cloudflare) |
| `Nenhum projeto novo passou no filtro` | Rode `npm run scan -- --all` para ver o motivo de cada descarte e ajuste o filtro |
| `o site sinalizou o texto como suspeito` | Tire contatos e links do texto, ou use `SHOW_PORTFOLIO_LINK = false` |
| `oferta abaixo do mínimo do projeto` | Aumente o `value` do perfil |
| `texto com N caracteres (máx. 3000)` | Encurte o template do perfil |
| `Provedores ignorados: gemini: GEMINI_API_KEY não definida` | A chave não está no ambiente do terminal; veja [Triagem por IA](#triagem-por-ia) |
| `Gemini recusou a requisição (400)` / `Groq recusou a requisição (404)` | Chave inválida ou nome de modelo errado em `ai.providers` |
| `gemini indisponível (cota ... esgotada); seguindo com groq` | Normal no plano gratuito: o Groq assume o resto da execução |
| `N projeto(s) sem nota ficam fora do ranking` | Os dois provedores falharam nesses projetos; eles voltam na próxima execução |
| A IA aprova projetos que você não quer | Acrescente o tipo de trabalho na lista do que você recusa, em `ai.freelancer`, ou aumente o `minFit` |
| `envio não confirmado` | Confira no site, em "Minhas propostas"; há um screenshot em `data/screenshots/` |

---

## Arquivos gerados

| Caminho | Conteúdo |
|---|---|
| `.auth/` | Sessão do navegador (cookies do login) |
| `data/history.json` | Projetos já tratados; o robô nunca propõe duas vezes no mesmo projeto |
| `data/last-scan.json` | Resultado completo da última varredura, com a pontuação de cada projeto |
| `data/ai-cache.json` | Notas da IA por projeto, para não pagar duas vezes pela mesma avaliação |
| `data/screenshots/` | Evidência de envios não confirmados |

Para o robô "esquecer" um projeto e tentar de novo, apague a entrada dele em `data/history.json`.

---

## Segurança e boas práticas

- **Nunca compartilhe a pasta `.auth/`**: ela dá acesso à sua conta. Ela já está no `.gitignore`.
- Nenhuma senha é armazenada; o login é sempre feito por você no navegador.
- Automatizar a plataforma pode ir contra os termos de uso do 99freelas e colocar a sua conta em risco.
  Mantenha um volume baixo e revise os textos com frequência.

---

## Para desenvolvedores

| Arquivo | Responsabilidade |
|---|---|
| `config.ts` | Categorias, filtros, perfis e modelos de proposta |
| `src/cli.ts` | Comandos e fluxo do envio (ranking → saldo de conexões → envio) |
| `src/session.ts` | Perfil persistente do navegador, login manual e detecção de sessão |
| `src/scraper.ts` + `src/parser.ts` | Varredura de `/projects` e extração dos dados |
| `src/filter.ts` | Regras eliminatórias, pontuação por perfil e ranking |
| `src/ai.ts` | Base da IA: pedido genérico aos provedores, cadeia de reserva, ritmo, triagem e cache |
| `src/providers.ts` | Monta a cadeia de provedores a partir do config |
| `src/composer.ts` | Redação das propostas pela IA, com as faixas de valor e prazo |
| `src/gemini.ts` / `src/groq.ts` | Provedores (saída em JSON Schema e tratamento de limites) |
| `scripts/daily.sh` / `scripts/schedule.sh` | Execução diária com log e notificação, e agendamento no `launchd` |
| `src/proposal.ts` + `src/selectors.ts` | Formulário de proposta: regras, preenchimento e envio |
| `src/store.ts` | Histórico em `data/history.json` |

```bash
npm run test        # testes (Vitest)
npm run typecheck   # verificação de tipos
```

**Login:** o captcha (Cloudflare Turnstile) reprova navegadores controlados por automação. Por isso o
`npm run login` abre o Chromium do Playwright como processo comum, sem automação conectada, e o robô
reaproveita o perfil depois. O navegador usa `--password-store=basic --use-mock-keychain`, as mesmas
flags do Playwright, para que os cookies gravados possam ser lidos.

**Confirmação de envio:** depois de enviar, o robô recarrega o formulário e confere se `input.tem-proposta`
passou a valer `1`. Essa regra foi deduzida pelo nome do campo; se o primeiro envio real não for confirmado,
revise esse ponto em `src/proposal.ts`.
