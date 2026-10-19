import type { Evaluation, FilterConfig, Profile, Project } from './types';

const WEIGHT = { title: 3, skill: 2, description: 1 };

/** Remove acentos e caixa para comparar "Automação" com "automacao". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Procura o termo como palavra inteira, aceitando termos como "node.js" ou "c#". */
export function containsTerm(text: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(normalize(text));
}

export function evaluateProject(project: Project, filter: FilterConfig, profiles: Profile[], now = new Date()): Evaluation {
  const rejection = hardRejections(project, filter, now);
  if (rejection.length > 0) {
    return { project, matched: false, hardRejected: true, score: 0, keywordScore: 0, matchedTerms: [], reasons: rejection };
  }

  // Cada perfil tem o próprio mínimo: vence o de maior pontuação entre os que atingem o seu mínimo
  const scored = profiles.map((profile) => ({ profile, ...scoreProfile(project, profile) }));
  const passes = (s: (typeof scored)[number]) => s.score > 0 && s.score >= (s.profile.minScore ?? filter.minScore);
  const pool = scored.some(passes) ? scored.filter(passes) : scored;
  const best = pool.reduce<(typeof scored)[number] | undefined>((a, b) => (!a || b.score > a.score ? b : a), undefined);

  const matched = best !== undefined && passes(best);
  const score = best?.score ?? 0;
  const terms = best?.matchedTerms ?? [];
  const reasons = matched
    ? [`perfil "${best!.profile.name}" (${score} pts): ${terms.join(', ')}`]
    : [`pontuação ${score} < ${best?.profile.minScore ?? filter.minScore}${terms.length ? ` (${terms.join(', ')})` : ''}`];

  return {
    project,
    matched,
    hardRejected: false,
    score,
    keywordScore: score,
    profile: score > 0 ? best?.profile : undefined,
    matchedTerms: terms,
    reasons,
  };
}

/**
 * Ordem de envio: aprovados primeiro, maior pontuação; no empate, menos propostas
 * concorrentes e depois o anúncio mais recente. Com a IA ligada, os avaliados por ela vêm
 * antes dos que ficaram só com palavras-chave, porque as duas escalas não são comparáveis.
 */
export function rankEvaluations(evaluations: Evaluation[]): Evaluation[] {
  const proposals = (e: Evaluation) => e.project.proposals ?? Number.POSITIVE_INFINITY;
  const published = (e: Evaluation) => e.project.publishedAt?.getTime() ?? 0;
  return [...evaluations].sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
      Number(b.ai !== undefined) - Number(a.ai !== undefined) ||
      b.score - a.score ||
      proposals(a) - proposals(b) ||
      published(b) - published(a),
  );
}

function hardRejections(p: Project, f: FilterConfig, now: Date): string[] {
  const reasons: string[] = [];
  // As tags de habilidade entram na exclusão: um projeto marcado com "PHP" pede PHP mesmo que o texto não diga
  const text = `${p.title}\n${p.description}\n${p.skills.join('\n')}`;

  // Regra fixa: projetos exclusivos só aceitam propostas de assinantes pagos
  if (p.flags.exclusive) reasons.push('projeto exclusivo para assinantes');

  const excluded = f.excludeKeywords.filter((k) => containsTerm(text, k));
  if (excluded.length) reasons.push(`termo excluído: ${excluded.join(', ')}`);

  if (f.excludeCategories.some((c) => normalize(c) === normalize(p.category))) {
    reasons.push(`categoria excluída: ${p.category}`);
  }
  if (f.levels.length && !f.levels.some((l) => normalize(l) === normalize(p.level))) {
    reasons.push(`nível ${p.level || '?'} fora do aceito`);
  }
  if (f.maxProposals !== undefined && p.proposals !== null && p.proposals > f.maxProposals) {
    reasons.push(`${p.proposals} propostas > ${f.maxProposals}`);
  }
  if (f.maxAgeHours !== undefined && p.publishedAt) {
    const ageHours = (now.getTime() - p.publishedAt.getTime()) / 3_600_000;
    if (ageHours > f.maxAgeHours) reasons.push(`publicado há ${Math.round(ageHours)}h > ${f.maxAgeHours}h`);
  }
  if (f.minClientReviews !== undefined && p.client.reviews < f.minClientReviews) {
    reasons.push(`cliente com ${p.client.reviews} avaliações < ${f.minClientReviews}`);
  }
  // Cliente sem avaliações não tem nota; quem quiser barrá-lo usa minClientReviews
  if (f.minClientRating !== undefined && p.client.rating !== null && p.client.reviews > 0 && p.client.rating < f.minClientRating) {
    reasons.push(`nota do cliente ${p.client.rating} < ${f.minClientRating}`);
  }
  return reasons;
}

function scoreProfile(p: Project, profile: Profile): { score: number; matchedTerms: string[] } {
  const text = `${p.title}\n${p.description}\n${p.skills.join('\n')}`;
  if (profile.excludeKeywords?.some((k) => containsTerm(text, k))) return { score: 0, matchedTerms: [] };

  let score = 0;
  const matchedTerms = new Set<string>();

  for (const keyword of profile.keywords) {
    if (containsTerm(p.title, keyword)) {
      score += WEIGHT.title;
      matchedTerms.add(keyword);
    } else if (containsTerm(p.description, keyword)) {
      score += WEIGHT.description;
      matchedTerms.add(keyword);
    }
  }

  const projectSkills = p.skills.map(normalize);
  for (const skill of profile.skills ?? []) {
    if (projectSkills.includes(normalize(skill))) {
      score += WEIGHT.skill;
      matchedTerms.add(skill);
    }
  }

  return { score, matchedTerms: [...matchedTerms] };
}
