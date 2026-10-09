/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DomainModel } from '../types';
import { Globe, RefreshCw, Plus, Edit2, Trash2, Calendar, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface DomainViewProps {
  domains: DomainModel[];
  onAddDomain: (domainName: string) => void;
  onEditDomain: (id: string, domainName: string) => void;
  onRemoveDomain: (id: string) => void;
  onCheckDomain: (id: string) => void;
}

export const DomainView: React.FC<DomainViewProps> = ({
  domains,
  onAddDomain,
  onEditDomain,
  onRemoveDomain,
  onCheckDomain,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [editingDomain, setEditingDomain] = useState<DomainModel | null>(null);
  const [editDomainName, setEditDomainName] = useState('');
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [checkingIds, setCheckingIds] = useState<Record<string, boolean>>({});

  // Summary Metrics
  const totalDomains = domains.length;
  const validSsl = domains.filter(d => d.sslStatus === 'valid').length;
  const warningSsl = domains.filter(d => d.sslStatus === 'warning').length;
  const expiredSsl = domains.filter(d => d.sslStatus === 'expired').length;
  const unknownSsl = domains.filter(d => d.sslStatus === 'unknown' || !d.sslStatus).length;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;
    onAddDomain(newDomainName.trim());
    setNewDomainName('');
    setShowAddForm(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDomain || !editDomainName.trim()) return;
    onEditDomain(editingDomain.id, editDomainName.trim());
    setEditingDomain(null);
    setEditDomainName('');
  };

  const triggerLiveCheck = async (id: string) => {
    setCheckingIds(prev => ({ ...prev, [id]: true }));
    try {
      await onCheckDomain(id);
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getDaysRemaining = (dateStr: string) => {
    if (!dateStr) return null;
    try {
      const diff = new Date(dateStr).getTime() - Date.now();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-card)]/40 pb-4">
        <div>
          <h2 className="font-display font-black text-xl uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
            <Globe className="w-5 h-5 text-[var(--color-primary)] glow-cyan-svg" />
            Domain & SSL Telemetry
          </h2>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
            Check live remote DNS zone configuration, MX mail routing exchanges, and SSL certificate expiration status.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingDomain(null);
            setShowAddForm(!showAddForm);
          }}
          className="px-3 py-1.5 bg-[var(--color-primary)] text-black font-mono text-xs font-bold rounded flex items-center gap-1.5 hover:opacity-90 transition-all cursor-pointer shadow-lg shadow-cyan-500/10"
        >
          <Plus className="w-3.5 h-3.5" />
          ADD DOMAIN MONITOR
        </button>
      </div>

      {/* 2. Add / Edit Form Drawer */}
      {(showAddForm || editingDomain) && (
        <div className="custom-card p-4 border-[var(--color-primary)] animate-fade-in">
          <h3 className="text-xs font-mono font-bold text-[var(--text-main)] uppercase border-b border-[var(--border-card)]/40 pb-2 mb-3">
            {editingDomain ? 'EDIT DOMAIN MONITOR CONFIGURATION' : 'REGISTER NEW DOMAIN TO MONITOR'}
          </h3>
          <form onSubmit={editingDomain ? handleEditSubmit : handleAddSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Domain Name / Host FQDN</label>
              <input
                type="text"
                required
                placeholder="e.g. mysite.mydomain.com"
                value={editingDomain ? editDomainName : newDomainName}
                onChange={e => editingDomain ? setEditDomainName(e.target.value) : setNewDomainName(e.target.value)}
                className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--color-primary)] text-black font-mono text-xs font-bold rounded hover:opacity-90 transition-all cursor-pointer"
              >
                {editingDomain ? 'SAVE CHANGES' : 'REGISTER MONITOR'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingDomain(null);
                }}
                className="px-4 py-2 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] font-mono text-xs rounded hover:text-[var(--text-main)] transition-all cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="custom-card p-4 space-y-1">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Total Monitored</span>
          <span className="text-xl font-display font-black text-[var(--text-main)]">{totalDomains}</span>
        </div>
        <div className="custom-card p-4 border-l-4 border-l-emerald-500 space-y-1">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">SSL Valid</span>
          <span className="text-xl font-display font-black text-emerald-400">{validSsl}</span>
        </div>
        <div className="custom-card p-4 border-l-4 border-l-amber-500 space-y-1">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">SSL Expiring Soon</span>
          <span className="text-xl font-display font-black text-amber-400">{warningSsl}</span>
        </div>
        <div className="custom-card p-4 border-l-4 border-l-rose-500 space-y-1">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">SSL Expired</span>
          <span className="text-xl font-display font-black text-rose-400">{expiredSsl}</span>
        </div>
        <div className="custom-card p-4 border-l-4 border-l-zinc-500 space-y-1">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">SSL Unknown</span>
          <span className="text-xl font-display font-black text-zinc-400">{unknownSsl}</span>
        </div>
      </div>

      {/* 4. Domain Cards Grid */}
      {domains.length === 0 ? (
        <div className="custom-card p-8 text-center text-xs font-mono text-[var(--text-muted)]">
          No domains currently registered. Click "ADD DOMAIN MONITOR" above to start tracking.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {domains.map((domain) => {
            const daysLeft = getDaysRemaining(domain.sslExpireDate);
            let sslBadgeColor = 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';
            let sslGlow = '';
            if (domain.sslStatus === 'valid') {
              sslBadgeColor = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
              sslGlow = 'glow-emerald';
            } else if (domain.sslStatus === 'warning') {
              sslBadgeColor = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
              sslGlow = 'glow-amber';
            } else if (domain.sslStatus === 'expired') {
              sslBadgeColor = 'bg-rose-500/10 border-rose-500/30 text-rose-400';
              sslGlow = 'glow-rose';
            }

            const isExpanded = expandedDomainId === domain.id;
            const isChecking = checkingIds[domain.id];

            return (
              <div
                key={domain.id}
                className={`custom-card p-4 space-y-3 transition-all duration-300 ${sslGlow}`}
              >
                {/* Card Title Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[var(--border-card)]/30 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="font-display font-black text-sm text-[var(--text-main)] truncate max-w-xs">{domain.domainName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 border text-[9px] font-mono rounded uppercase font-bold ${sslBadgeColor}`}>
                      SSL: {domain.sslStatus || 'UNKNOWN'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      Checked: {domain.lastChecked ? new Date(domain.lastChecked).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>

                {/* Info block */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  {/* SSL Expiration Information */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-[var(--text-muted)] uppercase block">Certificate Expiry</span>
                    <div className="flex items-center gap-1.5 text-[var(--text-main)]">
                      <Calendar className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                      <span>{formatDate(domain.sslExpireDate)}</span>
                    </div>
                    {daysLeft !== null && (
                      <span className={`text-[10px] block ${daysLeft <= 30 ? 'text-amber-400 font-bold' : 'text-emerald-400'}`}>
                        {daysLeft <= 0 ? 'Expired' : `${daysLeft} days remaining`}
                      </span>
                    )}
                  </div>

                  {/* remote stats summary */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-[var(--text-muted)] uppercase block">Endpoint Security</span>
                    <div className="flex items-center gap-1.5">
                      {domain.sslStatus === 'valid' ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-emerald-400">Connection Secured</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="text-rose-400">Unsecured / Expired</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* control buttons */}
                  <div className="flex items-center justify-start md:justify-end gap-1.5">
                    <button
                      onClick={() => triggerLiveCheck(domain.id)}
                      disabled={isChecking}
                      className="p-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--color-primary)] rounded transition-all cursor-pointer disabled:opacity-50"
                      title="Force Telemetry Check"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingDomain(domain);
                        setEditDomainName(domain.domainName);
                        setShowAddForm(false);
                      }}
                      className="p-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--color-primary)] rounded transition-all cursor-pointer"
                      title="Edit Domain Monitor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveDomain(domain.id)}
                      className="p-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] text-rose-500 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                      title="Remove Domain Monitor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Collapsible DNS Records View */}
                <div className="border-t border-[var(--border-card)]/20 pt-2">
                  <button
                    onClick={() => setExpandedDomainId(isExpanded ? null : domain.id)}
                    className="text-[9px] font-mono text-[var(--color-primary)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> Hide Resolved DNS Records
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" /> Show Resolved DNS Records ({
                          (domain.dnsRecords?.A?.length || 0) +
                          (domain.dnsRecords?.AAAA?.length || 0) +
                          (domain.dnsRecords?.MX?.length || 0)
                        } records)
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-3 bg-[var(--bg-app)]/50 rounded border border-[var(--border-card)]/30 space-y-2.5 animate-fade-in font-mono text-[10px]">
                      {/* A Records */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold block">A Records (IPv4 Lookup)</span>
                        {domain.dnsRecords?.A && domain.dnsRecords.A.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {domain.dnsRecords.A.map((ip, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-card)] rounded text-[var(--text-main)]">
                                {ip}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">No A records resolved.</span>
                        )}
                      </div>

                      {/* AAAA Records */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold block">AAAA Records (IPv6 Lookup)</span>
                        {domain.dnsRecords?.AAAA && domain.dnsRecords.AAAA.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {domain.dnsRecords.AAAA.map((ip, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-card)] rounded text-[var(--text-main)]">
                                {ip}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">No AAAA records resolved.</span>
                        )}
                      </div>

                      {/* MX Records */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold block">MX Records (Mail Server Exchange)</span>
                        {domain.dnsRecords?.MX && domain.dnsRecords.MX.length > 0 ? (
                          <div className="space-y-1 mt-1">
                            {domain.dnsRecords.MX.map((mxServer, idx) => (
                              <div key={idx} className="px-2 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] rounded text-[var(--text-main)]">
                                {mxServer}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">No MX records resolved.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
