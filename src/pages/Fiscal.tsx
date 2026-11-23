import {
  Ban,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Info,
  Receipt,
  Send,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Kpi, Modal, Nota, Secao, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { fiscal } from '../lib/dados'
import type { LinhaConferencia } from '../lib/dados/fiscal'
import {
  MOTIVOS_SEM_NOTA,
  REGIMES,
  RESPONSABILIDADE_FISCAL,
  VIGENCIA_PADRAO,
  conferirVenda,
  diasAte,
  nomeRegime,
  resumirConferencia,
  type ResultadoConferencia,
  type SituacaoConferencia,
} from '../lib/fiscal'
import { formatarData, formatarHora, formatarMoeda, hojeISO } from '../lib/formato'
import { formatarReais, numeroVenda } from '../pdv/venda'

type Conferida = LinhaConferencia & ResultadoConferencia

const SITUACAO: Record<SituacaoConferencia, { rotulo: string; classe: string; icone: typeof CircleCheck }> = {
  pronta: {
    rotulo: 'Pronta',
    classe: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    icone: CircleCheck,
  },
  pendente: {
    rotulo: 'Precisa de ajuste',
    classe: 'bg-amber-100 text-amber-800 ring-amber-200',
    icone: TriangleAlert,
  },
  bloqueada: {
    rotulo: 'Bloqueada',
    classe: 'bg-red-100 text-red-800 ring-red-200',
    icone: CircleX,
  },
}

function Etiqueta({ children, tom }: { children: React.ReactNode; tom: 'verde' | 'ambar' | 'vermelho' | 'cinza' | 'azul' }) {
  const cores = {
    verde: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    ambar: 'bg-amber-100 text-amber-800 ring-amber-200',
    vermelho: 'bg-red-100 text-red-800 ring-red-200',
    cinza: 'bg-slate-100 text-slate-600 ring-slate-200',
    azul: 'bg-sky-100 text-sky-800 ring-sky-200',
  }
  return <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', cores[tom])}>{children}</span>
}

function SituacaoEtiqueta({ situacao }: { situacao: SituacaoConferencia }) {
  const s = SITUACAO[situacao]
  const Icone = s.icone
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', s.classe)}>
      <Icone className="size-3" aria-hidden /> {s.rotulo}
    </span>
  )
}

function DecisaoEtiqueta({ linha }: { linha: Conferida }) {
  if (linha.nfce_status === 'emitida') return <Etiqueta tom="verde">Nota emitida</Etiqueta>
  if (linha.nfce_status === 'cancelada') return <Etiqueta tom="cinza">Nota cancelada</Etiqueta>
  if (linha.nfce_decisao === 'sem_nota') return <Etiqueta tom="cinza">Sem nota</Etiqueta>
  if (linha.nfce_decisao === 'emitir')
    return <Etiqueta tom={linha.nfce_status === 'erro' ? 'vermelho' : 'azul'}>{linha.nfce_status === 'erro' ? 'Na fila (falhou)' : 'Na fila para emitir'}</Etiqueta>
  return null
}

function Valor({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-borda-loja bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium text-texto-secundario">{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-ponto">{valor}</p>
      {detalhe && <p className="text-[11px] leading-4 text-texto-secundario">{detalhe}</p>}
    </div>
  )
}

