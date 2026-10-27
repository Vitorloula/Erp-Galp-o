import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, ScanBarcode, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BuscaProduto, type ExtrasLeitura } from '../components/BuscaProduto'
import { CampoQuantidade } from '../components/CampoQuantidade'
import { useToast } from '../components/Toast'
import { Aviso, BadgeSituacao, Cabecalho, Segmentado, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { ordenarFefo, resumirProduto, situacaoLote, situacaoValidade } from '../lib/estoque'
import { arred, exibirCodigo, formatarData, formatarDelta, formatarEmbalagens, formatarQtd, formatarValidade, hojeISO } from '../lib/formato'
import type { Produto } from '../lib/tipos'

type Modo = 'entrada' | 'saida' | 'ajuste'

interface UltimoLancamento {
  texto: string
  produto: Produto
}

export function Movimentar() {
  const [params, setParams] = useSearchParams()
  const { produtoPorId } = useDados()
  const { pode, loja, lojas } = useAtiva()
  const modo: Modo = (['entrada', 'saida', 'ajuste'] as const).find(m => m === params.get('tipo')) ?? 'saida'
  const produtoParam = params.get('produto')
  const [produto, setProduto] = useState<Produto | null>(null)
  const [extras, setExtras] = useState<ExtrasLeitura | undefined>()
  const [ultimo, setUltimo] = useState<UltimoLancamento | null>(null)
  const [chaveForm, setChaveForm] = useState(0)
  const [abrirCamera, setAbrirCamera] = useState(params.get('camera') === '1')

  // Produto vindo de outra tela (?produto=id)
  useEffect(() => {
    if (produtoParam && produtoPorId.has(produtoParam)) setProduto(produtoPorId.get(produtoParam)!)
  }, [produtoParam, produtoPorId])

  // Mantém o produto selecionado atualizado (ex.: editado em outro aparelho).
  const produtoAtual = produto ? (produtoPorId.get(produto.id) ?? produto) : null

  function trocarModo(m: Modo) {
    const p = new URLSearchParams(params)
    p.set('tipo', m)
    p.delete('camera')
    setParams(p, { replace: true })
    setChaveForm(k => k + 1)
  }

  function selecionar(p: Produto, ex?: ExtrasLeitura) {
    setProduto(p)
    setExtras(ex)
    setUltimo(null)
    setChaveForm(k => k + 1)
  }

  function limpar() {
    setProduto(null)
    setExtras(undefined)
    const p = new URLSearchParams(params)
    p.delete('produto')
    p.delete('lote')
    p.delete('camera')
    setParams(p, { replace: true })
  }

  function concluido(texto: string) {
    if (produtoAtual) setUltimo({ texto, produto: produtoAtual })
    setAbrirCamera(false)
    limpar()
    window.scrollTo({ top: 0 })
  }

  if (!pode.movimentar)
    return (
      <div className="mx-auto max-w-2xl">
        <Cabecalho titulo="Movimentar estoque" />
        <Aviso tom="alerta">
          {pode.gravavel ? 'Seu acesso permite consultar o estoque, mas não lançar entradas e saídas.' : 'A assinatura está vencida: o sistema está somente para consulta.'}
        </Aviso>
      </div>
    )

  return (
    <div className="mx-auto max-w-2xl">
      <Cabecalho
        titulo="Movimentar estoque"
        subtitulo={`Escaneie ou busque o produto e registre a movimentação${lojas && lojas.length > 1 ? ` em ${loja.nome}` : ''}.`}
      />

      <Segmentado
        className="mb-5"
        valor={modo}
        aoMudar={trocarModo}
        opcoes={[
          { valor: 'entrada', rotulo: <><ArrowDownToLine className="size-4.5" /> Entrada</> },
          { valor: 'saida', rotulo: <><ArrowUpFromLine className="size-4.5" /> Saída</> },
          { valor: 'ajuste', rotulo: <><SlidersHorizontal className="size-4.5" /> Ajuste</> },
        ]}
      />

      {ultimo && !produtoAtual && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-marca" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{ultimo.texto}</p>
            <Link to={`/produtos/${ultimo.produto.id}`} className="text-marca-escura underline underline-offset-2">
              Ver {ultimo.produto.nome}
            </Link>
          </div>
          <button onClick={() => setUltimo(null)} className="-m-1 p-1 text-marca" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
      )}

      {!produtoAtual ? (
        <BuscaProduto key={modo} aoSelecionar={selecionar} abrirCamera={abrirCamera} />
      ) : (
        <div className="space-y-4">
          <CartaoProduto produto={produtoAtual} aoTrocar={limpar} />
          {modo === 'entrada' && <FormEntrada key={chaveForm} produto={produtoAtual} extras={extras} aoConcluir={concluido} />}
          {modo === 'saida' && <FormSaida key={chaveForm} produto={produtoAtual} extras={extras} loteInicial={params.get('lote')} aoConcluir={concluido} />}
          {modo === 'ajuste' && <FormAjuste key={chaveForm} produto={produtoAtual} loteInicial={params.get('lote')} aoConcluir={concluido} />}
        </div>
      )}
    </div>
  )
}

