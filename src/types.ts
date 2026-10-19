export interface Project {
  id: number;
  title: string;
  url: string;
  bidUrl: string;
  category: string;
  /** Nível pedido pelo cliente: Iniciante, Intermediário ou Especialista */
  level: string;
  publishedAt: Date | null;
  proposals: number | null;
  interested: number | null;
  description: string;
  skills: string[];
  client: {
    name: string;
    rating: number | null;
    reviews: number;
  };
  flags: {
    urgent: boolean;
    featured: boolean;
    /** Projeto exclusivo para assinantes pagos do 99freelas */
    exclusive: boolean;
  };
}

export interface ProposalDefaults {
  /** Valor da proposta em R$; usado quando a IA não redige a proposta */
  value: number;
  /** Prazo de entrega em dias; usado quando a IA não redige a proposta */
  days: number;
  /** Faixa em R$ dentro da qual a IA escolhe o valor, conforme a complexidade */
  valueRange?: [number, number];
  /** Faixa de prazo em dias para a IA */
  daysRange?: [number, number];
  /** Texto da proposta; aceita variáveis {{title}}, {{clientName}}, {{skills}}, {{matched}} */
  template: string;
}

export interface Profile {
  name: string;
  /** Palavras-chave procuradas no título e na descrição */
  keywords: string[];
  /** Habilidades (tags do projeto) que você domina */
  skills?: string[];
  /** Sobrescreve o minScore global para este perfil */
  minScore?: number;
  /** Termos que zeram a pontuação só deste perfil (ex.: "sistema" num perfil de sites simples) */
  excludeKeywords?: string[];
  /** Descrição do tipo de trabalho, usada pela IA para escolher o perfil */
  description?: string;
  proposal: ProposalDefaults;
}

export interface FilterConfig {
  /** Termos que descartam o projeto se aparecerem no título ou na descrição */
  excludeKeywords: string[];
  /** Categorias descartadas (ex.: "Design", "Tradução") */
  excludeCategories: string[];
  /** Níveis aceitos; vazio aceita todos */
  levels: string[];
  maxProposals?: number;
  maxAgeHours?: number;
  minClientRating?: number;
  minClientReviews?: number;
  /** Pontuação mínima para considerar que o projeto combina com um perfil */
  minScore: number;
}

export type SendMode = 'dry' | 'review' | 'auto';

export interface AppConfig {
  browser: {
    headless: boolean;
    /** "chrome" usa o Google Chrome instalado; undefined usa o Chromium do Playwright */
    channel?: string;
  };
  scan: {
    /** Slugs de categoria da URL /projects?categoria=...; "" = todas */
    categories: string[];
    /** Quantidade de páginas por categoria, ou 'all' para percorrer até a última */
    pages: number | 'all';
  };
  send: {
    mode: SendMode;
    /** Teto opcional de propostas por execução; sem ele, o limite são as conexões disponíveis */
    maxPerRun?: number;
    /** Conexões que nunca devem ser gastas pelo robô (cada proposta consome ao menos 1) */
    minConnectionsLeft: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  filter: FilterConfig;
  ai: AiConfig;
  profiles: Profile[];
}

export interface Evaluation {
  project: Project;
  matched: boolean;
  /** Descartado por regra eliminatória (exclusivo, idade, termo excluído...); a IA não avalia */
  hardRejected: boolean;
  /** Pontuação usada no ranking: palavras-chave, ou a nota da IA (0-10) quando ela está ligada */
  score: number;
  /** Pontuação por palavras-chave, mantida para comparação quando a IA define o score */
  keywordScore: number;
  profile?: Profile;
  matchedTerms: string[];
  reasons: string[];
  ai?: AiVerdict;
}

export type ProjectKind = 'site_simples' | 'landing_page' | 'sistema_web' | 'design_ux' | 'automacao' | 'mobile' | 'outro';

export interface AiVerdict {
  /** 0 a 10: quanto o projeto combina com você */
  fit: number;
  /** Nome do perfil escolhido, ou "nenhum" */
  profile: string;
  kind: ProjectKind;
  complexity: 'baixa' | 'media' | 'alta';
  reason: string;
  redFlags: string[];
  /** Provedor que deu a nota (ex.: "gemini") */
  source?: string;
}

export interface AiProviderConfig {
  /** 'gemini' lê a chave de GEMINI_API_KEY; 'groq', de GROQ_API_KEY */
  provider: 'gemini' | 'groq';
  model: string;
  /** Intervalo mínimo entre chamadas, para ficar abaixo do limite por minuto do plano gratuito */
  minIntervalMs?: number;
}

export interface AiConfig {
  enabled: boolean;
  /** Em ordem de preferência: se um falhar, o próximo assume */
  providers: AiProviderConfig[];
  /** Nota mínima (0-10) para o projeto entrar no ranking */
  minFit: number;
  /** Chamadas simultâneas à API */
  concurrency: number;
  /** Teto de projetos novos avaliados por execução (os já avaliados vêm do cache) */
  maxCallsPerRun: number;
  /** Quem você é, o que aceita e o que recusa; é a principal instrução da IA */
  freelancer: string;
  /** A IA redige o texto e escolhe valor e prazo de cada proposta (dentro das faixas do perfil) */
  composeProposals: boolean;
  /** Frase fixa sobre o portfólio, inserida pelo robô no texto da IA (que não pode falar do portfólio) */
  portfolioLine?: string;
}
