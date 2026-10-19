import fs from 'node:fs';
import type { Page } from 'playwright';
import type { Composition } from './composer';
import { parseBidPage, type BidPageInfo } from './parser';
import { bidForm, MAX_MESSAGE_LENGTH } from './selectors';
import type { SendMode } from './types';
import { ask } from './utils';

export interface ProposalDraft {
  bidUrl: string;
  value: number;
  days: number;
  message: string;
}

export interface ProposalOptions {
  mode: SendMode;
  /** Reserva de conexões: não envia se sobrar menos que isso depois do envio */
  minConnectionsLeft: number;
}

/**
 * - sent/skipped: registrados no histórico;
 * - failed: problema só deste projeto, segue para o próximo;
 * - stop: interrompe a execução (sem conexões, envio não confirmado...);
 * - quit: você escolheu sair na revisão.
 */
export type ProposalOutcome =
  | { status: 'sent'; note: string; connectionsLeft: number | null }
  | { status: 'skipped' | 'failed' | 'stop'; note: string }
  | { status: 'quit' };

const RESULT_TIMEOUT_MS = 15_000;

/** Redige a proposta; recebe as regras do formulário (null no dry-run, que não abre o formulário). */
export type ComposeFn = (info: BidPageInfo | null) => Promise<Composition>;

/**
 * Abre o formulário, confere as regras (proposta já enviada, conexões) e só então redige a proposta,
 * para não gastar IA em projeto que não vai receber proposta.
 */
export async function submitProposal(page: Page, bidUrl: string, compose: ComposeFn, options: ProposalOptions): Promise<ProposalOutcome> {
  if (options.mode === 'dry') {
    const composed = await compose(null);
    if ('skip' in composed) return { status: 'skipped', note: composed.skip };
    return checkMessage(composed.message) ?? { status: 'skipped', note: 'dry-run' };
  }

  await page.goto(bidUrl, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/project/bid/')) {
    return { status: 'failed', note: `redirecionado para ${page.url()} (projeto indisponível?)` };
  }

  const info = parseBidPage(await page.content());
  const blocked = checkBidRules(info, options.minConnectionsLeft);
  if (blocked) return blocked;
  console.log(`  Conexões: usa ${info.connectionsRequired ?? '?'}, sobram ${info.connectionsLeftAfter ?? '?'} após o envio`);

  const composed = await compose(info);
  // Ex.: oferta mínima acima da faixa do perfil; não muda de um dia para o outro, então fica no histórico
  if ('skip' in composed) return { status: 'skipped', note: composed.skip };
  const draft: ProposalDraft = { bidUrl, ...composed };
  const invalid = checkMessage(draft.message) ?? checkMinValue(info, draft);
  if (invalid) return invalid;

  const fillError = await fillBidForm(page, draft);

  if (options.mode === 'review' || fillError) {
    if (fillError) console.log(`  ⚠ ${fillError} — corrija no navegador antes de enviar`);
    const answer = await ask('  Revise e envie no navegador. [Enter] enviei · [p] pular · [q] sair: ');
    if (answer === 'q') return { status: 'quit' };
    if (answer === 'p') return { status: 'skipped', note: 'pulado na revisão' };
    return (await isProposalRegistered(page, draft.bidUrl))
      ? { status: 'sent', note: 'enviado manualmente (confirmado)', connectionsLeft: info.connectionsLeftAfter }
      : { status: 'failed', note: 'não encontrei a proposta no projeto; confira no site' };
  }

  return autoSubmit(page, draft, info);
}

function checkMessage(message: string): ProposalOutcome | null {
  return message.length > MAX_MESSAGE_LENGTH
    ? { status: 'failed', note: `texto com ${message.length} caracteres (máx. ${MAX_MESSAGE_LENGTH}); encurte o template` }
    : null;
}

function checkMinValue(info: BidPageInfo, draft: ProposalDraft): ProposalOutcome | null {
  return info.minValue !== null && draft.value < info.minValue
    ? { status: 'failed', note: `oferta R$ ${draft.value} abaixo do mínimo do projeto (R$ ${info.minValue})` }
    : null;
}

