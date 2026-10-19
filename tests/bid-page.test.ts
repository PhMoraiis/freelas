import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBidPage, parseBrl } from '../src/parser';

const html = fs.readFileSync(new URL('./fixtures/bid-form.html', import.meta.url), 'utf8');

describe('parseBidPage', () => {
  it('lê conexões, valor mínimo e se dá para enviar', () => {
    expect(parseBidPage(html)).toEqual({
      alreadyProposed: false,
      minValue: 1250.5,
      connectionsRequired: 1,
      connectionsLeftAfter: 15,
      canSubmit: true,
    });
  });

  it('detecta proposta já enviada', () => {
    const sent = html.replace('class="tem-proposta" type="hidden" value="0"', 'class="tem-proposta" type="hidden" value="1"');
    expect(parseBidPage(sent).alreadyProposed).toBe(true);
  });

  it('sem botão de envio nem bloco de conexões', () => {
    const noForm = html.replace(/<div class="project-item-info">[\s\S]*<\/button><\/div>/, '');
    expect(parseBidPage(noForm)).toMatchObject({ canSubmit: false, connectionsLeftAfter: null });
  });
});

it('parseBrl converte moeda brasileira', () => {
  expect(parseBrl('R$ 50,00')).toBe(50);
  expect(parseBrl('R$ 6.875,00')).toBe(6875);
});
