import { ConexaoTeste, adicionarMembro, criarDonoComExemplo, entrarComo } from '../apoio/supabase.ts'
import { expect, linhasEstoque, testeSemLogin as test, toast } from '../base.ts'

test.describe('Convite', () => {
  test('dono convida pelo link; a pessoa cria a conta, confirma o e-mail e entra na equipe', async ({ page, browser, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    await entrarComo(page, servidor, dono.usuarioId)
    await page.goto('/equipe')
    await page.getByRole('button', { name: 'Convidar pessoa' }).click()
    const d = page.getByRole('dialog', { name: 'Convidar pessoa' })
    await d.getByRole('radio', { name: /Estoquista/ }).check()
    await d.getByRole('button', { name: 'Criar link de convite' }).click()
    const link = await d.getByLabel('Link do convite').inputValue()

    // Outra pessoa, em outro aparelho, abre o link recebido pelo WhatsApp
    const aparelho = await browser.newContext()
    await new ConexaoTeste(servidor).instalar(aparelho)
    const convidado = await aparelho.newPage()
    await convidado.goto(link)
    await expect(convidado.getByText('Você foi convidado para Agro Exemplo como Estoquista.')).toBeVisible()
    await convidado.getByRole('button', { name: 'Criar conta' }).first().click()
    await convidado.getByLabel('Seu nome').fill('Edu Estoque')
    await convidado.getByLabel('E-mail').fill('edu@teste.local')
    await convidado.getByLabel('Senha').fill('senha-do-edu-1')
    await convidado.getByRole('button', { name: 'Criar conta' }).last().click()
    await expect(convidado.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible()

    await convidado.goto(servidor.emails.find(e => e.para === 'edu@teste.local')!.link)
    await expect(convidado.getByText('Você foi convidado para trabalhar em Agro Exemplo como Estoquista.')).toBeVisible()
    await convidado.getByRole('button', { name: 'Aceitar convite' }).click()
    await expect(toast(convidado, 'Você entrou na equipe de Agro Exemplo.')).toBeVisible()
    await expect(convidado.locator('aside').getByText('Estoquista', { exact: true })).toBeVisible()
    await expect(convidado.getByRole('button', { name: /Vencidos/ })).toContainText('2')
    await aparelho.close()

    await page.reload()
    await expect(page.getByLabel('Papel de Edu Estoque')).toHaveValue('estoquista')
    await expect(page.locator('[data-convite]')).toHaveCount(0) // convite já usado
  })

  test('link de convite já usado é recusado', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    const token = await servidor.comoUsuario(dono.usuarioId, async tx => (await tx.query<{ t: string }>(`select public.criar_convite($1, 'caixa') as t`, [dono.empresaId])).rows[0].t)
    await adicionarMembro(servidor, dono.usuarioId, dono.empresaId, 'caixa', 'Primeira Pessoa') // usa outro convite
    const outro = await criarDonoComExemplo(servidor, 'Bia Outra')
    await servidor.comoUsuario(outro.usuarioId, tx => tx.query('select public.aceitar_convite($1)', [token]))

    await entrarComo(page, servidor, (await criarDonoComExemplo(servidor, 'Caio Atrasado')).usuarioId)
    await page.goto(`/convite#${token}`)
    await expect(page.getByText(/Este convite para Agro Exemplo já foi usado/)).toBeVisible()
    await page.getByRole('button', { name: 'Agora não' }).click()
    await expect(page.getByRole('heading', { name: /Caio/ })).toBeVisible()
  })
})

test.describe('Papéis', () => {
  test('caixa consulta, mas não lança nem cadastra', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    const caixa = await adicionarMembro(servidor, dono.usuarioId, dono.empresaId, 'caixa', 'Carla Caixa')
    await entrarComo(page, servidor, caixa.usuarioId)
    await page.goto('/painel')
    await expect(page.locator('aside').getByText('Caixa', { exact: true })).toBeVisible()
    for (const item of ['Movimentar', 'Equipe']) await expect(page.locator('aside').getByRole('link', { name: item })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Vencidos/ })).toContainText('2')

    await page.goto('/movimentar')
    await expect(page.getByText('Seu acesso permite consultar o estoque, mas não lançar entradas e saídas.')).toBeVisible()
    await page.goto('/equipe')
    await expect(page).toHaveURL(/\/painel$/)
    await page.goto('/produtos')
    await expect(page.getByRole('button', { name: 'Novo produto' })).toHaveCount(0)
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Saída' })).toHaveCount(0)
    await page.goto('/historico')
    await expect(page.locator('button[title="Lançar correção"]')).toHaveCount(0)
  })

  test('estoquista lança e cadastra, mas não corrige lote nem mexe na equipe', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    const estoquista = await adicionarMembro(servidor, dono.usuarioId, dono.empresaId, 'estoquista', 'Edu Estoque')
    await entrarComo(page, servidor, estoquista.usuarioId)
    await page.goto('/produtos')
    await expect(page.getByRole('button', { name: 'Novo produto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Categorias' })).toHaveCount(0)
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Corrigir número do lote/ })).toHaveCount(0)
    await expect(page.locator('aside').getByRole('link', { name: 'Equipe' })).toHaveCount(0)

    await page.goto('/movimentar?tipo=saida')
    await page.getByLabel('Buscar produto').fill('Glifosato')
    await page.getByRole('button', { name: /Glifosato/ }).first().click()
    await page.getByLabel('Quantidade a retirar').fill('5')
    await page.getByRole('button', { name: 'Dar baixa de 5 L' }).click()
    await expect(toast(page, /Saída registrada/)).toBeVisible()
    await page.goto('/historico')
    await expect(page.locator('[data-mov]').first()).toContainText('Edu Estoque')
  })

  test('gerente convida estoquista e caixa, mas não outro gerente', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    const gerente = await adicionarMembro(servidor, dono.usuarioId, dono.empresaId, 'gerente', 'Gil Gerente')
    await entrarComo(page, servidor, gerente.usuarioId)
    await page.goto('/equipe')
    await expect(page.getByLabel('Papel de Ana Teste')).toBeDisabled() // só o dono altera papéis
    await page.getByRole('button', { name: 'Convidar pessoa' }).click()
    const d = page.getByRole('dialog', { name: 'Convidar pessoa' })
    await expect(d.getByRole('radio', { name: /Gerente/ })).toHaveCount(0)
    await expect(d.getByRole('radio', { name: /Caixa/ })).toBeVisible()
  })
})

