import { Banknote, Check, Minus, Percent, Plus, Printer, ScanBarcode, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LeitorCodigo } from '../../components/LeitorCodigo'
import { useToast } from '../../components/Toast'
import { Aviso, Modal, cx } from '../../components/ui'
import { useAuth } from '../../contexto/Auth'
import { useAtualizacao } from '../../lib/atualizacao'
import { useAtiva } from '../../contexto/Empresa'
import { formatarNumero, lerNumero } from '../../lib/formato'
import { formatarCpf, validarCpf } from '../../lib/cpf'
import { usePdv, type Leitura } from '../../pdv/contexto'
import type { ProdutoLocal } from '../../pdv/local'
import {
  FORMAS,
  adicionarItem,
  brutoItem,
  calcularTotais,
  centavos,
  conferirPagamentos,
  dadosDaVenda,
  formatarReais,
  lerEntrada,
  numeroVenda,
  reais,
  uuidv7,
  type FormaPagamento,
  type ItemCarrinho,
  type Pagamento,
} from '../../pdv/venda'
import { Cupom, type DadosCupom } from './Cupom'

type ModalVenda = null | 'busca' | 'desconto' | 'pagamento' | 'preco' | 'camera' | 'cancelar'

interface Alerta {
  tom: 'erro' | 'alerta'
  texto: string
  /** Código não cadastrado (oferece vender como "Diversos"). */
  codigo?: string
}

