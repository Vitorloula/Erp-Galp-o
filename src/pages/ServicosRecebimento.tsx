
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Cabecalho } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { useToast } from '../components/Toast'
import { os as dadosOS } from '../lib/dados'
import { formatarData } from '../lib/formato'
import { numeroOS } from '../lib/servicos'
import type { DadosOS } from '../lib/tipos'

const TIPOS_APARELHO = ['Celular', 'Notebook', 'Tablet', 'Televisão', 'Eletrodoméstico', 'Outro']

export function ServicosRecebimento() {
  const { empresa, loja, pode } = useAtiva()
  const navegar = useNavigate()
  const toast = useToast()
  const [dados, setDados] = useState<DadosOS>({
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
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [comprovante, setComprovante] = useState<DadosOS & { numero: number; criadoPor: string; criadoEm: string } | null>(null)

  function set(campo: keyof DadosOS, valor: string | null) {
    setDados(d => ({ ...d, [campo]: valor ?? '' }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!dados.cliente_nome.trim()) return setErro('Informe o nome do cliente.')
    if (!dados.aparelho_tipo.trim()) return setErro('Informe o tipo de aparelho.')
    if (!dados.aparelho_marca_modelo.trim()) return setErro('Informe a marca e o modelo.')
    if (!dados.defeito_relatado.trim()) return setErro('Informe o defeito relatado.')
    if (!pode.criarOrdem) return setErro('Sem permissão para receber aparelho.')
    setSalvando(true)
    try {
      const r = await dadosOS.criarOrdem(empresa.empresa_id, loja.id, dados)
      toast.sucesso(`${numeroOS(r.numero)} recebida.`)
      setComprovante({ ...dados, numero: r.numero, criadoPor: '', criadoEm: new Date().toISOString() })
      // abre impressão após 50ms
      setTimeout(() => window.print(), 50)
      navegar(`/os/${r.id}`)
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Cabecalho titulo="Receber aparelho" subtitulo="Abre a ordem de serviço e imprime o comprovante." />
      {erro && <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      <form onSubmit={salvar} className="space-y-4">
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

        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm font-semibold text-ponto">Aparelho</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="aparelho-tipo">Tipo de aparelho *</label>
              <input id="aparelho-tipo" list="tipos-aparelho" className="campo" value={dados.aparelho_tipo} onChange={e => set('aparelho_tipo', e.target.value)} placeholder="Ex.: Celular" />
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
            <textarea id="defeito" className="campo" rows={3} value={dados.defeito_relatado} onChange={e => set('defeito_relatado', e.target.value)} placeholder="Ex.: não liga; tela quebrada" />
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

        <button type="submit" className="btn btn-primario btn-grande w-full" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Receber aparelho'}
        </button>
      </form>

      {/* Comprovante de recebimento (impresso via window.print) */}
      {comprovante && (
        <div className="cupom-impressao" data-comprovante-os={String(comprovante.numero).padStart(6, '0')}>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{empresa.nome}</div>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>*** DOCUMENTO SEM VALOR FISCAL ***</div>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>{numeroOS(comprovante.numero)}</div>
          <div style={{ textAlign: 'center', fontSize: 11 }}>{new Date(comprovante.criadoEm).toLocaleString('pt-BR')} · Recebido por</div>
          <hr />
          <div>CLIENTE: {comprovante.cliente_nome}</div>
          {comprovante.cliente_telefone && <div>TELEFONE: {comprovante.cliente_telefone}</div>}
          {comprovante.cliente_documento && <div>CPF/CNPJ: {comprovante.cliente_documento}</div>}
          <div>APARELHO: {comprovante.aparelho_tipo} {comprovante.aparelho_marca_modelo}</div>
          {comprovante.aparelho_serie_imei && <div>IMEI/SÉRIE: {comprovante.aparelho_serie_imei}</div>}
          {comprovante.aparelho_cor && <div>COR: {comprovante.aparelho_cor}</div>}
          <div>ACESSÓRIOS: {comprovante.aparelho_acessorios || 'Nenhum'}</div>
          {comprovante.aparelho_estado && <div>ESTADO: {comprovante.aparelho_estado}</div>}
          <div>DEFEITO: {comprovante.defeito_relatado}</div>
          <div>PRAZO: {comprovante.prazo_prometido ? formatarData(comprovante.prazo_prometido) : 'A combinar'}</div>
          <hr />
          <div style={{ fontWeight: 700 }}>TERMO DE RESPONSABILIDADE</div>
          <div style={{ fontSize: 10 }}>
            Declaro que deixei para conserto o aparelho descrito acima, no estado de conservação indicado, e que os acessórios listados foram entregues com ele. Não nos responsabilizamos por dados, arquivos ou senhas armazenados no aparelho, que podem ser perdidos durante o conserto. O serviço só começa após a aprovação do orçamento.
          </div>
          <div>Assinatura do cliente: ______________</div>
          <div>Assinatura da loja: ______________</div>
        </div>
      )}
    </div>
  )
}