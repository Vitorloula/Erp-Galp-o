import { useEffect, useRef, useState } from 'react'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { NOME_TIPO, arred, formatarDataHora, formatarDelta, formatarQtd, formatarValidade } from '../lib/formato'
import type { Movimentacao } from '../lib/tipos'
import { CampoQuantidade } from './CampoQuantidade'
import { useToast } from './Toast'
import { Aviso, Carregando, Modal } from './ui'

interface Props {
  movimentacao: Movimentacao | null
  aoFechar: () => void
}

/**
 * Corrige um lançamento SEM alterar o passado: informa-se a quantidade correta e o
 * sistema lança uma movimentação de CORREÇÃO com a diferença, vinculada ao original.
 */
export function CorrecaoModal({ movimentacao, aoFechar }: Props) {
  if (!movimentacao) return null
  return <Conteudo m={movimentacao} aoFechar={aoFechar} />
}

function Conteudo({ m, aoFechar }: { m: Movimentacao; aoFechar: () => void }) {
  const { produtoPorId, lotePorId, recarregar } = useDados()
  const { empresa, loja } = useAtiva()
  const origem = useRef(crypto.randomUUID())
  const toast = useToast()
  const produto = produtoPorId.get(m.produto_id)
  const lote = lotePorId.get(m.lote_id)
  const [efeitoAtual, setEfeitoAtual] = useState<number | null>(null)
  const [correta, setCorreta] = useState<number | null>(null)
  const [zerar, setZerar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Efeito atual = lançamento original + correções já feitas sobre ele.
  useEffect(() => {
    movimentos
      .listarMovimentacoes(empresa.empresa_id, loja.id, { referenciaId: m.id })
      .then(cs => setEfeitoAtual(arred(m.delta + cs.reduce((s, c) => s + c.delta, 0))))
      .catch(e => setErro((e as Error).message))
  }, [m, empresa.empresa_id, loja.id])

  if (!produto) return null
  const sinal = m.tipo === 'SAIDA' ? -1 : 1
  const quantidadeCorreta = zerar ? 0 : correta
  const diferenca = efeitoAtual === null || quantidadeCorreta === null ? null : arred(sinal * quantidadeCorreta - efeitoAtual)
  const saldoLote = lote?.saldo ?? 0

  async function salvar() {
    setErro('')
    if (diferenca === null) return setErro('Informe a quantidade correta.')
    if (diferenca === 0) return setErro('A quantidade informada é igual à atual. Nada a corrigir.')
    if (motivo.trim().length < 3) return setErro('Descreva o motivo da correção.')
    setSalvando(true)
    try {
      const id = await movimentos.registrarCorrecao(
        empresa.empresa_id,
        loja.id,
        { loteId: m.lote_id, quantidade: diferenca, observacao: motivo.trim(), referenciaId: m.id },
        origem.current,
      )
      await recarregar()
      toast.sucesso(`Correção #${id} registrada (${formatarDelta(diferenca, produto!.unidade)}).`)
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Corrigir lançamento #${m.id}`}
      rodape={
        <>
          <button className="btn btn-secundario flex-1" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario flex-1" onClick={salvar} disabled={salvando || diferenca === null || diferenca === 0}>
            {salvando ? 'Registrando...' : 'Registrar correção'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-900">{produto.nome}</p>
          <p className="text-slate-600">
            {NOME_TIPO[m.tipo]} de <strong>{formatarQtd(m.quantidade, produto.unidade)}</strong> em {formatarDataHora(m.ocorrido_em)}
          </p>
          <p className="text-slate-500">
            {lote?.lote ? `Lote ${lote.lote}` : 'Sem lote'} · val. {formatarValidade(lote?.validade)} · por {m.usuario_nome ?? '—'}
          </p>
          {efeitoAtual !== null && efeitoAtual !== m.delta && (
            <p className="mt-1 text-amber-800">Já corrigido antes: efeito atual {formatarDelta(efeitoAtual, produto.unidade)}.</p>
          )}
        </div>

        {efeitoAtual === null && !erro ? (
          <Carregando texto="Verificando correções anteriores..." />
        ) : (
          <>
            <Aviso tom="info">O lançamento original continua no histórico. Será criado um novo lançamento de correção com a diferença.</Aviso>
            {!zerar && <CampoQuantidade produto={produto} aoMudar={setCorreta} rotulo={`Quantidade correta da ${NOME_TIPO[m.tipo].toLowerCase()}`} id="qtd-correta" autoFocus />}
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <input type="checkbox" className="size-4.5 accent-marca" checked={zerar} onChange={e => setZerar(e.target.checked)} />
              Estornar totalmente (o lançamento não deveria ter existido)
            </label>
            {diferenca !== null && diferenca !== 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                Correção de <strong>{formatarDelta(diferenca, produto.unidade)}</strong> no lote. Saldo do lote:{' '}
                <strong>{formatarQtd(saldoLote, produto.unidade)}</strong> → <strong>{formatarQtd(arred(saldoLote + diferenca), produto.unidade)}</strong>
              </div>
            )}
            <div>
              <label className="rotulo" htmlFor="motivo">Motivo da correção *</label>
              <textarea id="motivo" className="campo min-h-20" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: digitei 60 em vez de 40" />
            </div>
          </>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
