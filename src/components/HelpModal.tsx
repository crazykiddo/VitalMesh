/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, HelpCircle, ShieldCheck, Database, HardDrive, Cpu, Activity, Settings, Layers } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-card)] flex justify-between items-center bg-[var(--bg-app)]/40">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[var(--color-primary)]" />
            <span className="font-mono text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
              VitalMesh Homelab Walkthrough & Guide
            </span>
          </div>
          <button 
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-rose-400 transition-colors p-1 rounded hover:bg-zinc-800/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs font-mono leading-relaxed text-zinc-300">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-primary)] border-b border-[var(--border-card)]/50 pb-1 mb-2 uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> 1. Secure User Authentication
            </h3>
            <p>
              VitalMesh homelab orchestrator is secured via cookie-based user sessions. 
              Credentials are validated and checked using SHA-256 password hashing.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Default supervisor email: <b className="text-[var(--text-main)]">admin@example.com</b></li>
              <li>Default login password: <b className="text-[var(--text-main)]">admin</b></li>
              <li>Session management: Cookie-based. Logging out deletes session records.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--color-primary)] border-b border-[var(--border-card)]/50 pb-1 mb-2 uppercase flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> 2. Real Telemetry & VPS Nodes
            </h3>
            <p>
              Host CPU, RAM, and Temperature metrics are read in real time on the backend.
              You can register external VPS Linux nodes to compile distributed node statistics.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Registering: Click <b className="text-[var(--color-primary)]">+ REGISTER NODE</b> in the dashboard header.</li>
              <li>RAM capacities generated dynamically from 2 GB to 64 GB in steps of 2.</li>
              <li>Delete node: Click <b className="text-rose-400">×</b> on a VPS node card.</li>
              <li>VPS online status: Monitored via backend network ping tests.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--color-primary)] border-b border-[var(--border-card)]/50 pb-1 mb-2 uppercase flex items-center gap-1.5">
              <Database className="w-4 h-4" /> 3. Docker Container Infrastructure
            </h3>
            <p>
              VitalMesh reads active container statuses from local and external daemons.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Provision Container: Click <b className="text-[var(--color-primary)]">+ PROVISION CONTAINER</b> in Containers tab.</li>
              <li>Group by Host: Containers are grouped by their parent host node.</li>
              <li>Foldable Groups: Click any host group header to collapse/expand its containers.</li>
              <li>Linked host monitoring: If a parent host node goes offline, all its associated containers are marked stopped automatically.</li>
            </ul>
          </div>

          <div className="p-3 bg-zinc-950/40 border border-amber-500/20 rounded text-[11px] text-amber-400/90 space-y-2.5">
            <div>
              <span className="font-bold block mb-1">💡 OPTION A: REMOTE DOCKER TCP SOCKET:</span>
              To monitor containers on remote nodes (like VPS with aaPanel) via TCP API:
              <ol className="list-decimal pl-4 mt-1 space-y-1 text-[10px]">
                <li>Edit <code className="text-zinc-300">/lib/systemd/system/docker.service</code> on your VPS:</li>
                <li>Modify the ExecStart line to append: <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300">-H tcp://0.0.0.0:2375</code></li>
                <li>Reload systemd & restart Docker: <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300">systemctl daemon-reload && systemctl restart docker</code></li>
                <li>In your VPS and aaPanel firewalls, make sure TCP port <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300">2375</code> is open.</li>
              </ol>
            </div>
            <div className="border-t border-amber-500/10 pt-2">
              <span className="font-bold block mb-1">💡 OPTION B: DOCKER CLI CONTEXT (RECOMMENDED):</span>
              Configure a secure SSH-tunnel context routing for VitalMesh background updates:
              <ol className="list-decimal pl-4 mt-1 space-y-1 text-[10px]">
                <li>Register context on host machine: <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300">docker context create vps --docker "host=ssh://root@IP_OR_HOSTNAME"</code></li>
                <li>Ensure SSH key auth is active so no password prompt halts the server.</li>
                <li>Activate context routing: <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300">docker context use vps</code> to link statistics automatically!</li>
              </ol>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--color-primary)] border-b border-[var(--border-card)]/50 pb-1 mb-2 uppercase flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" /> 4. Storage & Disks core
            </h3>
            <p>
              Monitor local ZFS SSD pools, NFS Network shares, SMB/CIFS shares, or EXT4 VPS volumes.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Group by Host: Storage disk pools are dynamically grouped by node locations.</li>
              <li>Foldable Groups: Click any host header on Storage page to collapse/expand pools.</li>
              <li>IP Ping Check: External pools (NFS, SMB, VPS) are pinged by their IPs. If unreachable, health is set to <b className="text-rose-500 uppercase">critical</b>.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--color-primary)] border-b border-[var(--border-card)]/50 pb-1 mb-2 uppercase flex items-center gap-1.5">
              <Activity className="w-4 h-4" /> 5. Service Latency & Uptime Wave
            </h3>
            <p>
              Health parameters of websites and APIs are verified using active pings. 
              The dashboard computes 30-day reliability wave blocks showing active or high-latency incidents.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-card)] flex justify-between items-center bg-[var(--bg-app)]/40">
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            VITALMESH ORCHESTRATOR v1.4
          </span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--color-primary)] text-black rounded font-mono text-xs font-bold hover:opacity-90 active:scale-98 transition-all cursor-pointer"
          >
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
};
