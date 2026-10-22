/**
 * NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65).
 *
 * Ponto de integração fiscal para o caixa. A partir de 01/01/2027 (LC 214/2025),
 * o MEI passa a emitir documento fiscal em toda venda — emitir a NFC-e direto no
 * fechamento da venda é o diferencial (em vez do emissor gratuito manual da SEFAZ).
 *
 * Esta camada:
 *  - modela o estado da nota (pendente/emitida/cancelada/erro);
 *  - monta os dados da nota a partir da venda (itens com NCM/CFOP/CST/origem);
 *  - abstrai o emissor atrás de uma interface: hoje é um stub "desligado" —
 *    para ligar, é só colocar as keys/API (idealmente numa Supabase Edge Function).
 */
import { formatarData } from './formato'
import type { Produto } from './tipos'

/** Estado da NFC-e de uma venda. */
export type NFCeStatus = 'pendente' | 'emitida' | 'cancelada' | 'erro'

/** Um item da nota, já com os campos fiscais do produto. */
export interface ItemNFCe {
  codigo: string
  nome: string
  ncm: string | null
  cfop: string | null
  cst: string | null
  origem: number | null
  /** Reforma Tributária: alíquotas de IBS e CBS (%) — opcionais. */
  ibs: number | null
  cbs: number | null
  unidade: string
  quantidade: number
  /** Valor total do item (quantidade × unitário − rateio do desconto). */
  valor: number
}

/** Dados prontos para o emissor (XML da nota). */
export interface DadosNFCe {
  vendaId: string
  /** Número da venda dentro do caixa (ex.: 02-000123). */
  numero: string
  /** Série da NFC-e = número do caixa, com 3 dígitos. */
  serie: string
  total: number
  emitidaEm: string
  itens: ItemNFCe[]
}

export interface EmissorNFCe {
  /** true quando as keys/API do emissor estão configuradas. */
  configurado: boolean
  emitir(venda: DadosNFCe): Promise<{ status: 'emitida' | 'nao_configurado' | 'erro'; chave?: string; qrcode?: string; mensagem?: string }>
}

/** Série da NFC-e: o número do caixa, sempre com 3 dígitos (001…999). */
export function serieNFCe(numeroCaixa: number): string {
  return String(numeroCaixa).padStart(3, '0')
}

interface ItemVenda {
  produto: Pick<Produto, 'codigo_interno' | 'nome' | 'unidade' | 'ncm' | 'cfop' | 'cst_csosn' | 'origem' | 'ibs_aliquota' | 'cbs_aliquota'>
  quantidade: number
  valor: number
}

/** Monta os dados da NFC-e a partir da venda e de seus itens. Puro e testável. */
export function montarDadosNFCe(args: {
  vendaId: string
  numero: string
  caixaNumero: number
  total: number
  emitidaEm: string
  itens: ItemVenda[]
}): DadosNFCe {
  return {
    vendaId: args.vendaId,
    numero: args.numero,
    serie: serieNFCe(args.caixaNumero),
    total: args.total,
    emitidaEm: args.emitidaEm,
    itens: args.itens.map(i => ({
      codigo: i.produto.codigo_interno,
      nome: i.produto.nome,
      ncm: i.produto.ncm ?? null,
      cfop: i.produto.cfop ?? null,
      cst: i.produto.cst_csosn ?? null,
      origem: i.produto.origem ?? null,
      ibs: i.produto.ibs_aliquota ?? null,
      cbs: i.produto.cbs_aliquota ?? null,
      unidade: i.produto.unidade,
      quantidade: i.quantidade,
      valor: i.valor,
    })),
  }
}

/** Resultado da emissão de uma venda (para a fila). */
export interface ResultadoEmissao {
  vendaId: string
  status: 'emitida' | 'nao_configurado' | 'erro'
  chave?: string
  qrcode?: string
  mensagem?: string
}

/** Emite uma venda pelo emissor e devolve o resultado (puro em relação ao emissor). */
export async function emitirVenda(emissor: EmissorNFCe, dados: DadosNFCe): Promise<ResultadoEmissao> {
  const r = await emissor.emitir(dados)
  return { vendaId: dados.vendaId, status: r.status, chave: r.chave, qrcode: r.qrcode, mensagem: r.mensagem }
}

// ───────────────────────── Configuração / emissor ─────────────────────────

interface ConfigNFCe {
  url: string
  token: string
  csc: string
  cscId: string
  seriePadrao: string
}

function lerConfig(): ConfigNFCe | null {
  const url = import.meta.env.VITE_NFCE_URL
  const token = import.meta.env.VITE_NFCE_TOKEN
  const csc = import.meta.env.VITE_NFCE_CSC
  const cscId = import.meta.env.VITE_NFCE_CSC_ID
  const seriePadrao = import.meta.env.VITE_NFCE_SERIE || '1'
  if (!url || !token || !csc || !cscId) return null
  return { url, token, csc, cscId, seriePadrao }
}

/**
 * Devolve o emissor de NFC-e. Hoje é um stub: sem keys, fica "desligado".
 * Quando as keys/API existirem, troque o corpo desta função pela chamada real
 * (Supabase Edge Function ou emissor terceiro) — sem mudar a interface.
 */
export function criarEmissorNFCe(): EmissorNFCe {
  const cfg = lerConfig()
  if (!cfg) {
    return {
      configurado: false,
      async emitir(venda) {
        // Sem keys: o caixa segue normalmente, só o cupom não fiscal.
        console.info(`[NFC-e] não configurada — venda ${venda.numero} de ${formatarData(venda.emitidaEm)} não emitida.`)
        return { status: 'nao_configurado', mensagem: 'NFC-e não configurada' }
      },
    }
  }
  return {
    configurado: true,
    async emitir(_venda) {
      // TODO(integração NFC-e): chamar a API do emissor com cfg.url/token/csc/cscId.
      // Retorno real: { status: 'emitida', chave: '...', qrcode: '...' } ou { status: 'erro', mensagem }.
      return { status: 'nao_configurado', mensagem: 'Integração NFC-e pendente' }
    },
  }
}
