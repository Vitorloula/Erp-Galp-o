import { Pencil, Target, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
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

  // ── Lista de compras (todos opcionais: sem eles o componente é idêntico ao somente leitura) ──
  /** Set de produto.id marcados. `undefined` ⇒ modo somente leitura (sem checkboxes). */
  selecionados?: ReadonlySet<string>
  /** Liga/desliga um produto. Obrigatório quando `selecionados` existe. */
  aoAlternar?: (id: string) => void
  /** Clique no checkbox do cabeçalho: marca/desmarca todos os itens visíveis. */
  aoMarcarTodosToggle?: () => void
}

/**
 * Lista de reposição: uma linha por produto (a compra é decidida por produto, não por lote).
 * A cor de fundo segue apenas a pior situação de LOTE — reposição não colore linha,
 * aparece no badge (ícone + texto), que não depende só de cor.
 *
 * Com `selecionados` + `aoAlternar` cada linha ganha um checkbox para a lista de compras;
 * a linha marcada recebe apenas um fundo suave (a cor de alerta continua sendo a do lote).
 */
export function ListaReposicao({ itens, aoEditar, vazio, selecionados, aoAlternar, aoMarcarTodosToggle }: ListaReposicaoProps) {
  const selecionavel = !!selecionados && !!aoAlternar
  const marcados = itens.filter(i => selecionados?.has(i.produto.id)).length
  const todosMarcados = itens.length > 0 && marcados === itens.length
  const algunsMarcados = marcados > 0 && !todosMarcados
  const caixaTodos = useRef<HTMLInputElement>(null)

  // Estado "indeterminate" só existe via JS (não é atributo).
  useEffect(() => {
    if (caixaTodos.current) caixaTodos.current.indeterminate = algunsMarcados
  }, [algunsMarcados])

  if (itens.length === 0) {
    return (
      <div className="cartao">
        <Vazio icone={vazio.icone ?? Target} titulo={vazio.titulo} texto={vazio.texto}>
          {vazio.children}
        </Vazio>
      </div>
    )
  }

  const grade = cx('md:grid md:items-center md:gap-3', selecionavel ? 'md:grid-cols-[auto_1fr_7rem_7rem_9rem]' : 'md:grid-cols-[1fr_7rem_7rem_9rem]')

  return (
    <div className="cartao overflow-hidden">
      {/* Cabeçalho de colunas (computador/tablet) */}
      <div className={cx('hidden border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:gap-3', selecionavel ? 'md:grid-cols-[auto_1fr_7rem_7rem_9rem]' : 'md:grid-cols-[1fr_7rem_7rem_9rem]')}>
        {selecionavel && (
          <input
            ref={caixaTodos}
            type="checkbox"
            checked={todosMarcados}
            onChange={aoMarcarTodosToggle}
            disabled={!aoMarcarTodosToggle}
            className="size-5 shrink-0 cursor-pointer rounded accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            aria-label="Marcar todos os produtos da lista de compras"
          />
        )}
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
          const marcado = selecionados?.has(produto.id) ?? false
          return (
            <li
              key={produto.id}
              data-reposicao={produto.id}
              data-situacao={situacao}
              data-selecionado={selecionavel ? marcado : undefined}
              className={cx('px-4 py-3 transition', `linha-${situacaoLote}`, marcado && 'bg-emerald-50/60')}
            >
              <div className={grade}>
                {selecionavel && (
                  <input
                    type="checkbox"
                    id={`sel-${produto.id}`}
                    className="size-5 shrink-0 cursor-pointer rounded accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    checked={marcado}
                    onChange={() => aoAlternar?.(produto.id)}
                    aria-label={`Incluir ${produto.nome} na lista de compras`}
                  />
                )}
                <div className="min-w-0">
                  {selecionavel ? (
                    <label htmlFor={`sel-${produto.id}`} className="block cursor-pointer">
                      <p className="truncate font-semibold text-slate-900">{produto.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {produto.codigo_interno}
                        {minimo !== null && ` · mín. ${formatarNumero(minimo)} ${produto.unidade}`}
                      </p>
                    </label>
                  ) : (
                    <>
                      <p className="truncate font-semibold text-slate-900">{produto.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {produto.codigo_interno}
                        {minimo !== null && ` · mín. ${formatarNumero(minimo)} ${produto.unidade}`}
                      </p>
                    </>
                  )}
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
                <p className={cx('mt-1 text-xs text-amber-800', selecionavel && 'mt-2 pl-7 md:pl-8')}>
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
