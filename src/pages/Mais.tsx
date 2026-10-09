import { ChevronRight, Database, FileSpreadsheet, LogOut, Package, RefreshCw, Smartphone, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../components/Toast'
import { Cabecalho, Modal } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { repositorio } from '../lib/dados'

function Item({ para, icone: Icone, titulo, texto }: { para: string; icone: LucideIcon; titulo: string; texto: string }) {
  return (
    <Link to={para} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
      <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{titulo}</span>
        <span className="block text-sm text-slate-500">{texto}</span>
      </span>
      <ChevronRight className="size-4.5 text-slate-300" />
    </Link>
  )
}

export function Mais() {
  const { usuario, admin, sair } = useAuth()
  const { recarregar } = useDados()
  const toast = useToast()
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Cabecalho titulo="Mais opções" />

      <div className="cartao flex items-center gap-3 p-4">
        <div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800">{usuario?.nome.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{usuario?.nome}</p>
          <p className="truncate text-sm text-slate-500">
            {usuario?.papel === 'admin' ? 'Administrador' : 'Operador'}
            {usuario?.email && ` · ${usuario.email}`}
          </p>
        </div>
      </div>

      <div className="cartao divide-y divide-slate-100 overflow-hidden">
        <Item para="/produtos" icone={Package} titulo="Produtos" texto="Cadastro, códigos de barras e lotes" />
        <Item para="/relatorios" icone={FileSpreadsheet} titulo="Relatórios" texto="Semanais e mensais em Excel ou PDF" />
        {admin && <Item para="/usuarios" icone={Users} titulo="Usuários" texto="Liberar acesso da equipe" />}
      </div>

      <div className="cartao flex gap-3 p-4 text-sm text-slate-600">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <p>
          <strong className="text-slate-800">Dica:</strong> adicione o sistema à tela inicial do celular para abrir como um aplicativo. No Android (Chrome): menu ⋮ →
          “Adicionar à tela inicial”. No iPhone (Safari): botão Compartilhar → “Adicionar à Tela de Início”.
        </p>
      </div>

      {repositorio.modo === 'demo' && (
        <button className="btn btn-secundario w-full" onClick={() => setConfirmar(true)}>
          <Database className="size-4.5" /> Restaurar dados de demonstração
        </button>
      )}
      {repositorio.modo === 'supabase' && (
        <button className="btn btn-secundario w-full text-red-700" onClick={sair}>
          <LogOut className="size-4.5" /> Sair deste aparelho
        </button>
      )}

      <Modal
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        titulo="Restaurar demonstração?"
        rodape={
          <>
            <button className="btn btn-secundario flex-1" onClick={() => setConfirmar(false)}>Cancelar</button>
            <button
              className="btn btn-perigo flex-1"
              onClick={async () => {
                await repositorio.restaurarDemo?.()
                await recarregar()
                setConfirmar(false)
                toast.sucesso('Dados de demonstração restaurados.')
              }}
            >
              <RefreshCw className="size-4.5" /> Restaurar
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Os dados de teste deste navegador serão substituídos pelos dados de exemplo. (Isso só existe no modo demonstração.)</p>
      </Modal>
    </div>
  )
}
