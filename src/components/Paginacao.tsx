import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  pagina: number
  totalPaginas: number
  primeiro: number
  ultimo: number
  total: number
  rotulo: string
  aoMudar: (pagina: number) => void
}

/** Rodapé de paginação usado por listas grandes. */
export function Paginacao({ pagina, totalPaginas, primeiro, ultimo, total, rotulo, aoMudar }: Props) {
  if (totalPaginas <= 1) return null
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-slate-600" aria-label={`Paginação de ${rotulo}`}>
      <span className="tabular-nums">
        {primeiro}–{ultimo} de {total} {rotulo}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-secundario px-2.5 py-1.5"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-20 text-center text-xs tabular-nums">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          className="btn btn-secundario px-2.5 py-1.5"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Próxima página"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  )
}
