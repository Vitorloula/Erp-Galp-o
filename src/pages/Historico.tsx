import { History, Lock, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CorrecaoModal } from '../components/CorrecaoModal'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { exibirCodigo, hojeISO, normalizarBusca } from '../lib/formato'
import { PERIODOS, intervaloParaInstantes, intervaloRapido, type Intervalo, type PeriodoRapido } from '../lib/periodos'
import type { Movimentacao, TipoMov } from '../lib/tipos'

export function Historico() {
  const { versao, produtoPorId, lotePorId } = useDados()
  const { empresa, loja, pode } = useAtiva()
  const [periodo, setPeriodo] = useState<PeriodoRapido>('7dias')
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloRapido('30dias'))
  const [tipo, setTipo] = useState<TipoMov | ''>('')
  const [termo, setTermo] = useState('')
  const [movs, setMovs] = useState<Movimentacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [corrigindo, setCorrigindo] = useState<Movimentacao | null>(null)

  const intervalo = periodo === 'personalizado' ? personalizado : intervaloRapido(periodo)

  useEffect(() => {
    let ativo = true
    setErro('')
    movimentos
      .listarMovimentacoes(empresa.empresa_id, loja.id, intervaloParaInstantes(intervalo))
      .then(m => ativo && setMovs(m))
      .catch(e => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [intervalo.de, intervalo.ate, versao, empresa.empresa_id, loja.id])

  const filtradas = useMemo(() => {
    const t = normalizarBusca(termo)
    return (movs ?? []).filter(m => {
      if (tipo && m.tipo !== tipo) return false
      if (!t) return true
      const p = produtoPorId.get(m.produto_id)
      const l = lotePorId.get(m.lote_id)
      return [p?.nome, p?.codigo_interno, ...(p?.codigos.map(c => exibirCodigo(c.codigo)) ?? []), l?.lote, m.documento, m.usuario_nome, m.observacao, `#${m.id}`]
        .some(c => c && normalizarBusca(c).includes(t))
    })
  }, [movs, tipo, termo, produtoPorId, lotePorId])

  return (
    <div>
      <Cabecalho titulo="Histórico de movimentações" subtitulo={movs ? `${filtradas.length} lançamento(s) no período` : undefined} />

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
            <div>
              <label className="rotulo" htmlFor="h-de">De</label>
              <input id="h-de" type="date" className="campo" value={personalizado.de} max={personalizado.ate} onChange={e => e.target.value && setPersonalizado(p => ({ ...p, de: e.target.value }))} />
            </div>
            <div>
              <label className="rotulo" htmlFor="h-ate">Até</label>
              <input id="h-ate" type="date" className="campo" value={personalizado.ate} min={personalizado.de} max={hojeISO()} onChange={e => e.target.value && setPersonalizado(p => ({ ...p, ate: e.target.value }))} />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
            <input className="campo pl-10" placeholder="Produto, lote, documento, usuário ou nº" value={termo} onChange={e => setTermo(e.target.value)} aria-label="Buscar" />
          </div>
          <select className="campo sm:w-48" value={tipo} onChange={e => setTipo(e.target.value as TipoMov | '')} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SAIDA">Saídas</option>
            <option value="AJUSTE">Ajustes</option>
            <option value="CORRECAO">Correções</option>
          </select>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl bg-slate-200/60 px-3.5 py-2.5 text-xs text-slate-600">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          O histórico é protegido: lançamentos não podem ser alterados nem excluídos. Para corrigir um erro, use <strong>Corrigir</strong> — o sistema
          registra uma movimentação de correção vinculada ao lançamento original.
        </span>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!movs && !erro ? (
        <Carregando />
      ) : filtradas.length === 0 ? (
        <div className="cartao">
          <Vazio icone={History} titulo="Nenhuma movimentação" texto="Não há lançamentos para os filtros escolhidos." />
        </div>
      ) : (
        <ListaMovimentacoes movimentacoes={filtradas} aoCorrigir={pode.movimentar ? setCorrigindo : undefined} />
      )}

      <CorrecaoModal movimentacao={corrigindo} aoFechar={() => setCorrigindo(null)} />
    </div>
  )
}
