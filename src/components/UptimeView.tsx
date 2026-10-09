/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ExternalService } from '../types';
import { Network, Plus, ShieldCheck, Activity, Search, Trash2, Edit2, ExternalLink } from 'lucide-react';

interface UptimeViewProps {
  services: ExternalService[];
  onAddService: (newService: ExternalService) => void;
  onRemoveService: (id: string) => void;
  onEditService?: (id: string, name: string, url: string, category: string) => void;
}

export const UptimeView: React.FC<UptimeViewProps> = ({
  services,
  onAddService,
  onRemoveService,
  onEditService,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [newServiceCat, setNewServiceCat] = useState('Websites');
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceUrl, setEditServiceUrl] = useState('');
  const [editServiceCat, setEditServiceCat] = useState('Websites');

  const [hoveredBar, setHoveredBar] = useState<{ serviceId: string; dayIndex: number } | null>(null);

  // Calculate stats
  const avgLatency = Math.round(
    services.reduce((acc, s) => acc + s.latency, 0) / services.length
  );
  const globalUptime = (
    services.reduce((acc, s) => acc + s.uptimePercentage, 0) / services.length
  ).toFixed(2);

  const activeIncidents = services.filter(s => s.status === 'alert').length;

  const categories = ['All', ...Array.from(new Set(services.map(s => s.category)))];

  const filteredServices = services.filter(service => {
    const matchesSearch = service.name.toLowerCase().includes(search.toLowerCase()) ||
                          service.url.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'All' ? true : service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName || !newServiceUrl) return;

    // Generate a beautiful 30-day history with mostly 'up', occasional random slow days
    const hist: ('up' | 'slow' | 'down')[] = Array.from({ length: 30 }, () => {
      const rand = Math.random();
      if (rand > 0.98) return 'down';
      if (rand > 0.93) return 'slow';
      return 'up';
    });

    const newService: ExternalService = {
      id: `service-${Date.now()}`,
      name: newServiceName,
      url: newServiceUrl,
      status: 'healthy',
      uptimePercentage: parseFloat((99.2 + Math.random() * 0.8).toFixed(2)),
      latency: Math.round(15 + Math.random() * 80),
      history: hist,
      category: newServiceCat,
    };

    onAddService(newService);
    setNewServiceName('');
    setNewServiceUrl('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-card)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            System Status
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
            Real-time health & 30-day uptime history monitoring grids
          </p>
        </div>

        {/* Global systems operational pill */}
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-mono font-bold animate-pulse self-start sm:self-center">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          All Systems Operational
        </div>
      </div>

      {/* Global metrics cards (Image 4 top section) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Global Uptime */}
        <div className="custom-card p-5">
          <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase block">GLOBAL UPTIME</span>
          <span className="font-display text-3xl font-extrabold text-[var(--text-main)] mt-1.5 block">
            {globalUptime}%
          </span>
        </div>

        {/* Avg Response Time */}
        <div className="custom-card p-5">
          <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase block">AVG RESPONSE</span>
          <span className="font-display text-3xl font-extrabold text-[var(--text-main)] mt-1.5 block">
            {avgLatency} <span className="text-sm font-mono font-medium text-[var(--text-muted)]">ms</span>
          </span>
        </div>

        {/* Active Incidents */}
        <div className="custom-card p-5">
          <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase block">ACTIVE INCIDENTS</span>
          <span className={`font-display text-3xl font-extrabold mt-1.5 block ${activeIncidents > 0 ? 'text-amber-400 animate-pulse' : 'text-[var(--text-main)]'}`}>
            {activeIncidents}
          </span>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col md:flex-row justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-card)]/40 p-4 rounded-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search core services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Dropdowns & Add Button */}
        <div className="flex items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] px-3 py-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold flex items-center gap-1.5 hover:opacity-95 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> ADD SERVICE
          </button>
        </div>
      </div>

      {/* Add Service drawer */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="custom-card p-5 bg-[var(--bg-card)] max-w-xl mx-auto space-y-4">
          <h3 className="font-display font-bold text-base text-[var(--text-main)] border-b border-[var(--border-card)] pb-2 flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--color-primary)]" />
            Add New External Service to Monitor
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Service Name</label>
              <input
                type="text"
                placeholder="e.g. cloud-storage-east"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                required
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Service Category</label>
              <select
                value={newServiceCat}
                onChange={(e) => setNewServiceCat(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none"
              >
                <option value="Websites">Websites</option>
                <option value="APIs">APIs</option>
                <option value="Backups">Backups</option>
                <option value="Databases">Databases</option>
                <option value="Authentication">Authentication</option>
                <option value="CDN">CDN</option>
              </select>
            </div>

            <div className="col-span-1 sm:col-span-2 space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Ping URL / IP Endpoint</label>
              <input
                type="text"
                placeholder="https://storage.east.vitalmesh.net/ping"
                value={newServiceUrl}
                onChange={(e) => setNewServiceUrl(e.target.value)}
                required
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-[var(--color-primary)] text-black font-mono text-xs font-bold rounded hover:opacity-90 active:scale-98 transition-all"
            >
              COMMIT & START PINGING
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 bg-transparent border border-[var(--border-card)] text-[var(--text-main)] font-mono text-xs rounded hover:bg-zinc-800/20"
            >
              CANCEL
            </button>
          </div>
        </form>
      )}

      {/* Core Services Uptime Grid (Image 4 main area) */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-bold text-[var(--text-main)] border-b border-[var(--border-card)] pb-2 flex items-center gap-2">
          <Activity className="w-5 h-5 text-[var(--color-primary)]" />
          Core Monitored Services
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServices.map(service => {
            const isWarning = service.status === 'warning' || service.status === 'alert';
            const statusDotColor = isWarning ? 'bg-amber-400' : 'bg-emerald-400';

            if (editingServiceId === service.id) {
              return (
                <form
                  key={service.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (onEditService) {
                      onEditService(service.id, editServiceName, editServiceUrl, editServiceCat);
                    }
                    setEditingServiceId(null);
                  }}
                  className="custom-card p-4 space-y-3 border-[var(--color-primary)]"
                >
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold border-b border-[var(--border-card)]/40 pb-1 mb-1">
                    EDIT SERVICE CONFIG
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Service Name</label>
                      <input
                        type="text"
                        required
                        value={editServiceName}
                        onChange={e => setEditServiceName(e.target.value)}
                        className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Ping URL / Endpoint</label>
                      <input
                        type="text"
                        required
                        value={editServiceUrl}
                        onChange={e => setEditServiceUrl(e.target.value)}
                        className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Category</label>
                      <select
                        value={editServiceCat}
                        onChange={e => setEditServiceCat(e.target.value)}
                        className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
                      >
                        <option value="Websites">Websites</option>
                        <option value="APIs">APIs</option>
                        <option value="Backups">Backups</option>
                        <option value="Databases">Databases</option>
                        <option value="Authentication">Authentication</option>
                        <option value="CDN">CDN</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-1.5 pt-2">
                    <button
                      type="submit"
                      className="flex-1 py-1 bg-[var(--color-primary)] text-black rounded text-[9px] font-bold font-mono hover:opacity-90 transition-all cursor-pointer"
                    >
                      SAVE
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingServiceId(null)}
                      className="flex-1 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded text-[9px] font-bold font-mono hover:text-[var(--text-main)] transition-all cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={service.id} className="custom-card p-4 space-y-4">
                {/* Service Metadata bar */}
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5 max-w-[190px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                      <a
                        href={service.url.startsWith('http') ? service.url : `https://${service.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs font-bold text-[var(--text-main)] hover:text-[var(--color-primary)] hover:underline truncate flex items-center gap-1 cursor-pointer"
                        title={`Open ${service.url}`}
                      >
                        {service.name}
                        <ExternalLink className="w-3 h-3 text-[var(--color-primary)] opacity-70 shrink-0" />
                      </a>
                    </div>
                    <a
                      href={service.url.startsWith('http') ? service.url : `https://${service.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-mono text-[var(--color-primary)] hover:underline truncate block"
                      title={`Open ${service.url}`}
                    >
                      {service.url}
                    </a>
                  </div>

                  <div className="flex items-center gap-3 text-right font-mono text-xs shrink-0">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">RESPONSE</span>
                      <span className={isWarning ? 'text-amber-400' : 'text-emerald-400'}>{service.latency} ms</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">UPTIME</span>
                      <span className="text-[var(--text-main)] font-semibold">{service.uptimePercentage}%</span>
                    </div>

                    {onEditService && (
                      <button
                        onClick={() => {
                          setEditServiceName(service.name);
                          setEditServiceUrl(service.url);
                          setEditServiceCat(service.category);
                          setEditingServiceId(service.id);
                        }}
                        title="Edit monitor config"
                        className="p-1 hover:text-[var(--color-primary)] text-zinc-500 rounded hover:bg-[var(--color-primary)]/10 transition-all self-center cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onRemoveService(service.id)}
                      title="Decommission monitor"
                      className="p-1 hover:text-rose-400 text-zinc-500 rounded hover:bg-rose-500/10 transition-all self-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 30-Day Grid Representation (from image) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)]">
                    <span>30 DAYS AGO</span>
                    <span className="text-emerald-400">100% RELIABILITY WAVE</span>
                    <span>TODAY</span>
                  </div>

                  {/* Visual 30 bars */}
                  <div className="grid gap-1 sm:gap-1.5 h-7" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}>
                    {service.history.map((dayStatus, idx) => {
                      let barColor = 'bg-emerald-400';
                      let statusText = '100% Uptime';
                      if (dayStatus === 'slow') {
                        barColor = 'bg-amber-400';
                        statusText = 'High Latency Detected (Slow)';
                      } else if (dayStatus === 'down') {
                        barColor = 'bg-rose-500';
                        statusText = 'Service Offline / Socket Timeout';
                      }

                      const isHovered = hoveredBar?.serviceId === service.id && hoveredBar?.dayIndex === idx;

                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => setHoveredBar({ serviceId: service.id, dayIndex: idx })}
                          onMouseLeave={() => setHoveredBar(null)}
                          className={`w-full h-full rounded-[1px] transition-all relative cursor-help ${barColor} ${
                            isHovered ? 'scale-y-115 opacity-100 glow-cyan' : 'opacity-85 hover:opacity-100'
                          }`}
                        >
                          {/* Tooltip rendering */}
                          {isHovered && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-zinc-950 text-white border border-zinc-800 text-[10px] font-mono py-1 px-2 rounded shadow-xl whitespace-nowrap z-50">
                              Day {idx + 1}: {statusText}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
