export interface Env {
  ENV: string
  FILA: Queue
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  META_APP_SECRET: string
  META_VERIFY_TOKEN: string
  META_GRAPH_VERSION: string
  LLM_API_KEY: string
  LLM_BASE_URL: string
  LLM_MODEL: string
  SIMULADOR_ATIVO?: string
}
