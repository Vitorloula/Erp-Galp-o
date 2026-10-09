import { Plus, ScanBarcode, X } from 'lucide-react'
import { useState } from 'react'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo } from '../lib/dados'
import { UNIDADES, canonizarCodigo, exibirCodigo, lerNumero } from '../lib/formato'
import type { CodigoProduto, Produto, ProdutoDados } from '../lib/tipos'
import { LeitorCodigo } from './LeitorCodigo'
import { useToast } from './Toast'
import { Aviso, Modal } from './ui'

interface Props {
  aberto: boolean
  aoFechar: () => void
  produto?: Produto | null
  /** Preenche o código de barras (ex.: código escaneado que ainda não existe). */
  codigoInicial?: string
  aoSalvar?: (p: Produto) => void
}

export function ProdutoForm(props: Props) {
  if (!props.aberto) return null
  return <Formulario {...props} />
}

const NOVA_CATEGORIA = '__nova__'
const texto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

function Formulario({ aoFechar, produto, codigoInicial, aoSalvar }: Props) {
  const { empresa } = useAtiva()
  const { categorias, recarregar } = useDados()
  const toast = useToast()
  const [dados, setDados] = useState<ProdutoDados>(() => ({
    codigo_interno: produto?.codigo_interno ?? '',
    nome: produto?.nome ?? '',
    categoria_id: produto?.categoria_id ?? null,
    unidade: produto?.unidade ?? (empresa.segmento === 'galpao' ? 'L' : 'un'),
    conteudo_embalagem: produto?.conteudo_embalagem ?? null,
    preco_venda: produto?.preco_venda ?? null,
    rastreio: produto?.rastreio ?? (empresa.segmento === 'galpao' ? 'lote' : 'nenhum'),
    fabricante: produto?.fabricante ?? '',
    observacao: produto?.observacao ?? '',
    ativo: produto?.ativo ?? true,
  }))
  const [codigos, setCodigos] = useState<CodigoProduto[]>(produto?.codigos ?? [])
  const [novoCodigo, setNovoCodigo] = useState(codigoInicial ?? '')
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null)
  const [embalagemTxt, setEmbalagemTxt] = useState(texto(produto?.conteudo_embalagem))
  const [precoTxt, setPrecoTxt] = useState(texto(produto?.preco_venda))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)

  const muda = <K extends keyof ProdutoDados>(campo: K, valor: ProdutoDados[K]) => setDados(d => ({ ...d, [campo]: valor }))

  function adicionarCodigo(bruto = novoCodigo): CodigoProduto[] {
    const limpo = bruto.trim()
    if (!limpo) return codigos
    const canonico = canonizarCodigo(limpo)
    if (codigos.some(c => c.codigo === canonico)) {
      setNovoCodigo('')
      return codigos
    }
    const lista = [...codigos, { codigo: canonico, fator: 1 }]
    setCodigos(lista)
    setNovoCodigo('')
    return lista
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!dados.nome.trim()) return setErro('Informe o nome do produto.')
    const emb = embalagemTxt.trim() ? lerNumero(embalagemTxt) : null
    if (embalagemTxt.trim() && (emb === null || emb <= 0)) return setErro('Conteúdo por embalagem inválido.')
    const preco = precoTxt.trim() ? lerNumero(precoTxt.replace(/^R\$\s*/i, '')) : null
    if (precoTxt.trim() && (preco === null || preco < 0)) return setErro('Preço de venda inválido.')
    const listaCodigos = adicionarCodigo() // código digitado e não adicionado também vale
    setSalvando(true)
    try {
      let categoriaId = dados.categoria_id
      if (novaCategoria !== null) {
        if (!novaCategoria.trim()) throw new Error('Informe o nome da nova categoria.')
        categoriaId = (await catalogo.criarCategoria(empresa.empresa_id, novaCategoria)).id
      }
      const id = await catalogo.salvarProduto(
        empresa.empresa_id,
        { ...dados, categoria_id: categoriaId, conteudo_embalagem: emb, preco_venda: preco },
        listaCodigos,
        produto?.id,
      )
      const salvo = (await recarregar('catalogo'))?.find(p => p.id === id)
      toast.sucesso(produto ? 'Produto atualizado.' : `Produto cadastrado${salvo ? ` (${salvo.codigo_interno})` : ''}.`)
      aoSalvar?.(salvo ?? ({ ...produto, ...dados, id, codigos: listaCodigos } as Produto))
      aoFechar()
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      rodape={
        <>
          <button type="button" className="btn btn-secundario flex-1" onClick={aoFechar}>
            Cancelar
          </button>
          <button form="form-produto" className="btn btn-primario flex-1" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-produto" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div>
          <label className="rotulo" htmlFor="p-nome">Nome do produto *</label>
          <input id="p-nome" className="campo" value={dados.nome} onChange={e => muda('nome', e.target.value)} placeholder="Ex.: Glifosato 480 SL" autoFocus={!codigoInicial} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo" htmlFor="p-unidade">Unidade *</label>
            <select id="p-unidade" className="campo" value={dados.unidade} onChange={e => muda('unidade', e.target.value as ProdutoDados['unidade'])}>
              {UNIDADES.map(u => (
                <option key={u.valor} value={u.valor}>{u.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="p-categoria">Categoria</label>
            {novaCategoria === null ? (
              <select
                id="p-categoria"
                className="campo"
                value={dados.categoria_id ?? ''}
                onChange={e => (e.target.value === NOVA_CATEGORIA ? setNovaCategoria('') : muda('categoria_id', e.target.value || null))}
              >
                <option value="">Sem categoria</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value={NOVA_CATEGORIA}>+ Nova categoria...</option>
              </select>
            ) : (
              <div className="flex gap-1">
                <input id="p-categoria" className="campo" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nome da categoria" autoFocus />
                <button type="button" className="btn btn-fantasma shrink-0 px-2" onClick={() => setNovaCategoria(null)} aria-label="Cancelar nova categoria">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo" htmlFor="p-preco">Preço de venda (R$)</label>
            <input id="p-preco" className="campo" inputMode="decimal" value={precoTxt} onChange={e => setPrecoTxt(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="rotulo" htmlFor="p-emb">Conteúdo por embalagem ({dados.unidade})</label>
            <input id="p-emb" className="campo" inputMode="decimal" value={embalagemTxt} onChange={e => setEmbalagemTxt(e.target.value)} placeholder={`Ex.: galão de 20 ${dados.unidade} → 20`} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Conteúdo por embalagem é opcional: permite lançar por embalagem (ex.: 3 galões = 60 L).</p>

        <fieldset>
          <legend className="rotulo">Códigos de barras</legend>
          {codigos.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {codigos.map(c => (
                <li key={c.codigo} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5" data-codigo={exibirCodigo(c.codigo)}>
                  <span className="flex-1 font-mono text-sm text-slate-800">{exibirCodigo(c.codigo)}</span>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    cada leitura =
                    <input
                      className="campo w-16 px-2 py-1 text-xs"
                      inputMode="decimal"
                      aria-label={`Quantidade por leitura do código ${exibirCodigo(c.codigo)}`}
                      value={texto(c.fator)}
                      onChange={e => {
                        const f = lerNumero(e.target.value)
                        setCodigos(lista => lista.map(x => (x.codigo === c.codigo ? { ...x, fator: f && f > 0 ? f : 1 } : x)))
                      }}
                    />
                    {dados.unidade}
                  </label>
                  <button type="button" className="btn btn-fantasma p-1" onClick={() => setCodigos(lista => lista.filter(x => x.codigo !== c.codigo))} aria-label={`Remover código ${exibirCodigo(c.codigo)}`}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              id="p-barras"
              className="campo"
              inputMode="numeric"
              aria-label="Código de barras"
              value={novoCodigo}
              onChange={e => setNovoCodigo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  adicionarCodigo()
                }
              }}
              placeholder={codigos.length ? 'Outro código (ex.: da caixa)' : 'Escaneie ou digite (opcional)'}
            />
            <button type="button" className="btn btn-secundario shrink-0 px-3" onClick={() => adicionarCodigo()} title="Adicionar código" disabled={!novoCodigo.trim()}>
              <Plus className="size-5" />
            </button>
            <button type="button" className="btn btn-secundario shrink-0 px-3" onClick={() => setLendo(true)} title="Escanear com a câmera">
              <ScanBarcode className="size-5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Um produto pode ter vários códigos (unidade, caixa fechada, fornecedor diferente).</p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo" htmlFor="p-codigo">Código interno</label>
            <input id="p-codigo" className="campo uppercase" value={dados.codigo_interno} onChange={e => muda('codigo_interno', e.target.value)} placeholder="Automático" />
          </div>
          <div>
            <label className="rotulo" htmlFor="p-fab">Fabricante</label>
            <input id="p-fab" className="campo" value={dados.fabricante ?? ''} onChange={e => muda('fabricante', e.target.value)} />
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 size-4.5 accent-emerald-700"
            checked={dados.rastreio === 'lote'}
            onChange={e => muda('rastreio', e.target.checked ? 'lote' : 'nenhum')}
          />
          <span>
            Controlar lote e validade
            <span className="block text-xs font-normal text-slate-500">Alertas de vencimento e saída pelo lote que vence primeiro.</span>
          </span>
        </label>
        <div>
          <label className="rotulo" htmlFor="p-obs">Observações</label>
          <textarea id="p-obs" className="campo min-h-20" value={dados.observacao ?? ''} onChange={e => muda('observacao', e.target.value)} placeholder="Classe toxicológica, local de armazenagem..." />
        </div>
        {produto && (
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4.5 accent-emerald-700" checked={dados.ativo} onChange={e => muda('ativo', e.target.checked)} />
            Produto ativo (desmarque para ocultar das listas sem apagar o histórico)
          </label>
        )}
      </form>
      <LeitorCodigo
        aberto={lendo}
        aoFechar={() => setLendo(false)}
        titulo="Escanear código do produto"
        aoLer={c => {
          adicionarCodigo(c.codigo)
          setLendo(false)
        }}
      />
    </Modal>
  )
}
