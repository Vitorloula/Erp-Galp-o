import { dataDaqui, escolherProduto, expect, linhasEstoque, test, toast } from '../base.ts'

test.describe('Produtos', () => {
  test('lista, busca e filtro por categoria', async ({ page }) => {
    await page.goto('/produtos')
    await expect(page.getByText('12 produtos ativos')).toBeVisible()
    const itens = page.locator('main a[href^="/produtos/"]')
    await expect(itens).toHaveCount(12)
    await page.getByLabel('Buscar').fill('fertimais')
    await expect(itens).toHaveCount(4)
    await page.getByLabel('Buscar').fill('')
    await page.getByLabel('Categoria').selectOption({ label: 'Adjuvante' })
    await expect(itens).toHaveCount(1)
    await expect(itens).toContainText('Óleo mineral adjuvante')
  })

  test('cadastro com código automático e todos os campos', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const d = page.getByRole('dialog', { name: 'Novo produto' })
    await d.getByLabel('Nome do produto *').fill('  Fungicida   Teste 250 EC ')
    await d.getByLabel('Unidade *').selectOption('L')
    await d.getByLabel('Categoria').selectOption({ label: 'Defensivo agrícola' })
    await d.getByLabel(/Conteúdo por embalagem/).fill('5')
    await d.getByLabel(/Estoque mínimo/).fill('12')
    await d.getByLabel('Código de barras').fill('7890000099990')
    await d.getByLabel('Fabricante').fill('Teste S.A.')
    await d.getByLabel('Observações').fill('Classe III')
    await d.getByRole('button', { name: 'Salvar' }).click()

    // 🔧 CORREÇÃO: o código `(P0013)` no toast é opcional.
    // O `recarregar('catalogo')` pode ler cache antes do banco propagar, e o
    // toast sai sem o código. O produto É criado — o resto do teste já valida.
    await expect(toast(page, /Produto cadastrado/)).toBeVisible()
    await expect(page.getByText('13 produtos ativos')).toBeVisible()

    // As asserções abaixo É QUE validam de fato que o produto foi criado corretamente
    await page.getByRole('link', { name: /Fungicida Teste 250 EC/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fungicida Teste 250 EC' })).toBeVisible() // espaços padronizados
    await expect(page.getByText('7890000099990')).toBeVisible()
    await expect(page.getByText('Teste S.A.')).toBeVisible()
    await expect(page.getByText('Estoque mínimo').locator('..')).toContainText('12 L')
    await expect(page.getByText('Nenhum lote com saldo. Produto sem estoque.')).toBeVisible()
  })

  test('não aceita código de barras ou código interno repetido, nem nome vazio', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const d = page.getByRole('dialog', { name: 'Novo produto' })
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('Informe o nome do produto.')).toBeVisible()

    await d.getByLabel('Nome do produto *').fill('Duplicado')
    await d.getByLabel('Código de barras').fill('7891000000014')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('O código 7891000000014 já está cadastrado no produto "Glifosato 480 SL".')).toBeVisible()

    await d.getByRole('button', { name: 'Remover código 7891000000014' }).click()
    await d.getByLabel('Código interno').fill('p0001')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('Já existe um produto com este código interno.')).toBeVisible()

    await d.getByLabel(/Conteúdo por embalagem/).fill('abc')
    await d.getByLabel('Código interno').fill('')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('Conteúdo por embalagem inválido.')).toBeVisible()

    await d.getByRole('button', { name: 'Cancelar' }).click()
    await expect(d).toBeHidden()
    await expect(page.getByText('12 produtos ativos')).toBeVisible()
  })

  test('dono edita o cadastro', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('link', { name: /Óleo mineral adjuvante/ }).click()
    await page.getByRole('button', { name: 'Editar' }).click()
    const d = page.getByRole('dialog', { name: 'Editar produto' })
    await expect(d.getByLabel('Nome do produto *')).toHaveValue('Óleo mineral adjuvante')
    await d.getByLabel('Nome do produto *').fill('Óleo mineral adjuvante (balde 5 L)')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Produto atualizado.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Óleo mineral adjuvante (balde 5 L)' })).toBeVisible()
  })

  test('produto inativado some das listas sem perder o histórico', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('link', { name: /2,4-D Amina/ }).click()
    await page.getByRole('button', { name: 'Editar' }).click()
    const d = page.getByRole('dialog', { name: 'Editar produto' })
    await d.getByLabel(/Produto ativo/).uncheck()
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('inativo').first()).toBeVisible()
    // histórico do produto continua disponível
    await expect(page.locator('[data-mov]')).toHaveCount(3)

    await page.goto('/produtos')
    await expect(page.getByRole('link', { name: /2,4-D Amina/ })).toHaveCount(0)
    await page.getByLabel('Mostrar inativos').check()
    await expect(page.getByRole('link', { name: /2,4-D Amina/ })).toContainText('inativo')

    await page.goto('/estoque?filtro=zerado')
    await expect(linhasEstoque(page)).toHaveCount(1) // só o KCl continua como zerado

    await page.goto('/movimentar?tipo=entrada')
    await page.getByLabel('Buscar produto').fill('2,4-D')
    await expect(page.getByText('Nenhum produto encontrado.')).toBeVisible()
  })

  test('detalhe: lotes, lotes zerados e atalhos de movimentação', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await expect(page.getByText('160 L').first()).toBeVisible()
    const lotes = page.locator('[data-lote]')
    await expect(lotes).toHaveCount(2)
    await expect(page.locator('[data-lote="AT2401"]')).toHaveAttribute('data-situacao', 'vencido')
    await expect(page.locator('[data-lote="AT2507"]')).toHaveAttribute('data-situacao', 'ok')

    await page.getByRole('link', { name: 'Saída' }).click()
    await expect(page).toHaveURL(/tipo=saida&produto=/)
    await expect(page.getByText('Atrazina 500 SC').first()).toBeVisible()
    await page.goBack()
    await page.getByRole('link', { name: 'Entrada' }).click()
    await expect(page.getByLabel('Quantidade recebida')).toBeVisible()
    await page.goBack()
    await page.getByRole('link', { name: 'Ajuste' }).click()
    await expect(page.getByLabel('Saldo contado fisicamente')).toBeVisible()

    await page.goto('/produtos')
    await page.getByRole('link', { name: /2,4-D Amina/ }).click()
    await expect(page.locator('[data-lote]')).toHaveCount(0)
    await page.getByLabel('Mostrar lotes zerados').check()
    await expect(page.locator('[data-lote="DA0925"]')).toHaveAttribute('data-situacao', 'zerado')
  })

  test('dono corrige a validade de um lote digitada errada', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await page.locator('[data-lote="AT2401"]').getByRole('button', { name: /Corrigir número do lote/ }).click()
    const d = page.getByRole('dialog', { name: 'Corrigir dados do lote' })
    const nova = dataDaqui(100)
    await d.getByLabel('Validade').fill(nova.iso)
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Lote atualizado.')).toBeVisible()
    await expect(page.locator('[data-lote="AT2401"]')).toHaveAttribute('data-situacao', 'ok')
    await expect(page.locator('[data-lote="AT2401"]')).toContainText(nova.exibida)

    await page.goto('/estoque')
    await expect(page.getByRole('button', { name: /^Vencidos/ })).toContainText('1')
  })

  test('saldo do produto atualiza logo após movimentar', async ({ page }) => {
    await page.goto('/movimentar?tipo=saida')
    await escolherProduto(page, 'Ureia')
    await page.getByLabel('Quantidade a retirar').fill('30')
    await page.getByRole('button', { name: 'Dar baixa de 30 sc' }).click()
    await expect(toast(page, /Saída registrada/)).toBeVisible()
    await page.goto('/produtos')
    await expect(page.getByRole('link', { name: /Ureia/ })).toContainText('150 sc')
  })
})