import type { AppConfig } from './src/types';

/*
 * Perfis e propostas montados a partir de philipemorais.com e do GitHub público (PhMoraiis).
 * Variáveis disponíveis nos textos: {{clientName}}, {{title}}, {{skills}}, {{matched}}.
 * Limite do 99freelas: 3000 caracteres por proposta.
 */

// O 99freelas permite link de portfólio, mas pode exibir o aviso de "dados não permitidos" ao enviar.
// No modo auto esse aviso interrompe a execução; se isso acontecer, troque para false.
const SHOW_PORTFOLIO_LINK = true;

const portfolio = SHOW_PORTFOLIO_LINK
  ? 'Esses e outros projetos estão no meu portfólio: philipemorais.com'
  : 'Posso enviar detalhes desses e de outros projetos por aqui, se quiser.';

const frontendTemplate = `
Olá, {{clientName}}! Tudo bem?

Li o projeto "{{title}}" e acredito que me encaixo bem no que você procura. Sou desenvolvedor front-end e designer UX/UI, estudante de Engenharia de Software na UnB, e trabalho principalmente com React, Next.js, TypeScript e Tailwind.

Alguns trabalhos parecidos:
• Site institucional da Stellar Studio (Next.js + Tailwind), com narrativa direta, hierarquia tipográfica pensada para desktop e celular e um caminho claro até o contato;
• Jumpie, plataforma SaaS de indicações com campanhas gamificadas (Next.js + Tailwind);
• ColorSpace, ferramenta de conversão de cores (OKLCH, HEX, RGB e HSL) para quem usa Tailwind e Shadcn/UI.

${portfolio}

Como eu conduziria:
1. Alinhamento do objetivo, do público e das referências;
2. Layout no Figma para sua aprovação antes de partir para o código;
3. Desenvolvimento responsivo, com atenção a performance e SEO;
4. Publicação e entrega do código-fonte.

Você já tem alguma referência visual ou um prazo ideal em mente? Com isso consigo detalhar melhor a proposta.
`;

const fullstackTemplate = `
Olá, {{clientName}}! Tudo bem?

Li o projeto "{{title}}". Sou desenvolvedor full-stack com foco em React, Next.js, Node.js e TypeScript, e fundador da Stellar Studio, onde liderei mais de 10 projetos de ponta a ponta para clientes dos setores financeiro, de saúde e de varejo.

Experiências relacionadas:
• OnCine: aplicação de horários de cinema em tempo real que desenvolvi do zero, da modelagem de dados à interface (React, Node.js e Prisma);
• Jumpie: SaaS de indicações com campanhas gamificadas, rastreamento e pontuação (Next.js);
• Na Rede SARAH, arquitetei uma plataforma interna de automação do processamento de dados (React, Next.js e Node.js), que reduziu o tempo gasto com operação manual.

${portfolio}

Como eu conduziria:
1. Levantamento dos requisitos e definição do escopo da primeira versão;
2. Modelagem do banco de dados e da API;
3. Desenvolvimento em entregas parciais, para você acompanhar a evolução;
4. Testes, publicação e entrega do código-fonte com instruções de instalação.

Você já tem alguma preferência de tecnologia ou de hospedagem? Com isso consigo fechar um cronograma mais preciso.
`;

const uxuiTemplate = `
Olá, {{clientName}}! Tudo bem?

Vi o projeto "{{title}}". Sou designer UX/UI e também desenvolvedor front-end, então desenho as interfaces já pensando em como serão implementadas, o que evita retrabalho na hora do desenvolvimento.

Trabalho no Figma, dos wireframes ao protótipo navegável. Entre os projetos em que cuidei do design e da implementação estão o ColorSpace, uma ferramenta de conversão de cores que equilibra simplicidade na interface com precisão técnica, e o site institucional da Stellar Studio, o estúdio que fundei.

${portfolio}

Como eu conduziria:
1. Entendimento do público, dos objetivos e das referências;
2. Fluxos e wireframes para validar a estrutura;
3. Layout em alta fidelidade e protótipo navegável;
4. Entrega dos arquivos organizados em componentes e estilos, prontos para o desenvolvimento.

Já existe alguma identidade visual definida (cores, tipografia, marca)? Isso me ajuda a estimar melhor o trabalho.
`;

