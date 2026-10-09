import { abrirCaixa, esperarSincronizado, indicadorSync, ler, novaVenda, pagar } from '../apoio/pdv.ts'
import { expect, test } from '../base.ts'

// Aplicativo instalado (service worker ligado): o caixa recarrega e vende sem internet.
test('caixa recarrega a página sem internet e continua vendendo', async ({ page, context, supabase, servidor, conta }) => {
  await abrirCaixa(page)
  await esperarSincronizado(page)
  // Espera o aplicativo ficar guardado no aparelho e assumir a página
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  supabase.semRede = true
  await context.setOffline(true)
  await page.reload() // sem internet: a página vem do aparelho
  await expect(page.getByLabel('Código do produto')).toBeVisible()
  await ler(page, '7891000000014')
  await pagar(page)
  await novaVenda(page)
  await expect(indicadorSync(page)).toContainText('Offline')

  supabase.semRede = false
  await context.setOffline(false)
  await esperarSincronizado(page)
  const [{ n }] = await servidor.sql<{ n: number }>('select count(*)::int as n from public.vendas where empresa_id = $1', [conta.empresaId])
  expect(n).toBe(1)
})
