import { expect, it } from 'vitest';
import { renderProposal } from '../src/template';
import type { Evaluation } from '../src/types';

it('substitui variáveis e mantém as desconhecidas', () => {
  const evaluation = {
    project: { title: 'Bot de WhatsApp', skills: ['Node.js', 'API'], client: { name: 'Maria Souza' } },
    matchedTerms: ['bot', 'node.js'],
  } as unknown as Evaluation;

  const text = renderProposal('\n  Olá, {{clientName}}! Sobre "{{title}}" ({{matched}}) {{outra}}\n', evaluation);
  expect(text).toBe('Olá, Maria! Sobre "Bot de WhatsApp" (bot, node.js) {{outra}}');
});
