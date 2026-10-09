/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StorageDisk, NodeStats } from '../types';
import { HardDrive, Server, RefreshCw, AlertTriangle, Play, HelpCircle, Edit2, Trash2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

export function formatStorage(valInGB: number): string {
  if (valInGB === undefined || valInGB === null || isNaN(valInGB) || valInGB <= 0) return '0 GB';
  if (valInGB >= 1000) {
    return `${(valInGB / 1024).toFixed(2)} TB`;
  }
  if (valInGB < 1) {
    return `${(valInGB * 1024).toFixed(0)} MB`;
  }
  return `${valInGB.toFixed(1)} GB`;
}

interface StorageViewProps {
  disks: StorageDisk[];
  nodes?: NodeStats[];
  onAddDisk: (newDisk: StorageDisk) => void;
  onEditDisk?: (
    id: string,
    name: string,
    type: string,
    sizeTotal: number,
    ip?: string,
    nodeId?: string,
    sshUsername?: string,
    sshPassword?: string,
    sshKey?: string,
    sshPort?: number,
    sshPath?: string
  ) => void;
  onRemoveDisk?: (id: string) => void;
}

export const StorageView: React.FC<StorageViewProps> = ({ disks, nodes = [], onAddDisk, onEditDisk, onRemoveDisk }) => {
  const [smartResult, setSmartResult] = useState<string | null>(null);
  const [testingDiskId, setTestingDiskId] = useState<string | null>(null);
  const [newDiskName, setNewDiskName] = useState('');
  const [newDiskSize, setNewDiskSize] = useState('4.0');
  const [newDiskType, setNewDiskType] = useState('ZFS Pool');
  const [newDiskIp, setNewDiskIp] = useState('');
  const [newDiskNodeId, setNewDiskNodeId] = useState('node-local');
  const [showAddForm, setShowAddForm] = useState(false);

  // New remote SSH states for storage addition
  const [newDiskSshUsername, setNewDiskSshUsername] = useState('');
  const [newDiskSshPassword, setNewDiskSshPassword] = useState('');
  const [newDiskSshKey, setNewDiskSshKey] = useState('');
  const [newDiskSshPort, setNewDiskSshPort] = useState('22');
  const [newDiskSshPath, setNewDiskSshPath] = useState('/');

  const [editingDiskId, setEditingDiskId] = useState<string | null>(null);
  const [editDiskName, setEditDiskName] = useState('');
  const [editDiskSize, setEditDiskSize] = useState('4.0');
  const [editDiskType, setEditDiskType] = useState('ZFS Pool');
  const [editDiskIp, setEditDiskIp] = useState('');
  const [editDiskNodeId, setEditDiskNodeId] = useState('node-local');

  // Edit remote SSH states
  const [editDiskSshUsername, setEditDiskSshUsername] = useState('');
  const [editDiskSshPassword, setEditDiskSshPassword] = useState('');
  const [editDiskSshKey, setEditDiskSshKey] = useState('');
  const [editDiskSshPort, setEditDiskSshPort] = useState('22');
  const [editDiskSshPath, setEditDiskSshPath] = useState('/');

  const [confirmDeleteDisk, setConfirmDeleteDisk] = useState<StorageDisk | null>(null);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('vitalmesh_collapsed_storage');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vitalmesh_collapsed_storage', JSON.stringify(collapsedGroups));
    } catch (err) {
      console.error('Error saving collapsed storage state:', err);
    }
  }, [collapsedGroups]);

  const toggleGroupCollapse = (hostId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [hostId]: !prev[hostId],
    }));
  };

  const totalUsed = disks.reduce((acc, d) => acc + d.sizeUsed, 0);
  const totalSize = disks.reduce((acc, d) => acc + d.sizeTotal, 0);

  // Group disks by host nodeId
  const groupedDisks: Record<string, StorageDisk[]> = {};
  disks.forEach(d => {
    const hostId = d.nodeId || 'node-local';
    if (!groupedDisks[hostId]) {
      groupedDisks[hostId] = [];
    }
    groupedDisks[hostId].push(d);
  });

  const triggerSmartTest = (diskId: string, diskName: string) => {
    setTestingDiskId(diskId);
    setSmartResult(null);

    fetch(`/api/disks/${diskId}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        setTestingDiskId(null);
        setSmartResult(data.result || 'No diagnostic output returned.');
      })
      .catch(err => {
        setTestingDiskId(null);
        setSmartResult(`Error running diagnostics check: ${err.message || err}`);
      });
  };

  const handleAddDiskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiskName) return;

    const addedDisk: StorageDisk = {
      id: `disk-${Date.now()}`,
      name: newDiskName,
      type: newDiskIp ? `${newDiskType} (${newDiskIp})` : newDiskType,
      sizeUsed: 0,
      sizeTotal: parseFloat(newDiskSize) || 4.0,
      health: 'healthy',
      temp: 32,
      ip: newDiskIp || undefined,
      nodeId: newDiskNodeId,
      sshUsername: newDiskSshUsername || undefined,
      sshPassword: newDiskSshPassword || undefined,
      sshKey: newDiskSshKey || undefined,
      sshPort: newDiskSshPort ? parseInt(newDiskSshPort, 10) : undefined,
      sshPath: newDiskSshPath || undefined,
    };

    onAddDisk(addedDisk);
    setNewDiskName('');
    setNewDiskIp('');
    setNewDiskType('ZFS Pool');
    setNewDiskNodeId('node-local');
    setNewDiskSshUsername('');
    setNewDiskSshPassword('');
    setNewDiskSshKey('');
    setNewDiskSshPort('22');
    setNewDiskSshPath('/');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          Storage Core
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
          ZFS local pool allocations, RAID-Z level statuses, SSD smartctl diagnostics & storage scaling
        </p>
      </div>

      {/* Pools Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="custom-card p-5 md:col-span-1 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase">TOTAL ALLOCATIONS</span>
            <div className="font-display text-3xl font-extrabold text-[var(--text-main)] mt-1 flex items-baseline gap-1">
              {formatStorage(totalUsed)} <span className="text-sm font-mono text-[var(--text-muted)]">USED</span>
            </div>
            <p className="text-xs font-mono text-[var(--text-muted)] mt-1">
              Pools Capacity: {formatStorage(totalSize)} Total Space
            </p>

            <div className="w-full bg-[var(--bg-app)] h-3 rounded-full overflow-hidden border border-[var(--border-card)] mt-5">
              <div
                className="progress-bar-fill h-full bg-[var(--color-primary)]"
                style={{ width: `${totalSize > 0 ? (totalUsed / totalSize) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono mt-2 text-[var(--text-muted)]">
              <span>{Math.round(totalSize > 0 ? (totalUsed / totalSize) * 100 : 0)}% Used</span>
              <span>{formatStorage(totalSize - totalUsed)} Remaining</span>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full mt-6 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-95 transition-all"
          >
            {showAddForm ? 'CANCEL ACTION' : 'PROVISION NEW DISK POOL'}
          </button>
        </div>

        {/* List of storage disks / pools */}
        <div className="md:col-span-2 space-y-4">
          {Object.entries(groupedDisks).map(([hostId, hostDisks]) => {
            const hostNode = nodes?.find(n => n.id === hostId);
            const hostName = hostNode ? `${hostNode.name} (${hostNode.ip})` : (hostId === 'node-local' ? 'Local Host (127.0.0.1)' : `External Host (${hostId})`);
            const isCollapsed = collapsedGroups[hostId];
            
            return (
              <div key={hostId} className="space-y-4 border-t border-[var(--border-card)]/30 pt-5 first:border-0 first:pt-0">
                <div
                  onClick={() => toggleGroupCollapse(hostId)}
                  className="text-[11px] font-mono font-bold text-[var(--color-secondary)] tracking-wider uppercase flex items-center justify-between cursor-pointer hover:text-[var(--text-main)] transition-colors select-none"
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[var(--color-secondary)]" />
                    Host Node: {hostName} ({hostDisks.length} Pools)
                  </div>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] font-mono hover:text-[var(--color-secondary)]">
                    {isCollapsed ? '[+] EXPAND' : '[-] COLLAPSE'}
                  </span>
                </div>

                {!isCollapsed && (
                  <div className="space-y-4">
                  {hostDisks.map(disk => {
                    const diskPercentage = Math.round((disk.sizeUsed / disk.sizeTotal) * 100);
                    const isWarn = disk.health === 'warning';
                    const isCrit = disk.health === 'critical';
                    let healthColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                    if (isWarn) healthColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                    if (isCrit) healthColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                    if (editingDiskId === disk.id) {
                      return (
                        <form
                          key={disk.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (onEditDisk) {
                              onEditDisk(
                                disk.id,
                                editDiskName,
                                editDiskType,
                                parseFloat(editDiskSize),
                                editDiskIp || undefined,
                                editDiskNodeId,
                                editDiskSshUsername || undefined,
                                editDiskSshPassword || undefined,
                                editDiskSshKey || undefined,
                                editDiskSshPort ? parseInt(editDiskSshPort, 10) : undefined,
                                editDiskSshPath || undefined
                              );
                            }
                            setEditingDiskId(null);
                          }}
                          className="custom-card p-4 space-y-3 border-[var(--color-secondary)]"
                        >
                          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold border-b border-[var(--border-card)]/40 pb-1 mb-1">
                            EDIT STORAGE POOL
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Pool Name</label>
                              <input
                                type="text"
                                required
                                value={editDiskName}
                                onChange={e => setEditDiskName(e.target.value)}
                                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Capacity (TB)</label>
                              <input
                                type="number"
                                step="0.1"
                                required
                                value={editDiskSize}
                                onChange={e => setEditDiskSize(e.target.value)}
                                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Protocol / Type</label>
                              <select
                                value={editDiskType}
                                onChange={e => setEditDiskType(e.target.value)}
                                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
                              >
                                <option value="ZFS Pool">ZFS SSD Pool</option>
                                <option value="NFS Share">NFS Network Share (NAS)</option>
                                <option value="SMB/CIFS">SMB/CIFS Share (Windows/NAS)</option>
                                <option value="EXT4 Volume">EXT4 VPS Volume</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">IP Address / Host</label>
                              <input
                                type="text"
                                value={editDiskIp}
                                onChange={e => setEditDiskIp(e.target.value)}
                                placeholder="e.g. 192.168.1.50"
                                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                              />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Host Location</label>
                              <select
                                value={editDiskNodeId}
                                onChange={e => setEditDiskNodeId(e.target.value)}
                                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
                              >
                                <option value="node-local">Local Host (This PC)</option>
                                {nodes?.filter(n => n.id !== 'node-local').map(n => (
                                  <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                                ))}
                              </select>
                            </div>
                            {/* Remote SSH Settings */}
                            <div className="sm:col-span-2 border-t border-[var(--border-card)]/40 pt-2 mt-1">
                              <label className="text-[9px] font-mono text-[var(--color-secondary)] block uppercase font-bold mb-2">
                                Remote SSH Telemetry Settings (Optional)
                              </label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SSH Username</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. root"
                                    value={editDiskSshUsername}
                                    onChange={e => setEditDiskSshUsername(e.target.value)}
                                    className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SSH Port</label>
                                  <input
                                    type="number"
                                    placeholder="22"
                                    value={editDiskSshPort}
                                    onChange={e => setEditDiskSshPort(e.target.value)}
                                    className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SSH Path / Mount</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. /"
                                    value={editDiskSshPath}
                                    onChange={e => setEditDiskSshPath(e.target.value)}
                                    className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SSH Password</label>
                                  <input
                                    type="password"
                                    placeholder="SSH Password"
                                    value={editDiskSshPassword}
                                    onChange={e => setEditDiskSshPassword(e.target.value)}
                                    className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)]"
                                  />
                                </div>
                                <div className="sm:col-span-2 space-y-1">
                                  <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">SSH Private Key</label>
                                  <textarea
                                    rows={3}
                                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                    value={editDiskSshKey}
                                    onChange={e => setEditDiskSshKey(e.target.value)}
                                    className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-secondary)] text-[var(--text-main)] resize-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1.5 pt-2">
                            <button
                              type="submit"
                              className="flex-1 py-1 bg-[var(--color-secondary)] text-black rounded text-[9px] font-bold font-mono hover:opacity-90 transition-all cursor-pointer"
                            >
                              SAVE
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDiskId(null)}
                              className="flex-1 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded text-[9px] font-bold font-mono hover:text-[var(--text-main)] transition-all cursor-pointer"
                            >
                              CANCEL
                            </button>
                          </div>
                        </form>
                      );
                    }

                    return (
                      <div key={disk.id} className="custom-card p-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-card)]/30 pb-3 mb-3">
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-4.5 h-4.5 text-[var(--color-secondary)] shrink-0" />
                            <div>
                              <h3 className="font-mono text-sm font-bold text-[var(--text-main)]">{disk.name}</h3>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">{disk.type}</span>
                                {disk.sshUsername && (
                                  <span className="text-[9px] font-mono px-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                    SSH: {disk.sshUsername}@{disk.ip || 'Host'}:{disk.sshPort || 22}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${healthColor}`}>
                              {disk.health}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-main)] bg-[var(--bg-app)] border border-[var(--border-card)]/50 px-2 py-0.5 rounded">
                              {disk.temp && disk.temp > 0 ? `${disk.temp}°C` : 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 font-mono text-xs">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-[var(--text-muted)]">USED SPACE:</span>
                            <span className="text-[var(--text-main)] font-semibold">
                              {formatStorage(disk.sizeUsed)} / {formatStorage(disk.sizeTotal)} ({diskPercentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-[var(--bg-app)] h-2 rounded overflow-hidden">
                            <div
                              className="progress-bar-fill h-full bg-[var(--color-secondary)]"
                              style={{ width: `${diskPercentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Disk Actions */}
                        <div className="mt-4 flex gap-2">
                          <button
                            disabled={testingDiskId !== null}
                            onClick={() => triggerSmartTest(disk.id, disk.name)}
                            className="flex-1 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[10px] text-[var(--text-main)] font-mono hover:border-[var(--color-primary)] rounded transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${testingDiskId === disk.id ? 'animate-spin' : ''}`} />
                            RUN SMARTCTL DIAGNOSTICS
                          </button>

                          {onEditDisk && (
                            <button
                              onClick={() => {
                                setEditDiskName(disk.name);
                                setEditDiskSize(disk.sizeTotal.toString());
                                setEditDiskType(disk.type.split(' (')[0]);
                                setEditDiskIp(disk.ip || '');
                                setEditDiskNodeId(disk.nodeId || 'node-local');
                                setEditDiskSshUsername(disk.sshUsername || '');
                                setEditDiskSshPassword(disk.sshPassword || '');
                                setEditDiskSshKey(disk.sshKey || '');
                                setEditDiskSshPort(disk.sshPort ? String(disk.sshPort) : '22');
                                setEditDiskSshPath(disk.sshPath || '/');
                                setEditingDiskId(disk.id);
                              }}
                              className="px-3 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--color-primary)] rounded font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="Edit Storage Configuration"
                            >
                              <Edit2 className="w-3 h-3" /> EDIT
                            </button>
                          )}

                          {onRemoveDisk && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteDisk(disk);
                              }}
                              className="px-3 py-1 bg-[var(--bg-app)] border border-rose-500/20 text-[10px] text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 rounded font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="Delete Storage Pool"
                            >
                              <Trash2 className="w-3 h-3" /> DELETE
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Disk Pool Drawer Form */}
      {showAddForm && (
        <form onSubmit={handleAddDiskSubmit} className="custom-card p-5 bg-[var(--bg-card)] max-w-xl mx-auto space-y-4">
          <h3 className="font-display font-bold text-base text-[var(--text-main)] border-b border-[var(--border-card)] pb-2 flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--color-primary)]" />
            Provision Storage Disk Pool
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Disk Pool Name</label>
              <input
                type="text"
                placeholder="e.g. Array 3 (NVMe Pool)"
                value={newDiskName}
                onChange={(e) => setNewDiskName(e.target.value)}
                required
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Disk Capacity (TB)</label>
              <select
                value={newDiskSize}
                onChange={(e) => setNewDiskSize(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="1.0">1.0 TB</option>
                <option value="2.0">2.0 TB</option>
                <option value="4.0">4.0 TB</option>
                <option value="8.0">8.0 TB</option>
                <option value="16.0">16.0 TB</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Storage Protocol / Type</label>
              <select
                value={newDiskType}
                onChange={(e) => setNewDiskType(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="ZFS Pool">ZFS SSD Pool</option>
                <option value="NFS Share">NFS Network Share (NAS)</option>
                <option value="SMB/CIFS">SMB/CIFS Share (Windows/NAS)</option>
                <option value="EXT4 Volume">EXT4 VPS Volume</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">IP Address / Host (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 192.168.1.50"
                value={newDiskIp}
                onChange={(e) => setNewDiskIp(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">Host Location</label>
              <select
                value={newDiskNodeId}
                onChange={(e) => setNewDiskNodeId(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="node-local">Local Host (This PC)</option>
                {nodes?.filter(n => n.id !== 'node-local').map(n => (
                  <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                ))}
              </select>
            </div>
            {/* Remote SSH Configuration (Optional) */}
            <div className="sm:col-span-2 border-t border-[var(--border-card)]/40 pt-4 mt-2">
              <div className="text-[10px] font-mono font-bold tracking-widest text-[var(--color-primary)] uppercase mb-3">
                Remote SSH Telemetry Sync (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">SSH Username</label>
                  <input
                    type="text"
                    placeholder="e.g. root"
                    value={newDiskSshUsername}
                    onChange={(e) => setNewDiskSshUsername(e.target.value)}
                    className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">SSH Port</label>
                  <input
                    type="number"
                    placeholder="22"
                    value={newDiskSshPort}
                    onChange={(e) => setNewDiskSshPort(e.target.value)}
                    className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">SSH Connection Path / Mount</label>
                  <input
                    type="text"
                    placeholder="e.g. / or /mnt/nas"
                    value={newDiskSshPath}
                    onChange={(e) => setNewDiskSshPath(e.target.value)}
                    className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">SSH Password</label>
                  <input
                    type="password"
                    placeholder="SSH password (leave empty if using SSH key)"
                    value={newDiskSshPassword}
                    onChange={(e) => setNewDiskSshPassword(e.target.value)}
                    className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase block">SSH Private Key</label>
                  <textarea
                    rows={4}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                    value={newDiskSshKey}
                    onChange={(e) => setNewDiskSshKey(e.target.value)}
                    className="w-full bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] p-2 rounded focus:outline-none focus:border-[var(--color-primary)] resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-[var(--color-primary)] text-black font-mono text-xs font-bold rounded hover:opacity-90 active:scale-98 transition-all"
            >
              COMMIT AND MOUNT POOL
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

      {/* Diagnostics Console output */}
      <div className="custom-card p-5">
        <div className="border-b border-[var(--border-card)] pb-2 mb-3">
          <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase">SMART DIAGNOSTICS CONSOLE</span>
        </div>
        <div className="bg-black text-cyan-400 font-mono text-[11px] p-3 rounded border border-zinc-900 leading-relaxed whitespace-pre overflow-x-auto min-h-[140px] max-h-[220px]">
          {testingDiskId !== null ? (
            <span className="animate-pulse">Loading smartctl query... Contacting Host Bus Adapter (HBA)...</span>
          ) : smartResult ? (
            smartResult
          ) : (
            <span className="text-zinc-500 italic">No storage disk smart diagnostics run yet. Click "RUN SMARTCTL DIAGNOSTICS" to query attributes.</span>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmDeleteDisk}
        title="Delete Storage Pool"
        message={`Are you sure you want to de-register and delete the storage disk pool "${confirmDeleteDisk?.name}"? All metrics and configurations will be removed.`}
        onConfirm={() => {
          if (confirmDeleteDisk && onRemoveDisk) {
            onRemoveDisk(confirmDeleteDisk.id);
          }
          setConfirmDeleteDisk(null);
        }}
        onCancel={() => setConfirmDeleteDisk(null)}
      />
    </div>
  );
};
