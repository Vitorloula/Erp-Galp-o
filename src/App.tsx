import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { Carregando } from './components/ui'
import { AuthProvider, useAuth } from './contexto/Auth'
import { DadosProvider } from './contexto/Dados'
import { Estoque } from './pages/Estoque'
import { Historico } from './pages/Historico'
import { AguardandoLiberacao, Login } from './pages/Login'
import { Mais } from './pages/Mais'
import { Movimentar } from './pages/Movimentar'
import { Painel } from './pages/Painel'
import { ProdutoDetalhe } from './pages/ProdutoDetalhe'
import { Produtos } from './pages/Produtos'
import { Relatorios } from './pages/Relatorios'
import { Usuarios } from './pages/Usuarios'

function Rotas() {
  const { usuario, pronto } = useAuth()
  if (!pronto) return <Carregando texto="Abrindo o sistema..." />
  if (!usuario) return <Login />
  if (usuario.papel === 'pendente') return <AguardandoLiberacao />
  return (
    <DadosProvider key={usuario.id}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/painel" element={<Painel />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/movimentar" element={<Movimentar />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/produtos/:id" element={<ProdutoDetalhe />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/mais" element={<Mais />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </DadosProvider>
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
