/**
 * Emissão da NFC-e: na hora (síncrona), em fila (offline) e cancelamento.
 *
 * - `emitirVendaAgora`: o cliente pediu "CPF na nota" e há internet — emite já.
 * - `emitirVendasPendentes`: fila que roda ao reconectar (vendas offline).
 * - `cancelarNFCeDaVenda`: cancela a nota quando a venda é cancelada.
 */
import { numeroVenda } from '../pdv/venda'
import { listarCaixas, listarVendasPendentes, itensFiscaisDaVenda, salvarNFCe, buscarVendaParaCancelamento, type VendaPendenteNFCe } from './dados/vendas'
import { criarEmissorNFCe, emitirVenda, montarDadosNFCe, type EmissorNFCe, type ResultadoEmissao } from './nfce'

/** Emite UMA venda: monta a nota, chama o emissor e grava o resultado. */
export async function emitirUmaVenda(venda: VendaPendenteNFCe, caixaNumero: number, emissor: EmissorNFCe): Promise<ResultadoEmissao> {
  const itens = await itensFiscaisDaVenda(venda.id)
  // Item de produto excluído não tem como emitir: sai da nota (a venda continua).
  const itensValidos = itens.filter(i => i.produto !== null).map(i => ({ produto: i.produto!, quantidade: i.quantidade, valor: i.valor }))

  const dados = montarDadosNFCe({
    vendaId: venda.id,
    numero: numeroVenda(caixaNumero, venda.numero),
    caixaNumero,
    total: venda.total,
    emitidaEm: venda.ocorrido_em,
    cpf: venda.cliente_cpf,
    itens: itensValidos,
  })

  const resultado = await emitirVenda(emissor, dados)
  if (resultado.status === 'emitida') {
    await salvarNFCe(venda.id, { status: 'emitida', chave: resultado.chave, qrcode: resultado.qrcode })
  } else if (resultado.status === 'erro') {
    await salvarNFCe(venda.id, { status: 'erro' })
  }
  // 'nao_configurado': deixa pendente (emissor desligado).
  return resultado
}

/** Emite já (síncrono), para o "CPF na nota" com internet. */
export async function emitirVendaAgora(venda: VendaPendenteNFCe, caixaNumero: number, emissor: EmissorNFCe = criarEmissorNFCe()): Promise<ResultadoEmissao> {
  return emitirUmaVenda(venda, caixaNumero, emissor)
}

/** Fila: percorre as vendas pendentes (offline) e emite ao reconectar. */
export async function emitirVendasPendentes(empresaId: string, lojaId: string, emissor: EmissorNFCe = criarEmissorNFCe()): Promise<ResultadoEmissao[]> {
  const [pendentes, caixas] = await Promise.all([listarVendasPendentes(empresaId, lojaId), listarCaixas(empresaId, lojaId)])
  const numeroPorCaixa = new Map(caixas.map(c => [c.id, c.numero]))

  const resultados: ResultadoEmissao[] = []
  for (const venda of pendentes) {
    resultados.push(await emitirUmaVenda(venda, numeroPorCaixa.get(venda.caixa_id) ?? 1, emissor))
  }
  return resultados
}

/** Cancela a NFC-e da venda (quando a venda foi cancelada). */
export async function cancelarNFCeDaVenda(vendaId: string, motivo: string, emissor: EmissorNFCe = criarEmissorNFCe()): Promise<void> {
  const venda = await buscarVendaParaCancelamento(vendaId)
  if (!venda || venda.nfce_status !== 'emitida' || !venda.nfce_chave) return
  const r = await emissor.cancelar(venda.nfce_chave, motivo)
  if (r.status === 'cancelada') await salvarNFCe(vendaId, { status: 'cancelada' })
}
