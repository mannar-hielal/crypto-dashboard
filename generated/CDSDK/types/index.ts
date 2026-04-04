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

export interface AuthResponse {
  token: string;
  user: User;
}

export interface MeResponse {
  user: User & { account: Account | null };
}

export interface ApiError {
  error: string;
}
