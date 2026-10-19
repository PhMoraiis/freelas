import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiFatalError, toJsonSchema, verdictSchema } from '../src/ai';
import { createGeminiGenerator, readRateLimit } from '../src/gemini';
import type { Profile } from '../src/types';

const profiles: Profile[] = [{ name: 'Sites', keywords: ['site'], proposal: { value: 1, days: 1, template: '' } }];
const schema = z.object({ fit: z.number(), profile: z.enum(['Sites', 'nenhum']) });
const request = { name: 'triagem', system: 'Faz sites.', user: 'Site institucional', schema };
const answer = { fit: 8, profile: 'Sites' };

/** Cliente falso: devolve (ou lança) cada item da fila, um por chamada. */
function fakeClient(queue: Array<string | Error>) {
  const requests: any[] = [];
  const client = {
    models: {
      generateContent: async (req: any) => {
        requests.push(req);
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return { text: next };
      },
    },
  };
  return { client: client as any, requests };
}

/** 429 no formato real do Gemini (corpo JSON com QuotaFailure e RetryInfo). */
function quotaError(quotaId: string, retryDelay: string) {
  const body = {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
      ],
    },
  };
  return new ApiError({ message: JSON.stringify(body), status: 429 });
}

const waits = { retryWaitsMs: [1, 1] };
const limit = () => new ApiError({ message: 'quota', status: 429 });
const overloaded = () => new ApiError({ message: 'high demand', status: 503 });

describe('toJsonSchema', () => {
  it('gera JSON Schema sem "$schema" e com os perfis no enum', () => {
    const json = toJsonSchema(verdictSchema(profiles)) as any;
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe('object');
    expect(json.properties.profile.enum).toEqual(['nenhum', 'Sites']);
    expect(json.required).toContain('fit');
  });
});

describe('createGeminiGenerator', () => {
  it('envia instruções, mensagem e schema e valida a resposta', async () => {
    const { client, requests } = fakeClient([JSON.stringify(answer)]);
    expect(await createGeminiGenerator('gemini-teste', { client })(request)).toEqual(answer);
    expect(requests[0]).toMatchObject({ model: 'gemini-teste', contents: 'Site institucional' });
    expect(requests[0].config).toMatchObject({ systemInstruction: 'Faz sites.', responseMimeType: 'application/json' });
  });

  it('resposta fora do schema ou JSON inválido vira null', async () => {
    const { client } = fakeClient([JSON.stringify({ ...answer, profile: 'Inventado' }), '{quebrado']);
    const generate = createGeminiGenerator('gemini-teste', { client });
    expect(await generate(request)).toBeNull();
    expect(await generate(request)).toBeNull();
  });

  it('tenta de novo no 429 e no 503 (sobrecarga) até conseguir', async () => {
    const ok = fakeClient([limit(), overloaded(), JSON.stringify(answer)]);
    expect(await createGeminiGenerator('gemini-teste', { client: ok.client, ...waits })(request)).not.toBeNull();
    expect(ok.requests).toHaveLength(3);
  });

  it('429 persistente interrompe por cota esgotada; sobrecarga persistente afeta só o pedido', async () => {
    const exhausted = fakeClient([limit(), limit(), limit()]);
    await expect(createGeminiGenerator('gemini-teste', { client: exhausted.client, ...waits })(request)).rejects.toThrow(AiFatalError);

    const busy = fakeClient([overloaded(), overloaded(), overloaded()]);
    const error = await createGeminiGenerator('gemini-teste', { client: busy.client, ...waits })(request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(AiFatalError);
  });

  it('cota diária esgotada interrompe na hora, sem esperar', async () => {
    const daily = fakeClient([quotaError('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '31406s')]);
    await expect(createGeminiGenerator('gemini-teste', { client: daily.client, ...waits })(request)).rejects.toThrow(/diária/);
    expect(daily.requests).toHaveLength(1);
  });

  it('chave inválida (400) interrompe sem tentar de novo', async () => {
    const invalid = fakeClient([new ApiError({ message: 'API key not valid', status: 400 })]);
    await expect(createGeminiGenerator('gemini-teste', { client: invalid.client, ...waits })(request)).rejects.toThrow(AiFatalError);
    expect(invalid.requests).toHaveLength(1);
  });

  it('sem GEMINI_API_KEY, falha antes de qualquer chamada', () => {
    const saved = { gemini: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      expect(() => createGeminiGenerator('gemini-teste')).toThrow(AiFatalError);
    } finally {
      if (saved.gemini !== undefined) process.env.GEMINI_API_KEY = saved.gemini;
      if (saved.google !== undefined) process.env.GOOGLE_API_KEY = saved.google;
    }
  });
});

describe('readRateLimit', () => {
  it('distingue cota diária de limite por minuto e lê a espera sugerida', () => {
    expect(readRateLimit(quotaError('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '31406s'))).toEqual({ daily: true, retryDelayMs: 31_406_000 });
    expect(readRateLimit(quotaError('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '37.5s'))).toEqual({ daily: false, retryDelayMs: 37_500 });
    expect(readRateLimit(new ApiError({ message: 'texto sem JSON', status: 429 }))).toEqual({ daily: false });
  });
});
