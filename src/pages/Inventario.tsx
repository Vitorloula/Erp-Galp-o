import { useMemo, useState } from 'react'
import { Boxes, LoaderCircle } from 'lucide-react'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { saldosPorProduto } from '../lib/estoque'
import { arred, formatarNumero } from '../lib/formato'

/**
 * Conferência de inventário cego (T-024): o operador conta o que há na
 * prateleira SEM ver o saldo do sistema. Ao finalizar, a tela revela a
 * diferença e gera um ajuste (tipo AJUSTE) por produto divergente.
 */
export function Inventario() {
  const { produtos, lotes, carregando } = useDados()
  const { empresa, loja, pode } = useAtiva()
  const toast = useToast()
  const [contagens, setContagens] = useState<Record<string, string>>({})
  const [revisando, setRevisando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<string[]>([])

  const produtosContaveis = useMemo(() => produtos.filter(p => p.controla_estoque && p.ativo), [produtos])
  const saldos = useMemo(() => saldosPorProduto(lotes), [lotes])

  const linhas = produtosContaveis.map(p => {
    const bruto = contagens[p.id]
    const contado = bruto === undefined || bruto === '' ? null : Number(bruto.replace(',', '.'))
    const valido = contado !== null && Number.isFinite(contado)
    const atual = saldos.get(p.id) ?? 0
    return { produto: p, atual, contado: valido ? contado! : null, diferenca: valido ? arred(contado! - atual) : null }
  })

  const comDiferenca = linhas.filter(l => l.diferenca !== null && l.diferenca !== 0)

  async function gerarAjustes() {
    setGerando(true)
    const feitos: string[] = []
    const falhas: string[] = []
    for (const l of comDiferenca) {
      const loteAlvo = lotes.find(x => x.produto_id === l.produto.id && x.saldo > 0) ?? lotes.find(x => x.produto_id === l.produto.id)
      if (!loteAlvo) {
        falhas.push(`${l.produto.nome}: sem lote para ajustar`)
        continue
      }
      try {
        await movimentos.registrarAjuste(
          empresa.empresa_id,
          loja.id,
          { loteId: loteAlvo.lote_id, quantidade: l.diferenca!, observacao: 'Conferência de inventário' },
          crypto.randomUUID(),
        )
        feitos.push(`${l.produto.nome}: ${l.diferenca! > 0 ? '+' : ''}${formatarNumero(l.diferenca!)} ${l.produto.unidade}`)
      } catch (e) {
        falhas.push(`${l.produto.nome}: ${(e as Error).message}`)
      }
    }
    setResultado([...feitos.map(f => `✓ ${f}`), ...falhas.map(f => `⚠ ${f}`)])
    setGerando(false)
    if (feitos.length) toast.sucesso(`${feitos.length} ajuste(s) gerado(s).`)
    if (falhas.length) toast.erro(`${falhas.length} ajuste(s) falharam.`)
  }

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho
        titulo="Conferência de inventário"
        subtitulo="Conte o que há na prateleira sem ver o saldo do sistema — a diferença aparece só no final."
      />

      {!pode.movimentar && (
        <Aviso tom="erro">Você não tem permissão para lançar ajustes de estoque.</Aviso>
      )}

      {produtosContaveis.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Boxes} titulo="Nada para contar" texto="Cadastre produtos para fazer a conferência." />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {produtosContaveis.map(p => {
              const l = linhas.find(x => x.produto.id === p.id)!
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.nome}</p>
                    <p className="text-xs text-slate-500">{p.codigo_interno} · {p.unidade}</p>
                  </div>
                  {revisando ? (
                    <div className="shrink-0 text-right text-sm">
                      <p className="text-xs text-slate-500">Sistema: {formatarNumero(l.atual)} {p.unidade}</p>
                      <p className={cx('font-semibold tabular-nums', l.diferenca === 0 ? 'text-emerald-700' : l.diferenca! > 0 ? 'text-sky-700' : 'text-red-700')}>
                        {l.diferenca === 0 ? 'Confere' : `Diferença ${l.diferenca! > 0 ? '+' : ''}${formatarNumero(l.diferenca!)}`}
                      </p>
                    </div>
                  ) : (
                    <input
                      type="text"
                      inputMode="decimal"
                      className="campo w-28 shrink-0 text-right"
                      placeholder="Contado"
                      aria-label={`Quantidade contada de ${p.nome}`}
                      value={contagens[p.id] ?? ''}
                      onChange={e => setContagens(s => ({ ...s, [p.id]: e.target.value }))}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {!revisando ? (
              <button type="button" className="btn btn-primario" onClick={() => setRevisando(true)}>
                Finalizar contagem
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-secundario" onClick={() => setRevisando(false)}>
                  Voltar e corrigir
                </button>
                <button
                  type="button"
                  className="btn btn-primario"
                  onClick={gerarAjustes}
                  disabled={gerando || comDiferenca.length === 0 || !pode.movimentar}
                >
                  {gerando && <LoaderCircle className="size-4.5 animate-spin" />}
                  Gerar {comDiferenca.length} ajuste{comDiferenca.length === 1 ? '' : 's'}
                </button>
              </>
            )}
          </div>

          {resultado.length > 0 && (
            <Aviso tom={resultado.some(r => r.startsWith('⚠')) ? 'alerta' : 'info'}>
              <ul className="list-disc space-y-1 pl-5">
                {resultado.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Aviso>
          )}
        </div>
      )}
    </div>
  )
}
