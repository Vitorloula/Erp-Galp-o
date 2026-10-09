import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Download, History, Lock, Printer, RefreshCw, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Aviso, Modal, cx } from '../../components/ui'
import { useAuth } from '../../contexto/Auth'
import { useAtiva } from '../../contexto/Empresa'
import { formatarDataHora, formatarHora, lerNumero } from '../../lib/formato'
import { usePdv, type MovimentoLocal } from '../../pdv/contexto'
import type { EventoPendente, VendaLocal } from '../../pdv/local'
import { FORMAS, NOME_FORMA, centavos, formatarReais, uuidv7, type FormaPagamento } from '../../pdv/venda'
import { Cupom, type DadosCupom } from './Cupom'

type Tela = 'menu' | 'sangria' | 'suprimento' | 'vendas' | 'fechar' | 'sincronizacao'

export function MenuCaixa({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [tela, setTela] = useState<Tela>('menu')
  useEffect(() => {
    if (aberto) setTela('menu')
  }, [aberto])
  const fechar = () => aoFechar()
  const titulos: Record<Tela, string> = {
    menu: 'Menu do caixa',
    sangria: 'Sangria (retirar dinheiro)',
    suprimento: 'Suprimento (colocar dinheiro)',
    vendas: 'Vendas desta sessão',
    fechar: 'Fechar caixa',
    sincronizacao: 'Sincronização',
  }
  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo={titulos[tela]} largura="max-w-xl">
      {tela === 'menu' && <Menu irPara={setTela} />}
      {(tela === 'sangria' || tela === 'suprimento') && <Movimento tipo={tela} aoConcluir={fechar} />}
      {tela === 'vendas' && <UltimasVendas />}
      {tela === 'fechar' && <FecharCaixa aoConcluir={fechar} />}
      {tela === 'sincronizacao' && <Sincronizacao />}
    </Modal>
  )
}

