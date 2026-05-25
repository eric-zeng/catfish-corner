import dotenv from 'dotenv';
dotenv.config();

export const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://noveria.tailde3693.ts.net:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:e4b';

export async function queryOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response.trim();
}
