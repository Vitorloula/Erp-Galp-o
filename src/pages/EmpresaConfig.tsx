import { Building2, CreditCard, Pencil, Plus, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Modal, cx } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { empresas } from '../lib/dados'
import { formatarData } from '../lib/formato'
import { NOME_PAPEL } from '../lib/permissoes'
import type { DadosEmpresa, Loja, Vinculo } from '../lib/tipos'
import { SEGMENTOS } from './BoasVindas'

const ESTADO: Record<Vinculo['estado'], { texto: string; classe: string }> = {
  ativa: { texto: 'Em dia', classe: 'bg-emerald-50 text-emerald-800' },
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

  const limite = empresa.status === 'trial' ? empresa.trial_ate : empresa.pago_ate
  const segmento = SEGMENTOS.find(s => s.valor === empresa.segmento)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Cabecalho titulo="Empresa" subtitulo={`${segmento?.nome ?? ''} · seu acesso: ${NOME_PAPEL[empresa.papel]}`} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <section className="cartao p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><CreditCard className="size-5 text-emerald-700" /> Assinatura</h2>
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

      <section className="cartao p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Building2 className="size-5 text-emerald-700" /> Dados da empresa</h2>
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Store className="size-5 text-emerald-700" /> Lojas e galpões</h2>
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
                <span className="flex-1 text-sm font-medium text-slate-800">
                  {l.nome} {!l.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">inativa</span>}
                </span>
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

function EditarLoja({ loja, aoFechar, aoSalvar }: { loja: Partial<Loja> | null; aoFechar: () => void; aoSalvar: () => Promise<void> }) {
  const { empresa } = useAtiva()
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setNome(loja?.nome ?? '')
    setAtivo(loja?.ativo ?? true)
    setErro('')
  }, [loja])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await empresas.salvarLoja(empresa.empresa_id, { nome, ativo }, loja?.id)
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
        {loja?.id && (
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4.5 accent-emerald-700" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            Loja ativa (desmarque para esconder sem apagar o histórico)
          </label>
        )}
      </form>
    </Modal>
  )
}
