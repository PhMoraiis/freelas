import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLastPage, parseProjectList } from '../src/parser';

const html = fs.readFileSync(new URL('./fixtures/projects.html', import.meta.url), 'utf8');

describe('parseProjectList', () => {
  const [first, second] = parseProjectList(html);

  it('extrai os campos principais do projeto', () => {
    expect(first).toMatchObject({
      id: 1001,
      title: 'Robô de automação com Playwright',
      url: 'https://www.99freelas.com.br/project/robo-de-automacao-1001',
      bidUrl: 'https://www.99freelas.com.br/project/bid/robo-de-automacao-1001',
      category: 'Desenvolvimento Web',
      level: 'Especialista',
      proposals: 12,
      interested: 15,
      skills: ['JavaScript', 'Node.js'],
      client: { name: 'Cliente A', rating: 4.5, reviews: 7 },
      flags: { urgent: true, featured: true, exclusive: false },
    });
    expect(first.publishedAt).toEqual(new Date(1792000000000));
  });

  it('preserva quebras de linha e decodifica entidades da descrição', () => {
    expect(first.description).toBe('Preciso automatizar o envio de relatórios.\n\nUsar Node.js.');
  });

  it('identifica projeto exclusivo e cliente sem avaliações', () => {
    expect(second.flags.exclusive).toBe(true);
    expect(second.client).toEqual({ name: 'Cliente B', rating: null, reviews: 0 });
  });
});

describe('parseLastPage', () => {
  it('pega o maior data-page da paginação', () => {
    const html = `<div class='pagination-component'>
      <span class='page-item selected' data-page="1">1</span><span class='page-item' data-page="2">2</span>
      <span>...</span><span class='page-item go-to-last-page' data-page="22">Última</span></div>`;
    expect(parseLastPage(html)).toBe(22);
  });

  it('sem paginação devolve null', () => expect(parseLastPage('<ul class="result-list"></ul>')).toBeNull());
});
