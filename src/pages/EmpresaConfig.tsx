import { Building2, CreditCard, Download, Monitor, Pencil, Plus, ShieldCheck, SlidersHorizontal, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Modal, cx } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { empresas, lgpd, vendas as dadosVendas } from '../lib/dados'
import type { Caixa } from '../lib/dados/vendas'
import { formatarData } from '../lib/formato'
import { NOME_PAPEL } from '../lib/permissoes'
import { baixarArquivo } from '../lib/relatorio'
import type { ConfigEmpresa, DadosEmpresa, Loja, Vinculo } from '../lib/tipos'
import { SEGMENTOS } from './BoasVindas'

const ESTADO: Record<Vinculo['estado'], { texto: string; classe: string }> = {
  ativa: { texto: 'Em dia', classe: 'bg-emerald-50 text-marca-escura' },
  atrasada: { texto: 'Em atraso (carência)', classe: 'bg-amber-100 text-amber-900' },
  somente_leitura: { texto: 'Vencida: somente consulta', classe: 'bg-red-100 text-red-800' },
  suspensa: { texto: 'Suspensa', classe: 'bg-red-100 text-red-800' },
  cancelada: { texto: 'Cancelada', classe: 'bg-slate-200 text-slate-700' },
}

export function EmpresaConfig() {
  const { empresa, pode, recarregar } = useAtiva()
  const toast = useToast()
  const [dados, setDados] = useState<DadosEmpresa | null>(null)
  const [todasLojas, setTodasLojas] = useState<Loja[] | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [baixandoDados, setBaixandoDados] = useState(false)
  const [lojaEditando, setLojaEditando] = useState<Partial<Loja> | null>(null)

  useEffect(() => {
    empresas.dadosEmpresa(empresa.empresa_id).then(setDados, e => setErro((e as Error).message))
    empresas.listarLojas(empresa.empresa_id).then(setTodasLojas, e => setErro((e as Error).message))
  }, [empresa.empresa_id])

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault()
    if (!dados) return
    setSalvando(true)
    try {
      await empresas.salvarEmpresa(empresa.empresa_id, dados)
      await recarregar()
      toast.sucesso('Dados da empresa salvos.')
    } catch (er) {
      toast.erro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function baixarDados() {
    setBaixandoDados(true)
    try {
      const arquivo = await lgpd.exportarDadosEmpresa(empresa.empresa_id)
      baixarArquivo(
        new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json;charset=utf-8' }),
        `dados-empresa-${new Date().toISOString().slice(0, 10)}.json`,
      )
      toast.sucesso('Exportação de dados gerada.')
    } catch (er) {
      toast.erro((er as Error).message)
    } finally {
      setBaixandoDados(false)
    }
  }

  const limite = empresa.status === 'trial' ? empresa.trial_ate : empresa.pago_ate
  const segmento = SEGMENTOS.find(s => s.valor === empresa.segmento)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Cabecalho titulo="Empresa" subtitulo={`${segmento?.nome ?? ''} · seu acesso: ${NOME_PAPEL[empresa.papel]}`} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <section className="cartao p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><CreditCard className="size-5 text-marca" /> Assinatura</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-900">{empresa.plano_nome ?? '—'}</span>
          <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', ESTADO[empresa.estado].classe)}>{ESTADO[empresa.estado].texto}</span>
          {empresa.status === 'cortesia' ? (
            <span className="text-slate-500">Conta cortesia, sem mensalidade.</span>
          ) : (
            limite && (
              <span className="text-slate-500">
                {empresa.status === 'trial' ? 'Teste grátis até' : 'Pago até'} <strong className="text-slate-700">{formatarData(limite)}</strong>
              </span>
            )
          )}
        </div>
        {empresa.papel === 'dono' && empresa.status !== 'cortesia' && (
          <p className="mt-3 text-xs text-slate-500">Para assinar, mudar de plano ou pedir a segunda via, fale com o suporte. Seus dados nunca são apagados por atraso.</p>
        )}
      </section>

      {pode.gerenciarEmpresa && (
        <section className="cartao p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="size-5 text-marca" /> Privacidade e seus dados</h2>
          <p className="text-sm text-slate-600">
            Baixe uma cópia dos dados da empresa (catálogo, estoque, movimentações, vendas, equipe e configurações) em JSON.
            O arquivo contém dados pessoais: guarde com segurança.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secundario" onClick={baixarDados} disabled={baixandoDados}>
              {baixandoDados ? 'Gerando...' : <><Download className="size-4.5" /> Baixar dados (JSON)</>}
            </button>
            <a className="btn btn-fantasma text-sm" href="/privacidade.html" target="_blank" rel="noreferrer">Política de Privacidade</a>
            <a className="btn btn-fantasma text-sm" href="/termos.html" target="_blank" rel="noreferrer">Termos de Uso</a>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Para correção ou exclusão de dados pessoais, use o canal de suporte do piloto descrito na Política de Privacidade.
          </p>
        </section>
      )}

      <section className="cartao p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Building2 className="size-5 text-marca" /> Dados da empresa</h2>
        {!dados ? (
          <Carregando />
        ) : (
          <form onSubmit={salvarDados} className="space-y-3">
            <fieldset disabled={!pode.gerenciarEmpresa} className="space-y-3">
              <div>
                <label className="rotulo" htmlFor="e-nome">Nome *</label>
                <input id="e-nome" className="campo" value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="rotulo" htmlFor="e-razao">Razão social</label>
                  <input id="e-razao" className="campo" value={dados.razao_social ?? ''} onChange={e => setDados({ ...dados, razao_social: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo" htmlFor="e-doc">CNPJ ou CPF</label>
                  <input id="e-doc" className="campo" inputMode="numeric" value={dados.documento ?? ''} onChange={e => setDados({ ...dados, documento: e.target.value })} />
                </div>
              </div>
            </fieldset>
            {pode.gerenciarEmpresa ? (
              <button className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar dados'}</button>
            ) : (
              <p className="text-xs text-slate-500">Somente o dono altera os dados da empresa.</p>
            )}
          </form>
        )}
      </section>

      <section className="cartao p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><SlidersHorizontal className="size-5 text-marca" /> Regras de operação e balança</h2>
        {!dados ? (
          <Carregando />
        ) : (
          <RegrasOperacao
            config={dados.config ?? {}}
            podeEditar={pode.gerenciarEmpresa && pode.gravavel}
            aoSalvar={async novaConfig => {
              const atualizado = { ...dados, config: { ...dados.config, ...novaConfig } }
              await empresas.salvarEmpresa(empresa.empresa_id, atualizado)
              setDados(atualizado)
              await recarregar()
              toast.sucesso('Configurações de operação salvas.')
            }}
          />
        )}
      </section>

      <section className="cartao p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Store className="size-5 text-marca" /> Lojas</h2>
          {pode.gerenciarEmpresa && pode.gravavel && (
            <button className="btn btn-secundario px-3 py-1.5 text-sm" onClick={() => setLojaEditando({ nome: '', ativo: true })}>
              <Plus className="size-4" /> Nova loja
            </button>
          )}
        </div>
        {!todasLojas ? (
          <Carregando />
        ) : (
          <ul className="divide-y divide-slate-100">
            {todasLojas.map(l => (
              <li key={l.id} className={cx('flex items-center gap-3 py-2.5', !l.ativo && 'opacity-55')}>
                <Store className="size-4.5 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {l.nome} {!l.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">inativa</span>}
                  </p>
                  {(l.endereco || l.uf || l.cnpj) && (
                    <p className="truncate text-xs text-slate-500">
                      {[l.cnpj ? `CNPJ ${l.cnpj}` : null, l.endereco, l.uf].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {pode.gerenciarEmpresa && (
                  <button className="btn btn-fantasma p-1.5" onClick={() => setLojaEditando(l)} aria-label={`Editar ${l.nome}`}>
                    <Pencil className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Caixas lojas={todasLojas} />

      <EditarLoja
        loja={lojaEditando}
        aoFechar={() => setLojaEditando(null)}
        aoSalvar={async () => {
          setTodasLojas(await empresas.listarLojas(empresa.empresa_id))
          await recarregar()
        }}
      />
    </div>
  )
}

function RegrasOperacao({
  config,
  podeEditar,
  aoSalvar,
}: {
  config: ConfigEmpresa
  podeEditar: boolean
  aoSalvar: (c: ConfigEmpresa) => Promise<void>
}) {
  const toast = useToast()
  const [vendaSemEstoque, setVendaSemEstoque] = useState<'permitir' | 'avisar' | 'bloquear'>(config.venda_sem_estoque ?? 'avisar')
  const [diasAlerta, setDiasAlerta] = useState(String(config.dias_alerta ?? 30))
  const [usarBalanca, setUsarBalanca] = useState(!!config.balanca)
  const [prefixo, setPrefixo] = useState(config.balanca?.prefixo ?? '2')
  const [digitosCodigo, setDigitosCodigo] = useState<4 | 5 | 6>((config.balanca?.digitos_codigo as 4 | 5 | 6) ?? 4)
  const [tipoBalanca, setTipoBalanca] = useState<'preco' | 'peso'>(config.balanca?.tipo ?? 'preco')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setVendaSemEstoque(config.venda_sem_estoque ?? 'avisar')
    setDiasAlerta(String(config.dias_alerta ?? 30))
    setUsarBalanca(!!config.balanca)
    setPrefixo(config.balanca?.prefixo ?? '2')
    setDigitosCodigo((config.balanca?.digitos_codigo as 4 | 5 | 6) ?? 4)
    setTipoBalanca(config.balanca?.tipo ?? 'preco')
  }, [config])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const dias = Math.max(1, Math.min(365, Number(diasAlerta) || 30))
    setSalvando(true)
    try {
      const nova: ConfigEmpresa = {
        ...config,
        venda_sem_estoque: vendaSemEstoque,
        dias_alerta: dias,
      }
      if (usarBalanca) {
        nova.balanca = {
          prefixo: prefixo.replace(/\D/g, '').slice(0, 1) || '2',
          digitos_codigo: digitosCodigo,
          tipo: tipoBalanca,
        }
      } else {
        delete nova.balanca
      }
      await aoSalvar(nova)
    } catch (er) {
      toast.erro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <fieldset disabled={!podeEditar} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="cfg-sem-estoque">Venda sem saldo no caixa (PDV)</label>
            <select
              id="cfg-sem-estoque"
              className="campo"
              value={vendaSemEstoque}
              onChange={e => setVendaSemEstoque(e.target.value as 'permitir' | 'avisar' | 'bloquear')}
            >
              <option value="avisar">Avisar o operador e permitir vender</option>
              <option value="permitir">Permitir vender sem aviso</option>
              <option value="bloquear">Bloquear venda quando sem saldo</option>
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="cfg-dias-alerta">Alerta de vencimento (dias)</label>
            <input
              id="cfg-dias-alerta"
              type="number"
              min={1}
              max={365}
              className="campo"
              value={diasAlerta}
              onChange={e => setDiasAlerta(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
            <input type="checkbox" className="size-4.5 accent-ponto" checked={usarBalanca} onChange={e => setUsarBalanca(e.target.checked)} />
            Etiqueta de balança no caixa (EAN-13)
          </label>
          {usarBalanca && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="rotulo" htmlFor="cfg-bal-prefixo">Dígito inicial</label>
                <input
                  id="cfg-bal-prefixo"
                  className="campo"
                  inputMode="numeric"
                  maxLength={1}
                  value={prefixo}
                  onChange={e => setPrefixo(e.target.value)}
                />
              </div>
              <div>
                <label className="rotulo" htmlFor="cfg-bal-digitos">Dígitos do PLU</label>
                <select
                  id="cfg-bal-digitos"
                  className="campo"
                  value={digitosCodigo}
                  onChange={e => setDigitosCodigo(Number(e.target.value) as 4 | 5 | 6)}
                >
                  <option value={4}>4 dígitos (padrão Filizola/Toledo)</option>
                  <option value={5}>5 dígitos</option>
                  <option value={6}>6 dígitos</option>
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="cfg-bal-tipo">Valor na etiqueta</label>
                <select
                  id="cfg-bal-tipo"
                  className="campo"
                  value={tipoBalanca}
                  onChange={e => setTipoBalanca(e.target.value as 'preco' | 'peso')}
                >
                  <option value="preco">Preço total (R$)</option>
                  <option value="peso">Peso (kg)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </fieldset>
      {podeEditar && (
        <button className="btn btn-primario" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar regras'}
        </button>
      )}
    </form>
  )
}

function EditarLoja({ loja, aoFechar, aoSalvar }: { loja: Partial<Loja> | null; aoFechar: () => void; aoSalvar: () => Promise<void> }) {
  const { empresa } = useAtiva()
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ie, setIe] = useState('')
  const [endereco, setEndereco] = useState('')
  const [uf, setUf] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setNome(loja?.nome ?? '')
    setCnpj(loja?.cnpj ?? '')
    setIe(loja?.ie ?? '')
    setEndereco(loja?.endereco ?? '')
    setUf(loja?.uf ?? '')
    setAtivo(loja?.ativo ?? true)
    setErro('')
  }, [loja])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await empresas.salvarLoja(empresa.empresa_id, { nome, cnpj, ie, endereco, uf, ativo }, loja?.id)
      await aoSalvar()
      toast.sucesso(loja?.id ? 'Loja atualizada.' : `Loja ${nome.trim()} criada.`)
      aoFechar()
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={!!loja}
      aoFechar={aoFechar}
      titulo={loja?.id ? 'Editar loja' : 'Nova loja'}
      rodape={
        <>
          <button className="btn btn-secundario flex-1" onClick={aoFechar}>Cancelar</button>
          <button form="form-loja" className="btn btn-primario flex-1" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-loja" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div>
          <label className="rotulo" htmlFor="loja-nome">Nome da loja *</label>
          <input id="loja-nome" className="campo" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Filial Centro" autoFocus />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="loja-cnpj">CNPJ da loja</label>
            <input id="loja-cnpj" className="campo" inputMode="numeric" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="rotulo" htmlFor="loja-ie">Inscrição Estadual (IE)</label>
            <input id="loja-ie" className="campo" value={ie} onChange={e => setIe(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_5.5rem]">
          <div>
            <label className="rotulo" htmlFor="loja-endereco">Endereço</label>
            <input id="loja-endereco" className="campo" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade" />
          </div>
          <div>
            <label className="rotulo" htmlFor="loja-uf">UF</label>
            <input id="loja-uf" className="campo uppercase" maxLength={2} value={uf} onChange={e => setUf(e.target.value)} placeholder="SP" />
          </div>
        </div>
        {loja?.id && (
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4.5 accent-ponto" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            Loja ativa (desmarque para esconder sem apagar o histórico)
          </label>
        )}
      </form>
    </Modal>
  )
}

/** Caixas (PDV) de cada loja: o número do caixa vira a série da NFC-e na fase fiscal. */
function Caixas({ lojas }: { lojas: Loja[] | null }) {
  const { empresa, pode } = useAtiva()
  const toast = useToast()
  const [caixas, setCaixas] = useState<Caixa[] | null>(null)
  const [editando, setEditando] = useState<{ id?: string; loja_id: string; nome: string; ativo: boolean } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = () => dadosVendas.listarCaixas(empresa.empresa_id).then(setCaixas, e => setErro((e as Error).message))
  useEffect(() => {
    carregar()
  }, [empresa.empresa_id])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    try {
      await dadosVendas.salvarCaixa(empresa.empresa_id, editando.loja_id, { nome: editando.nome, ativo: editando.ativo }, editando.id)
      toast.sucesso(editando.id ? 'Caixa atualizado.' : `${editando.nome.trim()} criado.`)
      setEditando(null)
      carregar()
    } catch (er) {
      setErro((er as Error).message)
    }
  }

  const ativas = (lojas ?? []).filter(l => l.ativo)
  return (
    <section className="cartao p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Monitor className="size-5 text-marca" /> Caixas (PDV)</h2>
      {erro && !editando && <Aviso tom="erro">{erro}</Aviso>}
      {!caixas ? (
        <Carregando />
      ) : (
        <div className="space-y-3">
          {ativas.map(l => (
            <div key={l.id}>
              {ativas.length > 1 && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{l.nome}</p>}
              <ul className="divide-y divide-slate-100">
                {caixas.filter(c => c.loja_id === l.id).map(c => (
                  <li key={c.id} className={cx('flex items-center gap-3 py-2', !c.ativo && 'opacity-55')} data-caixa={c.nome}>
                    <Monitor className="size-4.5 text-slate-400" />
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {c.nome} <span className="text-xs font-normal text-slate-500">nº {String(c.numero).padStart(2, '0')}</span>
                      {!c.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">inativo</span>}
                    </span>
                    {pode.gerenciarCaixas && (
                      <button className="btn btn-fantasma p-1.5" onClick={() => setEditando({ id: c.id, loja_id: c.loja_id, nome: c.nome, ativo: c.ativo })} aria-label={`Editar ${c.nome}`}>
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {pode.gerenciarCaixas && (
                <button
                  className="btn btn-fantasma mt-1 px-2 py-1 text-sm text-marca-escura"
                  onClick={() => setEditando({ loja_id: l.id, nome: `Caixa ${String(caixas.filter(c => c.loja_id === l.id).length + 1).padStart(2, '0')}`, ativo: true })}
                >
                  <Plus className="size-4" /> Novo caixa{ativas.length > 1 ? ` em ${l.nome}` : ''}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal
        aberto={!!editando}
        aoFechar={() => setEditando(null)}
        titulo={editando?.id ? 'Editar caixa' : 'Novo caixa'}
        rodape={
          <button form="form-caixa" className="btn btn-primario flex-1">Salvar</button>
        }
      >
        <form id="form-caixa" onSubmit={salvar} className="space-y-3">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div>
            <label className="rotulo" htmlFor="caixa-nome">Nome do caixa *</label>
            <input id="caixa-nome" className="campo" value={editando?.nome ?? ''} onChange={e => setEditando(c => c && { ...c, nome: e.target.value })} autoFocus />
          </div>
          {editando?.id && (
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <input type="checkbox" className="size-4.5 accent-ponto" checked={editando.ativo} onChange={e => setEditando(c => c && { ...c, ativo: e.target.checked })} />
              Caixa ativo
            </label>
          )}
        </form>
      </Modal>
    </section>
  )
}
