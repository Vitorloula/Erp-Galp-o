import { Pencil, Target, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ReposicaoProduto } from '../lib/estoque'
import { formatarNumero } from '../lib/formato'
import type { Produto } from '../lib/tipos'
import { BadgeReposicao, Cobertura, Vazio, cx } from './ui'

export interface ListaReposicaoProps {
  itens: ReposicaoProduto[]
  /** Quando ausente, a lista fica somente leitura (sem botão de mínimo). */
  aoEditar?: (produto: Produto) => void
  /** Estado vazio (ícone, título, texto e eventual ação). */
  vazio: { icone?: LucideIcon; titulo: string; texto?: string; children?: ReactNode }
}

/**
 * Lista de reposição: uma linha por produto (a compra é decidida por produto, não por lote).
 * A cor de fundo segue apenas a pior situação de LOTE — reposição não colore linha,
 * aparece no badge (ícone + texto), que não depende só de cor.
 */
export function ListaReposicao({ itens, aoEditar, vazio }: ListaReposicaoProps) {
  if (itens.length === 0) {
    return (
      <div className="cartao">
        <Vazio icone={vazio.icone ?? Target} titulo={vazio.titulo} texto={vazio.texto}>
          {vazio.children}
        </Vazio>
      </div>
    )
  }

  return (
    <div className="cartao overflow-hidden">
      {/* Cabeçalho de colunas (computador/tablet) */}
      <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[1fr_7rem_7rem_9rem] md:gap-3">
        <span>Produto</span>
        <span className="text-right">Saldo</span>
        <span className="text-right">Cobertura</span>
        <span className="text-right">
          <span className="sr-only">Ações</span>
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {itens.map(item => {
          const { produto, saldo, minimo, situacao, situacaoLote } = item
          return (
            <li key={produto.id} data-reposicao={produto.id} data-situacao={situacao} className={cx('px-4 py-3 transition', `linha-${situacaoLote}`)}>
              <div className="grid gap-2 md:grid-cols-[1fr_7rem_7rem_9rem] md:items-center md:gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{produto.nome}</p>
                  <p className="truncate text-xs text-slate-500">
                    {produto.codigo_interno}
                    {minimo !== null && ` · mín. ${formatarNumero(minimo)} ${produto.unidade}`}
                  </p>
                </div>
                <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
                  <span className="text-xs text-slate-500 md:hidden">Saldo</span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {formatarNumero(saldo)} {produto.unidade}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 md:flex-col md:items-end md:gap-1">
                  <span className="text-xs text-slate-500 md:hidden">Cobertura</span>
                  <Cobertura saldo={saldo} minimo={minimo} unidade={produto.unidade} />
                  <BadgeReposicao situacao={situacao} minimo={minimo} unidade={produto.unidade} />
                </div>
                <div className="flex justify-end">
                  {aoEditar && (
                    <button
                      type="button"
                      className="btn btn-secundario shrink-0 px-2.5 py-1.5 text-xs"
                      onClick={() => aoEditar(produto)}
                      aria-label={`Definir estoque mínimo de ${produto.nome}`}
                    >
                      <Pencil className="size-3.5" />
                      <span className="hidden sm:inline">Mínimo</span>
                    </button>
                  )}
                </div>
              </div>
              {item.sugestaoCompra > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  Comprar{' '}
                  <strong className="tabular-nums">
                    {formatarNumero(item.sugestaoCompra)} {produto.unidade}
                  </strong>{' '}
                  para voltar ao mínimo
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
