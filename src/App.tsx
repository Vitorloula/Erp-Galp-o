import { Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { ConvitePendente, guardarConviteDaUrl, useConvitePendente } from './components/Convite'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { Aviso, Carregando } from './components/ui'
import { AuthProvider, useAuth } from './contexto/Auth'
import { DadosProvider } from './contexto/Dados'
import { EmpresaProvider, useEmpresa } from './contexto/Empresa'
import { configurado } from './lib/dados'
import { lazy } from 'react'
import { adminSouAdmin } from './lib/admin/cliente'
import { BoasVindas } from './pages/BoasVindas'
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })))
const AdminPainel = lazy(() => import('./pages/admin/AdminPainel').then(m => ({ default: m.AdminPainel })))
const AdminEmpresa = lazy(() => import('./pages/admin/AdminEmpresa').then(m => ({ default: m.AdminEmpresa })))
const AdminObservabilidade = lazy(() => import('./pages/admin/AdminObservabilidade').then(m => ({ default: m.AdminObservabilidade })))
const AdminIncidentes = lazy(() => import('./pages/admin/AdminIncidentes').then(m => ({ default: m.AdminIncidentes })))
const AdminAuditoria = lazy(() => import('./pages/admin/AdminAuditoria').then(m => ({ default: m.AdminAuditoria })))
import { EmpresaConfig } from './pages/EmpresaConfig'
import { Divergencias } from './pages/Divergencias'
import { Equipe } from './pages/Equipe'
import { Estoque } from './pages/Estoque'
import { Historico } from './pages/Historico'
import { Inventario } from './pages/Inventario'
import { Login, NovaSenha } from './pages/Login'
import { TelaCheia } from './components/TelaCheia'
import { Mais } from './pages/Mais'
import { Movimentar } from './pages/Movimentar'
import { Painel } from './pages/Painel'
import { ProdutoDetalhe } from './pages/ProdutoDetalhe'
import { Produtos } from './pages/Produtos'
import { Pdv } from './pages/pdv/Pdv'
import { Servicos } from './pages/Servicos'
import { ServicosAgenda } from './pages/ServicosAgenda'
import { ServicosRecebimento } from './pages/ServicosRecebimento'
import { ServicosDetalhe } from './pages/ServicosDetalhe'
import { Relatorios } from './pages/Relatorios'
import { Vendas } from './pages/Vendas'

// Link de convite (/convite#token): guarda o token antes de qualquer tela, inclusive o login.
guardarConviteDaUrl()

function Sistema() {
  const { empresa, loja, lojas, vinculos, erro } = useEmpresa()
  const convite = useConvitePendente()
  if (convite.token) return <ConvitePendente {...convite} />
  if (!vinculos) return <Carregando texto="Abrindo a empresa..." />
  if (!empresa) return <BoasVindas />
  if (!lojas) return <Carregando texto="Abrindo a loja..." />
  if (!loja)
    return (
      <TelaCheia>
        <Aviso tom="erro">{erro ?? 'Você não tem acesso a nenhuma loja ativa desta empresa. Fale com o responsável.'}</Aviso>
      </TelaCheia>
    )
  return (
    <Routes>
      {/* Caixa: tela cheia, funciona sem internet (não depende dos dados da retaguarda) */}
      <Route path="/pdv" element={<Pdv key={`${empresa.empresa_id}:${loja.id}`} />} />
      <Route path="*" element={<Retaguarda chave={`${empresa.empresa_id}:${loja.id}`} />} />
    </Routes>
  )
}

function Retaguarda({ chave }: { chave: string }) {
  return (
    <DadosProvider key={chave}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/painel" element={<Painel />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/movimentar" element={<Movimentar />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/produtos/:id" element={<ProdutoDetalhe />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/mais" element={<Mais />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/empresa" element={<EmpresaConfig />} />
          <Route path="/empresas/nova" element={<BoasVindas dentroDoSistema />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/divergencias" element={<Divergencias />} />
          <Route path="/os" element={<Servicos />} />
          <Route path="/os/nova" element={<ServicosRecebimento />} />
          <Route path="/os/agenda" element={<ServicosAgenda />} />
          <Route path="/os/:id" element={<ServicosDetalhe />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </DadosProvider>
  )
}

function Rotas() {
  const { usuario, pronto, definindoSenha } = useAuth()
  const [ehSuperAdmin, setEhSuperAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    if (!usuario) { setEhSuperAdmin(false); return }
    setEhSuperAdmin(null)
    adminSouAdmin().then(setEhSuperAdmin).catch(() => setEhSuperAdmin(false))
  }, [usuario])

  if (!configurado)
    return (
      <TelaCheia>
        <Aviso tom="erro">
          Sistema sem configuração: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o README) ou rode <code>npm run dev</code> para usar o
          servidor local de teste.
        </Aviso>
      </TelaCheia>
    )
  if (!pronto) return <Carregando texto="Abrindo o sistema..." />
  if (usuario && ehSuperAdmin === null) return <Carregando texto="Abrindo o sistema..." />
  if (!usuario) return <Login />
  if (definindoSenha) return <NovaSenha />
  // Super admin: vai direto pro painel da plataforma, sem carregar o Painel da loja
  // (mesmo que a conta tenha loja associada — ela é só para super admin).
  if (ehSuperAdmin) {
    if (!window.location.pathname.startsWith('/admin')) return <Navigate to="/admin" replace />
    return (
      <Suspense fallback={<Carregando texto="Abrindo..." />}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminPainel />} />
            <Route path="/admin/empresas" element={<AdminPainel />} />
            <Route path="/admin/empresas/:id" element={<AdminEmpresa />} />
            <Route path="/admin/logs" element={<AdminObservabilidade />} />
            <Route path="/admin/incidentes" element={<AdminIncidentes />} />
            <Route path="/admin/auditoria" element={<AdminAuditoria />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </Suspense>
    )
  }
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<Carregando texto="Abrindo..." />}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminPainel />} />
            <Route path="/admin/empresas" element={<AdminPainel />} />
            <Route path="/admin/empresas/:id" element={<AdminEmpresa />} />
            <Route path="/admin/logs" element={<AdminObservabilidade />} />
            <Route path="/admin/incidentes" element={<AdminIncidentes />} />
            <Route path="/admin/auditoria" element={<AdminAuditoria />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </Suspense>
    )
  }
  return (
    <EmpresaProvider key={usuario.id}>
      <Sistema />
    </EmpresaProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Rotas />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
