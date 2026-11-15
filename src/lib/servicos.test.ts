import { describe, expect, it } from 'vitest'
import { formatarData, hojeISO, somarDias } from './formato'
import {
  dicaGarantiaSugerida,
  faltamPagamentos,
  gruposDaAgenda,
  grupoDaAgenda,
  mensagemOrcado,
  mensagemPronta,
  montarTotalOS,
  normalizarNumeroOS,
  osCombina,
  podeMudarStatus,
  proximoStatus,
  statusPosteriores,
  sugerirGarantia,
  atrasada,
} from './servicos'
import type { ItemOS, OS, StatusOS } from './tipos'

const item = (extra: Partial<ItemOS> = {}): ItemOS => ({
  id: 'i1',
  os_id: 'os1',
  ordem: 1,
  origem: 'estoque',
  produto_id: 'p1',
  descricao: 'Tela iPhone 12',
  quantidade: 1,
  preco_unitario: 450,
  total: 450,
  baixado_em: null,
  garantia_meses: null,
  ...extra,
})

const os = (extra: Partial<OS> = {}): OS => ({
  id: 'os1',
  loja_id: 'loja1',
  numero: 123,
  status: 'aberta',
  cliente_nome: 'Maria Souza',
  cliente_telefone: '(11) 99999-0000',
  cliente_documento: null,
  aparelho_tipo: 'Celular',
  aparelho_marca_modelo: 'Samsung Galaxy A54',
  aparelho_serie_imei: '354899109583011',
  aparelho_cor: null,
  aparelho_senha: null,
  aparelho_acessorios: 'capa',
  aparelho_estado: 'riscado',
  defeito_relatado: 'não liga',
  diagnostico: null,
  prazo_prometido: null,
  valor_mao_de_obra: 100,
  desconto: 0,
  garantia_dias: null,
  tecnico_id: null,
  tecnico_nome: null,
  criado_em: '2026-11-15T12:00:00Z',
  criado_por_nome: 'Ana',
  orcado_em: null,
  aprovada_em: null,
  aprovada_por_nome: null,
  pronta_em: null,
  entregue_em: null,
  entregue_por_nome: null,
  cancelada_em: null,
  cancelada_por_nome: null,
  motivo_cancelamento: null,
  ...extra,
})

describe('serviços > transições de status', () => {
  it('avança livremente na cadeia (inclusive pulando passos)', () => {
    expect(podeMudarStatus('aberta', 'em_diagnostico')).toBe(true)
    expect(podeMudarStatus('aberta', 'entregue')).toBe(true)
    expect(podeMudarStatus('em_diagnostico', 'pronta')).toBe(true)
  })
  it('nunca volta na cadeia', () => {
    expect(podeMudarStatus('em_diagnostico', 'aberta')).toBe(false)
    expect(podeMudarStatus('pronta', 'em_execucao')).toBe(false)
    expect(podeMudarStatus('entregue', 'pronta')).toBe(false)
  })
  it('cancelada sai de qualquer status ativo; terminais não mudam', () => {
    for (const de of ['aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aprovada', 'em_execucao', 'pronta'] as StatusOS[]) {
      expect(podeMudarStatus(de, 'cancelada')).toBe(true)
    }
    expect(podeMudarStatus('entregue', 'cancelada')).toBe(false)
    expect(podeMudarStatus('cancelada', 'aberta')).toBe(false)
  })
  it('próximo passo natural e status posteriores do modal', () => {
    expect(proximoStatus('aberta')).toBe('em_diagnostico')
    expect(proximoStatus('em_execucao')).toBe('pronta')
    expect(proximoStatus('pronta')).toBe(null)
    expect(proximoStatus('entregue')).toBe(null)
    expect(statusPosteriores('em_diagnostico')).toEqual(['aguardando_aprovacao', 'aprovada', 'em_execucao', 'pronta', 'entregue'])
    expect(statusPosteriores('entregue')).toEqual([])
  })
})

