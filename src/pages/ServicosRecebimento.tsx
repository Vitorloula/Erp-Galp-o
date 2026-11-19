import { Printer } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Passos, NavegacaoEtapas } from '../components/Etapas'
import { ImpressaoOS, useImpressaoAutomatica, type DadosImpressaoOS } from '../components/ImpressaoOS'
import { Cabecalho } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useAtiva } from '../contexto/Empresa'
import { useToast } from '../components/Toast'
import { os as dadosOS } from '../lib/dados'
import { numeroOS } from '../lib/servicos'
import type { DadosOS } from '../lib/tipos'

const TIPOS_APARELHO = ['Celular', 'Notebook', 'Tablet', 'Televisão', 'Eletrodoméstico', 'Outro']

/** O balcão recebe nesta ordem; dividir em etapas evita a rolagem longa no celular. */
type EtapaOS = 'cliente' | 'aparelho' | 'problema'

const ETAPAS: { id: EtapaOS; rotulo: string }[] = [
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'aparelho', rotulo: 'Aparelho' },
  { id: 'problema', rotulo: 'Problema e prazo' },
]

/** Primeiro campo de cada etapa, para o foco acompanhar a navegação. */
const PRIMEIRO_CAMPO: Record<EtapaOS, string> = {
  cliente: 'cliente-nome',
  aparelho: 'aparelho-tipo',
  problema: 'defeito',
}

const dadosVazios = (): DadosOS => ({
  cliente_nome: '',
  cliente_telefone: '',
  cliente_documento: '',
  aparelho_tipo: '',
  aparelho_marca_modelo: '',
  aparelho_serie_imei: '',
  aparelho_cor: '',
  aparelho_senha: '',
  aparelho_acessorios: '',
  aparelho_estado: '',
  defeito_relatado: '',
  prazo_prometido: null,
  tecnico_nome: '',
})

interface Comprovante {
  id: string
  numero: number
  criadoEm: string
  dados: DadosOS
}

