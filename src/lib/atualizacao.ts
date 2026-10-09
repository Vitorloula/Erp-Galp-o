import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Aplicativo instalável (service worker): guarda o sistema no aparelho para abrir sem
 * internet. Quando sai versão nova, ela fica ESPERANDO: o operador decide quando
 * atualizar (no caixa, só com a venda vazia) — o sistema nunca recarrega sozinho.
 */

let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null
let disponivel = false
const ouvintes = new Set<(d: boolean) => void>()

export function registrarAplicativo() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  aplicar = registerSW({
    onNeedRefresh() {
      disponivel = true
      ouvintes.forEach(cb => cb(true))
    },
  })
}

export function useAtualizacao() {
  const [tem, setTem] = useState(disponivel)
  useEffect(() => {
    ouvintes.add(setTem)
    return () => {
      ouvintes.delete(setTem)
    }
  }, [])
  return { disponivel: tem, atualizar: () => aplicar?.(true) }
}
