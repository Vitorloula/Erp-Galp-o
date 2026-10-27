import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, FileText, LoaderCircle, RotateCcw, ShoppingCart, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../components/Toast'
import { Aviso, BadgeReposicao, BadgeSituacao, BadgeTipo, Cabecalho, Carregando, Cobertura, Kpi, Segmentado, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { filtrarProdutos } from '../lib/estoque'
import type { Secoes } from '../lib/exportar/excel'
import { formatarDataHora, formatarEmbalagens, formatarNumero, formatarValidade, hojeISO } from '../lib/formato'
import { PERIODOS, intervaloParaInstantes, intervaloRapido, juntarFiltros, periodoDaUrl, produtoDaUrl, type Intervalo, type PeriodoRapido } from '../lib/periodos'
import { exportarComToast, montarRelatorio, nomeArquivo, tituloEmpresa, type LinhaCompraRel } from '../lib/relatorio'
import type { Movimentacao } from '../lib/tipos'

type Aba = 'resumo' | 'movimentacoes' | 'posicao' | 'compras'

/** Rótulos ≤ 12 caracteres: 4 abas cabem no Segmentado até em 320 px. */
const OPCOES_ABA: { valor: Aba; rotulo: string }[] = [
  { valor: 'resumo', rotulo: 'Resumo' },
  { valor: 'movimentacoes', rotulo: 'Movimentações' },
  { valor: 'posicao', rotulo: 'Posição' },
  { valor: 'compras', rotulo: 'Compras' },
]

const SECOES: readonly [keyof Secoes, string][] = [
  ['resumo', 'Resumo por produto'],
  ['movimentacoes', 'Movimentações'],
  ['posicao', 'Posição de estoque (com alertas)'],
  ['compras', 'Lista de compras (reposição)'],
]

/** Rótulo legível da situação vinda do link do Estoque. */
const ROTULO_SITUACAO: Record<string, string> = {
  vencido: 'Vencidos',
  zerado: 'Zerados',
  vencendo: 'Vencem em breve',
  abaixo: 'Repor',
  ok: 'Em dia',
}

interface TabelaComprasProps {
  /** Já vem montada por montarRelatorio (montarReposicao): só 'abaixo'|'no_minimo', ordenada por cobertura. */
  linhas: LinhaCompraRel[]
  /** Conteúdo por embalagem do produto (multiplica a apresentação "x emb."). */
  conteudos: Map<string, number | null>
}

function TabelaCompras({ linhas, conteudos }: TabelaComprasProps) {
  if (linhas.length === 0)
    return (
      <Vazio
        icone={ShoppingCart}
        titulo="Nada para comprar"
        texto="Nenhum produto está no estoque mínimo. Defina o mínimo em Produtos para receber a sugestão de compra."
      />
    )
  return (
    <>
      <p className="border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-500">
        {linhas.length} produto(s) para comprar · do mais crítico ao menos crítico
      </p>
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2.5">Produto</th>
            <th scope="col" className="px-3 py-2.5">Categoria</th>
            <th scope="col" className="px-3 py-2.5 text-right">Saldo</th>
            <th scope="col" className="px-3 py-2.5 text-right">Mínimo</th>
            <th scope="col" className="px-3 py-2.5 text-right">Cobertura</th>
            <th scope="col" className="px-3 py-2.5 text-right">Comprar</th>
            <th scope="col" className="px-3 py-2.5">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {linhas.map(l => {
            const embalagens = formatarEmbalagens(l.sugestaoCompra, conteudos.get(l.codigo) ?? null)
            return (
              <tr key={l.codigo}>
                <td className="px-4 py-2">
                  <span className="font-medium">{l.produto}</span> <span className="text-xs text-slate-500">({l.unidade})</span>
                  <span className="block font-mono text-xs text-slate-500">{l.codigo}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{l.categoria}</td>
                <td className="px-3 py-2 text-right">{formatarNumero(l.saldo)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{formatarNumero(l.minimo)}</td>
                <td className="px-3 py-2 text-right"><Cobertura saldo={l.saldo} minimo={l.minimo} unidade={l.unidade} /></td>
                <td className="px-3 py-2 text-right font-bold text-marca-escura">
                  {formatarNumero(l.sugestaoCompra)} {l.unidade}
                  {embalagens && <span className="block text-xs font-normal text-slate-500">{embalagens}</span>}
                </td>
                <td className="px-3 py-2"><BadgeReposicao situacao={l.situacao} minimo={l.minimo} unidade={l.unidade} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

export function Relatorios() {
  const { produtos, lotes, versao, carregando, nomeCategoria } = useDados()
  const { empresa, loja, lojas } = useAtiva()
  const titulo = tituloEmpresa(empresa.nome, loja.nome, (lojas?.length ?? 0) > 1)
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  // Abrir /relatorios?de=2026-10-01&ate=2026-10-15 já mostra o período do link (link salvo ou compartilhado).
  const [inicial] = useState(() => periodoDaUrl(params, hojeISO()))
  const [periodo, setPeriodo] = useState<PeriodoRapido>(inicial.periodo)
  const [personalizado, setPersonalizado] = useState<Intervalo>(inicial.intervalo)
  const [produtoId, setProdutoId] = useState(() => produtoDaUrl(params))

  // Filtros vindos do link "Exportar" do Estoque (T-016): busca, categoria e situação.
  const [filtrosEstoque, setFiltrosEstoque] = useState(() => ({
    q: params.get('q') ?? '',
    categoria: params.get('categoria') ?? '',
    situacao: params.get('situacao') ?? '',
  }))
  const temFiltroEstoque = !!(filtrosEstoque.q || filtrosEstoque.categoria || filtrosEstoque.situacao)

  // Recorte compartilhado com o Estoque (T-019): produtos por busca + categoria.
  const recorte = useMemo(
    () => filtrarProdutos(produtos, filtrosEstoque.q, filtrosEstoque.categoria),
    [produtos, filtrosEstoque.q, filtrosEstoque.categoria],
  )

  function limparFiltrosEstoque() {
    setFiltrosEstoque({ q: '', categoria: '', situacao: '' })
    setParams(juntarFiltros(params, { q: '', categoria: '', situacao: '' }), { replace: true })
  }
  const [movs, setMovs] = useState<Movimentacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('resumo')
  const [secoes, setSecoes] = useState<Secoes>({ resumo: true, movimentacoes: true, posicao: true, compras: true })
  const [gerando, setGerando] = useState<'xlsx' | 'pdf' | null>(null)

  const intervalo = periodo === 'personalizado' ? personalizado : intervaloRapido(periodo)

  function refletirNaUrl(p: PeriodoRapido, i: Intervalo) {
    const proximo = new URLSearchParams(params)
    if (p === 'personalizado') {
      proximo.set('de', i.de)
      proximo.set('ate', i.ate)
    } else {
      proximo.delete('de')
      proximo.delete('ate')
    }
    setParams(proximo, { replace: true })
  }

  function escolherPeriodo(p: PeriodoRapido) {
    setPeriodo(p)
    refletirNaUrl(p, p === 'personalizado' ? personalizado : intervaloRapido(p))
  }

  // O select de produto é fonte da URL (?produto=): trocar grava com replace; vazio remove o param.
  function escolherProduto(id: string) {
    setProdutoId(id)
    setParams(juntarFiltros(params, { produto: id || '' }), { replace: true })
  }

  // Produto excluído no link (id inexistente): cai em "Todos os produtos", sem quebrar nem avisar.
  useEffect(() => {
    if (!produtoId || carregando) return
    if (!produtos.some(p => p.id === produtoId)) {
      setProdutoId('')
      setParams(juntarFiltros(params, { produto: '' }), { replace: true })
    }
  }, [produtos, carregando, produtoId])

  useEffect(() => {
    let ativo = true
    setMovs(null)
    setErro('')
    // Busca do início do período até agora: o que veio depois serve para calcular o saldo no fim do período.
    movimentos
      .listarMovimentacoes(empresa.empresa_id, loja.id, { desde: intervaloParaInstantes(intervalo).desde })
      .then(m => ativo && setMovs(m))
      .catch(e => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [intervalo.de, intervalo.ate, versao, empresa.empresa_id, loja.id])

  const relatorio = useMemo(() => {
    if (!movs) return null
    const r = montarRelatorio(intervalo, produtos, lotes, movs, nomeCategoria, produtoId || undefined, recorte)
    const sit = filtrosEstoque.situacao
    if (!sit) return r
    if (sit === 'abaixo') {
      // "abaixo" é por produto (saldo <= mínimo): só os produtos da lista de compras.
      const codigos = new Set(r.compras.map(c => c.codigo))
      return { ...r, posicao: r.posicao.filter(l => codigos.has(l.codigo)) }
    }
    return { ...r, posicao: r.posicao.filter(l => l.situacao === sit) }
  }, [movs, produtos, lotes, produtoId, intervalo.de, intervalo.ate, nomeCategoria, recorte, filtrosEstoque.situacao])

  // Conteúdo por embalagem só para exibir "x emb." na aba Compras (a conta vem de lib/estoque.ts).
  const conteudos = useMemo(() => new Map(produtos.map(p => [p.codigo_interno, p.conteudo_embalagem ?? null])), [produtos])

  const algumaSecao = secoes.resumo || secoes.movimentacoes || secoes.posicao || secoes.compras

  // Seções escolhidas que sairiam sem nenhuma linha (T-022): avisar antes de baixar.
  const secoesVazias = useMemo(() => {
    if (!relatorio) return []
    const contagens: Record<keyof Secoes, number> = {
      resumo: relatorio.resumo.length,
      movimentacoes: relatorio.movimentacoes.length,
      posicao: relatorio.posicao.length,
      compras: relatorio.compras.length,
    }
    return SECOES.filter(([k]) => secoes[k] && contagens[k] === 0).map(([, nome]) => nome)
  }, [relatorio, secoes])

  async function exportar(formato: 'xlsx' | 'pdf') {
    if (!relatorio) return
    if (!algumaSecao) return toast.erro('Escolha pelo menos uma seção do relatório.')
    if (secoesVazias.length > 0) {
      toast.erro(
        `Atenção: ${secoesVazias.join(', ')} ${secoesVazias.length === 1 ? 'está vazia' : 'estão vazias'}; o arquivo será gerado mesmo assim.`,
      )
    }
    await exportarComToast({
      formato,
      nome: nomeArquivo(relatorio, formato),
      gerar: async () => {
        if (formato === 'xlsx') {
          const { gerarExcel } = await import('../lib/exportar/excel')
          return gerarExcel(relatorio, titulo, secoes)
        }
        const { gerarPdf } = await import('../lib/exportar/pdf')
        return gerarPdf(relatorio, titulo, secoes)
      },
      avisos: toast,
      aoMudarEstado: setGerando,
    })
  }

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho
        titulo="Relatórios"
        subtitulo="Escolha o período e baixe em Excel ou PDF — inclui a lista de compras (reposição) para levar ao fornecedor."
      />

      {temFiltroEstoque && (
        <Aviso tom="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Filtros do Estoque aplicados
              {filtrosEstoque.categoria && <> · categoria <strong>{nomeCategoria(filtrosEstoque.categoria)}</strong></>}
              {filtrosEstoque.q && <> · busca “<strong>{filtrosEstoque.q}</strong>”</>}
              {filtrosEstoque.situacao && <> · <strong>{ROTULO_SITUACAO[filtrosEstoque.situacao] ?? filtrosEstoque.situacao}</strong></>}
              {' '}— valem para Posição e Compras.
            </span>
            <button
              type="button"
              className="btn btn-fantasma -m-1 shrink-0 px-2 py-1 text-xs"
              aria-label="Limpar filtros do estoque"
              onClick={limparFiltrosEstoque}
            >
              <X className="size-3.5" /> Limpar filtros
            </button>
          </span>
        </Aviso>
      )}

      <div className="cartao mb-5 space-y-4 p-4">
        <div>
          <p className="rotulo">Período</p>
          <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
            {PERIODOS.map(p => (
              <button
                key={p.valor}
                type="button"
                aria-pressed={periodo === p.valor}
                onClick={() => escolherPeriodo(p.valor)}
                className={cx('chip', periodo === p.valor ? 'chip-ativo' : 'chip-inativo')}
              >
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
                const novo = { de: e.target.value, ate: intervalo.ate }
                setPersonalizado(novo)
                setPeriodo('personalizado')
                refletirNaUrl('personalizado', novo)
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
                const novo = { de: intervalo.de, ate: e.target.value }
                setPersonalizado(novo)
                setPeriodo('personalizado')
                refletirNaUrl('personalizado', novo)
              }}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="r-produto">Produto</label>
            <select id="r-produto" className="campo" value={produtoId} onChange={e => escolherProduto(e.target.value)}>
              <option value="">Todos os produtos</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        {produtoId && (
          <Aviso tom="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Relatório e arquivos exportados mostram só <strong>{produtos.find(p => p.id === produtoId)?.nome}</strong>.
              </span>
              <button
                type="button"
                className="btn btn-fantasma -m-1 shrink-0 px-2 py-1 text-xs"
                aria-label="Limpar filtro de produto"
                onClick={() => escolherProduto('')}
              >
                <X className="size-3.5" /> ver todos os produtos
              </button>
            </span>
          </Aviso>
        )}
        <div role="group" aria-labelledby="r-secoes">
          <p className="rotulo" id="r-secoes">Incluir no arquivo</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-slate-700">
            {SECOES.map(([k, nome]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-marca"
                  checked={secoes[k]}
                  onChange={e => setSecoes(s => ({ ...s, [k]: e.target.checked }))}
                />
                <span className="leading-snug">{nome}</span>
              </label>
            ))}
          </div>
        </div>
        {secoesVazias.length > 0 && (
          <Aviso tom="alerta">
            <strong>{secoesVazias.join(', ')}</strong> {secoesVazias.length === 1 ? 'está vazia' : 'estão vazias'} e será(ão) incluída(s) sem linhas. Desmarque ou ajuste os filtros antes de baixar.
          </Aviso>
        )}
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
            <Kpi titulo="Ajustes e correções" valor={relatorio.totais.ajustes} icone={RotateCcw} />
          </div>

          <Segmentado className="mb-3" valor={aba} aoMudar={setAba} opcoes={OPCOES_ABA} />

          <div className="cartao overflow-x-auto">
            {aba === 'resumo' && (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-3 py-2.5 text-right">Saldo inicial</th>
                    <th className="px-3 py-2.5 text-right">Entradas</th>
                    <th className="px-3 py-2.5 text-right">Saídas</th>
                    <th className="px-3 py-2.5 text-right">Ajustes</th>
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
                      <td className="px-3 py-2 text-right text-marca">{l.entradas ? '+' + formatarNumero(l.entradas) : '—'}</td>
                      <td className="px-3 py-2 text-right text-red-700">{l.saidas ? '−' + formatarNumero(l.saidas) : '—'}</td>
                      <td className="px-3 py-2 text-right text-violet-700">{l.ajustes ? (l.ajustes > 0 ? '+' : '') + formatarNumero(l.ajustes) : '—'}</td>
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
                        <td className={cx('whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums', m.quantidade < 0 ? 'text-red-700' : 'text-marca')}>
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
            {aba === 'compras' && <TabelaCompras linhas={relatorio.compras} conteudos={conteudos} />}
          </div>
        </>
      )}
    </div>
  )
}
