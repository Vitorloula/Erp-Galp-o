import { adicionarMembro } from '../apoio/supabase.ts'
import { dataDaqui, escolherProduto, expect, linhasEstoque, test, toast } from '../base.ts'

// Testa o que o app envia ao Supabase e como reage às respostas do banco real.

/** Id de um lote da empresa (pelo número). */
async function lote(servidor: import('../../servidor-local/supabase-local.ts').SupabaseLocal, empresaId: string, numero: string) {
  const [l] = await servidor.sql<{ id: string; loja_id: string }>(
    `select l.id, (select id from public.lojas where empresa_id = $1 limit 1) as loja_id from public.lotes l where l.empresa_id = $1 and l.lote = $2`,
    [empresaId, numero],
  )
  return l
}

test.describe('Movimentações pela API', () => {
  test('entrada usa registrar_entrada com a loja e a chave anti-duplicidade', async ({ page, supabase, conta, servidor }) => {
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
    const [glifosato] = await servidor.sql<{ id: string }>(`select id from public.produtos where empresa_id = $1 and nome = 'Glifosato 480 SL'`, [conta.empresaId])
    const { loja_id } = await lote(servidor, conta.empresaId, 'GL2508')
    expect(rpc.corpo).toEqual({
      p_loja_id: loja_id, p_produto_id: glifosato.id, p_lote: 'gl-99', p_validade: validade.iso, p_quantidade: 15.5,
      p_documento: 'NF 555', p_observacao: null, p_origem_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await page.goto('/historico')
    await expect(page.locator('[data-mov]').first()).toContainText('Ana Teste') // o banco carimba quem lançou
  })

  test('resposta perdida: tocar de novo não duplica o lançamento', async ({ page, supabase, conta, servidor }) => {
    await page.goto('/movimentar?tipo=saida')
    await escolherProduto(page, 'Ureia')
    await page.getByLabel('Quantidade a retirar').fill('7')
    await page.getByLabel('Pedido / NF / romaneio').fill('Romaneio 77')
    supabase.perderProximaResposta = /^POST \/rest\/v1\/movimentacoes$/
    await page.getByRole('button', { name: 'Dar baixa de 7 sc' }).click()
    await expect(page.getByText('Sem conexão com o servidor. Verifique a internet e tente novamente.')).toBeVisible()

    await page.getByRole('button', { name: 'Dar baixa de 7 sc' }).click()
    await expect(toast(page, 'Saída registrada: −7 sc de Ureia 45% N (saco 50 kg). Saldo do lote: 173 sc.')).toBeVisible()
    const envios = supabase.chamadas('POST', '/rest/v1/movimentacoes')
    expect(envios).toHaveLength(2)
    expect(envios[0].corpo).toMatchObject({ origem_id: (envios[1].corpo as { origem_id: string }).origem_id })
    const [{ n }] = await servidor.sql<{ n: number }>(`select count(*)::int as n from public.movimentacoes where empresa_id = $1 and documento = 'Romaneio 77'`, [conta.empresaId])
    expect(n).toBe(1)
  })

  test('saída concorrente: o banco recusa e o app explica', async ({ page, supabase, conta, servidor }) => {
    await page.goto('/movimentar?tipo=saida')
    await escolherProduto(page, 'Mancozebe')
    await expect(page.getByRole('radio', { name: /MZ0325/ })).toBeChecked()

    // Outro aparelho retira 70 kg enquanto este operador preenche a tela
    const colega = await adicionarMembro(servidor, conta.usuarioId, conta.empresaId, 'estoquista', 'Colega Pátio')
    const l = await lote(servidor, conta.empresaId, 'MZ0325')
    await servidor.comoUsuario(colega.usuarioId, tx =>
      tx.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'SAIDA', 70)`, [conta.empresaId, l.loja_id, l.id]),
    )

    await page.getByLabel('Quantidade a retirar').fill('10')
    await page.getByRole('button', { name: 'Dar baixa de 10 kg' }).click()
    await expect(page.getByText('Saldo insuficiente. Disponível neste lote: 5 kg')).toBeVisible()
    const [envio] = supabase.chamadas('POST', '/rest/v1/movimentacoes')
    expect(envio.corpo).toMatchObject({ tipo: 'SAIDA', lote_id: l.id, loja_id: l.loja_id, empresa_id: conta.empresaId, quantidade: 10 })
  })

  test('correção pelo histórico envia o vínculo com o lançamento original', async ({ page, supabase }) => {
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

    expect(supabase.chamadas('GET', '/rest/v1/movimentacoes').some(r => r.busca.get('referencia_id') === `eq.${id}`)).toBe(true)
    const [envio] = supabase.chamadas('POST', '/rest/v1/movimentacoes')
    expect(envio.corpo).toMatchObject({ tipo: 'CORRECAO', quantidade: 2, observacao: 'Contei errado', referencia_id: id })
  })

  test('relatório busca o período pela data em que as movimentações aconteceram', async ({ page, supabase }) => {
    await page.goto('/relatorios')
    await page.getByRole('button', { name: 'Últimos 30 dias' }).click()
    await expect(page.locator('main table tbody tr')).toHaveCount(12)
    const consulta = supabase.chamadas('GET', '/rest/v1/movimentacoes').find(r => r.busca.getAll('ocorrido_em').some(c => c.startsWith('gte.')))
    expect(consulta, 'consulta com filtro de data').toBeTruthy()
  })
})

test.describe('Tempo real', () => {
  test('assina só a própria empresa e atualiza a tela quando outro aparelho lança', async ({ page, servidor, conta }) => {
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toContainText('260')

    await expect.poll(() => servidor.tempoReal.canais.filter(c => c.vinculos.some(v => v.filter === `empresa_id=eq.${conta.empresaId}`)).length).toBeGreaterThan(0)
    const canal = servidor.tempoReal.canais.find(c => c.vinculos.some(v => v.filter === `empresa_id=eq.${conta.empresaId}`))!
    expect(canal.vinculos.map(v => v.table).sort()).toEqual(['categorias', 'estoque_saldos', 'lotes', 'produtos', 'produtos_codigos'])
    expect(canal.vinculos.every(v => v.filter === `empresa_id=eq.${conta.empresaId}`)).toBe(true)

    // Outro aparelho dá baixa de 60 L; o banco avisa pelo canal em tempo real
    const l = await lote(servidor, conta.empresaId, 'GL2508')
    await servidor.comoUsuario(conta.usuarioId, tx =>
      tx.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'SAIDA', 60)`, [conta.empresaId, l.loja_id, l.id]),
    )
    await expect(linhasEstoque(page)).toContainText('200')
  })
})
