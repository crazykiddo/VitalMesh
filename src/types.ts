/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeType = 'cyber-vitality' | 'bauhaus';
export type ModeType = 'dark' | 'light';
export type LayoutType = 'dense' | 'comfortable' | 'bento';

export interface UserPreferences {
  theme: ThemeType;
  mode: ModeType;
  layout: LayoutType;
  email: string;
  refreshRate: number; // in seconds
  enableNotifications: boolean;
  apiKey: string;
  envName?: string;
  hmacKey?: string;
  alertEmailEnabled?: boolean;
  alertNotifyEnabled?: boolean;
  alertUptimeDown?: boolean;
  alertSslExpire?: boolean;
  alertStorageThreshold?: number;
  alertContainerDown?: boolean;
  alertContainerOverloaded?: boolean;
  moduleMesh?: boolean;
  moduleContainers?: boolean;
  moduleStorage?: boolean;
  moduleUptime?: boolean;
  moduleDomains?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  debugMode?: boolean;
  daemonPollInterval?: number;
  domainCheckInterval?: number;
  httpPingTimeout?: number;
  sshCommandTimeout?: number;
  domainLookupTimeout?: number;
  smtpTimeout?: number;
}

export interface NodeStats {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'alert' | 'offline';
  ip: string;
  cpu: number;
  cpuHistory: number[];
  ramUsed: number;
  ramTotal: number;
  ramHistory: number[];
  temp?: number;
  uptime: string;
  txSpeed?: number;
  rxSpeed?: number;
  sshUsername?: string;
  sshPassword?: string;
  sshKey?: string;
  sshPort?: number;
  isPaused?: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'paused' | 'stopped';
  cpu: number;
  ram: number; // in MB
  maxRam: number; // in MB
  uptime: string;
  ports: string;
  logs: string[];
  nodeId?: string;
  ip?: string;
  url?: string;
  githubUrl?: string;
}

export interface ExternalService {
  id: string;
  name: string;
  url: string;
  status: 'healthy' | 'warning' | 'alert';
  uptimePercentage: number;
  latency: number; // in ms
  history: ('up' | 'down' | 'slow')[]; // 30 entries
  category: string;
}

export interface StorageDisk {
  id: string;
  name: string;
  type: string;
  sizeUsed: number; // TB
  sizeTotal: number; // TB
  health: 'healthy' | 'warning' | 'critical';
  temp: number; // °C
  ip?: string;
  nodeId?: string;
  sshUsername?: string;
  sshPassword?: string;
  sshKey?: string;
  sshPort?: number;
  sshPath?: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERR' | 'AUTH';
  source: string;
  message: string;
}

export interface AlertNotification {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}

export interface DomainModel {
  id: string;
  domainName: string;
  dnsRecords: {
    A?: string[];
    AAAA?: string[];
    MX?: string[];
  };
  sslExpireDate: string;
  sslStatus: 'valid' | 'warning' | 'expired' | 'unknown';
  lastChecked: string;
}
