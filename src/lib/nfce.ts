/**
 * NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65).
 *
 * Ponto de integração fiscal para o caixa. A partir de 01/01/2027 (LC 214/2025),
 * o MEI passa a emitir documento fiscal em toda venda — emitir a NFC-e direto no
 * fechamento da venda é o diferencial (em vez do emissor gratuito manual da SEFAZ).
 *
 * Esta camada:
 *  - modela o estado da nota (pendente/emitida/cancelada/erro/resolvida);
 *  - monta os dados da nota a partir da venda (itens com NCM/CFOP/CST/origem);
 *  - abstrai o emissor atrás de uma interface: hoje é um stub "desligado" —
 *    para ligar, é só colocar as keys/API (idealmente numa Supabase Edge Function).
 */
import type { Produto } from './tipos'

/** Estado da NFC-e de uma venda. `resolvida` = saiu da fila por decisão do operador. */
export type NFCeStatus = 'pendente' | 'emitida' | 'cancelada' | 'erro' | 'resolvida'

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
  /** CPF do consumidor (quando pediu "CPF na nota"); null = sem identificação. */
  cpf: string | null
  itens: ItemNFCe[]
}

export interface EmissorNFCe {
  /** true quando as keys/API do emissor estão configuradas. */
  configurado: boolean
  emitir(venda: DadosNFCe): Promise<{ status: 'emitida' | 'nao_configurado' | 'erro'; chave?: string; qrcode?: string; mensagem?: string }>
  /** Cancela uma nota já emitida (ao cancelar a venda). */
  cancelar(chave: string, motivo: string): Promise<{ status: 'cancelada' | 'nao_configurado' | 'erro'; mensagem?: string }>
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
  cpf?: string | null
  itens: ItemVenda[]
}): DadosNFCe {
  return {
    vendaId: args.vendaId,
    numero: args.numero,
    serie: serieNFCe(args.caixaNumero),
    total: args.total,
    emitidaEm: args.emitidaEm,
    cpf: args.cpf ?? null,
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

/** Fiscal fica desligado até existir integração homologada no servidor. */
export function criarEmissorNFCe(): EmissorNFCe {
  return {
    configurado: false,
    async emitir() {
      return { status: 'nao_configurado', mensagem: 'Integração NFC-e não homologada nem configurada no servidor.' }
    },
    async cancelar() {
      return { status: 'nao_configurado', mensagem: 'Integração NFC-e não configurada no servidor.' }
    },
  }
}
