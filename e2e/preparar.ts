import { writeFileSync } from 'node:fs'
import { VIDEO_CAMERA, VIDEO_SEM_CODIGO } from '../playwright.config'

/** Código de barras da Atrazina 500 SC nos dados de demonstração. */
export const EAN_CAMERA = '7891000000021'

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = L.map(c => [...c].map(b => (b === '1' ? '0' : '1')).join(''))
const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** Sequência de 95 módulos (1 = barra) de um EAN-13. */
export function modulosEan13(codigo: string): string {
  const d = codigo.split('').map(Number)
  const paridade = PARIDADE[d[0]]
  let m = '101'
  for (let i = 1; i <= 6; i++) m += (paridade[i - 1] === 'L' ? L : G)[d[i]]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += R[d[i]]
  return m + '101'
}

/**
 * Gera um vídeo Y4M (formato aceito pela câmera falsa do Chromium/Edge)
 * mostrando o código de barras, como se a embalagem estivesse na frente da câmera.
 */
function gerarVideo(codigo: string | null, arquivo: string) {
  const W = 640
  const H = 480
  const modulo = 4
  const x0 = Math.floor((W - 95 * modulo) / 2)
  const y = Buffer.alloc(W * H, 235) // fundo branco
  if (codigo) {
    const barras = modulosEan13(codigo)
    for (let linha = 90; linha < H - 90; linha++)
      for (let i = 0; i < 95; i++)
        if (barras[i] === '1') y.fill(16, linha * W + x0 + i * modulo, linha * W + x0 + (i + 1) * modulo)
  } else {
    // "Prateleira" sem código: faixas cinzas, nada para ler
    for (let linha = 0; linha < H; linha++) if (Math.floor(linha / 60) % 2) y.fill(170, linha * W, (linha + 1) * W)
  }
  const croma = Buffer.alloc((W / 2) * (H / 2), 128)
  const quadro = Buffer.concat([Buffer.from('FRAME\n'), y, croma, croma])
  writeFileSync(arquivo, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`), quadro, quadro]))
}

export default function preparar() {
  gerarVideo(EAN_CAMERA, VIDEO_CAMERA)
  gerarVideo(null, VIDEO_SEM_CODIGO)
}
