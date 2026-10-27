import { Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo } from '../lib/dados'
import { baixarArquivo } from '../lib/relatorio'
import { COLUNAS_MODELO, lerArquivo, mapearLinhas, modeloCSV, type LeituraImportacao } from '../lib/importacao'
import { formatarNumero } from '../lib/formato'
import { useToast } from './Toast'
import { Aviso, Modal } from './ui'

interface Props {
  aberto: boolean
  aoFechar: () => void
}

/** Importa catálogo e saldo inicial de CSV/XLSX em uma única chamada ao banco. */
export function ImportarCatalogo({ aberto, aoFechar }: Props) {
  const { empresa, loja, pode } = useAtiva()
  const { recarregar } = useDados()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [leitura, setLeitura] = useState<LeituraImportacao | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<catalogo.ResultadoImportacao | null>(null)

  const podeImportar = pode.cadastrarProduto && pode.movimentar
  const preview = useMemo(() => leitura?.linhas.slice(0, 12) ?? [], [leitura])

  function limpar() {
    setArquivo(null)
    setLeitura(null)
    setErro('')
    setResultado(null)
    if (input.current) input.current.value = ''
  }

  async function escolher(f: File | undefined) {
    if (!f) return
    setErro('')
    setResultado(null)
    setLendo(true)
    setArquivo(f)
    try {
      const tabela = await lerArquivo(f)
      const r = mapearLinhas(tabela)
      setLeitura(r)
      if (r.linhas.length === 0) setErro(r.erros[0] ?? 'Nenhum produto válido encontrado.')
    } catch (e) {
      setLeitura(null)
      setErro((e as Error).message)
    } finally {
      setLendo(false)
    }
  }

  async function importar() {
    if (!leitura || leitura.linhas.length === 0) return
    setImportando(true)
    setErro('')
    try {
      const r = await catalogo.importarCatalogo(empresa.empresa_id, loja.id, leitura.linhas)
      setResultado(r)
      await recarregar()
      if (r.criados > 0) toast.sucesso(`${r.criados} produto(s) importado(s).`)
      if (r.erros.length > 0) toast.erro(`${r.erros.length} linha(s) não importada(s).`)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setImportando(false)
    }
  }

  function baixarModelo() {
    baixarArquivo(new Blob([modeloCSV()], { type: 'text/csv;charset=utf-8' }), 'modelo-importacao-catalogo.csv')
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => {
        limpar()
        aoFechar()
      }}
      titulo="Importar catálogo"
      largura="max-w-3xl"
      rodape={
        <>
          <button
            type="button"
            className="btn btn-secundario flex-1"
            onClick={() => {
              limpar()
              aoFechar()
            }}
            disabled={importando}
          >
            {resultado ? 'Fechar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button type="button" className="btn btn-primario flex-1" onClick={importar} disabled={!podeImportar || importando || !leitura || leitura.linhas.length === 0}>
              {importando && <LoaderCircle className="size-4.5 animate-spin" />}
              {importando ? 'Importando...' : `Importar ${leitura?.linhas.length ?? 0} produto(s)`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!podeImportar && <Aviso tom="erro">Seu acesso não permite cadastrar produtos e lançar o saldo inicial.</Aviso>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {!resultado ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Como preparar a planilha</p>
              <p className="mt-1">
                Use a primeira linha como cabeçalho. Obrigatório: <strong>nome</strong>. Para trazer saldo, preencha <strong>quantidade</strong> e,
                se o produto controla lote, preencha também <strong>lote</strong> e <strong>validade</strong>.
              </p>
              <p className="mt-1 text-xs">
                Colunas aceitas: {COLUNAS_MODELO.join(', ')}. Separador CSV: ponto e vírgula. Também aceita .xlsx (primeira aba).
              </p>
              <button type="button" className="btn btn-fantasma mt-2 px-2 py-1 text-sm text-marca-escura" onClick={baixarModelo}>
                <Download className="size-4" /> Baixar modelo CSV
              </button>
            </div>

            <div>
              <label className="rotulo" htmlFor="arquivo-importacao">Arquivo .csv ou .xlsx</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={input}
                  id="arquivo-importacao"
                  type="file"
                  accept=".csv,.tsv,.xlsx,text/csv"
                  className="campo file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-marca-escura"
                  onChange={e => escolher(e.target.files?.[0])}
                  disabled={lendo || importando}
                />
                {arquivo && (
                  <button type="button" className="btn btn-fantasma px-2 py-1 text-sm" onClick={limpar} disabled={importando}>
                    Limpar
                  </button>
                )}
              </div>
              {lendo && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><LoaderCircle className="size-3.5 animate-spin" /> Lendo arquivo...</p>}
            </div>

            {leitura && (
              <div className="space-y-2">
                <Aviso tom={leitura.erros.length ? 'alerta' : 'info'}>
                  <strong>{leitura.linhas.length} produto(s) pronto(s)</strong> para importar
                  {leitura.erros.length ? `; ${leitura.erros.length} linha(s) com problema.` : '.'}
                </Aviso>
                {leitura.erros.length > 0 && (
                  <ul className="max-h-32 list-disc space-y-1 overflow-auto rounded-xl bg-amber-50 p-3 pl-7 text-xs text-amber-900">
                    {leitura.erros.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                {preview.length > 0 && (
                  <div className="overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5">Linha</th>
                          <th className="px-2 py-1.5">Produto</th>
                          <th className="px-2 py-1.5">Unid.</th>
                          <th className="px-2 py-1.5 text-right">Preço</th>
                          <th className="px-2 py-1.5 text-right">Mínimo</th>
                          <th className="px-2 py-1.5 text-right">Saldo inicial</th>
                          <th className="px-2 py-1.5">Lote</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.map(l => (
                          <tr key={l.linha}>
                            <td className="px-2 py-1.5 tabular-nums text-slate-400">{l.linha}</td>
                            <td className="max-w-48 truncate px-2 py-1.5 font-medium text-slate-800">{l.nome}</td>
                            <td className="px-2 py-1.5">{l.unidade}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.preco_venda === null ? '—' : l.preco_venda.toFixed(2).replace('.', ',')}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.estoque_minimo === null ? '—' : formatarNumero(l.estoque_minimo)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatarNumero(l.quantidade)}</td>
                            <td className="px-2 py-1.5">{l.lote || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {leitura.linhas.length > preview.length && (
                      <p className="border-t border-slate-100 bg-white px-2 py-1.5 text-xs text-slate-500">
                        Mostrando {preview.length} de {leitura.linhas.length} linhas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <Aviso tom={resultado.erros.length ? 'alerta' : 'info'}>
              <p className="font-semibold">
                {resultado.criados} produto(s) criado(s), {resultado.estoques} saldo(s) inicial(is) lançado(s).
              </p>
              {resultado.erros.length > 0 && <p className="mt-1">{resultado.erros.length} linha(s) não foram importadas.</p>}
            </Aviso>
            {resultado.erros.length > 0 && (
              <ul className="max-h-52 list-disc space-y-1 overflow-auto rounded-xl bg-amber-50 p-3 pl-7 text-xs text-amber-900">
                {resultado.erros.map((e, i) => <li key={i}>Linha {e.linha}: {e.mensagem}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secundario" onClick={limpar}>
                <FileSpreadsheet className="size-4" /> Importar outro arquivo
              </button>
              <button type="button" className="btn btn-primario" onClick={() => { limpar(); aoFechar() }}>
                <Upload className="size-4" /> Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
