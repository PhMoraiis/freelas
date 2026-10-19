import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import readline from 'node:readline/promises';

/** Pausa aleatória para não disparar requisições em ritmo de robô. */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toLowerCase();
  } finally {
    rl.close();
  }
}

/** Notificação do macOS; em outro sistema, ou se falhar, não faz nada. */
export function notify(message: string): void {
  if (process.platform !== 'darwin') return;
  const script = `display notification ${JSON.stringify(message)} with title "freelas"`;
  execFile('osascript', ['-e', script], () => {});
}
