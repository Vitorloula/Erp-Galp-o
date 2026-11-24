import type { Env } from '../env'

export interface MensagemLLM { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string }

export interface RespostaLLM { content: string | null; toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>; tokensEntrada: number; tokensSaida: number }

export async function chamarLLM(env: Env, mensagens: MensagemLLM[], tools: unknown): Promise<RespostaLLM> {
  const res = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({ model: env.LLM_MODEL, messages: mensagens, tools, tool_choice: 'auto', temperature: 0.3 }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }
  const msg = json.choices[0].message
  return {
    content: msg.content,
    toolCalls: (msg.tool_calls ?? []).map(tc => ({ id: tc.id, name: tc.function.name, arguments: safeJson(tc.function.arguments) })),
    tokensEntrada: json.usage?.prompt_tokens ?? 0,
    tokensSaida: json.usage?.completion_tokens ?? 0,
  }
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}
