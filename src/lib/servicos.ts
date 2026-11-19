/**
 * Regras do módulo Serviços (Ordem de Serviço), sem tela nem rede — testáveis isoladamente.
 * Dinheiro em CENTAVOS inteiros (padrão do PDV e do Painel); o banco devolve reais.
 */
import { formatarReais } from '../pdv/venda'
import { formatarData, hojeISO, lerNumero, normalizarBusca, somarDias } from './formato'
import type { ItemOS, OS, StatusOS } from './tipos'

/** Rótulos exatos de status (snake_case no banco, pt-BR na tela). */
export const STATUS_OS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  em_diagnostico: 'Em diagnóstico',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
}

/** Cadeia única do fluxo (cancelada fica fora: sai de qualquer status ativo). */
export const ORDEM_OS: StatusOS[] = ['aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aprovada', 'em_execucao', 'pronta', 'entregue']

/** Avanço livre na cadeia; nunca volta; entregue/cancelada são terminais. */
export function podeMudarStatus(de: StatusOS, para: StatusOS): boolean {
  if (de === 'entregue' || de === 'cancelada') return false
  if (para === 'cancelada') return true
  return ORDEM_OS.indexOf(para) > ORDEM_OS.indexOf(de)
}

/** Passo natural seguinte (o botão primário do detalhe); null quando não há. */
export function proximoStatus(de: StatusOS): StatusOS | null {
  if (de === 'entregue' || de === 'cancelada' || de === 'pronta') return null
  return ORDEM_OS[ORDEM_OS.indexOf(de) + 1] ?? null
}

/** Status posteriores disponíveis no "Avançar para outro status" (nunca anteriores). */
export function statusPosteriores(de: StatusOS): StatusOS[] {
  if (de === 'entregue' || de === 'cancelada') return []
  return ORDEM_OS.slice(ORDEM_OS.indexOf(de) + 1)
}

/** Número da OS como aparece em toda a interface: 123 → "OS 000123". */
export const numeroOS = (n: number) => `OS ${String(n).padStart(6, '0')}`

/** Total da OS em centavos: itens + mão de obra − desconto (nunca negativo). */
export function montarTotalOS(
  itens: ReadonlyArray<Pick<ItemOS, 'quantidade' | 'preco_unitario'>>,
  maoDeObra: number,
  desconto: number,
): number {
  const itensCentavos = itens.reduce((soma, i) => soma + Math.round(i.quantidade * i.preco_unitario * 100), 0)
  return Math.max(0, itensCentavos + Math.round(maoDeObra * 100) - Math.round(desconto * 100))
}

/** Quanto ainda falta receber (centavos); pagamentos vêm do banco em reais. */
export function faltamPagamentos(total: number, pagamentos: ReadonlyArray<{ valor: number }>): number {
  const pago = pagamentos.reduce((soma, p) => soma + Math.round(p.valor * 100), 0)
  return Math.max(0, total - pago)
}

/** Prazo preenchido, vencido e a OS ainda em aberto (não entregue/cancelada). */
export function atrasada(os: Pick<OS, 'prazo_prometido' | 'status'>, hoje = hojeISO()): boolean {
  if (!os.prazo_prometido || os.status === 'entregue' || os.status === 'cancelada') return false
  return os.prazo_prometido < hoje
}

/**
 * Lê o valor digitado em "Registrar pagamento" (reais).
 * Campo vazio = recebe o que falta; aceita "1.800,00", "1800" e "R$ 1.800,00".
 * Devolve `erro` (texto pronto para a tela) quando o valor não serve.
 */
export function interpretarPagamento(texto: string, faltaCentavos: number): { valor: number | null; erro?: string } {
  if (faltaCentavos <= 0) return { valor: null, erro: 'Não falta nada a receber nesta OS.' }
  if (!texto.trim()) return { valor: faltaCentavos / 100 }
  const valor = lerNumero(texto.replace(/r\$/gi, ''))
  if (valor === null || valor <= 0) return { valor: null, erro: 'Informe um valor maior que zero.' }
  const centavos = Math.round(valor * 100)
  if (centavos > faltaCentavos) return { valor: null, erro: `O valor passa do que falta (${formatarReais(faltaCentavos)}).` }
  return { valor: centavos / 100 }
}

// ─────────────────── Agenda da assistência (Decisão 14) ───────────────────

export type GrupoAgenda = 'orcamento' | 'em_andamento' | 'prontas' | 'atrasadas'

export const NOME_GRUPO_AGENDA: Record<GrupoAgenda, string> = {
  orcamento: 'Orçamento',
  em_andamento: 'Em andamento',
  prontas: 'Prontas',
  atrasadas: 'Atrasadas',
}

/** Grupo de trabalho da OS na agenda; null = fora (entregue/cancelada). */
export function grupoDaAgenda(os: Pick<OS, 'status' | 'prazo_prometido'>, hoje = hojeISO()): GrupoAgenda | null {
  if (os.status === 'entregue' || os.status === 'cancelada') return null
  if (atrasada(os, hoje)) return 'atrasadas'
  if (os.status === 'aguardando_aprovacao' || os.status === 'aprovada') return 'orcamento'
  if (os.status === 'pronta') return 'prontas'
  return 'em_andamento' // aberta, em_diagnostico, em_execucao
}

