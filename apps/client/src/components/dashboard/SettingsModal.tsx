import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User as UserIcon, Mail, Trash2, Check, AlertTriangle, HelpCircle, Lock, Download, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color, fontSize, gradient, radius } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaperStore } from '@/store/paperStore';

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
  const paperState = usePaperStore();

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
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [showPasswordConfirm, setShowPasswordConfirm] = useState<'none' | 'sending' | 'sent'>('none');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Animation variants (reused from LoginPage feel)
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.35,
        ease: 'easeOut',
        staggerChildren: 0.05,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: { duration: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } },
  };

  // Sync state when user changes or modal opens
  useEffect(() => {
    if (open && user) {
      setUsername(user.username);
      setShowEmailPanel(false);
      setShowPasswordPanel(false);
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


  const handleExportData = () => {
    const exportData = {
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerifiedAt: user.emailVerifiedAt,
        termsAcceptedAt: user.termsAcceptedAt,
        termsAcceptedIp: user.termsAcceptedIp,
        exportDate: new Date().toISOString(),
      },
      paperTrading: {
        balance: paperState.balance,
        leverage: paperState.leverage,
        realizedPnl: paperState.realizedPnl,
        positions: paperState.positions,
        pendingOrders: paperState.pendingOrders,
        history: paperState.history,
        orders: paperState.orders,
        balanceLog: paperState.balanceLog,
        journal: paperState.journal,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpt-data-export-${user.username}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/8 shadow-2xl"
            style={{ background: bg.panel }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 p-6 bg-white/2">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Settings
                </h2>
                <p className="text-sm" style={{ color: color.muted }}>
                  Manage your account and security
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-white/40 hover:bg-white/5 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[85vh] overflow-y-auto p-6 space-y-8">
              {/* Profile Section */}
              <motion.section variants={itemVariants} className="space-y-4">
                <h3
                  className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
                  style={{ color: color.muted }}
                >
                  <UserIcon className="w-3.5 h-3.5" /> Profile Settings
                </h3>
                <div className="p-6 rounded-2xl border border-white/8 space-y-4 shadow-sm" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="space-y-2">
                    <label
                      className="text-xs font-semibold uppercase tracking-widest block"
                      style={{ color: color.muted }}
                    >
                      Username
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose a username"
                        className="h-10 border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                        style={{ background: bg.surface }}
                      />
                      <Button
                        onClick={handleUpdateUsername}
                        disabled={isUpdatingUsername || username === user.username || !username}
                        variant="default"
                        className="h-10 px-6 font-bold tracking-wide text-white"
                        style={{
                          background: usernameSuccess
                            ? color.green
                            : isUpdatingUsername || username === user.username || !username
                            ? `${color.purpleDark}40`
                            : gradient.brand,
                          borderRadius: radius.button,
                          boxShadow: !usernameSuccess && username !== user.username && username ? `0 0 15px ${gradient.brandFrom}44` : 'none',
                        }}
                      >
                        {isUpdatingUsername ? '...' : usernameSuccess ? <><Check className="w-4 h-4 mr-1" /> Saved</> : 'Save'}
                      </Button>
                    </div>
                    {usernameError && <p className="text-xs font-medium mt-1" style={{ color: color.red }}>{usernameError}</p>}
                  </div>
                </div>
              </motion.section>

              {/* Security Section */}
              <motion.section variants={itemVariants} className="space-y-4">
                <h3
                  className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
                  style={{ color: color.muted }}
                >
                  <Lock className="w-3.5 h-3.5" /> Security & Credentials
                </h3>
                <div className="p-6 rounded-2xl border border-white/8 space-y-6 shadow-sm" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {/* Email Row */}
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <label
                          className="text-xs font-semibold uppercase tracking-widest block"
                          style={{ color: color.muted }}
                        >
                          Email address
                        </label>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-medium text-white">{maskEmail(user.email)}</p>
                          {emailSuccess && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                              <Check className="w-3 h-3" /> Verification Sent
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEmailPanel(!showEmailPanel)}
                        className="border-white/10 text-white/60 hover:text-white hover:border-white/20"
                      >
                        Change email
                      </Button>
                    </div>

                    <AnimatePresence>
                      {showEmailPanel && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 overflow-hidden pt-2"
                        >
                          <div className="h-px bg-white/5" />
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">New email</label>
                              <Input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="h-9 border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Current password</label>
                              <Input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="h-9 border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                              />
                            </div>
                            {emailError && <p className="text-xs font-medium" style={{ color: color.red }}>{emailError}</p>}
                            <div className="flex gap-3 pt-1">
                              <Button
                                onClick={handleUpdateEmail}
                                disabled={isUpdatingEmail || !newEmail || !currentPassword}
                                className="flex-1 font-bold text-white"
                                style={{
                                  background: gradient.brand,
                                  borderRadius: radius.button,
                                }}
                              >
                                {isUpdatingEmail ? 'Updating...' : 'Update Email'}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setShowEmailPanel(false);
                                  setNewEmail('');
                                  setCurrentPassword('');
                                  setEmailError(null);
                                }}
                                className="text-white/40 hover:text-white"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="h-px bg-white/5" />

                  {/* Password Row */}
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <label
                          className="text-xs font-semibold uppercase tracking-widest block"
                          style={{ color: color.muted }}
                        >
                          Password
                        </label>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-medium text-white">••••••••••••</p>
                          {passwordSuccess && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                              <Check className="w-3 h-3" /> Updated
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPasswordPanel(!showPasswordPanel)}
                          className={showPasswordPanel ? 'text-white' : 'text-purple-400 hover:text-purple-300'}
                          style={{ fontSize: fontSize.xxs }}
                        >
                          {showPasswordPanel ? 'CANCEL CHANGE' : 'CHANGE PASSWORD'}
                        </Button>
                        <button
                          onClick={handleRequestPasswordReset}
                          disabled={showPasswordConfirm !== 'none'}
                          className="text-[10px] font-bold text-white/30 hover:text-white/60 disabled:opacity-50 transition-colors uppercase tracking-widest"
                        >
                          {showPasswordConfirm === 'sending'
                            ? 'Sending...'
                            : showPasswordConfirm === 'sent'
                              ? 'Reset link sent to email'
                              : 'Forgotten password? Send reset link'}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {showPasswordPanel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden pt-2"
                        >
                          <div className="h-px bg-white/5 mb-4" />
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                                Current Password
                              </label>
                              <Input
                                type="password"
                                value={currentPasswordForNewPass}
                                onChange={(e) => setCurrentPasswordForNewPass(e.target.value)}
                                placeholder="Confirm your current password"
                                className="h-10 border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                                New Password
                              </label>
                              <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                className="h-10 border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                              />
                            </div>

                            {passwordError && <p className="text-xs font-medium" style={{ color: color.red }}>{passwordError}</p>}

                            <Button
                              onClick={handleUpdatePassword}
                              disabled={isUpdatingPassword || !newPassword || !currentPasswordForNewPass}
                              className="w-full h-11 font-bold text-white"
                              style={{
                                background: gradient.brand,
                                borderRadius: radius.button,
                                boxShadow: `0 0 20px ${gradient.brandFrom}44`,
                              }}
                            >
                              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                            </Button>
                            <p className="text-center text-[11px]" style={{ color: color.muted }}>
                              Note: You will be logged out after success.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.section>

              {/* Data & Privacy Section */}
              <motion.section variants={itemVariants} className="space-y-4">
                <h3
                  className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
                  style={{ color: color.muted }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Data & Privacy
                </h3>
                <div className="p-6 rounded-2xl border border-white/8 space-y-4 shadow-sm" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-white">Export My Data</p>
                      <p className="text-xs max-w-[240px]" style={{ color: color.muted }}>
                        Download a machine-readable JSON file containing your profile and trading history (GDPR Art. 20).
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportData}
                      className="border-white/10 text-white/60 hover:text-white hover:border-white/20 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-2" />
                      Download JSON
                    </Button>
                  </div>
                </div>
              </motion.section>

              {/* Danger Zone */}
              <motion.section variants={itemVariants} className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-red-400/60 flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Danger Zone
                </h3>
                <div className="p-5 rounded-xl border border-red-500/10 bg-red-500/5 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-red-200">Delete Account</p>
                      <HelpCircle size={14} className="text-white/20 cursor-help" />
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: color.muted }}>
                      This will permanently remove your data. The process takes 30 days and you can
                      cancel it anytime before then.
                    </p>
                  </div>

                  {!showDeleteConfirm ? (
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full h-10 font-bold tracking-wide rounded-full text-white"
                      style={{ background: color.red }}
                    >
                      Delete account
                    </Button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 pt-4 border-t border-red-500/10"
                    >
                      <p className="text-xs font-medium text-red-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Confirm password to delete
                      </p>
                      <Input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="h-10 border-red-500/20 text-white focus-visible:ring-0 focus-visible:border-red-500/50"
                        style={{ background: 'rgba(213, 69, 92, 0.05)' }}
                        placeholder="Current password"
                      />
                      {deleteError && (
                        <p className="text-xs font-medium" style={{ color: color.red }}>
                          {deleteError}
                        </p>
                      )}
                      <div className="flex gap-3">
                        <Button
                          variant="destructive"
                          onClick={handleRequestDeletion}
                          disabled={isDeleting || !deletePassword}
                          className="flex-1 h-10 font-bold text-white disabled:opacity-40"
                          style={{ background: color.red }}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete Account Now'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteError(null);
                          }}
                          className="text-white/40 hover:text-white"
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
