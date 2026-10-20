import Groq from 'groq-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiFatalError, toJsonSchema, verdictSchema } from '../src/ai';
import { createGroqGenerator } from '../src/groq';
import type { Profile } from '../src/types';

const schema = z.object({ fit: z.number(), kind: z.enum(['site_simples', 'outro']) });
const request = { name: 'triagem', system: 'Faz sites.', user: 'Site institucional', schema };
const answer = { fit: 7, kind: 'site_simples' };

function fakeClient(result: string | Error) {
  const requests: any[] = [];
  const client = {
    chat: {
      completions: {
        create: async (req: any) => {
          requests.push(req);
          if (result instanceof Error) throw result;
          return { choices: [{ message: { content: result } }] };
        },
      },
    },
  };
  return { client: client as any, requests };
}

const apiError = (Cls: any, status: number) => new Cls(status, { error: { message: 'x' } }, 'x', new Headers());

describe('toJsonSchema', () => {
  it('gera JSON Schema sem "$schema" e com os perfis no enum', () => {
    const profiles: Profile[] = [{ name: 'Sites', keywords: ['site'], proposal: { value: 1, days: 1, template: '' } }];
    const json = toJsonSchema(verdictSchema(profiles)) as any;
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe('object');
    expect(json.properties.profile.enum).toEqual(['nenhum', 'Sites']);
    expect(json.required).toContain('fit');
    // O modo estrito do Groq exige additionalProperties: false
    expect(json.additionalProperties).toBe(false);
  });
});

describe('createGroqGenerator', () => {
  it('envia system + mensagem com schema estrito e valida a resposta', async () => {
    const { client, requests } = fakeClient(JSON.stringify(answer));
    expect(await createGroqGenerator('groq-teste', { client })(request)).toEqual(answer);

    const [req] = requests;
    expect(req.model).toBe('groq-teste');
    expect(req.messages).toEqual([
      { role: 'system', content: 'Faz sites.' },
      { role: 'user', content: 'Site institucional' },
    ]);
    expect(req.response_format.json_schema).toMatchObject({ name: 'triagem', strict: true });
    expect(req.response_format.json_schema.schema.$schema).toBeUndefined();
  });

  it('resposta fora do schema vira null', async () => {
    const { client } = fakeClient(JSON.stringify({ ...answer, kind: 'inventado' }));
    expect(await createGroqGenerator('groq-teste', { client })(request)).toBeNull();
  });

  it('cota esgotada (429) e chave recusada (401) interrompem; 500 afeta só o pedido', async () => {
    for (const [Cls, status] of [[Groq.RateLimitError, 429], [Groq.AuthenticationError, 401]] as const) {
      const { client } = fakeClient(apiError(Cls, status));
      await expect(createGroqGenerator('groq-teste', { client })(request)).rejects.toThrow(AiFatalError);
    }
    const { client } = fakeClient(apiError(Groq.InternalServerError, 500));
    const error = await createGroqGenerator('groq-teste', { client })(request).catch((e) => e);
    expect(error).toBeInstanceOf(Groq.InternalServerError);
  });

  it('sem GROQ_API_KEY, falha antes de qualquer chamada', () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      expect(() => createGroqGenerator('groq-teste')).toThrow(AiFatalError);
    } finally {
      if (saved !== undefined) process.env.GROQ_API_KEY = saved;
    }
  });
});
