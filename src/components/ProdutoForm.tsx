import { Plus, ScanBarcode, X } from 'lucide-react'
import { useState } from 'react'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo } from '../lib/dados'
import { UNIDADES, canonizarCodigo, exibirCodigo, lerNumero } from '../lib/formato'
import type { CodigoProduto, Produto, ProdutoDados } from '../lib/tipos'
import { NavegacaoEtapas, Passos } from './Etapas'
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

/**
 * Cadastro em etapas, no mesmo padrão do recebimento de OS: o operador percorre
 * Dados → Preços → Estoque → Fiscal e fecha o ciclo no botão Salvar. Assim o
 * cadastro não termina sem passar pelas informações de estoque e fiscal.
 */
type EtapaProduto = 'dados' | 'precos' | 'estoque' | 'fiscal'

const ETAPAS_PRODUTO: { id: EtapaProduto; rotulo: string }[] = [
  { id: 'dados', rotulo: 'Dados' },
  { id: 'precos', rotulo: 'Preços' },
  { id: 'estoque', rotulo: 'Estoque' },
  { id: 'fiscal', rotulo: 'Fiscal' },
]

/** Primeiro campo de cada etapa, para o foco acompanhar a navegação. */
const PRIMEIRO_CAMPO: Record<EtapaProduto, string> = {
  dados: 'p-nome',
  precos: 'p-preco',
  estoque: 'p-minimo',
  fiscal: 'p-ncm',
}

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
    custo_ultimo: produto?.custo_ultimo ?? null,
    rastreio: produto?.rastreio ?? (empresa.segmento === 'galpao' ? 'lote' : 'nenhum'),
    pesavel: produto?.pesavel ?? false,
    codigo_balanca: produto?.codigo_balanca ?? null,
    controla_estoque: produto?.controla_estoque ?? true,
    garantia_meses: produto?.garantia_meses ?? null,
    fabricante: produto?.fabricante ?? '',
    observacao: produto?.observacao ?? '',
    ativo: produto?.ativo ?? true,
    ncm: produto?.ncm ?? null,
    cfop: produto?.cfop ?? null,
    cst_csosn: produto?.cst_csosn ?? null,
    origem: produto?.origem ?? null,
    unidade_tributavel: produto?.unidade_tributavel ?? null,
    cest: produto?.cest ?? null,
    ibs_aliquota: produto?.ibs_aliquota ?? null,
    cbs_aliquota: produto?.cbs_aliquota ?? null,
  }))
  const [codigos, setCodigos] = useState<CodigoProduto[]>(produto?.codigos ?? [])
  const [novoCodigo, setNovoCodigo] = useState(codigoInicial ?? '')
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null)
  const [embalagemTxt, setEmbalagemTxt] = useState(texto(produto?.conteudo_embalagem))
  const [precoTxt, setPrecoTxt] = useState(texto(produto?.preco_venda))
  const [custoTxt, setCustoTxt] = useState(texto(produto?.custo_ultimo))
  const [minimoTxt, setMinimoTxt] = useState(texto(produto?.estoque_minimo))
  const [garantiaTxt, setGarantiaTxt] = useState(texto(produto?.garantia_meses))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)
  const [etapa, setEtapa] = useState<EtapaProduto>('dados')

  const muda = <K extends keyof ProdutoDados>(campo: K, valor: ProdutoDados[K]) => setDados(d => ({ ...d, [campo]: valor }))

  function irPara(destino: EtapaProduto) {
    setEtapa(destino)
    requestAnimationFrame(() => document.getElementById(PRIMEIRO_CAMPO[destino])?.focus())
  }

  /** Erro de validação: mostra a mensagem, abre a etapa do campo e leva o foco até ele. */
  function invalido(mensagem: string, destino: EtapaProduto, campo?: string) {
    setErro(mensagem)
    if (destino !== etapa) setEtapa(destino)
    if (campo) requestAnimationFrame(() => document.getElementById(campo)?.focus())
  }

  /** Valida só a etapa atual; devolve o primeiro erro encontrado. */
  function erroDaEtapa(atual: EtapaProduto): { mensagem: string; campo: string } | null {
    if (atual === 'dados') {
      if (!dados.nome.trim()) return { mensagem: 'Informe o nome do produto.', campo: 'p-nome' }
      return null
    }
    if (atual === 'precos') {
      const emb = embalagemTxt.trim() ? lerNumero(embalagemTxt) : null
      if (embalagemTxt.trim() && (emb === null || emb <= 0)) return { mensagem: 'Conteúdo por embalagem inválido.', campo: 'p-emb' }
      const preco = precoTxt.trim() ? lerNumero(precoTxt.replace(/^R\$\s*/i, '')) : null
      if (precoTxt.trim() && (preco === null || preco < 0)) return { mensagem: 'Preço de venda inválido.', campo: 'p-preco' }
      const custo = custoTxt.trim() ? lerNumero(custoTxt.replace(/^R\$\s*/i, '')) : null
      if (custoTxt.trim() && (custo === null || custo < 0)) return { mensagem: 'Custo inválido.', campo: 'p-custo' }
      return null
    }
    if (atual === 'estoque') {
      const minimo = minimoTxt.trim() ? lerNumero(minimoTxt) : null
      if (minimoTxt.trim() && (minimo === null || minimo < 0)) return { mensagem: 'Estoque mínimo inválido.', campo: 'p-minimo' }
      const garantia = garantiaTxt.trim() ? lerNumero(garantiaTxt) : null
      if (garantiaTxt.trim() && (garantia === null || garantia < 0 || !Number.isInteger(garantia))) {
        return { mensagem: 'Garantia inválida.', campo: 'p-garantia' }
      }
      return null
    }
    return null // fiscal é opcional
  }

  function avancar() {
    setErro('')
    const problema = erroDaEtapa(etapa)
    if (problema) return invalido(problema.mensagem, etapa, problema.campo)
    const proxima = ETAPAS_PRODUTO[ETAPAS_PRODUTO.findIndex(e => e.id === etapa) + 1]
    if (proxima) irPara(proxima.id)
  }

  function voltar() {
    const anterior = ETAPAS_PRODUTO[ETAPAS_PRODUTO.findIndex(e => e.id === etapa) - 1]
    if (anterior) irPara(anterior.id)
  }

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

  async function salvar() {
    setErro('')
    // Revalida todas as etapas: Enter/Salvar não podem pular uma etapa inválida.
    for (const passo of ETAPAS_PRODUTO) {
      const problema = erroDaEtapa(passo.id)
      if (problema) return invalido(problema.mensagem, passo.id, problema.campo)
    }
    const emb = embalagemTxt.trim() ? lerNumero(embalagemTxt) : null
    const preco = precoTxt.trim() ? lerNumero(precoTxt.replace(/^R\$\s*/i, '')) : null
    const custo = custoTxt.trim() ? lerNumero(custoTxt.replace(/^R\$\s*/i, '')) : null
    const minimo = minimoTxt.trim() ? lerNumero(minimoTxt) : null
    const garantia = garantiaTxt.trim() ? lerNumero(garantiaTxt) : null
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
          custo_ultimo: custo,
          // 0 também é "desligado": o banco guarda null.
          estoque_minimo: minimo !== null && minimo > 0 ? minimo : null,
          garantia_meses: garantia,
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

  /** A última etapa salva; as anteriores validam e avançam (Enter também avança). */
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (etapa === 'fiscal') return void salvar()
    avancar()
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      subcabecalho={<Passos passos={ETAPAS_PRODUTO} atual={etapa} aoVoltar={irPara} />}
      rodape={
        <NavegacaoEtapas
          primeira={etapa === 'dados'}
          ultima={etapa === 'fiscal'}
          salvando={salvando}
          rotuloFinal="Salvar"
          aoCancelar={aoFechar}
          aoVoltar={voltar}
          formId="form-produto"
        />
      }
    >
      <form id="form-produto" onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {etapa === 'dados' && (
          <div className="space-y-4">
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
                <label className="rotulo" htmlFor="p-codigo">Código interno</label>
                <input id="p-codigo" className="campo uppercase" value={dados.codigo_interno} onChange={e => muda('codigo_interno', e.target.value)} placeholder="Automático" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-fab">Fabricante</label>
                <input id="p-fab" className="campo" value={dados.fabricante ?? ''} onChange={e => muda('fabricante', e.target.value)} />
              </div>
            </div>

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

            <div>
              <label className="rotulo" htmlFor="p-obs">Observações</label>
              <textarea id="p-obs" className="campo min-h-20" value={dados.observacao ?? ''} onChange={e => muda('observacao', e.target.value)} placeholder="Classe toxicológica, local de armazenagem..." />
            </div>

            {produto && (
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <input type="checkbox" className="size-4.5 accent-ponto" checked={dados.ativo} onChange={e => muda('ativo', e.target.checked)} />
                Produto ativo (desmarque para ocultar das listas sem apagar o histórico)
              </label>
            )}
          </div>
        )}

        {etapa === 'precos' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="rotulo" htmlFor="p-preco">Preço de venda (R$)</label>
                <input id="p-preco" className="campo" inputMode="decimal" value={precoTxt} onChange={e => setPrecoTxt(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-custo">Custo (R$)</label>
                <input id="p-custo" className="campo" inputMode="decimal" value={custoTxt} onChange={e => setCustoTxt(e.target.value)} placeholder="Opcional" aria-describedby="p-custo-dica" />
              </div>
            </div>
            <p id="p-custo-dica" className="-mt-2 text-xs text-slate-500">Atualizado sozinho quando você lança uma entrada com custo.</p>
            <div>
              <label className="rotulo" htmlFor="p-emb">Conteúdo por embalagem ({dados.unidade})</label>
              <input id="p-emb" className="campo" inputMode="decimal" value={embalagemTxt} onChange={e => setEmbalagemTxt(e.target.value)} placeholder={`Ex.: galão de 20 ${dados.unidade} → 20`} />
            </div>
            <p className="-mt-2 text-xs text-slate-500">Conteúdo por embalagem é opcional: permite lançar por embalagem (ex.: 3 galões = 60 L).</p>
          </div>
        )}

        {etapa === 'estoque' && (
          <div className="space-y-4">
            <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
              <input type="checkbox" className="mt-0.5 size-4.5 accent-ponto" checked={dados.controla_estoque} onChange={e => muda('controla_estoque', e.target.checked)} />
              <span>
                Controlar estoque
                <span className="block text-xs font-normal text-slate-500">Desmarque para serviços e itens avulsos (não aparecem no estoque).</span>
              </span>
            </label>

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

            <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 size-4.5 accent-ponto"
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
                className="mt-0.5 size-4.5 accent-ponto"
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

            <div>
              <label className="rotulo" htmlFor="p-garantia">Garantia (meses)</label>
              <input
                id="p-garantia"
                className="campo"
                inputMode="numeric"
                value={garantiaTxt}
                onChange={e => setGarantiaTxt(e.target.value)}
                placeholder="Opcional"
                aria-describedby="p-garantia-dica"
              />
              <p id="p-garantia-dica" className="mt-1 text-xs text-slate-500">Usada para sugerir a garantia nas ordens de serviço.</p>
            </div>
          </div>
        )}

        {etapa === 'fiscal' && (
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
              <div>
                <label className="rotulo" htmlFor="p-ibs">IBS (%)</label>
                <input id="p-ibs" className="campo" inputMode="decimal" value={dados.ibs_aliquota ?? ''} onChange={e => muda('ibs_aliquota', e.target.value === '' ? null : Number(e.target.value.replace(',', '.')))} placeholder="Reforma — opcional" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-cbs">CBS (%)</label>
                <input id="p-cbs" className="campo" inputMode="decimal" value={dados.cbs_aliquota ?? ''} onChange={e => muda('cbs_aliquota', e.target.value === '' ? null : Number(e.target.value.replace(',', '.')))} placeholder="Reforma — opcional" />
              </div>
            </div>
            <p className="text-xs text-slate-500">Necessários para emitir a NFC-e na venda. Preencha com a orientação do contador. Se ainda não tiver os dados, é só concluir: o fiscal é opcional.</p>
          </div>
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
