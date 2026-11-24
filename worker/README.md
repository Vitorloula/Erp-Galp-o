# Worker — Atendimento WhatsApp (esqueleto F0)

Backend do agente que atende clientes no WhatsApp do comércio.

## Rodar local

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # preencher
npm run dev                      # http://127.0.0.1:8787
```

## Testar sem a Meta

```bash
curl -X POST http://127.0.0.1:8787/dev/simular \
  -H 'content-type: application/json' \
  -d '{"phoneNumberId":"<id do canal>","de":"5511999999999","texto":"voces tem racao?"}'
```

O simulador enfileira uma mensagem como se viesse do webhook, sem assinatura.

## Deploy

```bash
npm run deploy   # wrangler deploy
```

Segredos em produção via `wrangler secret put`.

## Pendências (F0)

- Trocar o token placeholder em `supabase.ts#buscarCanal` pelo business token Meta (cofre).
- Implementar Embedded Signup v5 no frontend (`/whatsapp`) — hoje placeholder.
- Coexistence: processar `smb_message_echoes` para pausar o bot quando o atendente responde no app.
- Tela de Conversas e Pedidos (frontend).
- Golden set de 40 conversas.

## Status

- `FISCAL_ATIVO = false` e `WHATSAPP_ATIVO = false` em `src/lib/recursos.ts`.
- Migration `20261124120000_whatsapp_atendimento.sql` aplicada e verde no `test:sql`.
