import { parseArgs } from 'node:util';
import config from '../config';
import { AiFatalError, createClassifier, reviewWithAi, VerdictCache, type SourcedGenerator } from './ai';
import { createComposer } from './composer';
import { createGenerator } from './providers';
import { evaluateProject, rankEvaluations } from './filter';
import { readAvailableConnections, submitProposal } from './proposal';
import { scanProjects } from './scraper';
import { isLoggedIn, manualLogin, openSession, requireLogin, type Session } from './session';
import { History, saveJson } from './store';
import type { Evaluation, SendMode } from './types';
import { randomDelay } from './utils';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    ai: { type: 'boolean' },
    pages: { type: 'string' },
    mode: { type: 'string' },
    limit: { type: 'string' },
    all: { type: 'boolean', default: false },
    headless: { type: 'boolean' },
  },
});

const [command, arg] = positionals;

async function withSession(fn: (session: Session) => Promise<void>): Promise<void> {
  const session = await openSession(config, { headless: values.headless });
  try {
    await fn(session);
  } finally {
    await session.context.close();
  }
}

/** Cadeia de provedores, criada uma vez por execução; null com a IA desligada ou sem nenhuma chave. */
function createAi(): SourcedGenerator | null {
  if (!(values.ai ?? config.ai.enabled)) return null;
  const chain = config.ai.providers.map((p) => `${p.provider} · ${p.model}`).join(' → ');
  console.log(`IA: ${chain}`);
  try {
    return createGenerator(config.ai);
  } catch (error) {
    if (!(error instanceof AiFatalError)) throw error;
    console.log(`  ⚠ IA indisponível (${error.message}). Seguindo sem IA.`);
    console.log('    Confira GEMINI_API_KEY e GROQ_API_KEY no ambiente, ou rode com --no-ai.');
    return null;
  }
}

async function scanAndFilter(session: Session, generate: SourcedGenerator | null): Promise<Evaluation[]> {
  const option = values.pages ?? config.scan.pages;
  const pages = option === 'all' ? 'all' : Number(option);
  if (pages !== 'all' && !(pages > 0)) throw new Error(`--pages inválido: ${option}`);
  console.log(`Varrendo ${pages === 'all' ? 'todas as páginas' : `${pages} página(s)`}...`);
  const projects = await scanProjects(session.page, config.scan.categories, pages);
  const byKeywords = projects.map((p) => evaluateProject(p, config.filter, config.profiles));
  const evaluations = rankEvaluations(generate ? await withAi(byKeywords, generate) : byKeywords);
  saveJson('last-scan.json', evaluations.map(({ project, ...rest }) => ({ ...rest, profile: rest.profile?.name, project })));
  return evaluations;
}

/** Passa os projetos pela triagem da IA; sem credencial, segue só com as palavras-chave. */
async function withAi(evaluations: Evaluation[], generate: SourcedGenerator): Promise<Evaluation[]> {
  const candidates = evaluations.filter((e) => !e.hardRejected).length;
  console.log(`IA: avaliando ${candidates} projeto(s) que passaram nas regras eliminatórias...`);
  try {
    const cache = new VerdictCache(VerdictCache.versionFor(config.ai, config.profiles));
    const classify = createClassifier(generate, config.ai, config.profiles);
    const result = await reviewWithAi(evaluations, classify, cache, config.ai, config.profiles, (done, total) => {
      if (done % 10 === 0 || done === total) console.log(`  IA: ${done}/${total}`);
    });
    console.log(
      `  IA: ${result.called} nova(s), ${result.cached} do cache` +
        (result.failed ? `, ${result.failed} sem resposta` : '') +
        (result.skipped ? `, ${result.skipped} acima do teto (maxCallsPerRun)` : ''),
    );
    if (result.interrupted) console.log(`  ⚠ IA interrompida: ${result.interrupted}`);
    if (result.pending) console.log(`  ${result.pending} projeto(s) sem nota ficam fora do ranking e voltam na próxima execução.`);
    return result.evaluations;
  } catch (error) {
    if (!(error instanceof AiFatalError)) throw error;
    console.log(`  ⚠ IA indisponível (${error.message}). Seguindo só com as palavras-chave.`);
    console.log('    Confira GEMINI_API_KEY e GROQ_API_KEY no ambiente, ou rode com --no-ai.');
    return evaluations;
  }
}

function printEvaluations(evaluations: Evaluation[], showAll: boolean, summary = true): void {
  const rows = evaluations
    .filter((e) => showAll || e.matched)
    .map((e) => ({
      ok: e.matched ? '✔' : '✘',
      pts: e.score,
      id: e.project.id,
      titulo: e.project.title.slice(0, 55),
      propostas: e.project.proposals,
      motivo: e.reasons.join('; ').slice(0, 100),
    }));
  const matched = evaluations.filter((e) => e.matched).length;
  if (rows.length) console.table(rows);
  if (summary) console.log(`${matched} de ${evaluations.length} projetos passaram no filtro.${showAll ? '' : ' Use --all para ver os descartados.'}`);
}

function sendMode(): SendMode {
  const mode = (values.mode ?? config.send.mode) as SendMode;
  if (!['dry', 'review', 'auto'].includes(mode)) throw new Error(`Modo inválido: ${mode}`);
  return mode;
}

/** Tempo que a janela de login aberta automaticamente espera antes de desistir. */
const AUTO_LOGIN_TIMEOUT_MS = 60 * 60_000;

