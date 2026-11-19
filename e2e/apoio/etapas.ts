import type { Locator, Page } from '@playwright/test'

/** Etapas do cadastro de produto (wizard Dados → Preços → Estoque → Fiscal). */
export type EtapaProduto = 'Dados' | 'Preços' | 'Estoque' | 'Fiscal'

const ORDEM_PRODUTO: EtapaProduto[] = ['Dados', 'Preços', 'Estoque', 'Fiscal']

/**
 * Navega até uma etapa do cadastro de produto, avançando ou voltando.
 * Avançar valida a etapa atual — por isso o teste precisa preencher os campos
 * obrigatórios antes de chamar a próxima etapa.
 */
export async function etapaProduto(dialogo: Locator, etapa: EtapaProduto) {
  const alvo = ORDEM_PRODUTO.indexOf(etapa) + 1
  for (let i = 0; i < ORDEM_PRODUTO.length + 1; i++) {
    const rotulo = await dialogo.locator('[aria-current="step"]').getAttribute('aria-label')
    const atual = Number(rotulo?.match(/Etapa (\d+)/)?.[1] ?? 0)
    if (atual === alvo) return
    await dialogo.getByRole('button', { name: atual < alvo ? 'Continuar' : 'Voltar', exact: true }).click()
  }
  throw new Error(`Não foi possível chegar à etapa ${etapa}`)
}

/** Vai até a última etapa e salva o produto. */
export async function salvarProduto(dialogo: Locator) {
  await etapaProduto(dialogo, 'Fiscal')
  await dialogo.getByRole('button', { name: 'Salvar', exact: true }).click()
}

/** Avança uma etapa do recebimento de OS (Cliente → Aparelho → Problema e prazo). */
export async function continuarEtapa(page: Page) {
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
}

/** Volta uma etapa do recebimento, preservando o que já foi digitado. */
export async function voltarEtapa(page: Page) {
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
}
