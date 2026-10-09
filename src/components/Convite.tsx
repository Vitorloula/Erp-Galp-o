import { LoaderCircle, MailOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useEmpresa } from '../contexto/Empresa'
import { empresas } from '../lib/dados'
import { memoria } from '../lib/dados/cliente'
import type { InfoConvite } from '../lib/dados/empresas'
import { NOME_PAPEL } from '../lib/permissoes'
import { TelaCheia } from './TelaCheia'
import { useToast } from './Toast'
import { Aviso } from './ui'

const CHAVE = 'galpao-convite'

/** /convite#token → guarda o token (sobrevive ao cadastro e à confirmação de e-mail) e limpa a URL. */
export function guardarConviteDaUrl() {
  if (window.location.pathname !== '/convite') return
  const token = empresas.tokenDoConvite(window.location.hash)
  if (token) memoria.gravar(CHAVE, token)
  window.history.replaceState(null, '', '/')
}

export const conviteGuardado = () => memoria.ler<string>(CHAVE)
export const guardarConvite = (token: string) => memoria.gravar(CHAVE, token)
export const descartarConvite = () => memoria.apagar(CHAVE)

/** Dados do convite guardado (para mostrar antes do login: "você foi convidado para..."). */
export function useInfoConvite(token: string | null) {
  const [info, setInfo] = useState<InfoConvite | null>(null)
  useEffect(() => {
    if (!token) return setInfo(null)
    let ativo = true
    empresas.verConvite(token).then(i => ativo && setInfo(i), () => {})
    return () => {
      ativo = false
    }
  }, [token])
  return info
}

export function useConvitePendente() {
  const [token, setToken] = useState(conviteGuardado)
  const limpar = useCallback(() => {
    descartarConvite()
    setToken(null)
  }, [])
  return { token, limpar }
}

export function ConvitePendente({ token, limpar }: { token: string | null; limpar: () => void }) {
  const { recarregar, vinculos } = useEmpresa()
  const toast = useToast()
  const navegar = useNavigate()
  const info = useInfoConvite(token)
  const [carregou, setCarregou] = useState(false)
  const [aceitando, setAceitando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setCarregou(true), 1500)
    return () => clearTimeout(t)
  }, [])

  async function aceitar() {
    if (!token) return
    setErro('')
    setAceitando(true)
    try {
      const empresaId = await empresas.aceitarConvite(token)
      await recarregar(empresaId)
      limpar()
      toast.sucesso(`Você entrou na equipe de ${info?.empresa ?? 'empresa'}.`)
      navegar('/painel', { replace: true })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAceitando(false)
    }
  }

  const invalido = info && info.situacao !== 'valido'
  return (
    <TelaCheia>
      <div className="space-y-4 text-center">
        <MailOpen className="mx-auto size-10 text-emerald-600" />
        <h1 className="text-lg font-bold text-slate-900">Convite para a equipe</h1>
        {!info && !carregou ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-slate-400" />
        ) : !info ? (
          <Aviso tom="erro">Convite não encontrado. Confira o link ou peça um novo convite.</Aviso>
        ) : invalido ? (
          <Aviso tom="erro">
            Este convite para <strong>{info.empresa}</strong> {info.situacao === 'expirado' ? 'expirou' : 'já foi usado'}. Peça um novo convite.
          </Aviso>
        ) : (
          <p className="text-sm text-slate-600">
            Você foi convidado para trabalhar em <strong>{info.empresa}</strong> como <strong>{NOME_PAPEL[info.papel]}</strong>.
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {info && !invalido && (
          <button className="btn btn-primario btn-grande w-full" onClick={aceitar} disabled={aceitando}>
            {aceitando && <LoaderCircle className="size-5 animate-spin" />} Aceitar convite
          </button>
        )}
        <button className="btn btn-fantasma w-full" onClick={limpar}>
          {vinculos?.length ? 'Agora não' : 'Voltar'}
        </button>
      </div>
    </TelaCheia>
  )
}
