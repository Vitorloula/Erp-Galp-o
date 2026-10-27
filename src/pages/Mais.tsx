import { AlertOctagon, Banknote, Building2, ChevronRight, ClipboardList, FileSpreadsheet, LogOut, Package, Pencil, ShoppingCart, Smartphone, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '../components/Avatar'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Modal } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useAtiva } from '../contexto/Empresa'
import { sessao } from '../lib/dados'
import { NOME_PAPEL } from '../lib/permissoes'

function Item({ para, icone: Icone, titulo, texto }: { para: string; icone: LucideIcon; titulo: string; texto: string }) {
  return (
    <Link to={para} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
      <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-marca">
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
  const { usuario, sair } = useAuth()
  const { empresa, pode } = useAtiva()
  const [editandoNome, setEditandoNome] = useState(false)

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Cabecalho titulo="Mais opções" />

      <div className="cartao flex items-center gap-3 p-4">
        <Avatar nome={usuario?.nome} tamanho="lg" className="bg-emerald-100 text-marca-escura" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{usuario?.nome}</p>
          <p className="truncate text-sm text-slate-500">
            {NOME_PAPEL[empresa.papel]} em {empresa.nome}
            {usuario?.email && ` · ${usuario.email}`}
          </p>
        </div>
        <button className="btn btn-fantasma p-2" onClick={() => setEditandoNome(true)} aria-label="Alterar meu nome">
          <Pencil className="size-4" />
        </button>
      </div>

      {pode.vender && (
        <Link to="/pdv" className="btn btn-primario btn-grande w-full">
          <ShoppingCart className="size-5" /> Abrir o caixa (PDV)
        </Link>
      )}

      <div className="cartao divide-y divide-slate-100 overflow-hidden">
        <Item para="/vendas" icone={Banknote} titulo="Vendas" texto="Vendas dos caixas e fechamentos" />
        {pode.verDivergencias && <Item para="/divergencias" icone={AlertOctagon} titulo="Divergências" texto="O que os caixas registraram sem internet e precisa de conferência" />}
        <Item para="/produtos" icone={Package} titulo="Produtos" texto="Cadastro, códigos de barras, preços e lotes" />
        <Item para="/relatorios" icone={FileSpreadsheet} titulo="Relatórios" texto="Semanais e mensais em Excel ou PDF" />
        {pode.movimentar && <Item para="/inventario" icone={ClipboardList} titulo="Inventário" texto="Conferir o estoque físico sem ver o saldo" />}
        {(pode.convidar || pode.gerenciarEquipe) && <Item para="/equipe" icone={Users} titulo="Equipe" texto="Convidar pessoas e definir o que cada uma faz" />}
        <Item para="/empresa" icone={Building2} titulo="Empresa" texto="Dados, lojas e assinatura" />
      </div>

      <div className="cartao flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-4 text-sm">
        <a className="font-medium text-marca-escura hover:underline" href="/privacidade.html" target="_blank" rel="noreferrer">Política de Privacidade</a>
        <a className="font-medium text-marca-escura hover:underline" href="/termos.html" target="_blank" rel="noreferrer">Termos de Uso</a>
      </div>

      <div className="cartao flex gap-3 p-4 text-sm text-slate-600">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-marca" />
        <p>
          <strong className="text-slate-800">Dica:</strong> adicione o sistema à tela inicial do celular para abrir como um aplicativo. No Android (Chrome): menu ⋮ →
          “Adicionar à tela inicial”. No iPhone (Safari): botão Compartilhar → “Adicionar à Tela de Início”.
        </p>
      </div>

      <button className="btn btn-secundario w-full text-red-700" onClick={sair}>
        <LogOut className="size-4.5" /> Sair deste aparelho
      </button>

      <EditarNome aberto={editandoNome} aoFechar={() => setEditandoNome(false)} />
    </div>
  )
}

function EditarNome({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { usuario, atualizarUsuario } = useAuth()
  const toast = useToast()
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!usuario) return
    setErro('')
    setSalvando(true)
    try {
      atualizarUsuario(await sessao.alterarNome(usuario.id, nome))
      toast.sucesso('Nome atualizado.')
      aoFechar()
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Meu nome"
      rodape={
        <>
          <button className="btn btn-secundario flex-1" onClick={aoFechar}>Cancelar</button>
          <button form="form-nome" className="btn btn-primario flex-1" disabled={salvando || !nome.trim()}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-nome" onSubmit={salvar} className="space-y-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <label className="rotulo" htmlFor="meu-nome">Como seu nome aparece no histórico e para a equipe</label>
        <input id="meu-nome" className="campo" value={nome} onChange={e => setNome(e.target.value)} />
      </form>
    </Modal>
  )
}