/** Agrupa as OS com prazo por grupo de trabalho (a agenda é o trabalho pendente). */
export function gruposDaAgenda(ordens: ReadonlyArray<Pick<OS, 'status' | 'prazo_prometido'>>, hoje = hojeISO()): Record<GrupoAgenda, OS[]> {
  const grupos: Record<GrupoAgenda, OS[]> = { orcamento: [], em_andamento: [], prontas: [], atrasadas: [] }
  for (const os of ordens as OS[]) {
    const grupo = grupoDaAgenda(os, hoje)
    if (grupo) grupos[grupo].push(os)
  }
  return grupos
}

// ─────────────────── Garantia por produto (Decisão 11) ───────────────────

/** Conversão fixa da garantia do produto para a OS: 1 mês = 30 dias. */
export const DIAS_POR_MES = 30
/** Sugerido quando nenhuma peça tem garantia configurada. */
export const GARANTIA_PADRAO_DIAS = 90

/**
 * Garantia sugerida (dias): a MAIOR garantia entre as peças do estoque do orçamento
 * (itens avulsos não contam; a maior cobre todo o serviço). Nada configurado → 90;
 * configurada em 0 é respeitada (sem garantia).
 */
export function sugerirGarantia(itens: ReadonlyArray<Pick<ItemOS, 'origem' | 'garantia_meses'>>): number {
  const meses = itens
    .filter(i => i.origem === 'estoque' && i.garantia_meses !== null && i.garantia_meses !== undefined)
    .map(i => i.garantia_meses as number)
  if (meses.length === 0) return GARANTIA_PADRAO_DIAS
  return Math.max(...meses) * DIAS_POR_MES
}

/** Dica exata do campo "Garantia (dias)", conforme a origem da sugestão. */
export function dicaGarantiaSugerida(itens: ReadonlyArray<Pick<ItemOS, 'origem' | 'garantia_meses'>>): string {
  const temConfigurada = itens.some(i => i.origem === 'estoque' && i.garantia_meses !== null && i.garantia_meses !== undefined)
  if (!temConfigurada) return 'Nenhuma peça tem garantia configurada: sugeridos 90 dias.'
  const dias = sugerirGarantia(itens)
  if (dias === 0) return 'Uma das peças está configurada sem garantia: sugeridos 0 dias.'
  return `Sugestão: maior garantia entre as peças (${dias} dias).`
}

// ─────────────────── Mensagens copiáveis (Decisão 9) ───────────────────

type OSParaMensagem = Pick<OS, 'cliente_nome' | 'cliente_telefone' | 'numero' | 'aparelho_tipo' | 'aparelho_marca_modelo' | 'prazo_prometido' | 'garantia_dias'>

const aparelhoDaOS = (os: OSParaMensagem) => [os.aparelho_tipo, os.aparelho_marca_modelo].filter(Boolean).join(' ')

/** Orçamento enviado: o texto que a loja cola no WhatsApp do cliente. */
export function mensagemOrcado(os: OSParaMensagem, total: number): string {
  let texto = `Olá, ${os.cliente_nome}! O orçamento da ${numeroOS(os.numero)} (${aparelhoDaOS(os)}) ficou em ${formatarReais(total)}. Podemos começar o conserto?`
  if (os.prazo_prometido) texto += ` Prazo prometido: ${formatarData(os.prazo_prometido)}.`
  if (os.cliente_telefone) texto += ` Se preferir, fale com a loja pelo telefone ${os.cliente_telefone}.`
  return texto
}

/** Aparelho pronto: o texto que a loja cola no WhatsApp do cliente. */
export function mensagemPronta(os: OSParaMensagem, total: number): string {
  const garantia = os.garantia_dias && os.garantia_dias > 0 ? ` Garantia até ${formatarData(somarDias(hojeISO(), os.garantia_dias))}.` : ''
  return `Olá, ${os.cliente_nome}! A ${numeroOS(os.numero)} (${aparelhoDaOS(os)}) está pronta. Total: ${formatarReais(total)}.${garantia} Pode retirar quando puder.`
}

// ─────────────────── Busca da lista ───────────────────

/** "OS 000123" (ou "123") vira o número; o resto é texto livre normalizado. */
export function normalizarNumeroOS(termo: string): string {
  const limpo = termo.trim()
  const m = /^(?:os\s*)?0*(\d+)$/i.exec(limpo)
  return m ? m[1] : ''
}

/** A OS combina com a busca: cliente, telefone, IMEI, marca/modelo, defeito ou número. */
export function osCombina(os: Pick<OS, 'numero' | 'cliente_nome' | 'cliente_telefone' | 'aparelho_serie_imei' | 'aparelho_marca_modelo' | 'defeito_relatado'>, termo: string): boolean {
  const t = normalizarBusca(termo)
  if (!t) return true
  const numero = normalizarNumeroOS(termo)
  if (numero && numero === String(os.numero)) return true
  const alvo = normalizarBusca(
    `${os.cliente_nome} ${os.cliente_telefone ?? ''} ${os.aparelho_serie_imei ?? ''} ${os.aparelho_marca_modelo ?? ''} ${os.defeito_relatado ?? ''}`,
  )
  return alvo.includes(t) || (!!numero && alvo.includes(numero))
}
