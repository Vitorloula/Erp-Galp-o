export interface MetaWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      field: string
      value: {
        messaging_product: string
        metadata?: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<MetaMessage>
        statuses?: Array<{ id: string; status: string; timestamp: string }>
      }
    }>
  }>
}

export interface MetaMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  button?: { text: string; payload: string }
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
}