describe('serviços > totais e pagamento', () => {
  it('total = itens + mão de obra − desconto, em centavos', () => {
    expect(montarTotalOS([item({ quantidade: 2, preco_unitario: 450 })], 100, 0)).toBe(100000)
    expect(montarTotalOS([item()], 80, 30)).toBe(50000)
    expect(montarTotalOS([], 100, 150)).toBe(0) // nunca negativo
    expect(montarTotalOS([item({ quantidade: 0.5, preco_unitario: 90 })], 0, 0)).toBe(4500)
  })
  it('quanto falta receber (pagamentos do banco vêm em reais)', () => {
    expect(faltamPagamentos(50000, [])).toBe(50000)
    expect(faltamPagamentos(50000, [{ valor: 350 }, { valor: 150 }])).toBe(0)
    expect(faltamPagamentos(50000, [{ valor: 470 }])).toBe(3000)
  })
})

describe('serviços > atrasada', () => {
  const hoje = hojeISO()
  it('prazo vencido e OS em aberto', () => {
    expect(atrasada(os({ prazo_prometido: somarDias(hoje, -1), status: 'pronta' }), hoje)).toBe(true)
    expect(atrasada(os({ prazo_prometido: somarDias(hoje, 3) }), hoje)).toBe(false)
    expect(atrasada(os({ prazo_prometido: somarDias(hoje, -5), status: 'entregue' }), hoje)).toBe(false)
    expect(atrasada(os({ prazo_prometido: somarDias(hoje, -5), status: 'cancelada' }), hoje)).toBe(false)
    expect(atrasada(os({ prazo_prometido: null }), hoje)).toBe(false)
  })
})

describe('serviços > agenda', () => {
  const hoje = '2026-11-15'
  it('cada OS cai no grupo certo', () => {
    expect(grupoDaAgenda(os({ status: 'aguardando_aprovacao' }), hoje)).toBe('orcamento')
    expect(grupoDaAgenda(os({ status: 'aprovada' }), hoje)).toBe('orcamento')
    expect(grupoDaAgenda(os({ status: 'aberta' }), hoje)).toBe('em_andamento')
    expect(grupoDaAgenda(os({ status: 'em_diagnostico' }), hoje)).toBe('em_andamento')
    expect(grupoDaAgenda(os({ status: 'em_execucao' }), hoje)).toBe('em_andamento')
    expect(grupoDaAgenda(os({ status: 'pronta' }), hoje)).toBe('prontas')
    expect(grupoDaAgenda(os({ status: 'entregue' }), hoje)).toBe(null)
    expect(grupoDaAgenda(os({ status: 'cancelada' }), hoje)).toBe(null)
  })
  it('atrasada ganha destaque, mesmo pronta', () => {
    expect(grupoDaAgenda(os({ status: 'pronta', prazo_prometido: '2026-11-10' }), hoje)).toBe('atrasadas')
    expect(grupoDaAgenda(os({ status: 'pronta', prazo_prometido: '2026-11-20' }), hoje)).toBe('prontas')
  })
  it('gruposDaAgenda agrupa e deixa entregue/cancelada fora', () => {
    const grupos = gruposDaAgenda(
      [
        os({ id: '1', status: 'aguardando_aprovacao', prazo_prometido: '2026-11-20' }),
        os({ id: '2', status: 'aberta', prazo_prometido: '2026-11-18' }),
        os({ id: '3', status: 'pronta', prazo_prometido: '2026-11-10' }),
        os({ id: '4', status: 'entregue', prazo_prometido: '2026-11-10' }),
        os({ id: '5', status: 'cancelada' }),
      ],
      hoje,
    )
    expect(grupos.orcamento.map(o => o.id)).toEqual(['1'])
    expect(grupos.em_andamento.map(o => o.id)).toEqual(['2'])
    expect(grupos.prontas.map(o => o.id)).toEqual([])
    expect(grupos.atrasadas.map(o => o.id)).toEqual(['3'])
  })
})

