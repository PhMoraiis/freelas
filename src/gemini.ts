import { ApiError, GoogleGenAI } from '@google/genai';
import { setTimeout as sleep } from 'node:timers/promises';
import { AiFatalError, toJsonSchema, type Generator } from './ai';

/**
 * Esperas entre tentativas quando o Gemini devolve 429 (limite por minuto do plano gratuito) ou
 * 5xx (sobrecarga temporária, comum no plano gratuito: "model is experiencing high demand").
 */
// Somam mais de 60s, para atravessar a janela do limite por minuto antes de concluir que a cota diária acabou
const RETRY_WAITS_MS = [10_000, 25_000, 45_000];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Lê os detalhes do 429 do Gemini: o QuotaFailure diz qual cota estourou (ex.:
 * "GenerateRequestsPerDayPerProjectPerModel-FreeTier") e o RetryInfo sugere a espera ("31406s").
 */
export function readRateLimit(error: ApiError): { daily: boolean; retryDelayMs?: number } {
  let details: Array<Record<string, any>> = [];
  try {
    details = JSON.parse(error.message)?.error?.details ?? [];
  } catch {
    return { daily: false };
  }
  const quotaIds: string[] = details.flatMap((d) => (d.violations ?? []).map((v: any) => String(v.quotaId ?? '')));
  const delay = details.map((d) => /^(\d+(?:\.\d+)?)s$/.exec(String(d.retryDelay ?? ''))).find(Boolean);
  return { daily: quotaIds.some((id) => id.includes('PerDay')), retryDelayMs: delay ? Number(delay[1]) * 1000 : undefined };
}

/** Provedor Gemini (plano gratuito do Google AI Studio). Lê a chave de GEMINI_API_KEY. */
export function createGeminiGenerator(
  model: string,
  { client, retryWaitsMs = RETRY_WAITS_MS }: { client?: Pick<GoogleGenAI, 'models'>; retryWaitsMs?: number[] } = {},
): Generator {
  if (!client && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    throw new AiFatalError('GEMINI_API_KEY não definida');
  }
  const gemini = client ?? new GoogleGenAI({});

  return async ({ system, user, schema }) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await gemini.models.generateContent({
          model,
          contents: user,
          config: { systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: toJsonSchema(schema) },
        });
        // Resposta bloqueada ou fora do schema: quem chamou decide o que fazer com o null
        const parsed = schema.safeParse(JSON.parse(response.text ?? 'null'));
        return parsed.success ? parsed.data : null;
      } catch (error) {
        if (!(error instanceof ApiError)) {
          if (error instanceof SyntaxError) return null; // JSON inválido na resposta
          throw error;
        }
        if (RETRYABLE.has(error.status)) {
          const limit = error.status === 429 ? readRateLimit(error) : { daily: false };
          // Cota diária esgotada não volta em segundos: passa para o próximo provedor na hora
          if (limit.daily) throw new AiFatalError('cota diária do plano gratuito do Gemini esgotada', { cause: error });
          if (attempt < retryWaitsMs.length) {
            // Usa a espera sugerida pelo Google quando ela é curta (limite por minuto)
            const suggested = limit.retryDelayMs !== undefined && limit.retryDelayMs <= 60_000 ? limit.retryDelayMs : undefined;
            const wait = suggested ?? retryWaitsMs[attempt];
            const why = error.status === 429 ? 'limite do plano gratuito' : `Gemini sobrecarregado (${error.status})`;
            console.log(`  IA: ${why}, nova tentativa em ${wait / 1000}s...`);
            await sleep(wait);
            continue;
          }
          // 429 que não passa com as esperas indica cota esgotada: vale para todas as chamadas.
          // Sobrecarga persistente afeta só este pedido
          if (error.status === 429) throw new AiFatalError('cota do plano gratuito do Gemini esgotada', { cause: error });
          throw error;
        }
        // Chave inválida (o Gemini responde 400), sem permissão ou modelo inexistente: vale para todas as chamadas
        if ([400, 401, 403, 404].includes(error.status)) {
          throw new AiFatalError(`Gemini recusou a requisição (${error.status}): ${error.message}`, { cause: error });
        }
        throw error;
      }
    }
  };
}
