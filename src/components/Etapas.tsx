import { Check } from 'lucide-react'
import { cx } from './ui'

/**
 * Formulários em etapas (wizard).
 *
 * `Passos` mostra em que etapa o usuário está e deixa voltar às já concluídas.
 * `NavegacaoEtapas` é o rodapé padrão: Voltar/Cancelar + Continuar/Salvar.
 * No celular os rótulos dão lugar a "Etapa X de N · Rótulo", sem apertar a barra
 * nem perder o nome acessível de cada passo.
 */

/** Indicador de etapas; etapas já concluídas voltam ao clique. */
export function Passos<T extends string>({
  passos,
  atual,
  aoVoltar,
}: {
  passos: { id: T; rotulo: string }[]
  atual: T
  /** Chamado ao clicar numa etapa concluída (nunca na atual ou futura). */
  aoVoltar?: (id: T) => void
}) {
  const indice = Math.max(0, passos.findIndex(p => p.id === atual))
  const atualPasso = passos[indice]
  return (
    <div>
      <ol className="flex items-center gap-1.5" aria-label="Etapas">
        {passos.map((passo, i) => {
          const concluida = i < indice
          const atualAgora = i === indice
          return (
            <li key={passo.id} className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => aoVoltar?.(passo.id)}
                disabled={!concluida || !aoVoltar}
                aria-current={atualAgora ? 'step' : undefined}
                aria-label={`Etapa ${i + 1}: ${passo.rotulo}${concluida ? ' (concluída)' : ''}`}
                className={cx(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-left transition',
                  concluida && aoVoltar && 'hover:bg-superficie',
                )}
              >
                <span
                  className={cx(
                    'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-1',
                    atualAgora
                      ? 'bg-ponto text-white ring-ponto'
                      : concluida
                        ? 'bg-emerald-50 text-marca-escura ring-emerald-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200',
                  )}
                >
                  {concluida ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cx(
                    'hidden whitespace-nowrap text-[11px] font-semibold sm:inline sm:text-xs',
                    atualAgora ? 'text-slate-900' : concluida ? 'text-marca-escura' : 'text-slate-500',
                  )}
                >
                  {passo.rotulo}
                </span>
              </button>
              {i < passos.length - 1 && <span className="h-px w-3 shrink-0 bg-slate-200 sm:w-auto sm:flex-1" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
      <p className="mt-1 text-center text-[11px] font-semibold text-slate-500 sm:hidden" aria-hidden="true">
        Etapa {indice + 1} de {passos.length} · {atualPasso.rotulo}
      </p>
    </div>
  )
}

/** Rodapé do wizard: Cancelar (1ª etapa) ou Voltar + Continuar/Salvar. */
export function NavegacaoEtapas({
  primeira,
  ultima,
  salvando = false,
  rotuloFinal,
  aoCancelar,
  aoVoltar,
  formId,
  grande = false,
}: {
  primeira: boolean
  ultima: boolean
  salvando?: boolean
  /** Rótulo do botão final (ex.: "Salvar" ou "Receber aparelho"). */
  rotuloFinal: string
  /** Sem `aoCancelar`, a primeira etapa mostra só o botão principal. */
  aoCancelar?: () => void
  aoVoltar: () => void
  /** Necessário quando o botão fica fora do `<form>` (rodapé do modal). */
  formId?: string
  grande?: boolean
}) {
  const tamanho = grande ? 'btn-grande' : ''
  return (
    <div className="flex w-full gap-2">
      {!primeira ? (
        <button type="button" className={cx('btn btn-secundario flex-1 whitespace-nowrap', tamanho)} onClick={aoVoltar}>
          Voltar
        </button>
      ) : aoCancelar ? (
        <button type="button" className={cx('btn btn-secundario flex-1 whitespace-nowrap', tamanho)} onClick={aoCancelar}>
          Cancelar
        </button>
      ) : null}
      <button
        type="submit"
        form={formId}
        className={cx('btn btn-primario flex-1 whitespace-nowrap', tamanho)}
        disabled={salvando}
      >
        {ultima ? (salvando ? 'Salvando...' : rotuloFinal) : 'Continuar'}
      </button>
    </div>
  )
}
