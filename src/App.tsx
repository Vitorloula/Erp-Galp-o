import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { ConvitePendente, guardarConviteDaUrl, useConvitePendente } from './components/Convite'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { Aviso, Carregando } from './components/ui'
import { AuthProvider, useAuth } from './contexto/Auth'
import { DadosProvider } from './contexto/Dados'
import { EmpresaProvider, useEmpresa } from './contexto/Empresa'
import { configurado } from './lib/dados'
import { BoasVindas } from './pages/BoasVindas'
import { EmpresaConfig } from './pages/EmpresaConfig'
import { Equipe } from './pages/Equipe'
import { Estoque } from './pages/Estoque'
import { Historico } from './pages/Historico'
import { Login, NovaSenha } from './pages/Login'
import { TelaCheia } from './components/TelaCheia'
import { Mais } from './pages/Mais'
import { Movimentar } from './pages/Movimentar'
import { Painel } from './pages/Painel'
import { ProdutoDetalhe } from './pages/ProdutoDetalhe'
import { Produtos } from './pages/Produtos'
import { Relatorios } from './pages/Relatorios'

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
    <DadosProvider key={`${empresa.empresa_id}:${loja.id}`}>
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
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/empresa" element={<EmpresaConfig />} />
          <Route path="/empresas/nova" element={<BoasVindas dentroDoSistema />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </DadosProvider>
  )
}

function Rotas() {
  const { usuario, pronto, definindoSenha } = useAuth()
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
  if (!usuario) return <Login />
  if (definindoSenha) return <NovaSenha />
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