export function Fiscal() {
  const { empresa, loja, pode } = useAtiva()
  const { versao, recarregar } = useDados()
  const toast = useToast()

  const [dia, setDia] = useState(hojeISO())
  const [linhas, setLinhas] = useState<LinhaConferencia[] | null>(null)
  const [anteriores, setAnteriores] = useState<{ quantidade: number; primeira: string | null }>({ quantidade: 0, primeira: null })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [semNota, setSemNota] = useState<Conferida | null>(null)
  const [motivo, setMotivo] = useState('')

  const [fechamento, setFechamento] = useState<'dia' | 'anteriores' | null>(null)
  const [emitirAntes, setEmitirAntes] = useState(true)
  const [erroFechamento, setErroFechamento] = useState('')

  const hoje = hojeISO()
  const ehHoje = dia === hoje
  const podeDecidir = pode.decidirFiscal && ehHoje
  const conferenciaLigada = loja.modo_conferencia ?? true

  useEffect(() => {
    let ativo = true
    setErro('')
    Promise.all([
      fiscal.listarConferencia(empresa.empresa_id, loja.id, dia),
      fiscal.pendentesAnteriores(empresa.empresa_id, loja.id),
    ]).then(
      ([ls, ant]) => {
        if (!ativo) return
        setLinhas(ls)
        setAnteriores(ant)
      },
      e => {
        if (!ativo) return
        setErro((e as Error).message)
        setLinhas([])
      },
    )
    return () => {
      ativo = false
    }
  }, [empresa.empresa_id, loja.id, dia, versao])

  const conferidas = useMemo<Conferida[]>(
    () =>
      (linhas ?? []).map(l => ({
        ...l,
        ...conferirVenda({
          crt: l.crt ?? loja.crt ?? null,
          total: l.total,
          itens: l.itens,
          itensSemProduto: l.itens_sem_produto,
          itensSemNcm: l.itens_sem_ncm,
          produtosSemNcm: l.produtos_sem_ncm,
        }),
      })),
    [linhas, loja.crt],
  )

  const resumo = useMemo(() => resumirConferencia(conferidas), [conferidas])
  const totalVendido = useMemo(() => conferidas.reduce((s, l) => s + Math.round(l.total * 100), 0), [conferidas])

  const aDecidir = useMemo(
    () => conferidas.filter(l => !l.nfce_decisao && l.nfce_status !== 'emitida' && l.nfce_status !== 'cancelada'),
    [conferidas],
  )
  const aEmitir = useMemo(() => aDecidir.filter(l => l.situacao === 'pronta'), [aDecidir])
  const aAjustar = aDecidir.length - aEmitir.length

  async function marcarEmitir(alvos: Conferida[]): Promise<{ ok: number; erro?: string }> {
    let ok = 0
    let erro: string | undefined
    for (const l of alvos) {
      try {
        await fiscal.decidirNFCe(l.venda_id, 'emitir')
        ok++
      } catch (e) {
        erro ??= (e as Error).message
      }
    }
    return { ok, erro }
  }

  async function decidirEmitir(linha: Conferida) {
    setOcupado(linha.venda_id)
    try {
      await fiscal.decidirNFCe(linha.venda_id, 'emitir')
      toast.sucesso(`Venda ${numeroVenda(linha.caixa_numero, linha.numero)} marcada para emitir.`)
      await recarregar()
    } catch (e) {
      toast.erro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function emitirAsProntas() {
    if (aEmitir.length === 0) return
    setOcupado('lote')
    try {
      const r = await marcarEmitir(aEmitir)
      if (r.erro) toast.erro(r.erro)
      else toast.sucesso(`${r.ok} venda(s) marcada(s) para emitir.`)
      await recarregar()
    } finally {
      setOcupado(null)
    }
  }

  function abrirSemNota(linha: Conferida) {
    setMotivo('')
    setSemNota(linha)
  }

  async function salvarSemNota() {
    if (!semNota) return
    if (motivo.trim().length < 3) return
    setOcupado(semNota.venda_id)
    try {
      await fiscal.decidirNFCe(semNota.venda_id, 'sem_nota', motivo)
      toast.sucesso(`Venda ${numeroVenda(semNota.caixa_numero, semNota.numero)} registrada sem nota.`)
      setSemNota(null)
      setMotivo('')
      await recarregar()
    } catch (e) {
      toast.erro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  function abrirFechamento(tipo: 'dia' | 'anteriores') {
    setErroFechamento('')
    setEmitirAntes(true)
    setFechamento(tipo)
  }

  async function confirmarFechamento() {
    if (!fechamento) return
    setOcupado('fechar')
    setErroFechamento('')
    try {
      let emitidas = 0
      if (fechamento === 'dia' && emitirAntes && aEmitir.length > 0) {
        const r = await marcarEmitir(aEmitir)
        emitidas = r.ok
        if (r.erro) throw new Error(r.erro)
      }
      const fechadas = await fiscal.fecharDiaFiscal(
        empresa.empresa_id,
        loja.id,
        fechamento === 'dia' ? dia : undefined,
      )
      const partes = [
        emitidas ? `${emitidas} venda(s) marcada(s) para emitir.` : '',
        fechadas ? `${fechadas} venda(s) registrada(s) sem nota.` : 'Nenhuma venda estava sem decisão.',
      ].filter(Boolean)
      toast.sucesso(partes.join(' '))
      setFechamento(null)
      await recarregar()
    } catch (e) {
      setErroFechamento((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  const vigencia = loja.politica_vigencia ?? VIGENCIA_PADRAO
  const faltam = diasAte(vigencia)
  const rotuloDia = ehHoje ? 'hoje' : formatarData(dia)

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Conferência fiscal"
        subtitulo="O sistema prepara e confere a nota de cada venda. Quem decide emitir é a sua loja."
        acoes={
          pode.gerenciarEmpresa ? (
            <Link to="/empresa" className="btn btn-secundario">
              <SlidersHorizontal className="size-4" /> Configurar
            </Link>
          ) : undefined
        }
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!conferenciaLigada && (
        <Aviso tom="alerta">
          <strong>Conferência desligada nesta loja.</strong> As vendas não passam pela conferência até o dono ligar o modo na
          configuração da empresa.
        </Aviso>
      )}

      <Aviso tom="info">
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Nesta fase nada é enviado à SEFAZ: o sistema confere os dados e guarda a sua decisão. {RESPONSABILIDADE_FISCAL}
          </span>
        </span>
      </Aviso>

      {!loja.crt && (
        <Aviso tom="alerta">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Falta dizer como esta loja paga imposto.</strong> Sem o regime tributário (MEI, Simples ou Regime
              Normal), a nota fica bloqueada.
            </span>
            {pode.gerenciarEmpresa ? (
              <Link to="/empresa" className="btn btn-secundario px-3 py-1.5 text-xs">
                Informar regime
              </Link>
            ) : (
              <span className="text-xs font-medium">Fale com o dono da empresa.</span>
            )}
          </span>
        </Aviso>
      )}

      {anteriores.quantidade > 0 && (
        <Aviso tom="alerta">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{anteriores.quantidade} venda(s) de dias anteriores ficaram sem decisão</strong>
              {anteriores.primeira ? ` (desde ${formatarData(anteriores.primeira)})` : ''}. Elas não podem mais ser emitidas
              por aqui — valem como sem nota.
            </span>
            {pode.decidirFiscal && (
              <button className="btn btn-secundario px-3 py-1.5 text-xs" onClick={() => abrirFechamento('anteriores')}>
                Registrar como sem nota
              </button>
            )}
          </span>
        </Aviso>
      )}

      <div className="stagger-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Vendas do dia" valor={resumo.total} icone={Receipt} detalhe={formatarReais(totalVendido)} />
        <Kpi titulo="Prontas para decidir" valor={aEmitir.length} icone={CircleCheck} tom="verde" detalhe="Dados fiscais completos" />
        <Kpi titulo="Precisam de ajuste" valor={aAjustar} icone={TriangleAlert} tom="amarelo" detalhe="Produto ou regime incompleto" />
        <Kpi titulo="Notas emitidas" valor={resumo.emitidas} icone={Send} detalhe={`${resumo.semNota} sem nota`} />
      </div>

      <section className="cartao rounded-2xl p-4 sm:p-5" aria-labelledby="conferencia-dia">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-borda-loja pb-3">
          <div className="min-w-0">
            <h2 id="conferencia-dia" className="text-sm font-semibold text-ponto">
              Conferência de {rotuloDia}
            </h2>
            <p className="mt-0.5 text-xs text-texto-secundario">
              {ehHoje
                ? 'Confira e decida até o fim do dia. Depois disso a venda não pode mais ser emitida por aqui.'
                : 'Este dia já passou: as vendas sem decisão não podem mais ser emitidas — fale com o contador.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="campo w-auto py-1.5 text-sm"
              aria-label="Dia da conferência"
              value={dia}
              max={hoje}
              onChange={e => setDia(e.target.value || hoje)}
            />
            {pode.decidirFiscal && aDecidir.length > 0 && (
              <button className="btn btn-secundario px-3 py-1.5 text-sm" onClick={() => abrirFechamento('dia')}>
                <Clock className="size-4" /> {ehHoje ? 'Fechar o dia' : 'Encerrar o dia'}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Etiqueta tom="verde">{resumo.prontas} prontas</Etiqueta>
            <Etiqueta tom="ambar">{resumo.pendentes} com ajuste</Etiqueta>
            <Etiqueta tom="vermelho">{resumo.bloqueadas} bloqueadas</Etiqueta>
            <Etiqueta tom="cinza">{resumo.semNota} sem nota</Etiqueta>
          </div>
          {podeDecidir && aEmitir.length > 0 && (
            <button className="btn btn-primario px-3 py-1.5 text-sm" onClick={emitirAsProntas} disabled={ocupado !== null}>
              <Send className="size-4" /> {ocupado === 'lote' ? 'Marcando...' : `Emitir as ${aEmitir.length} prontas`}
            </button>
          )}
        </div>

        {linhas === null ? (
          <Carregando texto="Conferindo as vendas do dia..." />
        ) : conferidas.length === 0 ? (
          <Vazio
            icone={Receipt}
            titulo="Nenhuma venda concluída neste dia"
            texto="Quando o caixa finalizar uma venda, ela aparece aqui para a conferência fiscal."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {conferidas.map(l => {
              const processando = ocupado === l.venda_id
              const podeAqui =
                podeDecidir && !l.nfce_decisao && l.nfce_status !== 'emitida' && l.nfce_status !== 'cancelada'
              return (
                <li key={l.venda_id} className="py-3.5">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">Venda {numeroVenda(l.caixa_numero, l.numero)}</span>
                        <span className="text-xs text-slate-500">
                          {ehHoje ? formatarHora(l.ocorrido_em) : formatarData(l.ocorrido_em)} · {l.caixa_nome}
                          {l.operador_nome ? ` · ${l.operador_nome}` : ''}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {l.itens} {l.itens === 1 ? 'item' : 'itens'} · {formatarMoeda(l.total)}
                        {l.cliente_cpf ? ` · CPF ${l.cliente_cpf}` : ''}
                      </p>

                      {l.pendencias.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {l.pendencias.map((p, i) => (
                            <li key={`${p.tipo}-${i}`} className="flex items-start gap-1.5 text-xs leading-4 text-slate-600">
                              <CircleAlert
                                className={cx(
                                  'mt-px size-3.5 shrink-0',
                                  l.situacao === 'bloqueada' ? 'text-red-500' : 'text-amber-500',
                                )}
                                aria-hidden
                              />
                              <span>{p.texto}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {l.nfce_decisao === 'sem_nota' && l.nfce_motivo && (
                        <p className="mt-1 text-xs text-slate-500">
                          Motivo: {l.nfce_motivo}
                          {l.nfce_decidido_em ? ` · ${formatarHora(l.nfce_decidido_em)}` : ''}
                        </p>
                      )}
                      {!l.nfce_decisao && !ehHoje && l.nfce_status !== 'emitida' && l.nfce_status !== 'cancelada' && (
                        <p className="mt-1 text-xs font-medium text-amber-800">
                          Ficou sem decisão no dia: vale como sem nota.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-col sm:items-end">
                      <SituacaoEtiqueta situacao={l.situacao} />
                      <DecisaoEtiqueta linha={l} />
                      {podeAqui && (
                        <div className="flex gap-1.5">
                          <button
                            className="btn btn-secundario px-2.5 py-1 text-xs"
                            onClick={() => decidirEmitir(l)}
                            disabled={ocupado !== null || l.situacao !== 'pronta'}
                            title={
                              l.situacao === 'pronta'
                                ? 'Marcar esta venda para emitir'
                                : 'Corrija as pendências antes de emitir'
                            }
                          >
                            <Send className="size-3.5" /> {processando ? '...' : 'Emitir'}
                          </button>
                          <button
                            className="btn btn-fantasma px-2.5 py-1 text-xs"
                            onClick={() => abrirSemNota(l)}
                            disabled={ocupado !== null}
                          >
                            <Ban className="size-3.5" /> Sem nota
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <Nota className="mt-3" icone={Info}>
          “Emitir” coloca a venda na fila de emissão. Enquanto a integração com a SEFAZ está desligada, nada é enviado — a
          decisão fica registrada com o nome de quem decidiu.
        </Nota>
      </section>

      <Secao
        icone={CalendarDays}
        titulo="O que muda em 2027"
        descricao="A obrigação de emitir em toda venda chega para MEI e Simples (LC 214/2025)."
        className="rounded-2xl"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Valor
            rotulo="Regime desta loja"
            valor={nomeRegime(loja.crt)}
            detalhe={loja.regime_confirmado_em ? `Confirmado em ${formatarData(loja.regime_confirmado_em)}` : 'A confirmar com o contador'}
          />
          <Valor
            rotulo="Quem decide emitir"
            valor={loja.politica_emissao === 'automatica' ? 'Automático' : 'A loja decide'}
            detalhe={
              loja.politica_emissao === 'automatica'
                ? `A partir de ${formatarData(vigencia)}`
                : 'Você escolhe venda por venda'
            }
          />
          <Valor
            rotulo={faltam > 0 ? 'Faltam' : 'Obrigação'}
            valor={faltam > 0 ? `${faltam} dia${faltam === 1 ? '' : 's'}` : 'Já está valendo'}
            detalhe={`Vigência em ${formatarData(vigencia)}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Nota icone={Info} className="flex-1">
            O sistema já registra a decisão de cada venda. Quando a emissão automática da sua loja for ligada, ela passa a
            valer a partir da data escolhida — sem perder o histórico.
          </Nota>
          {pode.gerenciarEmpresa && (
            <Link to="/empresa" className="btn btn-secundario px-3 py-1.5 text-xs">
              Ajustar na Empresa
            </Link>
          )}
        </div>
        <details className="mt-3 rounded-xl bg-superficie px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Como sei qual é o meu regime? ({REGIMES.length} opções)
          </summary>
          <ul className="mt-2 space-y-1.5">
            {REGIMES.map(r => (
              <li key={r.crt} className="text-xs leading-4 text-slate-600">
                <strong className="text-slate-800">{r.nome}:</strong> {r.resumo}
              </li>
            ))}
          </ul>
        </details>
      </Secao>

      {!pode.decidirFiscal && (
        <Nota icone={Info}>
          Somente o dono ou o gerente decide a nota fiscal. Você pode acompanhar a conferência, mas não alterar as decisões.
        </Nota>
      )}

      <Modal
        aberto={!!semNota}
        aoFechar={() => setSemNota(null)}
        titulo={semNota ? `Venda ${numeroVenda(semNota.caixa_numero, semNota.numero)} sem nota` : 'Sem nota'}
        rodape={
          <>
            <button className="btn btn-secundario flex-1" onClick={() => setSemNota(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primario flex-1"
              onClick={salvarSemNota}
              disabled={motivo.trim().length < 3 || ocupado !== null}
            >
              {ocupado ? 'Salvando...' : 'Deixar sem nota'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            A venda continua registrada no caixa normalmente — só não será emitida nota fiscal. O motivo fica guardado com
            seu nome e a hora, e <strong>esta decisão não pode ser desfeita</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_SEM_NOTA.map(m => (
              <button key={m.valor} type="button" className="chip chip-inativo" onClick={() => setMotivo(m.texto)}>
                {m.texto}
              </button>
            ))}
          </div>
          <div>
            <label className="rotulo" htmlFor="motivo-sem-nota">
              Motivo (mínimo 3 letras)
            </label>
            <input
              id="motivo-sem-nota"
              className="campo"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: cliente não pediu a nota"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      <Modal
        aberto={!!fechamento}
        aoFechar={() => setFechamento(null)}
        titulo="Fim do dia"
        rodape={
          <>
            <button className="btn btn-secundario flex-1" onClick={() => setFechamento(null)}>
              Cancelar
            </button>
            <button className="btn btn-primario flex-1" onClick={confirmarFechamento} disabled={ocupado !== null}>
              {ocupado === 'fechar' ? 'Fechando...' : fechamento === 'anteriores' ? 'Registrar sem nota' : 'Fechar o dia'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {erroFechamento && <Aviso tom="erro">{erroFechamento}</Aviso>}
          {fechamento === 'anteriores' ? (
            <>
              <p className="text-sm text-slate-600">
                Existem <strong>{anteriores.quantidade} venda(s)</strong> de dias anteriores sem decisão. Como o prazo de cada
                dia já passou, elas serão registradas como <strong>sem nota</strong> — com o motivo “dia encerrado” e seu nome.
              </p>
              <Nota icone={Info}>
                Se alguma dessas vendas precisar de nota, fale com o contador antes de fechar. Depois não é possível emitir por
                aqui.
              </Nota>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Ao fechar {ehHoje ? 'o dia de hoje' : 'este dia'}, as vendas que ainda estão sem decisão passam a valer como
                <strong> sem nota</strong>. Isso não pode ser desfeito.
              </p>
              <ul className="space-y-1.5 rounded-xl bg-superficie px-3 py-2.5 text-sm text-slate-700">
                <li className="flex items-center justify-between gap-2">
                  <span>Prontas para emitir</span>
                  <strong>{aEmitir.length}</strong>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Com pendência (sem corrigir)</span>
                  <strong>{aAjustar}</strong>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Já decididas</span>
                  <strong>{resumo.total - aDecidir.length}</strong>
                </li>
              </ul>
              {ehHoje && aEmitir.length > 0 && (
                <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4.5 accent-ponto"
                    checked={emitirAntes}
                    onChange={e => setEmitirAntes(e.target.checked)}
                  />
                  Marcar as {aEmitir.length} prontas para emitir antes de fechar
                </label>
              )}
              <Nota icone={Info}>
                Fechar o dia não envia nada à SEFAZ. As notas escolhidas entram na fila e serão emitidas quando a integração
                estiver ligada. Vendas novas do mesmo dia ainda podem ser decididas depois.
              </Nota>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
