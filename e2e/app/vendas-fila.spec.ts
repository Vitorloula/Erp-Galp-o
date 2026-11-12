import type { Page } from '@playwright/test'
import { abrirCaixa, esperarSincronizado, ler, novaVenda, pagar } from '../apoio/pdv.ts'
import { expect, test, toast } from '../base.ts'

// Fila NFC-e: vendas concluídas com nota pendente ou com erro (aba em /vendas).
// Cada teste cria a própria empresa de exemplo; a venda nasce no PDV (emissor stub = pendente).

const linhaDaFila = (page: Page, rotulo = '01-000001') => page.locator(`[data-fila-venda="${rotulo}"]`)

async function abrirFila(page: Page) {
  await page.goto('/vendas')
  await page.getByRole('button', { name: 'Fila NFC-e' }).click()
}

/** Vende um Glifosato no caixa (mesmo caminho do pdv.spec) e espera a sincronização. */
async function venderNoCaixa(page: Page) {
  await abrirCaixa(page)
  await ler(page, '7891000000014')
  await pagar(page)
  await novaVenda(page)
  await esperarSincronizado(page)
}

test.describe('Fila NFC-e', () => {
  test('venda feita no PDV aparece na fila como pendente', async ({ page }) => {
    await venderNoCaixa(page)
    await abrirFila(page)

    await expect(linhaDaFila(page)).toContainText('Nota pendente')
    await expect(page.getByText('1 pendentes · 0 com erro')).toBeVisible()
  })

  test('venda com erro mostra o badge e o motivo do erro', async ({ page, supabase, conta }) => {
    await venderNoCaixa(page)
    await supabase.servidor.sql(
      `update public.vendas set nfce_status = 'erro', nfce_erro = $1 where empresa_id = $2 and numero = 1`,
      ['Rejeição 539: duplicidade de NF-e com diferença na chave de acesso', conta.empresaId],
    )
    await abrirFila(page)

    const linha = linhaDaFila(page)
    await expect(linha).toContainText('Nota com erro')
    await linha.getByRole('button', { name: /Ver detalhe do erro/ }).click()
    const detalhe = page.getByRole('dialog', { name: /Fila NFC-e/ })
    await expect(detalhe).toContainText('Motivo do erro')
    await expect(detalhe).toContainText('Rejeição 539: duplicidade de NF-e')
  })

  test('Reemitir com o emissor desligado avisa e não muda o status', async ({ page }) => {
    await venderNoCaixa(page)
    await abrirFila(page)

    const linha = linhaDaFila(page)
    await linha.getByRole('button', { name: /Reemitir NFC-e da venda 01-000001/ }).click()
    await expect(page.getByText('Integração NFC-e não configurada')).toBeVisible()
    await expect(linha).toContainText('Nota pendente')

    // O mesmo aviso precisa aparecer dentro do modal de detalhe (ação de dentro dele).
    await linha.getByRole('button', { name: /Ver venda 01-000001/ }).click()
    const detalhe = page.getByRole('dialog', { name: /Fila NFC-e/ })
    await detalhe.getByRole('button', { name: 'Reemitir', exact: true }).click()
    await expect(detalhe.getByText('Integração NFC-e não configurada')).toBeVisible()
    await expect(linha).toContainText('Nota pendente')
  })

  test('Marcar resolvida com motivo tira a venda da fila', async ({ page, supabase, conta }) => {
    await venderNoCaixa(page)
    await supabase.servidor.sql(
      `update public.vendas set nfce_status = 'erro', nfce_erro = $1 where empresa_id = $2 and numero = 1`,
      ['Rejeição 204: duplicidade de NF-e', conta.empresaId],
    )
    await abrirFila(page)

    const linha = linhaDaFila(page)
    await expect(linha).toContainText('Nota com erro')
    await linha.getByRole('button', { name: /Marcar venda 01-000001 como resolvida/ }).click()

    const modal = page.getByRole('dialog', { name: /Marcar venda 01-000001 como resolvida/ })
    await modal.getByLabel(/Motivo da resolução/).fill('Nota emitida por outro sistema')
    await modal.getByRole('button', { name: 'Marcar como resolvida' }).click()

    await expect(toast(page, /marcada como resolvida/)).toBeVisible()
    await expect(linhaDaFila(page)).toHaveCount(0)
    await expect(page.getByText('Sem vendas na fila da NFC-e')).toBeVisible()

    // O estado terminal aparece na lista normal de vendas.
    await page.getByRole('button', { name: 'Vendas', exact: true }).click()
    await expect(page.locator('[data-venda="01-000001"]')).toContainText('Nota resolvida')
  })
})
