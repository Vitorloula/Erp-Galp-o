import { ArrowLeft, CloudOff, LoaderCircle, Menu, RefreshCw, Store, TriangleAlert, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { TelaCheia } from '../../components/TelaCheia'
import { useToast } from '../../components/Toast'
import { Aviso, Carregando, cx } from '../../components/ui'
import { useAuth } from '../../contexto/Auth'
import { useAtiva } from '../../contexto/Empresa'
import { sb } from '../../lib/dados/cliente'
import { vendas as dadosVendas } from '../../lib/dados'
import type { Caixa } from '../../lib/dados/vendas'
import { lerNumero } from '../../lib/formato'
import { PdvProvider, usePdv, type CaixaLocal } from '../../pdv/contexto'
import { dispositivoId } from '../../pdv/local'
import { centavos, formatarReais, uuidv7 } from '../../pdv/venda'
import { MenuCaixa } from './MenuCaixa'
import { TelaVenda } from './Venda'

/** Frente de caixa (PDV) em tela cheia. Vende sem internet; sincroniza sozinho quando a conexão volta. */
export function Pdv() {
  const { pode } = useAtiva()
  if (!pode.vender)
    return (
      <TelaCheia>
        <div className="space-y-4 text-center">
          <Aviso tom="alerta">Seu acesso não inclui o caixa, ou a assinatura da empresa está suspensa.</Aviso>
          <Link to="/painel" className="btn btn-secundario w-full">Voltar ao sistema</Link>
        </div>
      </TelaCheia>
    )
  return (
    <PdvProvider>
      <Caixa />
    </PdvProvider>
  )
}

function Caixa() {
  const pdv = usePdv()
  const [menu, setMenu] = useState(false)
  if (!pdv.pronto) return <Carregando texto="Abrindo o caixa..." />
  if (pdv.bloqueadoPorOutraAba)
    return (
      <TelaCheia>
        <div className="space-y-4 text-center">
          <Aviso tom="alerta">O caixa já está aberto em outra aba deste aparelho. Use aquela aba (ou feche-a) para não misturar as vendas.</Aviso>
          <Link to="/painel" className="btn btn-secundario w-full">Voltar ao sistema</Link>
        </div>
      </TelaCheia>
    )

  let tela
  if (!pdv.temCatalogo) tela = <PreparandoCatalogo />
  else if (!pdv.caixa) tela = <EscolherCaixa />
  else if (!pdv.sessao) tela = <AbrirCaixa />
  else tela = <TelaVenda abrirMenu={() => setMenu(true)} />

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <BarraTopo aoAbrirMenu={pdv.sessao ? () => setMenu(true) : undefined} />
      {tela}
      {pdv.sessao && <MenuCaixa aberto={menu} aoFechar={() => setMenu(false)} />}
    </div>
  )
}

function BarraTopo({ aoAbrirMenu }: { aoAbrirMenu?: () => void }) {
  const { usuario } = useAuth()
  const { empresa, loja, lojas } = useAtiva()
  const { caixa } = usePdv()
  return (
    <header className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white sm:px-4">
      <Link to="/painel" className="btn btn-fantasma -ml-1 p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Voltar à retaguarda" aria-label="Voltar à retaguarda">
        <ArrowLeft className="size-5" />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-bold">
          {caixa?.nome ?? 'Caixa'} · {empresa.nome}
        </p>
        <p className="truncate text-xs text-slate-400">
          {(lojas?.length ?? 0) > 1 ? `${loja.nome} · ` : ''}
          {usuario?.nome}
        </p>
      </div>
      <IndicadorSync />
      {aoAbrirMenu && (
        <button className="btn btn-fantasma p-2 text-slate-200 hover:bg-white/10" onClick={aoAbrirMenu} aria-label="Menu do caixa (F10)" title="Menu do caixa (F10)">
          <Menu className="size-5" />
        </button>
      )}
    </header>
  )
}

