import {
  AlertOctagon,
  ArrowLeftRight,
  Banknote,
  Boxes,
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Ellipsis,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  ScanBarcode,
  ShoppingCart,
  Store,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAtualizacao } from '../lib/atualizacao'
import { vendas as dadosVendas } from '../lib/dados'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { formatarData } from '../lib/formato'
import { NOME_PAPEL } from '../lib/permissoes'
import type { Vinculo } from '../lib/tipos'
import { Aviso, Modal, cx } from './ui'

/** Nome do sistema (marca do produto) — a empresa do cliente aparece ao lado. */
export const NOME_SISTEMA = (import.meta.env.VITE_NOME_SISTEMA as string | undefined) || 'Controle de Estoque'

interface ItemMenu {
  para: string
  rotulo: string
  icone: LucideIcon
  contador?: number
}

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

export function Marca({ claro, titulo = NOME_SISTEMA, subtitulo = 'Estoque e vendas' }: { claro?: boolean; titulo?: string; subtitulo?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src="/icone.svg" alt="" className="size-9 shrink-0 rounded-xl" />
      <div className="min-w-0 leading-tight">
        <p className={cx('truncate text-sm font-bold', claro ? 'text-white' : 'text-slate-900')}>{titulo}</p>
        <p className={cx('truncate text-xs', claro ? 'text-emerald-200' : 'text-slate-500')}>{subtitulo}</p>
      </div>
    </div>
  )
}

/** Aviso da assinatura: atraso, somente leitura, suspensa. */
function AvisoAssinatura({ empresa }: { empresa: Vinculo }) {
  const limite = empresa.pago_ate ?? empresa.trial_ate
  switch (empresa.estado) {
    case 'atrasada':
      return (
        <Aviso tom="alerta">
          <strong>Assinatura em atraso.</strong> Regularize para evitar o bloqueio dos lançamentos
          {limite ? ` (venceu em ${formatarData(limite)})` : ''}.
        </Aviso>
      )
    case 'somente_leitura':
    case 'suspensa':
    case 'cancelada':
      return (
        <Aviso tom="erro">
          <strong>{empresa.estado === 'cancelada' ? 'Assinatura cancelada.' : 'Assinatura vencida.'}</strong> O sistema está somente para consulta: nada
          foi apagado e os relatórios continuam disponíveis. {empresa.papel === 'dono' ? 'Regularize a assinatura para voltar a lançar.' : 'Fale com o responsável pela empresa.'}
        </Aviso>
      )
    default:
      return null
  }
}

