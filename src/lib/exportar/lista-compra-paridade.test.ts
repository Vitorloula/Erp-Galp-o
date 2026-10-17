import { describe, expect, it } from 'vitest'
import { textoEmbalagensSugestao } from '../../components/ListaReposicao'
import { filtrarItensCompra, montarReposicao } from '../estoque'
import type { Lote, Produto } from '../tipos'

/**
 * T-011 — a contagem de embalagens da TELA é a mesma do PDF.
 *
 * Os dois lados usam `formatarEmbalagens()`: o PDF em `embalagens()` (`lib/exportar/lista-compra.ts`)
 * e a tela em `textoEmbalagensSugestao()` (`components/ListaReposicao.tsx`). Aqui a comparação é
 * feita sobre o MESMO `ItemCompra` / `ReposicaoProduto` do fixture de `lista-compra.test.ts`
 * (acefato com mínimo 10, saldo 3 e embalagem de 4 ⇒ sugere 8 kg = 2 embalagens).
 */
const produto = (id: string, nome: string, extra: Partial<Produto> = {}): Produto => ({
  id,
  codigo_interno: 'P000' + id.length,
  nome,
  categoria_id: 'cat',
  unidade: 'L',
  conteudo_embalagem: null,
  estoque_minimo: null,
  preco_venda: null,
  custo_ultimo: null,
  rastreio: 'lote',
  pesavel: false,
  codigo_balanca: null,
  controla_estoque: true,
  fabricante: null,
  observacao: null,
  ativo: true,
  criado_em: '',
  codigos: [],
  ...extra,
})
const lote = (produto_id: string, saldo: number): Lote => ({
  lote_id: `lote-${produto_id}`,
  produto_id,
  lote: 'L1',
  validade: '2027-10-03',
  saldo,
  ultima_movimentacao: null,
})

describe('Lista de compras: paridade tela × PDF (T-011)', () => {
  const comEmbalagem = produto('p', 'Acefato 750 SP', { estoque_minimo: 10, conteudo_embalagem: 4, unidade: 'kg' })
  const semEmbalagem = produto('q', 'Enxofre 800', { estoque_minimo: 10 })
  const HOJE = '2026-10-03'
  const reposicao = montarReposicao([comEmbalagem, semEmbalagem], [lote('p', 3), lote('q', 3)], HOJE)

  it('a sugestão nasce em lib/estoque.ts (8 kg) e a tela formata "2 emb."', () => {
    const item = reposicao.find(i => i.produto.id === 'p')!
    expect(item.sugestaoCompra).toBe(8) // 7 → 2 embalagens de 4
    expect(textoEmbalagensSugestao(item.produto, item.sugestaoCompra)).toBe('2 emb.')
  })

  it('o texto da tela é idêntico ao do PDF para o mesmo produto', () => {
    const [compra] = filtrarItensCompra(reposicao, new Set(['p']), () => 'Defensivo')
    const daTela = textoEmbalagensSugestao(compra.produto, compra.sugestaoCompra)
    // Mesma expressão de `embalagens(item)` usada na linha do PDF.
    const doPdf = (() => {
      const conteudo = compra.produto.conteudo_embalagem
      return conteudo ? `${compra.sugestaoCompra / conteudo} emb.` : null
    })()
    expect(doPdf).toBe('2 emb.')
    expect(daTela).toBe(doPdf)
  })

  it('produto sem conteúdo por embalagem não ganha parênteses (tela e PDF)', () => {
    const item = reposicao.find(i => i.produto.id === 'q')!
    expect(item.sugestaoCompra).toBe(7)
    expect(textoEmbalagensSugestao(item.produto, item.sugestaoCompra)).toBeNull()
  })

  it('sugestão zero (no mínimo) nunca mostra embalagens', () => {
    const noMinimo = produto('r', 'Oleo mineral', { estoque_minimo: 20, conteudo_embalagem: 5 })
    const item = montarReposicao([noMinimo], [lote('r', 20)], HOJE)[0]
    expect(item.sugestaoCompra).toBe(0)
    expect(textoEmbalagensSugestao(item.produto, item.sugestaoCompra)).toBeNull()
  })
})