async function send(session: Session): Promise<void> {
  const mode = sendMode();
  const limit = values.limit ? Number(values.limit) : config.send.maxPerRun ?? Number.POSITIVE_INFINITY;
  const reserve = config.send.minConnectionsLeft;

  if (mode !== 'dry') await requireLogin(session);

  const generate = createAi();
  const compose = createComposer(config.ai.composeProposals ? generate : null, config.ai);
  const history = new History();
  const ranking = (await scanAndFilter(session, generate)).filter((e) => e.matched && !history.has(e.project.id));
  if (ranking.length === 0) {
    console.log('\nNenhum projeto novo passou no filtro.');
    return;
  }

  // O saldo aparece no formulário de qualquer projeto; tenta os primeiros do ranking
  let available: number | null = null;
  if (await isLoggedIn(session.context)) {
    for (const e of ranking.slice(0, 3)) {
      available = await readAvailableConnections(session.page, e.project.bidUrl);
      if (available !== null) break;
    }
  }
  // Estimativa de 1 conexão por proposta; o formulário de cada projeto confere o custo real
  const budget = Math.min(limit, available === null ? Number.POSITIVE_INFINITY : Math.max(available - reserve, 0));

  console.log(`\nRanking: ${ranking.length} projeto(s) aprovados (modo ${mode}).`);
  printEvaluations(ranking.slice(0, 15), false, false);
  if (ranking.length > 15) console.log(`  ... e mais ${ranking.length - 15} (lista completa em data/last-scan.json)`);
  console.log(
    available === null
      ? 'Conexões: saldo não identificado (faça login); o limite será conferido em cada formulário.'
      : `Conexões: ${available} disponíveis, reserva de ${reserve} → até ${budget} proposta(s).`,
  );

  let sent = 0;
  for (const [i, evaluation] of ranking.entries()) {
    if (sent >= budget) {
      console.log('\n■ Limite de conexões atingido.');
      break;
    }
    const { project } = evaluation;
    console.log(`\n[#${i + 1} do ranking · ${evaluation.score} pts] ${project.title}\n  ${project.url}\n  ${evaluation.reasons[0]}`);

    const outcome = await submitProposal(
      session.page,
      project.bidUrl,
      async (info) => {
        const composed = await compose(evaluation, info?.minValue ?? null);
        if (!('skip' in composed)) {
          const author = composed.source === 'modelo' ? 'modelo do perfil' : `IA ${composed.source}`;
          console.log(`  R$ ${composed.value} · ${composed.days} dias · texto: ${author}\n${composed.message.replace(/^/gm, '  │ ')}`);
        }
        return composed;
      },
      { mode, minConnectionsLeft: reserve },
    );
    if (outcome.status === 'quit') break;
    console.log(`  → ${outcome.status}: ${outcome.note}`);
    // Falhas não entram no histórico: o projeto volta na próxima execução, e o
    // campo "tem-proposta" do site impede proposta duplicada
    if (outcome.status === 'sent' || (outcome.status === 'skipped' && mode !== 'dry')) {
      history.record(project.id, { status: outcome.status, title: project.title, note: outcome.note });
    }
    // No dry-run, "enviar" é só mostrar o rascunho, e ele conta para o limite do mesmo jeito
    if (outcome.status === 'sent' || outcome.note === 'dry-run') sent++;
    if (outcome.status === 'sent' && outcome.connectionsLeft !== null) {
      console.log(`  Conexões restantes: ${outcome.connectionsLeft}`);
    }
    if (outcome.status === 'stop') {
      console.log('■ Execução interrompida.');
      break;
    }

    if (mode === 'auto' && outcome.status === 'sent' && sent < budget) {
      await randomDelay(config.send.minDelayMs, config.send.maxDelayMs);
    }
  }
  console.log(`\nResumo: ${sent} proposta(s) ${mode === 'dry' ? 'simuladas' : 'enviadas'}.`);
}

const commands: Record<string, () => Promise<void>> = {
  login: () => manualLogin(config),
  scan: () => withSession(async (s) => printEvaluations(await scanAndFilter(s, createAi()), values.all)),
  send: async () => {
    // A sessão é conferida antes de abrir o navegador do robô: a janela de login usa o mesmo
    // perfil, e o Chromium não deixa dois processos abrirem o mesmo perfil ao mesmo tempo
    if (sendMode() !== 'dry') {
      await manualLogin(config, { timeoutMs: AUTO_LOGIN_TIMEOUT_MS, reason: 'Login do 99freelas expirado.' });
    }
    await withSession(send);
  },
  inspect: () =>
    withSession(async ({ page }) => {
      if (!arg) throw new Error('Uso: npm run inspect -- <url do formulário /project/bid/...>');
      await page.goto(arg);
      console.log('Playwright Inspector aberto: use "Pick locator" para descobrir os seletores e feche ao terminar.');
      await page.pause();
    }),
};

const run = commands[command ?? ''];
if (!run) {
  console.log('Comandos: login | scan [--pages N|all] [--all] | send [--mode dry|review|auto] [--limit N] [--pages N|all] | inspect <url>\nOpções: --headless (sem janela) · --no-ai / --ai (liga ou desliga a triagem por IA)');
  process.exit(1);
}
run().catch((error) => {
  console.error(`✘ ${(error as Error).message}`);
  process.exit(1);
});