function Menu({ irPara }: { irPara: (t: Tela) => void }) {
  const { sync } = usePdv()
  const Item = ({ tela, icone: Icone, titulo, texto, perigo }: { tela: Tela; icone: LucideIcon; titulo: string; texto: string; perigo?: boolean }) => (
    <button className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-slate-50" onClick={() => irPara(tela)}>
      <span className={cx('grid size-10 place-items-center rounded-xl', perigo ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{titulo}</span>
        <span className="block text-sm text-slate-500">{texto}</span>
      </span>
      <ChevronRight className="size-4.5 text-slate-300" />
    </button>
  )
  const pend = sync.pendentes + sync.invalidos
  return (
    <div className="divide-y divide-slate-100">
      <Item tela="vendas" icone={History} titulo="Últimas vendas" texto="Reimprimir cupom ou cancelar venda" />
      <Item tela="sangria" icone={ArrowUpFromLine} titulo="Sangria" texto="Retirar dinheiro do caixa (ex.: para o cofre)" />
      <Item tela="suprimento" icone={ArrowDownToLine} titulo="Suprimento" texto="Colocar dinheiro para troco" />
      <Item tela="sincronizacao" icone={RefreshCw} titulo="Sincronização" texto={pend ? `${pend} evento(s) aguardando envio` : 'Tudo enviado ao servidor'} />
      <Item tela="fechar" icone={Lock} titulo="Fechar caixa" texto="Contar o dinheiro e encerrar a sessão" perigo />
    </div>
  )
}

function Movimento({ tipo, aoConcluir }: { tipo: 'sangria' | 'suprimento'; aoConcluir: () => void }) {
  const { registrarMovimento, sinc } = usePdv()
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const v = lerNumero(valor)
  return (
    <form
      className="space-y-3"
      onSubmit={async e => {
        e.preventDefault()
        if (!v || v <= 0) return
        const m: MovimentoLocal = { id: uuidv7(), tipo, valor: centavos(v), motivo: motivo.trim(), ocorrido_em: sinc.agora().toISOString() }
        await registrarMovimento(m)
        toast.sucesso(`${tipo === 'sangria' ? 'Sangria' : 'Suprimento'} de ${formatarReais(m.valor)} registrado.`)
        aoConcluir()
      }}
    >
      <div>
        <label className="rotulo" htmlFor="mov-valor">Valor (R$)</label>
        <input id="mov-valor" className="campo text-lg" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="rotulo" htmlFor="mov-motivo">Motivo</label>
        <input id="mov-motivo" className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tipo === 'sangria' ? 'Ex.: depósito no cofre' : 'Ex.: troco'} />
      </div>
      <button className="btn btn-primario w-full" disabled={!v || v <= 0}>Registrar {tipo}</button>
    </form>
  )
}

function UltimasVendas() {
  const pdv = usePdv()
  const { empresa, pode } = useAtiva()
  const { usuario } = useAuth()
  const toast = useToast()
  const [vendas, setVendas] = useState<VendaLocal[] | null>(null)
  const [cancelando, setCancelando] = useState<VendaLocal | null>(null)
  const [motivo, setMotivo] = useState('')
  const [cupom, setCupom] = useState<DadosCupom | null>(null)

  const carregar = () => pdv.vendasDaSessao().then(setVendas)
  useEffect(() => {
    carregar()
  }, [])

  function reimprimir(v: VendaLocal) {
    setCupom({
      empresa: empresa.nome, loja: null, documento: null, caixa: pdv.caixa!.nome, numeroExibicao: v.numero_exibicao,
      operador: usuario?.nome ?? '', ocorridoEm: v.ocorrido_em, cancelada: v.status === 'cancelada', venda: v.dados as unknown as DadosCupom['venda'],
    })
    setTimeout(() => window.print(), 50)
  }

  async function cancelar() {
    if (!cancelando || motivo.trim().length < 3) return
    await pdv.sinc.enfileirar('cancelar_venda', { caixa_id: pdv.caixa!.caixa_id, venda_id: cancelando.id, motivo: motivo.trim() })
    await pdv.banco.vendas.update(cancelando.id, { status: 'cancelada' })
    toast.sucesso(`Venda ${cancelando.numero_exibicao} cancelada.`)
    setCancelando(null)
    setMotivo('')
    carregar()
  }

  if (cancelando)
    return (
      <div className="space-y-3">
        <Aviso tom="alerta">
          Cancelar a venda <strong>{cancelando.numero_exibicao}</strong> de {formatarReais(centavos(cancelando.total))}? Os itens voltam ao estoque. O cancelamento fica
          registrado com o seu nome.
        </Aviso>
        <label className="rotulo" htmlFor="motivo-cancelamento">Motivo *</label>
        <input id="motivo-cancelamento" className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu" autoFocus />
        <div className="flex gap-2">
          <button className="btn btn-secundario flex-1" onClick={() => setCancelando(null)}>Voltar</button>
          <button className="btn btn-perigo flex-1" disabled={motivo.trim().length < 3} onClick={cancelar}>Cancelar venda</button>
        </div>
      </div>
    )

  return (
    <div>
      {vendas?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma venda nesta sessão.</p>}
      <ul className="divide-y divide-slate-100">
        {(vendas ?? []).map(v => (
          <li key={v.id} className="flex items-center gap-2 py-2.5" data-venda={v.numero_exibicao}>
            <div className="min-w-0 flex-1">
              <p className={cx('font-semibold', v.status === 'cancelada' ? 'text-slate-400 line-through' : 'text-slate-900')}>
                {v.numero_exibicao} · {formatarReais(centavos(v.total))}
              </p>
              <p className="text-xs text-slate-500">
                {formatarHora(v.ocorrido_em)}
                {v.status === 'cancelada' ? ' · cancelada' : v.sincronizada ? ' · enviada' : ' · aguardando envio'}
              </p>
            </div>
            <button className="btn btn-fantasma p-2" onClick={() => reimprimir(v)} aria-label={`Reimprimir ${v.numero_exibicao}`}>
              <Printer className="size-4.5" />
            </button>
            {pode.cancelarVenda && v.status === 'concluida' && (
              <button className="btn btn-fantasma p-2 text-red-700" onClick={() => setCancelando(v)} aria-label={`Cancelar ${v.numero_exibicao}`}>
                <XCircle className="size-4.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!pode.cancelarVenda && <p className="mt-2 text-xs text-slate-500">Para cancelar uma venda, chame o gerente ou o dono.</p>}
      <Cupom dados={cupom} />
    </div>
  )
}

interface ResumoFechamento {
  forma: FormaPagamento
  esperado: number
  contado: number
}

function FecharCaixa({ aoConcluir }: { aoConcluir: () => void }) {
  const pdv = usePdv()
  const toast = useToast()
  const [vendas, setVendas] = useState<VendaLocal[] | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoLocal[]>([])
  const [contado, setContado] = useState<Partial<Record<FormaPagamento, string>>>({})
  const [resultado, setResultado] = useState<ResumoFechamento[] | null>(null)

  useEffect(() => {
    pdv.vendasDaSessao().then(setVendas)
    pdv.movimentosDaSessao().then(setMovimentos)
  }, [])

  if (!vendas) return null
  const concluidas = vendas.filter(v => v.status === 'concluida')
  const pagamentos = concluidas.flatMap(v => (v.dados.pagamentos as { forma: FormaPagamento; valor: number }[]) ?? [])
  const formasUsadas = FORMAS.filter(f => f.valor === '01' || pagamentos.some(p => p.forma === f.valor))

  function esperado(forma: FormaPagamento) {
    const recebido = pagamentos.filter(p => p.forma === forma).reduce((s, p) => s + centavos(p.valor), 0)
    if (forma !== '01') return recebido
    const troco = concluidas.reduce((s, v) => s + centavos(Number(v.dados.troco ?? 0)), 0)
    const mov = movimentos.reduce((s, m) => s + (m.tipo === 'suprimento' ? m.valor : -m.valor), 0)
    return pdv.sessao!.valor_abertura + recebido - troco + mov
  }

  async function fechar(e: React.FormEvent) {
    e.preventDefault()
    const valores = Object.fromEntries(formasUsadas.map(f => [f.valor, centavos(lerNumero(contado[f.valor] ?? '') ?? 0)])) as Record<FormaPagamento, number>
    await pdv.sinc.enfileirar('fechar_sessao', {
      caixa_id: pdv.caixa!.caixa_id,
      sessao_id: pdv.sessao!.id,
      fechada_em: pdv.sinc.agora().toISOString(),
      contado: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v / 100])),
    })
    setResultado(formasUsadas.map(f => ({ forma: f.valor, esperado: esperado(f.valor), contado: valores[f.valor] })))
  }

  if (resultado)
    return (
      <div className="space-y-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Forma</th>
              <th className="py-1 text-right">Esperado</th>
              <th className="py-1 text-right">Contado</th>
              <th className="py-1 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {resultado.map(r => {
              const dif = r.contado - r.esperado
              return (
                <tr key={r.forma} className="border-t border-slate-100" data-fechamento={NOME_FORMA[r.forma]}>
                  <td className="py-1.5 font-medium">{NOME_FORMA[r.forma]}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatarReais(r.esperado)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatarReais(r.contado)}</td>
                  <td className={cx('py-1.5 text-right font-semibold tabular-nums', dif < 0 ? 'text-red-700' : dif > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                    {dif === 0 ? 'OK' : `${dif > 0 ? '+' : '−'} ${formatarReais(Math.abs(dif))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button
          className="btn btn-primario w-full"
          onClick={async () => {
            await pdv.definirSessao(null)
            toast.sucesso(`${pdv.caixa!.nome} fechado.`)
            aoConcluir()
          }}
        >
          Concluir
        </button>
      </div>
    )

  return (
    <form className="space-y-4" onSubmit={fechar}>
      <Aviso tom="info">Conte o que há no caixa e informe abaixo. O valor esperado só aparece depois (fechamento às cegas).</Aviso>
      <p className="text-sm text-slate-600">
        {concluidas.length} venda(s) nesta sessão, aberta em {formatarDataHora(pdv.sessao!.aberta_em)}.
      </p>
      {formasUsadas.map(f => (
        <div key={f.valor}>
          <label className="rotulo" htmlFor={`contado-${f.valor}`}>{f.valor === '01' ? 'Dinheiro na gaveta (R$)' : `Total em ${f.nome} pelos comprovantes (R$)`}</label>
          <input
            id={`contado-${f.valor}`}
            className="campo text-lg"
            inputMode="decimal"
            value={contado[f.valor] ?? ''}
            onChange={e => setContado(c => ({ ...c, [f.valor]: e.target.value }))}
            autoFocus={f.valor === '01'}
            required={f.valor === '01'}
          />
        </div>
      ))}
      <button className="btn btn-perigo btn-grande w-full">
        <Lock className="size-5" /> Fechar caixa
      </button>
    </form>
  )
}

function Sincronizacao() {
  const { banco, sinc, sync } = usePdv()
  const [fila, setFila] = useState<EventoPendente[]>([])
  useEffect(() => {
    banco.fila.orderBy('ordem').toArray().then(setFila)
  }, [banco, sync])
  const NOME: Record<string, string> = { abrir_sessao: 'Abertura do caixa', movimento_caixa: 'Sangria/suprimento', venda: 'Venda', cancelar_venda: 'Cancelamento', fechar_sessao: 'Fechamento' }

  async function exportar() {
    const vendas = await banco.vendas.filter(v => !v.sincronizada).toArray()
    const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), eventos: fila, vendas_nao_enviadas: vendas }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pendencias-caixa-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Situação</p>
          <p className="font-semibold">{{ ok: 'Em dia', enviando: 'Enviando', offline: 'Sem internet', erro: 'Erro' }[sync.situacao]}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Pendentes</p>
          <p className="font-semibold">{sync.pendentes}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Última sincronização</p>
          <p className="font-semibold">{sync.ultimaSync ? formatarHora(sync.ultimaSync) : '—'}</p>
        </div>
      </div>
      {sync.mensagem && <Aviso tom={sync.situacao === 'offline' ? 'alerta' : 'erro'}>{sync.mensagem}</Aviso>}
      {Math.abs(sync.desvioRelogio) > 5 * 60_000 && (
        <Aviso tom="alerta">
          O relógio deste aparelho está {Math.round(Math.abs(sync.desvioRelogio) / 60_000)} minutos {sync.desvioRelogio > 0 ? 'atrasado' : 'adiantado'}. As vendas usam a hora
          do servidor, mas acerte o relógio do aparelho.
        </Aviso>
      )}
      {fila.length > 0 && (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto text-sm">
          {fila.map(e => (
            <li key={e.id} className="py-2" data-evento={e.tipo}>
              <p className={cx('font-medium', e.invalido ? 'text-red-700' : 'text-slate-800')}>
                {e.invalido && <TriangleAlert className="mr-1 inline size-4" />}
                {NOME[e.tipo] ?? e.tipo} · {formatarHora(e.criado_em)}
              </p>
              {e.erro && <p className="text-xs text-red-700">{e.erro}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-secundario" onClick={() => sinc.sincronizar()}>
          <RefreshCw className="size-4.5" /> Sincronizar agora
        </button>
        <button className="btn btn-secundario" onClick={exportar} disabled={!fila.length}>
          <Download className="size-4.5" /> Exportar pendências
        </button>
      </div>
      <p className="text-xs text-slate-500">
        As vendas ficam guardadas neste aparelho até chegarem ao servidor. Não limpe os dados do navegador com pendências; se precisar trocar de aparelho, exporte antes.
      </p>
    </div>
  )
}
