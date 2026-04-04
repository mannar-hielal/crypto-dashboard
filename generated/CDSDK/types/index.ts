// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
}

export interface Account {
  id: string;
  userId: string;
  totalBalance: string; // Prisma Decimal serialises to string in JSON
  availableBalance: string;
  unrealizedPnl: string;
  realizedPnl: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string;
}

// Returned by /register and /login
// accessToken is short-lived (15 min) — store in Zustand memory only, never localStorage
export interface AuthResponse {
  accessToken: string;
  user: User;
}

// Returned by /refresh
export interface RefreshResponse {
  accessToken: string;
}

export interface MeResponse {
  user: User & { account: Account | null };
}

// Returned by /forgot-password and /reset-password
export interface MessageResponse {
  message: string;
}

export interface ApiError {
  error: string;
}
