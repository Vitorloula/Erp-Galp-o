/**
 * Ponto de integração da NFC-e (documento fiscal).
 *
 * O cupom de 80 mm NÃO é documento fiscal. Esta camada deixa a integração
 * pronta para só colocar as keys e a API do emissor (ex.: um serviço próprio,
 * Supabase Edge Function ou um emissor de terceiros) — sem implementar o
 * protocolo SEFAZ aqui.
 *
 * Enquanto as keys não estão configuradas, `criarEmissorNFCe()` devolve um
 * emissor "desligado" que não faz nada (o caixa continua emitindo o cupom).
 */
import { formatarData } from './formato'

/** Uma venda pronta para virar NFC-e (dados mínimos da emissão). */
export interface DadosNFCe {
  vendaId: string
  serie: string
  numero: string
  total: number
  emitidaEm: string
  itens: { nome: string; quantidade: number; valor: number }[]
}

export interface EmissorNFCe {
  /** true quando as keys do emissor estão configuradas. */
  configurado: boolean
  /** Emite a NFC-e; sem keys, resolve como "não configurado" sem lançar. */
  emitir(venda: DadosNFCe): Promise<{ status: 'emitida' | 'nao_configurado' | 'erro'; chave?: string; mensagem?: string }>
}

interface ConfigNFCe {
  url: string
  token: string
  csc: string
  cscId: string
  seriePadrao: string
}

function lerConfig(): ConfigNFCe | null {
  const url = import.meta.env.VITE_NFCE_URL
  const token = import.meta.env.VITE_NFCE_TOKEN
  const csc = import.meta.env.VITE_NFCE_CSC
  const cscId = import.meta.env.VITE_NFCE_CSC_ID
  const seriePadrao = import.meta.env.VITE_NFCE_SERIE || '1'
  if (!url || !token || !csc || !cscId) return null
  return { url, token, csc, cscId, seriePadrao }
}

/**
 * Devolve o emissor de NFC-e. Hoje é um stub: sem keys, fica "desligado".
 * Quando as keys/API existirem, troque o corpo desta função pela chamada real
 * (Supabase Edge Function ou emissor terceiro) — sem mudar a interface.
 */
export function criarEmissorNFCe(): EmissorNFCe {
  const cfg = lerConfig()
  if (!cfg) {
    return {
      configurado: false,
      async emitir(venda) {
        // Sem keys: o caixa segue normalmente, só o cupom não fiscal.
        console.info(`[NFC-e] não configurada — venda ${venda.numero} de ${formatarData(venda.emitidaEm)} não emitida.`)
        return { status: 'nao_configurado', mensagem: 'NFC-e não configurada' }
      },
    }
  }
  return {
    configurado: true,
    async emitir(_venda) {
      // TODO(integração NFC-e): chamar a API do emissor com cfg.url/token/csc/cscId.
      // Retorno real: { status: 'emitida', chave: '...' } ou { status: 'erro', mensagem }.
      return { status: 'nao_configurado', mensagem: 'Integração NFC-e pendente' }
    },
  }
}