const simpleSiteTemplate = `
Olá, {{clientName}}! Tudo bem?

Li o projeto "{{title}}". Desenvolvo sites institucionais e landing pages com foco no que importa para esse tipo de página: visual profissional, carregamento rápido, bom funcionamento no celular e um caminho claro para o visitante entrar em contato.

Um exemplo é o site da Stellar Studio, o estúdio que fundei, feito com Next.js e Tailwind, com narrativa direta e hierarquia pensada para desktop e celular.

${portfolio}

Como eu conduziria:
1. Alinhamento do conteúdo, das referências e do objetivo da página;
2. Proposta de layout para sua aprovação;
3. Desenvolvimento responsivo, com SEO básico configurado;
4. Publicação e entrega dos arquivos.

Você já tem os textos e as imagens, ou prefere que eu sugira a estrutura do conteúdo?
`;

const config: AppConfig = {
  browser: {
    // Com interface aberta o Cloudflare do site desconfia menos
    headless: false,
    // channel: 'chrome', // descomente para usar o Google Chrome instalado
  },

  scan: {
    // Slugs da URL https://www.99freelas.com.br/projects?categoria=<slug>
    categories: ['web-mobile-e-software'],
    // 'all' percorre até a última página; use um número para varrer menos
    pages: 'all',
  },

  send: {
    // 'dry' = só lista | 'review' = preenche e você envia | 'auto' = envia sozinho
    mode: 'auto',
    // Envia do topo do ranking até as conexões acabarem. Para limitar por execução: maxPerRun: 5,
    // Cada proposta gasta 1 conexão; elas só voltam quando o cliente fecha o projeto ou escolhe outro.
    // O robô para antes de deixar menos que isso no estoque.
    minConnectionsLeft: 1,
    minDelayMs: 20_000,
    maxDelayMs: 60_000,
  },

  filter: {
    excludeKeywords: ['wordpress', 'php', 'logo', 'design gráfico', 'tradução', 'redação', 'trabalho acadêmico', 'tcc', 'c#', 'shopify', 'kiwify', 'lua', 'woocommerce', 'laravel', 'wix', 'n8n', 'yampi', 'android'],
    excludeCategories: [],
    levels: [], // ex.: ['Intermediário', 'Especialista']
    // Projetos só abrem para não assinantes ~24h após publicados, já com dezenas de propostas
    maxProposals: 100,
    // Anúncios ficam abertos ~30 dias e só liberam para não assinantes após 24h; 72h cortava bons projetos
    maxAgeHours: 168,
    minClientRating: 4,
    minScore: 5,
  },

  // Triagem por IA: avalia cada projeto que passou nas regras eliminatórias e dá uma nota de 0 a 10.
  // Desligada, vale só o filtro por palavras-chave acima.
  ai: {
    enabled: true,
    // Em ordem de preferência: se o Gemini falhar (cota esgotada, sobrecarga), o Groq assume.
    // Chaves no ambiente do terminal: GEMINI_API_KEY e GROQ_API_KEY
    providers: [
      { provider: 'gemini', model: 'gemini-3.6-flash', minIntervalMs: 6_000 },
      // ~2 mil tokens por avaliação; 12s entre chamadas fica abaixo do limite de tokens por minuto
      { provider: 'groq', model: 'openai/gpt-oss-120b', minIntervalMs: 12_000 },
    ],
    minFit: 7,
    // Planos gratuitos têm limite por minuto: uma chamada por vez, no ritmo de minIntervalMs
    concurrency: 1,
    maxCallsPerRun: 80,
    freelancer: `
Desenvolvedor front-end e designer UX/UI, estudante de Engenharia de Software na UnB e fundador
de um pequeno estúdio de software. Stack: React, Next.js, TypeScript, Tailwind, Node.js, Prisma,
PostgreSQL/MySQL e Figma.

Aceita, em ordem de preferência:
1. Sites institucionais, landing pages, portfólios e sites simples, sem sistema por trás. São a
   prioridade: escopo claro e entrega rápida contam a favor.
2. Front-end em React/Next.js e interfaces responsivas.
3. UX/UI: wireframes, protótipos e layouts no Figma.
4. Sistemas web, painéis e MVPs com React/Next.js e Node.js.

Recusa: WordPress, Elementor, Wix, Shopify, WooCommerce, Yampi, Kiwify e outras plataformas
prontas; PHP/Laravel; C#; Lua; apps nativos Android; automações em n8n; automações, bots e
integrações com WhatsApp (inclusive a API oficial do WhatsApp Business); design gráfico e logotipos;
tradução, redação e trabalhos acadêmicos.
`,
    // A IA escreve cada proposta a partir do modelo do perfil e escolhe valor e prazo dentro das
    // faixas abaixo (valueRange/daysRange). Se falhar, vale o modelo com o valor fixo do perfil
    composeProposals: true,
    portfolioLine: portfolio,
  },

  // Valores, prazos e faixas são PONTOS DE PARTIDA: revise conforme o seu preço.
  // value/days valem sem IA; valueRange/daysRange limitam o que a IA pode propor.
  // Evite termos contidos em outros ("sistema" já casa "sistema web"), senão a pontuação conta em dobro.
  profiles: [
    {
      name: 'Sites institucionais / Landing pages',
      description: 'site institucional, landing page, portfólio ou site simples de divulgação, sem login, painel, loja ou integrações',
      keywords: ['site', 'landing page', 'página', 'one page', 'hotsite', 'portfólio', 'institucional'],
      // Se o texto pede qualquer um destes, não é um site simples (o perfil full-stack ainda pode pegar)
      excludeKeywords: [
        'sistema', 'login', 'painel', 'dashboard', 'área de membros', 'área do cliente', 'cadastro de usuários',
        'e-commerce', 'loja virtual', 'carrinho', 'pagamento', 'integração', 'api', 'aplicativo', 'app', 'marketplace',
      ],
      // Sites simples raramente trazem muitos termos técnicos: "site" no título já basta
      minScore: 3,
      proposal: { value: 800, days: 7, valueRange: [500, 1500], daysRange: [5, 15], template: simpleSiteTemplate },
    },
    {
      name: 'Front-end React/Next.js',
      description: 'interfaces e aplicações front-end em React/Next.js, incluindo landing pages com essa stack pedida',
      keywords: [
        'react', 'reactjs', 'next', 'nextjs', 'front-end', 'frontend',
        'tailwind', 'typescript', 'astro', 'responsivo', 'animação', 'gsap',
      ],
      skills: ['React', 'ReactJS', 'React.js', 'Next.js', 'NextJS', 'TypeScript', 'JavaScript', 'Tailwind CSS', 'HTML5', 'CSS3'],
      proposal: { value: 1500, days: 15, valueRange: [800, 3000], daysRange: [7, 25], template: frontendTemplate },
    },
    {
      name: 'Full-stack / Sistemas web',
      description: 'sistemas web, painéis administrativos, SaaS e MVPs com React/Next.js e Node.js',
      keywords: [
        'sistema', 'painel', 'dashboard', 'saas', 'plataforma', 'mvp',
        'node', 'nodejs', 'api', 'prisma', 'fastify', 'postgres', 'postgresql', 'mysql', 'crud',
      ],
      skills: ['Node.js', 'NodeJS', 'React', 'Next.js', 'TypeScript', 'PostgreSQL', 'MySQL', 'API'],
      proposal: { value: 4000, days: 30, valueRange: [1500, 6000], daysRange: [15, 45], template: fullstackTemplate },
    },
    {
      name: 'UX/UI Design',
      description: 'design de interfaces, wireframes, protótipos e layouts no Figma, sem desenvolvimento',
      keywords: ['ux', 'ui', 'figma', 'protótipo', 'prototipagem', 'wireframe', 'design de interface', 'layout'],
      skills: ['Figma', 'UX', 'UI', 'UI Design', 'UX Design', 'Web Design'],
      proposal: { value: 1000, days: 10, valueRange: [600, 2500], daysRange: [5, 20], template: uxuiTemplate },
    },
  ],
};

export default config;
