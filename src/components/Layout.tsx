import {
  ArrowLeftRight,
  Boxes,
  Ellipsis,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ScanBarcode,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { NOME_EMPRESA, repositorio } from '../lib/dados'
import { Aviso, cx } from './ui'

interface ItemMenu {
  para: string
  rotulo: string
  icone: LucideIcon
}

const MENU: ItemMenu[] = [
  { para: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
  { para: '/estoque', rotulo: 'Estoque', icone: Boxes },
  { para: '/movimentar', rotulo: 'Movimentar', icone: ArrowLeftRight },
  { para: '/historico', rotulo: 'Histórico', icone: History },
  { para: '/produtos', rotulo: 'Produtos', icone: Package },
  { para: '/relatorios', rotulo: 'Relatórios', icone: FileSpreadsheet },
]

const MENU_ADMIN: ItemMenu = { para: '/usuarios', rotulo: 'Usuários', icone: Users }

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function Marca({ claro }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icone.svg" alt="" className="size-9 rounded-xl" />
      <div className="leading-tight">
        <p className={cx('text-sm font-bold', claro ? 'text-white' : 'text-slate-900')}>{NOME_EMPRESA}</p>
        <p className={cx('text-xs', claro ? 'text-emerald-200' : 'text-slate-500')}>Estoque do galpão</p>
      </div>
    </div>
  )
}

export function Layout() {
  const { usuario, admin, sair } = useAuth()
  const { erro, recarregar } = useDados()
  const [tentando, setTentando] = useState(false)
  const online = useOnline()
  const local = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [local.pathname])

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menu lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {(admin ? [...MENU, MENU_ADMIN] : MENU).map(item => (
            <NavLink
              key={item.para}
              to={item.para}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <item.icone className="size-5" />
              {item.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid size-9 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
              {usuario?.nome.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{usuario?.nome}</p>
              <p className="text-xs text-slate-500">{usuario?.papel === 'admin' ? 'Administrador' : 'Operador'}</p>
            </div>
            {repositorio.modo === 'supabase' && (
              <button onClick={sair} className="btn btn-fantasma p-2" title="Sair">
                <LogOut className="size-4.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-20 border-b border-emerald-800 bg-emerald-700 px-4 py-2.5 lg:hidden">
        <Marca claro />
      </header>

      <div className="space-y-2 px-4 pt-3 empty:hidden sm:px-6 lg:px-8">
        {!online && (
          <Aviso tom="erro">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4" /> Sem internet. Os lançamentos só serão salvos quando a conexão voltar.
            </span>
          </Aviso>
        )}
        {erro && online && (
          <Aviso tom="erro">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>Não foi possível atualizar os dados: {erro}</span>
              <button
                className="btn btn-secundario px-3 py-1.5 text-xs"
                disabled={tentando}
                onClick={async () => {
                  setTentando(true)
                  await recarregar().finally(() => setTentando(false))
                }}
              >
                <RefreshCw className={cx('size-3.5', tentando && 'animate-spin')} /> {tentando ? 'Tentando...' : 'Tentar de novo'}
              </button>
            </span>
          </Aviso>
        )}
        {repositorio.modo === 'demo' && (
          <Aviso tom="alerta">
            <strong>Modo demonstração:</strong> os dados ficam salvos apenas neste navegador. Configure o Supabase (veja o
            README) para uso real e compartilhado.
          </Aviso>
        )}
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="pb-seguro fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          <ItemInferior para="/painel" rotulo="Painel" icone={LayoutDashboard} />
          <ItemInferior para="/estoque" rotulo="Estoque" icone={Boxes} />
          <NavLink to="/movimentar" className="-mt-5 flex flex-col items-center gap-1 pb-2">
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'grid size-14 place-items-center rounded-2xl text-white shadow-lg shadow-emerald-900/25 ring-4 ring-white transition',
                    isActive ? 'bg-emerald-800' : 'bg-emerald-700',
                  )}
                >
                  <ScanBarcode className="size-7" />
                </span>
                <span className={cx('text-[11px] font-semibold', isActive ? 'text-emerald-800' : 'text-slate-600')}>Movimentar</span>
              </>
            )}
          </NavLink>
          <ItemInferior para="/historico" rotulo="Histórico" icone={History} />
          <ItemInferior para="/mais" rotulo="Mais" icone={Ellipsis} ativoEm={['/mais', '/produtos', '/relatorios', '/usuarios']} />
        </div>
      </nav>
    </div>
  )
}

function ItemInferior({ para, rotulo, icone: Icone, ativoEm }: { para: string; rotulo: string; icone: LucideIcon; ativoEm?: string[] }) {
  const { pathname } = useLocation()
  const ativo = (ativoEm ?? [para]).some(p => pathname.startsWith(p))
  return (
    <NavLink to={para} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', ativo ? 'text-emerald-800' : 'text-slate-500')}>
      <Icone className="size-6" strokeWidth={ativo ? 2.25 : 1.75} />
      {rotulo}
    </NavLink>
  )
}
