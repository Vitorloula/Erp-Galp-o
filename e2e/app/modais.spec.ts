import { abrirCaixa, ler } from '../apoio/pdv.ts'
import { ehCelular, expect, test } from '../base.ts'

/**
 * Regressão dos modais: eles precisam ficar inteiros dentro da janela, com
 * cabeçalho/corpo/rodapé acessíveis, mesmo com a página rolada. O bug original
 * era causado pelo `transform` da animação de entrada da página (containing
 * block de elementos `fixed`) — por isso os testes abrem o modal com a página
 * rolada, que é quando o corte aparecia.
 */

type Medidas = Awaited<ReturnType<typeof medirModal>>

async function medirModal(page: import('@playwright/test').Page) {
  return page.locator('[data-modal-painel]').evaluate(painel => {
    const corpo = painel.querySelector<HTMLElement>('[data-modal-corpo]')
    const rodape = painel.querySelector<HTMLElement>('[data-modal-rodape]')
    const r = painel.getBoundingClientRect()
    const c = corpo?.getBoundingClientRect()
    const f = rodape?.getBoundingClientRect()
    return {
      janela: { largura: window.innerWidth, altura: window.innerHeight },
      painel: { topo: r.top, base: r.bottom, esquerda: r.left, direita: r.right, altura: r.height },
      corpo:
        corpo && c
          ? { topo: c.top, base: c.bottom, clientHeight: corpo.clientHeight, scrollHeight: corpo.scrollHeight, scrollTop: corpo.scrollTop }
          : null,
      rodape: f ? { topo: f.top, base: f.bottom, altura: f.height } : null,
      rolagemBody: getComputedStyle(document.body).overflow,
      zIndex: Number(getComputedStyle(document.querySelector('[data-modal]')!).zIndex),
    }
  })
}

function dentroDaJanela(m: Medidas) {
  expect(m.painel.topo, 'topo do modal não pode sair da janela').toBeGreaterThanOrEqual(-0.5)
  expect(m.painel.base, 'base do modal não pode sair da janela').toBeLessThanOrEqual(m.janela.altura + 0.5)
  expect(m.painel.esquerda, 'esquerda do modal não pode sair da janela').toBeGreaterThanOrEqual(-0.5)
  expect(m.painel.direita, 'direita do modal não pode sair da janela').toBeLessThanOrEqual(m.janela.largura + 0.5)
  expect(m.painel.altura, 'modal deve respeitar a altura da janela').toBeLessThanOrEqual(m.janela.altura)
  expect(m.rolagemBody, 'a página atrás do modal deve ficar travada').toBe('hidden')
  expect(m.zIndex, 'modal deve ficar acima da sidebar/menus (z-30)').toBeGreaterThanOrEqual(30)
}

async function abrirProdutos(page: import('@playwright/test').Page) {
  await page.goto('/produtos')
  // A primeira carga dos dados de exemplo pode ser lenta com vários workers.
  await expect(page.getByRole('button', { name: 'Novo produto' }).first()).toBeVisible({ timeout: 30_000 })
}

async function rolarCorpoAteOFim(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const corpo = document.querySelector<HTMLElement>('[data-modal-corpo]')!
    corpo.scrollTop = corpo.scrollHeight
    return {
      clientHeight: corpo.clientHeight,
      scrollHeight: corpo.scrollHeight,
      scrollTop: corpo.scrollTop,
      // Se a rolagem não fosse interna, o body/documento rolaria atrás do modal.
      rolagemDocumento: document.documentElement.scrollTop,
    }
  })
}

