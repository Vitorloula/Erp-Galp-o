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
