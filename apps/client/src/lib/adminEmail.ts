/**
 * Whether `email` is the configured admin address — for hiding admin UI only (the server's 403 is the
 * real check). Compared the way registration stores e-mails: trimmed and lower-cased.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  const admin = import.meta.env.VITE_ADMIN_EMAIL;
  if (!email || !admin) return false;
  return email.trim().toLowerCase() === admin.trim().toLowerCase();
}
