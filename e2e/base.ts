import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { formatarValidade, hojeISO, somarDias } from '../src/lib/formato'

/**
 * Teste base: falha se a página tiver qualquer erro de JavaScript ou erro no console.
 * (Respostas HTTP de erro esperadas, como 400 de senha errada, são ignoradas.)
 */
export const test = base.extend<{ errosConsole: string[] }>({
  errosConsole: [
    async ({ page }, use) => {
      const erros: string[] = []
      page.on('pageerror', e => erros.push(`[pageerror] ${e.message}`))
      page.on('console', m => {
        if (m.type() !== 'error') return
        const t = m.text()
        if (/Failed to load resource|fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(t)) return
        erros.push(t)
      })
      await use(erros)
      expect(erros, 'erros de JavaScript/console durante o teste').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export const ehCelular = (info: TestInfo) => info.project.name.includes('celular') || info.project.name.startsWith('camera')

/** Data local daqui a N dias (AAAA-MM-DD) e como o sistema a exibe ("out./26"). */
export function dataDaqui(dias: number) {
  const iso = somarDias(hojeISO(), dias)
  return { iso, exibida: formatarValidade(iso) }
}

/** Linhas da tela de estoque visíveis (tabela no computador, cartões no celular). */
export const linhasEstoque = (page: Page) => page.locator('[data-linha-estoque]:visible')

export const toast = (page: Page, texto: string | RegExp) => page.locator('[aria-live="polite"]').getByText(texto)

/** Busca e escolhe um produto na tela Movimentar. */
export async function escolherProduto(page: Page, termo: string, nome: string | RegExp = termo) {
  await page.getByLabel('Buscar produto').fill(termo)
  await page.getByRole('button', { name: nome }).first().click()
}

export async function abrirMovimentar(page: Page, tipo: 'entrada' | 'saida' | 'ajuste', produto?: string) {
  await page.goto(`/movimentar?tipo=${tipo}`)
  if (produto) await escolherProduto(page, produto)
}

/** Lê o saldo total exibido no cartão do produto selecionado em Movimentar. */
export async function saldoNoCartao(page: Page): Promise<string> {
  return (await page.getByText(/^Saldo:/).first().innerText()).replace(/\s+/g, ' ')
}

export async function semRolagemHorizontal(page: Page) {
  const { largura, rolagem } = await page.evaluate(() => ({ largura: window.innerWidth, rolagem: document.documentElement.scrollWidth }))
  expect(rolagem, 'a página não pode ter rolagem horizontal').toBeLessThanOrEqual(largura)
}

export async function valorKpi(card: Locator): Promise<number> {
  return Number((await card.locator('span.text-2xl').innerText()).trim())
}
