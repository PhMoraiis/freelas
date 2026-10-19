import type { Page } from 'playwright';
import { BASE_URL, parseLastPage, parseProjectList } from './parser';
import type { Project } from './types';
import { randomDelay } from './utils';

export function listUrl(category: string, page: number): string {
  const params = new URLSearchParams();
  if (category) params.set('categoria', category);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `${BASE_URL}/projects${query ? `?${query}` : ''}`;
}

/**
 * Percorre as páginas da listagem de cada categoria e devolve os projetos sem duplicatas.
 * Com pages = 'all', vai até a última página indicada na paginação.
 */
export async function scanProjects(page: Page, categories: string[], pages: number | 'all'): Promise<Project[]> {
  const byId = new Map<number, Project>();

  for (const category of categories.length ? categories : ['']) {
    let lastPage = pages === 'all' ? Number.POSITIVE_INFINITY : pages;

    for (let n = 1; n <= lastPage; n++) {
      await page.goto(listUrl(category, n), { waitUntil: 'domcontentloaded' });
      // Página além do fim não tem a lista, só o aviso de "nenhum projeto"; a contagem da
      // paginação pode mudar durante a varredura, quando projetos entram ou saem
      const emptyPage = page.getByText('nenhum projeto que corresponde', { exact: false });
      await page.locator('ul.result-list').or(emptyPage).first().waitFor({ timeout: 15_000 });

      const html = await page.content();
      if (n === 1 && pages === 'all') lastPage = parseLastPage(html) ?? 1;

      const projects = parseProjectList(html);
      const fresh = projects.filter((p) => !byId.has(p.id));
      console.log(`  ${category || 'todas'} p.${n}/${lastPage}: ${projects.length} projetos`);
      // Página vazia ou repetida: a listagem acabou antes do previsto
      if (fresh.length === 0) break;
      for (const p of fresh) byId.set(p.id, p);

      await randomDelay(1_500, 3_500);
    }
  }
  return [...byId.values()];
}
