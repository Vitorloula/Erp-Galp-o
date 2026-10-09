import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { SupabaseLocal } from '../servidor-local/supabase-local.ts'
import { formatarValidade, hojeISO, somarDias } from '../src/lib/formato.ts'
import { ConexaoTeste, criarDonoComExemplo, criarServidor, entrarComo, type Conta } from './apoio/supabase.ts'

interface Fixtures {
  errosConsole: string[]
  /** Ligação deste teste com o "Supabase" (requisições feitas, simular falta de rede...). */
  supabase: ConexaoTeste
}

/**
 * Teste sem login: falha se a página tiver qualquer erro de JavaScript ou no console
 * (respostas HTTP de erro esperadas, como 400 de senha errada, são ignoradas).
 */
export const testeSemLogin = base.extend<Fixtures, { servidor: SupabaseLocal }>({
  servidor: [
    async ({}, use) => {
      const servidor = await criarServidor()
      await use(servidor)
      await servidor.fechar()
    },
    { scope: 'worker', timeout: 60_000 },
  ],
  supabase: [
    async ({ context, servidor }, use) => {
      const conexao = new ConexaoTeste(servidor)
      await conexao.instalar(context)
      await use(conexao)
      expect(conexao.inesperadas, 'o app chamou rotas que o Supabase não tem').toEqual([])
    },
    { auto: true },
  ],
  errosConsole: [
    async ({ page }, use) => {
      const erros: string[] = []
      page.on('pageerror', e => erros.push(`[pageerror] ${e.message}`))
      page.on('console', m => {
        if (m.type() !== 'error') return
        const t = m.text()
        if (/Failed to load resource|fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_CONNECTION_RESET/.test(t)) return
        erros.push(t)
      })
      await use(erros)
      expect(erros, 'erros de JavaScript/console durante o teste').toEqual([])
    },
    { auto: true },
  ],
})

/**
 * Teste já logado como dono de uma empresa de exemplo NOVA (mesmos dados da antiga
 * demonstração: 12 produtos, lotes vencidos, vencendo e zerados, 60 dias de histórico).
 */
export const test = testeSemLogin.extend<{ conta: Conta & { empresaId: string } }>({
  conta: [
    // depende de "supabase": o app só abre depois que a ligação com o servidor está instalada
    async ({ page, servidor, supabase: _supabase }, use) => {
      const conta = await criarDonoComExemplo(servidor)
      await entrarComo(page, servidor, conta.usuarioId)
      await use(conta)
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
