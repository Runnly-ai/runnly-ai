export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export const AUTH_COOKIE_NAME = 'asf_auth_token';

