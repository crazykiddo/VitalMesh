/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NodeStats, DockerContainer, ExternalService, StorageDisk, SystemLog, DomainModel, UserPreferences } from '../types';
import { ShieldCheck, Cpu, HardDrive, Network, Layers, RefreshCw, AlertTriangle, Play, Square, LogOut, Edit2, Globe, ExternalLink, Pause } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { formatStorage } from './StorageView';

interface DashboardViewProps {
  nodes: NodeStats[];
  containers: DockerContainer[];
  services: ExternalService[];
  disks: StorageDisk[];
  logs: SystemLog[];
  alerts?: AlertNotification[];
  domains: DomainModel[];
  preferences: UserPreferences;
  onNavigate: (page: string) => void;
  onToggleContainer: (id: string) => void;
  onTogglePauseNode?: (id: string) => void;
  onAddNode?: (
    name: string,
    ip: string,
    ramTotal: number,
    sshUsername?: string,
    sshPassword?: string,
    sshKey?: string,
    sshPort?: number
  ) => void;
  onRemoveNode?: (id: string) => void;
  onEditNode?: (
    id: string,
    name: string,
    ip: string,
    ramTotal: number,
    sshUsername?: string,
    sshPassword?: string,
    sshKey?: string,
    sshPort?: number
  ) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  nodes,
  containers,
  services,
  disks,
  logs,
  alerts = [],
  domains = [],
  preferences,
  onNavigate,
  onToggleContainer,
  onTogglePauseNode,
  onAddNode,
  onRemoveNode,
  onEditNode,
}) => {
  const [showAddNodeForm, setShowAddNodeForm] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeIp, setNewNodeIp] = useState('');
  const [newNodeRam, setNewNodeRam] = useState('8');
  const [newNodeRamUnit, setNewNodeRamUnit] = useState<'GB' | 'MB'>('GB');
  
  const [showAddNodeSsh, setShowAddNodeSsh] = useState(false);
  const [newNodeSshUsername, setNewNodeSshUsername] = useState('');
  const [newNodeSshPassword, setNewNodeSshPassword] = useState('');
  const [newNodeSshKey, setNewNodeSshKey] = useState('');
  const [newNodeSshPort, setNewNodeSshPort] = useState('22');

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeName, setEditNodeName] = useState('');
  const [editNodeIp, setEditNodeIp] = useState('');
  const [editNodeRam, setEditNodeRam] = useState('8');
  const [editNodeRamUnit, setEditNodeRamUnit] = useState<'GB' | 'MB'>('GB');
  
  const [showEditNodeSsh, setShowEditNodeSsh] = useState(false);
  const [editNodeSshUsername, setEditNodeSshUsername] = useState('');
  const [editNodeSshPassword, setEditNodeSshPassword] = useState('');
  const [editNodeSshKey, setEditNodeSshKey] = useState('');
  const [editNodeSshPort, setEditNodeSshPort] = useState('22');

  const [confirmDeleteNode, setConfirmDeleteNode] = useState<NodeStats | null>(null);

  const handleNodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeName || !newNodeIp) return;
    if (onAddNode) {
      const ramVal = parseFloat(newNodeRam) || 0;
      const ramGB = newNodeRamUnit === 'MB' ? ramVal / 1024 : ramVal;
      onAddNode(
        newNodeName,
        newNodeIp,
        ramGB,
        newNodeSshUsername || undefined,
        newNodeSshPassword || undefined,
        newNodeSshKey || undefined,
        newNodeSshPort ? parseInt(newNodeSshPort, 10) : undefined
      );
    }
    setNewNodeName('');
    setNewNodeIp('');
    setNewNodeRam('8');
    setNewNodeRamUnit('GB');
    setNewNodeSshUsername('');
    setNewNodeSshPassword('');
    setNewNodeSshKey('');
    setNewNodeSshPort('22');
    setShowAddNodeSsh(false);
    setShowAddNodeForm(false);
  };

  // Filter out vitalmesh self-management container
  const visibleContainers = containers.filter(c => 
    !c.name.toLowerCase().includes('vitalmesh') && 
    !c.image.toLowerCase().includes('vitalmesh')
  );

  // Compute dashboard quick stats
  const totalStorageTotalGB = disks.reduce((sum, d) => sum + (d.sizeTotal || 0), 0);
  const totalStorageUsedGB = disks.reduce((sum, d) => sum + (d.sizeUsed || 0), 0);
  const storagePercentage = totalStorageTotalGB > 0 ? Math.round((totalStorageUsedGB / totalStorageTotalGB) * 100) : 0;

  const activeContainersCount = visibleContainers.filter(c => c.status === 'running' || c.status === 'up' || c.status?.toLowerCase().includes('up')).length;
  const totalContainersCount = visibleContainers.length;

  const warningServicesCount = services.filter(s => s.status === 'warning' || s.status === 'alert').length;

  // Group containers by host nodeId
  const groupedContainers: Record<string, DockerContainer[]> = {};
  visibleContainers.forEach(c => {
    const hostId = c.nodeId || 'node-local';
    if (!groupedContainers[hostId]) {
      groupedContainers[hostId] = [];
    }
    groupedContainers[hostId].push(c);
  });

  // Calculate dynamic bottom technical status stats
  const storageVal = totalStorageTotalGB > 0
    ? `${formatStorage(totalStorageUsedGB)} / ${formatStorage(totalStorageTotalGB)} (${storagePercentage}%)`
    : '0 GB / 0 GB';

  const totalTxSpeed = nodes.reduce((sum, n) => sum + (n.txSpeed || 0), 0);
  const totalRxSpeed = nodes.reduce((sum, n) => sum + (n.rxSpeed || 0), 0);
  const trafficVal = `↑${totalTxSpeed.toFixed(2)}MB/s ↓${totalRxSpeed.toFixed(2)}MB/s`;

  const onlineNodes = nodes.filter(n => n.status === 'healthy' || n.status === 'warning');
  const avgCpuPercent = onlineNodes.length > 0
    ? onlineNodes.reduce((sum, n) => sum + (n.cpu || 0), 0) / onlineNodes.length
    : 0;
  const avgLoadVal = `${avgCpuPercent.toFixed(1)}%`;

  const localNode = nodes.find(n => n.id === 'node-local') || nodes[0];
  const uptimeVal = localNode?.uptime || '0m';

  const unreadAlertsCount = alerts.filter(a => !a.read).length;
  const alertsVal = unreadAlertsCount > 0 ? `${unreadAlertsCount} Active` : '0 Active';

  const formatTimeAgo = (isoString?: string): string => {
    if (!isoString) return 'Never';
    let date = new Date(isoString);
    if (isNaN(date.getTime()) && typeof isoString === 'string' && isoString.includes(':')) {
      const todayStr = new Date().toISOString().slice(0, 10);
      date = new Date(`${todayStr}T${isoString}`);
    }
    if (isNaN(date.getTime())) return 'Never';
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 0 || diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const lastBackupLog = logs?.find(l => l.message.toLowerCase().includes('backup'));
  const lastBackupIso = preferences?.lastBackupAt || (lastBackupLog ? lastBackupLog.timestamp : undefined);
  const backupVal = formatTimeAgo(lastBackupIso);

  // Render a tiny inline sparkline for CPU history
  const renderSparkline = (history: number[], color: string) => {
    if (!history || history.length === 0) return null;
    const max = 100;
    const width = 80;
    const height = 18;
    const points = history
      .map((val, index) => {
        const x = (index / (history.length - 1)) * width;
        const y = height - (val / max) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Row with System Info & Control */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[var(--border-card)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            System Dashboard
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
            Real-time status monitoring & operator control panel
          </p>
        </div>
        {onAddNode && (
          <button
            onClick={() => setShowAddNodeForm(!showAddNodeForm)}
            className="px-3.5 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 transition-all flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
          >
            {showAddNodeForm ? 'CANCEL REGISTRATION' : '+ REGISTER NODE'}
          </button>
        )}
      </div>

      {showAddNodeForm && onAddNode && (
        <form onSubmit={handleNodeSubmit} className="custom-card p-4 bg-[var(--bg-card)] max-w-xl mx-auto space-y-4">
          <h3 className="font-mono font-bold text-xs text-[var(--text-main)] border-b border-[var(--border-card)]/50 pb-2 flex items-center gap-2 uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-[var(--color-primary)]" />
            Register External VPS Node
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Node Name</label>
              <input
                type="text"
                required
                placeholder="e.g. VPS-01"
                value={newNodeName}
                onChange={e => setNewNodeName(e.target.value)}
                className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">IP Address</label>
              <input
                type="text"
                required
                placeholder="e.g. 192.168.1.50"
                value={newNodeIp}
                onChange={e => setNewNodeIp(e.target.value)}
                className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Total Memory</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 16"
                  value={newNodeRam}
                  onChange={e => setNewNodeRam(e.target.value)}
                  className="flex-1 p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                />
                <select
                  value={newNodeRamUnit}
                  onChange={e => setNewNodeRamUnit(e.target.value as 'GB' | 'MB')}
                  className="w-16 p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
                >
                  <option value="GB">GB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
            </div>
          </div>

          {/* SSH Connection Settings */}
          <div className="border-t border-[var(--border-card)]/40 pt-3">
            <button
              type="button"
              onClick={() => setShowAddNodeSsh(!showAddNodeSsh)}
              className="text-[10px] font-mono text-[var(--color-primary)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
            >
              {showAddNodeSsh ? '▼ Hide SSH Telemetry Settings' : '▶ Show SSH Telemetry Settings (Required for CPU/RAM/Temp)'}
            </button>
            
            {showAddNodeSsh && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 animate-fade-in p-3 bg-[var(--bg-app)]/50 rounded border border-[var(--border-card)]/30">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-[var(--text-muted)] uppercase block">SSH Username</label>
                  <input
                    type="text"
                    placeholder="e.g. root"
                    value={newNodeSshUsername}
                    onChange={e => setNewNodeSshUsername(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-[var(--text-muted)] uppercase block">SSH Port</label>
                  <input
                    type="number"
                    placeholder="22"
                    value={newNodeSshPort}
                    onChange={e => setNewNodeSshPort(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-[var(--text-muted)] uppercase block">SSH Password</label>
                  <input
                    type="password"
                    placeholder="SSH password"
                    value={newNodeSshPassword}
                    onChange={e => setNewNodeSshPassword(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[9px] font-mono text-[var(--text-muted)] uppercase block">SSH Private Key</label>
                  <textarea
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    rows={3}
                    value={newNodeSshKey}
                    onChange={e => setNewNodeSshKey(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)] resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="submit"
              className="px-4 py-1.5 bg-[var(--color-primary)] text-black rounded text-xs font-bold font-mono hover:opacity-90 transition-all cursor-pointer"
            >
              ADD NODE
            </button>
            <button
              type="button"
              onClick={() => setShowAddNodeForm(false)}
              className="px-4 py-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded text-xs font-bold font-mono hover:text-[var(--text-main)] transition-all cursor-pointer"
            >
              CANCEL
            </button>
          </div>
        </form>
      )}

      {/* Top Technical Status Bar (moved from bottom) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pb-2 border-b border-[var(--border-card)]/30 pb-4">
        {[
          { label: 'STORAGE', val: storageVal, color: 'text-cyan-400', visible: preferences.moduleStorage ?? true },
          { label: 'TRAFFIC', val: trafficVal, color: 'text-indigo-400', visible: preferences.moduleMesh ?? true },
          { label: 'AVG LOAD', val: avgLoadVal, color: 'text-emerald-400', visible: preferences.moduleMesh ?? true },
          { label: 'UPTIME', val: uptimeVal, color: 'text-cyan-400', visible: preferences.moduleMesh ?? true },
          {
            label: 'ALERTS',
            val: alertsVal,
            color: unreadAlertsCount > 0 ? 'text-rose-500 font-extrabold animate-pulse' : 'text-emerald-400',
            visible: true
          },
          {
            label: 'BACKUP',
            val: backupVal,
            color: backupVal === 'Never' ? 'text-zinc-500' : 'text-emerald-400',
            visible: true
          },
        ].filter(item => item.visible).map((item, index) => (
          <div key={index} className="bg-[var(--bg-card)] border border-[var(--border-card)]/50 rounded p-2.5 text-center flex flex-col justify-center shadow-lg">
            <span className="text-[9px] font-mono text-[var(--text-muted)] tracking-widest">{item.label}</span>
            <span className={`text-xs font-mono font-bold ${item.color} mt-0.5`}>{item.val}</span>
          </div>
        ))}
      </div>

      {(preferences.moduleMesh ?? true) || (preferences.moduleStorage ?? true) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(preferences.moduleMesh ?? true) && nodes.map(node => {
            const isWarn = node.cpu > 80;
            const statusColor = node.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400';
            const cpuColor = isWarn ? 'var(--color-secondary, #ff00ff)' : 'var(--color-primary, #00f0ff)';

            if (editingNodeId === node.id) {
              return (
                <form
                  key={node.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (onEditNode) {
                      const ramVal = parseFloat(editNodeRam) || 0;
                      const ramGB = editNodeRamUnit === 'MB' ? ramVal / 1024 : ramVal;
                      onEditNode(
                        node.id,
                        editNodeName,
                        editNodeIp,
                        ramGB,
                        editNodeSshUsername || undefined,
                        editNodeSshPassword || undefined,
                        editNodeSshKey || undefined,
                        editNodeSshPort ? parseInt(editNodeSshPort, 10) : undefined
                      );
                    }
                    setEditingNodeId(null);
                  }}
                  className="custom-card p-4 flex flex-col justify-between space-y-2 border-[var(--color-primary)]"
                >
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold border-b border-[var(--border-card)]/40 pb-1 mb-1">
                    EDIT NODE CONFIG
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Name</label>
                    <input
                      type="text"
                      required
                      value={editNodeName}
                      onChange={e => setEditNodeName(e.target.value)}
                      className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">IP Address</label>
                    <input
                      type="text"
                      required
                      value={editNodeIp}
                      onChange={e => setEditNodeIp(e.target.value)}
                      className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Total Memory</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        required
                        min="1"
                        step="any"
                        placeholder="e.g. 16"
                        value={editNodeRam}
                        onChange={e => setEditNodeRam(e.target.value)}
                        className="flex-1 p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                      />
                      <select
                        value={editNodeRamUnit}
                        onChange={e => setEditNodeRamUnit(e.target.value as 'GB' | 'MB')}
                        className="w-14 p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
                      >
                        <option value="GB">GB</option>
                        <option value="MB">MB</option>
                      </select>
                    </div>
                  </div>

                  {/* SSH Connection Settings */}
                  <div className="border-t border-[var(--border-card)]/40 pt-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setShowEditNodeSsh(!showEditNodeSsh)}
                      className="text-[9px] font-mono text-[var(--color-primary)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
                    >
                      {showEditNodeSsh ? '▼ Hide SSH Settings' : '▶ Show SSH Settings (Required for Telemetry)'}
                    </button>
                    
                    {showEditNodeSsh && (
                      <div className="space-y-1.5 mt-2 p-2 bg-[var(--bg-app)]/50 rounded border border-[var(--border-card)]/30">
                        <div className="space-y-1">
                          <label className="text-[8px] font-mono text-[var(--text-muted)] uppercase block">SSH User</label>
                          <input
                             type="text"
                             placeholder="root"
                             value={editNodeSshUsername}
                             onChange={e => setEditNodeSshUsername(e.target.value)}
                             className="w-full p-1 bg-[var(--bg-app)] text-[9px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-mono text-[var(--text-muted)] uppercase block">SSH Port</label>
                          <input
                             type="number"
                             placeholder="22"
                             value={editNodeSshPort}
                             onChange={e => setEditNodeSshPort(e.target.value)}
                             className="w-full p-1 bg-[var(--bg-app)] text-[9px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-mono text-[var(--text-muted)] uppercase block">SSH Password</label>
                          <input
                             type="password"
                             placeholder="Password"
                             value={editNodeSshPassword}
                             onChange={e => setEditNodeSshPassword(e.target.value)}
                             className="w-full p-1 bg-[var(--bg-app)] text-[9px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-mono text-[var(--text-muted)] uppercase block">SSH Key</label>
                          <textarea
                             placeholder="Private Key"
                             rows={2}
                             value={editNodeSshKey}
                             onChange={e => setEditNodeSshKey(e.target.value)}
                             className="w-full p-1 bg-[var(--bg-app)] text-[9px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)] resize-none"
                          />
                        </div>
                      </div>
                    )}
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
                      onClick={() => setEditingNodeId(null)}
                      className="flex-1 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded text-[9px] font-bold font-mono hover:text-[var(--text-main)] transition-all cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={node.id} className="custom-card p-4 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Cpu className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-xs font-bold text-[var(--text-main)] truncate" title={node.name}>{node.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-tight">{node.ip}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {node.isPaused ? (
                      <span className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-mono font-bold uppercase">
                        PAUSED
                      </span>
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${node.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                    )}

                    {onTogglePauseNode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePauseNode(node.id);
                        }}
                        className={`p-1 rounded text-[9px] font-mono font-bold border transition-colors shrink-0 cursor-pointer ml-0.5 ${
                          node.isPaused
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                            : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/25'
                        }`}
                        title={node.isPaused ? "Resume stats polling" : "Pause stats polling"}
                      >
                        {node.isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      </button>
                    )}
                    
                    {onEditNode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditNodeName(node.name);
                          setEditNodeIp(node.ip);
                          setEditNodeRam(node.ramTotal.toString());
                          setEditNodeRamUnit('GB');
                          setEditNodeSshUsername(node.sshUsername || '');
                          setEditNodeSshPassword(node.sshPassword || '');
                          setEditNodeSshKey(node.sshKey || '');
                          setEditNodeSshPort((node.sshPort || 22).toString());
                          setShowEditNodeSsh(!!node.sshUsername);
                          setEditingNodeId(node.id);
                        }}
                        className="text-[var(--text-muted)] hover:text-[var(--color-primary)] ml-1 focus:outline-none shrink-0 cursor-pointer"
                        title="Edit node configuration"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}

                    {onRemoveNode && node.id !== 'node-local' && node.id !== 'node-01' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteNode(node);
                        }}
                        className="text-rose-500 hover:text-rose-400 font-bold font-mono text-xs ml-1 focus:outline-none shrink-0 cursor-pointer"
                        title="De-register VPS node"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* CPU Status */}
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[var(--text-muted)]">CPU</span>
                    <span className="font-bold" style={{ color: cpuColor }}>{node.cpu}%</span>
                  </div>
                  <div className="w-full bg-[var(--bg-app)] h-2 rounded overflow-hidden border border-[var(--border-card)]">
                    <div
                      className="progress-bar-fill h-full"
                      style={{
                        width: `${node.cpu}%`,
                        backgroundColor: cpuColor,
                      }}
                    />
                  </div>
                </div>

                {/* RAM Status */}
                {(() => {
                  const ramTotal = node.ramTotal || 0;
                  const ramUsed = node.ramUsed || 0;
                  const ramPct = ramTotal > 0 ? Math.min(100, Math.max(0, Math.round((ramUsed / ramTotal) * 100))) : 0;
                  return (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-[var(--text-muted)]">RAM ({ramTotal}GB)</span>
                        <span className="font-bold text-[var(--text-main)]">
                          {ramPct}%
                        </span>
                      </div>
                      <div className="w-full bg-[var(--bg-app)] h-2 rounded overflow-hidden border border-[var(--border-card)]">
                        <div
                          className="progress-bar-fill h-full bg-[var(--color-secondary)]"
                          style={{ width: `${ramPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Sparkline & Temp */}
                <div className="mt-4 pt-3 border-t border-[var(--border-card)] flex justify-between items-end">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono block">TEMP</span>
                    <span className="font-mono text-xs font-semibold text-[var(--text-main)]">{node.temp || 40}°C</span>
                  </div>
                  {renderSparkline(node.cpuHistory, cpuColor)}
                </div>
              </div>
            );
          })}

          {(preferences.moduleStorage ?? true) && (
            <div
              onClick={() => onNavigate('storage')}
              className="custom-card p-4 flex flex-col justify-between cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[var(--color-secondary)]" />
                  <span className="font-mono text-xs font-bold text-[var(--text-main)]">STORAGE-CORE ({disks.length})</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>

              <div className="space-y-3 mt-4">
                {disks.slice(0, 4).map((disk) => {
                  const sizeTotal = disk.sizeTotal || 0;
                  const sizeUsed = disk.sizeUsed || 0;
                  const diskPerc = sizeTotal > 0 ? Math.min(100, Math.max(0, Math.round((sizeUsed / sizeTotal) * 100))) : 0;
                  return (
                    <div key={disk.id} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-[var(--text-muted)] truncate max-w-[120px]">{disk.name}</span>
                        <span className="text-[var(--text-main)] font-semibold">{diskPerc}%</span>
                      </div>
                      <div className="w-full bg-[var(--bg-app)] h-1.5 rounded overflow-hidden">
                        <div
                          className="progress-bar-fill h-full bg-[var(--color-primary)]"
                          style={{ width: `${diskPerc}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {disks.length > 4 && (
                  <div className="text-[10px] font-mono text-[var(--text-muted)] text-right">
                    + {disks.length - 4} more disk pools
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-[var(--border-card)] flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--color-primary)]">
                <span>ZFS ARRAYS</span>
                <span>MANAGE →</span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Grid 2: Services Uptime & Domains */}
      {(preferences.moduleUptime ?? true) || (preferences.moduleDomains ?? true) ? (
        <div className={`grid grid-cols-1 ${(preferences.moduleUptime ?? true) && (preferences.moduleDomains ?? true) ? 'lg:grid-cols-2' : ''} gap-6`}>
          {/* External Services Uptime list */}
          {(preferences.moduleUptime ?? true) && (
            <div
              onClick={() => onNavigate('uptime')}
              className="custom-card p-4 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex justify-between items-center border-b border-[var(--border-card)] pb-2 mb-3">
                  <span className="font-mono text-xs font-bold text-[var(--text-main)] tracking-wider uppercase flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    EXTERNAL SERVICES UPTIME
                  </span>
                  {warningServicesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-mono animate-pulse">
                      {warningServicesCount} WARNING
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {services.slice(0, 6).map(service => {
                    const isHealthy = service.status === 'healthy';
                    const statusDot = isHealthy ? 'bg-emerald-400' : 'bg-amber-400';
                    return (
                      <div key={service.id} className="flex justify-between items-center py-0.5 border-b border-[var(--border-card)]/30 last:border-0">
                        <div className="flex items-center gap-2 truncate max-w-[200px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                          <a
                            href={service.url.startsWith('http') ? service.url : `https://${service.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs text-[var(--color-primary)] hover:underline truncate flex items-center gap-1 cursor-pointer"
                            title={`Open ${service.url}`}
                          >
                            {service.name}
                            <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                          </a>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-xs text-right">
                          <span className="text-[var(--text-muted)] text-[10px]">{service.uptimePercentage}%</span>
                          <span className={isHealthy ? 'text-emerald-400' : 'text-amber-400'}>{service.latency}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 text-center text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--color-primary)]">
                VIEW ALL DETAILED ENDPOINTS & LIVE PING TESTS →
              </div>
            </div>
          )}

          {/* Domains status card */}
          {(preferences.moduleDomains ?? true) && (
            <div
              onClick={() => onNavigate('domains')}
              className="custom-card p-4 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex justify-between items-center border-b border-[var(--border-card)] pb-2 mb-3">
                  <span className="font-mono text-xs font-bold text-[var(--text-main)] tracking-wider uppercase flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[var(--color-primary)] glow-cyan-svg" />
                    DOMAINS & SSL TELEMETRY
                  </span>
                  {domains.filter(d => d.sslStatus === 'warning' || d.sslStatus === 'expired').length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-mono animate-pulse">
                      {domains.filter(d => d.sslStatus === 'warning' || d.sslStatus === 'expired').length} ISSUES
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {domains.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[var(--text-muted)] font-mono italic">
                      No domains registered.
                    </div>
                  ) : (
                    domains.slice(0, 6).map(domain => {
                      const isHealthy = domain.sslStatus === 'valid';
                      const isWarning = domain.sslStatus === 'warning';
                      const isExpired = domain.sslStatus === 'expired';
                      let statusDot = 'bg-zinc-400';
                      let statusColor = 'text-zinc-400';
                      if (isHealthy) {
                        statusDot = 'bg-emerald-400';
                        statusColor = 'text-emerald-400';
                      } else if (isWarning) {
                        statusDot = 'bg-amber-400';
                        statusColor = 'text-amber-400';
                      } else if (isExpired) {
                        statusDot = 'bg-rose-400';
                        statusColor = 'text-rose-400';
                      }

                      const daysLeft = domain.sslExpireDate
                        ? Math.ceil((new Date(domain.sslExpireDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <div key={domain.id} className="flex justify-between items-center py-0.5 border-b border-[var(--border-card)]/30 last:border-0">
                          <div className="flex items-center gap-2 truncate max-w-[180px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                            <span className="font-mono text-xs text-[var(--text-main)] truncate">{domain.domainName}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs text-right">
                            <span className={`text-[10px] uppercase font-bold ${statusColor}`}>{domain.sslStatus || 'unknown'}</span>
                            <span className="text-[var(--text-muted)] text-[10px]">
                              {daysLeft !== null ? (daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`) : 'N/A'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 text-center text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--color-primary)]">
                VIEW ALL DETAILED DOMAINS & RESOLVED DNS RECORDS →
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Grid 2.2: Alerts & Live Logs (Full Width) */}
      <div
        onClick={() => onNavigate('alerts')}
        className="custom-card p-4 flex flex-col justify-between cursor-pointer w-full"
      >
        <div>
          <div className="flex justify-between items-center border-b border-[var(--border-card)] pb-2 mb-3">
            <span className="font-mono text-xs font-bold text-[var(--text-main)] tracking-wider uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
              ALERTS & LIVE LOGS
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">STREAMING LIVE</span>
          </div>

          <div className="bg-[var(--bg-app)] rounded p-2.5 font-mono text-xs text-zinc-300 space-y-2 border border-[var(--border-card)]/50 max-h-[190px] overflow-y-auto">
            {logs.slice(0, 5).map(log => {
              let badgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
              if (log.level === 'WARN') badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
              if (log.level === 'ERR') badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
              if (log.level === 'AUTH') badgeColor = 'text-violet-400 bg-violet-500/10 border-violet-500/20';

              return (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed text-[11px]">
                  <span className="text-[var(--text-muted)] select-none shrink-0">{log.timestamp}</span>
                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold border ${badgeColor} shrink-0`}>
                    {log.level}
                  </span>
                  <span className="text-[var(--text-main)] truncate max-w-none flex-1">
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-center text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--color-secondary)]">
          FILTER & INSPECT COMPREHENSIVE LOG ARCHIVES →
        </div>
      </div>

      {/* Section 3: Docker Overview Grid */}
      {(preferences.moduleContainers ?? true) && (
        <div className="custom-card p-4">
          <div className="flex justify-between items-center border-b border-[var(--border-card)] pb-2 mb-4">
            <h2 className="font-mono text-xs font-bold text-[var(--text-main)] tracking-wider uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded bg-cyan-400" />
              DOCKER CONTAINER OVERVIEW ({activeContainersCount}/{totalContainersCount} RUNNING)
            </h2>
            <button
              onClick={() => onNavigate('containers')}
              className="text-xs font-mono text-[var(--color-primary)] hover:underline"
            >
              MANAGE
            </button>
          </div>

          <div className="space-y-6">
            {Object.entries(groupedContainers).map(([hostId, hostContainers]) => {
              const hostNode = nodes.find(n => n.id === hostId);
              const hostName = hostNode ? `${hostNode.name} (${hostNode.ip})` : (hostId === 'node-local' ? 'Local Host (127.0.0.1)' : `External Host (${hostId})`);
              return (
                <div key={hostId} className="border-t border-[var(--border-card)]/30 pt-4 first:border-0 first:pt-0 space-y-2">
                  <div className="text-[10px] font-mono font-bold text-[var(--color-primary)] tracking-wider uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                    Host Node: {hostName} ({hostContainers.length} Containers)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {hostContainers.map(container => {
                      const isRunning = container.status === 'running';
                      const isPaused = container.status === 'paused';
                      let dotColor = 'bg-zinc-500';
                      if (isRunning) dotColor = 'bg-emerald-400';
                      if (isPaused) dotColor = 'bg-amber-400';

                      return (
                        <div
                          key={container.id}
                          className="bg-[var(--bg-app)] border border-[var(--border-card)]/50 hover:border-[var(--color-primary)]/40 p-3 rounded transition-all duration-200"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-mono text-xs font-bold text-[var(--text-main)] truncate pr-2">
                              {container.name}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-[var(--text-muted)]">
                            <div>CPU: <span className={isRunning ? 'text-cyan-400 font-semibold' : ''}>{isRunning ? `${container.cpu}%` : '0%'}</span></div>
                            <div>RAM: <span className={isRunning ? 'text-pink-400 font-semibold' : ''}>{isRunning ? `${container.ram} MB` : '0 MB'}</span></div>
                            <div className="col-span-2 truncate">IMAGE: <span className="text-[var(--text-main)]">{container.image}</span></div>
                          </div>

                          {/* Quick Toggle Button */}
                          <div className="mt-3 flex gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleContainer(container.id);
                              }}
                              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[9px] font-mono font-medium border transition-colors cursor-pointer ${
                                isRunning
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                              }`}
                            >
                              {isRunning ? (
                                <>
                                  <Square className="w-2.5 h-2.5" /> STOP
                                </>
                              ) : (
                                <>
                                  <Play className="w-2.5 h-2.5" /> START
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirmDeleteNode}
        title="De-register Node"
        message={`Are you sure you want to de-register host node "${confirmDeleteNode?.name}"? This will remove its associated telemetry and stats.`}
        onConfirm={() => {
          if (confirmDeleteNode && onRemoveNode) {
            onRemoveNode(confirmDeleteNode.id);
          }
          setConfirmDeleteNode(null);
        }}
        onCancel={() => setConfirmDeleteNode(null)}
      />
    </div>
  );
};
