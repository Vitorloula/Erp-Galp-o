import { Boxes, ClipboardCheck, LoaderCircle, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Paginacao } from '../components/Paginacao'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo, movimentos } from '../lib/dados'
import { produtoCombina } from '../lib/estoque'
import { arred, formatarNumero, formatarValidade, hojeISO, normalizarBusca } from '../lib/formato'
import { paginar } from '../lib/paginacao'
import type { Lote, Produto } from '../lib/tipos'

const POR_PAGINA = 100

interface LinhaInventario {
  chave: string
  produto: Produto
  loteId: string | null
  lote: string
  validade: string | null
  saldo: number
}

interface Rascunho {
  contagens: Record<string, string>
  novos: Record<string, { lote: string; validade: string }>
}

const RASCUNHO_VAZIO: Rascunho = { contagens: {}, novos: {} }

function lerRascunho(chave: string): Rascunho {
  try {
    const bruto = localStorage.getItem(chave)
    if (!bruto) return RASCUNHO_VAZIO
    const r = JSON.parse(bruto) as Partial<Rascunho>
    return {
      contagens: r.contagens && typeof r.contagens === 'object' ? r.contagens : {},
      novos: r.novos && typeof r.novos === 'object' ? r.novos : {},
    }
  } catch {
    return RASCUNHO_VAZIO
  }
}

function numeroDigitado(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return null
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? arred(n) : null
}

function linhasDoProduto(produto: Produto, lotes: Lote[]): LinhaInventario[] {
  const ordenados = [...lotes].sort((a, b) => (a.validade ?? '9999-12-31').localeCompare(b.validade ?? '9999-12-31'))
  if (ordenados.length === 0) {
    return [{ chave: `${produto.id}:novo`, produto, loteId: null, lote: '', validade: null, saldo: 0 }]
  }
  return ordenados.map(l => ({
    chave: `${produto.id}:${l.lote_id}`,
    produto,
    loteId: l.lote_id,
    lote: l.lote,
    validade: l.validade,
    saldo: l.saldo,
  }))
}

/**
 * Inventário cego por lote: o operador conta cada lote sem ver o saldo do sistema.
 * A diferença é ajustada no lote contado — nunca no "primeiro lote" do produto.
 */
