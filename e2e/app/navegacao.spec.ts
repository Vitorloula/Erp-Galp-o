import { ehCelular, expect, semRolagemHorizontal, test } from '../base.ts'

const TELAS = [
  { rota: '/painel', titulo: /(Bom dia|Boa tarde|Boa noite)/ },
  { rota: '/estoque', titulo: 'Estoque atual' },
  { rota: '/movimentar', titulo: 'Movimentar estoque' },
  { rota: '/historico', titulo: 'Histórico de movimentações' },
  { rota: '/produtos', titulo: 'Produtos' },
  { rota: '/vendas', titulo: 'Vendas' },
  { rota: '/relatorios', titulo: 'Relatórios' },
  { rota: '/equipe', titulo: 'Equipe' },
  { rota: '/empresa', titulo: 'Empresa' },
  { rota: '/mais', titulo: 'Mais opções' },
]

test.describe('Navegação', () => {
  for (const { rota, titulo } of TELAS) {
    test(`tela ${rota} abre sem erros e sem rolagem lateral`, async ({ page }) => {
      await page.goto(rota)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
      await expect(page.getByText('Empresa de exemplo:')).toBeVisible()
      await semRolagemHorizontal(page)
    })
  }

  test('endereço desconhecido volta para o painel', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe')
    await expect(page).toHaveURL(/\/painel$/)
  })

  test('menu leva a todas as telas', async ({ page }, info) => {
    await page.goto('/painel')
    if (ehCelular(info)) {
      const barra = page.getByRole('navigation').last()
      for (const [item, rota] of [['Estoque', '/estoque'], ['Histórico', '/historico'], ['Mais', '/mais'], ['Painel', '/painel']] as const) {
        await barra.getByRole('link', { name: item, exact: true }).click()
        await expect(page).toHaveURL(new RegExp(rota + '$'))
      }
      await barra.getByRole('link', { name: 'Movimentar' }).click()
      await expect(page).toHaveURL(/\/movimentar$/)
      // Produtos, Relatórios, Equipe e Empresa ficam em "Mais" no celular
      await page.goto('/mais')
      for (const [item, rota] of [['Produtos', '/produtos'], ['Relatórios', '/relatorios'], ['Equipe', '/equipe'], ['Empresa', '/empresa']] as const) {
        await page.getByRole('link', { name: new RegExp('^' + item) }).click()
        await expect(page).toHaveURL(new RegExp(rota + '$'))
        await page.goBack()
      }
      await expect(page.locator('aside')).toBeHidden()
    } else {
      const menu = page.locator('aside nav')
      for (const [item, rota] of [['Vendas e caixa', '/vendas'], ['Produtos', '/produtos'], ['Estoque', '/estoque'], ['Movimentar', '/movimentar'], ['Histórico', '/historico'], ['Relatórios', '/relatorios'], ['Equipe', '/equipe'], ['Empresa', '/empresa'], ['Visão geral', '/painel']] as const) {
        await menu.getByRole('link', { name: item }).click()
        await expect(page).toHaveURL(new RegExp(rota + '$'))
      }
      await expect(page.locator('aside').getByText('Ana Teste')).toBeVisible()
      await expect(page.locator('aside').getByText('Dono', { exact: true })).toBeVisible()
    }
  })

  test('menu lateral recolhe, lembra a escolha e continua navegando', async ({ page }, info) => {
    test.skip(ehCelular(info), 'o menu lateral só existe no computador')
    await page.goto('/painel')
    const menu = page.locator('#menu-lateral')
    await expect(menu).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recolher menu' })).toHaveAttribute('aria-expanded', 'true')
    expect((await menu.boundingBox())?.width ?? 0).toBeGreaterThan(200)

    await page.getByRole('button', { name: 'Recolher menu' }).click()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(async () => (await menu.boundingBox())?.width ?? 0).toBeLessThan(100)

    // Recolhido, o item continua com o mesmo nome acessível.
    await menu.getByRole('link', { name: 'Estoque' }).click()
    await expect(page).toHaveURL(/\/estoque$/)

    // A escolha fica guardada no aparelho.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()
    await expect.poll(async () => (await menu.boundingBox())?.width ?? 0).toBeLessThan(100)

    // Reabrir devolve os rótulos e a largura.
    await page.getByRole('button', { name: 'Expandir menu' }).click()
    await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible()
    await expect.poll(async () => (await menu.boundingBox())?.width ?? 0).toBeGreaterThan(200)
    await expect(menu.getByText('MENU')).toBeVisible()
  })

  test('avisa quando o aparelho fica sem internet', async ({ page, context }) => {
    await page.goto('/painel')
    await expect(page.getByText(/(Bom dia|Boa tarde|Boa noite)/)).toBeVisible()
    await context.setOffline(true)
    await expect(page.getByText('Sem internet. Os lançamentos só serão salvos quando a conexão voltar.')).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText(/Sem internet/)).toBeHidden()
  })
})
