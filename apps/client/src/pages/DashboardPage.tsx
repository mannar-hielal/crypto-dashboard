import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';

export function DashboardPage() {
  const { user, clearAuth } = useAuthStore();

  async function handleLogout() {
    await authApi.logout();
    clearAuth();
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Welcome, {user?.username} 👋</p>
      <button onClick={() => void handleLogout()} className="text-sm underline">
        Logout
      </button>
    </div>
  );
}
