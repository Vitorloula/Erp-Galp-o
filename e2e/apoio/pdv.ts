import { expect, type Page } from '@playwright/test'
import type { SupabaseLocal } from '../../servidor-local/supabase-local.ts'

/** Abre a tela do caixa, escolhe o caixa (primeira vez no aparelho) e abre a sessão. */
export async function abrirCaixa(page: Page, abertura = '100', caixa = 'Caixa 01') {
  await page.goto('/pdv')
  await page.getByRole('button', { name: caixa }).click()
  await page.getByLabel('Dinheiro na gaveta para troco (R$)').fill(abertura)
  await page.getByRole('button', { name: 'Abrir caixa' }).click()
  await expect(page.getByLabel('Código do produto')).toBeFocused()
}

/** Passa um código no leitor (digita + Enter, como o leitor USB). */
export async function ler(page: Page, codigo: string) {
  await page.getByLabel('Código do produto').fill(codigo)
  await page.getByLabel('Código do produto').press('Enter')
}

/** Pagamento: cada valor é [forma, valor]; valor vazio = o que falta. Conclui no fim. */
export async function pagar(page: Page, pagamentos: [string, string][] = [['Dinheiro', '']]) {
  await page.getByRole('button', { name: 'Pagar' }).click()
  const tela = page.getByRole('dialog', { name: 'Pagamento' })
  for (const [forma, valor] of pagamentos) {
    await tela.getByLabel(/Valor recebido/).fill(valor)
    await tela.getByRole('button', { name: new RegExp('^' + forma) }).click()
  }
  await tela.getByRole('button', { name: /Concluir venda/ }).click()
  await expect(page.getByRole('dialog', { name: 'Venda concluída' })).toBeVisible()
}

export async function novaVenda(page: Page) {
  await page.getByRole('button', { name: 'Nova venda' }).click()
  await expect(page.getByLabel('Código do produto')).toBeFocused()
}

export const indicadorSync = (page: Page) => page.locator('[data-sync]')

export async function esperarSincronizado(page: Page) {
  await expect(indicadorSync(page)).toHaveText('Sincronizado', { timeout: 15_000 })
}

/** Produto novo com estoque na loja da empresa (direto no banco, como o dono faria). */
export async function produtoComEstoque(servidor: SupabaseLocal, donoId: string, empresaId: string, dados: Record<string, unknown>, quantidade: number, codigos: string[] = []) {
  return servidor.comoUsuario(donoId, async tx => {
    const id = (await tx.query<{ id: string }>('select public.salvar_produto($1, null, $2, $3) as id', [empresaId, dados, JSON.stringify(codigos.map(codigo => ({ codigo })))])).rows[0].id
    const [{ loja }] = (await tx.query<{ loja: string }>('select id as loja from public.lojas where empresa_id = $1 limit 1', [empresaId])).rows
    if (quantidade) await tx.query(`select public.registrar_entrada($1, $2, '', null, $3)`, [loja, id, quantidade])
    return id
  })
}

export async function saldo(servidor: SupabaseLocal, produtoId: string) {
  const [{ s }] = await servidor.sql<{ s: string | null }>('select sum(saldo) as s from public.estoque_saldos where produto_id = $1', [produtoId])
  return Number(s ?? 0)
}
