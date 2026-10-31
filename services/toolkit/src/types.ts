export interface TokenPayload {
  userId: number;
  jti: string;
  exp: number;
  iss?: string;
}
