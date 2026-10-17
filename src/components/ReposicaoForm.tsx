import { useCallback, useEffect, useState } from 'react'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo } from '../lib/dados'
import { arred, formatarNumero } from '../lib/formato'
import type { Produto } from '../lib/tipos'
import { CampoQuantidade } from './CampoQuantidade'
import { useToast } from './Toast'
import { Aviso, Modal } from './ui'

export interface ReposicaoFormProps {
  /** null = modal fechado. */
  produto: Produto | null
  aoFechar: () => void
}

export function ReposicaoForm(props: ReposicaoFormProps) {
  if (!props.produto) return null
  return <Formulario {...props} produto={props.produto} />
}

function Formulario({ produto, aoFechar }: ReposicaoFormProps & { produto: Produto }) {
  const { empresa } = useAtiva()
  const { recarregar } = useDados()
  const toast = useToast()
  // undefined = campo intocado (mantém o valor atual); null = desligado (vazio/0); número = digitado.
  const [digitado, setDigitado] = useState<number | null | undefined>(undefined)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setDigitado(undefined)
    setErro('')
  }, [produto])

  const minimo = digitado === undefined ? produto.estoque_minimo : digitado
  const ligado = minimo !== null && minimo > 0

  const aoMudarMinimo = useCallback((quantidade: number | null) => setDigitado(quantidade), [])

  async function salvar() {
    setErro('')
    if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) return setErro('Estoque mínimo inválido.')
    const valor = ligado ? arred(minimo) : null
    setSalvando(true)
    try {
      await catalogo.salvarEstoqueMinimo(empresa.empresa_id, produto, valor)
      await recarregar('catalogo')
      toast.sucesso(valor === null ? `Estoque mínimo de ${produto.nome} desligado.` : `Mínimo de ${produto.nome} atualizado.`)
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Estoque mínimo — ${produto.nome}`}
      largura="max-w-md"
      rodape={
        <>
          <button type="button" className="btn btn-secundario flex-1" onClick={aoFechar}>
            Cancelar
          </button>
          <button form="form-minimo" className="btn btn-primario flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form
        id="form-minimo"
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          salvar()
        }}
      >
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Aviso tom="info">Ao atingir o mínimo o produto aparece em “Repor” no Painel e no Estoque.</Aviso>
        <div>
          <CampoQuantidade
            key={`${produto.id}:${produto.estoque_minimo ?? 'sem'}`}
            produto={produto}
            aoMudar={aoMudarMinimo}
            inicial={produto.estoque_minimo}
            rotulo="Estoque mínimo (ponto de pedido)"
            id="qtd-minimo"
            permitirZero
            autoFocus
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {ligado
              ? `Quando o saldo total chegar em ${formatarNumero(minimo)} ${produto.unidade}, o produto aparece em “Repor”.`
              : 'Sem mínimo definido: este produto não aparece em “Repor”.'}{' '}
            Deixe vazio (ou 0) para desligar.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Mínimo atual:{' '}
          <strong className="tabular-nums text-slate-700">
            {produto.estoque_minimo === null ? 'desligado' : `${formatarNumero(produto.estoque_minimo)} ${produto.unidade}`}
          </strong>
          {produto.conteudo_embalagem ? ` · embalagem de ${formatarNumero(produto.conteudo_embalagem)} ${produto.unidade}` : ''}
        </p>
      </form>
    </Modal>
  )
}
