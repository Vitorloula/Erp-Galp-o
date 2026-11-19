import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ClipboardList,
  Copy,
  KeyRound,
  Lock,
  Package,
  Phone,
  Printer,
  Receipt,
  Smartphone,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { BuscaProduto } from '../components/BuscaProduto'
import { ImpressaoOS, useImpressaoAutomatica, type DadosImpressaoOS } from '../components/ImpressaoOS'
import { LinhaTempoOS } from '../components/LinhaTempoOS'
import { useToast } from '../components/Toast'
import { Aviso, Modal, Nota, Secao, cx } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { os as dadosOS } from '../lib/dados'
import { formatarData, formatarDataHora, formatarNumero } from '../lib/formato'
import {
  atrasada,
  dicaGarantiaSugerida,
  faltamPagamentos,
  interpretarPagamento,
  mensagemOrcado,
  mensagemPronta,
  montarTotalOS,
  numeroOS,
  proximoStatus,
  statusPosteriores,
  sugerirGarantia,
  STATUS_OS,
} from '../lib/servicos'
import { formatarReais, NOME_FORMA } from '../pdv/venda'
import type { DetalheOS } from '../lib/dados/os'
import type { ItemOS, StatusOS } from '../lib/tipos'

const ROTULO_BOTAO: Partial<Record<StatusOS, string>> = {
  aberta: 'Iniciar diagnóstico',
  em_diagnostico: 'Enviar orçamento',
  aguardando_aprovacao: 'Cliente aprovou o orçamento',
  aprovada: 'Iniciar execução',
  em_execucao: 'Marcar como pronta',
}

const ESTILO_STATUS: Record<StatusOS, string> = {
  aberta: 'bg-slate-100 text-slate-700 ring-slate-200',
  em_diagnostico: 'bg-sky-50 text-sky-800 ring-sky-200',
  aguardando_aprovacao: 'bg-amber-50 text-amber-900 ring-amber-200',
  aprovada: 'bg-amber-50 text-amber-900 ring-amber-200',
  em_execucao: 'bg-sky-50 text-sky-800 ring-sky-200',
  pronta: 'bg-emerald-50 text-marca-escura ring-emerald-200',
  entregue: 'bg-emerald-50 text-marca-escura ring-emerald-200',
  cancelada: 'bg-red-50 text-red-800 ring-red-200',
}

const COR_STATUS: Record<StatusOS, string> = {
  aberta: 'bg-slate-400',
  em_diagnostico: 'bg-sky-500',
  aguardando_aprovacao: 'bg-amber-400',
  aprovada: 'bg-amber-400',
  em_execucao: 'bg-sky-500',
  pronta: 'bg-emerald-500',
  entregue: 'bg-emerald-500',
  cancelada: 'bg-red-500',
}

