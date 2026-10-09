import { Copy, Crown, MailPlus, MessageCircle, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Modal, Vazio, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useAtiva } from '../contexto/Empresa'
import { empresas } from '../lib/dados'
import { formatarData } from '../lib/formato'
import { DESCRICAO_PAPEL, NOME_PAPEL } from '../lib/permissoes'
import type { Convite, Membro, Papel } from '../lib/tipos'

const PAPEIS: Papel[] = ['dono', 'gerente', 'estoquista', 'caixa']

export function Equipe() {
  const { usuario } = useAuth()
  const { empresa, lojas, pode } = useAtiva()
  const toast = useToast()
  const [membros, setMembros] = useState<Membro[] | null>(null)
  const [convites, setConvites] = useState<Convite[]>([])
  const [erro, setErro] = useState('')
  const [convidando, setConvidando] = useState(false)
  const [removendo, setRemovendo] = useState<Membro | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        empresas.listarEquipe(empresa.empresa_id),
        pode.convidar ? empresas.listarConvites(empresa.empresa_id) : Promise.resolve([]),
      ])
      setMembros(m)
      setConvites(c)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [empresa.empresa_id, pode.convidar])
  useEffect(() => {
    carregar()
  }, [carregar])

  if (!pode.convidar && !pode.gerenciarEquipe) return <Navigate to="/painel" replace />

  async function fazer(acao: () => Promise<unknown>, aviso: string) {
    try {
      await acao()
      toast.sucesso(aviso)
      await carregar()
    } catch (e) {
      toast.erro((e as Error).message)
    }
  }

  const pendentes = convites.filter(c => !c.aceito_em && !c.cancelado_em && new Date(c.expira_em) > new Date())
  const nomeLojas = (ids: string[] | null) => (ids ? ids.map(id => lojas?.find(l => l.id === id)?.nome ?? 'loja').join(', ') : null)

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecalho
        titulo="Equipe"
        subtitulo={`Quem trabalha em ${empresa.nome} e o que cada pessoa pode fazer.`}
        acoes={
          pode.convidar && (
            <button className="btn btn-primario" onClick={() => setConvidando(true)}>
              <UserPlus className="size-4.5" /> Convidar pessoa
            </button>
          )
        }
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!membros && !erro ? (
        <Carregando />
      ) : (
        <div className="space-y-6">
          <section className="cartao divide-y divide-slate-100 overflow-hidden">
            {(membros ?? []).length === 0 && <Vazio icone={Users} titulo="Ninguém na equipe" />}
            {(membros ?? []).map(m => {
              const eu = m.usuario_id === usuario?.id
              return (
                <div key={m.usuario_id} data-membro={m.email ?? m.nome} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold', m.papel === 'dono' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600')}>
                      {m.papel === 'dono' ? <Crown className="size-5" /> : m.nome.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {m.nome} {eu && <span className="text-xs font-normal text-slate-500">(você)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {m.email}
                        {` · desde ${formatarData(m.criado_em)}`}
                        {nomeLojas(m.lojas) && ` · só ${nomeLojas(m.lojas)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="campo sm:w-44"
                      value={m.papel}
                      disabled={eu || !pode.gerenciarEquipe}
                      title={eu ? 'Ninguém altera o próprio acesso' : DESCRICAO_PAPEL[m.papel]}
                      onChange={e => fazer(() => empresas.alterarMembro(empresa.empresa_id, m.usuario_id, { papel: e.target.value as Papel }), `${m.nome}: ${NOME_PAPEL[e.target.value as Papel]}.`)}
                      aria-label={`Papel de ${m.nome}`}
                    >
                      {PAPEIS.map(p => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
                    </select>
                    {pode.gerenciarEquipe && !eu && (
                      <button className="btn btn-fantasma p-2 text-red-700" onClick={() => setRemovendo(m)} aria-label={`Remover ${m.nome}`}>
                        <Trash2 className="size-4.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </section>

          {pode.convidar && pendentes.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-slate-900">Convites aguardando</h2>
              <div className="cartao divide-y divide-slate-100 overflow-hidden">
                {pendentes.map(c => (
                  <div key={c.id} data-convite={c.papel} className="flex items-center gap-3 px-4 py-3">
                    <MailPlus className="size-5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-slate-800">
                        {NOME_PAPEL[c.papel]} {c.email ? `· ${c.email}` : '· qualquer pessoa com o link'}
                      </p>
                      <p className="text-xs text-slate-500">Vale até {formatarData(c.expira_em)}</p>
                    </div>
                    <button className="btn btn-fantasma px-2 py-1.5 text-xs text-red-700" onClick={() => fazer(() => empresas.cancelarConvite(c.id), 'Convite cancelado.')}>
                      <X className="size-4" /> Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-1 text-xs text-slate-500">
            {PAPEIS.map(p => (
              <p key={p}><strong className="text-slate-700">{NOME_PAPEL[p]}:</strong> {DESCRICAO_PAPEL[p]}.</p>
            ))}
          </div>
        </div>
      )}

      <NovoConvite aberto={convidando} aoFechar={() => setConvidando(false)} aoCriar={carregar} />
      <Modal
        aberto={!!removendo}
        aoFechar={() => setRemovendo(null)}
        titulo="Remover da equipe?"
        rodape={
          <>
            <button className="btn btn-secundario flex-1" onClick={() => setRemovendo(null)}>Cancelar</button>
            <button
              className="btn btn-perigo flex-1"
              onClick={async () => {
                const m = removendo!
                setRemovendo(null)
                await fazer(() => empresas.removerMembro(empresa.empresa_id, m.usuario_id), `${m.nome} saiu da equipe.`)
              }}
            >
              <Trash2 className="size-4.5" /> Remover
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <strong>{removendo?.nome}</strong> perde o acesso a {empresa.nome} imediatamente. Os lançamentos que fez continuam no histórico, com o nome dela.
        </p>
      </Modal>
    </div>
  )
}

function NovoConvite({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: () => void }) {
  const { empresa, lojas, pode } = useAtiva()
  const toast = useToast()
  const [papel, setPapel] = useState<Exclude<Papel, 'dono'>>('estoquista')
  const [email, setEmail] = useState('')
  const [lojasEscolhidas, setLojasEscolhidas] = useState<string[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  function fechar() {
    setLink(null)
    setEmail('')
    setErro('')
    setLojasEscolhidas([])
    aoFechar()
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCriando(true)
    try {
      setLink(await empresas.criarConvite(empresa.empresa_id, papel, email, lojasEscolhidas.length ? lojasEscolhidas : null))
      aoCriar()
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setCriando(false)
    }
  }

  const mensagem = link ? `Você foi convidado para trabalhar em ${empresa.nome} como ${NOME_PAPEL[papel]}. Acesse: ${link}` : ''
  const papeis = (['gerente', 'estoquista', 'caixa'] as const).filter(p => p !== 'gerente' || pode.convidarGerente)

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Convidar pessoa">
      {link ? (
        <div className="space-y-4">
          <Aviso tom="info">Envie o link abaixo. Ele vale por 7 dias e pode ser usado uma única vez.</Aviso>
          <input className="campo font-mono text-xs" readOnly value={link} aria-label="Link do convite" onFocus={e => e.target.select()} />
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn btn-secundario"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link)
                  toast.sucesso('Link copiado.')
                } catch {
                  toast.erro('Não foi possível copiar: selecione o link e copie.')
                }
              }}
            >
              <Copy className="size-4.5" /> Copiar link
            </button>
            <a className="btn btn-primario" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4.5" /> WhatsApp
            </a>
          </div>
          <button className="btn btn-fantasma w-full" onClick={fechar}>Concluir</button>
        </div>
      ) : (
        <form onSubmit={criar} className="space-y-4">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <fieldset>
            <legend className="rotulo">O que a pessoa vai fazer</legend>
            <div className="space-y-2">
              {papeis.map(p => (
                <label key={p} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', papel === p ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200')}>
                  <input type="radio" name="papel" className="mt-0.5 size-4.5 accent-emerald-700" checked={papel === p} onChange={() => setPapel(p)} />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{NOME_PAPEL[p]}</span>
                    <span className="block text-xs text-slate-500">{DESCRICAO_PAPEL[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {(lojas?.length ?? 0) > 1 && (
            <fieldset>
              <legend className="rotulo">Lojas (deixe em branco para todas)</legend>
              <div className="flex flex-wrap gap-2">
                {lojas!.map(l => (
                  <label key={l.id} className="chip chip-inativo cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-emerald-700"
                      checked={lojasEscolhidas.includes(l.id)}
                      onChange={e => setLojasEscolhidas(s => (e.target.checked ? [...s, l.id] : s.filter(x => x !== l.id)))}
                    />
                    {l.nome}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <label className="rotulo" htmlFor="convite-email">E-mail da pessoa (opcional)</label>
            <input id="convite-email" type="email" className="campo" value={email} onChange={e => setEmail(e.target.value)} placeholder="Deixe em branco para enviar só o link" />
            <p className="mt-1 text-xs text-slate-500">Com e-mail, só essa pessoa consegue usar o convite.</p>
          </div>
          <button className="btn btn-primario btn-grande w-full" disabled={criando}>
            <UserPlus className="size-5" /> {criando ? 'Criando...' : 'Criar link de convite'}
          </button>
        </form>
      )}
    </Modal>
  )
}
