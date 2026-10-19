import type { Evaluation } from './types';

/** Substitui {{variavel}} no texto da proposta; variáveis desconhecidas ficam intactas. */
export function renderProposal(template: string, evaluation: Evaluation): string {
  const { project, matchedTerms } = evaluation;
  const vars: Record<string, string> = {
    title: project.title,
    clientName: project.client.name.split(' ')[0] ?? '',
    skills: project.skills.join(', '),
    matched: matchedTerms.join(', '),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => vars[key] ?? whole).trim();
}
