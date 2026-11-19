import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero, somarDias } from '../lib/formato'
import { numeroOS, STATUS_OS } from '../lib/servicos'
import { formatarReais, NOME_FORMA } from '../pdv/venda'
import type { ItemOS, Loja, PagamentoOS, StatusOS } from '../lib/tipos'

export type TipoImpressaoOS = 'comprovante' | 'orcamento' | 'recibo'

/**
 * Tudo o que o cupom da OS precisa, já normalizado pela tela de origem — o
 * recebimento ainda não tem OS salva e o detalhe tem os itens em edição.
 */
export interface DadosImpressaoOS {
  tipo: TipoImpressaoOS
  numero: number
  criadoEm: string
  status: StatusOS | null
  cliente: { nome: string; telefone: string | null; documento: string | null }
  aparelho: {
    tipo: string | null
    marcaModelo: string | null
    serie: string | null
    cor: string | null
    acessorios: string | null
    estado: string | null
  }
  defeito: string | null
  diagnostico: string | null
  prazo: string | null
  tecnico: string | null
  recebidoPor: string | null
  itens: ItemOS[]
  /** Mão de obra e desconto em reais; total em centavos. */
  maoDeObra: number
  desconto: number
  total: number
  pagamentos: PagamentoOS[]
  entregueEm: string | null
  entreguePor: string | null
  garantiaDias: number | null
  motivoCancelamento: string | null
  empresa: string
  loja: Loja | null
}

const TITULO: Record<TipoImpressaoOS, string> = {
  comprovante: 'COMPROVANTE DE RECEBIMENTO',
  orcamento: 'ORÇAMENTO',
  recibo: 'RECIBO DE ENTREGA',
}

const linha = <hr style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

/**
 * Cupom da OS (80 mm), impresso pelo navegador. Vai direto no <body> via portal:
 * o CSS de impressão esconde todos os filhos do <body> que não sejam
 * `.cupom-impressao` — dentro do #root o cupom sairia em branco (ver index.css).
 */
