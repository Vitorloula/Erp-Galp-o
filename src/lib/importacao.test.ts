import { describe, expect, it } from 'vitest'
import { lerArquivo, lerCSV, mapearLinhas, modeloCSV, numeroPlanilha, dataPlanilha } from './importacao'

describe('importação de catálogo', () => {
  it('lê CSV com ponto e vírgula, aspas, quebra de linha e BOM', () => {
    const csv = '\uFEFFnome;preco_venda;observacao\r\n"Produto; especial";10,50;"linha 1\nlinha 2"\r\nOutro;2;ok\r\n'
    expect(lerCSV(csv)).toEqual([
      ['nome', 'preco_venda', 'observacao'],
      ['Produto; especial', '10,50', 'linha 1\nlinha 2'],
      ['Outro', '2', 'ok'],
    ])
  })

  it('detecta vírgula como separador quando o cabeçalho usa vírgula', () => {
    expect(lerCSV('nome,unidade\nArroz,kg\n')).toEqual([
      ['nome', 'unidade'],
      ['Arroz', 'kg'],
    ])
  })

  it('converte números brasileiros e datas', () => {
    expect(numeroPlanilha('R$ 1.234,56')).toBe(1234.56)
    expect(numeroPlanilha('32,90')).toBe(32.9)
    expect(numeroPlanilha('1234.56')).toBe(1234.56)
    expect(dataPlanilha('31/12/2027')).toBe('2027-12-31')
    expect(dataPlanilha('2027-01-05')).toBe('2027-01-05')
  })

  it('mapeia colunas, códigos, lote, validade e mínimo', () => {
    const tabela = lerCSV(
      'Produto;SKU;EAN;Grupo;Unidade;Preço;Mínimo;Quantidade;Lote;Validade;Controla estoque;Rastreio\n' +
        'Atrazina;A001;7891234567890;Defensivo;L;32,90;10;100;AT-1;31/12/2027;sim;lote\n',
    )
    const r = mapearLinhas(tabela)
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({
      linha: 2,
      nome: 'Atrazina',
      codigo_interno: 'A001',
      categoria: 'Defensivo',
      unidade: 'L',
      preco_venda: 32.9,
      estoque_minimo: 10,
      quantidade: 100,
      lote: 'AT-1',
      validade: '2027-12-31',
      controla_estoque: true,
      rastreio: 'lote',
    })
    expect(r.linhas[0].codigos[0]).toMatchObject({ codigo: '07891234567890', fator: 1 })
  })

  it('rejeita linhas inválidas sem derrubar o arquivo e aponta a linha', () => {
    const tabela = lerCSV(
      'nome;unidade;preco_venda;quantidade;codigo_interno\n' +
        ';L;10;1;A1\n' +
        'Produto;xx;10;1;A2\n' +
        'Produto 2;un;abc;1;A3\n' +
        'Produto 3;un;10;-1;A4\n' +
        'Produto 4;un;10;1;A5\n' +
        'Produto 5;un;10;1;A5\n',
    )
    const r = mapearLinhas(tabela)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].nome).toBe('Produto 4')
    expect(r.erros).toHaveLength(5)
    expect(r.erros[0]).toContain('Linha 2')
    expect(r.erros[4]).toContain('código interno A5 repetido')
  })

  it('deixa o lote opcional para saldo sem lote; o banco decide o que fazer', () => {
    const r = mapearLinhas(lerCSV('nome;quantidade;rastreio\nProduto;5;lote\n'))
    expect(r.erros).toEqual([])
    expect(r.linhas[0]).toMatchObject({ quantidade: 5, rastreio: 'lote', lote: '' })
  })

  it('aceita mais de um código na mesma célula e descarta a linha com código repetido', () => {
    const tabela = [
      ['nome', 'codigo_barras'],
      ['Produto A', '7890000000011, 7890000000028'],
      ['Produto B', '7890000000011'],
      ['Produto C', '7890000000028'],
    ]
    const r = mapearLinhas(tabela)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].codigos).toHaveLength(2)
    expect(r.erros).toHaveLength(2)
    expect(r.erros[0]).toContain('código de barras 7890000000011 repetido')
    expect(r.erros[1]).toContain('código de barras 7890000000028 repetido')
  })

  it('lê a primeira aba de um XLSX', async () => {
    const ExcelJS = (await import('exceljs')).default
    const pasta = new ExcelJS.Workbook()
    const aba = pasta.addWorksheet('Catálogo')
    aba.addRow(['nome', 'unidade', 'preco_venda', 'quantidade', 'validade'])
    aba.addRow(['Produto XLSX', 'kg', 12.5, 3, new Date(Date.UTC(2027, 11, 31))])
    const buffer = await pasta.xlsx.writeBuffer()
    const arquivo = { name: 'catalogo.xlsx', arrayBuffer: async () => buffer } as unknown as File

    const r = mapearLinhas(await lerArquivo(arquivo))
    expect(r.erros).toEqual([])
    expect(r.linhas[0]).toMatchObject({
      nome: 'Produto XLSX',
      unidade: 'kg',
      preco_venda: 12.5,
      quantidade: 3,
      validade: '2027-12-31',
    })
  }, 20_000)

  it('o modelo CSV volta a ser importável', () => {
    const r = mapearLinhas(lerCSV(modeloCSV()))
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].nome).toBe('Produto exemplo')
  })
})
