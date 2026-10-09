/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserPreferences } from '../types';
import { ShieldCheck, Mail, Key, ShieldAlert, Cpu, Calendar, Copy, Check, ShieldAlert as AlertTriangle } from 'lucide-react';

interface UserProfileViewProps {
  preferences: UserPreferences;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  user?: { id: string; email: string; firstLogin?: boolean } | null;
  onUserUpdate?: (updates: { email: string; firstLogin?: boolean }) => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  preferences,
  onUpdatePreferences,
  user,
  onUserUpdate,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const mockToken = preferences.apiKey || '';

  const getSecretHash = (key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).repeat(8).substring(0, 64);
    return `sha256:${hex}`;
  };

  const realSecret = preferences.hmacKey || getSecretHash(mockToken);

  const copyToClipboard = (text: string, isSecret: boolean) => {
    navigator.clipboard.writeText(text);
    if (isSecret) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const [emailInput, setEmailInput] = useState(user?.email || preferences.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setEmailInput(user.email);
    }
  }, [user]);

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (newPassword && newPassword !== confirmPassword) {
      setSaveError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          password: newPassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        if (onUserUpdate) {
          onUserUpdate({ email: emailInput, firstLogin: false });
        }
        onUpdatePreferences({ email: emailInput });
      } else {
        setSaveError(data.error || 'Failed to update credentials.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const generateNewToken = () => {
    const chars = 'abcdef0123456789';
    let newToken = 'vt_live_';
    for (let i = 0; i < 32; i++) {
      newToken += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    onUpdatePreferences({ apiKey: newToken });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          Operator Profile
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
          Root supervisor session parameters, authentication tokens, and API credential keys
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left pane: Profile Card */}
        <div className="custom-card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4 text-center">
            {/* Avatar / Profile Graphic */}
            <div className="w-20 h-20 mx-auto rounded-full bg-[var(--bg-app)] border-2 border-[var(--color-primary)] flex items-center justify-center glow-cyan">
              <span className="font-display text-2xl font-black text-[var(--color-primary)]">R</span>
            </div>

            <div className="space-y-1">
              <h3 className="font-display font-extrabold text-lg text-[var(--text-main)]">
                {user?.email ? `${user.email.split('@')[0].toUpperCase()} OPERATOR` : 'ADMIN OPERATOR'}
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                SYSTEM ACCREDITED
              </span>
            </div>

            <div className="text-left font-mono text-xs space-y-3.5 pt-4 border-t border-[var(--border-card)]/40">
              <div className="flex items-center gap-2 text-[var(--text-main)]">
                <Mail className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span className="truncate">{user?.email || preferences.email}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-main)]">
                <ShieldCheck className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>{user?.id === 'user-admin' ? 'Level 0 Core Admin Privileges' : 'Accredited Operator Privileges'}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-main)]">
                <Calendar className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>Active Node Administrator</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border-card)]/40 font-mono text-[9px] text-[var(--text-muted)] leading-relaxed">
            Authenticated via: <span className="text-[var(--text-main)] font-bold">Secure Session Cookie</span>
            <br />
            Session active: <span className="text-emerald-400 font-bold">● ONLINE</span>
          </div>
        </div>

        {/* Right pane: Core Tokens & Credentials */}
        <div className="md:col-span-2 space-y-6">
          {/* Card 1: API Security Credentials */}
          <div className="custom-card p-5 space-y-5">
            <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
              <Key className="w-4.5 h-4.5 text-[var(--color-secondary)]" />
              <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                API Security Credentials
              </h3>
            </div>

            <div className="space-y-4">
              {/* API Access Token */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    OPERATOR API ACCESS TOKEN
                  </label>
                  <button
                    onClick={generateNewToken}
                    className="text-[10px] font-mono text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    ROLL TOKEN
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-[var(--bg-app)] border border-[var(--border-card)] p-2 rounded">
                  <span className="font-mono text-xs text-zinc-300 select-all truncate flex-1">
                    {mockToken || 'Token Pending Generation...'}
                  </span>
                  <button
                    onClick={() => copyToClipboard(mockToken, false)}
                    className="p-1 hover:text-[var(--color-primary)] text-zinc-500 rounded transition-all shrink-0 cursor-pointer"
                    title="Copy Access Token"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] font-mono leading-relaxed">
                  Use this bearer token to synchronize CLI daemons or other remote servers to the VitalMesh switch.
                </p>
              </div>

              {/* SHA Secret Node Signing Key */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase block">
                  NODE SIGNING HMAC SECRET KEY
                </label>
                <div className="flex items-center gap-2 bg-[var(--bg-app)] border border-[var(--border-card)] p-2 rounded">
                  <span className="font-mono text-xs text-zinc-500 select-all truncate flex-1">
                    {realSecret}
                  </span>
                  <button
                    onClick={() => copyToClipboard(realSecret, true)}
                    className="p-1 hover:text-[var(--color-primary)] text-zinc-500 rounded transition-all shrink-0 cursor-pointer"
                    title="Copy Signing Key"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] font-mono leading-relaxed">
                  Hardware node symmetric signing secret. Keep this private to prevent rogue node registrations on the mesh.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Account Security Settings */}
          <div className="custom-card p-5 space-y-5">
            <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
              <ShieldAlert className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Account Security Settings
              </h3>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4">
              {saveSuccess && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono rounded">
                  ✓ Operator credentials successfully updated and synced.
                </div>
              )}
              {saveError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono rounded">
                  ✗ Error: {saveError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Operator Email Address</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">New Password (Optional)</label>
                  <input
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'SAVING CONFIGURATION...' : 'UPDATE CREDENTIALS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
