import { useEffect, useRef, useState } from 'react'
import { arred, formatarNumero, lerNumero } from '../lib/formato'
import type { Produto } from '../lib/tipos'
import { cx } from './ui'

interface Props {
  produto: Produto
  /** Recebe a quantidade já convertida para a unidade do produto (ou null se inválida/vazia). */
  aoMudar: (quantidade: number | null) => void
  inicial?: number | null
  rotulo?: string
  id?: string
  permitirNegativo?: boolean
  permitirZero?: boolean
  autoFocus?: boolean
}

/**
 * Campo de quantidade na unidade técnica do produto (L, ml, kg, sc...).
 * Se o produto tiver conteúdo por embalagem, permite digitar em embalagens.
 */
export function CampoQuantidade({ produto, aoMudar, inicial, rotulo = 'Quantidade', id = 'quantidade', permitirNegativo, permitirZero, autoFocus }: Props) {
  const conteudo = produto.conteudo_embalagem
  const [modo, setModo] = useState<'unidade' | 'emb'>('unidade')
  const [texto, setTexto] = useState(inicial ? String(inicial).replace('.', ',') : '')
  const callback = useRef(aoMudar)
  callback.current = aoMudar

  const numero = lerNumero(texto)
  const quantidade = numero === null ? null : arred(modo === 'emb' && conteudo ? numero * conteudo : numero)
  const valida = quantidade !== null && (permitirNegativo || quantidade > 0 || (!!permitirZero && quantidade === 0))

  useEffect(() => {
    callback.current(valida ? quantidade : null)
  }, [quantidade, valida])

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="rotulo mb-0" htmlFor={id}>{rotulo}</label>
        {conteudo && (
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            {(['unidade', 'emb'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (m === modo) return
                  // Converte o valor já digitado para o novo modo.
                  if (numero !== null) {
                    const convertido = m === 'emb' ? numero / conteudo : numero * conteudo
                    setTexto(String(arred(convertido)).replace('.', ','))
                  }
                  setModo(m)
                }}
                className={cx('rounded-md px-2.5 py-1 transition', modo === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
              >
                {m === 'emb' ? 'Embalagens' : produto.unidade}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <input
          id={id}
          className={cx('campo pr-24 text-lg font-semibold tabular-nums sm:text-lg', texto && !valida && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="0"
          autoFocus={autoFocus}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
          {modo === 'emb' ? `emb. de ${formatarNumero(conteudo)} ${produto.unidade}` : produto.unidade}
        </span>
      </div>
      {modo === 'emb' && quantidade !== null && (
        <p className="mt-1 text-sm text-slate-600">
          = <strong>{formatarNumero(quantidade)} {produto.unidade}</strong>
        </p>
      )}
      {modo === 'unidade' && conteudo && quantidade !== null && quantidade > 0 && (
        <p className="mt-1 text-xs text-slate-500">≈ {formatarNumero(arred(quantidade / conteudo))} embalagem(ns) de {formatarNumero(conteudo)} {produto.unidade}</p>
      )}
    </div>
  )
}
