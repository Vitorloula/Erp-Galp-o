import { Building2, Cpu, LoaderCircle, LogOut, MailOpen, ShoppingBasket, Sparkles, Warehouse, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { guardarConvite } from '../components/Convite'
import { TelaCheia } from '../components/TelaCheia'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useEmpresa } from '../contexto/Empresa'
import { empresas } from '../lib/dados'
import type { Segmento } from '../lib/tipos'

export const SEGMENTOS: { valor: Segmento; nome: string; texto: string; icone: LucideIcon }[] = [
  { valor: 'galpao', nome: 'Galpão / distribuidora', texto: 'Lote e validade, defensivos, fertilizantes', icone: Warehouse },
  { valor: 'mercadinho', nome: 'Mercadinho / conveniência', texto: 'Venda rápida, balança, bebidas e mercearia', icone: ShoppingBasket },
  { valor: 'eletronicos', nome: 'Loja de eletrônicos', texto: 'Celulares, acessórios, série e garantia', icone: Cpu },
  { valor: 'outro', nome: 'Outro tipo de negócio', texto: 'Comece com uma categoria geral', icone: Building2 },
]

/**
 * Primeiro acesso (conta sem empresa) ou "criar outra empresa" (dentroDoSistema):
 * cria a empresa escolhendo o segmento, entra por convite ou abre a empresa de exemplo.
 */
export function BoasVindas({ dentroDoSistema }: { dentroDoSistema?: boolean }) {
  const { usuario, sair } = useAuth()
  const { recarregar } = useEmpresa()
  const toast = useToast()
  const navegar = useNavigate()
  const [nome, setNome] = useState('')
  const [segmento, setSegmento] = useState<Segmento>('galpao')
  const [nomeLoja, setNomeLoja] = useState('')
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState<'criar' | 'exemplo' | null>(null)
  const [erro, setErro] = useState('')

  async function executar(tipo: 'criar' | 'exemplo', acao: () => Promise<string>, aviso: string) {
    setErro('')
    setOcupado(tipo)
    try {
      const id = await acao()
      await recarregar(id)
      toast.sucesso(aviso)
      navegar('/painel', { replace: true })
    } catch (e) {
      setErro((e as Error).message)
      setOcupado(null)
    }
  }

  function usarConvite(e: React.FormEvent) {
    e.preventDefault()
    const token = empresas.tokenDoConvite(link)
    if (!token) return setErro('Cole o link do convite completo (ou o código de 64 caracteres).')
    guardarConvite(token)
    window.location.assign('/') // abre a tela do convite
  }

  const conteudo = (
    <div className="space-y-6">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          executar('criar', () => empresas.criarEmpresa(nome, segmento, nomeLoja), `Empresa ${nome.trim()} criada. Bom trabalho!`)
        }}
      >
        <h2 className="font-semibold text-slate-900">Cadastrar minha empresa</h2>
        <div>
          <label className="rotulo" htmlFor="emp-nome">Nome da empresa *</label>
          <input id="emp-nome" className="campo" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Agro Santa Rita" required />
        </div>
        <fieldset>
          <legend className="rotulo">Tipo de negócio</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SEGMENTOS.map(s => (
              <label
                key={s.valor}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                  segmento === s.valor ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <input type="radio" name="segmento" className="sr-only" checked={segmento === s.valor} onChange={() => setSegmento(s.valor)} />
                <s.icone className="mt-0.5 size-5 shrink-0 text-marca" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{s.nome}</span>
                  <span className="block text-xs text-slate-500">{s.texto}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="rotulo" htmlFor="emp-loja">Nome da loja ou do galpão</label>
          <input id="emp-loja" className="campo" value={nomeLoja} onChange={e => setNomeLoja(e.target.value)} placeholder="Loja principal" />
          <p className="mt-1 text-xs text-slate-500">Outras lojas/filiais podem ser cadastradas depois.</p>
        </div>
        <button className="btn btn-primario btn-grande w-full" disabled={!!ocupado}>
          {ocupado === 'criar' && <LoaderCircle className="size-5 animate-spin" />} Criar empresa (14 dias grátis)
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> ou <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form className="space-y-2" onSubmit={usarConvite}>
        <label className="rotulo flex items-center gap-1.5" htmlFor="link-convite"><MailOpen className="size-4 text-marca" /> Recebi um convite</label>
        <div className="flex gap-2">
          <input id="link-convite" className="campo" value={link} onChange={e => setLink(e.target.value)} placeholder="Cole aqui o link do convite" />
          <button className="btn btn-secundario shrink-0">Abrir</button>
        </div>
      </form>

      <button
        type="button"
        className="btn btn-secundario w-full"
        disabled={!!ocupado}
        onClick={() => executar('exemplo', empresas.criarEmpresaExemplo, 'Empresa de exemplo criada. Explore à vontade!')}
      >
        {ocupado === 'exemplo' ? <LoaderCircle className="size-4.5 animate-spin" /> : <Sparkles className="size-4.5 text-amber-500" />}
        Conhecer com dados de exemplo
      </button>
    </div>
  )

  if (dentroDoSistema)
    return (
      <div className="mx-auto max-w-xl">
        <Cabecalho titulo="Nova empresa" subtitulo="Cada empresa tem seu próprio estoque, equipe e assinatura." />
        <div className="cartao p-5">{conteudo}</div>
      </div>
    )

  return (
    <TelaCheia largura="max-w-xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Bem-vindo, {usuario?.nome.split(' ')[0]}!</h1>
        <p className="text-sm text-slate-500">Para começar, cadastre sua empresa ou entre na equipe de alguém pelo convite.</p>
      </div>
      {conteudo}
      <button className="btn btn-fantasma mt-4 w-full" onClick={sair}>
        <LogOut className="size-4.5" /> Sair
      </button>
    </TelaCheia>
  )
}