export function ServicosDetalhe() {
  const { id } = useParams()
  const { empresa, loja, pode } = useAtiva()
  const toast = useToast()
  const [detalhe, setDetalhe] = useState<DetalheOS | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroPagamento, setErroPagamento] = useState('')
  const [erroEntrega, setErroEntrega] = useState('')
  const [diagnosticoTxt, setDiagnosticoTxt] = useState('')
  const [defeitoTxt, setDefeitoTxt] = useState('')
  const [maoObra, setMaoObra] = useState(0)
  const [desconto, setDesconto] = useState(0)
  const [itens, setItens] = useState<ItemOS[]>([])
  const [garantiaDias, setGarantiaDias] = useState<number | null>(null)
  const [modalBusca, setModalBusca] = useState(false)
  const [modalAvancar, setModalAvancar] = useState(false)
  const [modalCancelar, setModalCancelar] = useState(false)
  const [modalEntregar, setModalEntregar] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [forma, setForma] = useState('01')
  const [valorPag, setValorPag] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [avancoStatus, setAvancoStatus] = useState<StatusOS | null>(null)
  /** Cada incremento manda o cupom (via portal) para a impressão, já com os dados atuais. */
  const [pedidoImpressao, setPedidoImpressao] = useState(0)

  useImpressaoAutomatica(pedidoImpressao)

  async function carregar() {
    if (!id) return
    setCarregando(true)
    try {
      const d = await dadosOS.detalheDaOrdem(id)
      setDetalhe(d)
      setItens(d.itens)
      setMaoObra(d.os.valor_mao_de_obra)
      setDesconto(d.os.desconto)
      // Ao ficar pronta, sugere a garantia das peças (o usuário ainda pode mudar).
      setGarantiaDias(d.os.garantia_dias ?? (d.os.status === 'pronta' ? sugerirGarantia(d.itens) : null))
      setDefeitoTxt(d.os.defeito_relatado ?? '')
      setDiagnosticoTxt(d.os.diagnostico ?? '')
      setErro('')
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [id])

  if (carregando) return <div className="cartao p-6 text-center text-slate-500">Carregando…</div>
  if (erro || !detalhe) return <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro || 'OS não encontrada.'}</div>

  const os = detalhe.os
  // Dinheiro em centavos; o banco devolve reais nos pagamentos.
  const totalCentavos = montarTotalOS(itens, maoObra, desconto)
  const pagoCentavos = detalhe.pagamentos.reduce((soma, p) => soma + Math.round(p.valor * 100), 0)
  const faltaCentavos = faltamPagamentos(totalCentavos, detalhe.pagamentos)
  const pctPago = totalCentavos > 0 ? Math.min(100, Math.round((pagoCentavos / totalCentavos) * 100)) : 0
  const travado = os.status === 'aprovada' || os.status === 'em_execucao' || os.status === 'pronta' || os.status === 'entregue' || os.status === 'cancelada'
  const textoOrcamentoTravado = os.status === 'entregue' ? 'OS entregue: orçamento e pagamento estão fechados.' : os.status === 'cancelada' ? 'OS cancelada: o orçamento não pode mais mudar.' : 'Orçamento aprovado pelo cliente: itens, mão de obra e desconto não podem mais mudar.'
  const podeMover = pode.moverOrdem
  const podeEntregar = pode.entregarOrdem && os.status === 'pronta'
  const dica = dicaGarantiaSugerida(itens)
  const vencida = atrasada(os)
  const aparelho = [os.aparelho_tipo, os.aparelho_marca_modelo].filter(Boolean).join(' ') || 'Aparelho'

  const tipoImpressao = os.status === 'entregue' ? 'recibo' : os.status === 'aguardando_aprovacao' ? 'orcamento' : 'comprovante'
  const dadosImpressao: DadosImpressaoOS = {
    tipo: tipoImpressao,
    numero: os.numero,
    criadoEm: os.criado_em,
    status: os.status,
    cliente: { nome: os.cliente_nome, telefone: os.cliente_telefone, documento: os.cliente_documento },
    aparelho: {
      tipo: os.aparelho_tipo,
      marcaModelo: os.aparelho_marca_modelo,
      serie: os.aparelho_serie_imei,
      cor: os.aparelho_cor,
      acessorios: os.aparelho_acessorios,
      estado: os.aparelho_estado,
    },
    defeito: defeitoTxt || os.defeito_relatado,
    diagnostico: diagnosticoTxt || os.diagnostico,
    prazo: os.prazo_prometido,
    tecnico: os.tecnico_nome,
    recebidoPor: os.criado_por_nome,
    itens,
    maoDeObra: maoObra,
    desconto,
    total: totalCentavos,
    pagamentos: detalhe.pagamentos,
    entregueEm: os.entregue_em,
    entreguePor: os.entregue_por_nome,
    garantiaDias,
    motivoCancelamento: os.motivo_cancelamento,
    empresa: empresa.nome,
    loja,
  }

  const imprimir = () => setPedidoImpressao(p => p + 1)

  async function copiarIMEI() {
    if (!os.aparelho_serie_imei) return
    try {
      await navigator.clipboard.writeText(os.aparelho_serie_imei)
      toast.sucesso('IMEI copiado.')
    } catch {
      toast.erro('Não foi possível copiar.')
    }
  }

  async function salvarDiagnostico() {
    if (!id) return
    setSalvando(true)
    try {
      await dadosOS.salvarOrdem(id, { defeito_relatado: defeitoTxt, diagnostico: diagnosticoTxt })
      toast.sucesso('Diagnóstico salvo.')
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function salvarOrcamento() {
    if (!id) return
    setSalvando(true)
    try {
      await dadosOS.definirItens(id, itens.map((it) => ({
        origem: it.origem,
        produto_id: it.produto_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
      })))
      await dadosOS.salvarOrdem(id, { valor_mao_de_obra: maoObra, desconto })
      toast.sucesso('Orçamento salvo.')
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function avancarStatus(status: StatusOS) {
    if (!id) return
    setSalvando(true)
    try {
      if (status === 'aguardando_aprovacao') {
        // O CTA do topo também salva o diagnóstico: antes, o texto digitado era perdido
        // ao enviar o orçamento sem clicar em "Salvar diagnóstico".
        await dadosOS.salvarOrdem(id, {
          valor_mao_de_obra: maoObra,
          desconto,
          defeito_relatado: defeitoTxt.trim() || null,
          diagnostico: diagnosticoTxt.trim() || null,
        })
        await dadosOS.definirItens(id, itens.map(it => ({ origem: it.origem, produto_id: it.produto_id, descricao: it.descricao, quantidade: it.quantidade, preco_unitario: it.preco_unitario })))
      }
      await dadosOS.mudarStatus(id, status)
      if (status === 'aguardando_aprovacao') toast.sucesso('Orçamento enviado.')
      else if (status === 'aprovada') toast.sucesso('Aprovação registrada.')
      else toast.sucesso('Status atualizado.')
      setModalAvancar(false)
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function registrarPagamento() {
    if (!id) return
    setErroPagamento('')
    const lido = interpretarPagamento(valorPag, faltaCentavos)
    if (lido.erro || lido.valor === null) {
      setErroPagamento(lido.erro ?? 'Valor inválido.')
      return
    }
    setSalvando(true)
    try {
      await dadosOS.registrarPagamento(empresa.empresa_id, loja.id, id, forma, lido.valor)
      setValorPag('')
      toast.sucesso(`Pagamento de ${formatarReais(Math.round(lido.valor * 100))} registrado.`)
      await carregar()
    } catch (er) {
      setErroPagamento((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function entregar() {
    if (!id) return
    if (faltaCentavos > 0) {
      setErroEntrega(`Falta receber ${formatarReais(faltaCentavos)} para entregar a OS.`)
      return
    }
    setErroEntrega('')
    setSalvando(true)
    try {
      if (garantiaDias !== os.garantia_dias) await dadosOS.salvarOrdem(id, { garantia_dias: garantiaDias })
      await dadosOS.mudarStatus(id, 'entregue')
      setModalEntregar(false)
      toast.sucesso('Aparelho entregue. Recibo liberado para impressão.')
      await carregar()
      imprimir()
    } catch (er) {
      setErroEntrega((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar() {
    if (!id || motivoCancel.trim().length < 3) return
    setSalvando(true)
    try {
      await dadosOS.mudarStatus(id, 'cancelada', motivoCancel)
      toast.sucesso(`${numeroOS(os.numero)} cancelada.`)
      setModalCancelar(false)
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function copiarMensagem() {
    let texto = ''
    if (os.status === 'aguardando_aprovacao') texto = mensagemOrcado(os, totalCentavos)
    else if (os.status === 'pronta') texto = mensagemPronta({ ...os, garantia_dias: garantiaDias }, totalCentavos)
    try {
      await navigator.clipboard.writeText(texto)
      toast.sucesso('Mensagem copiada. Cole no WhatsApp do cliente.')
    } catch { toast.erro('Não foi possível copiar.') }
  }

  const proximo = proximoStatus(os.status)
  const posteriores: StatusOS[] = statusPosteriores(os.status)

  return (
    <div className="space-y-4">
      {/* Cabeçalho da OS */}
      <section className="cartao p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link to="/os" className="inline-flex items-center gap-1 text-[11px] font-semibold text-texto-secundario transition hover:text-ponto">
              <ArrowLeft className="size-3.5" /> Ordens de serviço
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-9 tracking-[-1px] text-ponto sm:text-[30px]">{numeroOS(os.numero)}</h1>
              <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', ESTILO_STATUS[os.status])}>
                <span className={cx('size-1.5 rounded-full', COR_STATUS[os.status])} />
                {STATUS_OS[os.status]}
              </span>
              {vencida && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">Atrasada</span>}
            </div>

            <p className="mt-1.5 text-sm text-texto-secundario">
              <strong className="font-semibold text-slate-800">{os.cliente_nome}</strong>
              {os.cliente_telefone && (
                <>
                  {' · '}
                  <a href={`tel:${os.cliente_telefone.replace(/\D/g, '')}`} className="hover:text-ponto hover:underline">{os.cliente_telefone}</a>
                </>
              )}
              <span className="mx-1.5 text-slate-300">|</span>
              {aparelho}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                Prazo: {os.prazo_prometido ? formatarData(os.prazo_prometido) : 'a combinar'}
              </span>
              {os.tecnico_nome && (
                <span className="inline-flex items-center gap-1"><Wrench className="size-3.5" /> Técnico: {os.tecnico_nome}</span>
              )}
              {os.criado_por_nome && (
                <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" /> Recebido por {os.criado_por_nome}</span>
              )}
              <span className="inline-flex items-center gap-1"><ClipboardList className="size-3.5" /> Aberta em {formatarDataHora(os.criado_em)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={imprimir}
              aria-label={tipoImpressao === 'recibo' ? 'Imprimir recibo de entrega' : tipoImpressao === 'orcamento' ? 'Imprimir orçamento' : 'Imprimir comprovante de recebimento'}
            >
              <Printer className="size-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            {(os.status === 'aguardando_aprovacao' || os.status === 'pronta') && (
              <button type="button" className="btn btn-secundario" onClick={copiarMensagem} aria-label={os.status === 'aguardando_aprovacao' ? 'Copiar mensagem do orçamento' : 'Copiar mensagem de aparelho pronto'}>
                <Copy className="size-4" />
                <span className="hidden sm:inline">Copiar</span>
              </button>
            )}
            {pode.cancelarOrdem && os.status !== 'entregue' && os.status !== 'cancelada' && (
              <button type="button" className="btn btn-perigo" onClick={() => setModalCancelar(true)} aria-label="Cancelar OS">
                <X className="size-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            )}
          </div>
        </div>

        {proximo && podeMover && os.status !== 'pronta' && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-borda-loja pt-3.5">
            <button type="button" className="btn btn-primario w-full sm:w-auto" disabled={salvando} onClick={() => avancarStatus(proximo)}>
              {ROTULO_BOTAO[os.status] ?? 'Avançar'}
            </button>
            <button type="button" className="btn btn-fantasma text-xs" onClick={() => setModalAvancar(true)}>Avançar para outro status</button>
          </div>
        )}
      </section>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <LinhaTempoOS os={os} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Conteúdo principal */}
        <div className="order-2 space-y-4 lg:order-1">
          <Secao icone={Wrench} titulo="Diagnóstico" descricao="Defeito relatado e análise técnica">
            <div className="space-y-3">
              <div>
                <label className="rotulo" htmlFor="defeito">Defeito relatado</label>
                <textarea id="defeito" className="campo" rows={2} value={defeitoTxt} onChange={e => setDefeitoTxt(e.target.value)} disabled={travado || !podeMover} />
              </div>
              <div>
                <label className="rotulo" htmlFor="diagnostico">Diagnóstico</label>
                <textarea id="diagnostico" className="campo" rows={2} value={diagnosticoTxt} onChange={e => setDiagnosticoTxt(e.target.value)} disabled={travado || !podeMover} />
              </div>
            </div>
            {podeMover && !travado && (
              <div className="mt-3">
                <button type="button" className="btn btn-secundario" disabled={salvando} onClick={salvarDiagnostico}>Salvar diagnóstico</button>
              </div>
            )}
          </Secao>

          <Secao
            icone={Package}
            titulo="Orçamento"
            descricao="Peças, mão de obra e desconto"
            acao={<span className="text-[11px] text-slate-400">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>}
          >
            {travado && <Nota icone={Lock} className="mb-3">{textoOrcamentoTravado}</Nota>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="mao-obra">Mão de obra (R$)</label>
                <input id="mao-obra" className="campo" inputMode="decimal" value={maoObra} onChange={e => setMaoObra(Number(e.target.value.replace(',', '.')) || 0)} disabled={travado || !podeMover} />
              </div>
              <div>
                <label className="rotulo" htmlFor="desconto">Desconto (R$)</label>
                <input id="desconto" className="campo" inputMode="decimal" value={desconto} onChange={e => setDesconto(Number(e.target.value.replace(',', '.')) || 0)} disabled={travado || !podeMover} />
              </div>
            </div>

            {itens.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-borda-loja">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-borda-loja bg-superficie text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-2.5 py-2 font-semibold">Item</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Qtd</th>
                      <th className="hidden px-2.5 py-2 text-right font-semibold sm:table-cell">Unitário</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Total</th>
                      <th className="w-8 px-1" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itens.map((it, idx) => (
                      <tr key={it.id ?? idx} className="align-middle">
                        <td className="px-2.5 py-2">
                          <span className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                            <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', it.origem === 'estoque' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600')}>
                              {it.origem === 'estoque' ? 'Estoque' : 'Avulsa'}
                            </span>
                            <span className="min-w-0">{it.descricao}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{formatarNumero(it.quantidade)}</td>
                        <td className="hidden whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-slate-600 sm:table-cell">{formatarReais(Math.round(it.preco_unitario * 100))}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-medium tabular-nums">{formatarReais(Math.round(it.quantidade * it.preco_unitario * 100))}</td>
                        <td className="px-1 text-center">
                          {!travado && podeMover && (
                            <button type="button" className="rounded p-1 text-red-600 transition hover:bg-red-50" aria-label={`Remover ${it.descricao}`} onClick={() => setItens(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="size-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-superficie px-3 py-2 text-[11px] text-slate-500">Nenhuma peça adicionada ao orçamento.</p>
            )}

            {!travado && podeMover && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secundario" onClick={() => setModalBusca(true)}>Adicionar peça do estoque</button>
                <button type="button" className="btn btn-secundario" onClick={() => {
                  const desc = window.prompt('Descrição do item avulso')
                  if (!desc) return
                  const qtd = Number(window.prompt('Quantidade', '1')?.replace(',', '.') || '1')
                  const preco = Number(window.prompt('Preço unitário (R$)', '0')?.replace(',', '.') || '0')
                  setItens(prev => [...prev, { id: `tmp-${Date.now()}`, os_id: os.id, ordem: prev.length + 1, origem: 'avulsa', produto_id: null, descricao: desc, quantidade: qtd, preco_unitario: preco, total: qtd * preco, baixado_em: null, garantia_meses: null }])
                }}>Adicionar item avulso</button>
              </div>
            )}

            <div className="mt-3 flex justify-end border-t border-borda-loja pt-2">
              <div className="w-full max-w-[280px] space-y-1 text-sm">
                <div className="flex items-center justify-between gap-3 text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatarReais(montarTotalOS(itens, maoObra, 0))}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-slate-600">
                  <span>Desconto</span>
                  <span className="tabular-nums">{formatarReais(Math.round(desconto * 100))}</span>
                </div>
                <p className="border-t border-borda-loja pt-1 text-right font-semibold text-ponto">Total: {formatarReais(totalCentavos)}</p>
              </div>
            </div>

            {!travado && podeMover && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primario" disabled={salvando} onClick={salvarOrcamento}>Salvar orçamento</button>
                <button type="button" className="btn btn-secundario" disabled={salvando} onClick={carregar}>Descartar</button>
              </div>
            )}
          </Secao>

          {podeEntregar && (
            <Secao icone={Receipt} titulo="Entrega e pagamento" descricao="Receba o pagamento e confirme a entrega">
              <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
                <div className="rounded-xl border border-borda-loja bg-superficie px-2 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
                  <p className="mt-0.5 text-[13px] font-bold tabular-nums text-ponto">{formatarReais(totalCentavos)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-marca-escura/70">Pago</p>
                  <p className="mt-0.5 text-[13px] font-bold tabular-nums text-marca-escura">{formatarReais(pagoCentavos)}</p>
                </div>
                <div className={cx('rounded-xl border px-2 py-2.5', faltaCentavos > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50')}>
                  <p className={cx('text-[10px] font-semibold uppercase tracking-wide', faltaCentavos > 0 ? 'text-red-700/70' : 'text-marca-escura/70')}>
                    {faltaCentavos > 0 ? 'Falta' : 'Tudo pago'}
                  </p>
                  <p className={cx('mt-0.5 text-[13px] font-bold tabular-nums', faltaCentavos > 0 ? 'text-red-800' : 'text-marca-escura')}>{formatarReais(faltaCentavos)}</p>
                </div>
              </div>

              <div className="mt-3">
                <p className="rotulo">Forma de pagamento</p>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
                  {Object.entries(NOME_FORMA as Record<string, string>).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      className={cx('rounded-lg border px-2 py-2 text-xs font-medium transition', forma === k ? 'border-ponto bg-ponto text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-superficie')}
                      onClick={() => setForma(k)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {faltaCentavos > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-inset ring-amber-200">
                  <span>Falta receber {formatarReais(faltaCentavos)} para liberar a entrega.</span>
                  <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setValorPag(formatarReais(faltaCentavos))}>
                    Receber o que falta ({formatarReais(faltaCentavos)})
                  </button>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <input
                  className="campo flex-1"
                  inputMode="decimal"
                  placeholder={faltaCentavos > 0 ? `Valor recebido (vazio = ${formatarReais(faltaCentavos)})` : 'Tudo pago'}
                  value={valorPag}
                  onChange={e => { setValorPag(e.target.value); setErroPagamento('') }}
                  disabled={salvando || faltaCentavos === 0}
                />
                <button type="button" className="btn btn-secundario" disabled={salvando || faltaCentavos === 0} onClick={registrarPagamento}>Registrar pagamento</button>
              </div>
              {erroPagamento && <div className="mt-2"><Aviso tom="erro">{erroPagamento}</Aviso></div>}

              <div className="mt-3 rounded-xl bg-superficie p-3 ring-1 ring-inset ring-borda-loja">
                <label className="rotulo" htmlFor="garantia">Garantia (dias)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input id="garantia" className="campo w-24" inputMode="numeric" value={garantiaDias ?? ''} onChange={e => setGarantiaDias(e.target.value.trim() ? Number(e.target.value) : null)} />
                  <button type="button" className="btn btn-fantasma text-xs" onClick={() => setGarantiaDias(sugerirGarantia(itens))}>
                    Usar sugestão ({sugerirGarantia(itens)} dias)
                  </button>
                  {garantiaDias !== os.garantia_dias && (
                    <button type="button" className="btn btn-secundario text-xs" disabled={salvando} onClick={() => dadosOS.salvarOrdem(os.id, { garantia_dias: garantiaDias }).then(() => { toast.sucesso('Garantia salva.'); carregar() }).catch(er => setErro((er as Error).message))}>Salvar garantia</button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{dica}</p>
              </div>

              <button
                type="button"
                className="btn btn-primario btn-grande mt-3 w-full"
                disabled={salvando || faltaCentavos > 0}
                onClick={() => { setErroEntrega(''); setModalEntregar(true) }}
              >
                Entregar
              </button>
              {faltaCentavos > 0 && <p className="mt-1 text-center text-[11px] text-slate-500">Registre o pagamento total para liberar a entrega.</p>}
            </Secao>
          )}

          {os.status === 'pronta' && !pode.entregarOrdem && (
            <Nota className="mb-3">A entrega é feita por dono, gerente ou caixa. Peça para um deles registrar o pagamento e entregar a OS.</Nota>
          )}
        </div>

        {/* Resumo e financeiro */}
        <aside className="order-1 space-y-4 self-start lg:order-2 lg:sticky lg:top-4">
          <Secao icone={Smartphone} titulo="Resumo" descricao="Cliente e aparelho">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Campo rotulo="Cliente" className="col-span-2">{os.cliente_nome}</Campo>
              {os.cliente_telefone && (
                <Campo rotulo="Telefone">
                  <a href={`tel:${os.cliente_telefone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 hover:text-ponto hover:underline">
                    <Phone className="size-3" /> {os.cliente_telefone}
                  </a>
                </Campo>
              )}
              {os.cliente_documento && <Campo rotulo="CPF/CNPJ">{os.cliente_documento}</Campo>}
              <Campo rotulo="Aparelho" className="col-span-2">{aparelho}</Campo>
              {os.aparelho_serie_imei && (
                <Campo rotulo="IMEI / série" className="col-span-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[12px]">{os.aparelho_serie_imei}</span>
                    <button type="button" className="rounded p-0.5 text-slate-400 transition hover:bg-superficie hover:text-ponto" onClick={copiarIMEI} aria-label="Copiar IMEI">
                      <Copy className="size-3" />
                    </button>
                  </span>
                </Campo>
              )}
              {os.aparelho_cor && <Campo rotulo="Cor">{os.aparelho_cor}</Campo>}
              <Campo rotulo="Senha">
                <button type="button" className="inline-flex items-center gap-1 text-marca-escura underline decoration-dotted underline-offset-2" onClick={() => setMostrarSenha(s => !s)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                  <KeyRound className="size-3" />
                  {mostrarSenha ? (os.aparelho_senha || '—') : '••••••'}
                </button>
              </Campo>
              {os.aparelho_acessorios && <Campo rotulo="Acessórios" className="col-span-2">{os.aparelho_acessorios}</Campo>}
              {os.aparelho_estado && <Campo rotulo="Estado" className="col-span-2">{os.aparelho_estado}</Campo>}
              {os.tecnico_nome && <Campo rotulo="Técnico">{os.tecnico_nome}</Campo>}
              {os.criado_por_nome && <Campo rotulo="Recebido por" className={os.tecnico_nome ? undefined : 'col-span-2'}>{os.criado_por_nome}</Campo>}
              <Campo rotulo="Aberta em" className="col-span-2">{formatarDataHora(os.criado_em)}</Campo>
              <Campo rotulo="Prazo" className="col-span-2">{os.prazo_prometido ? formatarData(os.prazo_prometido) : 'A combinar'}</Campo>
            </dl>
          </Secao>

          <Secao icone={Banknote} titulo="Financeiro" descricao={os.status === 'entregue' ? 'Pagamento e entrega' : 'Total, pagamentos e saldo'}>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg bg-superficie p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
                <p className="mt-0.5 text-[13px] font-bold tabular-nums text-ponto">{formatarReais(totalCentavos)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-marca-escura/70">Pago</p>
                <p className="mt-0.5 text-[13px] font-bold tabular-nums text-marca-escura">{formatarReais(pagoCentavos)}</p>
              </div>
              <div className={cx('rounded-lg p-2', faltaCentavos > 0 ? 'bg-red-50' : 'bg-emerald-50')}>
                <p className={cx('text-[10px] font-semibold uppercase tracking-wide', faltaCentavos > 0 ? 'text-red-700/70' : 'text-marca-escura/70')}>
                  {faltaCentavos > 0 ? 'Falta' : 'Quitado'}
                </p>
                <p className={cx('mt-0.5 text-[13px] font-bold tabular-nums', faltaCentavos > 0 ? 'text-red-800' : 'text-marca-escura')}>{formatarReais(faltaCentavos)}</p>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pctPago}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {pagoCentavos > 0 ? `${pctPago}% pago` : 'Nenhum pagamento registrado'}
              </p>
            </div>

            {detalhe.pagamentos.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100">
                {detalhe.pagamentos.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{(NOME_FORMA as Record<string, string>)[p.forma] ?? p.forma}</span>
                      <span className="block text-[10px] text-slate-400">
                        {formatarDataHora(p.registrado_em)}
                        {p.registrado_por_nome ? ` · ${p.registrado_por_nome}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatarReais(Math.round(p.valor * 100))}</span>
                  </li>
                ))}
              </ul>
            )}

            {os.status === 'entregue' && (
              <p className="mt-2 border-t border-borda-loja pt-2 text-[11px] text-slate-500">
                Entregue em {os.entregue_em ? formatarData(os.entregue_em.slice(0, 10)) : '—'}
                {os.entregue_por_nome ? ` por ${os.entregue_por_nome}` : ''}.
              </p>
            )}
          </Secao>
        </aside>
      </div>

      {/* Cupom (comprovante, orçamento ou recibo) — portal no <body>, ver index.css */}
      <ImpressaoOS dados={dadosImpressao} />

      {/* Modal avançar */}
      <Modal aberto={modalAvancar} aoFechar={() => setModalAvancar(false)} titulo="Avançar status">
        <div className="space-y-2">
          {posteriores.map((s: StatusOS) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name="status" value={s} checked={avancoStatus === s} onChange={() => setAvancoStatus(s)} />
              {STATUS_OS[s]}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalAvancar(false)}>Voltar</button>
          <button type="button" className="btn btn-primario flex-1" disabled={!avancoStatus || salvando} onClick={() => avancoStatus && avancarStatus(avancoStatus)}>Avançar</button>
        </div>
      </Modal>

      {/* Modal cancelar */}
      <Modal aberto={modalCancelar} aoFechar={() => setModalCancelar(false)} titulo="Cancelar ordem de serviço">
        <p className="text-sm text-slate-600">A OS fica registrada como Cancelada, com o seu nome, e não pode mais ser alterada.</p>
        <label className="rotulo" htmlFor="motivo">Motivo *</label>
        <textarea id="motivo" className="campo" rows={3} placeholder="Ex.: cliente não aprovou o orçamento" value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} />
        {motivoCancel.trim().length > 0 && motivoCancel.trim().length < 3 && <p className="text-xs text-red-600">Descreva o motivo (mínimo de 3 letras).</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalCancelar(false)}>Voltar</button>
          <button type="button" className="btn btn-perigo flex-1" disabled={salvando || motivoCancel.trim().length < 3} onClick={cancelar}>Cancelar OS</button>
        </div>
      </Modal>

      {/* Modal entregar */}
      <Modal aberto={modalEntregar} aoFechar={() => setModalEntregar(false)} titulo="Entregar">
        <p className="text-sm text-slate-600">Entregar o aparelho para {os.cliente_nome}? As peças do estoque são baixadas agora e a OS {numeroOS(os.numero)} não pode mais ser alterada.</p>
        {erroEntrega && <div className="mt-3"><Aviso tom="erro">{erroEntrega}</Aviso></div>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalEntregar(false)}>Voltar</button>
          <button type="button" className="btn btn-primario flex-1" disabled={salvando} onClick={entregar}>Entregar</button>
        </div>
      </Modal>

      {/* Modal busca peça */}
      <Modal aberto={modalBusca} aoFechar={() => setModalBusca(false)} titulo="Adicionar peça do estoque">
        <BuscaProduto aoSelecionar={p => {
          setItens(prev => [...prev, { id: `tmp-${Date.now()}`, os_id: os.id, ordem: prev.length + 1, origem: 'estoque', produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unitario: p.preco_venda ?? 0, total: (p.preco_venda ?? 0), baixado_em: null, garantia_meses: p.garantia_meses }])
          setModalBusca(false)
        }} />
      </Modal>
    </div>
  )
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-0.5 text-[13px] leading-5 text-slate-800">{children}</dd>
    </div>
  )
}
