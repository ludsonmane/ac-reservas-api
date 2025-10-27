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
