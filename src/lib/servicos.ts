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

// ─────────────────── Linha do tempo da OS ───────────────────

export type ChaveMarcoOS =
  | 'recebida'
  | 'diagnostico'
  | 'orcamento'
  | 'aprovacao'
  | 'execucao'
  | 'pronta'
  | 'entrega'
  | 'cancelada'

export type EstadoMarcoOS = 'concluido' | 'atual' | 'pendente' | 'cancelada'

/** Um marco do histórico em linha. `data` é o carimbo real; null = etapa sem carimbo próprio. */
export interface MarcoOS {
  chave: ChaveMarcoOS
  rotulo: string
  data: string | null
  por: string | null
  detalhe: string
  estado: EstadoMarcoOS
}

type OSParaMarcos = Pick<
  OS,
  | 'status'
  | 'criado_em'
  | 'criado_por_nome'
  | 'orcado_em'
  | 'aprovada_em'
  | 'aprovada_por_nome'
  | 'pronta_em'
  | 'entregue_em'
  | 'entregue_por_nome'
  | 'cancelada_em'
  | 'cancelada_por_nome'
  | 'motivo_cancelamento'
>

/**
 * Onde cada status para na linha do tempo (índice do marco atual).
 * `aberta` já tem a Recebida concluída e espera o diagnóstico; `aprovada` espera
 * a execução; `entregue` fica com todos os marcos concluídos (7 = depois do último).
 */
const ETAPA_ATUAL: Record<Exclude<StatusOS, 'cancelada'>, number> = {
  aberta: 1,
  em_diagnostico: 1,
  aguardando_aprovacao: 3,
  aprovada: 4,
  em_execucao: 4,
  pronta: 5,
  entregue: 7,
}

function baseDaOS(os: OSParaMarcos): Omit<MarcoOS, 'estado' | 'detalhe'>[] {
  return [
    { chave: 'recebida', rotulo: 'Recebida', data: os.criado_em, por: os.criado_por_nome },
    // Diagnóstico e execução não têm carimbo próprio: as datas vizinhas explicam a etapa.
    { chave: 'diagnostico', rotulo: 'Diagnóstico', data: null, por: null },
    { chave: 'orcamento', rotulo: 'Orçamento', data: os.orcado_em, por: null },
    { chave: 'aprovacao', rotulo: 'Aprovação', data: os.aprovada_em, por: os.aprovada_por_nome },
    { chave: 'execucao', rotulo: 'Execução', data: null, por: null },
    { chave: 'pronta', rotulo: 'Pronta', data: os.pronta_em, por: null },
    { chave: 'entrega', rotulo: 'Entregue', data: os.entregue_em, por: os.entregue_por_nome },
  ]
}

function detalheDoMarco(chave: ChaveMarcoOS, estado: EstadoMarcoOS, os: OSParaMarcos): string {
  switch (chave) {
    case 'recebida':
      return 'Aparelho recebido e OS aberta.'
    case 'diagnostico':
      if (estado === 'pendente') return 'Ainda não iniciado.'
      if (estado === 'atual') return 'Em análise pelo técnico.'
      return os.orcado_em
        ? `Concluído ao enviar o orçamento, em ${formatarData(os.orcado_em)}.`
        : 'Concluído ao enviar o orçamento.'
    case 'orcamento':
      return estado === 'pendente' ? 'Ainda não enviado ao cliente.' : 'Orçamento enviado para aprovação do cliente.'
    case 'aprovacao':
      return estado === 'pendente' ? 'Aguardando a resposta do cliente.' : 'Cliente aprovou o orçamento.'
    case 'execucao':
      if (estado === 'pendente') return 'Ainda não iniciada.'
      if (estado === 'atual') return 'Serviço em andamento (a data de início não é registrada).'
      return os.pronta_em ? `Concluída em ${formatarData(os.pronta_em)}.` : 'Concluída.'
    case 'pronta':
      return estado === 'pendente' ? 'Ainda não concluída.' : 'Serviço concluído; o cliente pode ser avisado.'
    case 'entrega':
      return estado === 'pendente' ? 'Ainda não entregue.' : 'Aparelho entregue ao cliente.'
    case 'cancelada':
      return os.motivo_cancelamento ? `Motivo: ${os.motivo_cancelamento}` : 'OS cancelada.'
  }
}

/**
 * Histórico da OS em marcos, sem consultar o banco. Não inventa datas: onde o
 * fluxo não registra carimbo (diagnóstico e execução), `data` fica null e o
 * detalhe explica. OS cancelada mostra só as etapas percorridas + o nó de cancelamento.
 */
export function marcosDaOS(os: OSParaMarcos): MarcoOS[] {
  const base = baseDaOS(os)

  if (os.status === 'cancelada') {
    const percorridas = base.filter((_, i) => {
      if (i === 0) return true
      if (i === 1 || i === 2) return !!os.orcado_em
      if (i === 3) return !!os.aprovada_em
      if (i === 4 || i === 5) return !!os.pronta_em
      return !!os.entregue_em
    })
    return [
      ...percorridas.map(m => ({
        ...m,
        estado: 'concluido' as const,
        detalhe: detalheDoMarco(m.chave, 'concluido', os),
      })),
      {
        chave: 'cancelada',
        rotulo: 'Cancelada',
        data: os.cancelada_em,
        por: os.cancelada_por_nome,
        detalhe: detalheDoMarco('cancelada', 'cancelada', os),
        estado: 'cancelada',
      },
    ]
  }

  const atual = ETAPA_ATUAL[os.status]
  return base.map((m, i) => {
    const estado: EstadoMarcoOS = i < atual ? 'concluido' : i === atual ? 'atual' : 'pendente'
    return { ...m, estado, detalhe: detalheDoMarco(m.chave, estado, os) }
  })
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
