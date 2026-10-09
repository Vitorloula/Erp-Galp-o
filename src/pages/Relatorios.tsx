import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, FileText, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { Aviso, BadgeSituacao, BadgeTipo, Cabecalho, Carregando, Kpi, Segmentado, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { NOME_EMPRESA, repositorio } from '../lib/dados'
import type { Secoes } from '../lib/exportar/excel'
import { formatarDataHora, formatarNumero, formatarValidade, hojeISO } from '../lib/formato'
import { PERIODOS, intervaloParaInstantes, intervaloRapido, type Intervalo, type PeriodoRapido } from '../lib/periodos'
import { baixarArquivo, montarRelatorio, nomeArquivo } from '../lib/relatorio'
import type { Movimentacao } from '../lib/tipos'

type Aba = 'resumo' | 'movimentacoes' | 'posicao'

export function Relatorios() {
  const { produtos, lotes, versao, carregando } = useDados()
  const toast = useToast()
  const [periodo, setPeriodo] = useState<PeriodoRapido>('7dias')
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloRapido('mes'))
  const [produtoId, setProdutoId] = useState('')
  const [movs, setMovs] = useState<Movimentacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('resumo')
  const [secoes, setSecoes] = useState<Secoes>({ resumo: true, movimentacoes: true, posicao: true })
  const [gerando, setGerando] = useState<'xlsx' | 'pdf' | null>(null)

  const intervalo = periodo === 'personalizado' ? personalizado : intervaloRapido(periodo)

  useEffect(() => {
    let ativo = true
    setMovs(null)
    setErro('')
    // Busca do início do período até agora: o que veio depois serve para calcular o saldo no fim do período.
    repositorio
      .listarMovimentacoes({ desde: intervaloParaInstantes(intervalo).desde })
      .then(m => ativo && setMovs(m))
      .catch(e => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [intervalo.de, intervalo.ate, versao])

  const relatorio = useMemo(
    () => (movs ? montarRelatorio(intervalo, produtos, lotes, movs, produtoId || undefined) : null),
    [movs, produtos, lotes, produtoId, intervalo.de, intervalo.ate],
  )

  async function exportar(formato: 'xlsx' | 'pdf') {
    if (!relatorio) return
    if (!secoes.resumo && !secoes.movimentacoes && !secoes.posicao) return toast.erro('Escolha pelo menos uma seção do relatório.')
    setGerando(formato)
    try {
      const blob =
        formato === 'xlsx'
          ? await (await import('../lib/exportar/excel')).gerarExcel(relatorio, NOME_EMPRESA, secoes)
          : await (await import('../lib/exportar/pdf')).gerarPdf(relatorio, NOME_EMPRESA, secoes)
      baixarArquivo(blob, nomeArquivo(relatorio, formato))
      toast.sucesso(formato === 'xlsx' ? 'Planilha Excel gerada.' : 'PDF gerado.')
    } catch (e) {
      toast.erro('Não foi possível gerar o arquivo: ' + (e as Error).message)
    } finally {
      setGerando(null)
    }
  }

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho titulo="Relatórios" subtitulo="Escolha o período e baixe em Excel ou PDF, prontos para auditoria ou envio." />

      <div className="cartao mb-5 space-y-4 p-4">
        <div>
          <p className="rotulo">Período</p>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map(p => (
              <button key={p.valor} onClick={() => setPeriodo(p.valor)} className={cx('chip', periodo === p.valor ? 'chip-ativo' : 'chip-inativo')}>
                {p.nome}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="rotulo" htmlFor="r-de">De</label>
            <input
              id="r-de"
              type="date"
              className="campo"
              value={intervalo.de}
              max={intervalo.ate}
              onChange={e => {
                if (!e.target.value) return
                setPersonalizado({ de: e.target.value, ate: intervalo.ate })
                setPeriodo('personalizado')
              }}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="r-ate">Até</label>
            <input
              id="r-ate"
              type="date"
              className="campo"
              value={intervalo.ate}
              min={intervalo.de}
              max={hojeISO()}
              onChange={e => {
                if (!e.target.value) return
                setPersonalizado({ de: intervalo.de, ate: e.target.value })
                setPeriodo('personalizado')
              }}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="r-produto">Produto</label>
            <select id="r-produto" className="campo" value={produtoId} onChange={e => setProdutoId(e.target.value)}>
              <option value="">Todos os produtos</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        <div>
          <p className="rotulo">Incluir no arquivo</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
            {([['resumo', 'Resumo por produto'], ['movimentacoes', 'Movimentações'], ['posicao', 'Posição de estoque (com alertas)']] as const).map(([k, nome]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-emerald-700" checked={secoes[k]} onChange={e => setSecoes(s => ({ ...s, [k]: e.target.checked }))} />
                {nome}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:flex">
          <button className="btn btn-primario btn-grande" onClick={() => exportar('xlsx')} disabled={!relatorio || !!gerando}>
            {gerando === 'xlsx' ? <LoaderCircle className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
            Baixar Excel (.xlsx)
          </button>
          <button className="btn btn-secundario btn-grande" onClick={() => exportar('pdf')} disabled={!relatorio || !!gerando}>
            {gerando === 'pdf' ? <LoaderCircle className="size-5 animate-spin" /> : <FileText className="size-5 text-red-600" />}
            Baixar PDF
          </button>
        </div>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!relatorio && !erro && <Carregando texto="Calculando relatório..." />}
      {relatorio && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Kpi titulo="Entradas" valor={relatorio.totais.entradas} icone={ArrowDownToLine} tom="verde" />
            <Kpi titulo="Saídas" valor={relatorio.totais.saidas} icone={ArrowUpFromLine} />
            <Kpi titulo="Correções" valor={relatorio.totais.correcoes} icone={RotateCcw} />
          </div>

          <Segmentado
            className="mb-3"
            valor={aba}
            aoMudar={setAba}
            opcoes={[
              { valor: 'resumo', rotulo: 'Resumo' },
              { valor: 'movimentacoes', rotulo: 'Movimentações' },
              { valor: 'posicao', rotulo: 'Posição' },
            ]}
          />

          <div className="cartao overflow-x-auto">
            {aba === 'resumo' && (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-3 py-2.5 text-right">Saldo inicial</th>
                    <th className="px-3 py-2.5 text-right">Entradas</th>
                    <th className="px-3 py-2.5 text-right">Saídas</th>
                    <th className="px-3 py-2.5 text-right">Correções</th>
                    <th className="px-3 py-2.5 text-right">Saldo final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {relatorio.resumo.map(l => (
                    <tr key={l.codigo} className={l.saldoFinal <= 0 ? 'linha-zerado' : ''}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{l.produto}</span> <span className="text-xs text-slate-500">({l.unidade})</span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatarNumero(l.saldoInicial)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{l.entradas ? '+' + formatarNumero(l.entradas) : '—'}</td>
                      <td className="px-3 py-2 text-right text-red-700">{l.saidas ? '−' + formatarNumero(l.saidas) : '—'}</td>
                      <td className="px-3 py-2 text-right text-violet-700">{l.correcoes ? (l.correcoes > 0 ? '+' : '') + formatarNumero(l.correcoes) : '—'}</td>
                      <td className="px-3 py-2 text-right font-bold">{formatarNumero(l.saldoFinal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {aba === 'movimentacoes' && (
              relatorio.movimentacoes.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Nenhuma movimentação no período.</p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Data/hora</th>
                      <th className="px-3 py-2.5">Tipo</th>
                      <th className="px-3 py-2.5">Produto</th>
                      <th className="px-3 py-2.5">Lote / val.</th>
                      <th className="px-3 py-2.5 text-right">Quantidade</th>
                      <th className="px-3 py-2.5">Documento</th>
                      <th className="px-3 py-2.5">Usuário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...relatorio.movimentacoes].reverse().map(m => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatarDataHora(m.data.toISOString())}</td>
                        <td className="px-3 py-2"><BadgeTipo tipo={m.tipo} /></td>
                        <td className="px-3 py-2 font-medium">{m.produto}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{m.lote || '—'} · {formatarValidade(m.validade)}</td>
                        <td className={cx('whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums', m.quantidade < 0 ? 'text-red-700' : 'text-emerald-700')}>
                          {m.quantidade > 0 ? '+' : '−'}{formatarNumero(Math.abs(m.quantidade))} {m.unidade}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{m.documento || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.usuario || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {aba === 'posicao' && (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-3 py-2.5">Lote</th>
                    <th className="px-3 py-2.5">Validade</th>
                    <th className="px-3 py-2.5 text-right">Saldo</th>
                    <th className="px-3 py-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {relatorio.posicao.map((l, i) => (
                    <tr key={i} className={`linha-${l.situacao}`}>
                      <td className="px-4 py-2 font-medium">{l.produto}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.lote || '—'}</td>
                      <td className="px-3 py-2 font-semibold">{formatarValidade(l.validade)}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{formatarNumero(l.saldo)} {l.unidade}</td>
                      <td className="px-3 py-2"><BadgeSituacao situacao={l.situacao} validade={l.validade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
