import type { Page, TestInfo } from '@playwright/test'
import { abrirMovimentar, ehCelular, escolherProduto, expect, linhasEstoque, test, toast } from '../base.ts'

/** Abre a troca de empresa/loja: no computador pelo menu lateral, no celular pela barra do topo. */
async function abrirTroca(page: Page, info: TestInfo) {
  if (ehCelular(info)) await page.getByRole('button', { name: 'Trocar de empresa ou loja' }).click()
  else await page.locator('aside').getByRole('button', { name: /Agro Exemplo|Empresa Nova/ }).first().click()
  return page.getByRole('dialog', { name: 'Empresa e loja' })
}

test.describe('Equipe', () => {
  test('dono aparece na equipe, não altera o próprio acesso, convida e cancela convite', async ({ page, supabase }) => {
    await page.goto('/equipe')
    await expect(page.getByLabel('Papel de Ana Teste')).toBeDisabled()
    await expect(page.getByLabel('Papel de Ana Teste')).toHaveValue('dono')

    await page.getByRole('button', { name: 'Convidar pessoa' }).click()
    const d = page.getByRole('dialog', { name: 'Convidar pessoa' })
    await d.getByRole('radio', { name: /Caixa/ }).check()
    await d.getByRole('button', { name: 'Criar link de convite' }).click()
    const link = await d.getByLabel('Link do convite').inputValue()
    expect(link).toMatch(/\/convite#[0-9a-f]{64}$/)
    await expect(d.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/\?text=.*Caixa/)
    const [rpc] = supabase.chamadas('POST', '/rest/v1/rpc/criar_convite')
    expect(rpc.corpo).toMatchObject({ p_papel: 'caixa', p_email: null })
    await d.getByRole('button', { name: 'Concluir' }).click()

    const convite = page.locator('[data-convite="caixa"]')
    await expect(convite).toContainText('qualquer pessoa com o link')
    await convite.getByRole('button', { name: 'Cancelar' }).click()
    await expect(toast(page, 'Convite cancelado.')).toBeVisible()
    await expect(convite).toHaveCount(0)
  })
})

test.describe('Empresa e lojas', () => {
  test('dados da empresa e assinatura em teste', async ({ page }) => {
    await page.goto('/empresa')
    await expect(page.getByText('Teste grátis (14 dias)')).toBeVisible()
    await expect(page.getByText('Em dia')).toBeVisible()
    await page.getByLabel('Razão social').fill('Agro Exemplo Comércio Ltda')
    await page.getByLabel('CNPJ ou CPF').fill('12.345.678/0001-90')
    await page.getByRole('button', { name: 'Salvar dados' }).click()
    await expect(toast(page, 'Dados da empresa salvos.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('CNPJ ou CPF')).toHaveValue('12345678000190')
  })

  test('cada loja tem o próprio estoque', async ({ page }, info) => {
    await page.goto('/empresa')
    await page.getByRole('button', { name: 'Nova loja' }).click()
    await page.getByRole('dialog', { name: 'Nova loja' }).getByLabel('Nome da loja *').fill('Filial Norte')
    await page.getByRole('dialog', { name: 'Nova loja' }).getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Loja Filial Norte criada.')).toBeVisible()

    // Troca para a filial: estoque vazio (o catálogo é o mesmo)
    let troca = await abrirTroca(page, info)
    await troca.getByRole('button', { name: 'Filial Norte' }).click()
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toContainText('Sem estoque')

    await abrirMovimentar(page, 'entrada', 'Glifosato')
    await expect(page.getByText('em Filial Norte')).toBeVisible()
    await page.getByLabel('Lote').fill('FN-1')
    await page.getByLabel('Quantidade recebida').fill('15')
    await page.getByRole('button', { name: 'Registrar entrada de 15 L' }).click()
    await expect(toast(page, /Entrada registrada: \+15 L/)).toBeVisible()

    // A loja principal continua com os 260 L de antes
    troca = await abrirTroca(page, info)
    await troca.getByRole('button', { name: 'Galpão principal' }).click()
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toHaveCount(1)
    await expect(linhasEstoque(page)).toContainText('260')
    await expect(linhasEstoque(page)).not.toContainText('FN-1')
  })

  test('cadastrar outra empresa e trocar entre elas', async ({ page }, info) => {
    await page.goto('/empresas/nova')
    await page.getByLabel('Nome da empresa *').fill('Empresa Nova')
    await page.getByText('Mercadinho / conveniência').click()
    await page.getByRole('button', { name: /Criar empresa/ }).click()
    await expect(toast(page, 'Empresa Empresa Nova criada. Bom trabalho!')).toBeVisible()
    await expect(page.getByRole('button', { name: /Produtos com saldo/ })).toContainText('0')
    await expect(page.getByText('Empresa de exemplo:')).toHaveCount(0)

    const troca = await abrirTroca(page, info)
    await troca.getByRole('button', { name: /Agro Exemplo/ }).click()
    await expect(page.getByRole('button', { name: /Produtos com saldo/ })).toContainText('10')
    await page.reload() // a escolha fica guardada no aparelho
    await expect(page.getByText('Empresa de exemplo:')).toBeVisible()
  })
})

test.describe('Mais', () => {
  test('alterar o próprio nome', async ({ page }) => {
    await page.goto('/mais')
    await page.getByRole('button', { name: 'Alterar meu nome' }).click()
    const d = page.getByRole('dialog', { name: 'Meu nome' })
    await d.getByRole('textbox').fill('Ana Maria Teste')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Nome atualizado.')).toBeVisible()
    await expect(page.locator('main').getByText('Ana Maria Teste')).toBeVisible()
  })
})

test.describe('Tempo real', () => {
  test('lançamento feito em uma aba aparece na outra sem recarregar', async ({ context, page }) => {
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Óleo')
    await expect(linhasEstoque(page)).toContainText('35')

    const operador = await context.newPage()
    await operador.goto('/movimentar?tipo=saida')
    await escolherProduto(operador, 'Óleo')
    await operador.getByLabel('Quantidade a retirar').fill('10')
    await operador.getByRole('button', { name: 'Dar baixa de 10 L' }).click()
    await expect(toast(operador, /Saída registrada/)).toBeVisible()

    await expect(linhasEstoque(page)).toContainText('25')
  })
})
