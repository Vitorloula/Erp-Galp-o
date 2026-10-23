/** Validação e formatação de CPF (para "CPF na nota"). Puro e testável. */

/** Aceita só dígitos (11) e confere os dois dígitos verificadores. */
export function validarCpf(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, '')
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false // 111.111.111-11 etc.

  const dig = (i: number) => Number(digitos[i])
  let soma = 0
  for (let i = 0; i < 9; i++) soma += dig(i) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== dig(9)) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += dig(i) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === dig(10)
}

/** Formata 11 dígitos em "000.000.000-00"; se inválido, devolve o texto original. */
export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}
