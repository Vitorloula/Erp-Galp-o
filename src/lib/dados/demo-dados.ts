import { hojeISO, somarDias } from '../formato'
import type { Categoria, Movimentacao, Produto, TipoMov, Unidade } from '../tipos'

export interface LoteBase {
  id: string
  produto_id: string
  lote: string
  validade: string | null
  criado_em: string
}

export interface BancoDemo {
  versao: 1
  seqProduto: number
  seqMov: number
  produtos: Produto[]
  lotes: LoteBase[]
  movs: Movimentacao[]
}

/** EAN-13 fictício com dígito verificador válido (prefixo 789 = Brasil). */
function ean13(base12: string): string {
  const soma = base12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (soma % 10)) % 10)
}

interface ModeloLote {
  lote: string
  validadeEmDias: number | null
  entradas: { diasAtras: number; qtd: number; doc?: string }[]
  saidas?: { diasAtras: number; qtd: number; doc?: string; obs?: string }[]
}

interface ModeloProduto {
  nome: string
  categoria: Categoria
  unidade: Unidade
  emb: number | null
  barras: string | null
  fabricante: string
  lotes: ModeloLote[]
}

const MODELOS: ModeloProduto[] = [
  {
    nome: 'Glifosato 480 SL', categoria: 'defensivo', unidade: 'L', emb: 20, barras: ean13('789100000001'), fabricante: 'AgroSul Química',
    lotes: [{ lote: 'GL2508', validadeEmDias: 240, entradas: [{ diasAtras: 40, qtd: 400, doc: 'NF 10421' }], saidas: [{ diasAtras: 33, qtd: 60, doc: 'Ped. 881' }, { diasAtras: 12, qtd: 80, doc: 'Ped. 902' }, { diasAtras: 2, qtd: 20, doc: 'Ped. 915' }] }],
  },
  {
    nome: 'Atrazina 500 SC', categoria: 'defensivo', unidade: 'L', emb: 20, barras: ean13('789100000002'), fabricante: 'AgroSul Química',
    lotes: [
      { lote: 'AT2401', validadeEmDias: -9, entradas: [{ diasAtras: 58, qtd: 100, doc: 'NF 10188' }], saidas: [{ diasAtras: 30, qtd: 60, doc: 'Ped. 870' }] },
      { lote: 'AT2507', validadeEmDias: 310, entradas: [{ diasAtras: 6, qtd: 120, doc: 'NF 10502' }] },
    ],
  },
  {
    nome: 'Mancozebe 800 WP', categoria: 'defensivo', unidade: 'kg', emb: 25, barras: ean13('789100000003'), fabricante: 'Campo Forte',
    lotes: [{ lote: 'MZ0325', validadeEmDias: 18, entradas: [{ diasAtras: 50, qtd: 200, doc: 'NF 10230' }], saidas: [{ diasAtras: 21, qtd: 75 }, { diasAtras: 4, qtd: 50, doc: 'Ped. 911' }] }],
  },
  {
    nome: 'Lambda-cialotrina 50 EC', categoria: 'defensivo', unidade: 'L', emb: 1, barras: ean13('789100000004'), fabricante: 'Campo Forte',
    lotes: [{ lote: 'LC1124', validadeEmDias: 25, entradas: [{ diasAtras: 44, qtd: 30, doc: 'NF 10301' }], saidas: [{ diasAtras: 9, qtd: 18, doc: 'Ped. 897' }] }],
  },
  {
    nome: '2,4-D Amina 806 SL', categoria: 'defensivo', unidade: 'L', emb: 20, barras: ean13('789100000005'), fabricante: 'AgroSul Química',
    lotes: [{ lote: 'DA0925', validadeEmDias: 400, entradas: [{ diasAtras: 35, qtd: 80, doc: 'NF 10377' }], saidas: [{ diasAtras: 20, qtd: 40, doc: 'Ped. 884' }, { diasAtras: 3, qtd: 40, doc: 'Ped. 913' }] }],
  },
  {
    nome: 'Tiametoxam 350 FS', categoria: 'defensivo', unidade: 'L', emb: 1, barras: ean13('789100000006'), fabricante: 'Sementec',
    lotes: [{ lote: 'TM0824', validadeEmDias: 11, entradas: [{ diasAtras: 47, qtd: 24, doc: 'NF 10255' }], saidas: [{ diasAtras: 15, qtd: 18 }] }],
  },
  {
    nome: 'Ureia 45% N (saco 50 kg)', categoria: 'fertilizante', unidade: 'sc', emb: null, barras: null, fabricante: 'Fertimais',
    lotes: [{ lote: '', validadeEmDias: 520, entradas: [{ diasAtras: 55, qtd: 300, doc: 'NF 88120' }], saidas: [{ diasAtras: 41, qtd: 60 }, { diasAtras: 26, qtd: 40, doc: 'Romaneio 51' }, { diasAtras: 1, qtd: 20, doc: 'Romaneio 58' }] }],
  },
  {
    nome: 'MAP 11-52-00 (saco 50 kg)', categoria: 'fertilizante', unidade: 'sc', emb: null, barras: ean13('789100000008'), fabricante: 'Fertimais',
    lotes: [{ lote: 'MP2509', validadeEmDias: 610, entradas: [{ diasAtras: 14, qtd: 120, doc: 'NF 88301' }], saidas: [{ diasAtras: 5, qtd: 25, doc: 'Romaneio 55' }] }],
  },
  {
    nome: 'Cloreto de Potássio KCl 60%', categoria: 'fertilizante', unidade: 'sc', emb: null, barras: null, fabricante: 'Fertimais',
    lotes: [{ lote: '', validadeEmDias: null, entradas: [{ diasAtras: 52, qtd: 80, doc: 'NF 88119' }], saidas: [{ diasAtras: 31, qtd: 50 }, { diasAtras: 8, qtd: 30, doc: 'Romaneio 53' }] }],
  },
  {
    nome: 'NPK 04-14-08 (big bag)', categoria: 'fertilizante', unidade: 't', emb: 1, barras: null, fabricante: 'Fertimais',
    lotes: [{ lote: 'BB-0925', validadeEmDias: 260, entradas: [{ diasAtras: 22, qtd: 18, doc: 'NF 88250' }], saidas: [{ diasAtras: 7, qtd: 5.5, doc: 'Romaneio 54' }] }],
  },
  {
    nome: 'Óleo mineral adjuvante', categoria: 'adjuvante', unidade: 'L', emb: 5, barras: ean13('789100000011'), fabricante: 'Campo Forte',
    lotes: [{ lote: 'OM2506', validadeEmDias: 95, entradas: [{ diasAtras: 29, qtd: 60, doc: 'NF 10360' }], saidas: [{ diasAtras: 10, qtd: 25 }] }],
  },
  {
    nome: 'Fertilizante foliar Boro 10%', categoria: 'fertilizante', unidade: 'ml', emb: 1000, barras: ean13('789100000012'), fabricante: 'Nutriplant',
    lotes: [{ lote: 'BO0724', validadeEmDias: -3, entradas: [{ diasAtras: 57, qtd: 12000, doc: 'NF 4410' }], saidas: [{ diasAtras: 27, qtd: 3500 }] }],
  },
]