export function ServicosRecebimento() {
  const { empresa, loja, pode } = useAtiva()
  const { usuario } = useAuth()
  const navegar = useNavigate()
  const toast = useToast()
  const [dados, setDados] = useState<DadosOS>(dadosVazios)
  const [etapa, setEtapa] = useState<EtapaOS>('cliente')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [comprovante, setComprovante] = useState<Comprovante | null>(null)
  /** Cada incremento reimprime o comprovante já renderizado no portal. */
  const [pedidoImpressao, setPedidoImpressao] = useState(0)

  useImpressaoAutomatica(pedidoImpressao)

  function set(campo: keyof DadosOS, valor: string | null) {
    setDados(d => ({ ...d, [campo]: valor ?? '' }))
  }

  function irPara(destino: EtapaOS) {
    setEtapa(destino)
    requestAnimationFrame(() => document.getElementById(PRIMEIRO_CAMPO[destino])?.focus())
  }

  /** Erro de validação: mostra a mensagem e abre a etapa do campo. */
  function recusar(mensagem: string, destino: EtapaOS) {
    setErro(mensagem)
    irPara(destino)
  }

  function validarEtapa(atual: EtapaOS): string | null {
    if (atual === 'cliente' && !dados.cliente_nome.trim()) return 'Informe o nome do cliente.'
    if (atual === 'aparelho') {
      if (!dados.aparelho_tipo.trim()) return 'Informe o tipo de aparelho.'
      if (!dados.aparelho_marca_modelo.trim()) return 'Informe a marca e o modelo.'
    }
    if (atual === 'problema' && !dados.defeito_relatado.trim()) return 'Informe o defeito relatado.'
    return null
  }

  function avancar() {
    setErro('')
    const mensagem = validarEtapa(etapa)
    if (mensagem) return setErro(mensagem)
    const proxima = ETAPAS[ETAPAS.findIndex(e => e.id === etapa) + 1]
    if (proxima) irPara(proxima.id)
  }

  function voltar() {
    const anterior = ETAPAS[ETAPAS.findIndex(e => e.id === etapa) - 1]
    if (anterior) irPara(anterior.id)
  }

  async function salvar() {
    setErro('')
    if (!dados.cliente_nome.trim()) return recusar('Informe o nome do cliente.', 'cliente')
    if (!dados.aparelho_tipo.trim()) return recusar('Informe o tipo de aparelho.', 'aparelho')
    if (!dados.aparelho_marca_modelo.trim()) return recusar('Informe a marca e o modelo.', 'aparelho')
    if (!dados.defeito_relatado.trim()) return recusar('Informe o defeito relatado.', 'problema')
    if (!pode.criarOrdem) return setErro('Sem permissão para receber aparelho.')
    setSalvando(true)
    try {
      const r = await dadosOS.criarOrdem(empresa.empresa_id, loja.id, dados)
      toast.sucesso(`${numeroOS(r.numero)} recebida.`)
      // Fica nesta tela para o comprovante aparecer (e imprimir) antes de abrir a OS.
      setComprovante({ id: r.id, numero: r.numero, criadoEm: new Date().toISOString(), dados })
      setPedidoImpressao(p => p + 1)
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  /** Última etapa grava; as anteriores só validam e avançam (Enter também avança). */
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (etapa === 'problema') return void salvar()
    avancar()
  }

  const dadosComprovante: DadosImpressaoOS | null = comprovante && {
    tipo: 'comprovante',
    numero: comprovante.numero,
    criadoEm: comprovante.criadoEm,
    status: 'aberta',
    cliente: {
      nome: comprovante.dados.cliente_nome,
      telefone: comprovante.dados.cliente_telefone.trim() || null,
      documento: comprovante.dados.cliente_documento.trim() || null,
    },
    aparelho: {
      tipo: comprovante.dados.aparelho_tipo,
      marcaModelo: comprovante.dados.aparelho_marca_modelo,
      serie: comprovante.dados.aparelho_serie_imei.trim() || null,
      cor: comprovante.dados.aparelho_cor.trim() || null,
      acessorios: comprovante.dados.aparelho_acessorios.trim() || null,
      estado: comprovante.dados.aparelho_estado.trim() || null,
    },
    defeito: comprovante.dados.defeito_relatado,
    diagnostico: null,
    prazo: comprovante.dados.prazo_prometido,
    tecnico: comprovante.dados.tecnico_nome.trim() || null,
    recebidoPor: usuario?.nome ?? null,
    itens: [],
    maoDeObra: 0,
    desconto: 0,
    total: 0,
    pagamentos: [],
    entregueEm: null,
    entreguePor: null,
    garantiaDias: null,
    motivoCancelamento: null,
    empresa: empresa.nome,
    loja,
  }

  if (comprovante) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Cabecalho titulo="Aparelho recebido" subtitulo={`${numeroOS(comprovante.numero)} · ${comprovante.dados.cliente_nome}`} />
        <section className="cartao space-y-3 p-4">
          <p className="text-sm font-medium text-emerald-700">{numeroOS(comprovante.numero)} aberta. O comprovante está pronto para impressão.</p>
          <p className="text-sm text-slate-600">
            A senha do aparelho não aparece no comprovante. Se a impressora não abriu, use “Imprimir novamente”.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primario" onClick={() => setPedidoImpressao(p => p + 1)}>
              <Printer className="size-4" /> Imprimir novamente
            </button>
            <button type="button" className="btn btn-secundario" onClick={() => navegar(`/os/${comprovante.id}`)}>Abrir OS</button>
            <button
              type="button"
              className="btn btn-fantasma"
              onClick={() => { setComprovante(null); setDados(dadosVazios()); setEtapa('cliente'); setErro('') }}
            >
              Receber outro aparelho
            </button>
          </div>
        </section>
        <ImpressaoOS dados={dadosComprovante} />
      </div>
    )
  }

  const ultimaEtapa = etapa === 'problema'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Cabecalho titulo="Receber aparelho" subtitulo="Abre a ordem de serviço e imprime o comprovante." />

      <Passos passos={ETAPAS} atual={etapa} aoVoltar={irPara} />

      {erro && <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      <form onSubmit={enviar} className="space-y-4">
        {etapa === 'cliente' && (
          <section className="cartao space-y-3 p-4">
            <h2 className="text-sm font-semibold text-ponto">Cliente</h2>
            <div>
              <label className="rotulo" htmlFor="cliente-nome">Nome do cliente *</label>
              <input id="cliente-nome" className="campo" autoFocus value={dados.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} placeholder="Ex.: Maria Souza" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="cliente-tel">Telefone</label>
                <input id="cliente-tel" className="campo" value={dados.cliente_telefone} onChange={e => set('cliente_telefone', e.target.value)} placeholder="Ex.: (11) 99999-0000" />
              </div>
              <div>
                <label className="rotulo" htmlFor="cliente-doc">CPF ou CNPJ</label>
                <input id="cliente-doc" className="campo" value={dados.cliente_documento} onChange={e => set('cliente_documento', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </section>
        )}

        {etapa === 'aparelho' && (
          <section className="cartao space-y-3 p-4">
            <h2 className="text-sm font-semibold text-ponto">Aparelho</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="aparelho-tipo">Tipo de aparelho *</label>
                <input id="aparelho-tipo" list="tipos-aparelho" className="campo" autoFocus value={dados.aparelho_tipo} onChange={e => set('aparelho_tipo', e.target.value)} placeholder="Ex.: Celular" />
                <datalist id="tipos-aparelho">{TIPOS_APARELHO.map(t => <option key={t} value={t} />)}</datalist>
              </div>
              <div>
                <label className="rotulo" htmlFor="aparelho-marca">Marca e modelo *</label>
                <input id="aparelho-marca" className="campo" value={dados.aparelho_marca_modelo} onChange={e => set('aparelho_marca_modelo', e.target.value)} placeholder="Ex.: Samsung Galaxy A54" />
              </div>
              <div>
                <label className="rotulo" htmlFor="aparelho-imei">IMEI ou nº de série</label>
                <input id="aparelho-imei" className="campo font-mono" value={dados.aparelho_serie_imei} onChange={e => set('aparelho_serie_imei', e.target.value)} placeholder="Ex.: 354899109583011" />
              </div>
              <div>
                <label className="rotulo" htmlFor="aparelho-cor">Cor</label>
                <input id="aparelho-cor" className="campo" value={dados.aparelho_cor} onChange={e => set('aparelho_cor', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div>
              <label className="rotulo" htmlFor="aparelho-senha">Senha de desbloqueio (opcional)</label>
              <input id="aparelho-senha" className="campo" value={dados.aparelho_senha} onChange={e => set('aparelho_senha', e.target.value)} />
              <p className="mt-1 text-xs text-amber-700">
                A senha é um dado sensível: fica gravada na ordem de serviço para uso interno da loja e não aparece no comprovante impresso.
              </p>
            </div>
          </section>
        )}

        {etapa === 'problema' && (
          <section className="cartao space-y-3 p-4">
            <h2 className="text-sm font-semibold text-ponto">Estado e problema</h2>
            <div>
              <label className="rotulo" htmlFor="aparelho-acessorios">Acessórios entregues</label>
              <input id="aparelho-acessorios" className="campo" value={dados.aparelho_acessorios} onChange={e => set('aparelho_acessorios', e.target.value)} placeholder="Ex.: carregador, capa, cartão de memória" />
            </div>
            <div>
              <label className="rotulo" htmlFor="aparelho-estado">Estado de conservação</label>
              <input id="aparelho-estado" className="campo" value={dados.aparelho_estado} onChange={e => set('aparelho_estado', e.target.value)} placeholder="Ex.: riscos na tampa traseira" />
            </div>
            <div>
              <label className="rotulo" htmlFor="defeito">Defeito relatado *</label>
              <textarea id="defeito" className="campo" rows={3} autoFocus value={dados.defeito_relatado} onChange={e => set('defeito_relatado', e.target.value)} placeholder="Ex.: não liga; tela quebrada" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="prazo">Prazo prometido</label>
                <input id="prazo" type="date" className="campo" value={dados.prazo_prometido ?? ''} onChange={e => set('prazo_prometido', e.target.value || null)} />
                <p className="mt-1 text-xs text-slate-500">Data prometida ao cliente. Aparece na agenda.</p>
              </div>
              <div>
                <label className="rotulo" htmlFor="tecnico">Técnico responsável</label>
                <input id="tecnico" className="campo" value={dados.tecnico_nome} onChange={e => set('tecnico_nome', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </section>
        )}

        <NavegacaoEtapas
          primeira={etapa === 'cliente'}
          ultima={ultimaEtapa}
          salvando={salvando}
          rotuloFinal="Receber aparelho"
          aoVoltar={voltar}
          grande
        />
      </form>
    </div>
  )
}