test.describe('Modais', () => {
  // Em série: cada teste cria a própria empresa/banco; rodar quatro em paralelo
  // deixava a primeira carga dos dados lenta (~30 s) e contaminava o tempo.
  test.describe.configure({ mode: 'serial' })
  // Várias combinações de tela/reload e o caixa (que abre uma sessão) passam dos 45 s padrão.
  test.setTimeout(120_000)

  test('Produtos: formulário longo fica na janela, rola por dentro e mantém cabeçalho/rodapé', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await abrirProdutos(page)

    // Reproduz o cenário das capturas: página rolada quando o modal abre.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY), 'a página precisa estar rolada').toBeGreaterThan(0)
    // .evaluate evita o auto-scroll do Playwright, preservando a rolagem da página.
    await page.getByRole('button', { name: 'Novo produto' }).first().evaluate((el: HTMLElement) => el.click())

    const d = page.getByRole('dialog', { name: 'Novo produto' })
    await expect(d).toBeVisible()
    const m = await medirModal(page)
    dentroDaJanela(m)
    expect(m.painel.topo, 'no desktop, com espaço, o modal fica centralizado').toBeGreaterThan(0)
    expect(m.corpo, 'o formulário longo precisa ter uma área de rolagem').not.toBeNull()
    expect(m.rodape, 'o rodapé com Cancelar/Salvar precisa existir').not.toBeNull()

    // O overlay (portal, z-50) cobre a sidebar (z-30), e não a sidebar sobre o modal.
    const cobreSidebar = await page.evaluate(() => {
      const sidebar = document.querySelector('aside')
      if (!sidebar) return true
      const r = sidebar.getBoundingClientRect()
      return !!document.elementFromPoint(r.left + 8, r.top + 8)?.closest('[data-modal]')
    })
    expect(cobreSidebar, 'o modal deve cobrir a sidebar').toBe(true)

    // Toasts continuam acima do modal (o modal não pode esconder avisos).
    const camadas = await page.evaluate(() => ({
      modal: Number(getComputedStyle(document.querySelector('[data-modal]')!).zIndex),
      toast: Number(getComputedStyle(document.querySelector('[aria-live="polite"]')!).zIndex),
    }))
    expect(camadas.toast, 'o toast precisa ficar acima do modal').toBeGreaterThan(camadas.modal)

    // Cabeçalho e botões continuam visíveis antes e depois de rolar o corpo.
    await expect(d.getByRole('heading', { name: 'Novo produto' })).toBeVisible()
    await expect(d.getByRole('button', { name: 'Cancelar' })).toBeVisible()
    await expect(d.getByRole('button', { name: 'Salvar' })).toBeVisible()

    const rolagem = await rolarCorpoAteOFim(page)
    expect(rolagem.scrollHeight, 'este formulário é maior que a área visível').toBeGreaterThan(rolagem.clientHeight)
    expect(rolagem.scrollTop, 'a rolagem interna deve chegar ao fim').toBeGreaterThan(0)

    // O último campo fica acima do rodapé, sem ser coberto.
    const ultimo = await page.evaluate(() => {
      const corpo = document.querySelector<HTMLElement>('[data-modal-corpo]')!
      const rodape = document.querySelector<HTMLElement>('[data-modal-rodape]')!
      const campo = document.querySelector<HTMLElement>('#p-cbs')! // último campo do cadastro
      const c = corpo.getBoundingClientRect()
      const f = rodape.getBoundingClientRect()
      const u = campo.getBoundingClientRect()
      return { campoBase: u.bottom, corpoBase: c.bottom, rodapeTopo: f.top }
    })
    expect(ultimo.campoBase, 'o último campo não pode ficar atrás do rodapé').toBeLessThanOrEqual(ultimo.rodapeTopo + 0.5)
    expect(ultimo.rodapeTopo, 'o rodapé começa onde o corpo termina').toBeGreaterThanOrEqual(ultimo.corpoBase - 1.5)
    await expect(page.locator('#p-cbs')).toBeInViewport()
    await expect(d.getByRole('button', { name: 'Salvar' })).toBeVisible()

    await d.getByRole('button', { name: 'Cancelar' }).click()
    await expect(d).toBeHidden()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  test('formulário curto: centralizado no desktop e acessível no celular', async ({ page }) => {
    await page.goto('/mais')
    await page.getByRole('button', { name: 'Alterar meu nome' }).click()
    const d = page.getByRole('dialog', { name: 'Meu nome' })
    await expect(d).toBeVisible()

    const m = await medirModal(page)
    dentroDaJanela(m)
    expect(m.rodape, 'o rodapé com Cancelar/Salvar precisa existir').not.toBeNull()
    await expect(d.getByRole('button', { name: 'Cancelar' })).toBeVisible()
    await expect(d.getByRole('button', { name: 'Salvar' })).toBeVisible()

    if (!ehCelular(test.info()) && m.janela.largura >= 640) {
      const sobra = m.janela.altura - m.painel.altura
      expect(sobra).toBeGreaterThan(0)
      expect(Math.abs(m.painel.topo - sobra / 2), 'deve ficar verticalmente centralizado').toBeLessThanOrEqual(1.5)
    } else {
      expect(m.painel.base, 'no celular o rodapé encosta na base, com margem').toBeLessThanOrEqual(m.janela.altura)
    }

    await d.getByRole('button', { name: 'Cancelar' }).click()
    await expect(d).toBeHidden()
  })

  test('dimensões variadas, incluindo janela reduzida e zoom equivalente', async ({ page }) => {
    // 910×512 ≈ 1366×768 com zoom de 150% (o viewport em CSS px diminui).
    const tamanhos = [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 600 },
      { width: 910, height: 512 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]

    for (const tamanho of tamanhos) {
      await page.setViewportSize(tamanho)
      await abrirProdutos(page)
      await page.getByRole('button', { name: 'Novo produto' }).first().click()
      const d = page.getByRole('dialog', { name: 'Novo produto' })
      await expect(d).toBeVisible()

      const m = await medirModal(page)
      dentroDaJanela(m)
      expect(m.painel.altura, `${tamanho.width}x${tamanho.height}`).toBeLessThanOrEqual(m.janela.altura)
      await expect(d.getByRole('button', { name: 'Cancelar' })).toBeVisible()
      await expect(d.getByRole('button', { name: 'Salvar' })).toBeVisible()

      await d.getByRole('button', { name: 'Cancelar' }).click()
      await expect(d).toBeHidden()
    }
  })

  test('Caixa: pagamento e venda concluída (modais independentes) respeitam a janela', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 568 })
    await abrirCaixa(page)
    await ler(page, '7891000000014')
    await page.getByRole('button', { name: 'Pagar' }).click()

    const pagamento = page.getByRole('dialog', { name: 'Pagamento' })
    await expect(pagamento).toBeVisible()
    let m = await medirModal(page)
    dentroDaJanela(m)
    expect(m.rodape, 'o botão Concluir venda precisa de um rodapé próprio').not.toBeNull()
    await expect(pagamento.getByRole('button', { name: /Concluir venda/ })).toBeVisible()

    // Vários pagamentos deixam a lista maior que a área visível.
    for (let i = 0; i < 6; i++) {
      await pagamento.getByLabel(/Valor recebido/).fill('10')
      await pagamento.getByRole('button', { name: /^Dinheiro/ }).click()
    }
    const rolagem = await rolarCorpoAteOFim(page)
    expect(rolagem.scrollHeight, 'a lista de pagamentos deve rolar por dentro').toBeGreaterThan(rolagem.clientHeight)
    m = await medirModal(page)
    dentroDaJanela(m)
    await expect(pagamento.getByRole('button', { name: /Concluir venda/ })).toBeVisible()

    await pagamento.getByRole('button', { name: /Concluir venda/ }).click()
    const concluida = page.getByRole('dialog', { name: 'Venda concluída' })
    await expect(concluida).toBeVisible()
    m = await medirModal(page)
    dentroDaJanela(m)
    await expect(concluida.getByRole('button', { name: 'Nova venda' })).toBeVisible()

    await concluida.getByRole('button', { name: 'Nova venda' }).click()
    await expect(concluida).toBeHidden()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  test('leitor de código (modal independente em tela cheia) cobre a janela', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 })
    await page.goto('/movimentar?tipo=saida')
    await expect(page.getByLabel('Buscar produto')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Escanear código de barras' }).click()
    const leitor = page.getByRole('dialog', { name: 'Escanear código de barras' })
    await expect(leitor).toBeVisible()
    const box = await leitor.boundingBox()
    expect(box).not.toBeNull()
    expect(Math.abs(box!.x), 'o leitor começa na borda esquerda').toBeLessThanOrEqual(0.5)
    expect(Math.abs(box!.y), 'o leitor começa no topo').toBeLessThanOrEqual(0.5)
    expect(Math.abs(box!.width - 390), 'o leitor ocupa toda a largura').toBeLessThanOrEqual(0.5)
    expect(Math.abs(box!.height - 600), 'o leitor ocupa toda a altura').toBeLessThanOrEqual(0.5)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')

    await leitor.getByRole('button', { name: 'Fechar leitor' }).click()
    await expect(leitor).toBeHidden()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  test('fechamento por Escape, botão e fundo não deixa a página travada', async ({ page }) => {
    await page.goto('/produtos')

    // Escape
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    let d = page.getByRole('dialog', { name: 'Novo produto' })
    await expect(d).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')

    // Botão Fechar (X)
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    d = page.getByRole('dialog', { name: 'Novo produto' })
    await d.getByRole('button', { name: 'Fechar' }).click()
    await expect(d).toBeHidden()

    // Clique no fundo
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    d = page.getByRole('dialog', { name: 'Novo produto' })
    await page.mouse.click(5, 5)
    await expect(d).toBeHidden()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })
})
