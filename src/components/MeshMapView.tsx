/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NodeStats } from '../types';
import { Network, Server, HardDrive, Wifi, Activity, ArrowRight, Zap, Pause, Play } from 'lucide-react';

interface MeshMapViewProps {
  nodes: NodeStats[];
  onTogglePauseNode?: (id: string) => void;
}

export const MeshMapView: React.FC<MeshMapViewProps> = ({ nodes, onTogglePauseNode }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(nodes[0]?.id || 'node-local');
  const [packetSent, setPacketSent] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const activeNode = nodes.find(n => n.id === selectedNode) || nodes[0];

  const centerNode = nodes.find(n => n.id === 'node-local') || nodes[0];
  const otherNodes = nodes.filter(n => n.id !== centerNode?.id);

  const otherNodesWithCoords = otherNodes.map((node, index) => {
    const angle = (index * 2 * Math.PI) / otherNodes.length;
    const radius = 35; // percent radius
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { ...node, x, y };
  });

  const triggerPing = (nodeName: string) => {
    setIsPinging(true);
    setPingResult(null);
    setPacketSent(true);

    setTimeout(() => {
      setPacketSent(false);
      setIsPinging(false);
      const latency = Math.round(Math.random() * 20) + 1;
      setPingResult(`Reply from ${activeNode?.ip || '127.0.0.1'}: bytes=32 time=${latency}ms TTL=64`);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          Mesh Map
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
          Interactive network topology, active physical linkages, and packet telemetry
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Topology Map Canvas (Interactive SVG Grid) */}
        <div className="lg:col-span-2 custom-card p-6 flex flex-col justify-between min-h-[380px]">
          <div className="flex justify-between items-center border-b border-[var(--border-card)] pb-3 mb-4">
            <span className="font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
              <Network className="w-4 h-4 text-[var(--color-primary)] animate-pulse" />
              TOPOLOGY ENVELOPE (LOCAL NETWORK MESH)
            </span>
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              {nodes.length} NODE{nodes.length > 1 ? 'S' : ''} MESH
            </span>
          </div>

          {/* Interactive Topology Graph rendering */}
          <div className="relative flex-1 bg-[var(--bg-app)] rounded border border-[var(--border-card)]/50 p-4 flex items-center justify-center overflow-hidden min-h-[300px]">
            {/* SVG Link lines between nodes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: '100%' }}>
              {otherNodesWithCoords.map(node => (
                <line
                  key={`line-${node.id}`}
                  x1="50%"
                  y1="50%"
                  x2={`${node.x}%`}
                  y2={`${node.y}%`}
                  stroke={selectedNode === node.id ? 'var(--color-secondary)' : 'var(--color-primary)'}
                  strokeWidth="2"
                  strokeDasharray={packetSent && selectedNode === node.id ? "4 4" : "none"}
                  className={packetSent && selectedNode === node.id ? "animate-pulse" : ""}
                  opacity="0.8"
                />
              ))}

              {/* Data Telemetry Packets moving on line to selected node */}
              {packetSent && activeNode && activeNode.id !== centerNode?.id && (() => {
                const targetNode = otherNodesWithCoords.find(n => n.id === activeNode.id);
                if (!targetNode) return null;
                return (
                  <>
                    <circle r="4" fill="var(--color-secondary)">
                      <animate attributeName="cx" from="50%" to={`${targetNode.x}%`} dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="cy" from="50%" to={`${targetNode.y}%`} dur="1.2s" repeatCount="indefinite" />
                    </circle>
                    <circle r="3" fill="var(--color-primary)">
                      <animate attributeName="cx" from="50%" to={`${targetNode.x}%`} dur="0.8s" repeatCount="indefinite" />
                      <animate attributeName="cy" from="50%" to={`${targetNode.y}%`} dur="0.8s" repeatCount="indefinite" />
                    </circle>
                  </>
                );
              })()}
            </svg>

            {/* Core Node (Center) */}
            {centerNode && (
              <button
                onClick={() => setSelectedNode(centerNode.id)}
                className="absolute top-[42%] left-[43%] sm:left-[45%] flex flex-col items-center focus:outline-none transition-transform hover:scale-105 z-10"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                  selectedNode === centerNode.id
                    ? 'border-[var(--color-primary)] bg-[var(--bg-card-hover)] glow-cyan'
                    : 'border-[var(--border-card)] bg-[var(--bg-card)]'
                }`}>
                  <Wifi className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <span className="text-[9px] font-mono font-bold text-[var(--text-main)] mt-1.5 bg-[var(--bg-card)] px-1.5 py-0.5 rounded border border-[var(--border-card)] flex flex-col items-center leading-tight">
                  <span>{centerNode.name} (CORE)</span>
                  <span className="text-[8px] text-[var(--text-muted)] font-normal">{centerNode.ip}</span>
                </span>
              </button>
            )}

            {/* Other Nodes (Circular) */}
            {otherNodesWithCoords.map(node => (
              <button
                key={node.id}
                onClick={() => setSelectedNode(node.id)}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className="absolute flex flex-col items-center focus:outline-none transition-transform hover:scale-105 z-10"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 ${
                  selectedNode === node.id
                    ? 'border-[var(--color-primary)] bg-[var(--bg-card-hover)] glow-cyan'
                    : 'border-[var(--border-card)] bg-[var(--bg-card)]'
                }`}>
                  <Server className={`w-5 h-5 ${node.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`} />
                </div>
                <span className="text-[9px] font-mono font-bold text-[var(--text-main)] mt-1 bg-[var(--bg-card)] px-1.5 py-0.2 rounded border border-[var(--border-card)]/50">{node.name}</span>
                <span className="text-[8px] font-mono text-[var(--text-muted)] bg-[var(--bg-card)] px-1 rounded">{node.ip}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-3">
            * Click any hardware node on the envelope to select it, inspect metrics, and transmit simulated diagnostics packets.
          </div>
        </div>

        {/* Selected Node Telemetry details */}
        <div className="custom-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-[var(--border-card)] pb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase block">SELECTED NODE</span>
                <h3 className="font-display text-xl font-bold text-[var(--text-main)] mt-0.5 flex items-center gap-2">
                  {activeNode.name}
                  {activeNode.isPaused ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-mono uppercase font-bold">
                      PAUSED
                    </span>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full ${activeNode.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                  )}
                </h3>
              </div>

              {onTogglePauseNode && (
                <button
                  onClick={() => onTogglePauseNode(activeNode.id)}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeNode.isPaused
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                  title={activeNode.isPaused ? 'Resume live stats collection' : 'Pause live stats collection'}
                >
                  {activeNode.isPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3 text-zinc-400" />}
                  {activeNode.isPaused ? 'RESUME STATS' : 'PAUSE STATS'}
                </button>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-1.5">
                <span className="text-[var(--text-muted)]">PHYSICAL IP</span>
                <span className="text-[var(--text-main)] font-semibold">{activeNode.ip}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-1.5">
                <span className="text-[var(--text-muted)]">CURRENT STATE</span>
                <span className={`font-semibold uppercase ${activeNode.isPaused ? 'text-amber-400' : (activeNode.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400')}`}>
                  {activeNode.isPaused ? 'PAUSED' : activeNode.status}
                </span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-1.5">
                <span className="text-[var(--text-muted)]">SYSTEM UPTIME</span>
                <span className="text-[var(--text-main)] font-semibold">{activeNode.uptime}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-1.5">
                <span className="text-[var(--text-muted)]">CORE TEMPERATURE</span>
                <span className={`font-semibold ${activeNode.temp && activeNode.temp > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {activeNode.temp}°C
                </span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-1.5">
                <span className="text-[var(--text-muted)]">CPU LOAD AVG</span>
                <span className="text-[var(--text-main)] font-semibold">{activeNode.cpu}%</span>
              </div>
              <div className="flex justify-between pb-1.5">
                <span className="text-[var(--text-muted)]">RAM UTILIZATION</span>
                <span className="text-[var(--text-main)] font-semibold">
                  {activeNode.ramUsed} / {activeNode.ramTotal} GB ({Math.round((activeNode.ramUsed / activeNode.ramTotal) * 100)}%)
                </span>
              </div>
            </div>

            {/* Diagnostic Ping tool */}
            <div className="bg-[var(--bg-app)] border border-[var(--border-card)]/50 rounded p-3 mt-4">
              <span className="text-[10px] font-mono font-bold text-[var(--color-primary)] uppercase tracking-wider block mb-2">
                DIAGNOSTICS & TELEMETRY
              </span>
              <button
                disabled={isPinging}
                onClick={() => triggerPing(activeNode.name)}
                className="w-full py-1.5 bg-[var(--color-primary)] text-black rounded text-xs font-mono font-bold hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                {isPinging ? 'Pinging Node...' : `PING ${activeNode.name}`}
              </button>

              {/* Terminal-like output */}
              <div className="bg-black/80 rounded p-2 mt-3 font-mono text-[10px] text-zinc-300 min-h-[50px] border border-[var(--border-card)]/30 flex flex-col justify-center">
                {isPinging ? (
                  <span className="text-cyan-400 animate-pulse">PING {activeNode.ip} with 32 bytes of data...</span>
                ) : pingResult ? (
                  <span className="text-emerald-400">{pingResult}</span>
                ) : (
                  <span className="text-zinc-500 italic">No packet diagnostics transmitted.</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border-card)] flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Activity className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Link quality: <b>10 Gbps SFP+ Fiber</b> (99.98% packet success)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
