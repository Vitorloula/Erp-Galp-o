import { describe, expect, it } from 'vitest'
import { paginar } from './paginacao'

describe('paginação', () => {
  const itens = Array.from({ length: 123 }, (_, i) => i + 1)

  it('fatia a página e calcula os limites', () => {
    const p = paginar(itens, 2, 50)
    expect(p.itens[0]).toBe(51)
    expect(p.itens).toHaveLength(50)
    expect(p).toMatchObject({ pagina: 2, total: 123, totalPaginas: 3, primeiro: 51, ultimo: 100 })
  })

  it('limita páginas fora do intervalo', () => {
    expect(paginar(itens, 99, 50)).toMatchObject({ pagina: 3, primeiro: 101, ultimo: 123 })
    expect(paginar(itens, -1, 50)).toMatchObject({ pagina: 1, primeiro: 1, ultimo: 50 })
  })

  it('lista vazia continua com uma página', () => {
    expect(paginar([], 1, 50)).toMatchObject({ itens: [], pagina: 1, total: 0, totalPaginas: 1, primeiro: 0, ultimo: 0 })
  })
})
