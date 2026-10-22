/**
 * Fila de emissão da NFC-e.
 *
 * Percorre as vendas com `nfce_status = 'pendente'` (ex.: caixa que vendeu
 * offline), monta os dados da nota e chama o emissor. Quando o emissor
 * responde "emitida", grava a chave e o QR Code na venda.
 *
 * É o ponto que roda ao reconectar: basta chamar `emitirVendasPendentes`
 * depois de uma sincronização bem-sucedida.
 */
import { numeroVenda } from '../pdv/venda'
import { listarCaixas, listarVendasPendentes, itensFiscaisDaVenda, salvarNFCe } from './dados/vendas'
import { criarEmissorNFCe, emitirVenda, montarDadosNFCe, type EmissorNFCe, type ResultadoEmissao } from './nfce'

export async function emitirVendasPendentes(
  empresaId: string,
  lojaId: string,
  emissor: EmissorNFCe = criarEmissorNFCe(),
): Promise<ResultadoEmissao[]> {
  const [pendentes, caixas] = await Promise.all([listarVendasPendentes(empresaId, lojaId), listarCaixas(empresaId, lojaId)])
  const numeroPorCaixa = new Map(caixas.map(c => [c.id, c.numero]))

  const resultados: ResultadoEmissao[] = []
  for (const venda of pendentes) {
    const caixaNumero = numeroPorCaixa.get(venda.caixa_id) ?? 1
    const itens = await itensFiscaisDaVenda(venda.id)
    // Item de produto excluído não tem como emitir: sai da nota (a venda continua).
    const itensValidos = itens.filter(i => i.produto !== null).map(i => ({ produto: i.produto!, quantidade: i.quantidade, valor: i.valor }))

    const dados = montarDadosNFCe({
      vendaId: venda.id,
      numero: numeroVenda(caixaNumero, venda.numero),
      caixaNumero,
      total: venda.total,
      emitidaEm: venda.ocorrido_em,
      itens: itensValidos,
    })

    const resultado = await emitirVenda(emissor, dados)
    if (resultado.status === 'emitida') {
      await salvarNFCe(venda.id, { status: 'emitida', chave: resultado.chave, qrcode: resultado.qrcode })
    } else if (resultado.status === 'erro') {
      await salvarNFCe(venda.id, { status: 'erro' })
    }
    // 'nao_configurado': deixa pendente (emissor desligado).
    resultados.push(resultado)
  }
  return resultados
}
