import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cx } from './ui'

interface Mensagem {
  id: number
  tipo: 'sucesso' | 'erro'
  texto: string
}

interface ToastValor {
  sucesso(texto: string): void
  erro(texto: string): void
}

const ToastContexto = createContext<ToastValor | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Mensagem[]>([])

  const remover = useCallback((id: number) => setLista(l => l.filter(m => m.id !== id)), [])
  const mostrar = useCallback(
    (tipo: Mensagem['tipo'], texto: string) => {
      const id = ++seq
      setLista(l => [...l.slice(-2), { id, tipo, texto }])
      setTimeout(() => remover(id), tipo === 'erro' ? 6000 : 3500)
    },
    [remover],
  )

  const [valor] = useState<ToastValor>(() => ({
    sucesso: t => mostrar('sucesso', t),
    erro: t => mostrar('erro', t),
  }))

  return (
    <ToastContexto.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {lista.map(m => (
          <div
            key={m.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1',
              m.tipo === 'sucesso' ? 'bg-marca text-white ring-marca-escura' : 'bg-red-600 text-white ring-red-700',
            )}
          >
            {m.tipo === 'sucesso' ? <CircleCheck className="mt-0.5 size-4.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-4.5 shrink-0" />}
            <span className="flex-1">{m.texto}</span>
            <button onClick={() => remover(m.id)} className="-m-1 rounded p-1 opacity-80 hover:opacity-100" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContexto.Provider>
  )
}

export function useToast() {
  const c = useContext(ToastContexto)
  if (!c) throw new Error('useToast fora do ToastProvider')
  return c
}
