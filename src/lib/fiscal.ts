/**
 * Conferência fiscal da venda (T-034 / fase F1).
 *
 * Regra do produto: a loja é responsável por decidir o que emitir. O sistema
 * prepara e CONFERE a nota de toda venda — sem enviar nada à SEFAZ — e explica,
 * em português de loja, o que impede a emissão. Nada aqui fala com a rede:
 * é tudo função pura, testada isoladamente.
 */

/** Regime tributário (campo CRT do XML da NF-e/NFC-e). */
export type Crt = 1 | 2 | 3 | 4

export interface Regime {
  crt: Crt
  /** Nome que aparece na tela. */
  nome: string
  /** Explicação curta, sem sigla. */
  resumo: string
  /** Exemplo do dia a dia, para o dono se reconhecer. */
  exemplo: string
}

/**
 * Os quatro códigos de regime da SEFAZ. "ME" e "EPP" são porte (tamanho) e não
 * aparecem aqui de propósito: os dois são Simples Nacional (CRT 1) e quem muda
 * a nota é o regime, não o porte.
 */
export const REGIMES: Regime[] = [
  {
    crt: 4,
    nome: 'MEI',
    resumo: 'Pago um valor fixo por mês (DAS), independente do quanto vendo.',
    exemplo: 'Ex.: loja registrada como MEI, com um único CNPJ.',
  },
  {
    crt: 1,
    nome: 'Simples Nacional (ME ou EPP)',
    resumo: 'Pago uma guia (DAS) com percentual sobre o que vendo.',
    exemplo: 'Ex.: microempresa ou pequena empresa optante pelo Simples.',
  },
  {
    crt: 2,
    nome: 'Simples Nacional com excesso de sublimite',
    resumo: 'Simples Nacional, mas o faturamento passou do sublimite do estado.',
    exemplo: 'Ex.: a contabilidade avisou que a empresa passou do limite estadual.',
  },
  {
    crt: 3,
    nome: 'Lucro Presumido ou Lucro Real',
    resumo: 'O contador apura ICMS/PIS/COFINS todos os meses (regime normal).',
    exemplo: 'Ex.: empresa maior, fora do Simples Nacional.',
  },
]

export function nomeRegime(crt: number | null | undefined): string {
  return REGIMES.find(r => r.crt === crt)?.nome ?? 'Regime não configurado'
}

/** Data em que a emissão em toda venda passa a ser obrigatória (LC 214/2025). */
export const VIGENCIA_PADRAO = '2027-01-01'

/** Texto do compromisso mostrado ao dono antes de decidir. */
export const RESPONSABILIDADE_FISCAL =
  'Enquanto estiver no modo conferência, o sistema prepara e avisa, mas só emite quando você mandar. A decisão e a responsabilidade pela emissão são da sua empresa.'

export type SituacaoConferencia = 'pronta' | 'pendente' | 'bloqueada'
export type DecisaoNFCe = 'emitir' | 'sem_nota'

export interface Pendencia {
  tipo: 'regime' | 'sem_itens' | 'produto_removido' | 'ncm' | 'total'
  texto: string
}

export interface EntradaConferencia {
  /** Regime da loja (lojas.crt); null = ainda não configurado. */
  crt: number | null
  /** Total da venda, em reais. */
  total: number
  /** Quantidade de itens da venda. */
  itens: number
  /** Itens cujo produto não existe mais (excluído do cadastro). */
  itensSemProduto: number
  /** Itens cujo produto está sem NCM. */
  itensSemNcm: number
  /** Nomes dos produtos sem NCM (para a mensagem). */
  produtosSemNcm: string[]
}

export interface ResultadoConferencia {
  situacao: SituacaoConferencia
  pendencias: Pendencia[]
}

/**
 * Confere se a venda "sairia" numa nota. Bloqueada = falta um dado da loja
 * (regime); pendente = falta dado de produto e a loja ainda pode decidir
 * emitir depois de corrigir; pronta = pode emitir.
 */
export function conferirVenda(e: EntradaConferencia): ResultadoConferencia {
  const pendencias: Pendencia[] = []

  if (e.crt === null || e.crt === undefined) {
    pendencias.push({
      tipo: 'regime',
      texto: 'Falta dizer como sua empresa paga imposto (MEI, Simples, Presumido ou Real).',
    })
  }

  if (e.itens <= 0) {
    pendencias.push({ tipo: 'sem_itens', texto: 'A venda não tem itens para entrar na nota.' })
  }

  if (e.total <= 0) {
    pendencias.push({ tipo: 'total', texto: 'A venda está com total zerado.' })
  }

  if (e.itensSemProduto > 0) {
    pendencias.push({
      tipo: 'produto_removido',
      texto:
        e.itensSemProduto === 1
          ? '1 item é de um produto que foi excluído do cadastro.'
          : `${e.itensSemProduto} itens são de produtos que foram excluídos do cadastro.`,
    })
  }

  if (e.itensSemNcm > 0) {
    const nomes = e.produtosSemNcm.filter(Boolean)
    const lista = nomes.length ? `: ${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''}` : '.'
    pendencias.push({
      tipo: 'ncm',
      texto:
        (e.itensSemNcm === 1 ? '1 produto está sem código fiscal (NCM)' : `${e.itensSemNcm} produtos estão sem código fiscal (NCM)`) +
        lista,
    })
  }

  const bloqueada = pendencias.some(p => p.tipo === 'regime' || p.tipo === 'sem_itens' || p.tipo === 'total')
  return {
    situacao: bloqueada ? 'bloqueada' : pendencias.length ? 'pendente' : 'pronta',
    pendencias,
  }
}

export interface LinhaResumo {
  situacao: SituacaoConferencia
  nfce_decisao: DecisaoNFCe | null
  nfce_status: string
}

export interface ResumoConferencia {
  total: number
  prontas: number
  pendentes: number
  bloqueadas: number
  /** Vendas ainda sem decisão (qualquer situação). */
  aDecidir: number
  /** Vendas que a loja decidiu emitir (inclui as já emitidas). */
  paraEmitir: number
  semNota: number
  emitidas: number
}

export function resumirConferencia(linhas: LinhaResumo[]): ResumoConferencia {
  const r: ResumoConferencia = {
    total: linhas.length,
    prontas: 0,
    pendentes: 0,
    bloqueadas: 0,
    aDecidir: 0,
    paraEmitir: 0,
    semNota: 0,
    emitidas: 0,
  }
  for (const l of linhas) {
    if (l.situacao === 'pronta') r.prontas++
    else if (l.situacao === 'pendente') r.pendentes++
    else r.bloqueadas++

    if (!l.nfce_decisao) r.aDecidir++
    else if (l.nfce_decisao === 'sem_nota') r.semNota++
    else if (l.nfce_status === 'emitida') r.emitidas++
    else r.paraEmitir++
  }
  return r
}

/** Motivos rápidos para "sem nota" (o operador pode escrever outro). */
export const MOTIVOS_SEM_NOTA = [
  { valor: 'cliente_nao_pediu', texto: 'Cliente não pediu a nota' },
  { valor: 'venda_sem_dados', texto: 'Faltam dados fiscais no produto' },
  { valor: 'venda_encerrada', texto: 'Venda encerrada sem nota' },
] as const

/** Quantos dias faltam até a data (0 = hoje, negativo = passou). */
export function diasAte(dataISO: string, hoje = new Date()): number {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  if (!ano || !mes || !dia) return 0
  const alvo = Date.UTC(ano, mes - 1, dia)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86_400_000)
}
