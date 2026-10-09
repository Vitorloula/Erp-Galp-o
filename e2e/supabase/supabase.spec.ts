import type { Page } from '@playwright/test'
import { dataDaqui, escolherProduto, expect, linhasEstoque, test as base, toast } from '../base'
import { SupabaseFalso } from './falso'

// Modo produção (VITE_SUPABASE_URL configurado) contra um Supabase simulado.
const test = base.extend<{ supabase: SupabaseFalso }>({
  supabase: [
    async ({ page }, use) => {
      const falso = new SupabaseFalso()
      await falso.instalar(page)
      await use(falso)
      expect(falso.inesperadas, 'o app chamou rotas que o Supabase não tem').toEqual([])
    },
    { auto: true },
  ],
})

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/painel')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click()
}

test.describe('Acesso', () => {
  test('senha errada mostra mensagem clara', async ({ page, supabase }) => {
    await entrar(page, 'admin@galpao.test', 'errada')
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    expect(supabase.chamadas('POST', '/auth/v1/token')).toHaveLength(1)
  })

  test('administrador entra, vê os dados do servidor e continua logado ao reabrir', async ({ page, supabase }) => {
    await page.goto('/painel')
    await expect(page.getByText('Agro Teste')).toBeVisible() // nome da empresa vindo da configuração
    await expect(page.getByText('Modo demonstração')).toHaveCount(0)
    await entrar(page, 'admin@galpao.test', 'admin123')
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Estoque zerado/ })).toContainText('2')
    await expect(page.locator('aside').getByText('Administrador', { exact: true })).toBeVisible()
    await expect(page.locator('aside').getByRole('link', { name: 'Usuários' })).toBeVisible()

    // paginação: o app pede de 1000 em 1000
    const produtos = supabase.chamadas('GET', '/rest/v1/produtos')[0]
    expect(produtos.busca.get('offset')).toBe('0')
    expect(produtos.busca.get('limit')).toBe('1000')
    expect(produtos.cabecalhos['authorization']).toMatch(/^Bearer /)

    await page.reload()
    await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible()
    await expect(page.getByLabel('Senha')).toHaveCount(0)
  })

  test('solicitar acesso cria a conta e pede confirmação do e-mail', async ({ page, supabase }) => {
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Solicitar acesso' }).click()
    await page.getByLabel('Seu nome').fill('Maria Pátio')
    await page.getByLabel('E-mail').fill('maria@galpao.test')
    await page.getByLabel('Senha').fill('segredo1')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible()
    await expect(page.getByText('maria@galpao.test')).toBeVisible()
    const [cadastro] = supabase.chamadas('POST', '/auth/v1/signup')
    expect(cadastro.corpo).toMatchObject({ email: 'maria@galpao.test', password: 'segredo1', data: { nome: 'Maria Pátio' } })
    expect(supabase.usuario('maria@galpao.test').papel).toBe('pendente')
  })

  test('e-mail já cadastrado ao solicitar acesso', async ({ page }) => {
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Solicitar acesso' }).click()
    await page.getByLabel('Seu nome').fill('João')
    await page.getByLabel('E-mail').fill('joao@galpao.test')
    await page.getByLabel('Senha').fill('qualquer1')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('Este e-mail já tem cadastro. Use "Entrar".')).toBeVisible()
  })

  test('conta pendente espera a liberação e entra assim que for liberada', async ({ page, supabase }) => {
    await entrar(page, 'carlos@galpao.test', 'carlos123')
    await expect(page.getByRole('heading', { name: 'Aguardando liberação' })).toBeVisible()
    await page.getByRole('button', { name: 'Já fui liberado' }).click()
    await expect(page.getByRole('heading', { name: 'Aguardando liberação' })).toBeVisible()

    supabase.usuario('carlos@galpao.test').papel = 'operador' // administrador liberou
    await page.getByRole('button', { name: 'Já fui liberado' }).click()
    await expect(page.getByRole('heading', { name: /Carlos/ })).toBeVisible()
    await expect(page.locator('aside').getByText('Operador', { exact: true })).toBeVisible()
  })

  test('sair encerra a sessão neste aparelho', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await expect(page.getByRole('heading', { name: /João/ })).toBeVisible()
    await page.locator('aside').getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByLabel('Senha')).toBeVisible()
    expect(supabase.chamadas('POST', '/auth/v1/logout')).toHaveLength(1)
    await page.reload()
    await expect(page.getByLabel('Senha')).toBeVisible()
  })

  test('sem internet ao abrir o app: abre na hora com o perfil salvo, avisa e se recupera', async ({ page, supabase }) => {
    test.setTimeout(60_000)
    await entrar(page, 'joao@galpao.test', 'joao123')
    await expect(page.getByRole('heading', { name: /João/ })).toBeVisible()
    supabase.semRede = true
    await page.reload()
    // Abre imediatamente (não espera o servidor para saber quem é o usuário)
    await expect(page.locator('aside').getByText('João Operador')).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('Aguardando liberação')).toHaveCount(0)
    // A biblioteca tenta 3 vezes (1 s + 2 s + 4 s) antes de desistir
    await expect(page.getByText(/Não foi possível atualizar os dados: Sem conexão com o servidor/)).toBeVisible({ timeout: 25_000 })

    supabase.semRede = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByText(/Não foi possível atualizar os dados/)).toBeHidden()
    await expect(page.getByRole('button', { name: /Estoque zerado/ })).toContainText('2')
  })

  test('papel alterado pelo administrador vale ao reabrir o app', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await expect(page.locator('aside').getByText('Operador', { exact: true })).toBeVisible()
    supabase.usuario('joao@galpao.test').papel = 'admin'
    await page.reload()
    await expect(page.locator('aside').getByText('Administrador', { exact: true })).toBeVisible()
    await expect(page.locator('aside').getByRole('link', { name: 'Usuários' })).toBeVisible()
  })
})