export function Inventario() {
  const { produtos, lotesPorProduto, carregando, recarregar } = useDados()
  const { empresa, loja, pode } = useAtiva()
  const toast = useToast()
  const chaveRascunho = `galpao-inventario-${empresa.empresa_id}-${loja.id}`
  const [rascunho, setRascunho] = useState<Rascunho>(() => lerRascunho(chaveRascunho))
  const [termo, setTermo] = useState('')
  const [pagina, setPagina] = useState(1)
  const [revisando, setRevisando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<string[]>([])

  // A chave muda ao trocar empresa/loja. Nesse primeiro efeito carregamos o
  // rascunho da nova loja; só depois de carregado é que ele pode ser persistido.
  const chaveCarregada = useRef(chaveRascunho)
  useEffect(() => {
    if (chaveCarregada.current !== chaveRascunho) {
      chaveCarregada.current = chaveRascunho
      setRascunho(lerRascunho(chaveRascunho))
      setTermo('')
      setPagina(1)
      setRevisando(false)
      setErro('')
      setResultado([])
      return
    }
    try {
      if (Object.keys(rascunho.contagens).length > 0 || Object.keys(rascunho.novos).length > 0) {
        localStorage.setItem(chaveRascunho, JSON.stringify(rascunho))
      } else {
        localStorage.removeItem(chaveRascunho)
      }
    } catch {
      // Armazenamento cheio ou bloqueado: a contagem continua funcionando na sessão.
    }
  }, [rascunho, chaveRascunho])

  useEffect(() => {
    setPagina(1)
  }, [termo])

  const linhas = useMemo(() => {
    const lista: LinhaInventario[] = []
    const busca = normalizarBusca(termo)
    for (const p of produtos) {
      if (!p.ativo || !p.controla_estoque) continue
      const doProduto = linhasDoProduto(p, lotesPorProduto.get(p.id) ?? [])
      const combinaProduto = !busca || produtoCombina(p, termo)
      if (!busca || combinaProduto) {
        lista.push(...doProduto)
        continue
      }
      // O campo também promete buscar por lote/validade: mantenha só as linhas
      // que casam nesses campos quando o produto inteiro não casou.
      lista.push(
        ...doProduto.filter(l => {
          const texto = `${l.lote} ${l.validade ?? ''} ${l.validade ? formatarValidade(l.validade) : ''}`
          return normalizarBusca(texto).includes(busca)
        }),
      )
    }
    return lista
  }, [produtos, lotesPorProduto, termo])

  const paginados = useMemo(() => paginar(linhas, pagina, POR_PAGINA), [linhas, pagina])
  const contados = useMemo(() => linhas.filter(l => numeroDigitado(rascunho.contagens[l.chave]) !== null).length, [linhas, rascunho.contagens])
  const divergentes = useMemo(
    () =>
      linhas
        .map(l => {
          const contado = numeroDigitado(rascunho.contagens[l.chave])
          return contado === null ? null : { ...l, contado, diferenca: arred(contado - l.saldo) }
        })
        .filter((l): l is LinhaInventario & { contado: number; diferenca: number } => l !== null && l.diferenca !== 0),
    [linhas, rascunho.contagens],
  )

  function alterarContagem(chave: string, valor: string) {
    setResultado([])
    setRascunho(r => ({ ...r, contagens: { ...r.contagens, [chave]: valor } }))
  }

  function alterarNovo(chave: string, campo: 'lote' | 'validade', valor: string) {
    setRascunho(r => ({ ...r, novos: { ...r.novos, [chave]: { ...(r.novos[chave] ?? { lote: '', validade: '' }), [campo]: valor } } }))
  }

  function limpar() {
    setRascunho(RASCUNHO_VAZIO)
    setErro('')
    setResultado([])
    setRevisando(false)
  }

  async function gerarAjustes() {
    setErro('')
    setResultado([])
    const contadosValidos = linhas.filter(l => numeroDigitado(rascunho.contagens[l.chave]) !== null)
    if (contadosValidos.length === 0) {
      setErro('Informe a contagem de pelo menos um lote antes de finalizar.')
      return
    }

    const preparados: { linha: LinhaInventario; contado: number; diferenca: number; loteId?: string }[] = []
    for (const l of contadosValidos) {
      const contado = numeroDigitado(rascunho.contagens[l.chave])!
      const diferenca = arred(contado - l.saldo)
      if (diferenca === 0) continue
      if (!l.loteId && l.produto.rastreio === 'lote' && !(rascunho.novos[l.chave]?.lote ?? '').trim()) {
        setErro(`Informe o número do lote de ${l.produto.nome} para lançar o saldo inicial.`)
        return
      }
      preparados.push({ linha: l, contado, diferenca, loteId: l.loteId ?? undefined })
    }

    if (preparados.length === 0) {
      setResultado(['Nenhuma diferença encontrada. O estoque do sistema já confere com a contagem.'])
      setRevisando(true)
      toast.sucesso('Inventário conferido sem diferenças.')
      return
    }

    setGerando(true)
    const mensagens: string[] = []
    const concluidos: string[] = []
    try {
      for (const item of preparados) {
        let loteId = item.loteId
        if (!loteId) {
          const novo = rascunho.novos[item.linha.chave]
          loteId = await catalogo.criarLote(
            empresa.empresa_id,
            item.linha.produto.id,
            novo?.lote ?? '',
            novo?.validade || null,
          )
        }
        await movimentos.registrarAjuste(
          empresa.empresa_id,
          loja.id,
          {
            loteId,
            quantidade: item.diferenca,
            observacao: `Inventário ${hojeISO()}${item.linha.lote ? ` — lote ${item.linha.lote}` : ''}`,
          },
          crypto.randomUUID(),
        )
        concluidos.push(item.linha.chave)
        mensagens.push(
          `${item.linha.produto.nome}${item.linha.lote ? ` (lote ${item.linha.lote})` : ''}: ${item.diferenca > 0 ? '+' : ''}${formatarNumero(item.diferenca)} ${item.linha.produto.unidade}`,
        )
      }
      setResultado(mensagens)
      setRascunho(RASCUNHO_VAZIO)
      await recarregar('estoque').catch(() => undefined)
      toast.sucesso(`${mensagens.length} ajuste(s) de inventário lançado(s).`)
    } catch (e) {
      setErro((e as Error).message)
      // Se uma linha falhou no meio, tira do rascunho as que já foram lançadas.
      // Sem isso, tentar de novo aplicaria o mesmo ajuste duas vezes.
      if (concluidos.length > 0) {
        setRascunho(r => {
          const contagens = { ...r.contagens }
          const novos = { ...r.novos }
          for (const chave of concluidos) {
            delete contagens[chave]
            delete novos[chave]
          }
          return { contagens, novos }
        })
        setResultado(mensagens)
        await recarregar('estoque').catch(() => undefined)
      }
    } finally {
      setGerando(false)
    }
  }

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho
        titulo="Inventário"
        subtitulo="Contagem cega por lote, com ajuste no lote contado"
        acoes={
          <button type="button" className="btn btn-secundario" onClick={limpar} disabled={gerando || (contados === 0 && !revisando)}>
            <RotateCcw className="size-4.5" /> Limpar contagem
          </button>
        }
      />

      <Aviso tom="info">
        Conte o que está na prateleira sem consultar o sistema. Produtos com mais de um lote aparecem em linhas separadas —
        a diferença vai para o lote que você contou. O rascunho fica salvo neste aparelho até finalizar.
      </Aviso>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
          <input
            className="campo pl-10"
            placeholder="Buscar por nome, código, lote ou validade"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            aria-label="Buscar no inventário"
          />
        </div>
        <span className="whitespace-nowrap text-sm text-slate-500 tabular-nums">
          {contados} de {linhas.length} lote(s) contado(s)
        </span>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado.length > 0 && (
        <Aviso tom="info">
          <p className="font-semibold">Inventário finalizado</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {resultado.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Aviso>
      )}

      {linhas.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Boxes} titulo="Nenhum produto para contar" texto="Ajuste a busca ou cadastre produtos com controle de estoque." />
        </div>
      ) : (
        <>
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {paginados.itens.map(l => {
              const novo = rascunho.novos[l.chave]
              const contado = numeroDigitado(rascunho.contagens[l.chave])
              const diferenca = contado === null ? null : arred(contado - l.saldo)
              return (
                <div
                  key={l.chave}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  data-inventario={l.chave}
                  data-produto={l.produto.nome}
                  data-lote={l.lote}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{l.produto.nome}</p>
                    <p className="truncate text-xs text-slate-500">
                      {l.loteId ? (
                        <>Lote <strong className="text-slate-700">{l.lote || 'sem número'}</strong>{l.validade ? ` · val. ${formatarValidade(l.validade)}` : ''}</>
                      ) : (
                        <>Sem lote cadastrado{l.produto.rastreio === 'lote' ? ' — informe o lote abaixo' : ''}</>
                      )}
                      {' '}· {l.produto.unidade}
                    </p>
                  </div>

                  {!l.loteId && l.produto.rastreio === 'lote' && (
                    <div className="flex gap-2">
                      <input
                        className="campo w-32 py-1.5"
                        placeholder="Lote *"
                        aria-label={`Lote de ${l.produto.nome}`}
                        value={novo?.lote ?? ''}
                        onChange={e => alterarNovo(l.chave, 'lote', e.target.value)}
                      />
                      <input
                        type="date"
                        className="campo w-36 py-1.5"
                        aria-label={`Validade de ${l.produto.nome}`}
                        value={novo?.validade ?? ''}
                        onChange={e => alterarNovo(l.chave, 'validade', e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 sm:justify-end">
                    <label className="text-xs font-medium text-slate-500" htmlFor={`contagem-${l.chave}`}>Contado</label>
                    <input
                      id={`contagem-${l.chave}`}
                      className="campo w-28 py-1.5 text-right tabular-nums"
                      inputMode="decimal"
                      placeholder="0"
                      value={rascunho.contagens[l.chave] ?? ''}
                      onChange={e => alterarContagem(l.chave, e.target.value)}
                      aria-label={`Contagem de ${l.produto.nome}${l.lote ? ` lote ${l.lote}` : ''}`}
                      disabled={gerando}
                    />
                  </div>

                  {revisando && (
                    <div className="grid w-full grid-cols-2 gap-2 text-right text-xs sm:w-44">
                      <span className="text-slate-500">Sistema</span>
                      <span className="font-semibold tabular-nums text-slate-700">{formatarNumero(l.saldo)}</span>
                      <span className="text-slate-500">Diferença</span>
                      <span className={cx('font-bold tabular-nums', diferenca === null ? 'text-slate-400' : diferenca === 0 ? 'text-emerald-700' : 'text-amber-800')}>
                        {diferenca === null ? 'não contado' : `${diferenca > 0 ? '+' : ''}${formatarNumero(diferenca)}`}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Paginacao
            pagina={paginados.pagina}
            totalPaginas={paginados.totalPaginas}
            primeiro={paginados.primeiro}
            ultimo={paginados.ultimo}
            total={paginados.total}
            rotulo="lotes"
            aoMudar={setPagina}
          />
        </>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {!revisando ? (
          <button type="button" className="btn btn-primario" onClick={() => setRevisando(true)} disabled={contados === 0 || gerando}>
            <ClipboardCheck className="size-4.5" /> Revisar {contados} contagem(ns)
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secundario" onClick={() => setRevisando(false)} disabled={gerando}>
              Voltar a contar
            </button>
            <button type="button" className="btn btn-primario" onClick={gerarAjustes} disabled={gerando || !pode.movimentar}>
              {gerando && <LoaderCircle className="size-4.5 animate-spin" />}
              {gerando ? 'Lançando ajustes...' : `Gerar ${divergentes.length} ajuste(s)`}
            </button>
          </>
        )}
      </div>
      {revisando && divergentes.length === 0 && contados > 0 && (
        <p className="mt-2 text-right text-sm text-slate-500">Nenhuma diferença entre a contagem e o sistema.</p>
      )}
      {!pode.movimentar && <Aviso tom="erro">Seu acesso não permite lançar ajustes de inventário.</Aviso>}
    </div>
  )
}
