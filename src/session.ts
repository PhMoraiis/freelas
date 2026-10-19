import { chromium, type BrowserContext, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { BASE_URL } from './parser';
import type { AppConfig } from './types';
import { notify } from './utils';

/** Perfil persistente do navegador: guarda os cookies do login manual entre execuções. */
const USER_DATA_DIR = path.resolve('.auth/browser-profile');

export interface Session {
  context: BrowserContext;
  page: Page;
}

export async function openSession(config: AppConfig, overrides: { headless?: boolean } = {}): Promise<Session> {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: overrides.headless ?? config.browser.headless,
    channel: config.browser.channel,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: null,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/**
 * Sem login, qualquer /project/bid/... redireciona (302) para /login ou /register.
 * A requisição compartilha os cookies do contexto, então reflete a sessão real.
 */
export async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const res = await context.request.get(`${BASE_URL}/project/bid/session-probe-1`, { maxRedirects: 0 });
  const location = res.headers()['location'] ?? '';
  return !(res.status() >= 300 && res.status() < 400 && /\/(login|register)/.test(location));
}

/**
 * O captcha do login (Cloudflare Turnstile) reprova navegadores controlados por automação,
 * mesmo com uma pessoa clicando. Por isso o login acontece no mesmo Chromium aberto como
 * processo comum, sem o Playwright conectado; o robô só reaproveita o perfil depois.
 */
export async function manualLogin(
  config: AppConfig,
  { timeoutMs, reason }: { timeoutMs?: number; reason?: string } = {},
): Promise<void> {
  if (await checkSavedSession(config)) {
    console.log('✔ Sessão já está ativa.');
    return;
  }

  if (reason) {
    console.log(`⚠ ${reason}`);
    notify(`${reason} Faça login na janela que abriu e feche-a para continuar.`);
  }
  const browser = spawn(
    chromium.executablePath(),
    [
      `--user-data-dir=${USER_DATA_DIR}`,
      // Mesmo armazenamento de cookies que o Playwright usa, para ele conseguir ler a sessão depois
      '--password-store=basic',
      '--use-mock-keychain',
      '--no-first-run',
      '--no-default-browser-check',
      `${BASE_URL}/login`,
    ],
    { stdio: 'ignore' },
  );
  console.log('→ Faça o login no navegador que abriu e FECHE a janela ao terminar.');

  // Sem resposta no prazo (ex.: ninguém no computador), fecha a janela: o próximo gatilho tenta de novo
  const timer = timeoutMs
    ? setTimeout(() => {
        console.log(`  Ninguém fez login em ${Math.round(timeoutMs / 60_000)} min; fechando a janela.`);
        browser.kill('SIGTERM');
      }, timeoutMs)
    : undefined;
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    browser.once('error', reject);
    browser.once('exit', resolve);
  }).finally(() => clearTimeout(timer));
  if (exitCode !== 0) console.log(`  (navegador encerrou com código ${exitCode})`);

  if (!(await checkSavedSession(config))) {
    throw new Error('Login não encontrado no perfil. Confira se entrou na conta antes de fechar o navegador.');
  }
  console.log('✔ Login detectado. Sessão salva em .auth/');
}

async function checkSavedSession(config: AppConfig): Promise<boolean> {
  const { context } = await openSession(config, { headless: true });
  try {
    return await isLoggedIn(context);
  } finally {
    await context.close();
  }
}

export async function requireLogin(session: Session): Promise<void> {
  if (!(await isLoggedIn(session.context))) {
    throw new Error('Sessão expirada ou inexistente. Rode "npm run login" primeiro.');
  }
}
