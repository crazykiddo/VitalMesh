import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './components/Logo';
import { DashboardView } from './components/DashboardView';
import { MeshMapView } from './components/MeshMapView';
import { ContainersView } from './components/ContainersView';
import { StorageView } from './components/StorageView';
import { UptimeView } from './components/UptimeView';
import { AlertsView } from './components/AlertsView';
import { SettingsView } from './components/SettingsView';
import { UserProfileView } from './components/UserProfileView';
import { LoginView } from './components/LoginView';
import { HelpModal } from './components/HelpModal';
import { DomainView } from './components/DomainView';
import { AboutModal } from './components/AboutModal';

import {
  UserPreferences,
  NodeStats,
  DockerContainer,
  ExternalService,
  StorageDisk,
  SystemLog,
  AlertNotification,
  DomainModel,
} from './types';

import {
  Grid,
  Network,
  Database,
  HardDrive,
  Activity,
  Bell,
  Settings,
  User,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Cpu,
  RefreshCw,
  LogOut,
  HelpCircle,
  AlertTriangle,
  Globe,
  Terminal,
  Info,
} from 'lucide-react';

const formatReadableDate = (isoString: string) => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return isoString;
  }
};

export default function App() {
  //const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.1.0';

  useEffect(() => {
    //document.title = `VitalMesh v${appVersion}`;
    document.title = import.meta.env.DEV
    ? `VitalMesh Dev v${appVersion}`
    : `VitalMesh v${appVersion}`;
  }, [appVersion]);

  useEffect(() => {
    return window.electronAPI?.onNavigate((view) => {
      setActiveView(view);
    });
  }, []);
  // --- Operator User Session State ---
  const [user, setUser] = useState<{ id: string; email: string; firstLogin?: boolean } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // --- Operator User Preferences State ---
  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'cyber-vitality',
    mode: 'dark',
    layout: 'dense',
    email: 'admin@example.com',
    refreshRate: 5,
    enableNotifications: true,
    apiKey: '',
  });

  // --- Core Application Telemetry States (Sourced live from SQLite Database) ---
  const [nodes, setNodes] = useState<NodeStats[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [services, setServices] = useState<ExternalService[]>([]);
  const [disks, setDisks] = useState<StorageDisk[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [domains, setDomains] = useState<DomainModel[]>([]);
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [showDebugModal, setShowDebugModal] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [isMatrixMode, setIsMatrixMode] = useState<boolean>(false);
  const [debugSourceFilter, setDebugSourceFilter] = useState<string>('ALL');

  // --- Real-time Modal-based Alert Notification Queue ---
  const [alertQueue, setAlertQueue] = useState<AlertNotification[]>([]);
  const prevAlertIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}/read`, { method: 'POST' });
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (Array.isArray(data)) setAlerts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAlertQueue(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleAcknowledgeAllModalAlerts = async () => {
    try {
      await fetch('/api/alerts/clear-all', { method: 'POST' });
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (Array.isArray(data)) setAlerts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAlertQueue([]);
    }
  };

  useEffect(() => {
    if (alerts.length > 0) {
      if (isFirstLoad.current) {
        prevAlertIds.current = new Set(alerts.map(a => a.id));
        isFirstLoad.current = false;
        return;
      }

      const newAlerts = alerts.filter(a => !prevAlertIds.current.has(a.id));
      if (newAlerts.length > 0) {
        setAlertQueue(prev => [...prev, ...newAlerts]);
        newAlerts.forEach(a => prevAlertIds.current.add(a.id));
      }
    } else {
      prevAlertIds.current.clear();
    }
  }, [alerts]);

  // 1. Check user authentication state on boot
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data && data.user) {
          setUser(data.user);
        }
      } catch (err) {
        console.error('Error verifying administrator credentials link:', err);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    verifyAuth();
  }, []);

  const safeJsonFetch = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  // 2. Load Telemetry Data from SQLite Database (only if authenticated)
  useEffect(() => {
    if (!user) return;
    const loadDbTelemetry = async () => {
      try {
        const [pref, nds, cnts, svcs, dsks, lgs, alrts, dms] = await Promise.all([
          safeJsonFetch('/api/preferences'),
          safeJsonFetch('/api/nodes'),
          safeJsonFetch('/api/containers'),
          safeJsonFetch('/api/services'),
          safeJsonFetch('/api/disks'),
          safeJsonFetch('/api/logs'),
          safeJsonFetch('/api/alerts'),
          safeJsonFetch('/api/domains'),
        ]);

        if (pref && !pref.error) setPreferences(pref);
        if (Array.isArray(nds)) setNodes(nds);
        if (Array.isArray(cnts)) setContainers(cnts);
        if (Array.isArray(svcs)) setServices(svcs);
        if (Array.isArray(dsks)) setDisks(dsks);
        if (Array.isArray(lgs)) setLogs(lgs);
        if (Array.isArray(alrts)) setAlerts(alrts);
        if (Array.isArray(dms)) setDomains(dms);
      } catch (err) {
        console.error('Error loading full-stack SQLite telemetry data:', err);
      }
    };

    loadDbTelemetry();
  }, [user]);

  // 3. Propagate dark/light mode and graphic schemes instantly to DOM class lists
  useEffect(() => {
    const root = document.documentElement;
    root.className = ''; // reset previous mode classes
    root.classList.add(preferences.mode);
    root.classList.add(`theme-${preferences.theme}`);
  }, [preferences.mode, preferences.theme]);

  useEffect(() => {
    if (!user) return;

    const pollInterval = setInterval(async () => {
      try {
        const [nds, cnts, svcs, lgs, alrts, dsks] = await Promise.all([
          safeJsonFetch('/api/nodes'),
          safeJsonFetch('/api/containers'),
          safeJsonFetch('/api/services'),
          safeJsonFetch('/api/logs'),
          safeJsonFetch('/api/alerts'),
          safeJsonFetch('/api/disks'),
        ]);

        if (Array.isArray(nds)) setNodes(nds);
        if (Array.isArray(cnts)) setContainers(cnts);
        if (Array.isArray(svcs)) setServices(svcs);
        if (Array.isArray(lgs)) setLogs(lgs);
        if (Array.isArray(alrts)) setAlerts(alrts);
        if (Array.isArray(dsks)) setDisks(dsks);
      } catch (err) {
        console.error('Error polling background SQLite telemetry:', err);
      }
    }, preferences.refreshRate * 1000);

    return () => clearInterval(pollInterval);
  }, [preferences.refreshRate, user]);

  // --- Operator Control Handlers connected directly to SQLite ---

  const handleUpdatePreferences = async (updates: Partial<UserPreferences>) => {
    const updatedPref = { ...preferences, ...updates };
    setPreferences(updatedPref); // Optimistic state update for instant snappy UI

    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPref),
      });
      const data = await res.json();
      if (data && !data.error) {
        setPreferences(data);
      }
    } catch (err) {
      console.error('Error saving operator preferences:', err);
    }
  };

  const handleResetPreferences = async () => {
    const def = {
      theme: 'cyber-vitality' as const,
      mode: 'dark' as const,
      layout: 'dense' as const,
      email: 'admin@example.com',
      refreshRate: 5,
      enableNotifications: true,
      apiKey: '',
    };
    setPreferences(def);

    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def),
      });
      const data = await res.json();
      if (data && !data.error) {
        setPreferences(data);
      }
    } catch (err) {
      console.error('Error resetting operator preferences:', err);
    }
  };

  const handleToggleContainer = async (id: string) => {
    try {
      const res = await fetch(`/api/containers/${id}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (data && !data.error) {
        setContainers(prev => prev.map(c => c.id === id ? data : c));
        // Force immediate refresh of system logs console
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error toggling container state:', err);
    }
  };

  const handleRestartContainer = async (id: string) => {
    try {
      const res = await fetch(`/api/containers/${id}/restart`, { method: 'POST' });
      const data = await res.json();
      if (data && !data.error) {
        setContainers(prev => prev.map(c => c.id === id ? data : c));
        // Force immediate refresh of system logs console
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error restarting container:', err);
    }
  };

  const handleAddDisk = async (newDisk: StorageDisk) => {
    try {
      const res = await fetch('/api/disks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDisk),
      });
      const data = await res.json();
      if (data && !data.error) {
        setDisks(prev => [...prev, data]);
        // Force immediate refresh of system logs console
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error initializing ZFS disk pool:', err);
    }
  };

  const handleAddService = async (newService: ExternalService) => {
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newService),
      });
      const data = await res.json();
      if (data && !data.error) {
        setServices(prev => [...prev, data]);
        // Force immediate refresh of system logs console
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error adding uptime monitor target:', err);
    }
  };

  const handleRemoveService = async (id: string) => {
    try {
      const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        setServices(prev => prev.filter(s => s.id !== id));
        // Force immediate refresh of system logs console
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error removing uptime monitor target:', err);
    }
  };

  const handleMarkAlertRead = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/${id}/read`, { method: 'POST' });
      const data = await res.json();
      if (data && !data.error) {
        setAlerts(prev => prev.map(a => a.id === id ? data : a));
      }
    } catch (err) {
      console.error('Error acknowledging system alert:', err);
    }
  };

  const handleClearAllAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/clear-all', { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        setAlerts(prev => prev.map(a => ({ ...a, read: true })));
      }
    } catch (err) {
      console.error('Error clearing all system alerts:', err);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        setLogs([]);
      }
    } catch (err) {
      console.error('Error resetting logger console stream:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Error logging out operator:', err);
    }
  };

  const handleAddNode = async (
    name: string,
    ip: string,
    ramTotal: number,
    sshUsername?: string,
    sshPassword?: string,
    sshKey?: string,
    sshPort?: number
  ) => {
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip, ramTotal, sshUsername, sshPassword, sshKey, sshPort }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setNodes(prev => [...prev, data]);
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error registering external VPS node:', err);
    }
  };

  const handleRemoveNode = async (id: string) => {
    try {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        setNodes(prev => prev.filter(n => n.id !== id));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error removing external node:', err);
    }
  };

  const handleAddContainer = async (name: string, image: string, ports: string, maxRam: number, nodeId?: string, ip?: string, url?: string, githubUrl?: string) => {
    try {
      const res = await fetch('/api/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image, ports, maxRam, nodeId, ip, url, githubUrl }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setContainers(prev => [...prev, data]);
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error registering external docker container:', err);
    }
  };

  const handleRemoveContainer = async (id: string) => {
    try {
      const res = await fetch(`/api/containers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        setContainers(prev => prev.filter(c => c.id !== id));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error removing external container:', err);
    }
  };

  const handleEditNode = async (
    id: string,
    name: string,
    ip: string,
    ramTotal: number,
    sshUsername?: string,
    sshPassword?: string,
    sshKey?: string,
    sshPort?: number
  ) => {
    try {
      const res = await fetch(`/api/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip, ramTotal, sshUsername, sshPassword, sshKey, sshPort }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error editing VPS node:', err);
    }
  };

  const handleTogglePauseNode = async (id: string) => {
    try {
      const res = await fetch(`/api/nodes/${id}/toggle-pause`, { method: 'POST' });
      const data = await res.json();
      if (data && !data.error) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, isPaused: data.isPaused } : n));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error toggling pause state for node:', err);
    }
  };

  const handleAddDomain = async (domainName: string) => {
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName })
      });
      const data = await res.json();
      if (data && !data.error) {
        setDomains(prev => [...prev, data]);
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error adding domain:', err);
    }
  };

  const handleEditDomain = async (id: string, domainName: string) => {
    try {
      const res = await fetch(`/api/domains/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName })
      });
      const data = await res.json();
      if (data && !data.error) {
        setDomains(prev => prev.map(d => d.id === id ? data : d));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error editing domain:', err);
    }
  };

  const handleRemoveDomain = async (id: string) => {
    try {
      const res = await fetch(`/api/domains/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data && data.success) {
        setDomains(prev => prev.filter(d => d.id !== id));
      }
    } catch (err) {
      console.error('Error removing domain:', err);
    }
  };

  const handleCheckDomain = async (id: string) => {
    try {
      const res = await fetch(`/api/domains/${id}/check`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data && !data.error) {
        setDomains(prev => prev.map(d => d.id === id ? data : d));
      }
    } catch (err) {
      console.error('Error checking domain:', err);
    }
  };

  const handleEditContainer = async (id: string, name: string, image: string, ports: string, maxRam: number, nodeId?: string, ip?: string, url?: string, githubUrl?: string) => {
    try {
      const res = await fetch(`/api/containers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image, ports, maxRam, nodeId, ip, url, githubUrl }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setContainers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error editing Docker container:', err);
    }
  };

  const handleEditDisk = async (
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
  ) => {
    try {
      const res = await fetch(`/api/disks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          sizeTotal,
          ip,
          nodeId,
          sshUsername,
          sshPassword,
          sshKey,
          sshPort,
          sshPath
        }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setDisks(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error editing storage disk:', err);
    }
  };

  const handleRemoveDisk = async (id: string) => {
    try {
      const res = await fetch(`/api/disks/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        setDisks(prev => prev.filter(d => d.id !== id));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error removing storage pool:', err);
    }
  };

  const handleEditService = async (id: string, name: string, url: string, category: string) => {
    try {
      const res = await fetch(`/api/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, category }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
        const lgs = await fetch('/api/logs').then(r => r.json());
        if (Array.isArray(lgs)) setLogs(lgs);
      }
    } catch (err) {
      console.error('Error editing external service:', err);
    }
  };

  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  // --- Render Views Mapping ---
  const renderActiveViewContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView
            nodes={nodes}
            containers={containers}
            services={services}
            disks={disks}
            logs={logs}
            alerts={alerts}
            domains={domains}
            preferences={preferences}
            onNavigate={setActiveView}
            onToggleContainer={handleToggleContainer}
            onTogglePauseNode={handleTogglePauseNode}
            onAddNode={handleAddNode}
            onRemoveNode={handleRemoveNode}
            onEditNode={handleEditNode}
          />
        );
      case 'map':
        return <MeshMapView nodes={nodes} onTogglePauseNode={handleTogglePauseNode} />;
      case 'containers':
        return (
          <ContainersView
            containers={containers}
            nodes={nodes}
            onToggleContainer={handleToggleContainer}
            onRestartContainer={handleRestartContainer}
            onAddContainer={handleAddContainer}
            onRemoveContainer={handleRemoveContainer}
            onEditContainer={handleEditContainer}
          />
        );
      case 'storage':
        return <StorageView disks={disks} nodes={nodes} onAddDisk={handleAddDisk} onEditDisk={handleEditDisk} onRemoveDisk={handleRemoveDisk} />;
      case 'uptime':
        return (
          <UptimeView
            services={services}
            onAddService={handleAddService}
            onRemoveService={handleRemoveService}
            onEditService={handleEditService}
          />
        );
      case 'domains':
        return (
          <DomainView
            domains={domains}
            onAddDomain={handleAddDomain}
            onEditDomain={handleEditDomain}
            onRemoveDomain={handleRemoveDomain}
            onCheckDomain={handleCheckDomain}
          />
        );
      case 'alerts':
        return (
          <AlertsView
            logs={logs}
            alerts={alerts}
            onMarkAlertRead={handleMarkAlertRead}
            onClearAllAlerts={handleClearAllAlerts}
            onClearLogs={handleClearLogs}
          />
        );
      case 'settings':
        return (
          <SettingsView
            preferences={preferences}
            onUpdatePreferences={handleUpdatePreferences}
            onResetPreferences={handleResetPreferences}
          />
        );
      case 'user':
        return (
          <UserProfileView
            preferences={preferences}
            onUpdatePreferences={handleUpdatePreferences}
            user={user}
            onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : null)}
          />
        );
      default:
        return <div>View not implemented.</div>;
    }
  };

  // Main menu items helper
  const MAIN_NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: Grid },
    ...(preferences.moduleMesh ?? true ? [{ id: 'map', label: 'Mesh Map', icon: Network }] : []),
    ...(preferences.moduleContainers ?? true ? [{ id: 'containers', label: 'Containers', icon: Database }] : []),
    ...(preferences.moduleStorage ?? true ? [{ id: 'storage', label: 'Storage', icon: HardDrive }] : []),
    ...(preferences.moduleUptime ?? true ? [{ id: 'uptime', label: 'Uptime', icon: Activity }] : []),
    ...(preferences.moduleDomains ?? true ? [{ id: 'domains', label: 'Domains', icon: Globe }] : []),
  ];

  const BOTTOM_NAV_ITEMS = [
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: unreadAlertsCount },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'user', label: 'User', icon: User },
  ];

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] text-[#00f0ff] font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">VERIFYING OPERATOR SIGNATURE LINK...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={(u) => setUser(u)} theme={preferences.theme} mode={preferences.mode} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      {user.firstLogin && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 p-3 text-center text-xs font-mono text-amber-400 flex items-center justify-center gap-2 z-50">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-400 animate-pulse shrink-0" />
          <span>
            <strong>SECURITY WARNING:</strong> You are currently using default system credentials. Please visit the 
            <button onClick={() => setActiveView('user')} className="mx-1 font-bold underline hover:text-amber-300 cursor-pointer">
              Operator Profile
            </button> 
            page immediately to update your email and password.
          </span>
        </div>
      )}
      <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-300 flex-1">
      {/* 1. DESKTOP SIDEBAR NAVIGATION (md and larger screens) */}
      <aside className={`hidden md:flex flex-col justify-between shrink-0 bg-[var(--bg-card)] border-r border-[var(--border-card)] h-screen sticky top-0 z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
        <div className="flex flex-col h-full justify-between">
          <div>
            <div className={`p-4 border-b border-[var(--border-card)] flex flex-col ${sidebarCollapsed ? 'items-center justify-center p-2.5' : ''}`}>
              <Logo showText={!sidebarCollapsed} glowing={preferences.theme === 'cyber-vitality' && preferences.mode === 'dark'} />
              {!sidebarCollapsed && preferences.envName && (
                <div className="mt-1.5 text-[9px] font-mono font-bold text-[var(--color-primary)] uppercase tracking-wider select-none truncate">
                  ENV: {preferences.envName}
                </div>
              )}

              {/* Status capsule */}
              {sidebarCollapsed ? (
                <div className="mt-4 flex justify-center" title="SYSTEM ONLINE">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
              ) : (
                <div className="mt-4 p-2 bg-[var(--bg-app)] border border-[var(--border-card)]/50 rounded flex items-center justify-between font-mono text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[var(--text-muted)] uppercase tracking-wider">SYSTEM STATE</span>
                  </div>
                  <span className="text-emerald-400 font-bold">ONLINE</span>
                </div>
              )}
            </div>

            {/* Middle main navigation links */}
            <nav className={`p-3 space-y-1.5 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
              {MAIN_NAV_ITEMS.map(item => {
                const IconComp = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center rounded text-xs font-mono font-bold uppercase transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                    } ${
                      isActive
                        ? 'bg-[var(--color-primary)] text-black font-extrabold glow-cyan border border-[var(--color-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComp className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-[var(--color-primary)]'}`} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && isActive && <ChevronRight className="w-3 h-3 text-black" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom navigation links containing Alerts, Settings, User */}
          <div className={`border-t border-[var(--border-card)]/60 bg-[var(--bg-app)]/30 space-y-1.5 ${
            sidebarCollapsed ? 'p-2 flex flex-col items-center' : 'p-3'
          }`}>
            {/* Active Operator & Theme controls above OPERATIONS */}
            {sidebarCollapsed ? (
              <div className="pb-2 mb-1 border-b border-[var(--border-card)]/40 flex flex-col items-center gap-2">
                <button
                  onClick={() => setActiveView('user')}
                  title={`Operator: ${preferences.email}`}
                  className="p-1.5 rounded hover:bg-[var(--bg-card-hover)] text-[var(--color-primary)] cursor-pointer"
                >
                  <User className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleUpdatePreferences({ mode: preferences.mode === 'dark' ? 'light' : 'dark' })}
                  title={preferences.mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  className="p-1.5 rounded hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  {preferences.mode === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                </button>
              </div>
            ) : (
              <div className="p-2.5 mb-2 bg-[var(--bg-card)]/60 border border-[var(--border-card)]/40 rounded flex items-center justify-between font-mono">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">OPERATOR</span>
                  <span
                    onClick={() => setActiveView('user')}
                    className="text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer truncate max-w-[135px]"
                    title={preferences.email}
                  >
                    {preferences.email}
                  </span>
                </div>

                <button
                  onClick={() => handleUpdatePreferences({ mode: preferences.mode === 'dark' ? 'light' : 'dark' })}
                  title={preferences.mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-card)]/50 hover:border-[var(--color-primary)] transition-all cursor-pointer shrink-0"
                >
                  {preferences.mode === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-400" />
                  )}
                </button>
              </div>
            )}

            {!sidebarCollapsed && (
              <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase block px-3 mb-1">
                OPERATIONS
              </span>
            )}

            {BOTTOM_NAV_ITEMS.map(item => {
              const IconComp = item.icon;
              const isActive = activeView === item.id;
              let activeTextColor = 'text-[var(--color-secondary)]';

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded text-xs font-mono font-bold uppercase transition-all duration-150 ${
                    sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                  } ${
                    isActive
                      ? 'bg-[var(--color-secondary)] text-black font-extrabold glow-pink border border-[var(--color-secondary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <IconComp className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : activeTextColor}`} />
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className={`absolute -top-1 -right-1.5 bg-rose-500 text-white rounded-full text-[8px] font-mono px-1 font-bold ${
                          sidebarCollapsed ? '' : 'animate-pulse'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && isActive && <ChevronRight className="w-3 h-3 text-black" />}
                </button>
              );
            })}

            {preferences.debugMode && (
              <button
                onClick={() => setShowDebugModal(true)}
                title={sidebarCollapsed ? "Debug Console" : undefined}
                className={`w-full flex items-center justify-between rounded text-xs font-mono font-bold uppercase transition-all duration-150 px-3 py-2 text-amber-400 hover:text-amber-300 hover:bg-[var(--bg-card-hover)] ${
                  sidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 shrink-0 text-amber-400" />
                  {!sidebarCollapsed && <span>Debug (logs)</span>}
                </div>
              </button>
            )}

            {/* About / Help / Sign Out references */}
            {sidebarCollapsed ? (
              <div className="pt-2 border-t border-[var(--border-card)]/40 w-full flex flex-col items-center gap-2.5 text-[var(--text-muted)]">
                <button onClick={() => setShowHelpModal(true)} title="Help" className="hover:text-[var(--color-primary)] cursor-pointer">
                  <HelpCircle className="w-4 h-4" />
                </button>
                <button onClick={() => setShowAboutModal(true)} title="About VitalMesh" className="hover:text-[var(--color-primary)] cursor-pointer">
                  <Info className="w-4 h-4 text-[var(--color-primary)]" />
                </button>
                <button onClick={handleLogout} title="Sign Out" className="hover:text-rose-400 cursor-pointer">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="pt-3 border-t border-[var(--border-card)]/40 flex justify-between text-[10px] font-mono text-[var(--text-muted)] px-3">
                <span onClick={() => setShowHelpModal(true)} className="hover:text-[var(--color-primary)] cursor-pointer">Help</span>
                <span onClick={() => setShowAboutModal(true)} className="hover:text-[var(--color-primary)] text-[var(--color-primary)] font-bold cursor-pointer">About</span>
                <span onClick={handleLogout} className="hover:text-rose-400 cursor-pointer flex items-center gap-1">
                  <LogOut className="w-3 h-3" /> Out
                </span>
              </div>
            )}

            {/* Collapse/Expand Toggle Trigger */}
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center p-2 mt-2 bg-[var(--bg-app)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]/40 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all cursor-pointer font-mono text-[9px] uppercase font-bold"
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4 text-[var(--color-primary)] animate-pulse" />
              ) : (
                <div className="flex items-center gap-1.5">
                  <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>COLLAPSE MENU</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MOBILE TOP NAVIGATION BAR (<md size) */}
      <header className="flex md:hidden items-center justify-between p-4 bg-[var(--bg-card)] border-b border-[var(--border-card)] sticky top-0 z-40">
        <div className="flex flex-col">
          <Logo size={30} textSize="text-lg" glowing={preferences.theme === 'cyber-vitality' && preferences.mode === 'dark'} />
          {preferences.envName && (
            <span className="text-[8px] font-mono text-[var(--color-primary)] uppercase tracking-wider mt-0.5 pl-1 truncate max-w-[150px]">
              ENV: {preferences.envName}
            </span>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-card)]/50 hover:border-[var(--color-primary)] transition-all animate-pulse"
            title="Walkthrough Help"
          >
            <HelpCircle className="w-4 h-4 text-[var(--color-primary)]" />
          </button>
          {/* Audio-visual Notification trigger badge */}
          <button
            onClick={() => setActiveView('alerts')}
            className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-card)]/50 relative hover:border-[var(--color-primary)] transition-all"
          >
            <Bell className="w-4 h-4 text-[var(--color-secondary)]" />
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[8px] font-mono text-white flex items-center justify-center font-bold">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* Dark / Light toggle */}
          <button
            onClick={() => handleUpdatePreferences({ mode: preferences.mode === 'dark' ? 'light' : 'dark' })}
            className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-card)]/50 hover:border-[var(--color-primary)] transition-all"
          >
            {preferences.mode === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400" />
            )}
          </button>
        </div>
      </header>

      {/* 3. MAIN WORKSPACE CONTAINER */}
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
        {/* Dynamic active view content rendering */}
        <div className={`transition-opacity duration-200`}>
          {renderActiveViewContent()}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM FIXED TAB BAR (<md size) */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--border-card)] py-2.5 px-1.5 z-40 overflow-x-auto flex items-center justify-around gap-1">
        {[...MAIN_NAV_ITEMS, ...BOTTOM_NAV_ITEMS].map(item => {
          const IconComp = item.icon;
          const isActive = activeView === item.id;
          let activeTextColor = 'text-[var(--color-primary)]';
          if (item.id === 'alerts' || item.id === 'settings' || item.id === 'user') {
            activeTextColor = 'text-[var(--color-secondary)]';
          }

          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex flex-col items-center justify-center flex-1 min-w-[50px] transition-colors focus:outline-none`}
            >
              <div className="relative">
                <IconComp className={`w-5 h-5 ${isActive ? activeTextColor : 'text-[var(--text-muted)]'}`} />
                {/* Badge count for alerts */}
                {item.id === 'alerts' && unreadAlertsCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white rounded-full text-[8px] font-mono px-1 font-bold animate-bounce">
                    {unreadAlertsCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-mono mt-1 ${isActive ? 'text-[var(--text-main)] font-bold' : 'text-[var(--text-muted)]'}`}>
                {item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </footer>
      {/* Real-time System Alerts Queue Modal */}
      {alertQueue.length > 0 && (() => {
        const currentAlert = alertQueue[0];
        let alertColor = 'text-blue-400 border-blue-500/30 bg-blue-950/20';
        let alertIconColor = 'text-blue-400';
        if (currentAlert.level === 'error') {
          alertColor = 'text-rose-400 border-rose-500/30 bg-rose-950/20';
          alertIconColor = 'text-rose-400';
        } else if (currentAlert.level === 'warning') {
          alertColor = 'text-amber-400 border-amber-500/30 bg-amber-950/20';
          alertIconColor = 'text-amber-400';
        }

        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0b0f19] border border-rose-500/30 rounded-lg max-w-lg w-full shadow-[0_0_50px_rgba(244,63,94,0.2)] overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center bg-[#070b13] px-5 py-4 border-b border-[var(--border-card)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${alertIconColor}`} />
                  <h3 className={`font-mono text-sm font-bold uppercase tracking-wider ${alertIconColor}`}>
                    SYSTEM ALERT DETECTED
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {alertQueue.length} Pending
                </span>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <h4 className="font-mono text-sm font-bold text-zinc-100 uppercase tracking-wide">
                    {currentAlert.title}
                  </h4>
                  <div className={`p-4 rounded border text-xs font-mono leading-relaxed whitespace-pre-wrap ${alertColor}`}>
                    {currentAlert.message}
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-card)]/40 pt-3">
                  <span>Source: {currentAlert.id?.includes('storage') ? 'STORAGE' : 'DAEMON'}</span>
                  <span>Received: {formatReadableDate(currentAlert.timestamp)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center bg-[#070b13] px-5 py-3 border-t border-[var(--border-card)]">
                <button
                  onClick={handleAcknowledgeAllModalAlerts}
                  className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900 border border-rose-500/30 text-rose-400 rounded text-[10px] font-mono font-bold transition-all cursor-pointer"
                >
                  ACKNOWLEDGE ALL ({alertQueue.length})
                </button>
                <button
                  onClick={() => handleAcknowledgeAlert(currentAlert.id)}
                  className="px-4 py-1.5 bg-[var(--color-primary)] text-black rounded text-[10px] font-mono font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  ACKNOWLEDGE & CLOSE
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      
      {/* Big Operations Debug Modal */}
      {showDebugModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col w-screen h-screen">
          <div className="bg-[#0b0f19] w-full h-full flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-[#070b13] px-5 py-4 border-b border-[var(--border-card)]">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <h3 className="font-mono text-sm font-bold text-amber-400 uppercase tracking-wider">
                  SYSTEM DEBUG LOGS (OPERATIONS)
                </h3>
              </div>
              <button
                onClick={() => setShowDebugModal(false)}
                className="text-zinc-500 hover:text-white font-mono text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 flex flex-col min-h-0 bg-black/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <p className="text-[11px] font-mono text-[var(--text-muted)] leading-relaxed">
                  Live output stream from VitalMesh collector daemon thread and HTTP endpoint responders. Enabled under Settings.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase shrink-0">Filter Service:</span>
                  <select
                    value={debugSourceFilter}
                    onChange={(e) => setDebugSourceFilter(e.target.value)}
                    className="bg-[var(--bg-app)] text-[10px] font-mono text-[var(--text-main)] border border-[var(--border-card)] p-1 rounded focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
                  >
                    <option value="ALL">ALL SERVICES</option>
                    {Array.from(new Set(logs.map(l => l.source).filter(Boolean))).map(src => (
                      <option key={src} value={src}>{src.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Console log list */}
              <div className="bg-black border border-zinc-900 rounded p-4 font-mono text-[11px] flex-1 overflow-y-auto space-y-2 select-text text-zinc-300">
                {(() => {
                  const filteredLogs = logs.filter(l => debugSourceFilter === 'ALL' ? true : l.source === debugSourceFilter);
                  return filteredLogs.length === 0 ? (
                    <div className="text-zinc-600 italic text-center py-12">
                      No logs matching filter "{debugSourceFilter}".
                    </div>
                  ) : (
                    filteredLogs.map(log => {
                      let levelClass = 'text-cyan-400';
                      if (log.level === 'WARN') levelClass = 'text-amber-400 font-bold';
                      if (log.level === 'ERR') levelClass = 'text-rose-500 font-bold';
                      if (log.level === 'DEBUG') levelClass = 'text-purple-400 font-bold';
                      if (log.level === 'AUTH') levelClass = 'text-indigo-400 font-bold';

                      return (
                        <div key={log.id} className="flex items-start gap-2 border-b border-zinc-900/30 pb-1.5 last:border-0 last:pb-0">
                          <span className="text-zinc-600 select-none shrink-0">[{formatReadableDate(log.timestamp)}]</span>
                          <span className={`w-14 shrink-0 text-[10px] ${levelClass}`}>[{log.level}]</span>
                          <span className="text-zinc-500 shrink-0 select-none">[{log.source}]:</span>
                          <span className="text-zinc-200 break-all">{log.message}</span>
                        </div>
                      );
                    })
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center bg-[#070b13] px-5 py-3 border-t border-[var(--border-card)]">
              <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">
                VitalMesh Engine • debugMode=active
              </span>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete all recorded logs from the SQLite database?")) {
                      await handleClearLogs();
                    }
                  }}
                  className="px-3 py-1 bg-rose-900/60 border border-rose-500/30 text-rose-400 rounded text-[10px] font-mono font-bold hover:bg-rose-900/80 transition-all cursor-pointer"
                >
                  CLEAR LOGS
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/logs').then(r => r.json());
                    if (Array.isArray(res)) setLogs(res);
                  }}
                  className="px-3 py-1 bg-[var(--color-primary)] text-black rounded text-[10px] font-mono font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  REFRESH
                </button>
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded text-[10px] font-mono font-bold hover:bg-zinc-700 transition-all cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About System Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        preferences={preferences}
        onToggleMatrixMode={() => setIsMatrixMode(!isMatrixMode)}
        isMatrixMode={isMatrixMode}
      />
    </div>
    </div>
  );
}
