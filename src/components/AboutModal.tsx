/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Shield, Cpu, Database, Server, Activity, Terminal, Sparkles, Layers, Zap, Radio, Globe } from 'lucide-react';
import { UserPreferences } from '../types';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences?: UserPreferences;
  onToggleMatrixMode?: () => void;
  isMatrixMode?: boolean;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onToggleMatrixMode,
  isMatrixMode = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  // Interactive Cyber Mesh Canvas Animation
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 500);
    let height = (canvas.height = 180);

    const handleResize = () => {
      if (canvas && canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = 180;
      }
    };
    window.addEventListener('resize', handleResize);

    // Generate random nodes
    const numNodes = 24;
    const nodes = Array.from({ length: numNodes }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2.5 + 1.5,
      color: Math.random() > 0.3 ? '#38bdf8' : '#818cf8',
    }));

    // Generate traveling data pulses
    const pulses: Array<{
      from: number;
      to: number;
      progress: number;
      speed: number;
    }> = [];

    const addPulse = () => {
      if (nodes.length < 2) return;
      const from = Math.floor(Math.random() * nodes.length);
      let to = Math.floor(Math.random() * nodes.length);
      while (to === from) to = Math.floor(Math.random() * nodes.length);
      pulses.push({ from, to, progress: 0, speed: Math.random() * 0.02 + 0.01 });
    };

    const pulseInterval = setInterval(addPulse, 400);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.35 * (1 - dist / 110)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Draw traveling pulses
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p];
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) {
          pulses.splice(p, 1);
          continue;
        }

        const n1 = nodes[pulse.from];
        const n2 = nodes[pulse.to];
        const px = n1.x + (n2.x - n1.x) * pulse.progress;
        const py = n1.y + (n2.y - n1.y) * pulse.progress;

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Move & draw nodes
      nodes.forEach(node => {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(pulseInterval);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerManualPulse = () => {
    setPulseCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl shadow-2xl overflow-hidden text-[var(--text-main)] max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-card)] bg-[var(--bg-app)]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[var(--color-primary)]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-[var(--text-main)] flex items-center gap-2">
                VitalMesh Console
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 text-[var(--color-primary)] uppercase">
                  v2.0.0 Pro
                </span>
              </h2>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                Autonomous Telemetry & Multi-Node Infrastructure Grid
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Cool Interactive Cyber Mesh Visualizer */}
          <div className="relative rounded-lg border border-[var(--border-card)] bg-black/40 overflow-hidden group">
            <canvas ref={canvasRef} className="w-full h-[180px] block" />
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/10 px-2.5 py-1 rounded text-[10px] font-mono text-cyan-300">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              CYBER MESH MATRIX TELEMETRY (LIVE)
            </div>

            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <button
                onClick={triggerManualPulse}
                className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                PULSE DATA ({pulseCount})
              </button>

              {onToggleMatrixMode && (
                <button
                  onClick={onToggleMatrixMode}
                  className={`px-2.5 py-1 rounded border text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 ${
                    isMatrixMode
                      ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  {isMatrixMode ? 'DISABLE MATRIX MODE' : 'MATRIX MODE'}
                </button>
              )}
            </div>
          </div>

          {/* System Specs & Architecture Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[var(--bg-app)]/60 border border-[var(--border-card)]/60 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--color-primary)]">
                <Cpu className="w-4 h-4 text-[var(--color-primary)]" />
                SYSTEM RUNTIME ENGINE
              </div>
              <ul className="text-[11px] font-mono text-[var(--text-muted)] space-y-1 pl-1">
                <li>• <b>Runtime:</b> Node.js & Express API Server</li>
                <li>• <b>Database:</b> LibSQL SQLite Embedded Client</li>
                <li>• <b>Frontend:</b> React 18, Vite & Tailwind CSS</li>
                <li>• <b>SSH Engine:</b> Asynchronous `ssh2` Client</li>
              </ul>
            </div>

            <div className="p-4 bg-[var(--bg-app)]/60 border border-[var(--border-card)]/60 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--color-secondary)]">
                <Layers className="w-4 h-4 text-[var(--color-secondary)]" />
                MODULE SUBSYSTEMS
              </div>
              <ul className="text-[11px] font-mono text-[var(--text-muted)] space-y-1 pl-1">
                <li>• <b>Mesh Map:</b> Topography & VPS Host SSH Metrics</li>
                <li>• <b>Containers:</b> Local & Remote Docker Engine</li>
                <li>• <b>Storage:</b> ZFS, NTFS & Remote Volume Telemetry</li>
                <li>• <b>Uptime & Domains:</b> TLS SSL & DNS Resolver</li>
              </ul>
            </div>
          </div>

          {/* Platform Environment Details */}
          <div className="p-4 bg-[var(--bg-app)] border border-[var(--border-card)]/40 rounded-lg space-y-2 font-mono text-xs">
            <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-2">
              <span className="text-[var(--text-muted)]">OPERATING ENVIRONMENT</span>
              <span className="font-bold text-[var(--text-main)]">{preferences?.envName || 'VitalMesh Homelab'}</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-2">
              <span className="text-[var(--text-muted)]">API SECURITY KEY</span>
              <span className="font-mono text-[var(--color-primary)]">{preferences?.apiKey ? `${preferences.apiKey.slice(0, 12)}...` : 'vt_live_***'}</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border-card)]/30 pb-2">
              <span className="text-[var(--text-muted)]">HOST OS TARGET</span>
              <span className="text-emerald-400 font-semibold">Linux (Rocky 8 / aaPanel / Ubuntu) & Windows</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">LICENSE</span>
              <span className="text-[var(--text-main)]">Apache-2.0 License</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-card)] bg-[var(--bg-app)]/50 flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)]">
          <span>VitalMesh Console © 2026. All rights reserved.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--color-primary)] text-black font-bold rounded hover:opacity-90 transition-all cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