export function TelaVenda({ abrirMenu }: { abrirMenu: () => void }) {
  const pdv = usePdv()
  const { empresa, loja, lojas } = useAtiva()
  const { usuario } = useAuth()
  const toast = useToast()
  const [itens, setItens] = useState<ItemCarrinho[]>([])
  const [descontoVenda, setDescontoVenda] = useState(0)
  const [entrada, setEntrada] = useState('')
  const [alerta, setAlerta] = useState<Alerta | null>(null)
  const [modal, setModal] = useState<ModalVenda>(null)
  const [termoBusca, setTermoBusca] = useState('')
  const [precoPara, setPrecoPara] = useState<{ produto: ProdutoLocal; quantidade: number; codigo: string | null } | null>(null)
  const [editando, setEditando] = useState<ItemCarrinho | null>(null)
  const [concluida, setConcluida] = useState<{ numeroExibicao: string; total: number; troco: number } | null>(null)
  const [cupom, setCupom] = useState<DadosCupom | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const totais = useMemo(() => calcularTotais(itens, descontoVenda), [itens, descontoVenda])
  const atualizacao = useAtualizacao()

  useEffect(() => {
    if (!modal && !editando && !concluida) campo.current?.focus()
  }, [modal, editando, concluida, itens])

  const adicionar = useCallback(
    async (l: Leitura) => {
      const p = l.produto
      if (!p.ativo) return setAlerta({ tom: 'erro', texto: `${p.nome} está inativo no cadastro.` })
      if (l.precoUnitario === undefined && p.preco_venda === null) {
        setPrecoPara({ produto: p, quantidade: l.quantidade, codigo: l.codigoLido })
        return setModal('preco')
      }
      let aviso: Alerta | null = null
      if (p.controla_estoque) {
        const noCarrinho = itens.filter(i => i.produtoId === p.id).reduce((s, i) => s + i.quantidade, 0)
        const disponivel = (await pdv.disponivel(p)) - noCarrinho
        const politica = empresa.config.venda_sem_estoque ?? 'avisar'
        if (disponivel < l.quantidade && politica !== 'permitir') {
          const texto = `Estoque insuficiente de ${p.nome}: disponível ${formatarNumero(Math.max(0, disponivel))} ${p.unidade}.`
          if (politica === 'bloquear') return setAlerta({ tom: 'erro', texto })
          aviso = { tom: 'alerta', texto: texto + ' A venda continua; confira o estoque depois.' }
        }
      }
      const preco = l.precoUnitario ?? centavos(p.preco_venda ?? 0)
      const novo: ItemCarrinho = {
        id: uuidv7(),
        produtoId: p.id,
        descricao: p.nome,
        unidade: p.unidade,
        codigoLido: l.codigoLido,
        loteId: null,
        quantidade: l.quantidade,
        precoTabela: centavos(p.preco_venda ?? reais(preco)),
        precoUnitario: preco,
        descontoItem: 0,
      }
      setItens(lista => adicionarItem(lista, novo, p.pesavel || l.precoUnitario !== undefined))
      setAlerta(aviso)
    },
    [itens, pdv, empresa.config.venda_sem_estoque],
  )

  async function processar(texto: string) {
    const { quantidade, codigo } = lerEntrada(texto)
    setEntrada('')
    if (!codigo) return
    const l = await pdv.identificar(codigo, quantidade)
    if (l) return adicionar(l)
    if (!/^\d+$/.test(codigo)) {
      setTermoBusca(codigo)
      return setModal('busca')
    }
    setAlerta({ tom: 'erro', texto: `Código ${codigo} não cadastrado.`, codigo })
  }

  function novaVenda() {
    setConcluida(null)
    setAlerta(null)
  }

  async function finalizar(pagamentos: Pagamento[], clienteCpf?: string | null) {
    const caixa = pdv.caixa!
    const sessao = pdv.sessao!
    const numero = await pdv.proximoNumero()
    const agora = pdv.sinc.agora()
    const vendaId = uuidv7(agora.getTime())
    const dados = dadosDaVenda({ caixaId: caixa.caixa_id, sessaoId: sessao.id, vendaId, numero, ocorridoEm: agora.toISOString(), itens, descontoVenda, pagamentos, clienteCpf })
    const numeroExibicao = numeroVenda(caixa.numero, numero)
    await pdv.banco.vendas.put({ id: vendaId, sessao_id: sessao.id, numero, numero_exibicao: numeroExibicao, ocorrido_em: dados.ocorrido_em, total: dados.total, dados, status: 'concluida', sincronizada: false })
    await pdv.sinc.enfileirar('venda', dados)
    setCupom({
      empresa: empresa.nome,
      loja: (lojas?.length ?? 0) > 1 ? loja.nome : null,
      documento: null,
      caixa: caixa.nome,
      numeroExibicao,
      operador: usuario?.nome ?? '',
      ocorridoEm: dados.ocorrido_em,
      venda: dados,
    })
    setConcluida({ numeroExibicao, total: centavos(dados.total), troco: centavos(dados.troco) })
    setItens([])
    setDescontoVenda(0)
    setModal(null)
  }

  // Atalhos de teclado (leitor USB digita o código + Enter no campo).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (concluida) {
        if (e.key === 'Enter') {
          e.preventDefault()
          novaVenda()
        } else if (e.key === 'F12') {
          e.preventDefault()
          window.print()
        }
        return
      }
      if (modal || editando) return
      const acoes: Record<string, () => void> = {
        F2: () => setModal('busca'),
        F3: () => itens.length && setModal('desconto'),
        F4: () => itens.length && setModal('pagamento'),
        F10: abrirMenu,
        Escape: () => itens.length && setModal('cancelar'),
      }
      if (acoes[e.key]) {
        e.preventDefault()
        acoes[e.key]()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [concluida, modal, editando, itens.length, abrirMenu])

  const quantidadeItens = itens.reduce((s, i) => s + (i.unidade === 'un' ? i.quantidade : 1), 0)

  return (
    <main className="flex flex-1 flex-col gap-3 p-3 pb-40 lg:flex-row lg:p-4 lg:pb-4">
      <section className="cartao flex min-h-0 flex-1 flex-col overflow-hidden">
        <form
          className="flex gap-2 border-b border-slate-100 p-3"
          onSubmit={e => {
            e.preventDefault()
            processar(entrada)
          }}
        >
          <input
            ref={campo}
            className="campo py-3 text-lg"
            value={entrada}
            onChange={e => setEntrada(e.target.value)}
            placeholder="Código de barras, 3*código ou nome"
            aria-label="Código do produto"
            autoComplete="off"
            enterKeyHint="go"
          />
          <button type="button" className="btn btn-secundario shrink-0 px-3" onClick={() => setModal('camera')} title="Câmera" aria-label="Ler com a câmera">
            <ScanBarcode className="size-5" />
          </button>
          <button type="button" className="btn btn-secundario shrink-0 px-3" onClick={() => setModal('busca')} title="Buscar (F2)" aria-label="Buscar produto (F2)">
            <Search className="size-5" />
          </button>
        </form>
        {alerta && (
          <div className="px-3 pt-3">
            <Aviso tom={alerta.tom}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{alerta.texto}</span>
                {alerta.codigo && (
                  <button
                    type="button"
                    className="btn btn-secundario px-3 py-1.5 text-xs"
                    onClick={async () => {
                      const diversos = await pdv.produtoDiversos()
                      if (!diversos) return toast.erro('Cadastre um produto com código interno DIVERSOS para vender itens sem cadastro.')
                      setPrecoPara({ produto: diversos, quantidade: 1, codigo: alerta.codigo! })
                      setModal('preco')
                    }}
                  >
                    Vender como Diversos
                  </button>
                )}
              </div>
            </Aviso>
          </div>
        )}
        {itens.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 p-10 text-center text-slate-400">
            <ShoppingCart className="size-10" />
            <p className="text-sm">Passe o código de barras ou digite o código/nome do produto.</p>
            <p className="text-xs">F2 buscar · F3 desconto · F4 pagar · F10 menu</p>
            {/* Versão nova só é aplicada com a venda vazia */}
            {atualizacao.disponivel && (
              <button className="btn btn-secundario mt-3 text-sm text-slate-700" onClick={atualizacao.atualizar}>
                Atualizar o aplicativo
              </button>
            )}
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {itens.map((i, k) => (
              <li key={i.id} data-item={i.descricao}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => setEditando(i)}>
                  <span className="w-6 text-xs font-semibold text-slate-400">{k + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{i.descricao}</span>
                    <span className="block text-xs text-slate-500">
                      {formatarNumero(i.quantidade)} {i.unidade} × {formatarReais(i.precoUnitario)}
                      {i.descontoItem > 0 && ` · desconto ${formatarReais(i.descontoItem)}`}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">{formatarReais(brutoItem(i) - Math.min(i.descontoItem, brutoItem(i)))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Totais: lateral no computador, barra fixa embaixo no celular */}
      <aside className="fixed inset-x-0 bottom-0 z-20 space-y-3 border-t border-slate-200 bg-white p-3 shadow-lg lg:static lg:w-80 lg:rounded-2xl lg:border lg:shadow-sm">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>{itens.length} item(ns) · {formatarNumero(quantidadeItens)} un.</span>
            <span>Subtotal {formatarReais(totais.subtotal)}</span>
          </div>
          {totais.desconto > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto</span>
              <span>− {formatarReais(totais.desconto)}</span>
            </div>
          )}
          <div className="flex items-end justify-between">
            <span className="text-sm font-semibold text-slate-600">Total</span>
            <span className="text-3xl font-black tabular-nums text-slate-900" data-total>{formatarReais(totais.total)}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn btn-secundario px-2" disabled={!itens.length} onClick={() => setModal('cancelar')} title="Cancelar venda (Esc)">
            <X className="size-4.5" /> <span className="hidden sm:inline">Cancelar</span>
          </button>
          <button className="btn btn-secundario px-2" disabled={!itens.length} onClick={() => setModal('desconto')} title="Desconto (F3)">
            <Percent className="size-4.5" /> <span className="hidden sm:inline">Desconto</span>
          </button>
          <button className="btn btn-primario px-2" disabled={!itens.length} onClick={() => setModal('pagamento')} title="Pagar (F4)">
            <Banknote className="size-4.5" /> Pagar
          </button>
        </div>
      </aside>

      <BuscaPdv
        aberto={modal === 'busca'}
        termoInicial={termoBusca}
        aoFechar={() => {
          setModal(null)
          setTermoBusca('')
        }}
        aoEscolher={p => {
          setModal(null)
          setTermoBusca('')
          adicionar({ produto: p, quantidade: 1, codigoLido: '' })
        }}
      />
      <PrecoAvulso
        dados={modal === 'preco' ? precoPara : null}
        aoFechar={() => setModal(null)}
        aoConfirmar={(p, preco) => {
          setModal(null)
          adicionar({ produto: p.produto, quantidade: p.quantidade, codigoLido: p.codigo ?? '', precoUnitario: preco })
        }}
      />
      <DescontoVenda
        aberto={modal === 'desconto'}
        subtotal={totais.subtotal - totais.descontoItens}
        atual={descontoVenda}
        aoFechar={() => setModal(null)}
        aoAplicar={d => {
          setDescontoVenda(d)
          setModal(null)
        }}
      />
      <EditarItem
        item={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={novo => {
          setItens(l => l.map(i => (i.id === novo.id ? novo : i)))
          setEditando(null)
        }}
        aoRemover={id => {
          setItens(l => l.filter(i => i.id !== id))
          setEditando(null)
        }}
      />
      {modal === 'pagamento' && <TelaPagamento total={totais.total} aoVoltar={() => setModal(null)} aoConcluir={finalizar} />}
      <Modal
        aberto={modal === 'cancelar'}
        aoFechar={() => setModal(null)}
        titulo="Cancelar esta venda?"
        rodape={
          <>
            <button className="btn btn-secundario flex-1" onClick={() => setModal(null)}>Continuar vendendo</button>
            <button
              className="btn btn-perigo flex-1"
              autoFocus
              onClick={() => {
                setItens([])
                setDescontoVenda(0)
                setAlerta(null)
                setModal(null)
              }}
            >
              Cancelar venda
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Os {itens.length} item(ns) serão retirados. Nada foi registrado ainda.</p>
      </Modal>
      <LeitorCodigo
        aberto={modal === 'camera'}
        aoFechar={() => setModal(null)}
        aoLer={c => {
          setModal(null)
          processar(c.codigo)
        }}
      />

      {concluida && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Venda concluída">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="size-8" />
            </span>
            <div>
              <p className="text-sm text-slate-500">Venda {concluida.numeroExibicao} concluída</p>
              <p className="text-lg font-semibold text-slate-900">Total {formatarReais(concluida.total)}</p>
            </div>
            {concluida.troco > 0 && (
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-900">
                <p className="text-sm font-semibold">Troco</p>
                <p className="text-4xl font-black tabular-nums" data-troco>{formatarReais(concluida.troco)}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-secundario" onClick={() => window.print()}>
                <Printer className="size-4.5" /> Cupom (F12)
              </button>
              <button className="btn btn-primario" onClick={novaVenda} autoFocus>
                Nova venda
              </button>
            </div>
          </div>
        </div>
      )}
      <Cupom dados={cupom} />
    </main>
  )
}

function BuscaPdv({ aberto, termoInicial, aoFechar, aoEscolher }: { aberto: boolean; termoInicial: string; aoFechar: () => void; aoEscolher: (p: ProdutoLocal) => void }) {
  const { buscarPorNome } = usePdv()
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<ProdutoLocal[]>([])
  useEffect(() => {
    if (aberto) setTermo(termoInicial)
  }, [aberto, termoInicial])
  useEffect(() => {
    let ativo = true
    buscarPorNome(termo).then(l => ativo && setLista(l))
    return () => {
      ativo = false
    }
  }, [termo, buscarPorNome])
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Buscar produto">
      <input
        className="campo mb-3"
        value={termo}
        onChange={e => setTermo(e.target.value)}
        placeholder="Nome ou código interno"
        aria-label="Buscar no caixa"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter' && lista[0]) {
            e.preventDefault()
            aoEscolher(lista[0])
          }
        }}
      />
      <ul className="divide-y divide-slate-100">
        {lista.map(p => (
          <li key={p.id}>
            <button className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50" onClick={() => aoEscolher(p)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{p.nome}</span>
                <span className="block text-xs text-slate-500">
                  {p.codigo_interno}
                  {p.controla_estoque && ` · saldo ${formatarNumero(p.saldo)} ${p.unidade}`}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{p.preco_venda === null ? 'sem preço' : formatarReais(centavos(p.preco_venda))}</span>
            </button>
          </li>
        ))}
        {termo && lista.length === 0 && <li className="py-4 text-center text-sm text-slate-500">Nenhum produto encontrado.</li>}
      </ul>
    </Modal>
  )
}

function PrecoAvulso({
  dados,
  aoFechar,
  aoConfirmar,
}: {
  dados: { produto: ProdutoLocal; quantidade: number; codigo: string | null } | null
  aoFechar: () => void
  aoConfirmar: (d: { produto: ProdutoLocal; quantidade: number; codigo: string | null }, preco: number) => void
}) {
  const [valor, setValor] = useState('')
  useEffect(() => setValor(''), [dados])
  const v = lerNumero(valor)
  return (
    <Modal
      aberto={!!dados}
      aoFechar={aoFechar}
      titulo={`Preço de ${dados?.produto.nome ?? ''}`}
      rodape={
        <button className="btn btn-primario flex-1" form="form-preco" disabled={!v || v <= 0}>
          Adicionar
        </button>
      }
    >
      <form
        id="form-preco"
        onSubmit={e => {
          e.preventDefault()
          if (dados && v && v > 0) aoConfirmar(dados, centavos(v))
        }}
      >
        <label className="rotulo" htmlFor="preco-avulso">Preço por {dados?.produto.unidade} (R$)</label>
        <input id="preco-avulso" className="campo text-lg" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus />
      </form>
    </Modal>
  )
}

function DescontoVenda({ aberto, subtotal, atual, aoFechar, aoAplicar }: { aberto: boolean; subtotal: number; atual: number; aoFechar: () => void; aoAplicar: (c: number) => void }) {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<'valor' | 'porcento'>('valor')
  useEffect(() => {
    if (aberto) setTexto(atual ? String(reais(atual)).replace('.', ',') : '')
  }, [aberto, atual])
  const n = lerNumero(texto) ?? 0
  const desconto = Math.min(subtotal, tipo === 'valor' ? centavos(n) : Math.round((subtotal * n) / 100))
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Desconto na venda"
      rodape={
        <button className="btn btn-primario flex-1" form="form-desconto">
          Aplicar {formatarReais(desconto)}
        </button>
      }
    >
      <form
        id="form-desconto"
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault()
          aoAplicar(desconto)
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {(['valor', 'porcento'] as const).map(t => (
            <button key={t} type="button" className={cx('chip justify-center', tipo === t ? 'chip-ativo' : 'chip-inativo')} onClick={() => setTipo(t)}>
              {t === 'valor' ? 'Em reais' : 'Em %'}
            </button>
          ))}
        </div>
        <input className="campo text-lg" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Valor do desconto" autoFocus />
        <p className="text-xs text-slate-500">O desconto é distribuído entre os itens, proporcional ao valor de cada um.</p>
      </form>
    </Modal>
  )
}

