import type { ReactNode } from 'react'
import { Marca } from './Layout'

/** Fundo verde com um cartão central (login, boas-vindas, convite). */
export function TelaCheia({ children, largura = 'max-w-sm' }: { children: ReactNode; largura?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-4">
      <div className={`m-auto w-full py-10 ${largura}`}>
        <div className="mb-8 flex justify-center">
          <Marca claro />
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-2xl">{children}</div>
      </div>
    </div>
  )
}