test.describe('Permissões do operador', () => {
  test('não vê funções de administrador', async ({ page }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await expect(page.getByRole('heading', { name: /João/ })).toBeVisible()
    await expect(page.locator('aside').getByRole('link', { name: 'Usuários' })).toHaveCount(0)
    await page.goto('/usuarios')
    await expect(page).toHaveURL(/\/painel$/)

    await page.goto('/produtos')
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Atrazina 500 SC' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Corrigir número do lote/ })).toHaveCount(0)
  })

  test('operador cadastra produto; duplicado mostra erro amigável', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const d = page.getByRole('dialog', { name: 'Novo produto' })
    await d.getByLabel('Nome do produto *').fill('Inseticida X')
    await d.getByLabel('Código de barras').fill('7891000000014') // já é do Glifosato
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('Já existe um produto com este código de barras.')).toBeVisible()

    await d.getByLabel('Código de barras').fill('7890000000001')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, /Produto cadastrado \(P0013\)/)).toBeVisible()
    const envios = supabase.chamadas('POST', '/rest/v1/produtos')
    expect(envios.at(-1)!.corpo).toMatchObject({ nome: 'Inseticida X', codigo_barras: '7890000000001', unidade: 'L', ativo: true })
  })
})

test.describe('Movimentações pela API', () => {
  test('entrada usa a função registrar_entrada com os parâmetros certos', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await page.goto('/movimentar?tipo=entrada')
    await escolherProduto(page, 'Glifosato')
    const validade = dataDaqui(300)
    await page.getByLabel('Lote').fill('gl-99')
    await page.getByLabel('Validade').fill(validade.iso)
    await page.getByLabel('Quantidade recebida').fill('15,5')
    await page.getByLabel('Nota fiscal / documento').fill('NF 555')
    await page.getByRole('button', { name: 'Registrar entrada de 15,5 L' }).click()
    await expect(toast(page, /Entrada registrada: \+15,5 L/)).toBeVisible()

    const [rpc] = supabase.chamadas('POST', '/rest/v1/rpc/registrar_entrada')
    const glifosato = (await supabase.repo.listarProdutos()).find(p => p.nome.startsWith('Glifosato'))!
    expect(rpc.corpo).toEqual({
      p_produto_id: glifosato.id, p_lote: 'gl-99', p_validade: validade.iso, p_quantidade: 15.5, p_documento: 'NF 555', p_observacao: '',
    })
    await page.goto('/historico')
    await expect(page.locator('[data-mov]').first()).toContainText('João Operador')
  })

  test('saída concorrente: o servidor recusa e o app explica', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await page.goto('/movimentar?tipo=saida')
    await escolherProduto(page, 'Mancozebe')
    await expect(page.getByRole('radio', { name: /MZ0325/ })).toBeChecked()

    // Outro aparelho retira 70 kg enquanto este operador preenche a tela
    const lote = (await supabase.repo.listarLotes()).find(l => l.lote === 'MZ0325')!
    await supabase.repo.registrarSaida({ loteId: lote.lote_id, quantidade: 70 })

    await page.getByLabel('Quantidade a retirar').fill('10')
    await page.getByRole('button', { name: 'Dar baixa de 10 kg' }).click()
    await expect(page.getByText('Saldo insuficiente. Disponível neste lote: 5 kg')).toBeVisible()
    const [envio] = supabase.chamadas('POST', '/rest/v1/movimentacoes')
    expect(envio.corpo).toMatchObject({ tipo: 'SAIDA', lote_id: lote.lote_id, quantidade: 10 })
  })

  test('correção pelo histórico envia o vínculo com o lançamento original', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await page.goto('/historico')
    const original = page.locator('[data-mov]').filter({ hasText: 'Romaneio 58' })
    const id = Number(await original.getAttribute('data-mov'))
    await original.locator('button[title="Lançar correção"]').click()
    const d = page.getByRole('dialog', { name: `Corrigir lançamento #${id}` })
    await expect(d).toContainText('Saída de 20 sc')
    await d.getByLabel('Quantidade correta da saída').fill('18')
    await d.getByLabel('Motivo da correção *').fill('Contei errado')
    await d.getByRole('button', { name: 'Registrar correção' }).click()
    await expect(toast(page, /Correção #\d+ registrada \(\+2 sc\)/)).toBeVisible()

    // Antes de corrigir, o app consultou correções anteriores daquele lançamento
    expect(supabase.chamadas('GET', '/rest/v1/movimentacoes').some(r => r.busca.get('referencia_id') === `eq.${id}`)).toBe(true)
    const [envio] = supabase.chamadas('POST', '/rest/v1/movimentacoes')
    expect(envio.corpo).toMatchObject({ tipo: 'CORRECAO', quantidade: 2, observacao: 'Contei errado', referencia_id: id })
  })

  test('relatório busca o período no servidor e fecha com o estoque', async ({ page, supabase }) => {
    await entrar(page, 'admin@galpao.test', 'admin123')
    await page.goto('/relatorios')
    await page.getByRole('button', { name: 'Últimos 30 dias' }).click()
    await expect(page.locator('main table tbody tr')).toHaveCount(12)
    const consulta = supabase.chamadas('GET', '/rest/v1/movimentacoes').find(r => r.busca.getAll('criado_em').some(c => c.startsWith('gte.')))
    expect(consulta, 'consulta com filtro de data').toBeTruthy()
  })
})

