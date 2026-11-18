import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Building2, Activity, Siren, ScrollText, LogOut, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexto/Auth'
import { Marca } from '../../components/Layout'
import { adminSouAdmin } from '../../lib/admin/cliente'
import { Avatar } from '../../components/Avatar'
import { Vazio } from '../../components/ui'

export function AdminLayout() {
  const { usuario, sair } = useAuth()
  const [admin, setAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    adminSouAdmin().then(setAdmin).catch(() => setAdmin(false))
  }, [])

  if (admin === null) return <div className="flex min-h-dvh items-center justify-center text-slate-500">Carregando...</div>
  if (!admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Vazio icone={ShieldCheck} titulo="Sem acesso" texto="Esta área é restrita aos administradores da plataforma." />
        <Link to="/painel" className="mt-4 text-marca-escura underline">Voltar para o painel</Link>
      </div>
    )
  }

  const itens = [
    { para: '/admin', rotulo: 'Visão geral', icone: LayoutDashboard },
    { para: '/admin/empresas', rotulo: 'Empresas', icone: Building2 },
    { para: '/admin/logs', rotulo: 'Logs', icone: Activity },
    { para: '/admin/incidentes', rotulo: 'Incidentes', icone: Siren },
    { para: '/admin/auditoria', rotulo: 'Auditoria', icone: ScrollText },
  ]

  return (
    <div className="min-h-dvh lg:pl-[236px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-borda-loja bg-superficie lg:flex">
        <div className="space-y-5 px-4 py-5">
          <Marca titulo="ponto" subtitulo="área da plataforma" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pt-1">
          {itens.map(item => (
            <NavLink key={item.para} to={item.para} className={({ isActive }) => `flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-letreiro text-ponto' : 'text-slate-600 hover:bg-white hover:text-ponto'}`}>
              <item.icone className="size-5" />
              <span className="flex-1">{item.rotulo}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-borda-loja p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar nome={usuario?.nome} tamanho="sm" className="bg-letreiro text-ponto" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{usuario?.nome}</p>
              <p className="text-xs text-slate-500">Super admin</p>
            </div>
            <button onClick={sair} className="btn btn-fantasma p-2" title="Sair" aria-label="Sair">
              <LogOut className="size-4.5" />
            </button>
          </div>
          <Link to="/painel" className="mt-2 flex items-center gap-2 text-xs text-slate-500 hover:text-ponto">
            <ArrowLeft className="size-3.5" /> Voltar para a loja
          </Link>
        </div>
      </aside>
      <div className="space-y-2 px-4 pt-3 sm:px-6 lg:px-10">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
          Área da plataforma. Você está fora da visão de uma loja. Tudo o que você consultar aqui é registrado em auditoria.
        </div>
      </div>
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
        <Outlet />
      </main>
    </div>
  )
}
