import { AiFatalError, paced, withFallback, type Generator, type SourcedGenerator } from './ai';
import { createGeminiGenerator } from './gemini';
import { createGroqGenerator } from './groq';
import type { AiConfig } from './types';

/**
 * Monta a cadeia de provedores do config. Provedor sem chave fica de fora e o próximo assume;
 * sem nenhum disponível, lança AiFatalError para quem chamou seguir sem IA.
 */
export function createGenerator(ai: AiConfig): SourcedGenerator {
  const chain: { name: string; generate: Generator }[] = [];
  const skipped: string[] = [];

  for (const { provider, model, minIntervalMs } of ai.providers) {
    try {
      const generate = provider === 'gemini' ? createGeminiGenerator(model) : createGroqGenerator(model);
      chain.push({ name: provider, generate: minIntervalMs ? paced(generate, minIntervalMs) : generate });
    } catch (error) {
      if (!(error instanceof AiFatalError)) throw error;
      skipped.push(`${provider}: ${error.message}`);
    }
  }

  if (skipped.length) console.log(`  Provedores ignorados: ${skipped.join('; ')}`);
  if (chain.length === 0) throw new AiFatalError(skipped.join('; ') || 'nenhum provedor configurado');
  return withFallback(chain);
}
