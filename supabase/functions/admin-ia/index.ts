import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

serve(async (req) => {
  const { pacote } = await req.json().catch(() => ({}))
  const chave = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("LLM_API_KEY")
  if (!chave) {
    return new Response(JSON.stringify({
      resultado: "IA não configurada (modo desenvolvimento).",
      modelo: "sem-chave",
      tokens_entrada: 0,
      tokens_saida: 0,
    }), { headers: { "Content-Type": "application/json" } })
  }
  // Modo com chave: resposta mínima (placeholder) — integrar provedor depois.
  return new Response(JSON.stringify({
    resultado: "Análise automática indisponível no momento. Pacote recebido com " + (pacote?.ocorrencias?.length ?? 0) + " ocorrências.",
    modelo: "placeholder",
    tokens_entrada: 0,
    tokens_saida: 0,
  }), { headers: { "Content-Type": "application/json" } })
})
