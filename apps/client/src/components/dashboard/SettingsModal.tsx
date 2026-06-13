import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User as UserIcon, Mail, Trash2, Check, AlertTriangle, HelpCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? local.substring(0, 2) + '••••' : local + '••••';
  const domainParts = domain.split('.');
  const domainName = domainParts[0];
  const maskedDomain = domainName.length > 2 ? domainName.substring(0, 2) + '•••' : domainName + '•••';
  return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
};

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { user, accessToken, updateUser, clearAuth } = useAuthStore();
  const [username, setUsername] = useState(user?.username ?? '');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPasswordForNewPass, setCurrentPasswordForNewPass] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [showPasswordConfirm, setShowPasswordConfirm] = useState<'none' | 'sending' | 'sent'>('none');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sync state when user changes or modal opens
  useEffect(() => {
    if (open && user) {
      setUsername(user.username);
      setShowEmailPanel(false);
      setShowPasswordConfirm('none');
      setShowDeleteConfirm(false);
      setUsernameError(null);
      setEmailError(null);
      setDeleteError(null);
      setPasswordError(null);
      setEmailSuccess(false);
      setPasswordSuccess(false);
    }
  }, [open, user]);

  if (!user || !accessToken) return null;

  const handleUpdateUsername = async () => {
    setIsUpdatingUsername(true);
    setUsernameError(null);
    setUsernameSuccess(false);

    try {
      const res = await authApi.updateUsername({ username }, accessToken);
      updateUser({ username: res.user.username });
      setUsernameSuccess(true);
      setTimeout(() => setUsernameSuccess(false), 3000);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleUpdateEmail = async () => {
    setIsUpdatingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);

    try {
      await authApi.updateEmail({ email: newEmail, currentPassword }, accessToken);
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 5000);
      setShowEmailPanel(false);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    setIsUpdatingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      await authApi.updatePassword(
        { currentPassword: currentPasswordForNewPass, newPassword },
        accessToken
      );
      setPasswordSuccess(true);
      setTimeout(() => {
        // Password change forces logout server-side
        clearAuth();
        window.location.href = '/login';
      }, 2000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    setShowPasswordConfirm('sending');
    try {
      await authApi.forgotPassword({ email: user.email });
      setShowPasswordConfirm('sent');
    } catch {
      setShowPasswordConfirm('none');
    }
  };

  const handleRequestDeletion = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await authApi.requestDeletion({ password: deletePassword }, accessToken);
      // Success: requestDeletion forces logout server-side
      clearAuth();
      // Wipe localStorage as per plan
      localStorage.removeItem('cd-paper-trading');
      localStorage.removeItem('cd-layout');
      localStorage.removeItem('cd-paper-col-prefs');
      localStorage.removeItem('cd-cookie-notice-dismissed');
      window.location.href = '/login';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl shadow-2xl"
            style={{ background: bg.panel, border: `1px solid ${color.purpleDeep}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 p-4 bg-white/2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                 Settings
              </h2>
              <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[85vh] overflow-y-auto p-4 space-y-6">
              {/* Profile Section */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <UserIcon className="w-3 h-3" /> Profile
                </h3>
                <div className="p-4 rounded-lg space-y-4" style={{ background: bg.surface }}>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-white/50">Username</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="flex-1 h-9 px-3 rounded bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="Choose a username"
                      />
                      <button
                        onClick={handleUpdateUsername}
                        disabled={isUpdatingUsername || username === user.username || !username}
                        className="h-9 px-4 rounded text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        style={{ background: usernameSuccess ? color.green : color.purple, color: '#fff' }}
                      >
                        {isUpdatingUsername ? '...' : usernameSuccess ? <><Check className="w-3.5 h-3.5" /> Saved</> : 'Save'}
                      </button>
                    </div>
                    {usernameError && <p className="text-[11px] text-red-400 mt-1">{usernameError}</p>}
                  </div>
                </div>
              </section>

              {/* Sign-in Credentials */}
              <section className="space-y-3">
                 <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Sign-in Credentials
                </h3>
                <div className="p-4 rounded-lg space-y-4" style={{ background: bg.surface }}>
                  {/* Email Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-medium text-white/50">Email address</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white/80">{maskEmail(user.email)}</p>
                        {emailSuccess && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase tracking-tight">
                            <Check className="w-3 h-3" /> Verification Sent
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowEmailPanel(!showEmailPanel)}
                      className="text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                      style={{ background: 'rgba(255,255,255,0.05)', color: color.purple }}
                    >
                      Change email
                    </button>
                  </div>

                  {showEmailPanel && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-3 pt-3 border-t border-white/5"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-white/50">New email</label>
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          className="w-full h-9 px-3 rounded bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-white/50">Current password</label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full h-9 px-3 rounded bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        />
                      </div>
                      {emailError && <p className="text-[11px] text-red-400">{emailError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleUpdateEmail}
                          disabled={isUpdatingEmail || !newEmail || !currentPassword}
                          className="flex-1 h-9 rounded text-xs font-bold transition-all disabled:opacity-50"
                          style={{ background: color.purple, color: '#fff' }}
                        >
                          {isUpdatingEmail ? 'Updating...' : 'Update Email'}
                        </button>
                        <button
                          onClick={() => {
                            setShowEmailPanel(false);
                            setNewEmail('');
                            setCurrentPassword('');
                            setEmailError(null);
                          }}
                          className="px-4 text-xs font-medium text-white/40 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <hr className="border-white/5" />

                  {/* Password Row */}
                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-medium text-white/50">Password</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white/80">••••••••••••</p>
                        {passwordSuccess && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase tracking-tight">
                            <Check className="w-3 h-3" /> Updated
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRequestPasswordReset}
                        disabled={showPasswordConfirm !== 'none'}
                        className="text-[11px] font-bold text-purple-400 hover:text-purple-300 disabled:opacity-50 transition-colors uppercase tracking-tight"
                      >
                        {showPasswordConfirm === 'sending'
                          ? 'Sending...'
                          : showPasswordConfirm === 'sent'
                            ? 'Link Sent'
                            : 'Reset via email'}
                      </button>
                      <span className="text-white/10">|</span>
                      <button
                        onClick={() => setShowPasswordPanel(!showPasswordPanel)}
                        className="text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-tight"
                      >
                        {showPasswordPanel ? 'Cancel' : 'Change'}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showPasswordPanel && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                              Current Password
                            </label>
                            <input
                              type="password"
                              value={currentPasswordForNewPass}
                              onChange={(e) => setCurrentPasswordForNewPass(e.target.value)}
                              placeholder="Confirm your current password"
                              className="w-full h-9 px-3 rounded bg-black/40 border border-white/5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                              New Password
                            </label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="At least 8 characters"
                              className="w-full h-9 px-3 rounded bg-black/40 border border-white/5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            />
                          </div>

                          {passwordError && <p className="text-[11px] text-red-400 font-medium">{passwordError}</p>}

                          <button
                            onClick={handleUpdatePassword}
                            disabled={isUpdatingPassword || !newPassword || !currentPasswordForNewPass}
                            className="w-full h-9 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded text-xs font-bold text-white transition-all uppercase tracking-wider shadow-lg shadow-purple-600/20"
                          >
                            {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                          </button>
                          <p className="text-[10px] text-white/30 text-center leading-tight">
                            Note: You will be logged out after a successful password change.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400/60 flex items-center gap-2">
                  <Trash2 className="w-3 h-3" /> Danger Zone
                </h3>
                <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 space-y-4">
                   <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-red-200">Account deletion</p>
                      <HelpCircle size={14} className="text-white/20 cursor-help" />
                    </div>
                    <p className="text-xs text-white/50 leading-relaxed">
                      If you ever want to delete your account, you can. The process takes 30 days and you can change your mind at any time.
                    </p>
                  </div>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full h-9 rounded text-xs font-bold transition-all hover:bg-red-500/20 border border-red-500/30 text-red-300"
                    >
                      Delete account
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3 pt-3 border-t border-red-500/10"
                    >
                      <p className="text-xs font-medium text-red-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Confirm your password to continue
                      </p>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="w-full h-9 px-3 rounded bg-black/20 border border-red-500/20 text-white text-sm focus:border-red-500/50 focus:outline-none transition-colors"
                        placeholder="Current password"
                      />
                      {deleteError && <p className="text-[11px] text-red-400">{deleteError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleRequestDeletion}
                          disabled={isDeleting || !deletePassword}
                          className="flex-1 h-9 rounded bg-red-500 text-xs font-bold text-white transition-all disabled:opacity-50"
                        >
                          {isDeleting ? 'Scheduling...' : 'Schedule Deletion'}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteError(null);
                          }}
                          className="px-4 text-xs font-medium text-white/40 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
