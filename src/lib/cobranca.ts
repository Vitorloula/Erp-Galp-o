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

function lerChave(): string | null {
  const chave = import.meta.env.VITE_ASAAS_API_KEY
  return chave && chave.trim() ? chave.trim() : null
}

/**
 * Devolve o serviço de cobrança. Hoje é um stub: sem key, fica "desligado".
 * Quando a key existir, troque o corpo pela chamada real à API do provedor
 * (preferencialmente numa Supabase Edge Function, para não expor a key).
 */
export function criarServicoCobranca(): ServicoCobranca {
  const chave = lerChave()
  if (!chave) {
    return {
      configurado: false,
      async cobrar(_c) {
        console.info('[Cobrança] não configurada — nenhuma cobrança criada.')
        return { status: 'nao_configurado', mensagem: 'Cobrança não configurada' }
      },
    }
  }
  return {
    configurado: true,
    async cobrar(_c) {
      // TODO(integração cobrança): chamar a API do Asaas (ou provedor) com a key.
      return { status: 'nao_configurado', mensagem: 'Integração de cobrança pendente' }
    },
  }
}