test.describe('Isolamento e assinatura', () => {
  test('uma empresa não vê os produtos da outra, nem pelo endereço direto', async ({ page, servidor }) => {
    const a = await criarDonoComExemplo(servidor, 'Ana da A')
    const b = await criarDonoComExemplo(servidor, 'Beto da B')
    const [{ id }] = await servidor.sql<{ id: string }>(`select id from public.produtos where empresa_id = $1 and nome = 'Glifosato 480 SL'`, [a.empresaId])
    await servidor.sql(`update public.produtos set nome = 'Glifosato da B' where empresa_id = $1 and nome = 'Glifosato 480 SL'`, [b.empresaId])

    await entrarComo(page, servidor, b.usuarioId)
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toHaveCount(1)
    await expect(linhasEstoque(page)).toContainText('Glifosato da B')
    await page.goto(`/produtos/${id}`)
    await expect(page.getByText('Produto não encontrado')).toBeVisible()
  })

  test('assinatura vencida: tudo continua visível, mas fica somente para consulta', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    await servidor.sql(`update public.assinaturas set trial_ate = now() - interval '10 days' where empresa_id = $1`, [dono.empresaId])
    await entrarComo(page, servidor, dono.usuarioId)
    await page.goto('/painel')
    await expect(page.getByText(/Assinatura vencida\. O sistema está somente para consulta/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Vencidos/ })).toContainText('2')
    await expect(page.locator('aside').getByRole('link', { name: 'Movimentar' })).toHaveCount(0)
    await page.goto('/movimentar')
    await expect(page.getByText('A assinatura está vencida: o sistema está somente para consulta.')).toBeVisible()
    await page.goto('/empresa')
    await expect(page.getByText('Vencida: somente consulta')).toBeVisible()
  })

  test('assinatura em atraso (carência): avisa, mas continua lançando', async ({ page, servidor }) => {
    const dono = await criarDonoComExemplo(servidor)
    await servidor.sql(`update public.assinaturas set trial_ate = now() - interval '2 days' where empresa_id = $1`, [dono.empresaId])
    await entrarComo(page, servidor, dono.usuarioId)
    await page.goto('/painel')
    await expect(page.getByText(/Assinatura em atraso\./)).toBeVisible()
    await expect(page.locator('aside').getByRole('link', { name: 'Movimentar' })).toBeVisible()
  })
})
