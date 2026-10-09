import { escolherProduto, expect, linhasEstoque, test, toast } from '../base'

test.describe('Usuários', () => {
  test('administrador libera quem está aguardando e não altera o próprio acesso', async ({ page }) => {
    await page.goto('/usuarios')
    await expect(page.getByText('1 pessoa(s) aguardando liberação.')).toBeVisible()
    await expect(page.getByLabel('Acesso de Você (demonstração)')).toBeDisabled()

    await page.getByLabel('Acesso de Carlos (pátio)').selectOption('operador')
    await expect(toast(page, 'Carlos (pátio): Operador.')).toBeVisible()
    await expect(page.getByText(/aguardando liberação/)).toBeHidden()
    await expect(page.getByLabel('Acesso de Carlos (pátio)')).toHaveValue('operador')

    await page.getByLabel('Acesso de João (pátio)').selectOption('admin')
    await expect(toast(page, 'João (pátio): Administrador.')).toBeVisible()
  })
})

test.describe('Mais', () => {
  test('restaurar a demonstração desfaz os testes feitos no navegador', async ({ page }) => {
    await page.goto('/movimentar?tipo=saida')
    await escolherProduto(page, 'Glifosato')
    await page.getByLabel('Quantidade a retirar').fill('100')
    await page.getByRole('button', { name: 'Dar baixa de 100 L' }).click()
    await expect(toast(page, /Saída registrada/)).toBeVisible()

    await page.goto('/mais')
    await page.getByRole('button', { name: 'Restaurar dados de demonstração' }).click()
    const d = page.getByRole('dialog', { name: 'Restaurar demonstração?' })
    await d.getByRole('button', { name: 'Restaurar' }).click()
    await expect(toast(page, 'Dados de demonstração restaurados.')).toBeVisible()

    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toContainText('260')
  })
})

test.describe('Tempo real', () => {
  test('lançamento feito em uma aba aparece na outra sem recarregar', async ({ context }) => {
    const estoque = await context.newPage()
    await estoque.goto('/estoque')
    await estoque.getByLabel('Buscar').fill('Óleo')
    await expect(linhasEstoque(estoque)).toContainText('35')

    const operador = await context.newPage()
    await operador.goto('/movimentar?tipo=saida')
    await escolherProduto(operador, 'Óleo')
    await operador.getByLabel('Quantidade a retirar').fill('10')
    await operador.getByRole('button', { name: 'Dar baixa de 10 L' }).click()
    await expect(toast(operador, /Saída registrada/)).toBeVisible()

    await expect(linhasEstoque(estoque)).toContainText('25')
  })
})