function checkBidRules(info: BidPageInfo, minConnectionsLeft: number): ProposalOutcome | null {
  if (info.alreadyProposed) return { status: 'skipped', note: 'você já enviou proposta para este projeto' };
  if (!info.canSubmit) return { status: 'stop', note: 'botão de envio ausente (sem conexões ou formulário mudou)' };
  if (info.connectionsLeftAfter !== null && info.connectionsLeftAfter < minConnectionsLeft) {
    const note = `sobrariam ${info.connectionsLeftAfter} conexões, abaixo da reserva de ${minConnectionsLeft}`;
    // Projeto mais caro que o saldo: outro mais abaixo no ranking pode custar só 1 conexão
    return (info.connectionsRequired ?? 1) > 1 ? { status: 'failed', note } : { status: 'stop', note };
  }
  return null;
}

/**
 * Saldo atual de conexões, lido do formulário de um projeto: "requer N" + "terá M restantes".
 * Devolve null se não houver sessão ou se o formulário não mostrar o bloco de conexões.
 */
export async function readAvailableConnections(page: Page, bidUrl: string): Promise<number | null> {
  const res = await page.context().request.get(bidUrl);
  if (!res.ok() || !res.url().includes('/project/bid/')) return null;
  const { connectionsRequired, connectionsLeftAfter } = parseBidPage(await res.text());
  if (connectionsRequired === null || connectionsLeftAfter === null) return null;
  return connectionsRequired + connectionsLeftAfter;
}

/** Preenche os campos e devolve uma descrição do problema, se houver. */
export async function fillBidForm(page: Page, draft: ProposalDraft): Promise<string | null> {
  // O campo de oferta usa máscara de moeda (jquery.price_format), que só reage à digitação:
  // digitar os centavos "80000" resulta em "800,00" e recalcula a "Oferta final".
  // O site já abre o campo com a oferta mínima ("50,00"), e a máscara bloqueia o Cmd/Ctrl+A no
  // keydown; por isso o campo é zerado com fill(''), que não passa pelo teclado
  const cents = String(Math.round(draft.value * 100));
  const value = page.locator(bidForm.value);
  await value.fill('');
  await value.pressSequentially(cents, { delay: 40 });

  await page.locator(bidForm.days).fill(String(draft.days));
  await page.locator(bidForm.message).fill(draft.message);

  const typed = (await value.inputValue()).replace(/\D/g, '');
  return typed === cents ? null : `oferta ficou "${await value.inputValue()}", esperado R$ ${draft.value}`;
}

async function autoSubmit(page: Page, draft: ProposalDraft, info: BidPageInfo): Promise<ProposalOutcome> {
  await page.locator(bidForm.submit).click();

  let step = await firstVisible(page, { confirm: bidForm.confirmModal, suspicious: bidForm.suspiciousModal });
  if (step === 'confirm') {
    await page.locator(bidForm.confirmCheckbox).check();
    await page.locator(bidForm.confirmContinue).click();
    step = await firstVisible(page, { suspicious: bidForm.suspiciousModal });
  }
  if (step === 'suspicious') {
    // Não aceitamos o aviso automaticamente: o texto pode violar os termos (contato, links, comissão)
    return { status: 'stop', note: 'o site sinalizou o texto como suspeito; revise o template' };
  }

  if (await isProposalRegistered(page, draft.bidUrl)) {
    return { status: 'sent', note: 'enviado automaticamente (confirmado)', connectionsLeft: info.connectionsLeftAfter };
  }

  const errors = (await page.locator(bidForm.errorMessages).allTextContents()).map((t) => t.trim()).filter(Boolean);
  const screenshot = await saveScreenshot(page);
  return { status: 'stop', note: `envio não confirmado${errors.length ? `: ${errors.join('; ')}` : ''} (ver ${screenshot})` };
}

/** Espera o primeiro dos elementos ficar visível; devolve a chave dele ou null no timeout. */
async function firstVisible<K extends string>(page: Page, candidates: Record<K, string>, timeout = 5_000): Promise<K | null> {
  const waits = (Object.entries(candidates) as [K, string][]).map(([key, selector]) =>
    page.locator(selector).waitFor({ state: 'visible', timeout }).then(() => key),
  );
  return Promise.any(waits).catch(() => null);
}

/** Recarrega o formulário por requisição e confere se o site já marca a proposta como enviada. */
async function isProposalRegistered(page: Page, bidUrl: string): Promise<boolean> {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await page.context().request.get(bidUrl);
    if (res.ok() && parseBidPage(await res.text()).alreadyProposed) return true;
    await page.waitForTimeout(2_000);
  }
  return false;
}

async function saveScreenshot(page: Page): Promise<string> {
  fs.mkdirSync('data/screenshots', { recursive: true });
  const file = `data/screenshots/${Date.now()}.png`;
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}
