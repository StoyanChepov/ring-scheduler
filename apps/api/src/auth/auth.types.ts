export interface JwtPayload {
  sub: string;
  email: string;
}

/** The user attached to `request.user` by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}