test.describe('Tempo real', () => {
  test('assina as tabelas certas e atualiza a tela quando outro aparelho lança', async ({ page, supabase }) => {
    await entrar(page, 'joao@galpao.test', 'joao123')
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toContainText('260')
    await expect.poll(() => supabase.canais.length).toBeGreaterThan(0)
    expect([...supabase.canais.at(-1)!.tabelas].sort()).toEqual(['lotes', 'movimentacoes', 'produtos'])

    // Outro aparelho dá baixa de 60 L; o banco avisa pelo canal em tempo real
    const lote = (await supabase.repo.listarLotes()).find(l => l.lote === 'GL2508')!
    await supabase.repo.registrarSaida({ loteId: lote.lote_id, quantidade: 60 })
    supabase.emitirMudanca('movimentacoes')
    await expect(linhasEstoque(page)).toContainText('200')
  })
})

test.describe('Administração', () => {
  test('libera um usuário pendente na tela Usuários', async ({ page, supabase }) => {
    await entrar(page, 'admin@galpao.test', 'admin123')
    await page.goto('/usuarios')
    await expect(page.getByText('1 pessoa(s) aguardando liberação.')).toBeVisible()
    await expect(page.getByLabel('Acesso de Ana Admin')).toBeDisabled()
    await page.getByLabel('Acesso de Carlos Novo').selectOption('operador')
    await expect(toast(page, 'Carlos Novo: Operador.')).toBeVisible()
    expect(supabase.usuario('carlos@galpao.test').papel).toBe('operador')
    const [patch] = supabase.chamadas('PATCH', '/rest/v1/perfis')
    expect(patch.corpo).toEqual({ papel: 'operador' })
    expect(patch.busca.get('id')).toBe(`eq.${supabase.usuario('carlos@galpao.test').id}`)
  })

  test('administrador edita produto via API', async ({ page, supabase }) => {
    await entrar(page, 'admin@galpao.test', 'admin123')
    await page.goto('/produtos')
    await page.getByRole('link', { name: /Ureia/ }).click()
    await page.getByRole('button', { name: 'Editar' }).click()
    const d = page.getByRole('dialog', { name: 'Editar produto' })
    await d.getByLabel('Fabricante').fill('Fertimais Ltda')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page, 'Produto atualizado.')).toBeVisible()
    await expect(page.getByText('Fertimais Ltda')).toBeVisible()
    const [patch] = supabase.chamadas('PATCH', '/rest/v1/produtos')
    expect(patch.corpo).toMatchObject({ fabricante: 'Fertimais Ltda' })
  })
})