describe('serviços > garantia sugerida (por produto)', () => {
  it('maior garantia entre as peças (1 mês = 30 dias)', () => {
    expect(sugerirGarantia([item({ garantia_meses: 12 })])).toBe(360)
    expect(sugerirGarantia([item({ garantia_meses: 6 }), item({ garantia_meses: 12 })])).toBe(360)
    expect(sugerirGarantia([item({ garantia_meses: 6, origem: 'avulsa' }), item({ garantia_meses: 12 })])).toBe(360)
  })
  it('itens avulsos não contam; sem garantia configurada → 90 dias', () => {
    expect(sugerirGarantia([item({ origem: 'avulsa', garantia_meses: 12 })])).toBe(90)
    expect(sugerirGarantia([])).toBe(90)
    expect(sugerirGarantia([item()])).toBe(90)
  })
  it('garantia 0 configurada é respeitada (sem garantia)', () => {
    expect(sugerirGarantia([item({ garantia_meses: 0 })])).toBe(0)
    expect(sugerirGarantia([item({ garantia_meses: 0 }), item({ garantia_meses: 6 })])).toBe(180)
  })
  it('dica exata conforme a origem da sugestão', () => {
    expect(dicaGarantiaSugerida([item({ garantia_meses: 12 })])).toBe('Sugestão: maior garantia entre as peças (360 dias).')
    expect(dicaGarantiaSugerida([item()])).toBe('Nenhuma peça tem garantia configurada: sugeridos 90 dias.')
    expect(dicaGarantiaSugerida([item({ garantia_meses: 0 })])).toBe('Uma das peças está configurada sem garantia: sugeridos 0 dias.')
  })
})

describe('serviços > mensagens copiáveis', () => {
  const total = 55000
  it('orçado: base + prazo + telefone (4 combinações)', () => {
    const base = 'Olá, Maria Souza! O orçamento da OS 000123 (Celular Samsung Galaxy A54) ficou em R$ 550,00. Podemos começar o conserto?'
    expect(mensagemOrcado(os({ prazo_prometido: null, cliente_telefone: null }), total)).toBe(base)
    expect(mensagemOrcado(os({ prazo_prometido: '2026-11-20', cliente_telefone: null }), total)).toBe(
      `${base} Prazo prometido: 20/11/2026.`,
    )
    expect(mensagemOrcado(os({ prazo_prometido: null }), total)).toBe(`${base} Se preferir, fale com a loja pelo telefone (11) 99999-0000.`)
    expect(mensagemOrcado(os({ prazo_prometido: '2026-11-20' }), total)).toBe(
      `${base} Prazo prometido: 20/11/2026. Se preferir, fale com a loja pelo telefone (11) 99999-0000.`,
    )
  })
  it('pronta: garantia entra entre o total e "Pode retirar"', () => {
    const hoje = hojeISO()
    const semGarantia = 'Olá, Maria Souza! A OS 000123 (Celular Samsung Galaxy A54) está pronta. Total: R$ 550,00. Pode retirar quando puder.'
    expect(mensagemPronta(os({ garantia_dias: null }), total)).toBe(semGarantia)
    expect(mensagemPronta(os({ garantia_dias: 0 }), total)).toBe(semGarantia)
    expect(mensagemPronta(os({ garantia_dias: 90 }), total)).toBe(
      `Olá, Maria Souza! A OS 000123 (Celular Samsung Galaxy A54) está pronta. Total: R$ 550,00. Garantia até ${formatarData(somarDias(hoje, 90))}. Pode retirar quando puder.`,
    )
  })
})

describe('serviços > busca da lista', () => {
  it('"OS 000123", "000123" e "123" normalizam para o número', () => {
    expect(normalizarNumeroOS('OS 000123')).toBe('123')
    expect(normalizarNumeroOS('123')).toBe('123')
    expect(normalizarNumeroOS('Maria')).toBe('')
  })
  it('encontra por cliente, telefone, IMEI e número', () => {
    expect(osCombina(os(), 'maria souza')).toBe(true)
    expect(osCombina(os(), '99999-0000')).toBe(true)
    expect(osCombina(os(), '354899109583011')).toBe(true)
    expect(osCombina(os(), 'os 000123')).toBe(true)
    expect(osCombina(os(), 'não liga')).toBe(true)
    expect(osCombina(os(), 'Maria Souza Oliveira')).toBe(false)
    expect(osCombina(os(), '')).toBe(true)
  })
})
