import { ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { useDados } from '../contexto/Dados'
import { repositorio } from '../lib/dados'
import { CATEGORIAS, UNIDADES, lerNumero } from '../lib/formato'
import type { Produto, ProdutoDados } from '../lib/tipos'
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

function Formulario({ aoFechar, produto, codigoInicial, aoSalvar }: Props) {
  const { recarregar } = useDados()
  const toast = useToast()
  const [dados, setDados] = useState<ProdutoDados>(() => ({
    codigo_interno: produto?.codigo_interno ?? '',
    codigo_barras: produto?.codigo_barras ?? codigoInicial ?? '',
    nome: produto?.nome ?? '',
    categoria: produto?.categoria ?? 'defensivo',
    unidade: produto?.unidade ?? 'L',
    conteudo_embalagem: produto?.conteudo_embalagem ?? null,
    fabricante: produto?.fabricante ?? '',
    observacao: produto?.observacao ?? '',
    ativo: produto?.ativo ?? true,
  }))
  const [embalagemTxt, setEmbalagemTxt] = useState(produto?.conteudo_embalagem ? String(produto.conteudo_embalagem).replace('.', ',') : '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)

  const muda = <K extends keyof ProdutoDados>(campo: K, valor: ProdutoDados[K]) => setDados(d => ({ ...d, [campo]: valor }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!dados.nome.trim()) return setErro('Informe o nome do produto.')
    const emb = embalagemTxt.trim() ? lerNumero(embalagemTxt) : null
    if (embalagemTxt.trim() && (emb === null || emb <= 0)) return setErro('Conteúdo por embalagem inválido.')
    setSalvando(true)
    try {
      const salvo = await repositorio.salvarProduto({ ...dados, conteudo_embalagem: emb }, produto?.id)
      await recarregar()
      toast.sucesso(produto ? 'Produto atualizado.' : `Produto cadastrado (${salvo.codigo_interno}).`)
      aoSalvar?.(salvo)
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
            <select id="p-categoria" className="campo" value={dados.categoria} onChange={e => muda('categoria', e.target.value as ProdutoDados['categoria'])}>
              {CATEGORIAS.map(c => (
                <option key={c.valor} value={c.valor}>{c.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="rotulo" htmlFor="p-emb">Conteúdo por embalagem ({dados.unidade})</label>
          <input id="p-emb" className="campo" inputMode="decimal" value={embalagemTxt} onChange={e => setEmbalagemTxt(e.target.value)} placeholder={`Ex.: galão de 20 ${dados.unidade} → 20`} />
          <p className="mt-1 text-xs text-slate-500">Opcional. Permite lançar por embalagem (ex.: 3 galões = 60 L).</p>
        </div>
        <div>
          <label className="rotulo" htmlFor="p-barras">Código de barras</label>
          <div className="flex gap-2">
            <input id="p-barras" className="campo" inputMode="numeric" value={dados.codigo_barras ?? ''} onChange={e => muda('codigo_barras', e.target.value)} placeholder="Escaneie ou digite (opcional)" />
            <button type="button" className="btn btn-secundario shrink-0 px-3" onClick={() => setLendo(true)} title="Escanear com a câmera">
              <ScanBarcode className="size-5" />
            </button>
          </div>
        </div>
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
          muda('codigo_barras', c.codigo)
          setLendo(false)
        }}
      />
    </Modal>
  )
}
