import { arred } from '../formato'
import type { Lote, Movimentacao, Produto, Usuario } from '../tipos'
import { type BancoDemo, gerarBancoDemo } from './demo-dados'
import type { Repositorio } from './repositorio'

const CHAVE = 'galpao-demo-v1'
const USUARIO_DEMO: Usuario = { id: 'demo', nome: 'Você (demonstração)', email: null, papel: 'admin' }

/**
 * Repositório de demonstração: guarda tudo no navegador e aplica as MESMAS
 * regras do banco (saldo nunca negativo, histórico imutável, correção com motivo).
 */
export function criarRepositorioDemo(
  armazenamento: Storage = localStorage,
  opcoes: {
    /** Quem está lançando (usado pelo servidor local de teste, que atende vários usuários). */
    autor?: () => { id: string | null; nome: string }
  } = {},
): Repositorio {
  const ouvintes = new Set<() => void>()
  const autor = opcoes.autor ?? (() => ({ id: USUARIO_DEMO.id, nome: USUARIO_DEMO.nome }))
  // Equipe fictícia só para demonstrar a tela de Usuários (não é salva).
  const equipe: Usuario[] = [
    USUARIO_DEMO,
    { id: 'demo-joao', nome: 'João (pátio)', email: 'joao@exemplo.com', papel: 'operador', criado_em: '2026-08-01T10:00:00Z' },
    { id: 'demo-maria', nome: 'Maria (escritório)', email: 'maria@exemplo.com', papel: 'operador', criado_em: '2026-08-01T10:05:00Z' },
    { id: 'demo-carlos', nome: 'Carlos (pátio)', email: 'carlos@exemplo.com', papel: 'pendente', criado_em: new Date().toISOString() },
  ]

  function ler(): BancoDemo {
    try {
      const bruto = armazenamento.getItem(CHAVE)
      if (bruto) {
        const banco = JSON.parse(bruto) as BancoDemo
        if (banco.versao === 1) return banco
      }
    } catch {
      /* dados corrompidos: recria */
    }
    const novo = gerarBancoDemo()
    gravar(novo, false)
    return novo
  }

  function gravar(banco: BancoDemo, avisar = true) {
    try {
      armazenamento.setItem(CHAVE, JSON.stringify(banco))
    } catch {
      throw new Error('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado).')
    }
    if (avisar) ouvintes.forEach(cb => cb())
  }

  function saldoDoLote(banco: BancoDemo, loteId: string): number {
    return arred(banco.movs.reduce((s, m) => (m.lote_id === loteId ? s + m.delta : s), 0))
  }

  function incluirMov(banco: BancoDemo, m: Omit<Movimentacao, 'id' | 'criado_em' | 'produto_id' | 'delta' | 'usuario_id' | 'usuario_nome'>): number {
    const lote = banco.lotes.find(l => l.id === m.lote_id)
    if (!lote) throw new Error('Lote não encontrado.')
    const produto = banco.produtos.find(p => p.id === lote.produto_id)!
    const quantidade = arred(m.quantidade)
    if (m.tipo === 'CORRECAO' ? quantidade === 0 : !(quantidade > 0)) throw new Error('Quantidade inválida.')
    const observacao = m.observacao?.trim() || null
    if (m.tipo === 'CORRECAO' && (observacao?.length ?? 0) < 3) throw new Error('Informe o motivo da correção (mínimo 3 caracteres).')
    if (m.referencia_id && !banco.movs.some(x => x.id === m.referencia_id && x.lote_id === m.lote_id))
      throw new Error('A correção deve se referir a uma movimentação do mesmo produto/lote.')

    const delta = m.tipo === 'SAIDA' ? -quantidade : quantidade
    const saldo = saldoDoLote(banco, lote.id)
    if (arred(saldo + delta) < 0)
      throw new Error(`Saldo insuficiente. Disponível neste lote: ${String(saldo).replace('.', ',')} ${produto.unidade}`)

    const id = ++banco.seqMov
    const quem = autor()
    banco.movs.push({
      id,
      criado_em: new Date().toISOString(),
      tipo: m.tipo,
      lote_id: lote.id,
      produto_id: produto.id,
      quantidade,
      delta,
      documento: m.documento?.trim() || null,
      observacao,
      referencia_id: m.referencia_id ?? null,
      usuario_id: quem.id,
      usuario_nome: quem.nome,
    })
    return id
  }

  // Sincroniza abas abertas do mesmo navegador.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
    window.addEventListener('storage', e => {
      if (e.key === CHAVE) ouvintes.forEach(cb => cb())
    })

  return {
    modo: 'demo',

    async sessaoAtual() {
      return USUARIO_DEMO
    },
    async entrar() {
      return USUARIO_DEMO
    },
    async solicitarAcesso() {
      return { confirmarEmail: false }
    },
    async sair() {},
    aoMudarSessao() {
      return () => {}
    },

    async listarUsuarios() {
      return equipe.map(u => ({ ...u }))
    },
    async alterarPapel(usuarioId, papel) {
      if (usuarioId === USUARIO_DEMO.id) throw new Error('Ninguém altera o próprio acesso.')
      const u = equipe.find(x => x.id === usuarioId)
      if (!u) throw new Error('Usuário não encontrado.')
      u.papel = papel
    },

    async listarProdutos() {
      return [...ler().produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },

    async salvarProduto(dados, id) {
      const banco = ler()
      const nome = dados.nome.trim().replace(/\s+/g, ' ')
      if (!nome) throw new Error('Informe o nome do produto.')
      let codigo = dados.codigo_interno.trim().toUpperCase()
      const barras = dados.codigo_barras?.replace(/\s/g, '') || null
      if (!codigo) {
        do codigo = 'P' + String(++banco.seqProduto).padStart(4, '0')
        while (banco.produtos.some(p => p.codigo_interno === codigo && p.id !== id))
      }
      if (banco.produtos.some(p => p.id !== id && p.codigo_interno === codigo))
        throw new Error('Já existe um produto com este código interno.')
      if (barras && banco.produtos.some(p => p.id !== id && p.codigo_barras === barras))
        throw new Error('Já existe um produto com este código de barras.')

      const limpo = {
        ...dados,
        nome,
        codigo_interno: codigo,
        codigo_barras: barras,
        fabricante: dados.fabricante?.trim() || null,
        observacao: dados.observacao?.trim() || null,
      }
      let produto: Produto
      if (id) {
        const atual = banco.produtos.find(p => p.id === id)
        if (!atual) throw new Error('Produto não encontrado.')
        produto = Object.assign(atual, limpo)
      } else {
        produto = { ...limpo, id: crypto.randomUUID(), criado_em: new Date().toISOString() }
        banco.produtos.push(produto)
      }
      gravar(banco)
      return { ...produto }
    },

    async listarLotes() {
      const banco = ler()
      const saldos = new Map<string, number>()
      const ultimas = new Map<string, string>()
      for (const m of banco.movs) {
        saldos.set(m.lote_id, (saldos.get(m.lote_id) ?? 0) + m.delta)
        if ((ultimas.get(m.lote_id) ?? '') < m.criado_em) ultimas.set(m.lote_id, m.criado_em)
      }
      return banco.lotes.map<Lote>(l => ({
        lote_id: l.id,
        produto_id: l.produto_id,
        lote: l.lote,
        validade: l.validade,
        criado_em: l.criado_em,
        saldo: arred(saldos.get(l.id) ?? 0),
        ultima_movimentacao: ultimas.get(l.id) ?? null,
      }))
    },

    async atualizarLote(loteId, dados) {
      const banco = ler()
      const lote = banco.lotes.find(l => l.id === loteId)
      if (!lote) throw new Error('Lote não encontrado.')
      const novoLote = dados.lote.trim().toUpperCase()
      if (banco.lotes.some(l => l.id !== loteId && l.produto_id === lote.produto_id && l.lote === novoLote && l.validade === dados.validade))
        throw new Error('Já existe outro lote igual (mesmo número e validade) para este produto.')
      lote.lote = novoLote
      lote.validade = dados.validade
      gravar(banco)
    },

    async listarMovimentacoes(f = {}) {
      let lista = ler().movs.filter(
        m =>
          (!f.desde || m.criado_em >= f.desde) &&
          (!f.ate || m.criado_em <= f.ate) &&
          (!f.produtoId || m.produto_id === f.produtoId) &&
          (!f.loteId || m.lote_id === f.loteId) &&
          (!f.referenciaId || m.referencia_id === f.referenciaId),
      )
      lista = lista.sort((a, b) => b.id - a.id)
      return f.limite ? lista.slice(0, f.limite) : lista
    },

    async registrarEntrada(e) {
      const banco = ler()
      if (!banco.produtos.some(p => p.id === e.produtoId)) throw new Error('Produto não encontrado.')
      const nomeLote = e.lote.trim().toUpperCase()
      let lote = banco.lotes.find(l => l.produto_id === e.produtoId && l.lote === nomeLote && l.validade === (e.validade || null))
      if (!lote) {
        lote = { id: crypto.randomUUID(), produto_id: e.produtoId, lote: nomeLote, validade: e.validade || null, criado_em: new Date().toISOString() }
        banco.lotes.push(lote)
      }
      const id = incluirMov(banco, { tipo: 'ENTRADA', lote_id: lote.id, quantidade: e.quantidade, documento: e.documento ?? null, observacao: e.observacao ?? null, referencia_id: null })
      gravar(banco)
      return id
    },

    async registrarSaida(s) {
      const banco = ler()
      const id = incluirMov(banco, { tipo: 'SAIDA', lote_id: s.loteId, quantidade: s.quantidade, documento: s.documento ?? null, observacao: s.observacao ?? null, referencia_id: null })
      gravar(banco)
      return id
    },

    async registrarCorrecao(c) {
      const banco = ler()
      const id = incluirMov(banco, { tipo: 'CORRECAO', lote_id: c.loteId, quantidade: c.quantidade, documento: null, observacao: c.observacao, referencia_id: c.referenciaId ?? null })
      gravar(banco)
      return id
    },

    escutarAlteracoes(cb) {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },

    async restaurarDemo() {
      gravar(gerarBancoDemo())
    },
  }
}
