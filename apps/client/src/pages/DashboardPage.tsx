import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';
import { Button } from '@/components/ui/button';

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
      <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
        Logout
      </Button>
    </div>
  );
}
