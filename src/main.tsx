import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErroApp } from './components/ErroApp'
import './index.css'
import { registrarAplicativo } from './lib/atualizacao'
import { instalarMonitoramento } from './lib/monitoramento'

registrarAplicativo()
instalarMonitoramento()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroApp>
      <App />
    </ErroApp>
  </StrictMode>,
)
