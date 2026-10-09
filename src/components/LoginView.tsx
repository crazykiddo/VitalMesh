/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldAlert, Key, Mail, Cpu, HelpCircle } from 'lucide-react';
import { Logo } from './Logo';

interface LoginViewProps {
  onLoginSuccess: (user: { id: string; email: string; firstLogin?: boolean }) => void;
  theme: string;
  mode: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, theme, mode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all authorization fields.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Access authorization rejected.');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Network link failure. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-300 font-mono px-4 relative overflow-hidden">
      {/* Background Graphic Accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary)]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-secondary)]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md custom-card p-6 md:p-8 space-y-6 relative border border-[var(--border-card)] shadow-2xl bg-[var(--bg-card)]/90 backdrop-blur-md">
        
        {/* Header and Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo glowing={theme === 'cyber-vitality' && mode === 'dark'} size={40} textSize="text-2xl" />
          </div>
          
          <div className="space-y-1">
            <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold">
              SYSACC // AUTHENTICATION REQUIRED
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Establish secure administrator telemetry session link.
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="p-2.5 bg-[var(--bg-app)] border border-[var(--border-card)]/40 rounded flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-[var(--text-muted)] uppercase tracking-wider">GATEWAY SECURITY</span>
          </div>
          <span className="text-amber-400 font-bold uppercase">RESTRICTED ZONE</span>
        </div>

        {/* Error Notification Alert */}
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg flex gap-3 text-xs text-rose-400 animate-shake">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block uppercase text-[10px]">SECURITY ALERT</span>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Authorization Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block tracking-wider">
              OPERATOR EMAIL
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@vitalmesh.io"
                className="w-full pl-10 pr-4 py-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] transition-colors focus:ring-1 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block tracking-wider">
              ACCESS PASSCODE
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] transition-colors focus:ring-1 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 mt-2 bg-[var(--color-primary)] text-black rounded text-xs font-bold hover:opacity-90 hover:shadow-lg transition-all flex items-center justify-center gap-2 ${
              loading ? 'opacity-60 cursor-not-allowed' : 'glow-cyan'
            }`}
          >
            <Cpu className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'AUTHORIZING SESSION...' : 'ESTABLISH SECURE LINK'}
          </button>
        </form>

        {/* Credentials Tip */}
        <div className="pt-4 border-t border-[var(--border-card)]/40 text-[10px] font-mono text-[var(--text-muted)] leading-relaxed space-y-1.5 bg-[var(--bg-app)]/30 p-3 rounded">
          <div className="flex items-center gap-1.5 text-[var(--text-main)] font-semibold uppercase tracking-wider text-[9px]">
            <HelpCircle className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
            <span>SECURITY ACCREDITATION</span>
          </div>
          <div>
            Please authenticate using your system supervisor administrator account. To reset or configure credentials, modify the authentication parameters in your deployment configuration.
          </div>
        </div>
      </div>
    </div>
  );
};
