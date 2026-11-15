import { Copy, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { BuscaProduto } from '../components/BuscaProduto'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Modal, cx } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { os as dadosOS } from '../lib/dados'
import { NOME_FORMA } from '../pdv/venda'
import { formatarData } from '../lib/formato'
import { formatarReais } from '../pdv/venda'
import { dicaGarantiaSugerida, mensagemOrcado, mensagemPronta, numeroOS, proximoStatus, STATUS_OS } from '../lib/servicos'
import type { DetalheOS } from '../lib/dados/os'
import type { ItemOS, StatusOS } from '../lib/tipos'

const ROTULO_BOTAO: Partial<Record<StatusOS, string>> = {
  aberta: 'Iniciar diagnóstico',
  em_diagnostico: 'Enviar orçamento',
  aguardando_aprovacao: 'Cliente aprovou o orçamento',
  aprovada: 'Iniciar execução',
  em_execucao: 'Marcar como pronta',
}

export function ServicosDetalhe() {
  const { id } = useParams()
  const { empresa, loja, pode } = useAtiva()
  const toast = useToast()
  const [detalhe, setDetalhe] = useState<DetalheOS | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [diagnosticoTxt, setDiagnosticoTxt] = useState('')
  const [defeitoTxt, setDefeitoTxt] = useState('')
  const [maoObra, setMaoObra] = useState(0)
  const [desconto, setDesconto] = useState(0)
  const [itens, setItens] = useState<ItemOS[]>([])
  const [garantiaDias, setGarantiaDias] = useState<number | null>(null)
  const [modalBusca, setModalBusca] = useState(false)
  const [modalAvancar, setModalAvancar] = useState(false)
  const [modalCancelar, setModalCancelar] = useState(false)
  const [modalEntregar, setModalEntregar] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [forma, setForma] = useState('01')
  const [valorPag, setValorPag] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [avancoStatus, setAvancoStatus] = useState<StatusOS | null>(null)

  async function carregar() {
    if (!id) return
    setCarregando(true)
    try {
      const d = await dadosOS.detalheDaOrdem(id)
      setDetalhe(d)
      setItens(d.itens)
      setMaoObra(d.os.valor_mao_de_obra)
      setDesconto(d.os.desconto)
      setGarantiaDias(d.os.garantia_dias)
      setDefeitoTxt(d.os.defeito_relatado ?? '')
      setDiagnosticoTxt(d.os.diagnostico ?? '')
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [id])

  if (carregando) return <div className="cartao p-6 text-center text-slate-500">Carregando…</div>
  if (erro || !detalhe) return <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro || 'OS não encontrada.'}</div>

  const os = detalhe.os
  const totalCentavos = ((): number => {
    const itensCent = itens.reduce((s, i) => s + Math.round(i.quantidade * i.preco_unitario * 100), 0)
    return Math.max(0, itensCent + Math.round(maoObra * 100) - Math.round(desconto * 100))
  })()
  const totalReais = totalCentavos / 100
  const travado = os.status === 'aprovada' || os.status === 'em_execucao' || os.status === 'pronta' || os.status === 'entregue' || os.status === 'cancelada'
  const podeMover = pode.moverOrdem
  const podeEntregar = pode.entregarOrdem && os.status === 'pronta'

  async function salvarDiagnostico() {
    if (!id) return
    setSalvando(true)
    try {
      await dadosOS.salvarOrdem(id, { defeito_relatado: defeitoTxt, diagnostico: diagnosticoTxt })
      toast.sucesso('Diagnóstico salvo.')
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function salvarOrcamento() {
    if (!id) return
    setSalvando(true)
    try {
      await dadosOS.definirItens(id, itens.map((it) => ({
        origem: it.origem,
        produto_id: it.produto_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
      })))
      await dadosOS.salvarOrdem(id, { valor_mao_de_obra: maoObra, desconto })
      toast.sucesso('Orçamento salvo.')
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function avancarStatus(status: StatusOS) {
    if (!id) return
    setSalvando(true)
    try {
      if (status === 'aguardando_aprovacao') {
        await dadosOS.salvarOrdem(id, { valor_mao_de_obra: maoObra, desconto })
        await dadosOS.definirItens(id, itens.map(it => ({ origem: it.origem, produto_id: it.produto_id, descricao: it.descricao, quantidade: it.quantidade, preco_unitario: it.preco_unitario })))
      }
      await dadosOS.mudarStatus(id, status)
      if (status === 'aguardando_aprovacao') toast.sucesso('Orçamento enviado.')
      else if (status === 'aprovada') toast.sucesso('Aprovação registrada.')
      else toast.sucesso('Status atualizado.')
      setModalAvancar(false)
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function registrarPagamento() {
    if (!id) return
    const v = Number(valorPag.replace(',', '.'))
    if (!v || v <= 0) return
    setSalvando(true)
    try {
      await dadosOS.registrarPagamento(empresa.empresa_id, loja.id, id, forma, v)
      setValorPag('')
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function entregar() {
    if (!id) return
    if (garantiaDias !== os.garantia_dias) {
      await dadosOS.salvarOrdem(id, { garantia_dias: garantiaDias })
    }
    setSalvando(true)
    try {
      await dadosOS.mudarStatus(id, 'entregue')
      toast.sucesso('Entregue.')
      setModalEntregar(false)
      await carregar()
      setTimeout(() => window.print(), 50)
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function cancelar() {
    if (!id || motivoCancel.trim().length < 3) return
    setSalvando(true)
    try {
      await dadosOS.mudarStatus(id, 'cancelada', motivoCancel)
      toast.sucesso(`${numeroOS(os.numero)} cancelada.`)
      setModalCancelar(false)
      await carregar()
    } catch (er) { setErro((er as Error).message) } finally { setSalvando(false) }
  }

  async function copiarMensagem() {
    let texto = ''
    if (os.status === 'aguardando_aprovacao') texto = mensagemOrcado(os, totalReais)
    else if (os.status === 'pronta') texto = mensagemPronta({ ...os, garantia_dias: garantiaDias }, totalReais)
    try {
      await navigator.clipboard.writeText(texto)
      toast.sucesso('Mensagem copiada. Cole no WhatsApp do cliente.')
    } catch { toast.erro('Não foi possível copiar.') }
  }

  const proximo = proximoStatus(os.status)
  const CADEIA: StatusOS[] = ['aberta','em_diagnostico','aguardando_aprovacao','aprovada','em_execucao','pronta','entregue']
  const posteriores: StatusOS[] = (os.status === 'entregue' || os.status === 'cancelada') ? [] : CADEIA.slice(CADEIA.indexOf(os.status) + 1)

  const faltam = ((): number => {
    const pago = detalhe.pagamentos.reduce((s: number, p: { valor: number }) => s + Math.round(p.valor * 100), 0)
    return Math.max(0, totalCentavos - pago)
  })()

  const dica = dicaGarantiaSugerida(itens)

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo={numeroOS(os.numero)}
        subtitulo={`${os.cliente_nome} · ${os.aparelho_tipo ?? ''} ${os.aparelho_marca_modelo ?? ''}`.trim()}
        acoes={
          <>
            <button type="button" className="btn btn-secundario" onClick={() => window.print()} aria-label="Imprimir comprovante de recebimento"><Printer className="size-4" /></button>
            {(os.status === 'aguardando_aprovacao' || os.status === 'pronta') && (
              <button type="button" className="btn btn-secundario" onClick={copiarMensagem} aria-label={os.status === 'aguardando_aprovacao' ? 'Copiar mensagem do orçamento' : 'Copiar mensagem de aparelho pronto'}><Copy className="size-4" /></button>
            )}
            {pode.cancelarOrdem && os.status !== 'entregue' && os.status !== 'cancelada' && (
              <button type="button" className="btn btn-perigo" onClick={() => setModalCancelar(true)}>Cancelar</button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{STATUS_OS[os.status]}</span>
        {os.prazo_prometido && os.prazo_prometido < new Date().toISOString().slice(0,10) && os.status !== 'entregue' && os.status !== 'cancelada' && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Atrasada</span>
        )}
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {/* Próximo passo */}
      {proximo && podeMover && os.status !== 'pronta' && (
        <div className="cartao p-4">
          <button type="button" className="btn btn-primario w-full" disabled={salvando} onClick={() => avancarStatus(proximo)}>
            {ROTULO_BOTAO[os.status] ?? 'Avançar'}
          </button>
          <button type="button" className="btn btn-fantasma mt-2 w-full text-xs" onClick={() => setModalAvancar(true)}>Avançar para outro status</button>
        </div>
      )}
      {os.status === 'pronta' && (
        <div className="cartao p-4 text-sm text-slate-600">A entrega e o pagamento ficam na seção abaixo.</div>
      )}

      {/* Timeline */}
      <section className="cartao p-4">
        <h2 className="text-sm font-semibold text-ponto">Histórico da OS</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {[
            { rotulo: 'Recebida', data: os.criado_em, extra: '' },
            { rotulo: 'Orçamento enviado', data: os.orcado_em, extra: '' },
            { rotulo: 'Orçamento aprovado', data: os.aprovada_em, extra: os.aprovada_por_nome ? `por ${os.aprovada_por_nome}` : '' },
            { rotulo: 'Pronta', data: os.pronta_em, extra: '' },
            { rotulo: 'Entregue', data: os.entregue_em, extra: os.entregue_por_nome ? `por ${os.entregue_por_nome}` : '' },
            { rotulo: 'Cancelada', data: os.cancelada_em, extra: os.motivo_cancelamento ?? '' },
          ].map(m => (
            <li key={m.rotulo} className="flex items-center gap-2">
              <span className={cx('size-2 rounded-full', m.data ? 'bg-emerald-500' : 'bg-slate-300')} />
              <span className={m.data ? 'font-medium text-slate-800' : 'text-slate-400'}>{m.rotulo}</span>
              {m.data && <span className="text-xs text-slate-500">{formatarData(m.data.slice(0,10))}</span>}
              {m.extra && <span className="text-xs text-slate-500">{m.extra}</span>}
              {!m.data && os.status !== 'cancelada' && m.rotulo !== 'Cancelada' && <span className="text-xs text-slate-400">Pendente</span>}
            </li>
          ))}
        </ol>
      </section>

      {/* Diagnóstico */}
      <section className="cartao space-y-3 p-4">
        <h2 className="text-sm font-semibold text-ponto">Diagnóstico</h2>
        <div className="text-sm text-slate-700 space-y-1">
          <p><strong>Cliente:</strong> {os.cliente_nome}{os.cliente_telefone ? ` · ${os.cliente_telefone}` : ''}</p>
          <p><strong>Aparelho:</strong> {os.aparelho_tipo} {os.aparelho_marca_modelo}</p>
          {os.aparelho_serie_imei && <p><strong>IMEI:</strong> <span className="font-mono">{os.aparelho_serie_imei}</span></p>}
          {os.aparelho_cor && <p><strong>Cor:</strong> {os.aparelho_cor}</p>}
          <p><strong>Senha:</strong>{' '}
            <button type="button" className="text-marca-escura underline" onClick={() => setMostrarSenha(s => !s)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
              {mostrarSenha ? (os.aparelho_senha || '—') : '••••••'}
            </button>
          </p>
          {os.aparelho_acessorios && <p><strong>Acessórios:</strong> {os.aparelho_acessorios}</p>}
          {os.aparelho_estado && <p><strong>Estado:</strong> {os.aparelho_estado}</p>}
        </div>
        <div>
          <label className="rotulo" htmlFor="defeito">Defeito relatado</label>
          <textarea id="defeito" className="campo" rows={2} value={defeitoTxt} onChange={e => setDefeitoTxt(e.target.value)} disabled={travado || !podeMover} />
        </div>
        <div>
          <label className="rotulo" htmlFor="diagnostico">Diagnóstico</label>
          <textarea id="diagnostico" className="campo" rows={2} value={diagnosticoTxt} onChange={e => setDiagnosticoTxt(e.target.value)} disabled={travado || !podeMover} />
        </div>
        {podeMover && !travado && (
          <button type="button" className="btn btn-secundario" disabled={salvando} onClick={salvarDiagnostico}>Salvar diagnóstico</button>
        )}
      </section>

      {/* Orçamento */}
      <section className="cartao space-y-3 p-4">
        <h2 className="text-sm font-semibold text-ponto">Orçamento</h2>
        {travado && <Aviso tom="alerta">Orçamento aprovado pelo cliente: itens, mão de obra e desconto não podem mais mudar.</Aviso>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="mao-obra">Mão de obra (R$)</label>
            <input id="mao-obra" className="campo" inputMode="decimal" value={maoObra} onChange={e => setMaoObra(Number(e.target.value.replace(',', '.')) || 0)} disabled={travado || !podeMover} />
          </div>
          <div>
            <label className="rotulo" htmlFor="desconto">Desconto (R$)</label>
            <input id="desconto" className="campo" inputMode="decimal" value={desconto} onChange={e => setDesconto(Number(e.target.value.replace(',', '.')) || 0)} disabled={travado || !podeMover} />
          </div>
        </div>

        <div className="space-y-2">
          {itens.map((it, idx) => (
            <div key={it.id ?? idx} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', it.origem === 'estoque' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700')}>{it.origem === 'estoque' ? 'Estoque' : 'Avulsa'}</span>
              <span className="flex-1 truncate">{it.descricao}</span>
              <span className="tabular-nums">{it.quantidade} × {formatarReais(it.preco_unitario)}</span>
              {!travado && podeMover && (
                <button type="button" className="text-red-600" aria-label={`Remover ${it.descricao}`} onClick={() => setItens(prev => prev.filter((_, i) => i !== idx))}>✕</button>
              )}
            </div>
          ))}
        </div>

        {!travado && podeMover && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secundario" onClick={() => setModalBusca(true)}>Adicionar peça do estoque</button>
            <button type="button" className="btn btn-secundario" onClick={() => {
              const desc = window.prompt('Descrição do item avulso')
              if (!desc) return
              const qtd = Number(window.prompt('Quantidade', '1')?.replace(',', '.') || '1')
              const preco = Number(window.prompt('Preço unitário (R$)', '0')?.replace(',', '.') || '0')
              setItens(prev => [...prev, { id: `tmp-${Date.now()}`, os_id: os.id, ordem: prev.length + 1, origem: 'avulsa', produto_id: null, descricao: desc, quantidade: qtd, preco_unitario: preco, total: qtd * preco, baixado_em: null, garantia_meses: null }])
            }}>Adicionar item avulso</button>
          </div>
        )}

        <div className="border-t border-slate-200 pt-2 text-sm">
          <p>Subtotal (mão de obra + itens): {formatarReais((itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0) + maoObra))}</p>
          <p>Desconto: {formatarReais(desconto)}</p>
          <p className="font-semibold">Total: {formatarReais(totalReais)}</p>
        </div>

        {!travado && podeMover && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-primario" disabled={salvando} onClick={salvarOrcamento}>Salvar orçamento</button>
          </div>
        )}
      </section>

      {/* Garantia (quando pronta) */}
      {os.status === 'pronta' && (
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm font-semibold text-ponto">Garantia (dias)</h2>
          <input className="campo" inputMode="numeric" value={garantiaDias ?? ''} onChange={e => setGarantiaDias(e.target.value.trim() ? Number(e.target.value) : null)} />
          <p className="text-xs text-slate-500">{dica}</p>
          {garantiaDias !== os.garantia_dias && (
            <button type="button" className="btn btn-secundario" onClick={() => dadosOS.salvarOrdem(os.id, { garantia_dias: garantiaDias }).then(() => { toast.sucesso('Garantia salva.'); carregar() })}>Salvar garantia</button>
          )}
        </section>
      )}

      {/* Entrega + pagamento */}
      {podeEntregar && (
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm font-semibold text-ponto">Entrega e pagamento</h2>
          <div className="text-sm">
            <p>Itens: {formatarReais(itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0))}</p>
            <p>Mão de obra: {formatarReais(maoObra)}</p>
            <p>Desconto: {formatarReais(desconto)}</p>
            <p className="font-semibold">Total: {formatarReais(totalReais)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="cartao p-2 text-center"><strong>Total</strong><br />{formatarReais(totalReais)}</div>
            <div className="cartao p-2 text-center"><strong>Pago</strong><br />{formatarReais(detalhe.pagamentos.reduce((s, p) => s + p.valor, 0))}</div>
            <div className="cartao p-2 text-center"><strong>{faltam > 0 ? 'Falta' : 'Tudo pago'}</strong><br />{formatarReais(faltam / 100)}</div>
          </div>
          {detalhe.pagamentos.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {detalhe.pagamentos.map(p => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>{(NOME_FORMA as Record<string, string>)[p.forma] ?? p.forma} · {formatarReais(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-5 gap-1">
            {Object.entries(NOME_FORMA as Record<string, string>).map(([k, v]) => (
              <button key={k} type="button" className={cx('rounded-lg border px-2 py-2 text-xs', forma === k ? 'border-ponto bg-ponto text-white' : 'border-slate-200 bg-white')} onClick={() => setForma(k)}>{v}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="campo flex-1" inputMode="decimal" placeholder="Valor recebido (deixe vazio para o que falta)" value={valorPag} onChange={e => setValorPag(e.target.value)} />
            <button type="button" className="btn btn-secundario" disabled={salvando} onClick={registrarPagamento}>Registrar pagamento</button>
          </div>
          {Number(valorPag.replace(',', '.')) > totalReais && Number(valorPag.replace(',', '.')) > 0 && (
            <p className="text-xs text-amber-700">O total registrado passou do valor da OS. Dê o troco em dinheiro.</p>
          )}
          <button type="button" className="btn btn-primario btn-grande w-full" disabled={salvando || faltam > 0} onClick={() => setModalEntregar(true)}>Entregar</button>
        </section>
      )}

      {os.status === 'entregue' && (
        <section className="cartao p-4 text-sm text-slate-600">
          Entregue em {os.entregue_em ? formatarData(os.entregue_em.slice(0, 10)) : ''} por {os.entregue_por_nome}.
          <button type="button" className="btn btn-secundario ml-2" onClick={() => window.print()} aria-label="Imprimir recibo"><Printer className="size-4" /></button>
        </section>
      )}

      {/* Recibo de entrega (impresso) */}
      {os.status === 'entregue' && (
        <div className="cupom-impressao" data-recibo-os={String(os.numero).padStart(6, '0')}>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{empresa.nome}</div>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>*** DOCUMENTO SEM VALOR FISCAL ***</div>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>{numeroOS(os.numero)}</div>
          <hr />
          {itens.map(it => (
            <div key={it.id}>{it.descricao} · {it.quantidade} × {formatarReais(it.preco_unitario)} = {formatarReais(it.total)}</div>
          ))}
          <hr />
          <div><strong>TOTAL {formatarReais(totalReais)}</strong></div>
          {detalhe.pagamentos.map(p => <div key={p.id}>{(NOME_FORMA as Record<string, string>)[p.forma] ?? p.forma}: {formatarReais(p.valor)}</div>)}
          {os.garantia_dias !== null && <div><strong>Garantia até {formatarData(new Date(Date.now() + (os.garantia_dias ?? 0) * 86400000).toISOString().slice(0, 10))}</strong></div>}
          <hr />
          <div style={{ fontSize: 10 }}>O aparelho foi entregue funcionando. A garantia cobre o conserto realizado e não cobre mal uso, queda ou água.</div>
          <div style={{ fontSize: 10 }}>Obrigado pela preferência!</div>
        </div>
      )}

      {/* Modal avançar */}
      <Modal aberto={modalAvancar} aoFechar={() => setModalAvancar(false)} titulo="Avançar status">
        <div className="space-y-2">
          {posteriores.map((s: StatusOS) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name="status" value={s} checked={avancoStatus === s} onChange={() => setAvancoStatus(s)} />
              {STATUS_OS[s]}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalAvancar(false)}>Voltar</button>
          <button type="button" className="btn btn-primario flex-1" disabled={!avancoStatus || salvando} onClick={() => avancoStatus && avancarStatus(avancoStatus)}>Avançar</button>
        </div>
      </Modal>

      {/* Modal cancelar */}
      <Modal aberto={modalCancelar} aoFechar={() => setModalCancelar(false)} titulo="Cancelar ordem de serviço">
        <p className="text-sm text-slate-600">A OS fica registrada como Cancelada, com o seu nome, e não pode mais ser alterada.</p>
        <label className="rotulo" htmlFor="motivo">Motivo *</label>
        <textarea id="motivo" className="campo" rows={3} placeholder="Ex.: cliente não aprovou o orçamento" value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} />
        {motivoCancel.trim().length > 0 && motivoCancel.trim().length < 3 && <p className="text-xs text-red-600">Descreva o motivo (mínimo de 3 letras).</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalCancelar(false)}>Voltar</button>
          <button type="button" className="btn btn-perigo flex-1" disabled={salvando || motivoCancel.trim().length < 3} onClick={cancelar}>Cancelar OS</button>
        </div>
      </Modal>

      {/* Modal entregar */}
      <Modal aberto={modalEntregar} aoFechar={() => setModalEntregar(false)} titulo="Entregar">
        <p className="text-sm text-slate-600">Entregar o aparelho para {os.cliente_nome}? As peças do estoque são baixadas agora e a OS {numeroOS(os.numero)} não pode mais ser alterada.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secundario flex-1" onClick={() => setModalEntregar(false)}>Voltar</button>
          <button type="button" className="btn btn-primario flex-1" disabled={salvando} onClick={entregar}>Entregar</button>
        </div>
      </Modal>

      {/* Modal busca peça */}
      <Modal aberto={modalBusca} aoFechar={() => setModalBusca(false)} titulo="Adicionar peça do estoque">
        <BuscaProduto aoSelecionar={p => {
          setItens(prev => [...prev, { id: `tmp-${Date.now()}`, os_id: os.id, ordem: prev.length + 1, origem: 'estoque', produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unitario: p.preco_venda ?? 0, total: (p.preco_venda ?? 0), baixado_em: null, garantia_meses: p.garantia_meses }])
          setModalBusca(false)
        }} />
      </Modal>
    </div>
  )
}