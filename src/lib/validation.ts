import { z } from "zod";

export function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = normalizeDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export const registrationSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo."),
  cpf: z.string().refine(isValidCpf, "Informe um CPF válido."),
  email: z.string().trim().email("Informe um e-mail válido."),
  phone: z.string().refine((value) => normalizeDigits(value).length >= 10, "Informe um telefone válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").regex(/[A-Z]/, "Inclua uma letra maiúscula.").regex(/[0-9]/, "Inclua um número."),
  role: z.enum(["client", "caregiver"]),
  acceptedTerms: z.literal(true, { message: "Aceite os termos para continuar." }),
});

export type RegistrationData = z.infer<typeof registrationSchema>;