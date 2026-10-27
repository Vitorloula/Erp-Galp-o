import { CircleCheck, ClipboardCheck, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Modal, Segmentado, Vazio } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { vendas as dados } from '../lib/dados'
import type { Divergencia } from '../lib/dados/vendas'
import { formatarDataHora } from '../lib/formato'

const NOME_TIPO: Record<string, string> = {
  saldo_negativo: 'Estoque negativo',
  numero_repetido: 'Número de venda repetido',
  relogio_suspeito: 'Relógio do caixa errado',
  evento_conflitante: 'Envio conflitante do caixa',
  caixa_suspenso: 'Caixa aberto com assinatura suspensa',
  sessao_simultanea: 'Caixa aberto duas vezes',
}

/**
 * Conferência do que os caixas fizeram sem internet: o servidor nunca recusa uma venda que
 * já aconteceu; o que não fecha (estoque negativo, número repetido...) aparece aqui.
 */
export function Divergencias() {
  const { empresa, loja, pode } = useAtiva()
  const { produtoPorId, versao } = useDados()
  const toast = useToast()
  const [aba, setAba] = useState<'abertas' | 'resolvidas'>('abertas')
  const [lista, setLista] = useState<Divergencia[] | null>(null)
  const [erro, setErro] = useState('')
  const [resolvendo, setResolvendo] = useState<Divergencia | null>(null)
  const [texto, setTexto] = useState('')

  const carregar = useCallback(() => {
    dados.listarDivergencias(empresa.empresa_id, loja.id, aba === 'abertas').then(setLista, e => setErro((e as Error).message))
  }, [empresa.empresa_id, loja.id, aba])
  useEffect(() => {
    carregar()
  }, [carregar, versao])

  if (!pode.verDivergencias) return <Navigate to="/painel" replace />

  async function resolver() {
    try {
      await dados.resolverDivergencia(resolvendo!.id, texto)
      toast.sucesso('Divergência resolvida.')
      setResolvendo(null)
      setTexto('')
      carregar()
    } catch (e) {
      toast.erro((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecalho titulo="Divergências" subtitulo="O que os caixas registraram sem internet e precisa de conferência." />
      <Segmentado
        className="mb-4 sm:max-w-xs"
        valor={aba}
        aoMudar={a => {
          setLista(null)
          setAba(a)
        }}
        opcoes={[
          { valor: 'abertas', rotulo: 'Abertas' },
          { valor: 'resolvidas', rotulo: 'Resolvidas' },
        ]}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!lista && !erro ? (
        <Carregando />
      ) : lista!.length === 0 ? (
        <div className="cartao">
          <Vazio icone={CircleCheck} titulo={aba === 'abertas' ? 'Nada para conferir' : 'Nenhuma divergência resolvida'} />
        </div>
      ) : (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {lista!.map(d => {
            const produto = d.produto_id ? produtoPorId.get(d.produto_id) : undefined
            return (
              <div key={d.id} data-divergencia={d.tipo} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {NOME_TIPO[d.tipo] ?? d.tipo}
                      {produto && <span className="font-normal text-slate-600"> · {produto.nome}</span>}
                    </p>
                    <p className="text-slate-600">{d.descricao}</p>
                    <p className="text-xs text-slate-400">{formatarDataHora(d.criado_em)}</p>
                  </div>
                  {aba === 'abertas' && (
                    <div className="flex gap-2">
                      {d.tipo === 'saldo_negativo' && produto && pode.movimentar && (
                        <Link to={`/movimentar?tipo=ajuste&produto=${produto.id}`} className="btn btn-secundario px-3 py-1.5 text-xs">
                          <SlidersHorizontal className="size-3.5" /> Ajustar estoque
                        </Link>
                      )}
                      <button className="btn btn-primario px-3 py-1.5 text-xs" onClick={() => setResolvendo(d)}>
                        <ClipboardCheck className="size-3.5" /> Resolver
                      </button>
                    </div>
                  )}
                </div>
                {d.resolvida_em && (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                    {d.resolucao} <span className="text-xs text-marca">— {d.resolvida_por_nome}, {formatarDataHora(d.resolvida_em)}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Modal
        aberto={!!resolvendo}
        aoFechar={() => setResolvendo(null)}
        titulo="Resolver divergência"
        rodape={
          <button className="btn btn-primario flex-1" disabled={texto.trim().length < 3} onClick={resolver}>
            Marcar como resolvida
          </button>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{resolvendo?.descricao}</p>
          <label className="rotulo" htmlFor="resolucao">O que foi feito *</label>
          <textarea id="resolucao" className="campo min-h-20" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ex.: contagem feita, ajuste de estoque lançado" autoFocus />
        </div>
      </Modal>
    </div>
  )
}