export function ImpressaoOS({ dados }: { dados: DadosImpressaoOS | null }) {
  if (!dados) return null
  const atributos =
    dados.tipo === 'recibo'
      ? { 'data-recibo-os': String(dados.numero).padStart(6, '0') }
      : dados.tipo === 'orcamento'
        ? { 'data-orcamento-os': String(dados.numero).padStart(6, '0') }
        : { 'data-comprovante-os': String(dados.numero).padStart(6, '0') }

  return createPortal(
    <div className="cupom-impressao" {...atributos}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{dados.empresa}</div>
      {dados.loja && <div style={{ textAlign: 'center' }}>{dados.loja.nome}</div>}
      {dados.loja?.cnpj && <div style={{ textAlign: 'center' }}>CNPJ {dados.loja.cnpj}</div>}
      {dados.loja?.endereco && <div style={{ textAlign: 'center' }}>{dados.loja.endereco}{dados.loja.uf ? ` — ${dados.loja.uf}` : ''}</div>}
      <div style={{ textAlign: 'center', fontWeight: 700 }}>*** DOCUMENTO SEM VALOR FISCAL ***</div>
      {dados.status === 'cancelada' && <div style={{ textAlign: 'center', fontWeight: 700 }}>*** OS CANCELADA ***</div>}
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{TITULO[dados.tipo]}</div>
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{numeroOS(dados.numero)}</div>
      <div style={{ textAlign: 'center', fontSize: 10 }}>{formatarDataHora(dados.criadoEm)}</div>
      {linha}

      <div>CLIENTE: {dados.cliente.nome}</div>
      {dados.cliente.telefone && <div>TELEFONE: {dados.cliente.telefone}</div>}
      {dados.cliente.documento && <div>CPF/CNPJ: {dados.cliente.documento}</div>}
      <div>
        APARELHO: {[dados.aparelho.tipo, dados.aparelho.marcaModelo].filter(Boolean).join(' ') || '—'}
      </div>
      {dados.aparelho.serie && <div>IMEI/SÉRIE: {dados.aparelho.serie}</div>}
      {dados.aparelho.cor && <div>COR: {dados.aparelho.cor}</div>}

      {dados.tipo === 'comprovante' && (
        <>
          <div>ACESSÓRIOS: {dados.aparelho.acessorios || 'Nenhum'}</div>
          {dados.aparelho.estado && <div>ESTADO: {dados.aparelho.estado}</div>}
          {dados.defeito && <div>DEFEITO: {dados.defeito}</div>}
          <div>PRAZO: {dados.prazo ? formatarData(dados.prazo) : 'A combinar'}</div>
          {dados.tecnico && <div>TÉCNICO: {dados.tecnico}</div>}
          <div>Recebido por: {dados.recebidoPor || '—'}</div>
          {linha}
          <div style={{ fontWeight: 700 }}>TERMO DE RESPONSABILIDADE</div>
          <div style={{ fontSize: 10 }}>
            Declaro que deixei para conserto o aparelho descrito acima, no estado de conservação indicado, e que os acessórios
            listados foram entregues com ele. Não nos responsabilizamos por dados, arquivos ou senhas armazenados no aparelho,
            que podem ser perdidos durante o conserto. O serviço só começa após a aprovação do orçamento.
          </div>
          <div>Assinatura do cliente: ______________</div>
          <div>Assinatura da loja: ______________</div>
        </>
      )}

      {dados.tipo === 'orcamento' && (
        <>
          {dados.defeito && <div>DEFEITO: {dados.defeito}</div>}
          {dados.diagnostico && <div>DIAGNÓSTICO: {dados.diagnostico}</div>}
          {linha}
          {dados.itens.length === 0 && <div>Sem peças no orçamento.</div>}
          {dados.itens.map((it, idx) => (
            <div key={it.id ?? idx}>
              {it.descricao} · {formatarNumero(it.quantidade)} × {formatarMoeda(it.preco_unitario)} = {formatarMoeda(it.total)}
            </div>
          ))}
          {linha}
          <div>Mão de obra: {formatarMoeda(dados.maoDeObra)}</div>
          {dados.desconto > 0 && <div>Desconto: {formatarMoeda(dados.desconto)}</div>}
          <div style={{ fontWeight: 700, fontSize: 13 }}>TOTAL {formatarReais(dados.total)}</div>
          <div>PRAZO: {dados.prazo ? formatarData(dados.prazo) : 'A combinar'}</div>
          <div style={{ fontSize: 10 }}>O serviço só começa após a aprovação deste orçamento pelo cliente.</div>
        </>
      )}

      {dados.tipo === 'recibo' && (
        <>
          {dados.itens.length > 0 && (
            <>
              {linha}
              {dados.itens.map((it, idx) => (
                <div key={it.id ?? idx}>
                  {it.descricao} · {formatarNumero(it.quantidade)} × {formatarMoeda(it.preco_unitario)} = {formatarMoeda(it.total)}
                </div>
              ))}
            </>
          )}
          {linha}
          <div>Mão de obra: {formatarMoeda(dados.maoDeObra)}</div>
          {dados.desconto > 0 && <div>Desconto: {formatarMoeda(dados.desconto)}</div>}
          <div style={{ fontWeight: 700, fontSize: 13 }}>TOTAL {formatarReais(dados.total)}</div>
          {dados.pagamentos.map(p => (
            <div key={p.id}>
              {(NOME_FORMA as Record<string, string>)[p.forma] ?? p.forma}: {formatarMoeda(p.valor)}
            </div>
          ))}
          {garantiaAte(dados) && (
            <div style={{ fontWeight: 700 }}>Garantia até {formatarData(garantiaAte(dados)!)}</div>
          )}
          {dados.garantiaDias === 0 && <div style={{ fontWeight: 700 }}>Sem garantia</div>}
          <div style={{ fontSize: 10 }}>
            Entregue em {dados.entregueEm ? formatarData(dados.entregueEm.slice(0, 10)) : '—'}
            {dados.entreguePor ? ` por ${dados.entreguePor}` : ''}.
          </div>
          {linha}
          <div style={{ fontSize: 10 }}>
            O aparelho foi entregue funcionando. A garantia cobre o conserto realizado e não cobre mal uso, queda ou água.
          </div>
          <div style={{ fontSize: 10 }}>Obrigado pela preferência!</div>
        </>
      )}

      {dados.status === 'cancelada' && dados.motivoCancelamento && (
        <div style={{ fontSize: 10 }}>Motivo do cancelamento: {dados.motivoCancelamento}</div>
      )}
    </div>,
    document.body,
  )
}

/** Data final da garantia: entrega + dias concedidos (0 = sem garantia; null = não informada). */
function garantiaAte(dados: DadosImpressaoOS): string | null {
  if (!dados.entregueEm || dados.garantiaDias === null || dados.garantiaDias === undefined || dados.garantiaDias <= 0) return null
  return somarDias(dados.entregueEm.slice(0, 10), dados.garantiaDias)
}

/**
 * Dispara a impressão depois que o cupom já está no DOM (portal) e evita o
 * disparo duplo do React em StrictMode: o pedido é impresso uma única vez.
 */
export function useImpressaoAutomatica(pedido: number) {
  const impresso = useRef(0)
  useEffect(() => {
    if (!pedido) return
    const id = requestAnimationFrame(() => {
      if (impresso.current === pedido) return
      impresso.current = pedido
      window.print()
    })
    return () => cancelAnimationFrame(id)
  }, [pedido])
}

/** Status legível para o cupom (usado na tela para montar o cabeçalho). */
export const rotuloStatusOS = (status: StatusOS) => STATUS_OS[status]