function EditarItem({ item, aoFechar, aoSalvar, aoRemover }: { item: ItemCarrinho | null; aoFechar: () => void; aoSalvar: (i: ItemCarrinho) => void; aoRemover: (id: string) => void }) {
  const [qtd, setQtd] = useState('')
  const [desc, setDesc] = useState('')
  useEffect(() => {
    if (!item) return
    setQtd(String(item.quantidade).replace('.', ','))
    setDesc(item.descontoItem ? String(reais(item.descontoItem)).replace('.', ',') : '')
  }, [item])
  const q = lerNumero(qtd)
  const d = desc.trim() ? lerNumero(desc) : 0
  const valido = !!item && q !== null && q > 0 && d !== null && d >= 0
  const mudar = (delta: number) => setQtd(String(Math.max(1, Math.round(((lerNumero(qtd) ?? 1) + delta) * 1000) / 1000)).replace('.', ','))
  return (
    <Modal
      aberto={!!item}
      aoFechar={aoFechar}
      titulo={item?.descricao ?? ''}
      rodape={
        <>
          <button className="btn btn-perigo" onClick={() => item && aoRemover(item.id)}>
            <Trash2 className="size-4.5" /> Remover
          </button>
          <button className="btn btn-primario flex-1" form="form-item" disabled={!valido}>
            Salvar
          </button>
        </>
      }
    >
      <form
        id="form-item"
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault()
          if (valido) aoSalvar({ ...item!, quantidade: Math.round(q! * 1000) / 1000, descontoItem: centavos(d!) })
        }}
      >
        <label className="rotulo" htmlFor="item-qtd">Quantidade ({item?.unidade})</label>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secundario px-3" onClick={() => mudar(-1)} aria-label="Menos um">
            <Minus className="size-4.5" />
          </button>
          <input id="item-qtd" className="campo text-center text-lg" inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus />
          <button type="button" className="btn btn-secundario px-3" onClick={() => mudar(1)} aria-label="Mais um">
            <Plus className="size-4.5" />
          </button>
        </div>
        <div>
          <label className="rotulo" htmlFor="item-desc">Desconto neste item (R$)</label>
          <input id="item-desc" className="campo" inputMode="decimal" value={desc} onChange={e => setDesc(e.target.value)} placeholder="0,00" />
        </div>
      </form>
    </Modal>
  )
}

