import { Banknote, Receipt, ShoppingCart, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Kpi, Modal, Segmentado, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { vendas as dados } from '../lib/dados'
import type { Caixa, ItemVenda, PagamentoVenda, Sessao, Venda } from '../lib/dados/vendas'
import { formatarData, formatarDataHora, formatarHora, formatarNumero, hojeISO } from '../lib/formato'
import { PERIODOS, intervaloParaInstantes, intervaloRapido, type Intervalo, type PeriodoRapido } from '../lib/periodos'
import { NOME_FORMA, centavos, formatarReais, numeroVenda, type FormaPagamento } from '../pdv/venda'

export function Vendas() {
  const { empresa, loja, pode } = useAtiva()
  const { versao } = useDados()
  const [periodo, setPeriodo] = useState<PeriodoRapido>('hoje')
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloRapido('7dias'))
  const [caixaId, setCaixaId] = useState('')
  const [aba, setAba] = useState<'vendas' | 'sessoes'>('vendas')
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [lista, setLista] = useState<Venda[] | null>(null)
  const [pagamentos, setPagamentos] = useState<(PagamentoVenda & { venda_id: string })[]>([])
  const [sessoes, setSessoes] = useState<Sessao[] | null>(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<Venda | null>(null)
  const intervalo = periodo === 'personalizado' ? personalizado : intervaloRapido(periodo)

  useEffect(() => {
    dados.listarCaixas(empresa.empresa_id, loja.id).then(setCaixas, () => {})
  }, [empresa.empresa_id, loja.id])

  useEffect(() => {
    let ativo = true
    const f = intervaloParaInstantes(intervalo)
    const filtro = { desde: f.desde!, ate: f.ate! }
    setErro('')
    Promise.all([dados.listarVendas(empresa.empresa_id, loja.id, filtro), dados.listarSessoes(empresa.empresa_id, loja.id, filtro)])
      .then(async ([v, s]) => {
        const p = await dados.pagamentosDasVendas(v.filter(x => x.status === 'concluida').map(x => x.id))
        if (!ativo) return
        setLista(v)
        setSessoes(s)
        setPagamentos(p)
      })
      .catch(e => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [empresa.empresa_id, loja.id, intervalo.de, intervalo.ate, versao])

  const numeroCaixa = useMemo(() => new Map(caixas.map(c => [c.id, c])), [caixas])
  const filtradas = (lista ?? []).filter(v => !caixaId || v.caixa_id === caixaId)
  const concluidas = filtradas.filter(v => v.status === 'concluida')
  const total = concluidas.reduce((s, v) => s + centavos(v.total), 0)
  const ids = new Set(concluidas.map(v => v.id))
  const trocos = concluidas.reduce((s, v) => s + centavos(v.troco), 0)
  const porForma = new Map<string, number>()
  for (const p of pagamentos) if (ids.has(p.venda_id)) porForma.set(p.forma, (porForma.get(p.forma) ?? 0) + centavos(p.valor))
  if (porForma.has('01')) porForma.set('01', porForma.get('01')! - trocos)

  const rotulo = (v: Venda) => numeroVenda(numeroCaixa.get(v.caixa_id)?.numero ?? 0, v.numero)

  return (
    <div>
      <Cabecalho titulo="Vendas" subtitulo="Vendas dos caixas, já sincronizadas. As feitas sem internet aparecem quando o caixa se conecta." />
      <div className="mb-4 space-y-3">
        <div className="-mx-4 flex gap-2 rolagem-x overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {PERIODOS.filter(p => p.valor !== 'mesAnterior').map(p => (
            <button key={p.valor} onClick={() => setPeriodo(p.valor)} className={cx('chip', periodo === p.valor ? 'chip-ativo' : 'chip-inativo')}>
              {p.nome}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <input type="date" className="campo" aria-label="De" value={personalizado.de} max={personalizado.ate} onChange={e => e.target.value && setPersonalizado(p => ({ ...p, de: e.target.value }))} />
            <input type="date" className="campo" aria-label="Até" value={personalizado.ate} min={personalizado.de} max={hojeISO()} onChange={e => e.target.value && setPersonalizado(p => ({ ...p, ate: e.target.value }))} />
          </div>
        )}
        {caixas.length > 1 && (
          <select className="campo sm:w-56" value={caixaId} onChange={e => setCaixaId(e.target.value)} aria-label="Caixa">
            <option value="">Todos os caixas</option>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!lista && !erro ? (
        <Carregando />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Vendido" valor={formatarReais(total)} icone={Banknote} tom="verde" />
            <Kpi titulo="Vendas" valor={concluidas.length} icone={ShoppingCart} />
            <Kpi titulo="Ticket médio" valor={formatarReais(concluidas.length ? Math.round(total / concluidas.length) : 0)} icone={Receipt} />
            <Kpi titulo="Canceladas" valor={filtradas.length - concluidas.length} icone={XCircle} tom={filtradas.length > concluidas.length ? 'amarelo' : 'neutro'} />
          </div>
          {porForma.size > 0 && (
            <div className="cartao flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm" data-por-forma>
              {[...porForma].map(([f, v]) => (
                <span key={f}>
                  <span className="text-slate-500">{NOME_FORMA[f as FormaPagamento] ?? f}:</span> <strong className="tabular-nums">{formatarReais(v)}</strong>
                </span>
              ))}
            </div>
          )}
          <Segmentado
            valor={aba}
            aoMudar={setAba}
            className="sm:max-w-xs"
            opcoes={[
              { valor: 'vendas', rotulo: 'Vendas' },
              { valor: 'sessoes', rotulo: 'Caixas' },
            ]}
          />
          {aba === 'vendas' ? (
            filtradas.length === 0 ? (
              <div className="cartao">
                <Vazio icone={ShoppingCart} titulo="Nenhuma venda no período" />
              </div>
            ) : (
              <div className="cartao divide-y divide-slate-100 overflow-hidden">
                {filtradas.map(v => (
                  <button key={v.id} data-venda={rotulo(v)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setAberta(v)}>
                    <div className="min-w-0 flex-1">
                      <p className={cx('font-semibold', v.status === 'cancelada' ? 'text-slate-400 line-through' : 'text-slate-900')}>
                        {rotulo(v)} <span className="font-normal text-slate-500">· {numeroCaixa.get(v.caixa_id)?.nome}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {periodo === 'hoje' ? formatarHora(v.ocorrido_em) : formatarDataHora(v.ocorrido_em)} · {v.operador_nome}
                        {v.status === 'cancelada' && ` · cancelada por ${v.cancelada_por_nome}`}
                        {v.relogio_suspeito && ' · horário corrigido'}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums">{formatarReais(centavos(v.total))}</span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <Sessoes sessoes={sessoes ?? []} caixas={numeroCaixa} />
          )}
        </div>
      )}
      <DetalheVenda venda={aberta} rotulo={aberta ? rotulo(aberta) : ''} podeCancelar={pode.cancelarVenda && pode.gravavel} aoFechar={() => setAberta(null)} />
    </div>
  )
}

function Sessoes({ sessoes, caixas }: { sessoes: Sessao[]; caixas: Map<string, Caixa> }) {
  if (!sessoes.length)
    return (
      <div className="cartao">
        <Vazio icone={Banknote} titulo="Nenhuma sessão de caixa no período" />
      </div>
    )
  return (
    <div className="cartao divide-y divide-slate-100 overflow-hidden">
      {sessoes.map(s => {
        const dif = s.fechamento?.diferenca_dinheiro ?? 0
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-sessao={caixas.get(s.caixa_id)?.nome}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                {caixas.get(s.caixa_id)?.nome} · {s.operador_nome}
              </p>
              <p className="text-xs text-slate-500">
                Aberto {formatarDataHora(s.aberta_em)} com {formatarReais(centavos(s.valor_abertura))}
                {s.fechada_em ? ` · fechado ${formatarDataHora(s.fechada_em)}` : ' · aberto'}
              </p>
            </div>
            {s.fechamento && (
              <div className="text-right">
                <p className="text-xs text-slate-500">
                  Dinheiro: esperado {formatarReais(centavos(Number(s.fechamento.esperado['01'] ?? 0)))} · contado {formatarReais(centavos(Number(s.fechamento.contado['01'] ?? 0)))}
                </p>
                <p className={cx('font-semibold', dif < 0 ? 'text-red-700' : dif > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                  {dif === 0 ? 'Caixa conferido' : dif < 0 ? `Faltou ${formatarReais(centavos(-dif))}` : `Sobrou ${formatarReais(centavos(dif))}`}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DetalheVenda({ venda, rotulo, podeCancelar, aoFechar }: { venda: Venda | null; rotulo: string; podeCancelar: boolean; aoFechar: () => void }) {
  const toast = useToast()
  const { recarregar } = useDados()
  const [detalhe, setDetalhe] = useState<{ itens: ItemVenda[]; pagamentos: PagamentoVenda[] } | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    setDetalhe(null)
    setCancelando(false)
    setMotivo('')
    setErro('')
    if (venda) dados.detalheDaVenda(venda.id).then(setDetalhe, e => setErro((e as Error).message))
  }, [venda])

  async function cancelar() {
    try {
      await dados.cancelarVenda(venda!.id, motivo)
      toast.sucesso(`Venda ${rotulo} cancelada.`)
      await recarregar()
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  return (
    <Modal aberto={!!venda} aoFechar={aoFechar} titulo={`Venda ${rotulo}`}>
      {venda && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {formatarDataHora(venda.ocorrido_em)} · {venda.operador_nome}
            {venda.status === 'cancelada' && (
              <span className="mt-1 block font-semibold text-red-700">
                Cancelada em {formatarData(venda.cancelada_em)} por {venda.cancelada_por_nome}: {venda.motivo_cancelamento}
              </span>
            )}
          </p>
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
                <p className="flex justify-between text-base font-bold"><span>Total</span><span>{formatarReais(centavos(venda.total))}</span></p>
                {detalhe.pagamentos.map((p, k) => (
                  <p key={k} className="flex justify-between text-slate-600"><span>{NOME_FORMA[p.forma as FormaPagamento] ?? p.forma}</span><span>{formatarReais(centavos(p.valor))}</span></p>
                ))}
                {venda.troco > 0 && <p className="flex justify-between text-slate-600"><span>Troco</span><span>{formatarReais(centavos(venda.troco))}</span></p>}
              </div>
            </>
          )}
          {podeCancelar && venda.status === 'concluida' && (
            cancelando ? (
              <div className="space-y-2 rounded-xl bg-red-50 p-3">
                <label className="rotulo" htmlFor="motivo-cancelar">Motivo do cancelamento *</label>
                <input id="motivo-cancelar" className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
                <button className="btn btn-perigo w-full" disabled={motivo.trim().length < 3} onClick={cancelar}>
                  Confirmar cancelamento (os itens voltam ao estoque)
                </button>
              </div>
            ) : (
              <button className="btn btn-secundario w-full text-red-700" onClick={() => setCancelando(true)}>
                <XCircle className="size-4.5" /> Cancelar venda
              </button>
            )
          )}
        </div>
      )}
    </Modal>
  )
}
