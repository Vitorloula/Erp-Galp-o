/**
 * Ponto de integração da cobrança de assinatura (Asaas ou similar).
 *
 * Hoje a assinatura é só estado (`trial_ate`/`pago_ate`/`estado`). Esta camada
 * deixa a cobrança pronta para só colocar a API key — sem implementar o SDK do
 * Asaas aqui. Enquanto a key não está configurada, o serviço fica "desligado"
 * e o fluxo de assinatura continua funcionando normalmente (trial/vencida).
 */

export interface Cobranca {
  empresaId: string
  valor: number
  /** Identificação do pagamento (Pix/cartão/boleto) conforme o provedor. */
  forma: 'pix' | 'cartao' | 'boleto'
}

export interface ServicoCobranca {
  /** true quando a API key do provedor está configurada. */
  configurado: boolean
  /** Cria uma cobrança; sem key, resolve como "não configurado" sem lançar. */
  cobrar(cobranca: Cobranca): Promise<{ status: 'criada' | 'nao_configurado' | 'erro'; id?: string; link?: string; mensagem?: string }>
}

/**
 * Devolve o stub desligado. A cobrança só deve ser habilitada por integração
 * server-side autenticada, nunca por uma chave VITE_*.
 */
export function criarServicoCobranca(): ServicoCobranca {
  return {
    configurado: false,
    async cobrar() {
      return { status: 'nao_configurado', mensagem: 'Cobrança não configurada no servidor.' }
    },
  }
}
