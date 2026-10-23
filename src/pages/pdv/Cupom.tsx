import { createPortal } from 'react-dom'
import { formatarDataHora, formatarNumero } from '../../lib/formato'
import { NOME_FORMA, type FormaPagamento } from '../../pdv/venda'

export interface DadosCupom {
  empresa: string
  loja: string | null
  documento: string | null
  caixa: string
  numeroExibicao: string
  operador: string
  ocorridoEm: string
  cancelada?: boolean
  venda: {
    subtotal: number
    desconto: number
    total: number
    troco: number
    cliente_cpf?: string | null
    itens: { descricao: string; quantidade: number; unidade: string; preco_unitario: number; desconto: number; total: number }[]
    pagamentos: { forma: string; valor: number }[]
  }
}

const reais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Cupom de 80 mm, impresso pela impressão do navegador (Ctrl+P / window.print).
 * Fica escondido na tela e é o único conteúdo na impressão (ver index.css).
 * Não é documento fiscal: a NFC-e vem na fase fiscal.
 */
export function Cupom({ dados }: { dados: DadosCupom | null }) {
  if (!dados) return null
  const v = dados.venda
  return createPortal(
    <div className="cupom-impressao" data-cupom>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{dados.empresa}</div>
      {dados.loja && <div style={{ textAlign: 'center' }}>{dados.loja}</div>}
      {dados.documento && <div style={{ textAlign: 'center' }}>CNPJ/CPF {dados.documento}</div>}
      <div style={{ textAlign: 'center', margin: '4px 0', fontWeight: 700 }}>*** DOCUMENTO SEM VALOR FISCAL ***</div>
      {dados.cancelada && <div style={{ textAlign: 'center', fontWeight: 700 }}>*** VENDA CANCELADA ***</div>}
      <div>Venda {dados.numeroExibicao} · {dados.caixa}</div>
      <div>{formatarDataHora(dados.ocorridoEm)} · {dados.operador}</div>
      {v.cliente_cpf && <div>CPF na nota: {v.cliente_cpf}</div>}
      <hr style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      {v.itens.map((i, k) => (
        <div key={k} style={{ marginBottom: 2 }}>
          <div>{String(k + 1).padStart(3, '0')} {i.descricao}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {formatarNumero(i.quantidade)} {i.unidade} x {reais(i.preco_unitario)}
              {i.desconto > 0 && ` (-${reais(i.desconto)})`}
            </span>
            <span>{reais(i.total)}</span>
          </div>
        </div>
      ))}
      <hr style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      {v.desconto > 0 && (
        <>
          <Linha rotulo="Subtotal" valor={reais(v.subtotal)} />
          <Linha rotulo="Desconto" valor={`-${reais(v.desconto)}`} />
        </>
      )}
      <Linha rotulo="TOTAL R$" valor={reais(v.total)} forte />
      {v.pagamentos.map((p, k) => (
        <Linha key={k} rotulo={NOME_FORMA[p.forma as FormaPagamento] ?? p.forma} valor={reais(p.valor)} />
      ))}
      {v.troco > 0 && <Linha rotulo="Troco" valor={reais(v.troco)} />}
      <hr style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div style={{ textAlign: 'center' }}>Obrigado pela preferência!</div>
    </div>,
    document.body,
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: forte ? 700 : 400, fontSize: forte ? 13 : undefined }}>
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  )
}
