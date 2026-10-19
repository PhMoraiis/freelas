import { describe, expect, it } from 'vitest';
import { containsTerm, evaluateProject, rankEvaluations } from '../src/filter';
import type { Evaluation, FilterConfig, Profile, Project } from '../src/types';

const now = new Date('2026-10-19T12:00:00Z');

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    title: 'Automação de planilhas',
    url: '',
    bidUrl: '',
    category: 'Desenvolvimento Web',
    level: 'Intermediário',
    publishedAt: new Date('2026-10-19T08:00:00Z'),
    proposals: 5,
    interested: 6,
    description: 'Script em Node.js para baixar relatórios.',
    skills: ['JavaScript'],
    client: { name: 'Cliente', rating: 5, reviews: 3 },
    flags: { urgent: false, featured: false, exclusive: false },
    ...overrides,
  };
}

const filter: FilterConfig = {
  excludeKeywords: ['wordpress'],
  excludeCategories: ['Design'],
  levels: [],
  maxProposals: 30,
  maxAgeHours: 48,
  minClientRating: 4,
  minScore: 3,
};

const proposal = { value: 100, days: 5, template: '' };
const profiles: Profile[] = [
  { name: 'Automação', keywords: ['automacao', 'node.js'], skills: ['javascript'], proposal },
  { name: 'React', keywords: ['react'], proposal },
];

describe('containsTerm', () => {
  it('ignora acentos e caixa', () => expect(containsTerm('AUTOMAÇÃO', 'automacao')).toBe(true));
  it('casa termos com pontuação', () => expect(containsTerm('feito em Node.js', 'node.js')).toBe(true));
  it('não casa pedaço de palavra', () => expect(containsTerm('robótica', 'bot')).toBe(false));
});

describe('evaluateProject', () => {
  it('aprova e escolhe o perfil de maior pontuação', () => {
    const result = evaluateProject(project(), filter, profiles, now);
    expect(result.matched).toBe(true);
    expect(result.profile?.name).toBe('Automação');
    // título (3) + descrição (1) + habilidade (2)
    expect(result.score).toBe(6);
  });

  it('sempre descarta projetos exclusivos', () => {
    const result = evaluateProject(project({ flags: { urgent: false, featured: false, exclusive: true } }), filter, profiles, now);
    expect(result.matched).toBe(false);
    expect(result.reasons).toContain('projeto exclusivo para assinantes');
  });

  it.each([
    ['termo excluído', { description: 'Site em WordPress' }],
    ['termo excluído', { skills: ['JavaScript', 'WordPress'] }],
    ['categoria excluída', { category: 'design' }],
    ['propostas >', { proposals: 31 }],
    ['publicado há', { publishedAt: new Date('2026-10-16T00:00:00Z') }],
    ['nota do cliente', { client: { name: 'C', rating: 3, reviews: 10 } }],
  ])('descarta por %s', (reason, overrides) => {
    const result = evaluateProject(project(overrides as Partial<Project>), filter, profiles, now);
    expect(result.matched).toBe(false);
    expect(result.reasons.join()).toContain(reason);
  });

  it('não pune cliente novo sem avaliações pela nota', () => {
    const result = evaluateProject(project({ client: { name: 'C', rating: 0, reviews: 0 } }), filter, profiles, now);
    expect(result.matched).toBe(true);
  });

  it('reprova quando a pontuação não atinge o mínimo', () => {
    const result = evaluateProject(project({ title: 'Ajuste em site', description: 'Projeto em React', skills: [] }), filter, profiles, now);
    expect(result.matched).toBe(false);
    expect(result.score).toBe(1);
  });
});

describe('rankEvaluations', () => {
  const evaluation = (id: number, matched: boolean, score: number, proposals: number | null, publishedAt: string) =>
    ({ matched, score, project: project({ id, proposals, publishedAt: new Date(publishedAt) }) }) as Evaluation;

  it('ordena aprovados por pontuação, menos propostas e mais recente', () => {
    const ranked = rankEvaluations([
      evaluation(1, false, 9, 1, '2026-10-19'),
      evaluation(2, true, 4, 10, '2026-10-19'),
      evaluation(3, true, 6, 50, '2026-10-18'),
      evaluation(4, true, 4, 5, '2026-10-17'),
      evaluation(5, true, 4, 5, '2026-10-18'),
      evaluation(6, true, 4, null, '2026-10-19'),
    ]);
    expect(ranked.map((e) => e.project.id)).toEqual([3, 5, 4, 2, 6, 1]);
  });
});

describe('perfis com regras próprias', () => {
  const sites: Profile = {
    name: 'Sites', keywords: ['site', 'landing page'], minScore: 3, proposal,
    excludeKeywords: ['sistema', 'login', 'pagamento'],
  };
  const fullstack: Profile = { name: 'Full-stack', keywords: ['sistema', 'react', 'login'], proposal };
  const both = [sites, fullstack];

  it('site institucional passa no perfil de sites com mínimo menor', () => {
    const result = evaluateProject(project({ title: 'Criação de site institucional', description: 'Empresa de contabilidade.', skills: [] }), filter, both, now);
    expect(result).toMatchObject({ matched: true, score: 3, profile: { name: 'Sites' } });
  });

  it('termo excluído do perfil zera só aquele perfil', () => {
    const result = evaluateProject(project({ title: 'Site com login de clientes', description: 'Sistema em React.', skills: [] }), filter, both, now);
    expect(result.profile?.name).toBe('Full-stack');
  });

  it('prefere o perfil que atinge o próprio mínimo, mesmo com menos pontos', () => {
    // Com mínimo global 5, Front soma 4 (react no título + responsivo na descrição) e não passa;
    // Sites soma 3 e exige só 3
    const front: Profile = { name: 'Front', keywords: ['react', 'responsivo'], proposal };
    const strict = { ...filter, minScore: 5 };
    const result = evaluateProject(project({ title: 'Landing page em React', description: 'Precisa ser responsivo.', skills: [] }), strict, [sites, front], now);
    expect(result).toMatchObject({ matched: true, profile: { name: 'Sites' } });
  });
});
