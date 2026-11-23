import { describe, expect, it } from 'vitest'
import { conferirVenda, diasAte, nomeRegime, resumirConferencia, type EntradaConferencia } from './fiscal'

const base: EntradaConferencia = {
  crt: 1,
  total: 87.4,
  itens: 2,
  itensSemProduto: 0,
  itensSemNcm: 0,
  produtosSemNcm: [],
}

describe('conferência fiscal da venda', () => {
  it('venda completa e loja com regime fica pronta', () => {
    expect(conferirVenda(base)).toEqual({ situacao: 'pronta', pendencias: [] })
  })

  it('loja sem regime bloqueia a nota e explica em português de loja', () => {
    const r = conferirVenda({ ...base, crt: null })
    expect(r.situacao).toBe('bloqueada')
    expect(r.pendencias[0].tipo).toBe('regime')
    expect(r.pendencias[0].texto).toContain('paga imposto')
  })

  it('produto sem NCM deixa pendente, com os nomes dos produtos', () => {
    const r = conferirVenda({ ...base, itensSemNcm: 2, produtosSemNcm: ['Cabo HDMI', 'Pilha AA'] })
    expect(r.situacao).toBe('pendente')
    expect(r.pendencias).toHaveLength(1)
    expect(r.pendencias[0].tipo).toBe('ncm')
    expect(r.pendencias[0].texto).toContain('Cabo HDMI')
    expect(r.pendencias[0].texto).toContain('Pilha AA')
  })

  it('lista longa de produtos sem NCM é resumida', () => {
    const r = conferirVenda({ ...base, itensSemNcm: 4, produtosSemNcm: ['A', 'B', 'C', 'D'] })
    expect(r.pendencias[0].texto).toContain('A, B, C…')
  })

  it('produto excluído do cadastro também deixa pendente', () => {
    const r = conferirVenda({ ...base, itensSemProduto: 1 })
    expect(r.situacao).toBe('pendente')
    expect(r.pendencias[0].tipo).toBe('produto_removido')
  })

  it('venda sem itens ou zerada bloqueia (não é só pendência)', () => {
    expect(conferirVenda({ ...base, itens: 0 }).situacao).toBe('bloqueada')
    expect(conferirVenda({ ...base, total: 0 }).situacao).toBe('bloqueada')
  })

  it('regime desconhecido aparece como não configurado', () => {
    expect(nomeRegime(4)).toContain('MEI')
    expect(nomeRegime(null)).toBe('Regime não configurado')
    expect(nomeRegime(9)).toBe('Regime não configurado')
  })
})

describe('resumo da conferência', () => {
  it('separa situação, decisão e notas já emitidas', () => {
    const r = resumirConferencia([
      { situacao: 'pronta', nfce_decisao: null, nfce_status: 'pendente' },
      { situacao: 'pronta', nfce_decisao: 'emitir', nfce_status: 'emitida' },
      { situacao: 'pronta', nfce_decisao: 'emitir', nfce_status: 'pendente' },
      { situacao: 'pendente', nfce_decisao: null, nfce_status: 'pendente' },
      { situacao: 'pendente', nfce_decisao: 'sem_nota', nfce_status: 'resolvida' },
      { situacao: 'bloqueada', nfce_decisao: null, nfce_status: 'pendente' },
    ])
    expect(r).toMatchObject({
      total: 6,
      prontas: 3,
      pendentes: 2,
      bloqueadas: 1,
      aDecidir: 3,
      paraEmitir: 1,
      semNota: 1,
      emitidas: 1,
    })
  })

  it('lista vazia zera tudo', () => {
    expect(resumirConferencia([])).toMatchObject({ total: 0, prontas: 0, aDecidir: 0 })
  })
})

describe('contagem para 2027', () => {
  it('conta os dias até a vigência', () => {
    expect(diasAte('2027-01-01', new Date(2026, 11, 31))).toBe(1)
    expect(diasAte('2027-01-01', new Date(2027, 0, 1))).toBe(0)
    expect(diasAte('2027-01-01', new Date(2027, 0, 2))).toBe(-1)
  })
})
