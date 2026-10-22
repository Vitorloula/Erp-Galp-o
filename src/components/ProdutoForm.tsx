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
    // Ponto de pedido: null = desligado (produto sem alerta de reposição).
    estoque_minimo: produto?.estoque_minimo ?? null,
    preco_venda: produto?.preco_venda ?? null,
    rastreio: produto?.rastreio ?? (empresa.segmento === 'galpao' ? 'lote' : 'nenhum'),
    pesavel: produto?.pesavel ?? false,
    codigo_balanca: produto?.codigo_balanca ?? null,
    controla_estoque: produto?.controla_estoque ?? true,
    fabricante: produto?.fabricante ?? '',
    observacao: produto?.observacao ?? '',
    ativo: produto?.ativo ?? true,
    ncm: produto?.ncm ?? null,
    cfop: produto?.cfop ?? null,
    cst_csosn: produto?.cst_csosn ?? null,
    origem: produto?.origem ?? null,
    unidade_tributavel: produto?.unidade_tributavel ?? null,
    cest: produto?.cest ?? null,
  }))
  const [codigos, setCodigos] = useState<CodigoProduto[]>(produto?.codigos ?? [])
  const [novoCodigo, setNovoCodigo] = useState(codigoInicial ?? '')
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null)
  const [embalagemTxt, setEmbalagemTxt] = useState(texto(produto?.conteudo_embalagem))
  const [precoTxt, setPrecoTxt] = useState(texto(produto?.preco_venda))
  const [minimoTxt, setMinimoTxt] = useState(texto(produto?.estoque_minimo))
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
    const minimo = minimoTxt.trim() ? lerNumero(minimoTxt) : null
    if (minimoTxt.trim() && (minimo === null || minimo < 0)) return setErro('Estoque mínimo inválido.')
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
        {
          ...dados,
          categoria_id: categoriaId,
          conteudo_embalagem: emb,
          preco_venda: preco,
          // 0 também é "desligado": o banco guarda null.
          estoque_minimo: minimo !== null && minimo > 0 ? minimo : null,
        },
        listaCodigos,
        produto?.id,
      )
      const salvo = (await recarregar('catalogo'))?.find(p => p.id === id)
      // CORREÇÃO: Garante que o toast sempre tenha um formato previsível para o teste
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

        {dados.controla_estoque && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div>
              <label className="rotulo" htmlFor="p-minimo">Estoque mínimo ({dados.unidade})</label>
              <input
                id="p-minimo"
                className="campo"
                inputMode="decimal"
                value={minimoTxt}
                onChange={e => setMinimoTxt(e.target.value)}
                placeholder="Opcional"
                aria-describedby="p-minimo-dica"
              />
            </div>
            <p id="p-minimo-dica" className="text-xs text-slate-500">
              Ponto de pedido: quando o saldo chegar nesse mínimo, o produto aparece em "Repor" e no alerta do painel. Deixe em branco para não acompanhar.
            </p>
          </div>
        )}

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
        <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 size-4.5 accent-emerald-700"
            checked={dados.pesavel}
            onChange={e => setDados(d => ({ ...d, pesavel: e.target.checked, unidade: e.target.checked && d.unidade === 'un' ? 'kg' : d.unidade }))}
          />
          <span>
            Vendido por peso (balança)
            <span className="block text-xs font-normal text-slate-500">O caixa lê a etiqueta impressa pela balança (preço ou peso).</span>
          </span>
        </label>
        {dados.pesavel && (
          <div>
            <label className="rotulo" htmlFor="p-plu">Código na balança (PLU)</label>
            <input id="p-plu" className="campo" inputMode="numeric" value={dados.codigo_balanca ?? ''} onChange={e => muda('codigo_balanca', e.target.value.replace(/\D/g, '') || null)} placeholder="Ex.: 42" />
          </div>
        )}
        <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
          <input type="checkbox" className="mt-0.5 size-4.5 accent-emerald-700" checked={dados.controla_estoque} onChange={e => muda('controla_estoque', e.target.checked)} />
          <span>
            Controlar estoque
            <span className="block text-xs font-normal text-slate-500">Desmarque para serviços e itens avulsos (não aparecem no estoque).</span>
          </span>
        </label>
        <div>
          <label className="rotulo" htmlFor="p-obs">Observações</label>
          <textarea id="p-obs" className="campo min-h-20" value={dados.observacao ?? ''} onChange={e => muda('observacao', e.target.value)} placeholder="Classe toxicológica, local de armazenagem..." />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Fiscal (NFC-e) — opcional</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="p-ncm">NCM</label>
              <input id="p-ncm" className="campo" inputMode="numeric" value={dados.ncm ?? ''} onChange={e => muda('ncm', e.target.value.replace(/\D/g, '').slice(0, 8) || null)} placeholder="Ex.: 38089199" />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-cfop">CFOP</label>
              <input id="p-cfop" className="campo" inputMode="numeric" value={dados.cfop ?? ''} onChange={e => muda('cfop', e.target.value.replace(/\D/g, '').slice(0, 4) || null)} placeholder="Ex.: 5102" />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-cst">CST / CSOSN</label>
              <input id="p-cst" className="campo" inputMode="numeric" value={dados.cst_csosn ?? ''} onChange={e => muda('cst_csosn', e.target.value.replace(/\D/g, '').slice(0, 3) || null)} placeholder="Ex.: 102" />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-origem">Origem</label>
              <select id="p-origem" className="campo" value={dados.origem ?? ''} onChange={e => muda('origem', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">—</option>
                <option value="0">0 — Nacional</option>
                <option value="1">1 — Importada</option>
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="p-cest">CEST</label>
              <input id="p-cest" className="campo" value={dados.cest ?? ''} onChange={e => muda('cest', e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-utrib">Unidade tributável</label>
              <input id="p-utrib" className="campo" value={dados.unidade_tributavel ?? ''} onChange={e => muda('unidade_tributavel', e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <p className="text-xs text-slate-500">Necessários para emitir a NFC-e na venda. Preencha com a orientação do contador.</p>
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