/** "Sincronizado" / "Offline · 3 pendentes" / "Erro": o operador sempre sabe se as vendas já subiram. */
export function IndicadorSync() {
  const { sync, sinc } = usePdv()
  const pendentes = sync.pendentes + sync.invalidos
  const [texto, classe, Icone] =
    sync.invalidos > 0
      ? [`${sync.invalidos} com erro`, 'bg-red-500/20 text-red-200', TriangleAlert]
      : sync.situacao === 'offline'
        ? [`Offline${pendentes ? ` · ${pendentes} pendente${pendentes > 1 ? 's' : ''}` : ''}`, 'bg-amber-400/20 text-amber-200', CloudOff]
        : sync.situacao === 'erro'
          ? ['Erro ao sincronizar', 'bg-red-500/20 text-red-200', TriangleAlert]
          : sync.situacao === 'enviando' || pendentes
            ? [`Enviando${pendentes ? ` · ${pendentes}` : ''}`, 'bg-sky-400/20 text-sky-200', RefreshCw]
            : ['Sincronizado', 'bg-emerald-400/20 text-emerald-200', Wifi]
  return (
    <button
      className={cx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', classe)}
      onClick={() => sinc.sincronizar()}
      title={sync.mensagem ?? 'Sincronizar agora'}
      data-sync={sync.situacao}
      data-pendentes={pendentes}
    >
      <Icone className={cx('size-3.5', sync.situacao === 'enviando' && 'animate-spin')} />
      <span>{texto}</span>
    </button>
  )
}

function PreparandoCatalogo() {
  const { sync } = usePdv()
  return (
    <div className="m-auto max-w-sm p-6 text-center">
      {sync.situacao === 'offline' || sync.situacao === 'erro' ? (
        <Aviso tom="alerta">Conecte o aparelho à internet uma vez para preparar o caixa (baixar produtos e preços). Depois ele vende mesmo sem conexão.</Aviso>
      ) : (
        <Carregando texto="Preparando o caixa: baixando produtos e preços..." />
      )}
    </div>
  )
}

function EscolherCaixa() {
  const { empresa, loja } = useAtiva()
  const { definirCaixa, definirSessao, sessao } = usePdv()
  const [caixas, setCaixas] = useState<Caixa[] | null>(null)
  const [erro, setErro] = useState('')
  const [assumindo, setAssumindo] = useState<string | null>(null)

  useEffect(() => {
    dadosVendas.listarCaixas(empresa.empresa_id, loja.id).then(
      l => setCaixas(l.filter(c => c.ativo)),
      e => setErro((e as Error).message),
    )
  }, [empresa.empresa_id, loja.id])

  async function assumir(c: Caixa) {
    setErro('')
    setAssumindo(c.id)
    try {
      const { data, error } = await sb.rpc('pdv_assumir_caixa', { p_caixa: c.id, p_dispositivo: dispositivoId() })
      if (error) throw new Error(error.message)
      const r = data as { numero: number; nome: string; ultimo_numero: number; sessao_aberta: { id: string; aberta_em: string; valor_abertura: number } | null }
      const local: CaixaLocal = { caixa_id: c.id, numero: r.numero, nome: r.nome }
      await definirCaixa(local, Number(r.ultimo_numero))
      // Sessão que ficou aberta neste aparelho (ex.: dados do navegador apagados): continua nela.
      if (r.sessao_aberta && !sessao)
        await definirSessao({ id: r.sessao_aberta.id, aberta_em: r.sessao_aberta.aberta_em, valor_abertura: centavos(Number(r.sessao_aberta.valor_abertura)) })
    } catch (e) {
      setErro(/Failed to fetch/.test((e as Error).message) ? 'Sem internet: para escolher o caixa a primeira vez, conecte o aparelho.' : (e as Error).message)
    } finally {
      setAssumindo(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900">Qual caixa é este aparelho?</h1>
      <p className="text-sm text-slate-500">Cada caixa tem sua numeração de vendas. Escolha uma vez; o aparelho lembra.</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!caixas && !erro ? (
        <Carregando />
      ) : (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {(caixas ?? []).map(c => (
            <button key={c.id} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50" onClick={() => assumir(c)} disabled={!!assumindo}>
              <Store className="size-5 text-marca" />
              <span className="flex-1 font-semibold text-slate-900">{c.nome}</span>
              {assumindo === c.id && <LoaderCircle className="size-5 animate-spin text-slate-400" />}
            </button>
          ))}
          {caixas?.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum caixa ativo nesta loja. Cadastre em Empresa → Caixas.</p>}
        </div>
      )}
    </div>
  )
}

function AbrirCaixa() {
  const { caixa, sinc, definirSessao, esquecerCaixa, podeAbrir } = usePdv()
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')

  async function abrir(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const v = valor.trim() ? lerNumero(valor) : 0
    if (v === null || v < 0) return setErro('Valor de abertura inválido.')
    setAbrindo(true)
    try {
      const sessao = { id: uuidv7(sinc.agora().getTime()), aberta_em: sinc.agora().toISOString(), valor_abertura: centavos(v) }
      await sinc.enfileirar('abrir_sessao', { caixa_id: caixa!.caixa_id, sessao_id: sessao.id, aberta_em: sessao.aberta_em, valor_abertura: v })
      await definirSessao(sessao)
      toast.sucesso(`${caixa!.nome} aberto com ${formatarReais(sessao.valor_abertura)}.`)
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <form onSubmit={abrir} className="mx-auto w-full max-w-md space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900">Abrir {caixa?.nome}</h1>
      {!podeAbrir.ok && <Aviso tom="erro">{podeAbrir.motivo}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div>
        <label className="rotulo" htmlFor="abertura">Dinheiro na gaveta para troco (R$)</label>
        <input id="abertura" className="campo text-lg" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" autoFocus />
      </div>
      <button className="btn btn-primario btn-grande w-full" disabled={abrindo || !podeAbrir.ok}>
        {abrindo && <LoaderCircle className="size-5 animate-spin" />} Abrir caixa
      </button>
      <button type="button" className="btn btn-fantasma w-full" onClick={esquecerCaixa}>
        Usar outro caixa neste aparelho
      </button>
    </form>
  )
}
