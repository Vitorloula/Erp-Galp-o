import { AlertOctagon, Check, Copy, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TelaCheia } from './TelaCheia'
import { diagnosticoParaSuporte, registrarErro } from '../lib/monitoramento'

interface Props {
  children: ReactNode
}

interface State {
  erro: Error | null
  copiado: boolean
}

/** Última barreira: se uma tela quebrar, a loja vê o que fazer e o suporte recebe o erro. */
export class ErroApp extends Component<Props, State> {
  state: State = { erro: null, copiado: false }

  static getDerivedStateFromError(erro: Error): State {
    return { erro, copiado: false }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    registrarErro(erro.message, `${erro.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  copiarDiagnostico = async () => {
    const texto = diagnosticoParaSuporte({ origem: 'tela-de-erro' })
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      this.setState({ copiado: true })
      window.setTimeout(() => this.setState({ copiado: false }), 2500)
    } catch {
      this.setState({ copiado: false })
    }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <TelaCheia largura="max-w-lg">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-700">
              <AlertOctagon className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">A tela encontrou um erro</h1>
              <p className="mt-1 text-sm text-slate-600">
                Seus dados continuam salvos. Recarregue a página; se o problema continuar, envie o diagnóstico ao suporte.
              </p>
            </div>
          </div>
          <pre className="max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
            {this.state.erro.message}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn btn-primario flex-1" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4.5" /> Recarregar
            </button>
            <button type="button" className="btn btn-secundario flex-1" onClick={this.copiarDiagnostico}>
              {this.state.copiado ? <Check className="size-4.5" /> : <Copy className="size-4.5" />}
              {this.state.copiado ? 'Diagnóstico copiado' : 'Copiar diagnóstico'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            O erro foi anotado neste aparelho para o suporte. Nenhuma senha ou dado de cartão é enviado.
          </p>
        </div>
      </TelaCheia>
    )
  }
}
