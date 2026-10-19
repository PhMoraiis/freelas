import { parse, type HTMLElement } from 'node-html-parser';
import type { Project } from './types';

export const BASE_URL = 'https://www.99freelas.com.br';

/** Converte o HTML da listagem /projects em objetos Project. */
export function parseProjectList(html: string): Project[] {
  const root = parse(html);
  return root.querySelectorAll('li.result-item').map(parseItem).filter((p): p is Project => p !== null);
}

function parseItem(li: HTMLElement): Project | null {
  const id = Number(li.getAttribute('data-id'));
  const link = li.querySelector('h1.title a');
  if (!id || !link) return null;

  const href = link.getAttribute('href') ?? '';
  const path = href.split('?')[0];
  const slug = path.replace(/^\/project\//, '');

  const infoEl = li.querySelector('.information');
  const info = infoEl ? clean(infoEl.text) : '';
  // "Categoria | Nível | Publicado: ... | Tempo restante: ... | Propostas: N | Interessados: N"
  const [category = '', level = ''] = info.split('|').map((s) => s.trim());

  const published = infoEl?.querySelector('.datetime')?.getAttribute('cp-datetime');
  const flagAlts = li.querySelectorAll('.flags img').map((img) => (img.getAttribute('alt') ?? '').toLowerCase());

  const clientEl = li.querySelector('.client');
  const ratingAttr = clientEl?.querySelector('.avaliacoes-star')?.getAttribute('data-score');
  const reviewsMatch = clientEl?.querySelector('.avaliacoes-text')?.text.match(/(\d+)/);

  return {
    id,
    title: clean(link.text),
    url: BASE_URL + path,
    bidUrl: `${BASE_URL}/project/bid/${slug}`,
    category,
    level,
    publishedAt: published ? new Date(Number(published)) : null,
    proposals: matchNumber(info, 'Propostas'),
    interested: matchNumber(info, 'Interessados'),
    description: descriptionText(li.querySelector('.description')),
    skills: li.querySelectorAll('.habilidade').map((a) => clean(a.text)),
    client: {
      name: clean(clientEl?.querySelector('a')?.text ?? ''),
      rating: ratingAttr ? Number(ratingAttr) : null,
      reviews: reviewsMatch ? Number(reviewsMatch[1]) : 0,
    },
    flags: {
      urgent: flagAlts.some((a) => a.includes('urgente')),
      featured: flagAlts.some((a) => a.includes('destaque')),
      exclusive: flagAlts.some((a) => a.includes('exclusivo')),
    },
  };
}

/** Maior número da paginação ("Última" aponta para data-page da última página). */
export function parseLastPage(html: string): number | null {
  const pages = parse(html)
    .querySelectorAll('.pagination-component .page-item[data-page]')
    .map((el) => Number(el.getAttribute('data-page')))
    .filter((n) => Number.isFinite(n));
  return pages.length ? Math.max(...pages) : null;
}

export interface BidPageInfo {
  /** O site marca `input.tem-proposta` com 1 quando você já enviou proposta ao projeto */
  alreadyProposed: boolean;
  minValue: number | null;
  connectionsRequired: number | null;
  /** Conexões que sobram depois deste envio ("Após enviar esta proposta, você terá N conexões restantes") */
  connectionsLeftAfter: number | null;
  canSubmit: boolean;
}

/** Extrai do formulário /project/bid/... as regras que impactam o envio. */
export function parseBidPage(html: string): BidPageInfo {
  const root = parse(html);
  const connections = clean(root.querySelector('.project-item-info')?.text ?? '');
  const minValue = root.querySelector('.valor-minimo')?.text;

  return {
    alreadyProposed: root.querySelector('input.tem-proposta')?.getAttribute('value') === '1',
    minValue: minValue ? parseBrl(minValue) : null,
    connectionsRequired: matchNumber(connections, 'requer'),
    connectionsLeftAfter: matchNumber(connections, 'terá'),
    canSubmit: root.querySelector('#btnConcluirEnvioProposta') !== null,
  };
}

/** "R$ 1.234,56" → 1234.56 */
export function parseBrl(text: string): number | null {
  const digits = text.replace(/[^\d,]/g, '').replace(',', '.');
  return digits ? Number(digits) : null;
}

function descriptionText(el: HTMLElement | null): string {
  if (!el) return '';
  const withBreaks = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  return parse(withBreaks)
    .text.split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function matchNumber(text: string, label: string): number | null {
  const m = text.match(new RegExp(`${label}:?\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
