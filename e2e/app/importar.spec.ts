import { expect, test, toast } from '../base.ts'

test.describe('Importação de catálogo', () => {
  test('importa CSV com saldo inicial e ponto de pedido', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Importar catálogo' })
    await expect(modal).toBeVisible()

    const csv = [
      'nome;codigo_interno;codigo_barras;categoria;unidade;preco_venda;estoque_minimo;quantidade;lote;validade;controla_estoque;rastreio',
      'Produto Importado E2E;E2E-001;7890000000011;Importados E2E;un;19,90;5;7;LOTE-E2E;31/12/2027;sim;lote',
      'Sem Saldo E2E;E2E-002;;Importados E2E;kg;5,50;;0;;;sim;nenhum',
    ].join('\n')

    await modal.locator('input[type=file]').setInputFiles({
      name: 'catalogo-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })

    await expect(modal.getByText(/2 produto\(s\) pronto\(s\)/)).toBeVisible()
    await modal.getByRole('button', { name: 'Importar 2 produto(s)' }).click()
    await expect(modal.getByText(/2 produto\(s\) criado\(s\), 1 saldo\(s\) inicial\(is\) lançado\(s\)/)).toBeVisible()
    await expect(toast(page, '2 produto(s) importado(s).')).toBeVisible()
    await modal.getByRole('button', { name: 'Concluir' }).click()

    await page.getByLabel('Buscar').fill('Produto Importado E2E')
    const produto = page.getByRole('link', { name: /Produto Importado E2E/ })
    await expect(produto).toContainText('7 un')
    await produto.click()
    await expect(page.getByText('Saldo total')).toBeVisible()
    await expect(page.locator('[data-lote="LOTE-E2E"]')).toContainText('7 un')
    await expect(page.getByText('Estoque mínimo').locator('..')).toContainText('5')
  })

  test('mostra erro por linha sem impedir as linhas válidas', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Importar catálogo' })
    const csv = [
      'nome;codigo_interno;unidade;quantidade',
      'Linha Boa;BOA-1;un;1',
      ';SEM-NOME;un;1',
      'Linha Ruim;BOA-1;un;1',
    ].join('\n')
    await modal.locator('input[type=file]').setInputFiles({
      name: 'catalogo-com-erro.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })

    await expect(modal.getByText(/1 produto\(s\) pronto\(s\)/)).toBeVisible()
    await expect(modal.getByText(/Linha 3: informe o nome do produto/)).toBeVisible()
    await expect(modal.getByText(/código interno BOA-1 repetido/)).toBeVisible()
    await modal.getByRole('button', { name: 'Importar 1 produto(s)' }).click()
    await expect(modal.getByText(/1 produto\(s\) criado\(s\)/)).toBeVisible()
  })
})
