import { abrirCaixa, esperarSincronizado, indicadorSync, ler, novaVenda, pagar, produtoComEstoque, saldo } from '../apoio/pdv.ts'
import { ConexaoTeste, adicionarMembro, entrarComo } from '../apoio/supabase.ts'
import { expect, test, toast } from '../base.ts'

test.describe('Caixa sem internet', () => {
  test('vende offline e envia tudo quando a conexão volta, uma vez só', async ({ page, context, supabase, servidor, conta }) => {
    const arroz = await produtoComEstoque(servidor, conta.usuarioId, conta.empresaId, { nome: 'Arroz 5kg', unidade: 'un', preco_venda: 27.5 }, 10, ['7891000555001'])
    await abrirCaixa(page)
    await esperarSincronizado(page)

    supabase.semRede = true
    await context.setOffline(true)
    for (const qtd of ['2', '3']) {
      await ler(page, `${qtd}*7891000555001`)
      await pagar(page)
      await novaVenda(page)
    }
    await expect(indicadorSync(page)).toContainText('Offline')
    await expect(indicadorSync(page)).toHaveAttribute('data-pendentes', '2') // as duas vendas (a abertura já tinha subido)
    expect(await saldo(servidor, arroz)).toBe(10) // nada chegou ao servidor ainda

    supabase.semRede = false
    await context.setOffline(false)
    await esperarSincronizado(page)
    expect(await saldo(servidor, arroz)).toBe(5)
    const [{ n }] = await servidor.sql<{ n: number }>('select count(*)::int as n from public.vendas where empresa_id = $1', [conta.empresaId])
    expect(n).toBe(2)

    // Reenviar de novo (outra sincronização) não duplica
    await indicadorSync(page).click()
    await esperarSincronizado(page)
    expect(await saldo(servidor, arroz)).toBe(5)
  })

  test('dois caixas offline vendem a última unidade: estoque −1 e uma divergência para conferir', async ({ page, browser, supabase, servidor, conta }) => {
    const ultimo = await produtoComEstoque(servidor, conta.usuarioId, conta.empresaId, { nome: 'Último item', unidade: 'un', preco_venda: 10 }, 1, ['7891000555018'])
    await servidor.comoUsuario(conta.usuarioId, tx =>
      tx.query(`insert into public.caixas (empresa_id, loja_id, nome) select $1, id, 'Caixa 02' from public.lojas where empresa_id = $1`, [conta.empresaId]),
    )
    const operadora = await adicionarMembro(servidor, conta.usuarioId, conta.empresaId, 'caixa', 'Olga Caixa')
    const aparelho2 = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' })
    const conexao2 = new ConexaoTeste(servidor)
    await conexao2.instalar(aparelho2)
    const caixa2 = await aparelho2.newPage()
    await entrarComo(caixa2, servidor, operadora.usuarioId)

    await abrirCaixa(page, '0', 'Caixa 01')
    await abrirCaixa(caixa2, '0', 'Caixa 02')
    await esperarSincronizado(page)
    await esperarSincronizado(caixa2)

    supabase.semRede = true
    conexao2.semRede = true
    for (const p of [page, caixa2]) {
      await ler(p, '7891000555018')
      await pagar(p)
      await novaVenda(p)
    }
    supabase.semRede = false
    conexao2.semRede = false
    await indicadorSync(page).click()
    await indicadorSync(caixa2).click()
    await esperarSincronizado(page)
    await esperarSincronizado(caixa2)
    await aparelho2.close()

    expect(await saldo(servidor, ultimo)).toBe(-1) // as duas vendas aconteceram de verdade
    await page.goto('/divergencias')
    const div = page.locator('[data-divergencia="saldo_negativo"]')
    await expect(div).toHaveCount(1)
    await expect(div).toContainText('Último item')
    await expect(div.getByRole('link', { name: 'Ajustar estoque' })).toBeVisible()
    await div.getByRole('button', { name: 'Resolver' }).click()
    await page.getByLabel('O que foi feito *').fill('Contagem feita: havia 2 unidades; ajuste lançado')
    await page.getByRole('button', { name: 'Marcar como resolvida' }).click()
    await expect(toast(page, 'Divergência resolvida.')).toBeVisible()
    await expect(div).toHaveCount(0)
  })

  test('relógio do aparelho adiantado: a venda fica com a hora do servidor e o caixa avisa', async ({ page, servidor, conta }) => {
    // Aparelho 30 minutos adiantado (só o relógio da página; os timers continuam normais)
    await page.addInitScript(() => {
      const desvio = 30 * 60_000
      const DataReal = Date
      class DataAdiantada extends DataReal {
        constructor(...args: ConstructorParameters<typeof Date> | []) {
          if (args.length === 0) super(DataReal.now() + desvio)
          else super(...(args as ConstructorParameters<typeof Date>))
        }
        static now() {
          return DataReal.now() + desvio
        }
      }
      ;(window as unknown as { Date: DateConstructor }).Date = DataAdiantada as DateConstructor
    })
    await abrirCaixa(page)
    await ler(page, '7891000000014')
    await pagar(page)
    await novaVenda(page)
    await esperarSincronizado(page)

    const [venda] = await servidor.sql<{ dif: number; suspeito: boolean }>(
      `select abs(extract(epoch from (ocorrido_em - now())))::int as dif, relogio_suspeito as suspeito from public.vendas where empresa_id = $1`,
      [conta.empresaId],
    )
    expect(venda.dif).toBeLessThan(120)
    expect(venda.suspeito).toBe(false)

    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await page.getByRole('dialog', { name: 'Menu do caixa' }).getByRole('button', { name: /^Sincronização/ }).click()
    await expect(page.getByText(/O relógio deste aparelho está 30 minutos adiantado/)).toBeVisible()
  })
})
