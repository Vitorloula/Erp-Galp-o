import type { ReactNode } from 'react'
import { cx } from './ui'

const TAMANHOS = {
  sm: 'size-9 text-sm',
  md: 'size-10 text-sm',
  lg: 'size-12 text-lg',
} as const

/** Avatar redondo com a inicial do nome; `children` substitui a inicial (ex.: coroa do dono). */
export function Avatar({
  nome,
  tamanho = 'md',
  className,
  children,
}: {
  nome?: string | null
  tamanho?: keyof typeof TAMANHOS
  className?: string
  children?: ReactNode
}) {
  const inicial = nome?.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full font-bold', TAMANHOS[tamanho], className)}>
      {children ?? inicial}
    </div>
  )
}
