import { describe, expect, it } from 'vitest'
import { formatarCpf, validarCpf } from './cpf'

describe('CPF', () => {
  it('valida CPFs válidos e rejeita inválidos', () => {
    expect(validarCpf('529.982.247-25')).toBe(true)
    expect(validarCpf('52998224725')).toBe(true)
    expect(validarCpf('111.111.111-11')).toBe(false) // dígitos repetidos
    expect(validarCpf('123.456.789-00')).toBe(false)
    expect(validarCpf('123')).toBe(false)
  })

  it('formata 11 dígitos em CPF', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
    expect(formatarCpf('529.982.247-25')).toBe('529.982.247-25')
    expect(formatarCpf('abc')).toBe('abc')
  })
})
