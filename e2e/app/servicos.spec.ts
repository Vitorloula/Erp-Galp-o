import { continuarEtapa, voltarEtapa } from '../apoio/etapas.ts'
import { expect, test } from '../base.ts'

/** Substitui window.print por um contador (a impressão real abriria a caixa do sistema). */
async function contarImpressoes(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __impressoes?: number }
    window.print = () => { w.__impressoes = (w.__impressoes ?? 0) + 1 }
  })
  return () => page.evaluate(() => (window as unknown as { __impressoes?: number }).__impressoes ?? 0)
}

test.describe('Serviços', () => {
  test('lista abre e mostra estado vazio ou OS', async ({ page }) => {
    await page.goto('/os')
    await expect(page.getByRole('heading', { level: 1, name: 'Ordens de serviço' })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar cliente, IMEI ou número da OS')).toBeVisible()
  })

  test('agenda abre', async ({ page }) => {
    await page.goto('/os/agenda')
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
  })

  test('recebimento valida campos obrigatórios', async ({ page }) => {
    await page.goto('/os/nova')
    await expect(page.getByRole('heading', { level: 1, name: 'Receber aparelho' })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Informe o nome do cliente.')).toBeVisible()
  })

  test('recebimento em etapas valida cada passo e preserva os dados ao voltar', async ({ page }) => {
    await page.goto('/os/nova')
    await expect(page.getByRole('button', { name: /Etapa 1: Cliente/ })).toHaveAttribute('aria-current', 'step')

    await continuarEtapa(page)
    await expect(page.getByText('Informe o nome do cliente.')).toBeVisible()

    await page.getByLabel('Nome do cliente *').fill('Ana Paula')
    await continuarEtapa(page)
    await expect(page.getByRole('button', { name: /Etapa 2: Aparelho/ })).toHaveAttribute('aria-current', 'step')

    // Não avança sem o tipo e o modelo.
    await continuarEtapa(page)
    await expect(page.getByText('Informe o tipo de aparelho.')).toBeVisible()
    await page.getByLabel('Tipo de aparelho *').fill('Celular')
    await continuarEtapa(page)
    await expect(page.getByText('Informe a marca e o modelo.')).toBeVisible()

    await page.getByLabel('Marca e modelo *').fill('Samsung S23')
    await continuarEtapa(page)
    await expect(page.getByRole('button', { name: /Etapa 3: Problema e prazo/ })).toHaveAttribute('aria-current', 'step')

    await page.getByRole('button', { name: 'Receber aparelho' }).click()
    await expect(page.getByText('Informe o defeito relatado.')).toBeVisible()

    // Voltar preserva o que já foi digitado.
    await voltarEtapa(page)
    await expect(page.getByLabel('Marca e modelo *')).toHaveValue('Samsung S23')
    await voltarEtapa(page)
    await expect(page.getByLabel('Nome do cliente *')).toHaveValue('Ana Paula')
  })

  test('recebimento imprime o comprovante no body e não navega antes', async ({ page }) => {
    const impressoes = await contarImpressoes(page)
    await page.goto('/os/nova')
    await page.getByLabel('Nome do cliente *').fill('Maria Souza')
    await continuarEtapa(page)
    await page.getByLabel('Tipo de aparelho *').fill('Celular')
    await page.getByLabel('Marca e modelo *').fill('Samsung Galaxy A54')
    await continuarEtapa(page)
    await page.getByLabel('Defeito relatado *').fill('Não liga')
    await page.getByRole('button', { name: 'Receber aparelho' }).click()

    await expect(page.getByText('O comprovante está pronto para impressão.')).toBeVisible()
    // Fica no recebimento para imprimir; a OS só abre pelo botão.
    expect(new URL(page.url()).pathname).toBe('/os/nova')

    const cupom = page.locator('[data-comprovante-os]')
    await expect(cupom).toHaveCount(1)
    expect(await cupom.evaluate(el => el.parentElement?.tagName)).toBe('BODY')
    const texto = await cupom.textContent()
    expect(texto).toContain('COMPROVANTE DE RECEBIMENTO')
    expect(texto).toContain('Maria Souza')
    expect(texto).toContain('Recebido por: Ana Teste')
    expect(texto).not.toContain('Senha')

    await expect.poll(impressoes).toBeGreaterThanOrEqual(1)
    await page.getByRole('button', { name: 'Imprimir novamente' }).click()
    await expect.poll(impressoes).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Abrir OS' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /OS 00000\d/ })).toBeVisible()
  })

  test('histórico em linha mostra a etapa atual e abre os detalhes do marco', async ({ page }) => {
    await page.goto('/os/nova')
    await page.getByLabel('Nome do cliente *').fill('Carla Nunes')
    await continuarEtapa(page)
    await page.getByLabel('Tipo de aparelho *').fill('Celular')
    await page.getByLabel('Marca e modelo *').fill('Xiaomi Redmi 12')
    await continuarEtapa(page)
    await page.getByLabel('Defeito relatado *').fill('Bateria descarrega rápido')
    await page.getByRole('button', { name: 'Receber aparelho' }).click()
    await page.getByRole('button', { name: 'Abrir OS' }).click()

    const historico = page.getByRole('region', { name: 'Histórico da OS' })
    await expect(historico).toBeVisible()
    await expect(historico.getByRole('button', { name: 'Diagnóstico' })).toHaveAttribute('aria-current', 'step')
    await expect(historico.getByRole('button', { name: 'Recebida' })).toHaveAttribute('aria-expanded', 'false')

    await historico.getByRole('button', { name: 'Recebida' }).click()
    await expect(historico.getByRole('button', { name: 'Recebida' })).toHaveAttribute('aria-expanded', 'true')
    const detalhe = page.getByRole('region', { name: 'Detalhes de Recebida' })
    await expect(detalhe).toContainText('Aparelho recebido e OS aberta.')
    await expect(detalhe).toContainText('por Ana Teste')

    // Clicar de novo fecha o detalhe (não deixa a faixa presa).
    await historico.getByRole('button', { name: 'Recebida' }).click()
    await expect(detalhe).toHaveCount(0)
  })

  test('total em reais, pagamento vazio e entrega com recibo impresso', async ({ page }) => {
    const impressoes = await contarImpressoes(page)

    // Recebe o aparelho e leva a OS até "Pronta".
    await page.goto('/os/nova')
    await page.getByLabel('Nome do cliente *').fill('João Pereira')
    await continuarEtapa(page)
    await page.getByLabel('Tipo de aparelho *').fill('Celular')
    await page.getByLabel('Marca e modelo *').fill('Motorola Moto G')
    await continuarEtapa(page)
    await page.getByLabel('Defeito relatado *').fill('Tela quebrada')
    await page.getByRole('button', { name: 'Receber aparelho' }).click()
    await page.getByRole('button', { name: 'Abrir OS' }).click()

    await page.getByRole('button', { name: 'Iniciar diagnóstico' }).click()
    // Mão de obra em reais: o total tem de aparecer como R$ 1.800,00 (não R$ 18,00).
    await page.getByLabel('Mão de obra (R$)').fill('1800')
    // O CTA do topo também salva o diagnóstico digitado (não pode perdê-lo).
    await page.getByLabel('Diagnóstico').fill('Display quebrado; troca necessária.')
    await page.getByRole('button', { name: 'Enviar orçamento' }).click()
    await expect(page.getByText('Total: R$ 1.800,00')).toBeVisible()
    await expect(page.getByLabel('Diagnóstico')).toHaveValue('Display quebrado; troca necessária.')

    await page.getByRole('button', { name: 'Cliente aprovou o orçamento' }).click()
    await page.getByRole('button', { name: 'Iniciar execução' }).click()
    await page.getByRole('button', { name: 'Marcar como pronta' }).click()

    // Sem pagamento o botão fica desabilitado e a tela explica o que falta.
    await expect(page.getByText(/Falta receber R\$ 1\.800,00 para liberar a entrega/)).toBeVisible()
    const botaoEntregar = page.getByRole('button', { name: 'Entregar', exact: true }).first()
    await expect(botaoEntregar).toBeDisabled()

    // Campo vazio = recebe o que falta (sem digitar nada).
    await page.getByRole('button', { name: 'Registrar pagamento' }).click()
    await expect(page.getByText('Tudo pago', { exact: true })).toBeVisible()
    await expect.poll(() => botaoEntregar.isEnabled()).toBe(true)

    await botaoEntregar.click()
    const modal = page.getByRole('dialog')
    await modal.getByRole('button', { name: 'Entregar' }).click()

    await expect(page.getByText('Entregue', { exact: true }).first()).toBeVisible()
    const recibo = page.locator('[data-recibo-os]')
    await expect(recibo).toHaveCount(1)
    expect(await recibo.evaluate(el => el.parentElement?.tagName)).toBe('BODY')
    const texto = await recibo.textContent()
    expect(texto).toContain('RECIBO DE ENTREGA')
    expect(texto).toContain('R$ 1.800,00')
    expect(texto).toContain('Garantia até')
    await expect.poll(impressoes).toBeGreaterThanOrEqual(1)
  })

  test('menu tem item Serviços', async ({ page }) => {
    if (test.info().project.name === 'app-celular') {
      await page.goto('/mais')
      await expect(page.getByRole('link', { name: 'Serviços' })).toBeVisible()
    } else {
      await page.goto('/painel')
      await expect(page.locator('aside').getByRole('link', { name: 'Serviços' })).toBeVisible()
    }
  })

  test('Painel tem card Ordens de serviço', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByText('Ordens de serviço')).toBeVisible()
  })
})