function CartaoProduto({ produto, aoTrocar }: { produto: Produto; aoTrocar: () => void }) {
  const { lotesPorProduto } = useDados()
  const r = resumirProduto(lotesPorProduto.get(produto.id) ?? [])
  const emb = formatarEmbalagens(r.saldo, produto.conteudo_embalagem)
  return (
    <div className="cartao flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-snug text-slate-900">{produto.nome}</p>
        <p className="text-xs text-slate-500">
          {produto.codigo_interno}
          {produto.codigos[0] && ` · ${exibirCodigo(produto.codigos[0].codigo)}`}
          {produto.conteudo_embalagem && ` · emb. ${produto.conteudo_embalagem} ${produto.unidade}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">
            Saldo: <strong className="text-slate-900">{formatarQtd(r.saldo, produto.unidade)}</strong>
            {emb && <span className="text-slate-500"> ({emb})</span>}
          </span>
          <BadgeSituacao situacao={r.situacao} validade={r.proximaValidade} />
        </div>
      </div>
      <button onClick={aoTrocar} className="btn btn-secundario shrink-0 px-3 py-2 text-xs" aria-label="Trocar produto">
        <ScanBarcode className="size-4" /> Trocar
      </button>
    </div>
  )
}

function Campos({ documento, setDocumento, observacao, setObservacao, rotuloDoc }: {
  documento: string
  setDocumento: (v: string) => void
  observacao: string
  setObservacao: (v: string) => void
  rotuloDoc: string
}) {
  return (
    <>
      <div>
        <label className="rotulo" htmlFor="documento">{rotuloDoc}</label>
        <input id="documento" className="campo" value={documento} onChange={e => setDocumento(e.target.value)} placeholder="Opcional" />
      </div>
      <div>
        <label className="rotulo" htmlFor="observacao">Observação</label>
        <input id="observacao" className="campo" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" />
      </div>
    </>
  )
}

function useEnvio() {
  const toast = useToast()
  const { recarregar } = useDados()
  const ativa = useAtiva()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // Mesma chave em todas as tentativas deste formulário: reenviar após falha de rede não duplica.
  const origem = useRef(crypto.randomUUID())
  async function enviar(acao: (origemId: string) => Promise<string>, aoConcluir: (t: string) => void) {
    setErro('')
    setSalvando(true)
    try {
      const texto = await acao(origem.current)
      await recarregar()
      toast.sucesso(texto)
      aoConcluir(texto)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  return { salvando, erro, setErro, enviar, empresaId: ativa.empresa.empresa_id, lojaId: ativa.loja.id }
}

/* ------------------------------ ENTRADA ------------------------------ */

function FormEntrada({ produto, extras, aoConcluir }: { produto: Produto; extras?: ExtrasLeitura; aoConcluir: (t: string) => void }) {
  const { lotesPorProduto } = useDados()
  const lotes = lotesPorProduto.get(produto.id) ?? []
  const [lote, setLote] = useState(extras?.lote ?? '')
  const [validade, setValidade] = useState(extras?.validade ?? '')
  const [quantidade, setQuantidade] = useState<number | null>(null)
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')
  const { salvando, erro, setErro, enviar, lojaId } = useEnvio()
  const comLote = produto.rastreio !== 'nenhum'

  const situacao = validade ? situacaoValidade(validade) : null
  const existentes = useMemo(() => ordenarFefo(lotes.filter(l => l.lote)), [lotes])

  function escolherLote(valor: string) {
    setLote(valor)
    const igual = existentes.find(l => l.lote === valor.trim().toUpperCase())
    if (igual?.validade && !validade) setValidade(igual.validade)
  }

  function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (!quantidade) return setErro('Informe a quantidade recebida.')
    enviar(async origemId => {
      const dados = { produtoId: produto.id, lote: comLote ? lote : '', validade: comLote ? validade || null : null, quantidade, documento, observacao }
      await movimentos.registrarEntrada(lojaId, dados, origemId)
      return `Entrada registrada: ${formatarDelta(quantidade, produto.unidade)} de ${produto.nome}${lote ? ` (lote ${lote.trim().toUpperCase()})` : ''}.`
    }, aoConcluir)
  }

  return (
    <form onSubmit={registrar} className="cartao space-y-4 p-4">
      {comLote && (
      <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="rotulo" htmlFor="lote">Lote</label>
          <input id="lote" className="campo uppercase" list="lotes-existentes" value={lote} onChange={e => escolherLote(e.target.value)} placeholder="Opcional" autoComplete="off" />
          <datalist id="lotes-existentes">
            {existentes.map(l => (
              <option key={l.lote_id} value={l.lote}>{l.validade ? `val. ${formatarValidade(l.validade)}` : ''}</option>
            ))}
          </datalist>
        </div>
        <div>
          <label className="rotulo" htmlFor="validade">Validade</label>
          <input id="validade" type="date" className="campo" value={validade} onChange={e => setValidade(e.target.value)} />
        </div>
      </div>
      {validade && (
        <p className="-mt-2 text-sm text-slate-600">
          Validade: <strong>{formatarValidade(validade)}</strong> ({formatarData(validade)})
          {situacao && situacao !== 'ok' && <span className="ml-2"><BadgeSituacao situacao={situacao} validade={validade} /></span>}
        </p>
      )}
      {!validade && <p className="-mt-2 text-xs text-slate-500">Deixe a validade em branco apenas se o produto não tiver vencimento.</p>}
      {extras?.validade && <Aviso tom="info">Lote e validade preenchidos automaticamente pelo código da embalagem.</Aviso>}
      </>
      )}

      <CampoQuantidade produto={produto} aoMudar={setQuantidade} rotulo="Quantidade recebida" inicial={extras?.fator && extras.fator > 1 ? extras.fator : null} />
      <Campos documento={documento} setDocumento={setDocumento} observacao={observacao} setObservacao={setObservacao} rotuloDoc="Nota fiscal / documento" />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <button className="btn btn-primario btn-grande w-full" disabled={salvando || !quantidade}>
        <ArrowDownToLine className="size-5" />
        {salvando ? 'Registrando...' : quantidade ? `Registrar entrada de ${formatarQtd(quantidade, produto.unidade)}` : 'Registrar entrada'}
      </button>
    </form>
  )
}

/* ------------------------------- SAÍDA ------------------------------- */

const MOTIVOS_SAIDA = ['Venda / entrega', 'Uso próprio', 'Transferência', 'Descarte (vencido/avariado)', 'Devolução ao fornecedor']

function FormSaida({ produto, extras, loteInicial, aoConcluir }: { produto: Produto; extras?: ExtrasLeitura; loteInicial: string | null; aoConcluir: (t: string) => void }) {
  const { lotesPorProduto } = useDados()
  const hoje = hojeISO()
  const disponiveis = useMemo(() => ordenarFefo((lotesPorProduto.get(produto.id) ?? []).filter(l => l.saldo > 0)), [lotesPorProduto, produto.id])
  const [loteId, setLoteId] = useState<string>(() => {
    const porParam = disponiveis.find(l => l.lote_id === loteInicial)
    const porLeitura = extras?.lote ? disponiveis.find(l => l.lote === extras.lote!.toUpperCase()) : undefined
    const fefo = disponiveis.find(l => !l.validade || l.validade >= hoje) ?? disponiveis[0]
    return (porParam ?? porLeitura ?? fefo)?.lote_id ?? ''
  })
  const [quantidade, setQuantidade] = useState<number | null>(null)
  const [chaveQtd, setChaveQtd] = useState(0)
  const [inicialQtd, setInicialQtd] = useState<number | null>(extras?.fator && extras.fator > 1 ? extras.fator : null)
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')
  const { salvando, erro, setErro, enviar, empresaId, lojaId } = useEnvio()

  const lote = disponiveis.find(l => l.lote_id === loteId)
  const excede = lote && quantidade !== null && quantidade > lote.saldo

  if (disponiveis.length === 0)
    return (
      <Aviso tom="erro">
        <p className="font-semibold">Produto sem estoque.</p>
        <p>Não há saldo disponível para saída. Registre uma entrada primeiro.</p>
      </Aviso>
    )

  function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (!lote) return setErro('Escolha o lote.')
    if (!quantidade) return setErro('Informe a quantidade.')
    if (excede) return setErro(`Saldo insuficiente no lote. Disponível: ${formatarQtd(lote.saldo, produto.unidade)}.`)
    enviar(async origemId => {
      await movimentos.registrarSaida(empresaId, lojaId, { loteId: lote.lote_id, quantidade, documento, observacao }, origemId)
      return `Saída registrada: ${formatarDelta(-quantidade, produto.unidade)} de ${produto.nome}. Saldo do lote: ${formatarQtd(arred(lote.saldo - quantidade), produto.unidade)}.`
    }, aoConcluir)
  }

  return (
    <form onSubmit={registrar} className="cartao space-y-4 p-4">
      <fieldset>
        <legend className="rotulo">Lote (o que vence primeiro aparece primeiro)</legend>
        <div className="space-y-2">
          {disponiveis.map(l => {
            const sit = situacaoLote(l, hoje)
            const ativo = l.lote_id === loteId
            return (
              <label
                key={l.lote_id}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition',
                  ativo ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200 hover:border-slate-300',
                  `linha-${sit}`,
                )}
              >
                <input type="radio" name="lote" className="size-4.5 accent-marca" checked={ativo} onChange={() => setLoteId(l.lote_id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{l.lote ? `Lote ${l.lote}` : 'Sem lote'}</p>
                  <p className="text-xs opacity-75">Validade {formatarValidade(l.validade)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{formatarQtd(l.saldo, produto.unidade)}</p>
                  {sit !== 'ok' && <BadgeSituacao situacao={sit} validade={l.validade} />}
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>
      {lote && situacaoLote(lote, hoje) === 'vencido' && (
        <Aviso tom="erro">Atenção: este lote está <strong>vencido</strong>. Use a saída apenas para descarte/devolução.</Aviso>
      )}

      <div>
        <CampoQuantidade key={chaveQtd} inicial={inicialQtd} produto={produto} aoMudar={setQuantidade} rotulo="Quantidade a retirar" />
        {lote && (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-marca-escura hover:underline"
            onClick={() => {
              setInicialQtd(lote.saldo)
              setChaveQtd(k => k + 1)
            }}
          >
            Retirar tudo ({formatarQtd(lote.saldo, produto.unidade)})
          </button>
        )}
        {excede && <p className="mt-1 text-sm font-medium text-red-700">Maior que o saldo do lote ({formatarQtd(lote!.saldo, produto.unidade)}).</p>}
      </div>

      <div>
        <p className="rotulo">Destino / motivo</p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_SAIDA.map(m => (
            <button key={m} type="button" onClick={() => setObservacao(observacao === m ? '' : m)} className={cx('chip', observacao === m ? 'chip-ativo' : 'chip-inativo')}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <Campos documento={documento} setDocumento={setDocumento} observacao={observacao} setObservacao={setObservacao} rotuloDoc="Pedido / NF / romaneio" />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <button className="btn btn-primario btn-grande w-full" disabled={salvando || !quantidade || !!excede}>
        <ArrowUpFromLine className="size-5" />
        {salvando ? 'Registrando...' : quantidade ? `Dar baixa de ${formatarQtd(quantidade, produto.unidade)}` : 'Dar baixa'}
      </button>
    </form>
  )
}

/* ------------------------------- AJUSTE ------------------------------ */

function FormAjuste({ produto, loteInicial, aoConcluir }: { produto: Produto; loteInicial: string | null; aoConcluir: (t: string) => void }) {
  const { lotesPorProduto } = useDados()
  const lotes = useMemo(() => ordenarFefo(lotesPorProduto.get(produto.id) ?? []), [lotesPorProduto, produto.id])
  const [loteId, setLoteId] = useState(() => (lotes.find(l => l.lote_id === loteInicial) ?? lotes.find(l => l.saldo > 0) ?? lotes[0])?.lote_id ?? '')
  const [contado, setContado] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const { salvando, erro, setErro, enviar, empresaId, lojaId } = useEnvio()
  const lote = lotes.find(l => l.lote_id === loteId)
  const diferenca = lote && contado !== null ? arred(contado - lote.saldo) : null

  if (lotes.length === 0)
    return <Aviso tom="alerta">Este produto ainda não tem lotes. Use <strong>Entrada</strong> para registrar o primeiro recebimento.</Aviso>

  function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (!lote || diferenca === null) return setErro('Informe o saldo contado.')
    if (diferenca === 0) return setErro('O saldo contado é igual ao do sistema. Nada a ajustar.')
    if (motivo.trim().length < 3) return setErro('Informe o motivo do ajuste.')
    enviar(async origemId => {
      await movimentos.registrarAjuste(empresaId, lojaId, { loteId: lote.lote_id, quantidade: diferenca, observacao: motivo }, origemId)
      return `Ajuste registrado: ${formatarDelta(diferenca, produto.unidade)} em ${produto.nome}.`
    }, aoConcluir)
  }

  return (
    <form onSubmit={registrar} className="cartao space-y-4 p-4">
      <Aviso tom="info">Use o ajuste após uma contagem física (inventário). Para corrigir um lançamento específico, use <strong>Corrigir</strong> no Histórico.</Aviso>
      <div>
        <label className="rotulo" htmlFor="lote-ajuste">Lote</label>
        <select id="lote-ajuste" className="campo" value={loteId} onChange={e => setLoteId(e.target.value)}>
          {lotes.map(l => (
            <option key={l.lote_id} value={l.lote_id}>
              {(l.lote ? `Lote ${l.lote}` : 'Sem lote') + ` · val. ${formatarValidade(l.validade)} · saldo ${formatarQtd(l.saldo, produto.unidade)}`}
            </option>
          ))}
        </select>
      </div>
      <CampoQuantidade produto={produto} aoMudar={setContado} rotulo="Saldo contado fisicamente" permitirZero />
      {lote && diferenca !== null && (
        <div className={cx('rounded-xl border p-3 text-sm', diferenca === 0 ? 'border-slate-200 bg-slate-50' : 'border-violet-200 bg-violet-50 text-violet-900')}>
          Sistema: <strong>{formatarQtd(lote.saldo, produto.unidade)}</strong> · Contado: <strong>{formatarQtd(contado!, produto.unidade)}</strong> · Ajuste:{' '}
          <strong>{diferenca === 0 ? 'nenhum' : formatarDelta(diferenca, produto.unidade)}</strong>
        </div>
      )}
      <div>
        <label className="rotulo" htmlFor="motivo-ajuste">Motivo *</label>
        <input id="motivo-ajuste" className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: inventário mensal, avaria, perda" />
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <button className="btn btn-primario btn-grande w-full" disabled={salvando || diferenca === null || diferenca === 0}>
        <SlidersHorizontal className="size-5" />
        {salvando ? 'Registrando...' : 'Registrar ajuste'}
      </button>
    </form>
  )
}
