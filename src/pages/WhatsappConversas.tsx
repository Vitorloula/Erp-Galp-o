import { MessageCircle, Pause, Play, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAtiva } from '../contexto/Empresa'
import { useDados } from '../contexto/Dados'
import { whatsapp } from '../lib/dados'
import { formatarDataHora } from '../lib/formato'
import { formatarReais } from '../pdv/venda'
import type { ConversaWhatsapp, MensagemWhatsapp, PedidoWhatsapp } from '../lib/dados/whatsapp'

export function WhatsappConversas() {
  const { empresa, loja } = useAtiva()
  const { versao } = useDados()
  const toast = useToast()
  const [conversas, setConversas] = useState<ConversaWhatsapp[] | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MensagemWhatsapp[] | null>(null)
  const [pedidos, setPedidos] = useState<PedidoWhatsapp[]>([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function carregar() {
    setErro('')
    try {
      const lista = await whatsapp.listarConversas(empresa.empresa_id, loja.id)
      setConversas(lista)
      if (!selecionada && lista.length) setSelecionada(lista[0].id)
    } catch (e) {
      setErro((e as Error).message)
      setConversas([])
    }
  }

  useEffect(() => { carregar() }, [empresa.empresa_id, loja.id, versao])

  useEffect(() => {
    if (!selecionada) { setMensagens(null); setPedidos([]); return }
    setMensagens(null)
    whatsapp.listarMensagens(selecionada).then(setMensagens, (e: unknown) => setErro((e as Error).message))
    whatsapp.listarPedidos(empresa.empresa_id, loja.id).then((todos: PedidoWhatsapp[]) => {
      // pedidos ligados a esta conversa não têm conversa_id exposto na tela; filtramos por contato via mensagens? simplificação: mostra todos aguardando
      setPedidos(todos.filter(p => p.status === 'aguardando_confirmacao'))
    }, () => {})
  }, [selecionada, empresa.empresa_id, loja.id])

  const convAtual = conversas?.find(c => c.id === selecionada) ?? null

  async function pausar() {
    if (!selecionada) return
    setOcupado(true)
    try {
      await whatsapp.pausarConversa(selecionada)
      toast.sucesso('Bot pausado. Você assumiu a conversa.')
      await carregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function retomar() {
    if (!selecionada) return
    setOcupado(true)
    try {
      await whatsapp.retomarConversa(selecionada)
      toast.sucesso('Bot retomado.')
      await carregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function confirmarPedido(pedidoId: string) {
    setOcupado(true)
    try {
      await whatsapp.confirmarPedido(pedidoId)
      toast.sucesso('Pedido confirmado.')
      const todos = await whatsapp.listarPedidos(empresa.empresa_id, loja.id, 'aguardando_confirmacao')
      setPedidos(todos)
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function cancelarPedido(pedidoId: string) {
    setOcupado(true)
    try {
      await whatsapp.cancelarPedido(pedidoId, 'Cancelado pelo atendente')
      toast.sucesso('Pedido cancelado.')
      const todos = await whatsapp.listarPedidos(empresa.empresa_id, loja.id, 'aguardando_confirmacao')
      setPedidos(todos)
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Conversas do WhatsApp"
        subtitulo="Acompanhe o atendimento e assuma quando precisar."
        acoes={
          <div className="flex gap-2">
            <Link to="/whatsapp/conectar" className="btn btn-fantasma btn-pequeno">Conectar número</Link>
            <button type="button" className="btn btn-fantasma" onClick={carregar} disabled={ocupado}>
              <RefreshCw className="size-4" /> Atualizar
            </button>
          </div>
        }
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {conversas === null ? (
        <Carregando texto="Carregando conversas..." />
      ) : conversas.length === 0 ? (
        <div className="cartao">
          <Vazio icone={MessageCircle} titulo="Nenhuma conversa ainda" texto="Quando um cliente mandar mensagem no WhatsApp da loja, ela aparece aqui." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Lista */}
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {conversas.map(c => (
              <button
                key={c.id}
                onClick={() => setSelecionada(c.id)}
                className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition', selecionada === c.id ? 'bg-slate-100' : 'hover:bg-slate-50')}
              >
                <span className={cx('mt-1 grid size-2.5 shrink-0 rounded-full', c.estado === 'bot' ? 'bg-emerald-500' : c.estado === 'humano' ? 'bg-amber-500' : 'bg-slate-300')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 truncate">{c.nome_perfil || c.telefone}</span>
                  <span className="block text-xs text-slate-500 truncate">{c.preview ?? '—'}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{formatarDataHora(c.atualizado_em)}</span>
                </span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', c.estado === 'bot' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : c.estado === 'humano' ? 'bg-amber-100 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200')}>
                  {c.estado === 'bot' ? 'Bot' : c.estado === 'humano' ? 'Humano' : 'Encerrada'}
                </span>
              </button>
            ))}
          </div>

          {/* Transcript */}
          <div className="cartao flex flex-col min-h-[400px]">
            {!convAtual ? (
              <div className="flex-1 grid place-items-center text-slate-400 text-sm">Selecione uma conversa.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{convAtual.nome_perfil || convAtual.telefone}</p>
                    <p className="text-xs text-slate-500">{convAtual.telefone}</p>
                  </div>
                  <div className="flex gap-2">
                    {convAtual.estado === 'bot' ? (
                      <button type="button" className="btn btn-secundario btn-pequeno" onClick={pausar} disabled={ocupado}>
                        <Pause className="size-3.5" /> Assumir
                      </button>
                    ) : convAtual.estado === 'humano' ? (
                      <button type="button" className="btn btn-primario btn-pequeno" onClick={retomar} disabled={ocupado}>
                        <Play className="size-3.5" /> Devolver ao bot
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {mensagens === null ? (
                    <Carregando texto="Carregando mensagens..." />
                  ) : mensagens.length === 0 ? (
                    <p className="text-center text-sm text-slate-400">Sem mensagens.</p>
                  ) : (
                    mensagens.map(m => (
                      <div key={m.id} className={cx('flex', m.direcao === 'out' ? 'justify-end' : 'justify-start')}>
                        <div className={cx('max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap', m.direcao === 'out' ? 'bg-marca text-white' : 'bg-slate-100 text-slate-900')}>
                          {m.texto ?? (m.tipo !== 'text' ? `[${m.tipo}]` : '')}
                          <span className={cx('mt-1 block text-[10px] opacity-70', m.direcao === 'out' ? 'text-white' : 'text-slate-500')}>{formatarDataHora(m.criado_em)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {pedidos.length > 0 && (
                  <div className="border-t border-slate-100 p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pedidos aguardando confirmação</p>
                    {pedidos.map(p => (
                      <div key={p.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">Pedido #{p.numero}</span>
                          <span className="text-xs text-slate-500">{p.contato_telefone}</span>
                        </div>
                        <ul className="mt-1 text-xs text-slate-600">
                          {p.itens.map((it, i) => (
                            <li key={i}>{it.qtd}× {it.nome} — {formatarReais(it.subtotal_centavos / 100)}</li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-bold text-slate-900">{formatarReais(p.total_centavos / 100)}</span>
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-primario btn-pequeno" onClick={() => confirmarPedido(p.id)} disabled={ocupado}>Confirmar</button>
                            <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => cancelarPedido(p.id)} disabled={ocupado}>Cancelar</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