/** Pagamento: F5 dinheiro, F6 Pix, F7 débito, F8 crédito, F9 outros. Enter sem valor = o que falta. */
function TelaPagamento({ total, aoVoltar, aoConcluir }: { total: number; aoVoltar: () => void; aoConcluir: (p: Pagamento[], clienteCpf?: string | null) => Promise<void> }) {
  const [pagos, setPagos] = useState<Pagamento[]>([])
  const [forma, setForma] = useState<FormaPagamento>('01')
  const [valor, setValor] = useState('')
  const [cpf, setCpf] = useState('')
  const [concluindo, setConcluindo] = useState(false)
  const conf = conferirPagamentos(total, pagos)
  const campo = useRef<HTMLInputElement>(null)

  const cpfInvalido = !!cpf.trim() && !validarCpf(cpf)

  useEffect(() => {
    campo.current?.focus()
  }, [forma, pagos])

  function adicionar(f: FormaPagamento) {
    const v = valor.trim() ? lerNumero(valor) : reais(conf.falta)
    setForma(f)
    if (!v || v <= 0) return
    setPagos(p => [...p, { id: uuidv7(), forma: f, valor: centavos(v) }])
    setValor('')
  }

  async function concluir() {
    if (conf.erro || concluindo || cpfInvalido) return
    setConcluindo(true)
    try {
      await aoConcluir(pagos, cpf.trim() ? formatarCpf(cpf) : null)
    } finally {
      setConcluindo(false)
    }
  }

  function tecla(e: React.KeyboardEvent) {
    const f = FORMAS.find(x => x.atalho === e.key)
    if (f) {
      e.preventDefault()
      return adicionar(f.valor)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      return aoVoltar()
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (valor.trim() || conf.falta > 0) adicionar(forma)
      else concluir()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pagamento" onKeyDown={tecla}>
      <div className="w-full max-w-lg space-y-4 rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Pagamento</h2>
          <button className="btn btn-fantasma p-2" onClick={aoVoltar} aria-label="Voltar à venda">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Resumo rotulo="Total" valor={formatarReais(total)} />
          <Resumo rotulo="Pago" valor={formatarReais(conf.pago)} />
          {conf.troco > 0 ? <Resumo rotulo="Troco" valor={formatarReais(conf.troco)} destaque /> : <Resumo rotulo="Falta" valor={formatarReais(conf.falta)} destaque />}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {FORMAS.map(f => (
            <button
              key={f.valor}
              type="button"
              onClick={() => adicionar(f.valor)}
              className={cx('flex flex-col items-center rounded-xl border px-1 py-2 text-xs font-semibold', forma === f.valor ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700')}
            >
              {f.nome}
              <span className="text-[10px] font-normal text-slate-400">{f.atalho}</span>
            </button>
          ))}
        </div>
        <div>
          <label className="rotulo" htmlFor="valor-pago">Valor recebido (deixe vazio para o valor que falta)</label>
          <input id="valor-pago" ref={campo} className="campo text-lg" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder={formatarReais(conf.falta)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="cpf-nota">CPF na nota (opcional)</label>
          <input id="cpf-nota" className="campo" inputMode="numeric" value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" />
          {cpfInvalido && <p className="mt-1 text-xs text-red-600">CPF inválido.</p>}
        </div>
        {pagos.length > 0 && (
          <ul className="space-y-1 text-sm">
            {pagos.map(p => (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                <span>{FORMAS.find(f => f.valor === p.forma)?.nome}</span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  {formatarReais(p.valor)}
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setPagos(l => l.filter(x => x.id !== p.id))} aria-label="Remover pagamento">
                    <X className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {conf.erro && pagos.length > 0 && conf.falta === 0 && <Aviso tom="erro">{conf.erro}</Aviso>}
        <button className="btn btn-primario btn-grande w-full" disabled={!!conf.erro || concluindo || cpfInvalido} onClick={concluir}>
          <Check className="size-5" /> Concluir venda (Enter)
        </button>
      </div>
    </div>
  )
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cx('rounded-xl p-2', destaque ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-800')}>
      <p className="text-xs font-medium opacity-75">{rotulo}</p>
      <p className="text-lg font-bold tabular-nums" data-resumo={rotulo}>{valor}</p>
    </div>
  )
}