export function Layout() {
  const { usuario, sair } = useAuth()
  const { empresa, loja, lojas, vinculos, pode, trocarLoja } = useAtiva()
  const { erro, recarregar, versao } = useDados()
  const [divergencias, setDivergencias] = useState(0)
  const atualizacao = useAtualizacao()
  const [tentando, setTentando] = useState(false)
  const [escolhendo, setEscolhendo] = useState(false)
  const online = useOnline()
  const local = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [local.pathname])

  // Quantas divergências dos caixas esperam conferência (dono e gerente).
  useEffect(() => {
    if (!pode.verDivergencias) return
    dadosVendas.contarDivergenciasAbertas(empresa.empresa_id, loja.id).then(setDivergencias, () => {})
  }, [pode.verDivergencias, empresa.empresa_id, loja.id, versao, local.pathname])

  const menu: ItemMenu[] = [
    { para: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
    { para: '/estoque', rotulo: 'Estoque', icone: Boxes },
    ...(pode.movimentar ? [{ para: '/movimentar', rotulo: 'Movimentar', icone: ArrowLeftRight }] : []),
    { para: '/historico', rotulo: 'Histórico', icone: History },
    { para: '/produtos', rotulo: 'Produtos', icone: Package },
    { para: '/vendas', rotulo: 'Vendas', icone: Banknote },
    ...(pode.verDivergencias ? [{ para: '/divergencias', rotulo: 'Divergências', icone: AlertOctagon, contador: divergencias }] : []),
    { para: '/relatorios', rotulo: 'Relatórios', icone: FileSpreadsheet },
    ...(pode.movimentar ? [{ para: '/inventario', rotulo: 'Inventário', icone: ClipboardList }] : []),
    ...(pode.convidar || pode.gerenciarEquipe ? [{ para: '/equipe', rotulo: 'Equipe', icone: Users }] : []),
    { para: '/empresa', rotulo: 'Empresa', icone: Building2 },
  ]
  const variasLojas = (lojas?.length ?? 0) > 1
  const subtitulo = variasLojas ? loja.nome : NOME_SISTEMA

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menu lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="space-y-2 px-4 py-4">
          <button
            className="flex w-full items-center gap-2 rounded-xl p-1 text-left transition hover:bg-slate-50"
            onClick={() => setEscolhendo(true)}
            title="Trocar de empresa"
          >
            <Marca titulo={empresa.nome} subtitulo={subtitulo} />
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-slate-400" />
          </button>
          {variasLojas && <SeletorLoja />}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {pode.vender && (
            <Link to="/pdv" className="mb-2 flex items-center gap-3 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">
              <ShoppingCart className="size-5" /> Abrir o caixa (PDV)
            </Link>
          )}
          {menu.map(item => (
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
              <span className="flex-1">{item.rotulo}</span>
              {!!item.contador && <span className="rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{item.contador}</span>}
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
              <p className="text-xs text-slate-500">{NOME_PAPEL[empresa.papel]}</p>
            </div>
            <button onClick={sair} className="btn btn-fantasma p-2" title="Sair">
              <LogOut className="size-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-emerald-800 bg-emerald-700 px-4 py-2.5 lg:hidden">
        <button className="min-w-0 text-left" onClick={() => setEscolhendo(true)} aria-label="Trocar de empresa ou loja">
          <Marca claro titulo={empresa.nome} subtitulo={subtitulo} />
        </button>
        {(variasLojas || (vinculos?.length ?? 0) > 1) && <ChevronsUpDown className="size-4 shrink-0 text-emerald-200" />}
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
        {atualizacao.disponivel && (
          <Aviso tom="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>Há uma versão nova do sistema.</span>
              <button className="btn btn-secundario px-3 py-1.5 text-xs" onClick={atualizacao.atualizar}>
                <RefreshCw className="size-3.5" /> Atualizar agora
              </button>
            </span>
          </Aviso>
        )}
        <AvisoAssinatura empresa={empresa} />
        {empresa.config.exemplo && (
          <Aviso tom="info">
            <strong>Empresa de exemplo:</strong> os dados são fictícios, para você conhecer o sistema.{' '}
            <Link to="/empresas/nova" className="font-semibold underline underline-offset-2">Cadastrar minha empresa</Link>
          </Aviso>
        )}
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <div key={local.pathname} className="animar-entrada">
          <Outlet />
        </div>
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="pb-seguro fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className={cx('mx-auto grid max-w-md items-end px-2', pode.movimentar ? 'grid-cols-5' : 'grid-cols-4')}>
          <ItemInferior para="/painel" rotulo="Painel" icone={LayoutDashboard} />
          <ItemInferior para="/estoque" rotulo="Estoque" icone={Boxes} />
          {pode.movimentar && (
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
          )}
          <ItemInferior para="/historico" rotulo="Histórico" icone={History} />
          <ItemInferior para="/mais" rotulo="Mais" icone={Ellipsis} ativoEm={['/mais', '/produtos', '/relatorios', '/inventario', '/equipe', '/empresa', '/vendas', '/divergencias']} />
        </div>
      </nav>

      <EscolherEmpresa aberto={escolhendo} aoFechar={() => setEscolhendo(false)} trocarLoja={trocarLoja} />
    </div>
  )
}

function SeletorLoja() {
  const { loja, lojas, trocarLoja } = useAtiva()
  return (
    <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
      <Store className="size-4 shrink-0 text-slate-500" />
      <span className="sr-only">Loja</span>
      <select className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none" value={loja.id} onChange={e => trocarLoja(e.target.value)} aria-label="Loja">
        {lojas!.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    </label>
  )
}

/** Troca de empresa (para quem trabalha em mais de uma) e de loja (no celular). */
function EscolherEmpresa({ aberto, aoFechar, trocarLoja }: { aberto: boolean; aoFechar: () => void; trocarLoja: (id: string) => void }) {
  const { vinculos, empresa, loja, lojas, trocarEmpresa } = useAtiva()
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Empresa e loja">
      <div className="space-y-5">
        {(lojas?.length ?? 0) > 1 && (
          <section>
            <h3 className="rotulo">Loja</h3>
            <div className="cartao divide-y divide-slate-100 overflow-hidden">
              {lojas!.map(l => (
                <button key={l.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => { trocarLoja(l.id); aoFechar() }}>
                  <Store className="size-4.5 text-slate-400" />
                  <span className="flex-1 font-medium text-slate-800">{l.nome}</span>
                  {l.id === loja.id && <Check className="size-4.5 text-emerald-700" />}
                </button>
              ))}
            </div>
          </section>
        )}
        <section>
          <h3 className="rotulo">Empresa</h3>
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {(vinculos ?? []).map(v => (
              <button
                key={v.empresa_id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                onClick={() => { trocarEmpresa(v.empresa_id); aoFechar() }}
              >
                <Building2 className="size-4.5 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{v.nome}</span>
                  <span className="block text-xs text-slate-500">{NOME_PAPEL[v.papel]}</span>
                </span>
                {v.empresa_id === empresa.empresa_id && <Check className="size-4.5 text-emerald-700" />}
              </button>
            ))}
            <Link to="/empresas/nova" onClick={aoFechar} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-slate-50">
              <Plus className="size-4.5" /> Cadastrar outra empresa
            </Link>
          </div>
        </section>
      </div>
    </Modal>
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
