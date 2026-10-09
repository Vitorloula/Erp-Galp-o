import type { Page } from '@playwright/test'
import { dataDaqui, expect, test, toast } from '../base'

// Nos dados de demonstração há 6 lançamentos nos últimos 7 dias (1 entrada, 5 saídas)
// e 33 no total (13 entradas, 19 saídas, 1 correção), o mais antigo há 58 dias.

const movs = (page: Page) => page.locator('[data-mov]')

async function periodoPersonalizado(page: Page, diasAtras: number) {
  await page.getByRole('button', { name: 'Personalizado' }).click()
  await page.getByLabel('De', { exact: true }).fill(dataDaqui(-diasAtras).iso)
  await page.getByLabel('Até', { exact: true }).fill(dataDaqui(0).iso)
}

test.describe('Histórico', () => {
  test('filtros de período, tipo e busca', async ({ page }) => {
    await page.goto('/historico')
    await expect(page.getByText('6 lançamento(s) no período')).toBeVisible()
    await expect(movs(page)).toHaveCount(6)

    await page.getByRole('button', { name: 'Hoje' }).click()
    await expect(page.getByText('Nenhuma movimentação')).toBeVisible()

    await periodoPersonalizado(page, 60)
    await expect(movs(page)).toHaveCount(33)
    await page.getByLabel('Tipo').selectOption('CORRECAO')
    await expect(movs(page)).toHaveCount(1)
    await expect(movs(page)).toContainText('Saída lançada com 60 L, o correto eram 40 L')
    await expect(movs(page)).toContainText(/corrige #\d+/)
    await page.getByLabel('Tipo').selectOption('ENTRADA')
    await expect(movs(page)).toHaveCount(13)
    await page.getByLabel('Tipo').selectOption('')

    await page.getByLabel('Buscar').fill('romaneio 58')
    await expect(movs(page)).toHaveCount(1)
    await expect(movs(page)).toContainText('Ureia')
    await page.getByLabel('Buscar').fill('Carlos')
    expect(await movs(page).count()).toBeGreaterThan(3)
  })

  test('lançamentos de correção não têm botão Corrigir; o original aparece como "corrigida"', async ({ page }) => {
    await page.goto('/historico')
    await periodoPersonalizado(page, 60)
    const correcao = page.locator('[data-tipo="CORRECAO"]')
    await expect(correcao.locator('button[title="Lançar correção"]')).toHaveCount(0)
    const ref = (await correcao.innerText()).match(/corrige #(\d+)/)![1]
    await expect(page.locator(`[data-mov="${ref}"]`)).toContainText('corrigida')
  })

  test('corrigir uma saída lança a diferença sem apagar o original', async ({ page }) => {
    await page.goto('/historico')
    const original = movs(page).filter({ hasText: 'Romaneio 58' })
    const id = await original.getAttribute('data-mov')
    await original.locator('button[title="Lançar correção"]').click()

    const dialogo = page.getByRole('dialog', { name: `Corrigir lançamento #${id}` })
    await expect(dialogo).toContainText('Saída de 20 sc')
    const registrar = dialogo.getByRole('button', { name: 'Registrar correção' })

    await dialogo.getByLabel('Quantidade correta da saída').fill('20')
    await expect(registrar).toBeDisabled() // igual ao original: nada a corrigir

    await dialogo.getByLabel('Quantidade correta da saída').fill('15')
    await expect(dialogo).toContainText('Correção de +5 sc no lote. Saldo do lote: 180 sc → 185 sc')
    await registrar.click()
    await expect(dialogo.getByText('Descreva o motivo da correção.')).toBeVisible()

    await dialogo.getByLabel('Motivo da correção *').fill('Eram 15 sacos, não 20')
    await registrar.click()
    await expect(toast(page, /Correção #\d+ registrada \(\+5 sc\)/)).toBeVisible()
    await expect(dialogo).toBeHidden()

    // O original continua lá, marcado como corrigido; a correção aponta para ele
    await expect(page.locator(`[data-mov="${id}"]`)).toContainText('corrigida')
    await expect(page.locator(`[data-mov="${id}"]`)).toContainText('−20 sc')
    const correcao = movs(page).first()
    await expect(correcao).toHaveAttribute('data-tipo', 'CORRECAO')
    await expect(correcao).toContainText(`corrige #${id}`)
    await expect(correcao).toContainText('+5 sc')

    // Corrigir de novo considera a correção anterior
    await page.locator(`[data-mov="${id}"] button[title="Lançar correção"]`).click()
    await expect(page.getByRole('dialog')).toContainText('Já corrigido antes: efeito atual −15 sc')
  })

  test('estorno total de uma entrada', async ({ page }) => {
    await page.goto('/historico')
    const entrada = movs(page).filter({ hasText: 'NF 10502' })
    const id = await entrada.getAttribute('data-mov')
    await entrada.locator('button[title="Lançar correção"]').click()
    const dialogo = page.getByRole('dialog', { name: `Corrigir lançamento #${id}` })
    await dialogo.getByLabel('Estornar totalmente').check()
    await expect(dialogo).toContainText('Correção de −120 L no lote. Saldo do lote: 120 L → 0 L')
    await dialogo.getByLabel('Motivo da correção *').fill('Nota lançada em duplicidade')
    await dialogo.getByRole('button', { name: 'Registrar correção' }).click()
    await expect(toast(page, /Correção #\d+ registrada \(−120 L\)/)).toBeVisible()
  })

  test('correção que deixaria o saldo negativo é recusada com mensagem clara', async ({ page }) => {
    // Entrada de 30 L de Lambda, da qual 18 L já saíram: estornar a entrada inteira deixaria −18 L.
    await page.goto('/historico')
    await periodoPersonalizado(page, 60)
    const entrada = movs(page).filter({ hasText: 'NF 10301' })
    await entrada.locator('button[title="Lançar correção"]').click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Estornar totalmente').check()
    await dialogo.getByLabel('Motivo da correção *').fill('Teste de saldo')
    await dialogo.getByRole('button', { name: 'Registrar correção' }).click()
    await expect(dialogo.getByText(/Saldo insuficiente\. Disponível neste lote: 12 L/)).toBeVisible()
  })
})
