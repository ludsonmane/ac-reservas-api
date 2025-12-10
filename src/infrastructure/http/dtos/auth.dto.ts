// +++ adicione no topo:
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// (mantenha suas interfaces)
export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email?: string;
    role?: string;
  };
}
