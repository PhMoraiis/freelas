import Groq from 'groq-sdk';
import { AiFatalError, toJsonSchema, type Generator } from './ai';

/**
 * Provedor Groq (plano gratuito). Lê a chave de GROQ_API_KEY.
 * O SDK já tenta de novo nos erros 429 e 5xx, respeitando o tempo de espera indicado pela API.
 */
export function createGroqGenerator(model: string, { client }: { client?: Pick<Groq, 'chat'> } = {}): Generator {
  if (!client && !process.env.GROQ_API_KEY) throw new AiFatalError('GROQ_API_KEY não definida');
  const groq = client ?? new Groq({ maxRetries: 3 });

  return async ({ name, system, user, schema }) => {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // Raciocínio curto economiza a cota de tokens por minuto do plano gratuito
        reasoning_effort: 'low',
        // Modo estrito: a resposta é gerada já presa ao schema (gpt-oss-20b/120b)
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: toJsonSchema(schema) } },
      });
      const parsed = schema.safeParse(JSON.parse(response.choices[0]?.message.content ?? 'null'));
      return parsed.success ? parsed.data : null;
    } catch (error) {
      if (error instanceof SyntaxError) return null; // JSON inválido na resposta
      // 429 que sobrevive às novas tentativas do SDK indica cota diária esgotada; chave recusada ou
      // modelo inexistente também valem para todas as chamadas
      if (error instanceof Groq.RateLimitError) {
        throw new AiFatalError('cota do plano gratuito do Groq esgotada', { cause: error });
      }
      if (
        error instanceof Groq.AuthenticationError ||
        error instanceof Groq.PermissionDeniedError ||
        error instanceof Groq.NotFoundError
      ) {
        throw new AiFatalError(`Groq recusou a requisição (${error.status}): ${error.message}`, { cause: error });
      }
      throw error;
    }
  };
}
