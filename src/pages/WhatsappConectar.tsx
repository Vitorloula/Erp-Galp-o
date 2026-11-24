import { MessageCircle, Power, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Aviso, Cabecalho, Carregando, cx } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAtiva } from '../contexto/Empresa'
import { useDados } from '../contexto/Dados'
import { whatsapp } from '../lib/dados'
import type { CanalWhatsapp } from '../lib/dados/whatsapp'

const CONFIG_ID = (import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string | undefined) ?? ''

export function WhatsappConectar() {
  const { empresa, loja } = useAtiva()
  const { versao, recarregar } = useDados()
  const toast = useToast()
  const [canais, setCanais] = useState<CanalWhatsapp[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // formulário manual (número de teste)
  const [phoneId, setPhoneId] = useState('')
  const [modo, setModo] = useState<'api' | 'coexistence'>('api')
  const [politica, setPolitica] = useState({ horario: '', endereco: '', pagamento: '', entrega: '' })

  // edição da política do canal conectado
  const [editando, setEditando] = useState<CanalWhatsapp | null>(null)
  const [pHorario, setPHorario] = useState('')
  const [pEndereco, setPEndereco] = useState('')
  const [pPagamento, setPPagamento] = useState('')
  const [pEntrega, setPEntrega] = useState('')

  async function carregar() {
    setErro('')
    try {
      const lista = await whatsapp.listarCanais(empresa.empresa_id)
      setCanais(lista)
      const doLoja = lista.find(c => c.loja_id === loja.id)
      if (doLoja) {
        setEditando(doLoja)
        const pl = doLoja.politica ?? {}
        setPHorario(String(pl.horario ?? ''))
        setPEndereco(String(pl.endereco ?? ''))
        setPPagamento(String(pl.pagamento ?? ''))
        setPEntrega(String(pl.entrega ?? ''))
      } else {
        setEditando(null)
      }
    } catch (e) {
      setErro((e as Error).message)
      setCanais([])
    }
  }

  useEffect(() => { carregar() }, [empresa.empresa_id, loja.id, versao])

  async function conectarManual(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneId.trim()) { toast.erro('Informe o phone_number_id.'); return }
    setOcupado(true)
    try {
      await whatsapp.criarCanal(empresa.empresa_id, loja.id, phoneId.trim(), modo, {
        horario: politica.horario,
        endereco: politica.endereco,
        pagamento: politica.pagamento,
        entrega: politica.entrega,
      })
      toast.sucesso('Canal conectado.')
      setPhoneId('')
      await carregar()
      await recarregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function salvarPolitica() {
    if (!editando) return
    setOcupado(true)
    try {
      await whatsapp.atualizarCanal(editando.id, {
        politica: { horario: pHorario, endereco: pEndereco, pagamento: pPagamento, entrega: pEntrega },
      })
      toast.sucesso('Política salva.')
      await carregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function alternarStatus() {
    if (!editando) return
    setOcupado(true)
    try {
      const novo = editando.status === 'conectado' ? 'desconectado' : 'conectado'
      await whatsapp.atualizarCanal(editando.id, { status: novo })
      toast.sucesso(novo === 'conectado' ? 'Canal ativado.' : 'Canal desativado (bot não responde).')
      await carregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  async function desconectar() {
    if (!editando) return
    if (!confirm('Desconectar o WhatsApp desta loja? As conversas ficam guardadas.')) return
    setOcupado(true)
    try {
      await whatsapp.removerCanal(editando.id)
      toast.sucesso('Canal desconectado.')
      await carregar()
      await recarregar()
    } catch (e) { toast.erro((e as Error).message) }
    finally { setOcupado(false) }
  }

  // Embedded Signup v5 (Meta) — só se config_id estiver configurado
  function abrirEmbeddedSignup() {
    if (!CONFIG_ID) { toast.erro('Embedded Signup não configurado (VITE_META_EMBEDDED_SIGNUP_CONFIG_ID).'); return }
    // @ts-ignore
    if (typeof window.FB === 'undefined') { toast.erro('SDK do Facebook não carregado.'); return }
    // @ts-ignore
    window.FB.login((response: { authResponse?: { code: string } }) => {
      if (!response?.authResponse?.code) return
      // TODO: enviar o code para o Worker trocar por business token e criar o canal.
      toast.sucesso('Recebido código. Troca por token será implementada no Worker (F0).')
    }, {
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { version: 'v5' },
    })
  }

  if (canais === null) return <Carregando texto="Carregando..." />

  const canal = editando

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Conectar WhatsApp" subtitulo="Ligue o WhatsApp do comércio ao atendimento automático." acoes={
        <Link to="/whatsapp" className="btn btn-fantasma btn-pequeno">Ver conversas</Link>
      } />

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!canal ? (
        <>
          {/* Embedded Signup (produção) */}
          <div className="cartao p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Conectar com Embedded Signup (recomendado)</h2>
            <p className="text-xs text-slate-500">
              O lojista autoriza o ERP a usar o próprio número do WhatsApp Business. Requer aprovação do app na Meta.
            </p>
            <button type="button" className="btn btn-primario" onClick={abrirEmbeddedSignup} disabled={!CONFIG_ID || ocupado}>
              <MessageCircle className="size-4" /> Conectar número existente
            </button>
            {!CONFIG_ID && (
              <p className="text-xs text-amber-700">Configure VITE_META_EMBEDDED_SIGNUP_CONFIG_ID para habilitar.</p>
            )}
          </div>

          {/* Conexão manual (número de teste / API dedicada) */}
          <form onSubmit={conectarManual} className="cartao p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Conexão manual (número de teste ou API dedicada)</h2>
            <p className="text-xs text-slate-500">Use para o número de teste da Meta ou um número dedicado à API.</p>
            <div>
              <label className="rotulo" htmlFor="wa-phone-id">phone_number_id (Meta)</label>
              <input id="wa-phone-id" className="campo" value={phoneId} onChange={e => setPhoneId(e.target.value)} placeholder="Ex.: 1234567890" />
            </div>
            <div>
              <label className="rotulo" htmlFor="wa-modo">Modo</label>
              <select id="wa-modo" className="campo" value={modo} onChange={e => setModo(e.target.value as 'api' | 'coexistence')}>
                <option value="api">API dedicada</option>
                <option value="coexistence">Coexistence (app + API)</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="wa-horario">Horário de funcionamento</label>
                <input id="wa-horario" className="campo" value={politica.horario} onChange={e => setPolitica(p => ({ ...p, horario: e.target.value }))} placeholder="Seg-Sab 8h-18h" />
              </div>
              <div>
                <label className="rotulo" htmlFor="wa-endereco">Endereço</label>
                <input id="wa-endereco" className="campo" value={politica.endereco} onChange={e => setPolitica(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua X, 123" />
              </div>
              <div>
                <label className="rotulo" htmlFor="wa-pagamento">Formas de pagamento</label>
                <input id="wa-pagamento" className="campo" value={politica.pagamento} onChange={e => setPolitica(p => ({ ...p, pagamento: e.target.value }))} placeholder="Pix, dinheiro, cartão" />
              </div>
              <div>
                <label className="rotulo" htmlFor="wa-entrega">Entrega/retirada</label>
                <input id="wa-entrega" className="campo" value={politica.entrega} onChange={e => setPolitica(p => ({ ...p, entrega: e.target.value }))} placeholder="Retirada na loja" />
              </div>
            </div>
            <button type="submit" className="btn btn-primario" disabled={ocupado}>
              <MessageCircle className="size-4" /> Conectar
            </button>
          </form>
        </>
      ) : (
        <>
          {/* Status + kill switch */}
          <div className="cartao p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Canal conectado</p>
                <p className="text-xs text-slate-500">phone_number_id: {canal.phone_number_id ?? '—'} · modo: {canal.modo}</p>
              </div>
              <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', canal.status === 'conectado' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200')}>
                {canal.status}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secundario btn-pequeno" onClick={alternarStatus} disabled={ocupado}>
                <Power className="size-3.5" /> {canal.status === 'conectado' ? 'Desativar bot' : 'Ativar bot'}
              </button>
              <button type="button" className="btn btn-fantasma btn-pequeno text-red-700" onClick={desconectar} disabled={ocupado}>
                <Trash2 className="size-3.5" /> Desconectar
              </button>
            </div>
            <p className="text-xs text-slate-500">Desativado, o bot não responde; as conversas continuam sendo registradas.</p>
          </div>

          {/* Política */}
          <div className="cartao p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Política da loja (o que o bot responde)</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="p-horario">Horário de funcionamento</label>
                <input id="p-horario" className="campo" value={pHorario} onChange={e => setPHorario(e.target.value)} placeholder="Seg-Sab 8h-18h" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-endereco">Endereço</label>
                <input id="p-endereco" className="campo" value={pEndereco} onChange={e => setPEndereco(e.target.value)} placeholder="Rua X, 123" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-pagamento">Formas de pagamento</label>
                <input id="p-pagamento" className="campo" value={pPagamento} onChange={e => setPPagamento(e.target.value)} placeholder="Pix, dinheiro, cartão" />
              </div>
              <div>
                <label className="rotulo" htmlFor="p-entrega">Entrega/retirada</label>
                <input id="p-entrega" className="campo" value={pEntrega} onChange={e => setPEntrega(e.target.value)} placeholder="Retirada na loja" />
              </div>
            </div>
            <button type="button" className="btn btn-primario" onClick={salvarPolitica} disabled={ocupado}>
              <Save className="size-4" /> Salvar política
            </button>
          </div>

          {/* Escopo do piloto */}
          <div className="cartao p-5 space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">Escopo do piloto</h2>
            <p className="text-xs text-slate-500">
              Limita o que o bot responde. Comece com poucas intenções e amplie conforme a qualidade.
            </p>
            <p className="text-xs text-slate-400">Configuração avançada (escopo_piloto) será editável em breve.</p>
          </div>
        </>
      )}
    </div>
  )
}
