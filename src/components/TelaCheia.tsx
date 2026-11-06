import type { ReactNode } from 'react'
import { Marca } from './Layout'

/** Fundo suave e cartão central para login, boas-vindas e convite. */
export function TelaCheia({ children, largura = 'max-w-sm' }: { children: ReactNode; largura?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-superficie px-4">
      <div className={`m-auto w-full py-10 ${largura}`}>
        <div className="mb-8 flex justify-center">
          <Marca />
        </div>
        <div className="rounded-xl border border-borda-loja bg-white p-6">{children}</div>
      </div>
    </div>
  )
}
