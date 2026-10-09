import { expect, test, type Page } from '@playwright/test'
import { escolherProduto, linhasEstoque, toast } from '../base.ts'

// Servidor local de teste (npm run dev sem .env): dois aparelhos — computador e celular —
// usando o mesmo banco pelo servidor do PC, com WebSocket de verdade e dados persistidos.

function vigiarErros(page: Page, erros: string[]) {
  page.on('pageerror', e => erros.push(`[pageerror] ${e.message}`))
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push(m.text())
  })
}

async function criarConta(page: Page, nome: string, email: string, senha: string) {
  await page.getByRole('button', { name: 'Criar conta' }).first().click()
  await page.getByLabel('Seu nome').fill(nome)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Criar conta' }).last().click()
}

test('computador e celular compartilham o mesmo banco, em tempo real', async ({ browser }) => {
  test.setTimeout(90_000)
  const erros: string[] = []
  const computador = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
  const celular = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  vigiarErros(computador, erros)
  vigiarErros(celular, erros)

  // 1. No computador: cria a conta (sem confirmação de e-mail no servidor local) e a empresa de exemplo
  await computador.goto('/painel')
  await criarConta(computador, 'Gerente Teste', 'gerente@teste.local', 'teste-gerente-1')
  await computador.getByRole('button', { name: 'Conhecer com dados de exemplo' }).click()
  await expect(computador.getByRole('button', { name: /Produtos com saldo/ })).toContainText('10')

  // 2. Convida o celular do pátio pela tela Equipe
  await computador.goto('/equipe')
  await computador.getByRole('button', { name: 'Convidar pessoa' }).click()
  await computador.getByRole('button', { name: 'Criar link de convite' }).click()
  const link = await computador.getByLabel('Link do convite').inputValue()

  // 3. No celular: abre o link, cria a conta e aceita o convite
  await celular.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await criarConta(celular, 'Operador Pátio', 'patio@teste.local', 'teste-patio-1')
  await celular.getByRole('button', { name: 'Aceitar convite' }).click()
  await expect(toast(celular, /Você entrou na equipe/)).toBeVisible()

  // 4. Computador fica olhando o estoque; o celular dá baixa
  await computador.goto('/estoque')
  await computador.getByLabel('Buscar').fill('Glifosato')
  await expect(linhasEstoque(computador)).toContainText('260')

  await celular.goto('/movimentar?tipo=saida')
  await escolherProduto(celular, 'Glifosato')
  await celular.getByLabel('Quantidade a retirar').fill('10')
  await celular.getByRole('button', { name: 'Dar baixa de 10 L' }).click()
  await expect(toast(celular, /Saída registrada/)).toBeVisible()

  // 5. O computador atualiza sozinho (tempo real) e o histórico mostra quem lançou
  await expect(linhasEstoque(computador)).toContainText('250')
  await computador.goto('/historico')
  await expect(computador.locator('[data-mov]').first()).toContainText('Operador Pátio')

  // 6. Os dados ficam no servidor: reabrir o app no celular mostra o mesmo saldo
  await celular.goto('/estoque')
  await celular.getByLabel('Buscar').fill('Glifosato')
  await expect(linhasEstoque(celular)).toContainText('250')

  expect(erros, 'erros de JavaScript/console').toEqual([])
})
