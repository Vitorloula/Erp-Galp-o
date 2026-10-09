import { digitoEan13 } from '../../src/pdv/balanca.ts'
import { abrirCaixa, esperarSincronizado, ler, novaVenda, pagar, produtoComEstoque, saldo } from '../apoio/pdv.ts'
import { adicionarMembro, criarConta, entrarComo } from '../apoio/supabase.ts'
import { expect, testeSemLogin as test } from '../base.ts'

test.describe('Mercadinho', () => {
  test('etiqueta de balança, item sem cadastro como Diversos; operador de caixa não cancela venda', async ({ page, servidor }) => {
    const dono = await criarConta(servidor, 'Marta Mercado', 'dono')
    const empresa = await servidor.comoUsuario(dono.usuarioId, async tx => (await tx.query<{ id: string }>(`select public.criar_empresa('Mercadinho da Marta', 'mercadinho') as id`)).rows[0].id)
    const queijo = await produtoComEstoque(servidor, dono.usuarioId, empresa, { nome: 'Queijo mussarela', unidade: 'kg', preco_venda: 49.9, pesavel: true, codigo_balanca: '42' }, 10)
    const operador = await adicionarMembro(servidor, dono.usuarioId, empresa, 'caixa', 'Caio Caixa')
    await entrarComo(page, servidor, operador.usuarioId)
    await abrirCaixa(page)

    // Etiqueta da balança: PLU 0042, R$ 12,34
    const doze = '200420001234'
    await ler(page, doze + digitoEan13(doze))
    const item = page.locator('[data-item="Queijo mussarela"]')
    await expect(item).toContainText('0,247 kg')
    await expect(item).toContainText('R$ 12,34')

    // Código que não está cadastrado: vende como "Diversos" com o preço digitado
    await ler(page, '7890000000000')
    await page.getByRole('button', { name: 'Vender como Diversos' }).click()
    await page.getByLabel('Preço por un (R$)').fill('5')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await expect(page.locator('[data-item="Diversos"]')).toContainText('R$ 5,00')
    await expect(page.locator('[data-total]')).toHaveText('R$ 17,34')

    await pagar(page, [['Débito', '']])
    await novaVenda(page)
    await esperarSincronizado(page)
    expect(await saldo(servidor, queijo)).toBeCloseTo(9.753, 3)

    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await page.getByRole('dialog', { name: 'Menu do caixa' }).getByRole('button', { name: /^Últimas vendas/ }).click()
    await expect(page.locator('[data-venda="01-000001"]')).toContainText('enviada')
    await expect(page.getByRole('button', { name: /Cancelar 01-000001/ })).toHaveCount(0)
    await expect(page.getByText('Para cancelar uma venda, chame o gerente ou o dono.')).toBeVisible()
  })
})
