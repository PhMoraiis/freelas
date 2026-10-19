import { describe, expect, it } from 'vitest';
import { AiFatalError, type SourcedGenerator } from '../src/ai';
import { createComposer, fitToRanges, toPlainText, withPortfolioLine } from '../src/composer';
import type { AiConfig, Evaluation, Profile } from '../src/types';

const profile: Profile = {
  name: 'Sites',
  keywords: ['site'],
  proposal: { value: 800, days: 7, valueRange: [500, 1500], daysRange: [5, 15], template: 'Olá, {{clientName}}! Sobre "{{title}}".' },
};
const ai: AiConfig = {
  enabled: true, providers: [], minFit: 7, concurrency: 1, maxCallsPerRun: 10,
  freelancer: 'Faz sites simples em Next.js.', composeProposals: true,
};
const evaluation = {
  matched: true, hardRejected: false, score: 9, keywordScore: 3, matchedTerms: ['site'], reasons: [], profile,
  ai: { fit: 9, profile: 'Sites', kind: 'site_simples', complexity: 'baixa', reason: 'ok', redFlags: [] },
  project: {
    id: 1, title: 'Site para contabilidade', description: '5 páginas e formulário.', url: '', bidUrl: '', category: 'Web',
    level: '', publishedAt: null, proposals: 10, interested: 10, skills: [], client: { name: 'Ana Souza', rating: null, reviews: 0 },
    flags: { urgent: false, featured: false, exclusive: false },
  },
} as Evaluation;

const generator = (data: unknown, source = 'groq', seen: any[] = []): SourcedGenerator =>
  (async (request: any) => (seen.push(request), { data, source })) as SourcedGenerator;

describe('fitToRanges', () => {
  it('encaixa valor (em degraus de R$ 50) e prazo nas faixas', () => {
    expect(fitToRanges(733, 3.4, [500, 1500], [5, 15], null)).toEqual({ value: 750, days: 5 });
    expect(fitToRanges(9000, 40, [500, 1500], [5, 15], null)).toEqual({ value: 1500, days: 15 });
    expect(fitToRanges(100, 10, [500, 1500], [5, 15], null)).toEqual({ value: 500, days: 10 });
  });

  it('respeita a oferta mínima do projeto e desiste se ela passar do teto', () => {
    expect(fitToRanges(600, 7, [500, 1500], [5, 15], 900)).toEqual({ value: 900, days: 7 });
    expect(fitToRanges(600, 7, [500, 1500], [5, 15], 2000)).toMatchObject({ skip: expect.stringContaining('acima do teto') });
  });
});

describe('createComposer', () => {
  it('usa o texto da IA e encaixa valor e prazo nas faixas', async () => {
    const seen: any[] = [];
    const compose = createComposer(generator({ message: '  Olá, Ana! Proposta.  ', value: 2400, days: 9, rationale: 'r' }, 'groq', seen), ai);
    expect(await compose(evaluation, null)).toEqual({ message: 'Olá, Ana! Proposta.', value: 1500, days: 9, source: 'groq' });

    const [request] = seen;
    expect(request.name).toBe('proposta');
    expect(request.system).toContain('Faz sites simples em Next.js.');
    expect(request.user).toContain('Faixa de valor: R$ 500 a R$ 1500');
    expect(request.user).toContain('Primeiro nome do cliente: Ana');
    expect(request.system).toContain('Não escreva valor nem prazo no texto');
    // O modelo do perfil vai renderizado, como referência de fatos e tom
    expect(request.user).toContain('Olá, Ana! Sobre "Site para contabilidade".');
  });

  it('informa a oferta mínima à IA e não propõe abaixo dela', async () => {
    const seen: any[] = [];
    const compose = createComposer(generator({ message: 'Texto', value: 500, days: 7, rationale: 'r' }, 'groq', seen), ai);
    expect(await compose(evaluation, 700)).toMatchObject({ value: 700 });
    expect(seen[0].user).toContain('oferta mínima do projeto: R$ 700');
  });

  it('sem IA, com erro ou com texto vazio/longo demais, usa o modelo e o valor fixo do perfil', async () => {
    const fallback = { message: 'Olá, Ana! Sobre "Site para contabilidade".', value: 800, days: 7, source: 'modelo' };
    expect(await createComposer(null, ai)(evaluation, null)).toEqual(fallback);

    const broken = (async () => { throw new AiFatalError('cota'); }) as SourcedGenerator;
    expect(await createComposer(broken, ai)(evaluation, null)).toEqual(fallback);

    const tooLong = generator({ message: 'x'.repeat(3001), value: 900, days: 7, rationale: 'r' });
    expect(await createComposer(tooLong, ai)(evaluation, null)).toEqual(fallback);
  });
});

describe('toPlainText', () => {
  it('remove negrito e títulos de Markdown', () => {
    expect(toPlainText('## Etapas\n1. **Layout** no Figma\n__fim__')).toBe('Etapas\n1. Layout no Figma\nfim');
  });
});

describe('withPortfolioLine', () => {
  const ai = 'Olá, Ana!\n\nFaço o layout no Figma.\n\nMeu portfólio, cheio de redesigns, está em exemplo.com.\n\nQual é o prazo ideal?';

  it('troca o que a IA disse do portfólio pela frase fixa, antes da pergunta final', () => {
    expect(withPortfolioLine(ai, 'Projetos no meu portfólio: exemplo.com')).toBe(
      'Olá, Ana!\n\nFaço o layout no Figma.\n\nProjetos no meu portfólio: exemplo.com\n\nQual é o prazo ideal?',
    );
  });

  it('sem frase configurada, só remove a parte da IA', () => {
    expect(withPortfolioLine(ai)).toBe('Olá, Ana!\n\nFaço o layout no Figma.\n\nQual é o prazo ideal?');
  });
});
