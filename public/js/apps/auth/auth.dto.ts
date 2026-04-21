// ============================================================
// AUTH — DTOs & Validação (Zod)
// Schemas usados tanto na validação dos endpoints quanto
// nos tipos TypeScript inferidos automaticamente.
// ============================================================

import { z } from 'zod';

export const RegisterDTO = z.object({
  username: z
    .string()
    .min(3,  'Username deve ter no mínimo 3 caracteres')
    .max(20, 'Username deve ter no máximo 20 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e underscore'),

  password: z
    .string()
    .min(6,  'Senha deve ter no mínimo 6 caracteres')
    .max(72, 'Senha deve ter no máximo 72 caracteres'), // limite do bcrypt
});

export const LoginDTO = z.object({
  username: z.string().min(1, 'Username obrigatório'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type RegisterInput = z.infer<typeof RegisterDTO>;
export type LoginInput    = z.infer<typeof LoginDTO>;

// Payload contido dentro do JWT
export interface JWTPayload {
  sub:      string; // player.id
  username: string;
  iat?:     number;
  exp?:     number;
}

// Resposta de login/register bem-sucedido
export interface AuthResponse {
  token:    string;
  player: {
    id:       string;
    username: string;
    level:    number;
  };
}
