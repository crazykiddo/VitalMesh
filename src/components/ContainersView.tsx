/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DockerContainer, NodeStats } from '../types';
import { Layers, Play, Square, RotateCw, Terminal, Search, Filter, ShieldAlert, Cpu, Database, Trash2, Edit2, Github } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface ContainersViewProps {
  containers: DockerContainer[];
  nodes?: NodeStats[];
  onToggleContainer: (id: string) => void;
  onRestartContainer: (id: string) => void;
  onAddContainer?: (name: string, image: string, ports: string, maxRam: number, nodeId?: string, ip?: string, url?: string, githubUrl?: string) => void;
  onRemoveContainer?: (id: string) => void;
  onEditContainer?: (id: string, name: string, image: string, ports: string, maxRam: number, nodeId?: string, ip?: string, url?: string, githubUrl?: string) => void;
}

function formatRam(ramMB: number): string {
  if (!ramMB || isNaN(ramMB) || ramMB <= 0) return '0 MB';
  if (ramMB >= 1024) {
    return `${(ramMB / 1024).toFixed(2)} GB`;
  }
  return `${Math.round(ramMB)} MB`;
}

export const ContainersView: React.FC<ContainersViewProps> = ({
  containers,
  nodes = [],
  onToggleContainer,
  onRestartContainer,
  onAddContainer,
  onRemoveContainer,
  onEditContainer,
}) => {
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'running' | 'paused' | 'stopped'>('all');
  const [selectedContainerLogs, setSelectedContainerLogs] = useState<string | null>('c-nginx');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContainerName, setNewContainerName] = useState('');
  const [newContainerImage, setNewContainerImage] = useState('');
  const [newContainerPorts, setNewContainerPorts] = useState('');
  const [newContainerMaxRam, setNewContainerMaxRam] = useState('512');
  const [selectedNodeId, setSelectedNodeId] = useState('node-local');
  const [newContainerIp, setNewContainerIp] = useState('');
  const [newContainerUrl, setNewContainerUrl] = useState('');
  const [newContainerGithubUrl, setNewContainerGithubUrl] = useState('');

  const [activeFormTab, setActiveFormTab] = useState<'single' | 'import'>('single');
  const [importHostUrl, setImportHostUrl] = useState('');
  const [importNodeId, setImportNodeId] = useState('node-local');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [editContainerName, setEditContainerName] = useState('');
  const [editContainerImage, setEditContainerImage] = useState('');
  const [editContainerPorts, setEditContainerPorts] = useState('');
  const [editContainerMaxRam, setEditContainerMaxRam] = useState('512');
  const [editContainerNodeId, setEditContainerNodeId] = useState('node-local');
  const [editContainerIp, setEditContainerIp] = useState('');
  const [editContainerUrl, setEditContainerUrl] = useState('');
  const [editContainerGithubUrl, setEditContainerGithubUrl] = useState('');
  const [confirmDeleteContainer, setConfirmDeleteContainer] = useState<DockerContainer | null>(null);
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});

  const handleToggleClick = async (containerId: string) => {
    setTogglingIds(prev => ({ ...prev, [containerId]: true }));
    try {
      await onToggleContainer(containerId);
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingIds(prev => ({ ...prev, [containerId]: false }));
    }
  };

  const handleRestartClick = async (containerId: string) => {
    setTogglingIds(prev => ({ ...prev, [containerId]: true }));
    try {
      await onRestartContainer(containerId);
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingIds(prev => ({ ...prev, [containerId]: false }));
    }
  };

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('vitalmesh_collapsed_containers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vitalmesh_collapsed_containers', JSON.stringify(collapsedGroups));
    } catch (err) {
      console.error('Error saving collapsed containers state:', err);
    }
  }, [collapsedGroups]);

  const toggleGroupCollapse = (hostId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [hostId]: !prev[hostId],
    }));
  };

  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('vitalmesh_collapsed_projects');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vitalmesh_collapsed_projects', JSON.stringify(collapsedProjects));
    } catch (err) {
      console.error('Error saving collapsed projects state:', err);
    }
  }, [collapsedProjects]);

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const [groupActionLoading, setGroupActionLoading] = useState<Record<string, boolean>>({});

  const handleGroupAction = async (action: 'start' | 'stop' | 'restart', groupId: string, groupContainers: DockerContainer[]) => {
    setGroupActionLoading(prev => ({ ...prev, [groupId]: true }));
    try {
      for (const c of groupContainers) {
        const isRunning = c.status === 'running' || c.status === 'up' || c.status?.toLowerCase().includes('up');
        if (action === 'start' && !isRunning) {
          await handleToggleClick(c.id);
        } else if (action === 'stop' && isRunning) {
          await handleToggleClick(c.id);
        } else if (action === 'restart') {
          await handleRestartClick(c.id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGroupActionLoading(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const getGroupedContainers = (hostContainers: DockerContainer[]) => {
    const groups: Record<string, DockerContainer[]> = {};
    const standalone: DockerContainer[] = [];

    // 1. Group by prefix
    hostContainers.forEach(c => {
      const cleanName = c.name.replace(/^\//, '');
      const parts = cleanName.split(/[-_]/);
      const prefix = parts.length > 1 ? parts[0].toLowerCase() : '';
      
      if (prefix) {
        if (!groups[prefix]) {
          groups[prefix] = [];
        }
        groups[prefix].push(c);
      } else {
        standalone.push(c);
      }
    });

    // 2. Separate groups with only 1 container into standalone
    const finalGroups: Record<string, DockerContainer[]> = {};
    Object.entries(groups).forEach(([prefix, list]) => {
      if (list.length > 1) {
        finalGroups[prefix] = list;
      } else {
        standalone.push(...list);
      }
    });

    return { groups: finalGroups, standalone };
  };

  const renderContainerCard = (container: DockerContainer, isSubContainer = false) => {
    const isRunning = container.status === 'running' || container.status === 'up' || container.status?.toLowerCase().includes('up');
    const isPaused = container.status === 'paused';
    const isSelectedForLogs = selectedContainerLogs === container.id;

    let statusText = 'Stopped';
    let statusClass = 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    if (isRunning) {
      statusText = 'Running';
      statusClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (isPaused) {
      statusText = 'Paused';
      statusClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    if (editingContainerId === container.id) {
      return (
        <form
          key={container.id}
          onClick={e => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (onEditContainer) {
              onEditContainer(
                container.id,
                editContainerName,
                editContainerImage,
                editContainerPorts,
                parseFloat(editContainerMaxRam),
                editContainerNodeId,
                editContainerIp || undefined,
                editContainerUrl || undefined,
                editContainerGithubUrl || undefined
              );
            }
            setEditingContainerId(null);
          }}
          className={`custom-card p-4 space-y-3 border-[var(--color-primary)] cursor-default ${isSubContainer ? 'ml-2' : ''}`}
        >
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold border-b border-[var(--border-card)]/40 pb-1 mb-1">
            EDIT DOCKER CONTAINER
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Name</label>
              <input
                type="text"
                required
                value={editContainerName}
                onChange={e => setEditContainerName(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Image</label>
              <input
                type="text"
                required
                value={editContainerImage}
                onChange={e => setEditContainerImage(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Ports</label>
              <input
                type="text"
                value={editContainerPorts}
                onChange={e => setEditContainerPorts(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Memory Limit (MB)</label>
              <input
                type="number"
                value={editContainerMaxRam}
                onChange={e => setEditContainerMaxRam(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Node Location</label>
              <select
                value={editContainerNodeId}
                onChange={e => setEditContainerNodeId(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none text-[var(--text-main)]"
              >
                <option value="node-local">Local Host (This PC)</option>
                {nodes?.filter(n => n.id !== 'node-local').map(n => (
                  <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">IP Address (Optional)</label>
              <input
                type="text"
                value={editContainerIp}
                onChange={e => setEditContainerIp(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. 192.168.1.2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">Custom Ping URL (Optional)</label>
              <input
                type="text"
                value={editContainerUrl}
                onChange={e => setEditContainerUrl(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. https://mysite.mydomain.com"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[9px] font-mono text-[var(--text-muted)] block uppercase">GitHub Source URL (Optional)</label>
              <input
                type="text"
                value={editContainerGithubUrl}
                onChange={e => setEditContainerGithubUrl(e.target.value)}
                className="w-full p-1 bg-[var(--bg-app)] text-[10px] font-mono border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                placeholder="e.g. https://github.com/crazykiddo/VitalMesh"
              />
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
              onClick={() => setEditingContainerId(null)}
              className="flex-1 py-1 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded text-[9px] font-bold font-mono hover:text-[var(--text-main)] transition-all cursor-pointer"
            >
              CANCEL
            </button>
          </div>
        </form>
      );
    }

    return (
      <div
        key={container.id}
        onClick={() => setSelectedContainerLogs(container.id)}
        className={`custom-card p-4 transition-all duration-150 cursor-pointer ${
          isSelectedForLogs ? 'border-[var(--color-primary)] shadow-md' : 'border-[var(--border-card)]'
        } ${isSubContainer ? 'ml-2 bg-black/20' : ''}`}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Database className={`w-4 h-4 shrink-0 ${isSubContainer ? 'text-[var(--text-muted)]' : 'text-[var(--color-primary)]'}`} />
              <h3 className="font-mono text-sm font-bold text-[var(--text-main)] truncate max-w-[200px]">
                {container.name}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${statusClass}`}>
                {statusText}
              </span>
              {container.githubUrl && (
                <a
                  href={container.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="View Source on GitHub"
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white transition-all ml-1 cursor-pointer flex items-center justify-center shrink-0"
                >
                  <Github className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="font-mono text-[10px] text-[var(--text-muted)] flex flex-wrap gap-x-2 gap-y-0.5">
              <span>IMAGE: <b>{container.image}</b></span>
              <span className="text-[var(--border-card)]">|</span>
              <span>PORTS: <b>{container.ports || 'N/A'}</b></span>
              <span className="text-[var(--border-card)]">|</span>
              <span>HOST: <b>{nodes?.find(n => n.id === container.nodeId)?.name || 'Local Host'}</b></span>
              {isRunning && (
                <>
                  <span className="text-[var(--border-card)]">|</span>
                  <span className="text-emerald-400">CPU: <b>{container.cpu || 0}%</b></span>
                  <span className="text-[var(--border-card)]">|</span>
                  <span className="text-emerald-400">RAM: <b>{formatRam(container.ram || 0)}</b></span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-center">
            <button
              disabled={togglingIds[container.id]}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleClick(container.id);
              }}
              title={isRunning ? 'Stop Container' : 'Start Container'}
              className={`p-1.5 rounded border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isRunning
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/25'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25'
              }`}
            >
              {togglingIds[container.id] ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : isRunning ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              disabled={!isRunning || togglingIds[container.id]}
              onClick={(e) => {
                e.stopPropagation();
                handleRestartClick(container.id);
              }}
              title="Restart Container"
              className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${togglingIds[container.id] ? 'animate-spin' : ''}`} />
            </button>

            <button
              title="Inspect Console Logs"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedContainerLogs(container.id);
              }}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                isSelectedForLogs
                  ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] font-bold'
                  : 'bg-[var(--bg-app)] border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>

            {onEditContainer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditContainerName(container.name);
                  setEditContainerImage(container.image);
                  setEditContainerPorts(container.ports);
                  setEditContainerMaxRam(container.maxRam.toString());
                  setEditContainerNodeId(container.nodeId || 'node-local');
                  setEditContainerIp(container.ip || '');
                  setEditContainerUrl(container.url || '');
                  setEditContainerGithubUrl(container.githubUrl || '');
                  setEditingContainerId(container.id);
                }}
                title="Edit Container details"
                className="p-1.5 rounded bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 hover:bg-zinc-500/25 shrink-0 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {onRemoveContainer && container.id.startsWith('c-') && container.id !== 'c-nginx' && container.id !== 'c-uptime' && container.id !== 'c-pihole' && container.id !== 'c-portainer' && container.id !== 'c-redis' && container.id !== 'c-postgres' && container.id !== 'c-hass' && container.id !== 'c-plex' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteContainer(container);
                }}
                title="De-register external container"
                className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/25 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleContainerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContainerName || !newContainerImage) return;
    if (onAddContainer) {
      onAddContainer(
        newContainerName,
        newContainerImage,
        newContainerPorts,
        parseFloat(newContainerMaxRam),
        selectedNodeId,
        newContainerIp || undefined,
        newContainerUrl || undefined,
        newContainerGithubUrl || undefined
      );
    }
    setNewContainerName('');
    setNewContainerImage('');
    setNewContainerPorts('');
    setNewContainerMaxRam('512');
    setSelectedNodeId('node-local');
    setNewContainerIp('');
    setNewContainerUrl('');
    setNewContainerGithubUrl('');
    setShowAddForm(false);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importHostUrl) return;

    setImportError('');
    setImportSuccess('');
    setIsImporting(true);

    try {
      const res = await fetch('/api/containers/import-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUrl: importHostUrl,
          nodeId: importNodeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import containers');
      }

      setImportSuccess(`Successfully auto-discovered and imported ${data.count} containers!`);
      setImportHostUrl('');
      // Trigger a sync by reloading window or wait for telemetry poll
    } catch (err: any) {
      setImportError(err.message || 'An error occurred during import');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredContainers = containers.filter(container => {
    if (container.name.toLowerCase().includes('vitalmesh') || container.image.toLowerCase().includes('vitalmesh')) {
      return false;
    }
    const matchesSearch = container.name.toLowerCase().includes(search.toLowerCase()) ||
                          container.image.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' ? true : container.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activeLogsContainer = containers.find(c => c.id === selectedContainerLogs) || containers[0];

  // Group filtered containers by host nodeId
  const groupedFilteredContainers: Record<string, DockerContainer[]> = {};
  filteredContainers.forEach(c => {
    const hostId = c.nodeId || 'node-local';
    if (!groupedFilteredContainers[hostId]) {
      groupedFilteredContainers[hostId] = [];
    }
    groupedFilteredContainers[hostId].push(c);
  });

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-card)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            Containers
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
            Docker Engine container management, virtual networking Sockets & live log console
          </p>
        </div>
        {onAddContainer && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 transition-all flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
          >
            {showAddForm ? 'CANCEL PROVISION' : '+ PROVISION CONTAINER'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="custom-card p-5 max-w-xl space-y-4 bg-[var(--bg-card)] border border-[var(--border-card)]">
          <div className="border-b border-[var(--border-card)] pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <h3 className="font-mono text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Provision / Import Containers
              </h3>
            </div>
            
            {/* Tabs */}
            <div className="flex bg-[var(--bg-app)] border border-[var(--border-card)] rounded p-0.5 font-mono text-[9px] self-start sm:self-center">
              <button
                type="button"
                onClick={() => { setActiveFormTab('single'); setImportError(''); setImportSuccess(''); }}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  activeFormTab === 'single'
                    ? 'bg-[var(--color-primary)] text-black font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                SINGLE MANUAL
              </button>
              <button
                type="button"
                onClick={() => { setActiveFormTab('import'); setImportError(''); setImportSuccess(''); }}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  activeFormTab === 'import'
                    ? 'bg-[var(--color-primary)] text-black font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                IMPORT HOST
              </button>
            </div>
          </div>

          {activeFormTab === 'single' ? (
            <form onSubmit={handleContainerSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">CONTAINER NAME</label>
                  <input
                    type="text"
                    required
                    value={newContainerName}
                    onChange={e => setNewContainerName(e.target.value)}
                    placeholder="e.g. redis-cache-vps"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">DOCKER IMAGE</label>
                  <input
                    type="text"
                    required
                    value={newContainerImage}
                    onChange={e => setNewContainerImage(e.target.value)}
                    placeholder="e.g. redis:alpine"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">PORT MAPPING</label>
                  <input
                    type="text"
                    value={newContainerPorts}
                    onChange={e => setNewContainerPorts(e.target.value)}
                    placeholder="e.g. 6379:6379"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">MEMORY LIMIT (MB)</label>
                  <input
                    type="number"
                    value={newContainerMaxRam}
                    onChange={e => setNewContainerMaxRam(e.target.value)}
                    placeholder="e.g. 512"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">NODE HOST LOCATION</label>
                  <select
                    value={selectedNodeId}
                    onChange={e => setSelectedNodeId(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  >
                    <option value="node-local">Local Host (This PC)</option>
                    {nodes?.filter(n => n.id !== 'node-local').map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">IP ADDRESS (OPTIONAL)</label>
                  <input
                    type="text"
                    value={newContainerIp}
                    onChange={e => setNewContainerIp(e.target.value)}
                    placeholder="e.g. 192.168.0.1"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">CUSTOM PROXY/PING URL (OPTIONAL)</label>
                  <input
                    type="text"
                    value={newContainerUrl}
                    onChange={e => setNewContainerUrl(e.target.value)}
                    placeholder="e.g. https://mysite.mydomain.com"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">GITHUB SOURCE URL (OPTIONAL)</label>
                  <input
                    type="text"
                    value={newContainerGithubUrl}
                    onChange={e => setNewContainerGithubUrl(e.target.value)}
                    placeholder="e.g. https://github.com/excalidraw/excalidraw"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-transparent border border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded text-xs font-mono font-bold transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  PROVISION CONTAINER
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">DOCKER TCP PORT / URL</label>
                  <input
                    type="text"
                    required
                    value={importHostUrl}
                    onChange={e => setImportHostUrl(e.target.value)}
                    placeholder="e.g. 192.168.1.50:2375"
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">ASSIGN TO HOST NODE</label>
                  <select
                    value={importNodeId}
                    onChange={e => setImportNodeId(e.target.value)}
                    className="w-full p-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                  >
                    <option value="node-local">Local Host (This PC)</option>
                    {nodes?.filter(n => n.id !== 'node-local').map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error and Success Indicators */}
              {importError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded text-[11px] font-mono leading-relaxed">
                  ⚠️ <b>Import Failed:</b> {importError}
                </div>
              )}

              {importSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[11px] font-mono leading-relaxed">
                  ✅ <b>Success:</b> {importSuccess}
                </div>
              )}

              <div className="p-3 bg-zinc-950/40 border border-cyan-500/20 rounded text-[10px] text-[var(--text-muted)] space-y-1 font-mono leading-normal">
                <span className="font-bold text-[var(--text-main)] uppercase block text-[10px]">ℹ️ DOCKER TCP API SETUP INSTRUCTIONS:</span>
                <p>To auto-import, your remote node must expose Docker over TCP (usually port 2375). On Linux VPS:</p>
                <ol className="list-decimal pl-4 space-y-0.5 mt-1 text-[9.5px]">
                  <li>Edit <code className="text-zinc-300">/lib/systemd/system/docker.service</code></li>
                  <li>Modify ExecStart to include: <code className="text-cyan-300">-H tcp://0.0.0.0:2375</code></li>
                  <li>Run <code className="text-zinc-300">systemctl daemon-reload && systemctl restart docker</code></li>
                  <li>Ensure VPS and aaPanel security rules allow incoming TCP traffic on port <code className="text-cyan-300">2375</code>.</li>
                </ol>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  disabled={isImporting}
                  className="px-4 py-2 bg-transparent border border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  className="px-4 py-2 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isImporting ? 'IMPORTING...' : 'DISCOVER & IMPORT'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-card)]/40 p-4 rounded-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search containers by name or image..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-app)] text-xs font-mono text-[var(--text-main)] border border-[var(--border-card)] rounded focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Filter Tab buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 hidden sm:block" />
          {(['all', 'running', 'paused', 'stopped'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-medium uppercase border ${
                filter === tab
                  ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] font-semibold'
                  : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-card)] hover:text-[var(--text-main)] hover:border-[var(--color-primary)]/40'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main split dashboard: Container List & Realtime Terminal Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List of Containers */}
        <div className="lg:col-span-2 space-y-3.5">
          {filteredContainers.length === 0 ? (
            <div className="custom-card p-8 text-center font-mono text-xs text-[var(--text-muted)]">
              No containers match the current search or filter query.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedFilteredContainers).map(([hostId, hostContainers]) => {
                const hostNode = nodes?.find(n => n.id === hostId);
                const hostName = hostNode ? `${hostNode.name} (${hostNode.ip})` : (hostId === 'node-local' ? 'Local Host (127.0.0.1)' : `External Host (${hostId})`);
                const isCollapsed = collapsedGroups[hostId];
                
                return (
                  <div key={hostId} className="space-y-3.5">
                    <div
                      onClick={() => toggleGroupCollapse(hostId)}
                      className="text-[11px] font-mono font-bold text-[var(--color-primary)] tracking-wider uppercase border-b border-[var(--border-card)]/30 pb-1.5 flex items-center justify-between cursor-pointer hover:text-[var(--text-main)] transition-colors select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[var(--color-primary)]" />
                        Host Node: {hostName} ({hostContainers.length} Containers)
                      </div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] font-mono hover:text-[var(--color-primary)]">
                        {isCollapsed ? '[+] EXPAND' : '[-] COLLAPSE'}
                      </span>
                    </div>
                    
                    {!isCollapsed && (() => {
                      const { groups, standalone } = getGroupedContainers(hostContainers);

                      return (
                        <div className="space-y-4">
                          {/* 1. Project Groups */}
                          {Object.entries(groups).map(([groupId, groupContainers]) => {
                            const isProjectCollapsed = collapsedProjects[groupId] ?? false;
                            const isGroupLoading = groupActionLoading[groupId] ?? false;

                            // Combined statistics
                            const totalCpu = groupContainers.reduce((sum, c) => sum + (c.cpu || 0), 0);
                            const totalRam = groupContainers.reduce((sum, c) => sum + (c.ram || 0), 0);
                            const totalMaxRam = groupContainers.reduce((sum, c) => sum + (c.maxRam || 0), 0);

                            // Calculate status
                            const runningCount = groupContainers.filter(c => c.status === 'running' || c.status === 'up' || c.status?.toLowerCase().includes('up')).length;
                            
                            let groupStatusText = 'Stopped';
                            let groupStatusClass = 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
                            if (runningCount === groupContainers.length) {
                              groupStatusText = 'Running';
                              groupStatusClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                            } else if (runningCount > 0) {
                              groupStatusText = `Partial (${runningCount}/${groupContainers.length})`;
                              groupStatusClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                            }

                            return (
                              <div key={groupId} className="custom-card p-4 border border-[var(--border-card)]/50 space-y-3 bg-[var(--bg-card)]/40">
                                {/* Group Header Row */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                  <div className="flex items-center gap-2.5 flex-wrap cursor-pointer select-none" onClick={() => toggleProjectCollapse(groupId)}>
                                    <Layers className="w-4.5 h-4.5 text-[var(--color-secondary)] shrink-0" />
                                    <h3 className="font-mono text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                                      Project Stack: {groupId}
                                    </h3>
                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                      ({groupContainers.length} containers)
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${groupStatusClass}`}>
                                      {groupStatusText}
                                    </span>
                                    {runningCount > 0 && (
                                       <span className="text-[10px] font-mono text-emerald-400">
                                         CPU: <b>{totalCpu.toFixed(1)}%</b> | RAM: <b>{formatRam(totalRam)} / {formatRam(totalMaxRam)}</b>
                                       </span>
                                     )}
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-center">
                                    {/* Play All */}
                                    <button
                                      disabled={isGroupLoading || runningCount === groupContainers.length}
                                      onClick={() => handleGroupAction('start', groupId, groupContainers)}
                                      title="Start All Containers in Project"
                                      className="p-1 px-2 text-[10px] font-mono font-bold rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                                    >
                                      {isGroupLoading ? (
                                        <RotateCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Play className="w-3 h-3" />
                                      )}
                                      START ALL
                                    </button>

                                    {/* Stop All */}
                                    <button
                                      disabled={isGroupLoading || runningCount === 0}
                                      onClick={() => handleGroupAction('stop', groupId, groupContainers)}
                                      title="Stop All Containers in Project"
                                      className="p-1 px-2 text-[10px] font-mono font-bold rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                                    >
                                      {isGroupLoading ? (
                                        <RotateCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Square className="w-3 h-3" />
                                      )}
                                      STOP ALL
                                    </button>

                                    {/* Restart All */}
                                    <button
                                      disabled={isGroupLoading}
                                      onClick={() => handleGroupAction('restart', groupId, groupContainers)}
                                      title="Restart All Containers in Project"
                                      className="p-1 px-2 text-[10px] font-mono font-bold rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                                    >
                                      <RotateCw className={`w-3 h-3 ${isGroupLoading ? 'animate-spin' : ''}`} />
                                      RESTART ALL
                                    </button>

                                    {/* Toggle Collapse */}
                                    <button
                                      onClick={() => toggleProjectCollapse(groupId)}
                                      className="text-[10px] font-mono font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] ml-2"
                                    >
                                      {isProjectCollapsed ? '[+] EXPAND' : '[-] COLLAPSE'}
                                    </button>
                                  </div>
                                </div>

                                {/* Nested Containers list */}
                                {!isProjectCollapsed && (
                                  <div className="border-l-2 border-[var(--color-secondary)]/20 pl-4 space-y-3.5 mt-2 ml-2">
                                    {groupContainers.map(container => renderContainerCard(container, true))}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* 2. Standalone Containers */}
                          {standalone.map(container => renderContainerCard(container, false))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Real-time terminal logs */}
        <div className="custom-card p-4 flex flex-col justify-between min-h-[400px]">
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="border-b border-[var(--border-card)] pb-3">
              <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase block">LIVE LOG MONITOR</span>
              <h3 className="font-mono text-sm font-bold text-[var(--text-main)] mt-0.5 truncate">
                {activeLogsContainer?.name || 'No Container Selected'}
              </h3>
            </div>

            {/* Simulated Live Terminal */}
            <div className="flex-1 bg-black text-emerald-400 font-mono text-[11px] p-3 rounded border border-zinc-900 overflow-y-auto max-h-[350px] space-y-1.5 leading-relaxed">
              <span className="text-zinc-500 block">-- STDOUT/STDERR Console stream connected --</span>
              {activeLogsContainer?.status === 'stopped' ? (
                <span className="text-zinc-600 italic block mt-2">Container is offline. Run container to pipe log output.</span>
              ) : activeLogsContainer?.logs.map((logLine, idx) => (
                <div key={idx} className="break-all whitespace-pre-wrap">
                  {logLine}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-card)] flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)]">
            <span>SOCKET: /var/run/docker.sock</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              CONNECTED
            </span>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmDeleteContainer}
        title="De-register Container"
        message={`Are you sure you want to de-register external container "${confirmDeleteContainer?.name}"?`}
        onConfirm={() => {
          if (confirmDeleteContainer && onRemoveContainer) {
            onRemoveContainer(confirmDeleteContainer.id);
          }
          setConfirmDeleteContainer(null);
        }}
        onCancel={() => setConfirmDeleteContainer(null)}
      />
    </div>
  );
};
