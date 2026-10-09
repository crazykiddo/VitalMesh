/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserPreferences, ThemeType, ModeType, LayoutType } from '../types';
import { Settings, Moon, Sun, Monitor, Bell, RotateCcw, ShieldAlert, Cpu, Download, Upload, Mail, Clock, Timer } from 'lucide-react';


interface SettingsViewProps {
  preferences: UserPreferences;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  onResetPreferences: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  preferences,
  onUpdatePreferences,
  onResetPreferences,
}) => {
  const [localEnvName, setLocalEnvName] = useState(preferences.envName || '');
  const [isFocused, setIsFocused] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [localThreshold, setLocalThreshold] = useState(preferences.alertStorageThreshold ?? 80);
  const [localSmtpHost, setLocalSmtpHost] = useState(preferences.smtpHost || '');
  const [localSmtpPort, setLocalSmtpPort] = useState((preferences.smtpPort ?? 587).toString());
  const [localSmtpUser, setLocalSmtpUser] = useState(preferences.smtpUser || '');
  const [localSmtpPass, setLocalSmtpPass] = useState(preferences.smtpPass || '');
  const [localSmtpFrom, setLocalSmtpFrom] = useState(preferences.smtpFrom || '');

  const [localDaemonPollInterval, setLocalDaemonPollInterval] = useState((preferences.daemonPollInterval ?? 5).toString());
  const [localDomainCheckInterval, setLocalDomainCheckInterval] = useState((preferences.domainCheckInterval ?? 30).toString());
  const [localHttpPingTimeout, setLocalHttpPingTimeout] = useState((preferences.httpPingTimeout ?? 5000).toString());
  const [localSshCommandTimeout, setLocalSshCommandTimeout] = useState((preferences.sshCommandTimeout ?? 10000).toString());
  const [localDomainLookupTimeout, setLocalDomainLookupTimeout] = useState((preferences.domainLookupTimeout ?? 10000).toString());
  const [localSmtpTimeout, setLocalSmtpTimeout] = useState((preferences.smtpTimeout ?? 5000).toString());

  useEffect(() => {
    setLocalThreshold(preferences.alertStorageThreshold ?? 80);
  }, [preferences.alertStorageThreshold]);

  useEffect(() => {
    setLocalSmtpHost(preferences.smtpHost || '');
    setLocalSmtpPort((preferences.smtpPort ?? 587).toString());
    setLocalSmtpUser(preferences.smtpUser || '');
    setLocalSmtpPass(preferences.smtpPass || '');
    setLocalSmtpFrom(preferences.smtpFrom || '');
  }, [preferences.smtpHost, preferences.smtpPort, preferences.smtpUser, preferences.smtpPass, preferences.smtpFrom]);

  useEffect(() => {
    setLocalDaemonPollInterval((preferences.daemonPollInterval ?? 5).toString());
    setLocalDomainCheckInterval((preferences.domainCheckInterval ?? 30).toString());
    setLocalHttpPingTimeout((preferences.httpPingTimeout ?? 5000).toString());
    setLocalSshCommandTimeout((preferences.sshCommandTimeout ?? 10000).toString());
    setLocalDomainLookupTimeout((preferences.domainLookupTimeout ?? 10000).toString());
    setLocalSmtpTimeout((preferences.smtpTimeout ?? 5000).toString());
  }, [
    preferences.daemonPollInterval,
    preferences.domainCheckInterval,
    preferences.httpPingTimeout,
    preferences.sshCommandTimeout,
    preferences.domainLookupTimeout,
    preferences.smtpTimeout,
  ]);

  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);

    try {
      const res = await fetch('/api/preferences/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: localSmtpHost,
          smtpPort: parseInt(localSmtpPort) || 587,
          smtpUser: localSmtpUser,
          smtpPass: localSmtpPass,
          smtpFrom: localSmtpFrom,
          email: preferences.email
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpTestResult({
          success: true,
          message: `SUCCESS: Mail handshook and test alert dispatched to: ${preferences.email}`
        });
      } else {
        let errStr = `FAILED: ${data.error || 'Connection/Auth failure'}`;
        if (data.code) errStr += `\nCode: ${data.code}`;
        if (data.syscall) errStr += `\nSyscall: ${data.syscall}`;
        if (data.address) errStr += `\nAddress: ${data.address}`;
        if (data.port) errStr += `\nPort: ${data.port}`;
        if (data.command) errStr += `\nCommand: ${data.command}`;
        if (data.response) errStr += `\nResponse: ${data.response}`;
        if (data.stack) errStr += `\n\nStack Trace:\n${data.stack}`;
        setSmtpTestResult({
          success: false,
          message: errStr
        });
      }
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: `NETWORK ERROR: ${err.message || err}`
      });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/backup/json/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json)
        });

        if (res.ok) {
          alert('System configuration successfully imported! Reloading VitalMesh console...');
          window.location.reload();
        } else {
          const data = await res.json();
          setImportError(data.error || 'Import failed');
        }
      } catch (err: any) {
        setImportError(err.message || 'Invalid JSON format');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!isFocused) {
      setLocalEnvName(preferences.envName || '');
    }
  }, [preferences.envName, isFocused]);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          System Configuration
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
          Custom operator preferences, visual design styles, and telemetry synchronization configurations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Visual Settings (Mode & Theme) */}
        <div className="custom-card p-5 space-y-6">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              Visual Environment Styles
            </h3>
          </div>

          {/* Dark / Light mode toggle */}
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
              {preferences.mode === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              ENVIRONMENT LIGHTING (THEME MODE)
            </label>
            <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
              Toggle lighting modes between high-contrast dark space and eye-safe soft light sheets.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => onUpdatePreferences({ mode: 'dark' })}
                className={`py-2 rounded font-mono text-xs font-bold border transition-all ${
                  preferences.mode === 'dark'
                    ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] glow-cyan'
                    : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-card)] hover:text-[var(--text-main)]'
                }`}
              >
                DARK MODE
              </button>
              <button
                onClick={() => onUpdatePreferences({ mode: 'light' })}
                className={`py-2 rounded font-mono text-xs font-bold border transition-all ${
                  preferences.mode === 'light'
                    ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] glow-cyan'
                    : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-card)] hover:text-[var(--text-main)]'
                }`}
              >
                LIGHT MODE
              </button>
            </div>
          </div>

          {/* Design Themes Selection */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" />
              GRAPHIC STYLE SCHEMES
            </label>
            <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
              Select visual parameters, border layouts, shadows, and fonts matching your operations.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => onUpdatePreferences({ theme: 'cyber-vitality' })}
                className={`p-3 rounded text-left border transition-all ${
                  preferences.theme === 'cyber-vitality'
                    ? 'border-[var(--color-primary)] bg-[var(--bg-card-hover)]'
                    : 'border-[var(--border-card)] bg-[var(--bg-app)]'
                }`}
              >
                <span className="font-mono text-xs font-bold text-[var(--text-main)] block">Cyber-Vitality</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block mt-1">Neon glows, high data density, Sora typography, 8px borders</span>
              </button>
              <button
                onClick={() => onUpdatePreferences({ theme: 'bauhaus' })}
                className={`p-3 rounded text-left border transition-all ${
                  preferences.theme === 'bauhaus'
                    ? 'border-[var(--color-secondary)] bg-[var(--bg-card-hover)]'
                    : 'border-[var(--border-card)] bg-[var(--bg-app)]'
                }`}
              >
                <span className="font-mono text-xs font-bold text-[var(--text-main)] block">Bauhaus Neo-Brutalist</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block mt-1">Flat colors, solid thick 2px borders, Inter headlines, sharp edges</span>
              </button>
            </div>
          </div>
        </div>

        {/* Layout & Telemetry Settings */}
        <div className="custom-card p-5 space-y-6">
          <div className="space-y-6">
            <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
              <Cpu className="w-4.5 h-4.5 text-[var(--color-secondary)]" />
              <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Telemetry & Grid Controls
              </h3>
            </div>

            {/* Layout Spacers */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                GRID COMPONENT DENSITY
              </label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(['dense', 'comfortable', 'bento'] as LayoutType[]).map(lay => (
                  <button
                    key={lay}
                    onClick={() => onUpdatePreferences({ layout: lay })}
                    className={`py-1.5 rounded font-mono text-xs uppercase border transition-all ${
                      preferences.layout === lay
                        ? 'bg-[var(--color-secondary)] text-black border-[var(--color-secondary)] font-bold'
                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-card)]'
                    }`}
                  >
                    {lay}
                  </button>
                ))}
              </div>
            </div>

            {/* Telemetry Refresh Sync Rate */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase block">
                TELEMETRY REFRESH SYNC RATIO
              </label>
              <select
                value={preferences.refreshRate}
                onChange={(e) => onUpdatePreferences({ refreshRate: parseInt(e.target.value) })}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none"
              >
                <option value="1">1 Second (Intense Telemetry - Debugging)</option>
                <option value="2">2 Seconds (High Resolution Sync)</option>
                <option value="5">5 Seconds (Balanced Homelab Standard)</option>
                <option value="10">10 Seconds (Power-Saving / Low CPU Load)</option>
              </select>
            </div>

            {/* Dashboard Operating Environment Name */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase block">
                Dashboard Operating Environment Name
              </label>
              <input
                type="text"
                value={localEnvName}
                onChange={(e) => setLocalEnvName(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false);
                  onUpdatePreferences({ envName: localEnvName });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onUpdatePreferences({ envName: localEnvName });
                  }
                }}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. Production Homelab"
              />
            </div>

            {/* Notification triggers toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-card)]/30">
              <div className="space-y-0.5">
                <span className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" />
                  AUDIO-VISUAL NOTIFICATION TRIGGERS
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">Toggle push alerts on critical node shutdowns or thermal failures</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.enableNotifications}
                onChange={(e) => onUpdatePreferences({ enableNotifications: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded focus:ring-1 cursor-pointer"
              />
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={onResetPreferences}
            className="w-full mt-6 py-2 bg-transparent border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 rounded text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET PREFERENCES SYSTEM TO DEFAULT
          </button>
        </div>

        {/* Alert Notification Rules Card */}
        <div className="custom-card p-5 space-y-6">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
            <Bell className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              Alert Trigger Rules
            </h3>
          </div>

          <div className="space-y-4">
            {/* Dispatch Channels */}
            <div className="space-y-2.5">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Dispatch Channels</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={preferences.alertNotifyEnabled ?? true}
                    onChange={(e) => onUpdatePreferences({ alertNotifyEnabled: e.target.checked })}
                    className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
                  />
                  Dashboard Logs
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={preferences.alertEmailEnabled ?? false}
                    onChange={(e) => onUpdatePreferences({ alertEmailEnabled: e.target.checked })}
                    className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
                  />
                  SMTP Email Alerts
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={preferences.debugMode ?? false}
                    onChange={(e) => onUpdatePreferences({ debugMode: e.target.checked })}
                    className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
                  />
                  Debug Mode
                </label>
              </div>
            </div>

            {/* Trigger Rules checkboxes */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-card)]/30">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Trigger Conditions</label>

              <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={preferences.alertUptimeDown ?? true}
                  onChange={(e) => onUpdatePreferences({ alertUptimeDown: e.target.checked })}
                  className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded mt-0.5"
                />
                <div className="space-y-0.5">
                  <span className="block font-bold">External service goes offline</span>
                  <span className="text-[10px] text-[var(--text-muted)] block">Trigger when HTTP/HEAD check fails or returns server errors</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-2">
                <input
                  type="checkbox"
                  checked={preferences.alertSslExpire ?? true}
                  onChange={(e) => onUpdatePreferences({ alertSslExpire: e.target.checked })}
                  className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded mt-0.5"
                />
                <div className="space-y-0.5">
                  <span className="block font-bold">Domain SSL Certificate expiring</span>
                  <span className="text-[10px] text-[var(--text-muted)] block">Trigger when certificate has expired or has less than 30 days left</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-2">
                <input
                  type="checkbox"
                  checked={preferences.alertContainerDown ?? true}
                  onChange={(e) => onUpdatePreferences({ alertContainerDown: e.target.checked })}
                  className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded mt-0.5"
                />
                <div className="space-y-0.5">
                  <span className="block font-bold">Container status offline / stopped</span>
                  <span className="text-[10px] text-[var(--text-muted)] block">Trigger when Docker container transitions to stopped or exited state</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-2">
                <input
                  type="checkbox"
                  checked={preferences.alertContainerOverloaded ?? true}
                  onChange={(e) => onUpdatePreferences({ alertContainerOverloaded: e.target.checked })}
                  className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded mt-0.5"
                />
                <div className="space-y-0.5">
                  <span className="block font-bold">Container overloaded (CPU/RAM)</span>
                  <span className="text-[10px] text-[var(--text-muted)] block">Trigger when container CPU load or Memory limit usage exceeds 90%</span>
                </div>
              </label>

              <div className="space-y-1.5 border-t border-[var(--border-card)]/10 pt-3">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[var(--text-muted)]">STORAGE EXCEED THRESHOLD</span>
                  <span className="font-bold text-[var(--text-main)]">{localThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={localThreshold}
                  onChange={(e) => setLocalThreshold(parseInt(e.target.value))}
                  onMouseUp={() => onUpdatePreferences({ alertStorageThreshold: localThreshold })}
                  onTouchEnd={() => onUpdatePreferences({ alertStorageThreshold: localThreshold })}
                  className="w-full h-1 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">Trigger warning alert when ZFS array or local drive pool usage reaches this limit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Enable / Disable Feature Controls Card */}
        <div className="custom-card p-5 space-y-6">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
            <Cpu className="w-4.5 h-4.5 text-[var(--color-secondary)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              Module Feature Toggles
            </h3>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
            Disable core components to hide them from the sidebar menus, dashboard layouts, and bypass daemon monitoring checks.
          </p>

          <div className="space-y-3.5">
            <label className="flex items-start justify-between cursor-pointer font-mono text-xs text-[var(--text-main)]">
              <div className="space-y-0.5">
                <span className="block font-bold">Mesh Map & Nodes</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Toggle VPS and local nodes visualization</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.moduleMesh ?? true}
                onChange={(e) => onUpdatePreferences({ moduleMesh: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
              />
            </label>

            <label className="flex items-start justify-between cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-3">
              <div className="space-y-0.5">
                <span className="block font-bold">Docker Containers</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Toggle local/remote container stats and controls</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.moduleContainers ?? true}
                onChange={(e) => onUpdatePreferences({ moduleContainers: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
              />
            </label>

            <label className="flex items-start justify-between cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-3">
              <div className="space-y-0.5">
                <span className="block font-bold">Storage Pools</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Toggle ZFS arrays and local hard drive tracking</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.moduleStorage ?? true}
                onChange={(e) => onUpdatePreferences({ moduleStorage: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
              />
            </label>

            <label className="flex items-start justify-between cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-3">
              <div className="space-y-0.5">
                <span className="block font-bold">External Services Uptime</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Toggle custom HTTP website head check monitor</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.moduleUptime ?? true}
                onChange={(e) => onUpdatePreferences({ moduleUptime: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
              />
            </label>

            <label className="flex items-start justify-between cursor-pointer font-mono text-xs text-[var(--text-main)] border-t border-[var(--border-card)]/10 pt-3">
              <div className="space-y-0.5">
                <span className="block font-bold">Domains & DNS Telemetry</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Toggle remote domains certificate expiry checking</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.moduleDomains ?? true}
                onChange={(e) => onUpdatePreferences({ moduleDomains: e.target.checked })}
                className="w-4 h-4 text-[var(--color-primary)] bg-[var(--bg-app)] border-[var(--border-card)] rounded"
              />
            </label>
          </div>
        </div>

        {/* SMTP Email Alert Dispatcher Card */}
        <div className="custom-card p-5 space-y-5 md:col-span-2">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
            <Mail className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              SMTP Alert Dispatcher Settings
            </h3>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
            Configure the outbound SMTP mail server settings to dispatch system telemetry alerts directly to your target email inbox.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SMTP Host Server</label>
              <input
                type="text"
                value={localSmtpHost}
                onChange={e => setLocalSmtpHost(e.target.value)}
                onBlur={() => onUpdatePreferences({ smtpHost: localSmtpHost })}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. smtp.gmail.com"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SMTP Username</label>
                <input
                  type="text"
                  value={localSmtpUser}
                  onChange={e => setLocalSmtpUser(e.target.value)}
                  onBlur={() => onUpdatePreferences({ smtpUser: localSmtpUser })}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  placeholder="e.g. user@gmail.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Port</label>
                <input
                  type="number"
                  value={localSmtpPort}
                  onChange={e => setLocalSmtpPort(e.target.value)}
                  onBlur={() => onUpdatePreferences({ smtpPort: parseInt(localSmtpPort) || 587 })}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  placeholder="587"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SMTP Password</label>
              <input
                type="password"
                value={localSmtpPass}
                onChange={e => setLocalSmtpPass(e.target.value)}
                onBlur={() => onUpdatePreferences({ smtpPass: localSmtpPass })}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="SMTP Password / Auth Secret"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">From Address</label>
              <input
                type="text"
                value={localSmtpFrom}
                onChange={e => setLocalSmtpFrom(e.target.value)}
                onBlur={() => onUpdatePreferences({ smtpFrom: localSmtpFrom })}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. alerts@vitalmesh.io"
              />
            </div>
          </div>

          <div className="border-t border-[var(--border-card)]/30 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                Target recipient destination: <strong className="text-[var(--text-main)]">{preferences.email}</strong>
              </span>
              <span className="text-[9px] text-[var(--text-muted)] font-mono block">
                Verify credentials configuration validity before saving settings.
              </span>
            </div>
            <button
              type="button"
              disabled={smtpTesting}
              onClick={handleTestSmtp}
              className="px-3.5 py-1.5 bg-black border border-[var(--color-secondary)]/50 hover:bg-[var(--color-secondary)]/10 text-[var(--color-secondary)] rounded text-[10px] font-mono font-bold transition-all disabled:opacity-50 cursor-pointer self-start sm:self-center"
            >
              {smtpTesting ? 'DISPATCHING TEST...' : 'SEND TEST EMAIL'}
            </button>
          </div>

          {smtpTestResult && (
            <div className={`p-3 rounded border font-mono text-[10px] mt-3 ${
              smtpTestResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              <div className="font-bold mb-1 uppercase">
                {smtpTestResult.success ? '✓ TEST OK' : '✗ TEST ERROR'}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">
                {smtpTestResult.message}
              </div>
            </div>
          )}
        </div>

        {/* Service Intervals & Connection Timeouts Card */}
        <div className="custom-card p-5 space-y-5 md:col-span-2">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Service Intervals & Connection Timeouts
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Background Polling & Socket Limits
            </span>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
            Configure update intervals, daemon polling rates, and request timeout limits across all background telemetries and service handlers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Section 1: Background & Foreground Update Intervals */}
            <div className="space-y-4 border-r-0 md:border-r border-[var(--border-card)]/40 md:pr-5">
              <div className="text-[10px] font-mono text-[var(--color-primary)] font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-[var(--border-card)]/30 pb-1">
                <Clock className="w-3.5 h-3.5" />
                Background & Service Update Intervals
              </div>

              {/* Daemon Telemetry Poll Interval */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    Daemon Telemetry Poll Interval (Seconds)
                  </label>
                  <span className="text-[10px] font-mono text-[var(--color-primary)] font-bold">
                    {localDaemonPollInterval}s
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Frequency at which the background daemon queries local host metrics, containers, and disks (Default: 5s)
                </span>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={localDaemonPollInterval}
                  onChange={(e) => setLocalDaemonPollInterval(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localDaemonPollInterval) || 5;
                    onUpdatePreferences({ daemonPollInterval: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              {/* Domain DNS & SSL Check Interval */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    Domain SSL & DNS Sync Interval (Minutes)
                  </label>
                  <span className="text-[10px] font-mono text-[var(--color-secondary)] font-bold">
                    {localDomainCheckInterval}m
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Frequency of background TLS certificate expiration and DNS record checks for monitored domains (Default: 30m)
                </span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={localDomainCheckInterval}
                  onChange={(e) => setLocalDomainCheckInterval(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localDomainCheckInterval) || 30;
                    onUpdatePreferences({ domainCheckInterval: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </div>

            {/* Section 2: Service Request & Connection Timeouts */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono text-[var(--color-secondary)] font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-[var(--border-card)]/30 pb-1">
                <Timer className="w-3.5 h-3.5" />
                Service Connection & Execution Timeouts
              </div>

              {/* HTTP Uptime Ping Timeout */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    HTTP Uptime Monitor Ping Timeout (ms)
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    {localHttpPingTimeout}ms
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Abort threshold for HTTP/API uptime probes before declaring service unreachable (Default: 5000ms)
                </span>
                <input
                  type="number"
                  min="500"
                  max="60000"
                  step="500"
                  value={localHttpPingTimeout}
                  onChange={(e) => setLocalHttpPingTimeout(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localHttpPingTimeout) || 5000;
                    onUpdatePreferences({ httpPingTimeout: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              {/* SSH Remote Node Command Timeout */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    SSH Remote Node Command Timeout (ms)
                  </label>
                  <span className="text-[10px] font-mono text-blue-400 font-bold">
                    {localSshCommandTimeout}ms
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Ready & handshake timeout limit when connecting to remote VPS hosts or NAS pools via SSH (Default: 10000ms)
                </span>
                <input
                  type="number"
                  min="1000"
                  max="120000"
                  step="1000"
                  value={localSshCommandTimeout}
                  onChange={(e) => setLocalSshCommandTimeout(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localSshCommandTimeout) || 10000;
                    onUpdatePreferences({ sshCommandTimeout: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              {/* Domain DNS/SSL Lookup Timeout */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    Domain Lookup & TLS Socket Timeout (ms)
                  </label>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    {localDomainLookupTimeout}ms
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Socket connect & TLS certificate inspection timeout for monitored domains (Default: 10000ms)
                </span>
                <input
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  value={localDomainLookupTimeout}
                  onChange={(e) => setLocalDomainLookupTimeout(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localDomainLookupTimeout) || 10000;
                    onUpdatePreferences({ domainLookupTimeout: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              {/* SMTP Mail Server Timeout */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-[var(--text-main)] uppercase">
                    SMTP Mail Server Dispatch Timeout (ms)
                  </label>
                  <span className="text-[10px] font-mono text-purple-400 font-bold">
                    {localSmtpTimeout}ms
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                  Connection and greeting socket timeout for outbound email alert dispatches (Default: 5000ms)
                </span>
                <input
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  value={localSmtpTimeout}
                  onChange={(e) => setLocalSmtpTimeout(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(localSmtpTimeout) || 5000;
                    onUpdatePreferences({ smtpTimeout: val });
                  }}
                  className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Backup & Disaster Recovery Card */}
        <div className="custom-card p-5 space-y-5 md:col-span-2">
          <div className="border-b border-[var(--border-card)] pb-3 flex items-center gap-2">
            <Download className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              Backup & Disaster Recovery
            </h3>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono leading-relaxed">
            Create full-system portable snapshots or import configurations to restore your telemetry node mappings.
          </p>

          <div className="space-y-4">
            {/* ZIP Backup */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <span className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  GENERATE SYSTEM BACKUP (.ZIP)
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono block">Download database configuration files and system telemetry logs packaged into a ZIP archive</span>
              </div>
              <a
                href="/api/backup"
                onClick={() => {
                  setTimeout(async () => {
                    try {
                      const res = await fetch('/api/preferences');
                      const data = await res.json();
                      if (data && onUpdatePreferences) onUpdatePreferences(data);
                    } catch (e) {}
                  }, 800);
                }}
                className="px-3 py-1.5 bg-[var(--color-primary)] text-black rounded text-[10px] font-mono font-bold hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer select-none"
              >
                <Download className="w-3 h-3" />
                DOWNLOAD (.ZIP)
              </a>
            </div>

            {/* JSON Export/Import Backup */}
            <div className="pt-4 border-t border-[var(--border-card)]/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    EXPORT DATA BACKUP (.JSON)
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono block">Download database state tables (nodes, containers, disks, domains) as a single JSON file</span>
                </div>
                <a
                  href="/api/backup/json/export"
                  onClick={() => {
                    setTimeout(async () => {
                      try {
                        const res = await fetch('/api/preferences');
                        const data = await res.json();
                        if (data && onUpdatePreferences) onUpdatePreferences(data);
                      } catch (e) {}
                    }, 800);
                  }}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-black rounded text-[10px] font-mono font-bold hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer select-none"
                >
                  <Download className="w-3 h-3" />
                  EXPORT (.JSON)
                </a>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono font-bold text-[var(--text-main)] uppercase flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
                    IMPORT DATA BACKUP (.JSON)
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono block">Restore database tables from a previously exported JSON backup file</span>
                </div>
                <label
                  className="px-3 py-1.5 bg-[var(--color-secondary)] text-black rounded text-[10px] font-mono font-bold hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer select-none"
                >
                  <Upload className="w-3 h-3" />
                  {importing ? 'IMPORTING...' : 'IMPORT (.JSON)'}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleJsonImport}
                    disabled={importing}
                    className="hidden"
                  />
                </label>
              </div>

              {importError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono rounded">
                  ✗ Import Error: {importError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
