import { CameraOff, Flashlight, FlashlightOff, Keyboard, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { lerCodigo, type CodigoLido } from '../lib/gs1'
import { cx } from './ui'

interface Props {
  aberto: boolean
  aoFechar: () => void
  aoLer: (codigo: CodigoLido) => void
  titulo?: string
}

/** Leitor de código de barras pela câmera do celular (EAN, Code128, QR, DataMatrix GS1...). */
export function LeitorCodigo(props: Props) {
  if (!props.aberto) return null
  return <LeitorAtivo {...props} />
}

// Html5QrcodeScannerState (constantes copiadas para não carregar a biblioteca antes da hora).
const ESTADO_LENDO = 2
const ESTADO_PAUSADO = 3

function sinalSonoro() {
  navigator.vibrate?.(90)
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 1200
    ganho.gain.value = 0.05
    osc.connect(ganho).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.11)
    osc.onended = () => ctx.close()
  } catch {
    /* sem áudio: tudo bem */
  }
}

function mensagemErroCamera(e: unknown): string {
  const t = String((e as Error)?.name ?? '') + ' ' + String((e as Error)?.message ?? e)
  if (/NotAllowed|Permission|denied/i.test(t))
    return 'Permissão da câmera negada. Libere o acesso à câmera para este site nas configurações do navegador e tente de novo.'
  if (/NotFound|Requested device not found|no camera/i.test(t)) return 'Nenhuma câmera encontrada neste aparelho.'
  if (/NotReadable|in use|Could not start/i.test(t)) return 'A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.'
  return 'Não foi possível abrir a câmera. Você pode digitar o código abaixo.'
}

function LeitorAtivo({ aoFechar, aoLer, titulo = 'Escanear código de barras' }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const scanner = useRef<Html5Qrcode | null>(null)
  const callback = useRef(aoLer)
  callback.current = aoLer
  const lido = useRef(false)

  const [estado, setEstado] = useState<'iniciando' | 'lendo' | 'erro'>('iniciando')
  const [erro, setErro] = useState('')
  const [lanterna, setLanterna] = useState<boolean | null>(null) // null = aparelho sem lanterna controlável
  const [digitado, setDigitado] = useState('')

  useEffect(() => {
    let cancelado = false
    let instancia: Html5Qrcode | null = null
    // Um elemento novo a cada abertura evita conflito entre leitores sendo fechados/abertos.
    const alvo = document.createElement('div')
    alvo.id = 'leitor-' + Math.random().toString(36).slice(2)
    alvo.className = 'leitor-video h-full w-full'
    area.current?.appendChild(alvo)

    let inicio: Promise<unknown> = Promise.resolve()
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErro('A câmera só funciona com conexão segura (https). Acesse o sistema pelo endereço oficial.')
      setEstado('erro')
    } else {
      inicio = import('html5-qrcode')
        .then(({ Html5Qrcode, Html5QrcodeSupportedFormats: F }) => {
          if (cancelado) return
          instancia = new Html5Qrcode(alvo.id, {
            verbose: false,
            useBarCodeDetectorIfSupported: true,
            formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE, F.DATA_MATRIX],
          })
          scanner.current = instancia
          return instancia
            .start(
              { facingMode: 'environment' },
              {
                fps: 12,
                // Faixa central larga (ideal para código de barras); a biblioteca exige no mínimo 50 px.
                qrbox: (w, h) => ({ width: Math.max(50, Math.floor(Math.min(w * 0.82, 380))), height: Math.max(50, Math.floor(Math.min(h * 0.42, 230))) }),
              },
              texto => {
                if (lido.current) return
                lido.current = true
                sinalSonoro()
                callback.current(lerCodigo(texto))
              },
              () => {},
            )
            .then(() => {
              if (cancelado) return
              setEstado('lendo')
              try {
                const cap = instancia!.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean }
                if (cap.torch) setLanterna(false)
              } catch {
                /* sem suporte */
              }
            })
        })
        .catch(e => {
          if (cancelado) return
          setErro(mensagemErroCamera(e))
          setEstado('erro')
        })
    }

    return () => {
      cancelado = true
      // O React vai remover a área do leitor agora, mas a câmera pode ainda estar ligando.
      // Mantemos o vídeo na página, fora da tela, até ele ser desligado de verdade
      // (senão a câmera fica acesa e o play() do vídeo é interrompido com erro).
      alvo.style.cssText = 'position:fixed;left:-10000px;top:0;width:360px;height:640px;pointer-events:none'
      document.body.appendChild(alvo)
      inicio.finally(async () => {
        const leitor = instancia as Html5Qrcode | null
        if (leitor) {
          // A biblioteca considera iniciado antes de o vídeo começar a tocar ("isScanning" só
          // vira true depois). Fechar nesse intervalo deixaria a câmera ligada e interromperia
          // o play() com erro; então esperamos o vídeo arrancar (até ~2 s) antes de parar.
          for (let i = 0; i < 40 && !leitor.isScanning && leitor.getState() === ESTADO_LENDO; i++)
            await new Promise(r => setTimeout(r, 50))
          try {
            if (leitor.getState() === ESTADO_LENDO || leitor.getState() === ESTADO_PAUSADO) await leitor.stop()
          } catch {
            /* já parado */
          }
          try {
            leitor.clear()
          } catch {
            /* ignorado */
          }
        }
        alvo.remove()
      })
    }
  }, [])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])

  async function alternarLanterna() {
    if (lanterna === null || !scanner.current) return
    try {
      await scanner.current.applyVideoConstraints({ advanced: [{ torch: !lanterna }] } as unknown as MediaTrackConstraints)
      setLanterna(!lanterna)
    } catch {
      setLanterna(null)
    }
  }

  function confirmarDigitado(e: React.FormEvent) {
    e.preventDefault()
    if (!digitado.trim()) return
    callback.current(lerCodigo(digitado))
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold">{titulo}</p>
        <button onClick={aoFechar} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Fechar leitor">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div ref={area} className="absolute inset-0" />
        {estado === 'iniciando' && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <LoaderCircle className="size-5 animate-spin" /> Abrindo a câmera...
            </span>
          </div>
        )}
        {estado === 'erro' && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-sm text-center">
              <CameraOff className="mx-auto mb-3 size-10 text-slate-400" />
              <p className="text-sm text-slate-200">{erro}</p>
            </div>
          </div>
        )}
        {estado === 'lendo' && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white drop-shadow">
            Aponte para o código de barras da embalagem
          </p>
        )}
      </div>

      <div className="pb-seguro space-y-3 bg-slate-900 px-4 pt-4">
        {lanterna !== null && (
          <button
            onClick={alternarLanterna}
            className={cx('btn w-full', lanterna ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}
          >
            {lanterna ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
            {lanterna ? 'Desligar lanterna' : 'Ligar lanterna'}
          </button>
        )}
        <form onSubmit={confirmarDigitado} className="flex gap-2 pb-4">
          <div className="relative flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
            <input
              value={digitado}
              onChange={e => setDigitado(e.target.value)}
              inputMode="numeric"
              placeholder="Ou digite o código"
              className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pl-10 pr-3 text-base text-white outline-none placeholder:text-slate-400 focus:border-emerald-400"
            />
          </div>
          <button className="btn btn-primario" disabled={!digitado.trim()}>
            OK
          </button>
        </form>
      </div>
    </div>
  )
}
