import { CircleCheck, CircleHelp, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDados } from '../contexto/Dados'
import { vendas as dados } from '../lib/dados'
import type { Caixa, ItemVenda, PagamentoVenda, Venda, VendaFilaNFCe } from '../lib/dados/vendas'
import { emitirUmaVenda } from '../lib/emissao'
import { formatarDataHora, formatarHora, formatarNumero, hojeISO } from '../lib/formato'
import { criarEmissorNFCe } from '../lib/nfce'
import { NOME_FORMA, centavos, formatarReais, numeroVenda, type FormaPagamento } from '../pdv/venda'
import { useToast } from './Toast'
import { Aviso, Carregando, Modal, Vazio, cx } from './ui'

/** Rótulo e cor de cada estado da NFC-e (usado na lista de vendas e na fila). */
export const NFCE_STATUS: Record<Venda['nfce_status'], { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Nota pendente', classe: 'bg-amber-100 text-amber-800 ring-amber-200' },
  emitida: { rotulo: 'Nota emitida', classe: 'bg-emerald-100 text-marca-escura ring-emerald-200' },
  cancelada: { rotulo: 'Nota cancelada', classe: 'bg-slate-100 text-slate-600 ring-slate-200' },
  erro: { rotulo: 'Nota com erro', classe: 'bg-red-100 text-red-800 ring-red-200' },
  resolvida: { rotulo: 'Nota resolvida', classe: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

const quando = (iso: string) => (hojeISO(new Date(iso)) === hojeISO() ? formatarHora(iso) : formatarDataHora(iso))

/**
 * Aba "Fila NFC-e" de Vendas: vendas concluídas com nota pendente ou com erro.
 * A lista é estado atual (sem período) e cada ação recarrega pelo `useDados`.
 */
export function FilaNFCe({
  empresaId,
  lojaId,
  caixas,
  podeGerenciar,
  emissorConfigurado,
}: {
  empresaId: string
  lojaId: string
  caixas: Map<string, Caixa>
  podeGerenciar: boolean
  emissorConfigurado: boolean
}) {
  const toast = useToast()
  const { versao, recarregar } = useDados()
  const [fila, setFila] = useState<VendaFilaNFCe[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [reemitindo, setReemitindo] = useState('')
  const [aberta, setAberta] = useState<VendaFilaNFCe | null>(null)
  const [resolvendo, setResolvendo] = useState<VendaFilaNFCe | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    setErro('')
    dados.listarVendasFilaNFCe(empresaId, lojaId).then(
      f => ativo && setFila(f),
      e => ativo && setErro((e as Error).message),
    )
    return () => {
      ativo = false
    }
  }, [empresaId, lojaId, versao])

  const rotulo = (v: VendaFilaNFCe) => numeroVenda(caixas.get(v.caixa_id)?.numero ?? 0, v.numero)
  const pendentes = (fila ?? []).filter(v => v.nfce_status === 'pendente').length
  const comErro = (fila ?? []).filter(v => v.nfce_status === 'erro').length

  async function reemitir(v: VendaFilaNFCe) {
    setAviso('')
    setErroAcao('')
    if (!emissorConfigurado) {
      setAviso('Integração NFC-e não configurada')
      return
    }
    setReemitindo(v.id)
    try {
      const resultado = await emitirUmaVenda(v, caixas.get(v.caixa_id)?.numero ?? 1, criarEmissorNFCe())
      if (resultado.status === 'emitida') toast.sucesso(`Nota da venda ${rotulo(v)} emitida.`)
      else if (resultado.status === 'nao_configurado') setAviso('Integração NFC-e não configurada')
      else {
        toast.erro(`Falha ao reemitir a nota da venda ${rotulo(v)}.`)
        setAviso(resultado.mensagem ?? '')
      }
      await recarregar()
      setAberta(null)
    } catch (e) {
      const mensagem = (e as Error).message
      toast.erro(`Falha ao reemitir a nota da venda ${rotulo(v)}.`)
      setErroAcao(mensagem)
    } finally {
      setReemitindo('')
    }
  }

  function abrirResolucao(v: VendaFilaNFCe) {
    setMotivo('')
    setErroAcao('')
    setResolvendo(v)
  }

  async function resolver() {
    if (!resolvendo) return
    setSalvando(true)
    setErroAcao('')
    try {
      await dados.marcarNFCeResolvida(resolvendo.id, motivo)
      toast.sucesso(`Venda ${rotulo(resolvendo)} marcada como resolvida.`)
      setResolvendo(null)
      setAberta(null)
      setMotivo('')
      await recarregar()
    } catch (e) {
      const mensagem = (e as Error).message
      toast.erro(`Falha ao marcar a venda ${rotulo(resolvendo)} como resolvida.`)
      setErroAcao(mensagem)
    } finally {
      setSalvando(false)
    }
  }

  if (erro) {
    return (
      <Aviso tom="erro">
        <span className="flex flex-wrap items-center gap-3">
          Não foi possível carregar a fila da NFC-e. Tente novamente.
          <button type="button" className="btn btn-secundario min-h-11" onClick={() => void recarregar()}>
            Tentar novamente
          </button>
        </span>
      </Aviso>
    )
  }
  if (!fila) return <Carregando texto="Carregando fila da NFC-e…" />
  if (!fila.length)
    return (
      <div className="cartao">
        <Vazio icone={CircleCheck} titulo="Sem vendas na fila da NFC-e" texto="Todas as notas estão em dia." />
      </div>
    )

  return (
    <div className="space-y-3">
      <Aviso tom="info">
        {pendentes} pendentes · {comErro} com erro
      </Aviso>
      {aviso && !aberta && <Aviso tom="alerta">{aviso}</Aviso>}
      {reemitindo && !aberta && <Aviso tom="info">Reemitindo nota…</Aviso>}
      {erroAcao && !aberta && <Aviso tom="erro">{erroAcao}</Aviso>}

      <div className="cartao divide-y divide-slate-100 overflow-hidden">
        {fila.map(v => {
          const status = NFCE_STATUS[v.nfce_status]
          const r = rotulo(v)
          const reem = reemitindo === v.id
          return (
            <div key={v.id} data-fila-venda={r} className="flex items-stretch gap-1 py-1 pr-2 pl-3 sm:items-center sm:gap-2 sm:pr-3 sm:pl-4">
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-slate-50"
                aria-label={`Ver venda ${r} na fila da NFC-e`}
                onClick={() => {
                  setAviso('')
                  setErroAcao('')
                  setAberta(v)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">
                    {r} <span className="font-normal text-slate-500">· {caixas.get(v.caixa_id)?.nome}</span>
                  </span>
                  <span className="block text-xs text-slate-500">
                    {quando(v.ocorrido_em)} · {v.operador_nome}
                  </span>
                  <span className="mt-0.5 block font-bold tabular-nums">{formatarReais(centavos(v.total))}</span>
                </span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', status.classe)}>{status.rotulo}</span>
              </button>
              {podeGerenciar && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="btn btn-fantasma min-h-11 min-w-11 p-2"
                    aria-label={`Reemitir NFC-e da venda ${r}`}
                    title="Reemitir"
                    disabled={reem}
                    onClick={() => void reemitir(v)}
                  >
                    {reem ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />}
                  </button>
                  {v.nfce_erro && (
                    <button
                      type="button"
                      className="btn btn-fantasma min-h-11 min-w-11 p-2"
                      aria-label={`Ver detalhe do erro da venda ${r}`}
                      title="Ver detalhe do erro"
                      onClick={() => setAberta(v)}
                    >
                      <CircleHelp className="size-5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-fantasma min-h-11 min-w-11 p-2"
                    aria-label={`Marcar venda ${r} como resolvida`}
                    title="Marcar resolvida"
                    onClick={() => abrirResolucao(v)}
                  >
                    <CircleCheck className="size-5" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <DetalheFila
        venda={aberta}
        rotulo={aberta ? rotulo(aberta) : ''}
        podeGerenciar={podeGerenciar}
        reemitindo={reemitindo === aberta?.id}
        aviso={aviso}
        erroAcao={erroAcao}
        aoFechar={() => setAberta(null)}
        aoReemitir={v => void reemitir(v)}
        aoResolver={v => abrirResolucao(v)}
      />

      <Modal
        aberto={!!resolvendo}
        aoFechar={() => {
          setResolvendo(null)
          setMotivo('')
          setErroAcao('')
        }}
        titulo={resolvendo ? `Marcar venda ${rotulo(resolvendo)} como resolvida` : 'Marcar como resolvida'}
      >
        {resolvendo && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              A venda sai da fila da NFC-e e não será reemitida. Informe o motivo para o histórico.
            </p>
            {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <label className="rotulo" htmlFor="motivo-resolucao">
                Motivo da resolução *
              </label>
              <input id="motivo-resolucao" className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
            </div>
            <button className="btn w-full" disabled={motivo.trim().length < 3 || salvando} onClick={() => void resolver()}>
              {salvando ? 'Salvando…' : 'Marcar como resolvida'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function DetalheFila({
  venda,
  rotulo,
  podeGerenciar,
  reemitindo,
  aviso,
  erroAcao,
  aoFechar,
  aoReemitir,
  aoResolver,
}: {
  venda: VendaFilaNFCe | null
  rotulo: string
  podeGerenciar: boolean
  reemitindo: boolean
  aviso: string
  erroAcao: string
  aoFechar: () => void
  aoReemitir: (v: VendaFilaNFCe) => void
  aoResolver: (v: VendaFilaNFCe) => void
}) {
  const [detalhe, setDetalhe] = useState<{ itens: ItemVenda[]; pagamentos: PagamentoVenda[] } | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setDetalhe(null)
    setErro('')
    if (venda) dados.detalheDaVenda(venda.id).then(setDetalhe, e => setErro((e as Error).message))
  }, [venda])

  const status = venda ? NFCE_STATUS[venda.nfce_status] : null

  return (
    <Modal aberto={!!venda} aoFechar={aoFechar} titulo={`Venda ${rotulo} · Fila NFC-e`}>
      {venda && status && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {formatarDataHora(venda.ocorrido_em)} · {venda.operador_nome}
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <span className={cx('inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset', status.classe)}>{status.rotulo}</span>
            {venda.nfce_erro && (
              <div className="mt-2">
                <p className="font-semibold text-slate-800">Motivo do erro</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{venda.nfce_erro}</p>
              </div>
            )}
          </div>
          {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}
          {aviso && <Aviso tom="alerta">{aviso}</Aviso>}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {!detalhe ? (
            <Carregando />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {detalhe.itens.map(i => (
                  <li key={i.id} className="flex justify-between gap-3 py-1.5">
                    <span>
                      {i.descricao}
                      <span className="block text-xs text-slate-500">
                        {formatarNumero(i.quantidade)} {i.unidade} × {formatarReais(centavos(i.preco_unitario))}
                        {i.desconto > 0 && ` · desconto ${formatarReais(centavos(i.desconto))}`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatarReais(centavos(i.total))}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-0.5 border-t border-slate-200 pt-2">
                <p className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatarReais(centavos(venda.total))}</span>
                </p>
                {detalhe.pagamentos.map((p, k) => (
                  <p key={k} className="flex justify-between text-slate-600">
                    <span>{NOME_FORMA[p.forma as FormaPagamento] ?? p.forma}</span>
                    <span>{formatarReais(centavos(p.valor))}</span>
                  </p>
                ))}
              </div>
            </>
          )}
          {podeGerenciar && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn btn-secundario min-h-11" disabled={reemitindo} onClick={() => aoReemitir(venda)}>
                {reemitindo ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden /> : <RotateCcw className="size-4.5" aria-hidden />}
                {reemitindo ? 'Reemitindo…' : 'Reemitir'}
              </button>
              <button className="btn btn-secundario min-h-11" onClick={() => aoResolver(venda)}>
                <CircleCheck className="size-4.5" aria-hidden /> Marcar resolvida
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
