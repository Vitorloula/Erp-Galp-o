import { ehCelular, expect, semRolagemHorizontal, test } from '../base'

const TELAS = [
  { rota: '/painel', titulo: /(Bom dia|Boa tarde|Boa noite)/ },
  { rota: '/estoque', titulo: 'Estoque atual' },
  { rota: '/movimentar', titulo: 'Movimentar estoque' },
  { rota: '/historico', titulo: 'Histórico de movimentações' },
  { rota: '/produtos', titulo: 'Produtos' },
  { rota: '/relatorios', titulo: 'Relatórios' },
  { rota: '/usuarios', titulo: 'Usuários' },
  { rota: '/mais', titulo: 'Mais opções' },
]

test.describe('Navegação', () => {
  for (const { rota, titulo } of TELAS) {
    test(`tela ${rota} abre sem erros e sem rolagem lateral`, async ({ page }) => {
      await page.goto(rota)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
      await expect(page.getByText('Modo demonstração:')).toBeVisible()
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
      // Produtos, Relatórios e Usuários ficam em "Mais" no celular
      await page.goto('/mais')
      for (const [item, rota] of [['Produtos', '/produtos'], ['Relatórios', '/relatorios'], ['Usuários', '/usuarios']] as const) {
        await page.getByRole('link', { name: new RegExp('^' + item) }).click()
        await expect(page).toHaveURL(new RegExp(rota + '$'))
        await page.goBack()
      }
      await expect(page.locator('aside')).toBeHidden()
    } else {
      const menu = page.locator('aside nav')
      for (const [item, rota] of [['Estoque', '/estoque'], ['Movimentar', '/movimentar'], ['Histórico', '/historico'], ['Produtos', '/produtos'], ['Relatórios', '/relatorios'], ['Usuários', '/usuarios'], ['Painel', '/painel']] as const) {
        await menu.getByRole('link', { name: item }).click()
        await expect(page).toHaveURL(new RegExp(rota + '$'))
      }
      await expect(page.getByText('Você (demonstração)').first()).toBeVisible()
    }
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
