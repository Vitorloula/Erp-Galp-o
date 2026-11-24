import type { Env } from '../env'
import * as sb from '../supabase'

export interface ToolResult { ok: boolean; data?: unknown; erro?: string }

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_produto',
      description: 'Busca produtos do catálogo da loja por nome ou código. Retorna até 8 resultados com preço e disponibilidade (sem quantidade exata).',
      parameters: {
        type: 'object',
        properties: { termo: { type: 'string', description: 'nome ou código do produto' } },
        required: ['termo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'politica_loja',
      description: 'Retorna a política da loja: horário de funcionamento, endereço, formas de pagamento e opções de entrega/retirada.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'falar_com_humano',
      description: 'Transfere a conversa para um atendente humano. Use quando o cliente pedir atendente, tiver reclamação ou o bot não conseguir resolver.',
      parameters: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_pedido',
      description: 'Cria um pedido para o cliente a partir de uma lista de itens confirmados. O total é recalculado no servidor. Só chame após o cliente confirmar o carrinho.',
      parameters: {
        type: 'object',
        properties: {
          itens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                produto_id: { type: 'string' },
                qtd: { type: 'number' },
              },
              required: ['produto_id', 'qtd'],
            },
          },
          retirada_ou_entrega: { type: 'string', enum: ['retirada', 'entrega'] },
          endereco_entrega: { type: 'string' },
          observacao: { type: 'string' },
        },
        required: ['itens'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_pedido',
      description: 'Consulta o status e os itens de um pedido pelo número.',
      parameters: {
        type: 'object',
        properties: { numero: { type: 'number' } },
        required: ['numero'],
      },
    },
  },
] as const

export async function executarTool(env: Env, empresaId: string, lojaId: string, nome: string, args: Record<string, unknown>, ctx?: { contatoId: string | null; conversaId: string | null }): Promise<ToolResult> {
  switch (nome) {
    case 'buscar_produto': {
      const termo = String(args.termo ?? '').trim()
      if (!termo) return { ok: false, erro: 'termo vazio' }
      const rows = await sb.catalogoPublico(env, empresaId, lojaId, termo, 8)
      return { ok: true, data: rows.map(r => ({
        codigo: r.codigo_interno,
        nome: r.nome,
        preco_reais: (r.preco_venda_centavos / 100).toFixed(2),
        disponibilidade: r.disponibilidade,
      })) }
    }
    case 'politica_loja': {
      // A política vem do canal; aqui retornamos o que o runtime injetar (placeholder).
      return { ok: true, data: { observacao: 'configurar política em canais_whatsapp.politica' } }
    }
    case 'falar_com_humano': {
      return { ok: true, data: { transferido: true, motivo: args.motivo } }
    }
    case 'criar_pedido': {
      const itens = (args.itens as Array<{ produto_id: string; qtd: number }>) ?? []
      if (!Array.isArray(itens) || itens.length === 0) return { ok: false, erro: 'sem itens' }
      const r = await sb.criarPedido(env, empresaId, lojaId, ctx?.contatoId ?? null, ctx?.conversaId ?? null, (args.retirada_ou_entrega as 'retirada' | 'entrega') ?? 'retirada', (args.endereco_entrega as string) ?? null, (args.observacao as string) ?? null, itens)
      if (!r) return { ok: false, erro: 'falha ao criar pedido' }
      return { ok: true, data: { numero: r.numero, status: 'aguardando_confirmacao' } }
    }
    case 'consultar_pedido': {
      const numero = Number(args.numero)
      if (!numero) return { ok: false, erro: 'número inválido' }
      const r = await sb.consultarPedido(env, empresaId, numero)
      if (!r) return { ok: false, erro: 'pedido não encontrado' }
      return { ok: true, data: r }
    }
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` }
  }
}