const USUARIOS = ['João (pátio)', 'Maria (escritório)', 'Carlos (pátio)']

function instante(diasAtras: number, hora: number): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  d.setHours(hora, (diasAtras * 17) % 60, 0, 0)
  return d.toISOString()
}

const uuid = () => crypto.randomUUID()

export function gerarBancoDemo(): BancoDemo {
  const hoje = hojeISO()
  const produtos: Produto[] = []
  const lotes: LoteBase[] = []
  const brutos: Omit<Movimentacao, 'id'>[] = []

  MODELOS.forEach((m, i) => {
    const produto: Produto = {
      id: uuid(),
      codigo_interno: 'P' + String(i + 1).padStart(4, '0'),
      codigo_barras: m.barras,
      nome: m.nome,
      categoria: m.categoria,
      unidade: m.unidade,
      conteudo_embalagem: m.emb,
      fabricante: m.fabricante,
      observacao: null,
      ativo: true,
      criado_em: instante(60, 8),
    }
    produtos.push(produto)
    for (const ml of m.lotes) {
      const primeira = Math.max(...ml.entradas.map(e => e.diasAtras))
      const lote: LoteBase = {
        id: uuid(),
        produto_id: produto.id,
        lote: ml.lote,
        validade: ml.validadeEmDias === null ? null : somarDias(hoje, ml.validadeEmDias),
        criado_em: instante(primeira, 7),
      }
      lotes.push(lote)
      const mov = (tipo: TipoMov, diasAtras: number, qtd: number, hora: number, doc?: string, obs?: string) =>
        brutos.push({
          criado_em: instante(diasAtras, hora),
          tipo,
          lote_id: lote.id,
          produto_id: produto.id,
          quantidade: qtd,
          delta: tipo === 'SAIDA' ? -qtd : qtd,
          documento: doc ?? null,
          observacao: obs ?? null,
          referencia_id: null,
          usuario_id: null,
          usuario_nome: USUARIOS[(diasAtras + hora) % USUARIOS.length],
        })
      ml.entradas.forEach(e => mov('ENTRADA', e.diasAtras, e.qtd, 8, e.doc))
      ml.saidas?.forEach((s, k) => mov('SAIDA', s.diasAtras, s.qtd, 10 + k, s.doc, s.obs))
    }
  })

  brutos.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const movs: Movimentacao[] = brutos.map((m, i) => ({ ...m, id: i + 1 }))

  // Exemplo de correção: uma saída digitada a mais e corrigida depois.
  const saidaGli = movs.find(m => m.tipo === 'SAIDA' && m.produto_id === produtos[0].id)!
  movs.push({
    ...saidaGli,
    id: movs.length + 1,
    criado_em: new Date(new Date(saidaGli.criado_em).getTime() + 3_600_000).toISOString(),
    tipo: 'CORRECAO',
    quantidade: 20,
    delta: 20,
    documento: null,
    observacao: 'Saída lançada com 60 L, o correto eram 40 L',
    referencia_id: saidaGli.id,
    usuario_nome: 'Maria (escritório)',
  })
  movs.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  movs.forEach((m, i) => {
    if (m.referencia_id) m.referencia_id = movs.findIndex(x => x === saidaGli) + 1
    m.id = i + 1
  })

  return { versao: 1, seqProduto: produtos.length, seqMov: movs.length, produtos, lotes, movs }
}
