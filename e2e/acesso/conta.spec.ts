import type { Page } from '@playwright/test'
import { SENHA_TESTE, criarDonoComExemplo } from '../apoio/supabase.ts'
import { expect, testeSemLogin as test, toast } from '../base.ts'

async function entrar(page: Page, email: string, senha = SENHA_TESTE) {
  await page.goto('/painel')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click()
}

async function criarConta(page: Page, nome: string, email: string, senha = SENHA_TESTE) {
  await page.getByRole('button', { name: 'Criar conta' }).first().click()
  await page.getByLabel('Seu nome').fill(nome)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Criar conta' }).last().click()
}

test.describe('Login', () => {
  test('senha errada mostra mensagem clara', async ({ page, servidor, supabase }) => {
    const dono = await criarDonoComExemplo(servidor)
    await entrar(page, dono.email, 'errada')
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    expect(supabase.chamadas('POST', '/auth/v1/token')).toHaveLength(1)
  })

  test('dono entra, vê a empresa e continua logado ao reabrir', async ({ page, servidor, supabase }) => {
    const dono = await criarDonoComExemplo(servidor)
    await entrar(page, dono.email)
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
    await expect(page.locator('aside').getByText('Agro Exemplo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Estoque zerado/ })).toContainText('2')

    // Toda chamada leva a chave pública e o token do usuário; o app pagina de 1000 em 1000
    const produtos = supabase.chamadas('GET', '/rest/v1/produtos')[0]
    expect(produtos.cabecalhos['apikey']).toBeTruthy()
    expect(produtos.cabecalhos['authorization']).toMatch(/^Bearer ey/)
    expect(produtos.busca.get('empresa_id')).toBe(`eq.${dono.empresaId}`)
    expect(produtos.busca.get('limit')).toBe('1000')

    await page.reload()
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
    await expect(page.getByLabel('Senha')).toHaveCount(0)
  })

  test('sair encerra a sessão só neste aparelho', async ({ page, servidor, supabase }) => {
    const dono = await criarDonoComExemplo(servidor)
    await entrar(page, dono.email)
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
    await page.locator('aside').getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByLabel('Senha')).toBeVisible()
    const [saida] = supabase.chamadas('POST', '/auth/v1/logout')
    expect(saida.busca.get('scope')).toBe('local')
    await page.reload()
    await expect(page.getByLabel('Senha')).toBeVisible()
  })

  test('sem internet ao abrir o app: abre na hora com o que está no aparelho, avisa e se recupera', async ({ page, servidor, supabase }) => {
    test.setTimeout(60_000)
    const dono = await criarDonoComExemplo(servidor)
    await entrar(page, dono.email)
    await expect(page.getByRole('button', { name: /Estoque zerado/ })).toContainText('2')
    supabase.semRede = true
    await page.reload()
    // Abre imediatamente com perfil, empresa e loja guardados neste aparelho
    await expect(page.locator('aside').getByText('Ana Teste')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('aside').getByText('Agro Exemplo')).toBeVisible()
    // A biblioteca tenta 3 vezes (1 s + 2 s + 4 s) antes de desistir
    await expect(page.getByText(/Não foi possível atualizar os dados: Sem conexão com o servidor/)).toBeVisible({ timeout: 25_000 })

    supabase.semRede = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByText(/Não foi possível atualizar os dados/)).toBeHidden()
    await expect(page.getByRole('button', { name: /Estoque zerado/ })).toContainText('2')
  })
})

test.describe('Cadastro e primeira empresa', () => {
  test('cria a conta, confirma o e-mail pelo link e cadastra a empresa escolhendo o segmento', async ({ page, servidor, supabase }) => {
    await page.goto('/painel')
    await criarConta(page, 'Maria Pátio', 'maria@teste.local')
    await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible()
    const [cadastro] = supabase.chamadas('POST', '/auth/v1/signup')
    expect(cadastro.corpo).toMatchObject({ email: 'maria@teste.local', data: { nome: 'Maria Pátio' } })

    // O link do e-mail volta para o sistema já logado
    const email = servidor.emails.find(e => e.para === 'maria@teste.local' && e.tipo === 'signup')!
    await page.goto(email.link)
    await expect(page.getByRole('heading', { name: 'Bem-vindo, Maria!' })).toBeVisible()

    await page.getByLabel('Nome da empresa *').fill('Agro Santa Rita')
    await page.getByText('Galpão / distribuidora').click()
    await page.getByLabel('Nome da loja ou do galpão').fill('Galpão 1')
    await page.getByRole('button', { name: /Criar empresa/ }).click()
    await expect(toast(page, 'Empresa Agro Santa Rita criada. Bom trabalho!')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Maria/ })).toBeVisible()
    await expect(page.locator('aside').getByText('Agro Santa Rita')).toBeVisible()
    await expect(page.getByText(/Teste grátis/)).toHaveCount(0) // sem aviso enquanto está em dia

    // Categorias do segmento já vêm prontas
    await page.goto('/produtos')
    await expect(page.getByLabel('Categoria')).toContainText('Defensivo agrícola')
    await expect(page.getByText('0 produtos ativos')).toBeVisible()
  })

  test('conhecer o sistema com a empresa de exemplo', async ({ page, servidor }) => {
    await page.goto('/painel')
    await criarConta(page, 'Rui Curioso', 'rui@teste.local')
    await page.goto(servidor.emails.find(e => e.para === 'rui@teste.local')!.link)
    await page.getByRole('button', { name: 'Conhecer com dados de exemplo' }).click()
    await expect(toast(page, 'Empresa de exemplo criada. Explore à vontade!')).toBeVisible()
    await expect(page.getByText('Empresa de exemplo:')).toBeVisible()
    await expect(page.getByRole('button', { name: /Vencidos/ })).toContainText('2')
  })

  test('e-mail já cadastrado', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    await page.goto('/painel')
    await criarConta(page, 'Outra Pessoa', dono.email)
    await expect(page.getByText('Este e-mail já tem cadastro. Use "Entrar".')).toBeVisible()
  })

  test('esqueci minha senha: o link leva a definir uma nova', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
    await page.getByLabel('E-mail').fill(dono.email)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible()

    await page.goto(servidor.emails.find(e => e.para === dono.email && e.tipo === 'recovery')!.link)
    await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible()
    await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-1')
    await page.getByLabel('Repita a nova senha').fill('outra-coisa')
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(page.getByText('As senhas não conferem.')).toBeVisible()
    await page.getByLabel('Repita a nova senha').fill('nova-senha-1')
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(toast(page, 'Senha alterada.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()

    await page.locator('aside').getByRole('button', { name: 'Sair' }).click()
    await entrar(page, dono.email, 'nova-senha-1')
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
  })
})
