/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SystemLog, AlertNotification } from '../types';
import { Layers, Search, ShieldAlert, Download, RefreshCw, Trash2, CheckCircle } from 'lucide-react';

interface AlertsViewProps {
  logs: SystemLog[];
  alerts: AlertNotification[];
  onMarkAlertRead: (id: string) => void;
  onClearAllAlerts: () => void;
  onClearLogs: () => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  logs,
  alerts,
  onMarkAlertRead,
  onClearAllAlerts,
  onClearLogs,
}) => {
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERR' | 'AUTH'>('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = logFilter === 'ALL' ? true : log.level === logFilter;
    const matchesSearch = (log.message ?? '').toLowerCase().includes(logSearch.toLowerCase()) ||
                          (log.source ?? '').toLowerCase().includes(logSearch.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const unreadAlerts = alerts.filter(a => !a.read);

  const triggerLogDownload = () => {
    setIsDownloading(true);
    setTimeout(() => {
      setIsDownloading(false);
      // Create a virtual text file with logs content
      const logsTxt = logs.map(l => `[${l.timestamp}] [${l.level}] [${l.source}]: ${l.message}`).join('\n');
      const blob = new Blob([logsTxt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vitalmesh-syslogs-${new Date().toISOString().split('T')[0]}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  return (
    <div className="space-y-6 flex flex-col min-h-[calc(100vh-100px)]">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          Alerts & System Logs
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
          Unified operator syslog collector and active hardware trigger alerts
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-stretch">
        {/* Left pane: Active Hardware Alerts */}
        <div className="custom-card p-5 flex flex-col justify-between h-full space-y-4">
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="border-b border-[var(--border-card)] pb-3 flex justify-between items-center">
              <span className="font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                ACTIVE SYSTEM ALERTS ({unreadAlerts.length})
              </span>
              {unreadAlerts.length > 0 && (
                <button
                  onClick={onClearAllAlerts}
                  className="text-[10px] font-mono text-rose-400 hover:text-rose-300 font-bold uppercase flex items-center gap-1 cursor-pointer select-none"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-260px)] min-h-[350px] custom-scrollbar">
              {unreadAlerts.length === 0 ? (
                <div className="p-8 h-full text-center border border-dashed border-[var(--border-card)]/50 rounded font-mono text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  No active warnings. System running optimally.
                </div>
              ) : (
                unreadAlerts.map(alert => {
                  let cardClass = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
                  if (alert.level === 'warning') cardClass = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                  if (alert.level === 'error') cardClass = 'bg-rose-500/10 border-rose-500/20 text-rose-400';

                  return (
                    <div key={alert.id} className={`p-3 rounded border font-mono text-xs ${cardClass} flex justify-between gap-2`}>
                      <div className="space-y-1 pr-1">
                        <span className="font-bold text-[var(--text-main)] block">{alert.title}</span>
                        <p className="text-[var(--text-muted)] leading-relaxed">{alert.message}</p>
                        <span className="text-[9px] opacity-75">{alert.timestamp}</span>
                      </div>

                      {!alert.read && (
                        <button
                          onClick={() => onMarkAlertRead(alert.id)}
                          className="px-2 py-1 bg-black/40 text-[var(--text-main)] text-[9px] hover:bg-black/60 rounded border border-white/10 self-start uppercase font-bold shrink-0 animate-pulse"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right pane: System Logs Streamer */}
        <div className="lg:col-span-2 custom-card p-5 flex flex-col justify-between h-full">
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border-card)] pb-3">
              <span className="font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--color-primary)]" />
                SYSTEM LOGGER CONSOLE
              </span>

              {/* Action buttons */}
              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  onClick={triggerLogDownload}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-card)] text-[10px] font-mono text-[var(--text-main)] hover:border-[var(--color-primary)] disabled:opacity-50"
                >
                  {isDownloading ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  EXPORT LOGS
                </button>
                <button
                  onClick={onClearLogs}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-app)] border border-rose-500/20 text-rose-400 text-[10px] font-mono hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                  RESET STREAM
                </button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Log Level select */}
              <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                {(['ALL', 'INFO', 'WARN', 'ERR', 'AUTH'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setLogFilter(lvl)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold border uppercase ${
                      logFilter === lvl
                        ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]'
                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-card)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              {/* Log Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1.8 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter logs by message details..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-[var(--bg-app)] text-[11px] font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none"
                />
              </div>
            </div>

            {/* Log List */}
            <div className="bg-black/95 text-zinc-300 rounded p-3 font-mono text-[11px] leading-relaxed border border-zinc-900 flex-1 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[420px] space-y-1.5 custom-scrollbar">
              {filteredLogs.length === 0 ? (
                <div className="text-center text-zinc-600 italic py-12 h-full flex items-center justify-center">
                  No system logs found matching the filter credentials.
                </div>
              ) : (
                filteredLogs.map(log => {
                  let logLvlClass = 'text-cyan-400';
                  if (log.level === 'WARN') logLvlClass = 'text-amber-400 font-bold';
                  if (log.level === 'ERR') logLvlClass = 'text-rose-400 font-bold';
                  if (log.level === 'AUTH') logLvlClass = 'text-indigo-400 font-bold';

                  return (
                    <div key={log.id} className="flex items-start gap-1.5 border-b border-zinc-900/40 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-zinc-600 select-none shrink-0">{log.timestamp}</span>
                      <span className={`shrink-0 w-11 text-[10px] font-bold ${logLvlClass}`}>
                        [{log.level}]
                      </span>
                      <span className="text-zinc-500 shrink-0 select-none">[{log.source}]:</span>
                      <span className="text-zinc-200 break-all">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-2 text-[10px] font-mono text-[var(--text-muted)] flex justify-between items-center">
            <span>Buffer load: {filteredLogs.length} events matching query</span>
            <span>Host: VitalMesh-Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
};
