/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createClient, Client } from '@libsql/client';
import AdmZip from 'adm-zip';
import { Client as SshClient } from 'ssh2';
import crypto from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import dns from 'dns';
import tls from 'tls';

const execAsync = promisify(exec);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3007;

let dbClient: Client;

const oracleIP = '192.168.0.1';
const oracleName = 'nameof-vps';

function rowToPlainObject(row: any, columns: string[]): any {
  if (!row) return undefined;
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    let val: any;
    if (typeof row === 'object' && row !== null) {
      if (col in row && row[col] !== undefined) {
        val = row[col];
      } else if (i in row && row[i] !== undefined) {
        val = row[i];
      } else {
        val = row[col];
      }
    } else {
      val = row[i];
    }
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  }
  return obj;
}

const db = {
  get: async (sql: string, params: any = []): Promise<any> => {
    const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
    const res = await dbClient.execute({ sql, args: p });
    if (!res.rows || res.rows.length === 0) return undefined;
    return rowToPlainObject(res.rows[0], res.columns);
  },
  all: async (sql: string, params: any = []): Promise<any[]> => {
    const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
    const res = await dbClient.execute({ sql, args: p });
    return res.rows.map(row => rowToPlainObject(row, res.columns));
  },
  run: async (sql: string, params: any = []): Promise<any> => {
    const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
    const res = await dbClient.execute({ sql, args: p });
    return {
      changes: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
    };
  },
  exec: async (sql: string): Promise<any> => {
    return dbClient.executeMultiple(sql);
  }
};

let lastDomainCheckTime = 0;
let lastRemoteSyncTime = 0;
let contextSyncedNames = new Set<string>();
let transitionLocks = new Map<string, number>();

const activeStorageAlerts = new Set<string>();
const activeServiceAlerts = new Set<string>();
const activeContainerDownAlerts = new Set<string>();
const activeContainerOverloadAlerts = new Set<string>();

// Helper to hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function writeLog(level: string, source: string, message: string) {
  try {
    const logId = 'log_' + crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await db.run(
      `INSERT INTO logs (id, timestamp, level, source, message)
       VALUES (?, ?, ?, ?, ?)`,
      [logId, timestamp, level, source.toUpperCase(), message]
    );
  } catch (err) {
    // Ignore log insertion errors
  }
}

async function writeDebugLog(source: string, message: string) {
  try {
    const pref = await db.get("SELECT debugMode FROM preferences WHERE id = 'default'");
    if (pref && pref.debugMode) {
      await writeLog('DEBUG', source, message);
      console.log(`[DEBUG] [${source}] ${message}`);
    }
  } catch (err) {}
}

async function sendEmailAlert(subject: string, htmlMessage: string) {
  try {
    const pref = await db.get("SELECT * FROM preferences WHERE id = 'default'");
    if (!pref) return;

    const host = pref.smtpHost;
    const port = Number(pref.smtpPort || 587);
    const user = pref.smtpUser;
    const pass = pref.smtpPass;
    const from = pref.smtpFrom || 'alerts@vitalmesh.io';

    await writeDebugLog('SMTP Alert', `Preparing outbound email. Host: ${host}, Port: ${port}, User: ${user}`);

    if (!host || !user || !pass) {
      await writeDebugLog('SMTP Alert', 'Skipped sending email alert: host, user, or password is not configured.');
      return;
    }

    const timeoutMs = pref.smtpTimeout ? Number(pref.smtpTimeout) : 5000;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs * 2
    });

    const targetEmail = pref.email || 'admin@example.com';

    await writeDebugLog('SMTP Alert', `Attempting delivery to: ${targetEmail}`);

    await transporter.sendMail({
      from,
      to: targetEmail,
      subject,
      html: htmlMessage
    });
    
    await writeDebugLog('SMTP Alert', `Email successfully sent to ${targetEmail}: ${subject}`);
    console.log(`[SMTP Alert] Sent email to ${targetEmail}: ${subject}`);
  } catch (err: any) {
    const errMsg = err.message || err;
    console.error('[SMTP Alert Error] Failed to send email alert:', err);
    await writeLog('ERR', 'SMTP Alert', `Failed to send email alert: ${errMsg}`);
  }
}

async function triggerAlert(title: string, message: string, level: 'info' | 'warning' | 'error', source: string) {
  try {
    const pref = await db.get("SELECT * FROM preferences WHERE id = 'default'");
    if (!pref) return;

    const alertId = 'alert_' + crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // 1. Dashboard Notification Alert
    if (pref.alertNotifyEnabled) {
      await db.run(
        `INSERT INTO alerts (id, title, message, level, timestamp, read)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [alertId, title, message, level, timestamp]
      );
    }

    // 2. Standard System Log
    const logId = 'log_' + crypto.randomUUID();
    const logSource = source.toUpperCase();
    const logLevel = level === 'error' ? 'ERR' : (level === 'warning' ? 'WARN' : 'INFO');
    await db.run(
      `INSERT INTO logs (id, timestamp, level, source, message)
       VALUES (?, ?, ?, ?, ?)`,
      [logId, timestamp, logLevel, logSource, `[Alert] ${title}: ${message}`]
    );

    // 3. Email Alert
    if (pref.alertEmailEnabled) {
      const subject = `[VitalMesh Alert] [${level.toUpperCase()}] ${title}`;
      const body = `
        <div style="font-family: monospace; background: #0c1017; color: #e2e8f0; padding: 20px; border: 1px solid #1a2333;">
          <h2 style="color: ${level === 'error' ? '#f43f5e' : (level === 'warning' ? '#f59e0b' : '#3b82f6')}; border-bottom: 1px solid #334155; padding-bottom: 8px;">
            ${title}
          </h2>
          <p style="font-size: 13px; line-height: 1.6;">${message}</p>
          <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
          <table style="font-size: 11px; color: #94a3b8;">
            <tr><td><b>Severity:</b></td><td>${level.toUpperCase()}</td></tr>
            <tr><td><b>Source:</b></td><td>${source}</td></tr>
            <tr><td><b>Timestamp:</b></td><td>${timestamp}</td></tr>
          </table>
        </div>
      `;
      sendEmailAlert(subject, body).catch(() => {});
    }
  } catch (err) {
    console.error('Error triggering alert:', err);
  }
}

async function checkStorageAlert(id: string, name: string, sizeUsed: number, sizeTotal: number) {
  if (!sizeTotal || sizeTotal <= 0) return;
  const usagePct = (sizeUsed / sizeTotal) * 100;
  try {
    const pref = await db.get("SELECT alertStorageThreshold FROM preferences WHERE id = 'default'");
    const threshold = pref?.alertStorageThreshold ?? 80;

    if (usagePct >= threshold) {
      if (!activeStorageAlerts.has(id)) {
        activeStorageAlerts.add(id);
        await triggerAlert(
          `Storage Threshold Exceeded: ${name}`,
          `Storage array/disk ${name} has reached ${usagePct.toFixed(1)}% capacity (Limit threshold set to ${threshold}%).`,
          'warning',
          'storage'
        );
      }
    } else {
      if (activeStorageAlerts.has(id)) {
        activeStorageAlerts.delete(id);
        await triggerAlert(
          `Storage Threshold Recovered: ${name}`,
          `Storage array/disk ${name} usage has dropped to ${usagePct.toFixed(1)}% (Threshold: ${threshold}%).`,
          'info',
          'storage'
        );
      }
    }
  } catch (err) {
    console.error('Error checking storage alert:', err);
  }
}

async function checkContainerAlerts(c: any) {
  try {
    const pref = await db.get("SELECT alertContainerDown, alertContainerOverloaded FROM preferences WHERE id = 'default'");
    if (!pref) return;

    await writeDebugLog('Container Alert Checker', `Evaluating container "${c.name}" (status="${c.status}", cpu=${c.cpu || 0}%, ram=${c.ram || 0}MB)`);

    const isRunning = c.status === 'running' || c.status === 'up' || c.status?.toLowerCase().includes('up');

    // 1. Container Down Alert
    if (pref.alertContainerDown) {
      if (!isRunning) {
        if (!activeContainerDownAlerts.has(c.id)) {
          activeContainerDownAlerts.add(c.id);
          await triggerAlert(
            `Container Down: ${c.name}`,
            `Docker container "${c.name}" status changed to offline/stopped: "${c.status}".`,
            'error',
            'containers'
          );
        }
      } else {
        if (activeContainerDownAlerts.has(c.id)) {
          activeContainerDownAlerts.delete(c.id);
          await triggerAlert(
            `Container Recovered: ${c.name}`,
            `Docker container "${c.name}" is back online and running.`,
            'info',
            'containers'
          );
        }
      }
    }

    // 2. Container Overload Alert (CPU > 90% or RAM > 90% of maxRam limit)
    if (pref.alertContainerOverloaded && isRunning) {
      const cpuVal = Number(c.cpu || 0);
      const ramVal = Number(c.ram || 0);
      const maxRamVal = Number(c.maxRam || 0);
      const ramPct = maxRamVal > 0 ? (ramVal / maxRamVal) * 100 : 0;

      const isOverloaded = cpuVal > 90 || ramPct > 90;
      if (isOverloaded) {
        if (!activeContainerOverloadAlerts.has(c.id)) {
          activeContainerOverloadAlerts.add(c.id);
          await triggerAlert(
            `Container Overloaded: ${c.name}`,
            `Docker container "${c.name}" is under high load: CPU: ${cpuVal.toFixed(1)}%, RAM: ${ramPct.toFixed(1)}% (${ramVal.toFixed(1)}MB / ${maxRamVal}MB).`,
            'warning',
            'containers'
          );
        }
      } else {
        if (activeContainerOverloadAlerts.has(c.id)) {
          activeContainerOverloadAlerts.delete(c.id);
          await triggerAlert(
            `Container Load Normal: ${c.name}`,
            `Docker container "${c.name}" resource consumption has returned to normal: CPU: ${cpuVal.toFixed(1)}%, RAM: ${ramPct.toFixed(1)}%.`,
            'info',
            'containers'
          );
        }
      }
    }
  } catch (err) {
    console.error('Error checking container alerts:', err);
  }
}

// Helper to check ping of external node
async function pingHost(ip: string): Promise<boolean> {
  try {
    const cmd = process.platform === 'win32' ? `ping -n 1 -w 1500 ${ip}` : `ping -c 1 -W 2 ${ip}`;
    await execAsync(cmd);
    return true;
  } catch {
    return false;
  }
}

const resolveA = promisify(dns.resolve4);
const resolveAAAA = promisify(dns.resolve6);
const resolveMX = promisify(dns.resolveMx);

async function checkDomainTelemetry(id: string, domainName: string) {
  const dnsRecords = {
    A: [] as string[],
    AAAA: [] as string[],
    MX: [] as string[]
  };
  
  let sslExpireDate = '';
  let sslStatus = 'unknown';

  try {
    const a = await resolveA(domainName);
    if (a) dnsRecords.A = a;
  } catch (e) {}
  try {
    const aaaa = await resolveAAAA(domainName);
    if (aaaa) dnsRecords.AAAA = aaaa;
  } catch (e) {}
  try {
    const mx = await resolveMX(domainName);
    if (mx) {
      dnsRecords.MX = mx.map(m => `${m.exchange} (priority: ${m.priority})`);
    }
  } catch (e) {}

  try {
    const pref = await db.get("SELECT domainLookupTimeout FROM preferences WHERE id = 'default'").catch(() => null);
    const timeoutMs = pref?.domainLookupTimeout ? Number(pref.domainLookupTimeout) : 10000;

    const expireDate = await new Promise<Date>((resolve, reject) => {
      const socket = tls.connect({
        host: domainName,
        port: 443,
        servername: domainName,
        rejectUnauthorized: false
      }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (cert && cert.valid_to) {
          resolve(new Date(cert.valid_to));
        } else {
          reject(new Error('No certificate'));
        }
      });
      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Timeout'));
      });
      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });

    sslExpireDate = expireDate.toISOString();
    const diffMs = expireDate.getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) {
      sslStatus = 'expired';
    } else if (diffDays <= 30) {
      sslStatus = 'warning';
    } else {
      sslStatus = 'valid';
    }
  } catch (err) {
    sslStatus = 'unknown';
  }

  const lastChecked = new Date().toISOString();
  try {
    const oldRecord = await db.get('SELECT sslStatus, domainName FROM domains WHERE id = ?', [id]);
    if (oldRecord && oldRecord.sslStatus !== sslStatus && (sslStatus === 'warning' || sslStatus === 'expired')) {
      const pref = await db.get("SELECT alertSslExpire FROM preferences WHERE id = 'default'");
      if (pref?.alertSslExpire) {
        await triggerAlert(
          `SSL Certificate Warning: ${oldRecord.domainName}`,
          `SSL certificate for ${oldRecord.domainName} is ${sslStatus === 'expired' ? 'EXPIRED' : 'EXPIRING SOON (less than 30 days left)'}. Expiration date: ${sslExpireDate || 'N/A'}`,
          sslStatus === 'expired' ? 'error' : 'warning',
          'domains'
        );
      }
    }
  } catch (err) {}

  await db.run(
    `UPDATE domains
     SET dnsRecords = ?, sslExpireDate = ?, sslStatus = ?, lastChecked = ?
     WHERE id = ?`,
    [JSON.stringify(dnsRecords), sslExpireDate, sslStatus, lastChecked, id]
  );

  const record = await db.get('SELECT * FROM domains WHERE id = ?', [id]);
  return {
    ...record,
    dnsRecords
  };
}

// Helper to parse docker stats MemUsage
function parseMemUsage(memUsageStr: string) {
  if (!memUsageStr) return { ram: 0, maxRam: 1024 };
  const parts = memUsageStr.split('/').map(p => p.trim());
  if (parts.length < 2) return { ram: 0, maxRam: 1024 };
  
  const parseVal = (str: string) => {
    const val = parseFloat(str);
    if (isNaN(val)) return 0;
    if (str.toLowerCase().includes('gib')) {
      return val * 1024;
    }
    if (str.toLowerCase().includes('mib')) {
      return val;
    }
    if (str.toLowerCase().includes('kib')) {
      return val / 1024;
    }
    return val;
  };
  
  return {
    ram: Math.round(parseVal(parts[0])),
    maxRam: Math.round(parseVal(parts[1])) || 1024
  };
}

// Helper to calculate CPU averages
function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  return { idle: idle / cpus.length, total: total / cpus.length };
}

let lastCpuTimes = getCpuTimes();

async function getCpuUsage(): Promise<number> {
  const first = getCpuTimes();
  await new Promise(resolve => setTimeout(resolve, 150));
  const second = getCpuTimes();
  const idleDiff = second.idle - first.idle;
  const totalDiff = second.total - first.total;
  if (totalDiff === 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (100 * idleDiff) / totalDiff)));
}

async function getSshTimeout(): Promise<number> {
  try {
    const pref = await db.get("SELECT sshCommandTimeout FROM preferences WHERE id = 'default'");
    return pref?.sshCommandTimeout ? Number(pref.sshCommandTimeout) : 10000;
  } catch {
    return 10000;
  }
}

function sshExecCommand(config: any, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let stdout = '';
        let stderr = '';
        stream.on('close', (code: number) => {
          conn.end();
          if (code !== 0) {
            reject(new Error(`Command exited with code ${code}. Stderr: ${stderr}`));
          } else {
            resolve(stdout);
          }
        }).on('data', (data: any) => {
          stdout += data.toString();
        }).stderr.on('data', (data: any) => {
          stderr += data.toString();
        });
      });
    }).on('error', (err: any) => {
      reject(err);
    }).connect(config);
  });
}

function parseDfOutput(stdout: string) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  if (lines.length < 2) throw new Error('Invalid df output');
  
  const columns = lines[lines.length - 1].trim().split(/\s+/);
  if (columns.length < 4) throw new Error('Invalid df columns');
  
  const sizeTotalBytes = parseFloat(columns[1]);
  const sizeUsedBytes = parseFloat(columns[2]);
  
  let health: 'healthy' | 'warning' | 'alert' | 'critical' = 'healthy';
  if (sizeTotalBytes > 0) {
    const pct = (sizeUsedBytes / sizeTotalBytes) * 100;
    if (pct > 90) health = 'critical';
    else if (pct > 80) health = 'warning';
  }

  const GIGABYTE = 1024 * 1024 * 1024;
  const sizeTotal = sizeTotalBytes > 0 ? parseFloat((sizeTotalBytes / GIGABYTE).toFixed(1)) : 0;
  const sizeUsed = sizeUsedBytes > 0 ? parseFloat((sizeUsedBytes / GIGABYTE).toFixed(1)) : 0;
  
  return { sizeTotal, sizeUsed, health };
}

async function pollRemoteStorageAsync(disk: any) {
  try {
    const sshTimeout = await getSshTimeout();
    const config: any = {
      host: disk.ip,
      port: disk.sshPort || 22,
      username: disk.sshUsername,
      readyTimeout: sshTimeout,
    };
    if (disk.sshKey) {
      config.privateKey = disk.sshKey;
    } else if (disk.sshPassword) {
      config.password = disk.sshPassword;
    }
    
    const pathStr = disk.sshPath || '/';
    const cmd = `df -B1 "${pathStr}"`;
    const output = await sshExecCommand(config, cmd);
    const { sizeTotal, sizeUsed, health } = parseDfOutput(output);
    
    await db.run(
      `UPDATE disks
       SET sizeTotal = ?, sizeUsed = ?, health = ?
       WHERE id = ?`,
      [sizeTotal, sizeUsed, health, disk.id]
    );
    await checkStorageAlert(disk.id, disk.name, sizeUsed, sizeTotal);
  } catch (sshErr: any) {
    console.error(`Failed to poll remote storage via SSH for disk ${disk.name}:`, sshErr);
    await db.run(
      `UPDATE disks
       SET health = 'critical'
       WHERE id = ?`,
      [disk.id]
    );
    
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logId = `log-${Date.now()}`;
    await db.run(
      `INSERT INTO logs (id, timestamp, level, source, message)
       VALUES (?, ?, 'ERROR', 'Storage Daemon', ?)`,
      [logId, timeStr, `Failed to connect to remote storage [${disk.name}] via SSH: ${sshErr.message || sshErr}`]
    ).catch(() => {});
  }
}

async function pollRemoteNodeAsync(node: any) {
  try {
    const sshTimeout = await getSshTimeout();
    const config: any = {
      host: node.ip,
      port: node.sshPort || 22,
      username: node.sshUsername,
      readyTimeout: sshTimeout,
    };
    if (node.sshKey) {
      config.privateKey = node.sshKey;
    } else if (node.sshPassword) {
      config.password = node.sshPassword;
    }
    
    const cmd = `echo "===CPU===" && read -r cpu a b c d e f g h i j < /proc/stat; prev=$((a+b+c+d+e+f+g+h+i+j)); prev_id=$((d+e)); sleep 0.5; read -r cpu a b c d e f g h i j < /proc/stat; next=$((a+b+c+d+e+f+g+h+i+j)); next_id=$((d+e)); diff=$((next - prev)); if [ "$diff" -eq 0 ]; then echo 0; else echo "$((100 * ( diff - (next_id - prev_id) ) / diff ))"; fi && echo "===MEM===" && cat /proc/meminfo | grep -E 'MemTotal|MemAvailable|MemFree|Buffers|Cached' && echo "===TEMP===" && (cat /sys/class/thermal/thermal_zone0/temp || cat /sys/class/hwmon/hwmon0/temp1_input || echo 0) && echo "===UPTIME===" && cat /proc/uptime`;
    
    const stdout = await sshExecCommand(config, cmd);
    
    // Parse CPU
    const cpuMatch = stdout.match(/===CPU===[\r\n]+(\d+)/);
    const cpu = cpuMatch ? parseInt(cpuMatch[1], 10) : 0;
    
    // Parse MEM
    const memSection = stdout.match(/===MEM===([\s\S]*?)===TEMP===/);
    let ramTotalGB = node.ramTotal;
    let ramUsedGB = 0;
    if (memSection) {
      const memText = memSection[1];
      const memTotalMatch = memText.match(/MemTotal:\s+(\d+)\s+kB/);
      const memAvailMatch = memText.match(/MemAvailable:\s+(\d+)\s+kB/);
      const memFreeMatch = memText.match(/MemFree:\s+(\d+)\s+kB/);
      const buffersMatch = memText.match(/Buffers:\s+(\d+)\s+kB/);
      const cachedMatch = memText.match(/Cached:\s+(\d+)\s+kB/);
      
      if (memTotalMatch) {
        const totalKB = parseInt(memTotalMatch[1], 10);
        ramTotalGB = parseFloat((totalKB / (1024 * 1024)).toFixed(1));
        
        if (memAvailMatch) {
          const availKB = parseInt(memAvailMatch[1], 10);
          ramUsedGB = parseFloat(((totalKB - availKB) / (1024 * 1024)).toFixed(1));
        } else if (memFreeMatch) {
          const freeKB = parseInt(memFreeMatch[1], 10);
          const bufKB = buffersMatch ? parseInt(buffersMatch[1], 10) : 0;
          const cacheKB = cachedMatch ? parseInt(cachedMatch[1], 10) : 0;
          const availKB = freeKB + bufKB + cacheKB;
          ramUsedGB = parseFloat(((totalKB - availKB) / (1024 * 1024)).toFixed(1));
        }
      }
    }
    
    // Parse TEMP
    const tempMatch = stdout.match(/===TEMP===[\r\n]+(\d+)/);
    let temp: number | null = null;
    if (tempMatch) {
      const rawTemp = parseInt(tempMatch[1], 10);
      if (rawTemp > 0) {
        temp = Math.round(rawTemp / 1000);
      }
    }
    
    // Parse UPTIME
    const uptimeMatch = stdout.match(/===UPTIME===[\r\n]+([\d.]+)/);
    let uptimeStr = 'online';
    if (uptimeMatch) {
      const uptimeSeconds = parseFloat(uptimeMatch[1]);
      const days = Math.floor(uptimeSeconds / (3600 * 24));
      const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      uptimeStr = `${days}d ${hours}h ${minutes}m`;
    }
    
    const dbNode = await db.get('SELECT * FROM nodes WHERE id = ?', [node.id]);
    if (dbNode) {
      let cpuHistory = [];
      let ramHistory = [];
      try { cpuHistory = JSON.parse(dbNode.cpuHistory || '[]'); } catch {}
      try { ramHistory = JSON.parse(dbNode.ramHistory || '[]'); } catch {}
      if (!Array.isArray(cpuHistory) || cpuHistory.length === 0) cpuHistory = Array(9).fill(0);
      if (!Array.isArray(ramHistory) || ramHistory.length === 0) ramHistory = Array(9).fill(0);

      const newCpuHistory = [...cpuHistory.slice(-8), cpu];
      const newRamHistory = [...ramHistory.slice(-8), ramUsedGB];
      
      await db.run(
        `UPDATE nodes
         SET status = 'healthy', cpu = ?, cpuHistory = ?, ramUsed = ?, ramTotal = ?, ramHistory = ?, temp = ?, uptime = ?
         WHERE id = ?`,
        [cpu, JSON.stringify(newCpuHistory), ramUsedGB, ramTotalGB, JSON.stringify(newRamHistory), temp, uptimeStr, node.id]
      );
    }
  } catch (sshErr: any) {
    console.error(`Failed to poll remote node via SSH for node ${node.name}:`, sshErr);
    const dbNode = await db.get('SELECT * FROM nodes WHERE id = ?', [node.id]);
    if (dbNode) {
      let cpuHistory = [];
      let ramHistory = [];
      try { cpuHistory = JSON.parse(dbNode.cpuHistory || '[]'); } catch {}
      try { ramHistory = JSON.parse(dbNode.ramHistory || '[]'); } catch {}
      if (!Array.isArray(cpuHistory) || cpuHistory.length === 0) cpuHistory = Array(9).fill(0);
      if (!Array.isArray(ramHistory) || ramHistory.length === 0) ramHistory = Array(9).fill(0);

      const newCpuHistory = [...cpuHistory.slice(-8), 0];
      const newRamHistory = [...ramHistory.slice(-8), 0];
      await db.run(
        `UPDATE nodes
         SET status = 'offline', cpu = 0, cpuHistory = ?, ramUsed = 0, ramHistory = ?, temp = NULL, uptime = 'offline'
         WHERE id = ?`,
        [JSON.stringify(newCpuHistory), JSON.stringify(newRamHistory), node.id]
      );
    }
  }
}

async function syncRemoteContainersAsync() {
  try {
    const { stdout: rPsStdout } = await execAsync('docker --context ' + oracleName + ' ps -a --format "{{json .}}"');
    const rPsLines = rPsStdout.trim().split('\n').filter(Boolean);
    const rPsContainers = rPsLines.map(line => JSON.parse(line));
    
    let statsMap = new Map<string, any>();
    try {
      const { stdout: statsStdout } = await execAsync('docker --context ' + oracleName + ' stats --no-stream --format "{{json .}}"');
      const statsLines = statsStdout.trim().split('\n').filter(Boolean);
      statsLines.forEach(line => {
        const stats = JSON.parse(line);
        statsMap.set(stats.ID, stats);
        statsMap.set(stats.Name, stats);
      });
    } catch {}

    const oracleNode = await db.get("SELECT id FROM nodes WHERE ip = '" + oracleIP + "' OR name LIKE '%Oracle%' LIMIT 1");
    const targetNodeId = oracleNode ? oracleNode.id : 'node-oracle';

    const newSyncedNames = new Set<string>();

    for (const rc of rPsContainers) {
      const name = rc.Names;
      if (transitionLocks.has(name) && Date.now() - transitionLocks.get(name)! < 25000) {
        newSyncedNames.add(name);
        continue;
      }
      const image = rc.Image;
      let status = 'stopped';
      if (rc.State === 'running') status = 'running';
      else if (rc.State === 'paused') status = 'paused';
      
      const ports = rc.Ports || '';
      const uptime = rc.Status || '';
      
      const stats = statsMap.get(rc.ID) || statsMap.get(name);
      const cpu = stats ? parseFloat(stats.CPUPerc) || 0 : 0;
      const { ram, maxRam } = stats ? parseMemUsage(stats.MemUsage) : { ram: 0, maxRam: 24000 };

      newSyncedNames.add(name);

      const existing = await db.get('SELECT * FROM containers WHERE name = ? AND nodeId = ?', [name, targetNodeId]);
      
      if (existing) {
        await db.run(
          `UPDATE containers SET image = ?, status = ?, cpu = ?, ram = ?, maxRam = ?, uptime = ?, ports = ? WHERE id = ?`,
          [image, status, cpu, ram, maxRam, uptime, ports, existing.id]
        );
        await checkContainerAlerts({ id: existing.id, name, status, cpu, ram, maxRam });
      } else {
        const id = `c-oracle-${rc.ID}`;
        const logs = JSON.stringify([
          `[INFO] Remote container ${name} auto-detected on host context ' + oracleName + '.`,
          `[INFO] Running image: ${image}`,
        ]);
        await db.run(
          `INSERT INTO containers (id, name, image, status, cpu, ram, maxRam, uptime, ports, logs, nodeId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, image, status, cpu, ram, maxRam, uptime, ports, logs, targetNodeId]
        );
        await checkContainerAlerts({ id, name, status, cpu, ram, maxRam });
      }
    }

    contextSyncedNames = newSyncedNames;
  } catch (remoteDockerErr: any) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logId = `log-${Date.now()}`;
    await db.run(
      `INSERT INTO logs (id, timestamp, level, source, message)
       VALUES (?, ?, 'ERROR', 'Docker Daemon', ?)`,
      [logId, timeStr, `Remote context sync failed: ${remoteDockerErr.message || remoteDockerErr}`]
    ).catch(() => {});
  }
}

async function getNetworkTraffic(): Promise<{ rx: number; tx: number }> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`powershell -Command "Get-Counter -Counter '\\Network Interface(*)\\Bytes Received/sec', '\\Network Interface(*)\\Bytes Sent/sec' -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | ForEach-Object { $_.Path + '::' + $_.CookedValue }"`);
      let rxSum = 0;
      let txSum = 0;
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.split('::');
        if (parts.length === 2) {
          const pathStr = parts[0].toLowerCase();
          const val = parseFloat(parts[1]) || 0;
          if (pathStr.includes('bytes received/sec')) {
            rxSum += val;
          } else if (pathStr.includes('bytes sent/sec')) {
            txSum += val;
          }
        }
      }
      const rxMB = parseFloat((rxSum / (1024 * 1024)).toFixed(2));
      const txMB = parseFloat((txSum / (1024 * 1024)).toFixed(2));
      return { rx: rxMB, tx: txMB };
    } else {
      if (fs.existsSync('/proc/net/dev')) {
        return { rx: 0.15, tx: 0.05 };
      }
    }
  } catch {}
  return { rx: 0, tx: 0 };
}

async function syncDisks() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 -and $_.Size -gt 0 } | Select-Object DeviceID, VolumeName, Size, FreeSpace | ConvertTo-Json"');
      if (stdout.trim()) {
        const volumes = JSON.parse(stdout.trim());
        const volumeArr = Array.isArray(volumes) ? volumes : [volumes];
        
        for (const vol of volumeArr) {
          if (vol.DeviceID && vol.Size > 0) {
            const letter = vol.DeviceID.replace(':', '').toLowerCase();
            const id = `disk-${letter}`;
            const name = `${vol.VolumeName || 'Local Storage'} (${vol.DeviceID})`;
            const type = 'NTFS';
            const sizeTotal = parseFloat((vol.Size / (1024 * 1024 * 1024)).toFixed(1)); // GB
            const sizeUsed = parseFloat(((vol.Size - vol.FreeSpace) / (1024 * 1024 * 1024)).toFixed(1)); // GB
            const health = (vol.FreeSpace / vol.Size < 0.1) ? 'warning' : 'healthy';
            const temp = 33 + Math.floor(Math.random() * 8);
            
            const existing = await db.get('SELECT id FROM disks WHERE id = ?', [id]);
            if (existing) {
              await db.run(
                `UPDATE disks
                 SET name = ?, sizeUsed = ?, sizeTotal = ?, health = ?, temp = ?, nodeId = 'node-local'
                 WHERE id = ?`,
                [name, sizeUsed, sizeTotal, health, temp, id]
              );
            } else {
              await db.run(
                `INSERT INTO disks (id, name, type, sizeUsed, sizeTotal, health, temp, nodeId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'node-local')`,
                [id, name, type, sizeUsed, sizeTotal, health, temp]
              );
            }
            await checkStorageAlert(id, name, sizeUsed, sizeTotal);
          }
        }
      }
    } else {
      const { stdout } = await execAsync('df -B1 -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null || df -B1');
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/\s+/);
        if (cols.length >= 6) {
          const mount = cols[5];
          if (['/', '/www', '/home', '/data'].includes(mount)) {
            const id = `disk-linux-${mount.replace(/[/]/g, '_')}`;
            const name = `Root Filesystem (${mount})`;
            const sizeTotalBytes = parseFloat(cols[1]) || 0;
            const sizeUsedBytes = parseFloat(cols[2]) || 0;
            const sizeTotal = parseFloat((sizeTotalBytes / (1024 * 1024 * 1024)).toFixed(1));
            const sizeUsed = parseFloat((sizeUsedBytes / (1024 * 1024 * 1024)).toFixed(1));
            const health = sizeTotalBytes > 0 && (sizeUsedBytes / sizeTotalBytes > 0.9) ? 'warning' : 'healthy';

            const existing = await db.get('SELECT id FROM disks WHERE id = ?', [id]);
            if (existing) {
              await db.run(
                `UPDATE disks SET name = ?, sizeUsed = ?, sizeTotal = ?, health = ? WHERE id = ?`,
                [name, sizeUsed, sizeTotal, health, id]
              );
            } else {
              await db.run(
                `INSERT INTO disks (id, name, type, sizeUsed, sizeTotal, health, temp, nodeId)
                 VALUES (?, ?, 'ext4', ?, ?, ?, 38, 'node-local')`,
                [id, name, sizeUsed, sizeTotal, health]
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error syncing local disks:', err);
  }
}

async function scanLocalContainers() {
  try {
    const { stdout } = await execAsync(`docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"`);
    if (!stdout || !stdout.trim()) return;

    let statsMap: Record<string, { cpu: number; ram: number; maxRam: number }> = {};
    try {
      const { stdout: statsOut } = await execAsync(`docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}"`);
      if (statsOut && statsOut.trim()) {
        const statsLines = statsOut.trim().split('\n').filter(Boolean);
        for (const line of statsLines) {
          const parts = line.split('|');
          if (parts.length >= 3) {
            const cid = parts[0].trim();
            const cpuVal = parseFloat(parts[1].replace('%', '').trim()) || 0;
            const memUsage = parseMemUsage(parts[2].trim());
            statsMap[cid] = {
              cpu: cpuVal,
              ram: memUsage.ram,
              maxRam: memUsage.maxRam
            };
          }
        }
      }
    } catch {}

    const lines = stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const cols = line.split('|');
      if (cols.length >= 4) {
        const shortId = cols[0].trim();
        const cname = cols[1].trim();
        const cimage = cols[2].trim();
        const rawStatus = cols[3].trim();
        const cports = cols[4] ? cols[4].trim() : '';

        if (cname.toLowerCase().includes('vitalmesh') || cimage.toLowerCase().includes('vitalmesh')) {
          continue;
        }

        const isRunning = rawStatus.toLowerCase().startsWith('up') || rawStatus.toLowerCase().includes('up ');
        const isPaused = rawStatus.toLowerCase().includes('paused');
        const statusStr = isPaused ? 'paused' : (isRunning ? 'running' : 'stopped');
        const containerId = `cnt-local-${cname}`;

        const stats = statsMap[shortId] || { cpu: 0, ram: 0, maxRam: 1024 };

        const existing = await db.get('SELECT id FROM containers WHERE id = ? OR name = ?', [containerId, cname]);
        if (existing) {
          await db.run(
            `UPDATE containers
             SET status = ?, cpu = ?, ram = ?, maxRam = ?, uptime = ?, ports = ?, nodeId = 'node-local'
             WHERE id = ?`,
            [statusStr, stats.cpu, stats.ram, stats.maxRam || 1024, rawStatus, cports, existing.id]
          );
        } else {
          await db.run(
            `INSERT INTO containers (id, name, image, status, cpu, ram, maxRam, uptime, ports, logs, nodeId, ip, url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'node-local', '127.0.0.1', '')`,
            [containerId, cname, cimage, statusStr, stats.cpu, stats.ram, stats.maxRam || 1024, rawStatus, cports]
          );
        }
      }
    }
  } catch (err) {
    // Silent fallback if Docker CLI is not installed or available
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 1. Initialize SQLite Database via @libsql/client
  //const dataDir = path.resolve(process.cwd(), 'data');
  // electron
  const dataDir = process.env.VITALMESH_DATA_DIR
  ? path.resolve(process.env.VITALMESH_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.resolve(dataDir, 'vitalmesh.db');
  dbClient = createClient({ url: `file:${dbPath}` });

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      firstLogin INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      theme TEXT,
      mode TEXT,
      layout TEXT,
      email TEXT,
      refreshRate INTEGER,
      enableNotifications INTEGER,
      apiKey TEXT,
      envName TEXT,
      hmacKey TEXT
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      ip TEXT,
      cpu INTEGER,
      cpuHistory TEXT,
      ramUsed REAL,
      ramTotal REAL,
      ramHistory TEXT,
      temp INTEGER,
      uptime TEXT,
      txSpeed REAL,
      rxSpeed REAL,
      sshUsername TEXT,
      sshPassword TEXT,
      sshKey TEXT,
      sshPort INTEGER,
      isPaused INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS containers (
      id TEXT PRIMARY KEY,
      name TEXT,
      image TEXT,
      status TEXT,
      cpu REAL,
      ram REAL,
      maxRam REAL,
      uptime TEXT,
      ports TEXT,
      logs TEXT,
      nodeId TEXT,
      ip TEXT,
      url TEXT,
      githubUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT,
      url TEXT,
      status TEXT,
      uptimePercentage REAL,
      latency INTEGER,
      history TEXT,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS disks (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      sizeUsed REAL,
      sizeTotal REAL,
      health TEXT,
      temp INTEGER,
      ip TEXT,
      nodeId TEXT,
      sshUsername TEXT,
      sshPassword TEXT,
      sshKey TEXT,
      sshPort INTEGER,
      sshPath TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      level TEXT,
      source TEXT,
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT,
      level TEXT,
      timestamp TEXT,
      read INTEGER
    );

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      domainName TEXT,
      dnsRecords TEXT,
      sslExpireDate TEXT,
      sslIssuer TEXT,
      sslExpiryDays INTEGER,
      validUntil TEXT,
      sslStatus TEXT,
      lastChecked TEXT
    );
  `);

  // Run quick column migrations for existing databases
  try { await db.exec("ALTER TABLE disks ADD COLUMN ip TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE containers ADD COLUMN nodeId TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE containers ADD COLUMN ip TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE containers ADD COLUMN url TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE containers ADD COLUMN githubUrl TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN envName TEXT;"); } catch (err) {}
  try { await db.exec("UPDATE preferences SET envName = 'VitalMesh Homelab' WHERE envName IS NULL;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN nodeId TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN sshUsername TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN sshPassword TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN sshKey TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN sshPort INTEGER;"); } catch (err) {}
  try { await db.exec("ALTER TABLE disks ADD COLUMN sshPath TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN txSpeed REAL;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN rxSpeed REAL;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN sshUsername TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN sshPassword TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN sshKey TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN sshPort INTEGER;"); } catch (err) {}

  try { await db.exec("ALTER TABLE users ADD COLUMN firstLogin INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN hmacKey TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertEmailEnabled INTEGER DEFAULT 0;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertNotifyEnabled INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertUptimeDown INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertSslExpire INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertStorageThreshold INTEGER DEFAULT 80;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertContainerDown INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN alertContainerOverloaded INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN moduleMesh INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN moduleContainers INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN moduleStorage INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN moduleUptime INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN moduleDomains INTEGER DEFAULT 1;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpHost TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpPort INTEGER DEFAULT 587;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpUser TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpPass TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpFrom TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN debugMode INTEGER DEFAULT 0;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN daemonPollInterval INTEGER DEFAULT 5;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN domainCheckInterval INTEGER DEFAULT 30;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN httpPingTimeout INTEGER DEFAULT 5000;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN sshCommandTimeout INTEGER DEFAULT 10000;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN domainLookupTimeout INTEGER DEFAULT 10000;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN smtpTimeout INTEGER DEFAULT 5000;"); } catch (err) {}
  try { await db.exec("ALTER TABLE nodes ADD COLUMN isPaused INTEGER DEFAULT 0;"); } catch (err) {}
  try { await db.exec("ALTER TABLE domains ADD COLUMN sslIssuer TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE domains ADD COLUMN sslExpiryDays INTEGER;"); } catch (err) {}
  try { await db.exec("ALTER TABLE domains ADD COLUMN validUntil TEXT;"); } catch (err) {}
  try { await db.exec("ALTER TABLE preferences ADD COLUMN lastBackupAt TEXT;"); } catch (err) {}

  try {
    await db.run(`
      UPDATE disks SET
        sizeTotal = ROUND(sizeTotal / 1099511627776.0, 2),
        sizeUsed = ROUND(sizeUsed / 1099511627776.0, 2)
      WHERE sizeTotal > 10000;
    `);
  } catch (err) {}

  try {
    await db.run(`
      UPDATE preferences SET
        alertEmailEnabled = COALESCE(alertEmailEnabled, 0),
        alertNotifyEnabled = COALESCE(alertNotifyEnabled, 1),
        alertUptimeDown = COALESCE(alertUptimeDown, 1),
        alertSslExpire = COALESCE(alertSslExpire, 1),
        alertStorageThreshold = COALESCE(alertStorageThreshold, 80),
        alertContainerDown = COALESCE(alertContainerDown, 1),
        alertContainerOverloaded = COALESCE(alertContainerOverloaded, 1),
        moduleMesh = COALESCE(moduleMesh, 1),
        moduleContainers = COALESCE(moduleContainers, 1),
        moduleStorage = COALESCE(moduleStorage, 1),
        moduleUptime = COALESCE(moduleUptime, 1),
        moduleDomains = COALESCE(moduleDomains, 1),
        debugMode = COALESCE(debugMode, 0),
        daemonPollInterval = COALESCE(daemonPollInterval, 5),
        domainCheckInterval = COALESCE(domainCheckInterval, 30),
        httpPingTimeout = COALESCE(httpPingTimeout, 5000),
        sshCommandTimeout = COALESCE(sshCommandTimeout, 10000),
        domainLookupTimeout = COALESCE(domainLookupTimeout, 10000),
        smtpTimeout = COALESCE(smtpTimeout, 5000)
      WHERE id = 'default'
    `);
  } catch (err) {}

  // Seed default admin user if empty
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (!userCount || userCount.count === 0) {
    const adminHashed = hashPassword('admin');
    await db.run(
      `INSERT INTO users (id, email, password, firstLogin) VALUES (?, ?, ?, 1)`,
      ['user-admin', 'admin@example.com', adminHashed]
    );
  } else {
    try {
      const adminHashed = hashPassword('admin');
      await db.run("UPDATE users SET firstLogin = 1 WHERE password = ?", [adminHashed]);
    } catch (err) {}
  }

  // Seed preferences if missing
  const generateApiKey = () => 'vt_live_' + crypto.randomBytes(16).toString('hex');
  const generateHmacKey = () => 'sha256:' + crypto.randomBytes(32).toString('hex');

  let existingPref = await db.get("SELECT * FROM preferences WHERE id = 'default'");
  if (!existingPref) {
    const randomApi = generateApiKey();
    const randomHmac = generateHmacKey();
    await db.run(
      `INSERT INTO preferences (id, theme, mode, layout, email, refreshRate, enableNotifications, apiKey, hmacKey, envName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['default', 'cyber-vitality', 'dark', 'dense', 'admin@example.com', 5, 1, randomApi, randomHmac, 'VitalMesh Homelab']
    );
  } else {
    let updated = false;
    let apiKey = existingPref.apiKey;
    let hmacKey = existingPref.hmacKey;
    if (!apiKey || apiKey === 'vt_live_9203a9f82d1c10398f7e3d4c5b6a7b8c') {
      apiKey = generateApiKey();
      updated = true;
    }
    if (!hmacKey) {
      hmacKey = generateHmacKey();
      updated = true;
    }
    if (updated) {
      await db.run('UPDATE preferences SET apiKey = ?, hmacKey = ? WHERE id = ?', [apiKey, hmacKey, 'default']);
    }
  }

  // Clean legacy/default mock data from existing database
  try {
    await db.run("DELETE FROM disks WHERE id = 'disk-default';");
    await db.run("DELETE FROM services WHERE id IN ('s-google', 's-github');");
  } catch (err) {}

  // Seed local host node if missing
  const hostCount = await db.get('SELECT COUNT(*) as count FROM nodes WHERE id = ?', ['node-local']);
  if (!hostCount || hostCount.count === 0) {
    const hostname = os.hostname();
    const cpuHistory = JSON.stringify(Array(9).fill(0));
    const ramHistory = JSON.stringify(Array(9).fill(0));
    const ramTotalGB = parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
    await db.run(
      `INSERT INTO nodes (id, name, status, ip, cpu, cpuHistory, ramUsed, ramTotal, ramHistory, temp, uptime, txSpeed, rxSpeed)
       VALUES (?, ?, 'healthy', '127.0.0.1', 0, ?, 0, ?, ?, NULL, '0m', 0.0, 0.0)`,
      ['node-local', hostname, cpuHistory, ramTotalGB, ramHistory]
    );
  }

  // Seed fallback services if empty
  const serviceCount = await db.get('SELECT COUNT(*) as count FROM services');
  if (!serviceCount || serviceCount.count === 0) {
    const initialServices = [
      {
        id: 's-google',
        name: 'google.com',
        url: 'https://google.com',
        status: 'healthy',
        uptimePercentage: 100.0,
        latency: 45,
        history: JSON.stringify(Array(30).fill('up')),
        category: 'Search Engine',
      },
      {
        id: 's-github',
        name: 'github.com',
        url: 'https://github.com',
        status: 'healthy',
        uptimePercentage: 99.98,
        latency: 80,
        history: JSON.stringify(Array(30).fill('up')),
        category: 'Code Platform',
      }
    ];
    for (const s of initialServices) {
      await db.run(
        `INSERT INTO services (id, name, url, status, uptimePercentage, latency, history, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.name, s.url, s.status, s.uptimePercentage, s.latency, s.history, s.category]
      );
    }
  }

  // Seed fallback disks if empty
  const diskCount = await db.get('SELECT COUNT(*) as count FROM disks');
  if (!diskCount || diskCount.count === 0) {
    await db.run(
      `INSERT INTO disks (id, name, type, sizeUsed, sizeTotal, health, temp, nodeId)
       VALUES ('disk-default', 'System Storage (C:)', 'SSD', 0.2, 1.0, 'healthy', 36, 'node-local')`
    );
  }

  // Helper to retrieve logged-in user id
  const getSessionUserId = (req: express.Request) => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (!match) return null;
    try {
      let val = decodeURIComponent(match[1].trim());
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      if (val.startsWith('s:')) {
        val = val.substring(2);
      }
      return val;
    } catch {
      return null;
    }
  };

  // Middleware to enforce authentication
  const checkAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let userId = getSessionUserId(req);
    let user = null;

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const pref = await db.get('SELECT email FROM preferences WHERE apiKey = ?', [token]);
      if (pref) {
        user = await db.get('SELECT * FROM users WHERE email = ?', [pref.email]);
      }
    }

    if (!user && userId) {
      user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in or provide a valid API token.' });
    }

    (req as any).user = user;
    next();
  };

  // --- Authenticated API Endpoints ---

  // 1. Session check endpoint
  app.get('/api/me', async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.json({ user: null });
    }
    try {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.json({ user: null });
      }
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstLogin: user.firstLogin !== 0
        }
      });
    } catch (err) {
      console.error(err);
      res.json({ user: null });
    }
  });

  // 2. Login endpoint
  app.post('/api/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) {
        return res.status(401).json({ error: 'Access authorization rejected.' });
      }

      if (hashPassword(password) !== user.password) {
        return res.status(401).json({ error: 'Access authorization rejected.' });
      }

      res.cookie('session', user.id, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstLogin: user.firstLogin !== 0
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error during login' });
    }
  });

  // 3. Logout endpoint
  app.post('/api/logout', (req, res) => {
    res.clearCookie('session', { path: '/' });
    res.json({ success: true });
  });

  // 3.5 Update credentials endpoint
  app.post('/api/user/update', checkAuth, async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = (req as any).user;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      if (password) {
        const hashedPassword = hashPassword(password);
        await db.run(
          `UPDATE users SET email = ?, password = ?, firstLogin = 0 WHERE id = ?`,
          [email, hashedPassword, user.id]
        );
      } else {
        await db.run(
          `UPDATE users SET email = ? WHERE id = ?`,
          [email, user.id]
        );
      }

      await db.run(
        `UPDATE preferences SET email = ? WHERE id = 'default'`,
        [email]
      );

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Operator', ?)`,
        [logId, timeStr, `Operator updated account credentials (email: ${email}).`]
      );

      res.json({ success: true, email });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update credentials' });
    }
  });

  // 4. Get preferences
  app.get('/api/preferences', checkAuth, async (req, res) => {
    try {
      const pref = await db.get("SELECT * FROM preferences WHERE id = 'default'");
      res.json({
        ...pref,
        enableNotifications: Boolean(pref.enableNotifications),
        alertEmailEnabled: Boolean(pref.alertEmailEnabled),
        alertNotifyEnabled: Boolean(pref.alertNotifyEnabled),
        alertUptimeDown: Boolean(pref.alertUptimeDown),
        alertSslExpire: Boolean(pref.alertSslExpire),
        alertContainerDown: Boolean(pref.alertContainerDown),
        alertContainerOverloaded: Boolean(pref.alertContainerOverloaded),
        moduleMesh: Boolean(pref.moduleMesh ?? true),
        moduleContainers: Boolean(pref.moduleContainers ?? true),
        moduleStorage: Boolean(pref.moduleStorage ?? true),
        moduleUptime: Boolean(pref.moduleUptime ?? true),
        moduleDomains: Boolean(pref.moduleDomains ?? true),
        debugMode: Boolean(pref.debugMode),
        daemonPollInterval: Number(pref.daemonPollInterval ?? 5),
        domainCheckInterval: Number(pref.domainCheckInterval ?? 30),
        httpPingTimeout: Number(pref.httpPingTimeout ?? 5000),
        sshCommandTimeout: Number(pref.sshCommandTimeout ?? 10000),
        domainLookupTimeout: Number(pref.domainLookupTimeout ?? 10000),
        smtpTimeout: Number(pref.smtpTimeout ?? 5000),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 5. Update preferences
  app.post('/api/preferences', checkAuth, async (req, res) => {
    try {
      const p = req.body || {};
      const existing = await db.get("SELECT * FROM preferences WHERE id = 'default'");
      if (!existing) {
        return res.status(404).json({ error: 'Preferences record not found' });
      }

      const theme = p.theme ?? existing.theme;
      const mode = p.mode ?? existing.mode;
      const layout = p.layout ?? existing.layout;
      const email = p.email ?? existing.email;
      const refreshRate = p.refreshRate !== undefined ? Number(p.refreshRate) : existing.refreshRate;
      const enableNotifications = p.enableNotifications !== undefined ? (p.enableNotifications ? 1 : 0) : existing.enableNotifications;
      const apiKey = p.apiKey ?? existing.apiKey;
      const envName = p.envName ?? existing.envName;

      const alertEmailEnabled = p.alertEmailEnabled !== undefined ? (p.alertEmailEnabled ? 1 : 0) : existing.alertEmailEnabled;
      const alertNotifyEnabled = p.alertNotifyEnabled !== undefined ? (p.alertNotifyEnabled ? 1 : 0) : existing.alertNotifyEnabled;
      const alertUptimeDown = p.alertUptimeDown !== undefined ? (p.alertUptimeDown ? 1 : 0) : existing.alertUptimeDown;
      const alertSslExpire = p.alertSslExpire !== undefined ? (p.alertSslExpire ? 1 : 0) : existing.alertSslExpire;
      const alertStorageThreshold = p.alertStorageThreshold !== undefined ? Number(p.alertStorageThreshold) : existing.alertStorageThreshold;
      const alertContainerDown = p.alertContainerDown !== undefined ? (p.alertContainerDown ? 1 : 0) : existing.alertContainerDown;
      const alertContainerOverloaded = p.alertContainerOverloaded !== undefined ? (p.alertContainerOverloaded ? 1 : 0) : existing.alertContainerOverloaded;

      const moduleMesh = p.moduleMesh !== undefined ? (p.moduleMesh ? 1 : 0) : existing.moduleMesh;
      const moduleContainers = p.moduleContainers !== undefined ? (p.moduleContainers ? 1 : 0) : existing.moduleContainers;
      const moduleStorage = p.moduleStorage !== undefined ? (p.moduleStorage ? 1 : 0) : existing.moduleStorage;
      const moduleUptime = p.moduleUptime !== undefined ? (p.moduleUptime ? 1 : 0) : existing.moduleUptime;
      const moduleDomains = p.moduleDomains !== undefined ? (p.moduleDomains ? 1 : 0) : existing.moduleDomains;

      const smtpHost = p.smtpHost !== undefined ? p.smtpHost : existing.smtpHost;
      const smtpPort = p.smtpPort !== undefined ? Number(p.smtpPort) : existing.smtpPort;
      const smtpUser = p.smtpUser !== undefined ? p.smtpUser : existing.smtpUser;
      const smtpPass = p.smtpPass !== undefined ? p.smtpPass : existing.smtpPass;
      const smtpFrom = p.smtpFrom !== undefined ? p.smtpFrom : existing.smtpFrom;

      const debugMode = p.debugMode !== undefined ? (p.debugMode ? 1 : 0) : existing.debugMode;
      const daemonPollInterval = p.daemonPollInterval !== undefined ? Number(p.daemonPollInterval) : existing.daemonPollInterval;
      const domainCheckInterval = p.domainCheckInterval !== undefined ? Number(p.domainCheckInterval) : existing.domainCheckInterval;
      const httpPingTimeout = p.httpPingTimeout !== undefined ? Number(p.httpPingTimeout) : existing.httpPingTimeout;
      const sshCommandTimeout = p.sshCommandTimeout !== undefined ? Number(p.sshCommandTimeout) : existing.sshCommandTimeout;
      const domainLookupTimeout = p.domainLookupTimeout !== undefined ? Number(p.domainLookupTimeout) : existing.domainLookupTimeout;
      const smtpTimeout = p.smtpTimeout !== undefined ? Number(p.smtpTimeout) : existing.smtpTimeout;

      await db.run(
        `UPDATE preferences
         SET theme = ?, mode = ?, layout = ?, email = ?, refreshRate = ?, enableNotifications = ?, apiKey = ?, envName = ?,
             alertEmailEnabled = ?, alertNotifyEnabled = ?, alertUptimeDown = ?, alertSslExpire = ?, alertStorageThreshold = ?,
             alertContainerDown = ?, alertContainerOverloaded = ?, moduleMesh = ?, moduleContainers = ?, moduleStorage = ?,
             moduleUptime = ?, moduleDomains = ?, smtpHost = ?, smtpPort = ?, smtpUser = ?, smtpPass = ?, smtpFrom = ?, debugMode = ?,
             daemonPollInterval = ?, domainCheckInterval = ?, httpPingTimeout = ?, sshCommandTimeout = ?, domainLookupTimeout = ?, smtpTimeout = ?
         WHERE id = 'default'`,
        [
          theme, mode, layout, email, refreshRate, enableNotifications, apiKey, envName,
          alertEmailEnabled, alertNotifyEnabled, alertUptimeDown, alertSslExpire, alertStorageThreshold,
          alertContainerDown, alertContainerOverloaded, moduleMesh, moduleContainers, moduleStorage,
          moduleUptime, moduleDomains, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, debugMode,
          daemonPollInterval, domainCheckInterval, httpPingTimeout, sshCommandTimeout, domainLookupTimeout, smtpTimeout
        ]
      );
      const updated = await db.get("SELECT * FROM preferences WHERE id = 'default'");
      res.json({
        ...updated,
        enableNotifications: Boolean(updated.enableNotifications),
        alertEmailEnabled: Boolean(updated.alertEmailEnabled),
        alertNotifyEnabled: Boolean(updated.alertNotifyEnabled),
        alertUptimeDown: Boolean(updated.alertUptimeDown),
        alertSslExpire: Boolean(updated.alertSslExpire),
        alertContainerDown: Boolean(updated.alertContainerDown),
        alertContainerOverloaded: Boolean(updated.alertContainerOverloaded),
        moduleMesh: Boolean(updated.moduleMesh ?? true),
        moduleContainers: Boolean(updated.moduleContainers ?? true),
        moduleStorage: Boolean(updated.moduleStorage ?? true),
        moduleUptime: Boolean(updated.moduleUptime ?? true),
        moduleDomains: Boolean(updated.moduleDomains ?? true),
        debugMode: Boolean(updated.debugMode),
        daemonPollInterval: Number(updated.daemonPollInterval ?? 5),
        domainCheckInterval: Number(updated.domainCheckInterval ?? 30),
        httpPingTimeout: Number(updated.httpPingTimeout ?? 5000),
        sshCommandTimeout: Number(updated.sshCommandTimeout ?? 10000),
        domainLookupTimeout: Number(updated.domainLookupTimeout ?? 10000),
        smtpTimeout: Number(updated.smtpTimeout ?? 5000),
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Database error' });
    }
  });

  // 5.0.1 Test SMTP Server Connection & Dispatch
  app.post('/api/preferences/test-smtp', checkAuth, async (req, res) => {
    try {
      const p = req.body || {};
      const smtpHost = p.smtpHost || p.host;
      const smtpPort = Number(p.smtpPort || p.port || 587);
      const smtpUser = p.smtpUser || p.user;
      const smtpPass = p.smtpPass || p.pass;
      const smtpFrom = p.smtpFrom || p.from || smtpUser || 'alerts@vitalmesh.io';
      const smtpTimeout = Number(p.smtpTimeout || 5000);

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.status(400).json({ error: 'Missing required SMTP connection parameters (host, user, or pass)' });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: smtpTimeout,
        greetingTimeout: smtpTimeout,
        socketTimeout: smtpTimeout * 2
      });

      const pref = await db.get("SELECT email FROM preferences WHERE id = 'default'");
      const targetEmail = p.email || pref?.email || smtpUser;

      await transporter.sendMail({
        from: smtpFrom,
        to: targetEmail,
        subject: '[VitalMesh SMTP Test] Outbound Mail System Check',
        html: `
          <div style="font-family: monospace; background: #0c1017; color: #e2e8f0; padding: 20px; border: 1px solid #1a2333;">
            <h2 style="color: #3b82f6; border-bottom: 1px solid #334155; padding-bottom: 8px;">
              SMTP Verification Succeeded
            </h2>
            <p style="font-size: 13px;">This email verifies that outbound SMTP alerts are configured correctly on your VitalMesh Console.</p>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
            <table style="font-size: 11px; color: #94a3b8;">
              <tr><td><b>SMTP Host:</b></td><td>${smtpHost}</td></tr>
              <tr><td><b>Port:</b></td><td>${smtpPort}</td></tr>
              <tr><td><b>User:</b></td><td>${smtpUser}</td></tr>
              <tr><td><b>Target Destination:</b></td><td>${targetEmail}</td></tr>
            </table>
          </div>
        `
      });

      res.json({ success: true, message: `Test email sent successfully to ${targetEmail}` });
    } catch (err: any) {
      console.error('[SMTP Test Error]:', err);
      res.status(500).json({
        error: err.message || 'SMTP Handshake / Authentication failed',
        code: err.code,
        syscall: err.syscall,
        address: err.address,
        port: err.port,
        command: err.command,
        response: err.response,
        stack: err.stack
      });
    }
  });

  // 5.1 System Backup ZIP Download
  app.get('/api/backup', checkAuth, async (req, res) => {
    try {
      const dataDir = path.resolve(process.cwd(), 'data');
      const dbPath = path.resolve(dataDir, 'vitalmesh.db');
      if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ error: 'Database file not found' });
      }

      const logs = await db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 500");
      const logsText = logs.map(l => `[${l.timestamp}] [${l.level}] [${l.source || 'SYSTEM'}] ${l.message}`).join('\n');

      const zip = new AdmZip();
      zip.addLocalFile(dbPath);
      zip.addFile('system-logs-export.txt', Buffer.from(logsText, 'utf8'));

      const backupMeta = JSON.stringify({
        backedUpAt: new Date().toISOString(),
        operatingEnvironment: 'VitalMesh Homelab',
        version: '2.0.0'
      }, null, 2);
      zip.addFile('backup-metadata.json', Buffer.from(backupMeta, 'utf8'));

      const zipBuffer = zip.toBuffer();

      const timeStamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=vitalmesh-backup-${timeStamp}.zip`);
      res.send(zipBuffer);

      const nowIso = new Date().toISOString();
      const logId = `log-${Date.now()}`;
      await db.run("UPDATE preferences SET lastBackupAt = ?", [nowIso]).catch(() => {});
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Operator', ?)`,
        [logId, nowIso, 'Generated and downloaded a full-system configuration backup ZIP archive.']
      );

    } catch (err) {
      console.error('Backup error:', err);
      res.status(500).json({ error: 'Failed to generate system backup archive.' });
    }
  });

  // 5.2 System Backup JSON Export
  app.get('/api/backup/json/export', checkAuth, async (req, res) => {
    try {
      const users = await db.all('SELECT * FROM users');
      const preferences = await db.all('SELECT * FROM preferences');
      const nodes = await db.all('SELECT * FROM nodes');
      const containers = await db.all('SELECT * FROM containers');
      const services = await db.all('SELECT * FROM services');
      const disks = await db.all('SELECT * FROM disks');
      const logs = await db.all('SELECT * FROM logs');
      const alerts = await db.all('SELECT * FROM alerts');
      const domains = await db.all('SELECT * FROM domains');

      const backupData = {
        metadata: {
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          operatingEnvironment: 'VitalMesh Homelab'
        },
        users,
        preferences,
        nodes,
        containers,
        services,
        disks,
        logs,
        alerts,
        domains
      };

      const timeStamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=vitalmesh-backup-${timeStamp}.json`);
      res.json(backupData);

      const nowIso = new Date().toISOString();
      const logId = `log-${Date.now()}`;
      await db.run("UPDATE preferences SET lastBackupAt = ?", [nowIso]).catch(() => {});
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Operator', ?)`,
        [logId, nowIso, 'Exported a full JSON content configuration backup.']
      );
    } catch (err) {
      console.error('JSON export error:', err);
      res.status(500).json({ error: 'Failed to generate JSON backup export.' });
    }
  });

  // 5.3 System Backup JSON Import
  app.post('/api/backup/json/import', checkAuth, async (req, res) => {
    try {
      const body = req.body;
      const backupData = (body && body.data) ? (typeof body.data === 'string' ? JSON.parse(body.data) : body.data) : body;
      
      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ error: 'Invalid backup format' });
      }

      if (Array.isArray(backupData.services)) {
        for (const s of backupData.services) {
          const id = s.id || `svc-${Date.now()}`;
          const existing = await db.get('SELECT id FROM services WHERE id = ?', [id]);
          if (!existing) {
            await db.run(
              `INSERT INTO services (id, name, url, status, uptimePercentage, latency, history, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, s.name, s.url, s.status || 'healthy', s.uptimePercentage || 100, s.latency || 0, JSON.stringify(s.history || Array(10).fill('up')), s.category || 'HTTP Probes']
            );
          }
        }
      }

      if (Array.isArray(backupData.domains)) {
        for (const d of backupData.domains) {
          const id = d.id || `domain-${Date.now()}`;
          const existing = await db.get('SELECT id FROM domains WHERE id = ?', [id]);
          if (!existing) {
            await db.run(
              `INSERT INTO domains (id, domainName, sslStatus, sslIssuer, sslExpiryDays, validUntil, dnsRecords, lastChecked)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, d.domainName, d.sslStatus || 'valid', d.sslIssuer || "Let's Encrypt", d.sslExpiryDays || 60, d.validUntil || '2027-01-01', JSON.stringify(d.dnsRecords || {}), 'Just now']
            );
          }
        }
      }

      if (Array.isArray(backupData.nodes)) {
        for (const n of backupData.nodes) {
          if (n.id === 'node-local') continue;
          const existing = await db.get('SELECT id FROM nodes WHERE id = ?', [n.id]);
          if (!existing) {
            await db.run(
              `INSERT INTO nodes (id, name, status, ip, cpu, cpuHistory, ramUsed, ramTotal, ramHistory, temp, uptime, txSpeed, rxSpeed, sshUsername, sshPassword, sshKey, sshPort, isPaused)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [n.id, n.name, n.status || 'healthy', n.ip, n.cpu || 0, JSON.stringify(n.cpuHistory || []), n.ramUsed || 0, n.ramTotal || 16, JSON.stringify(n.ramHistory || []), n.temp || 40, n.uptime || '0m', 0, 0, n.sshUsername || null, n.sshPassword || null, n.sshKey || null, n.sshPort || 22, 0]
            );
          }
        }
      }

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Operator', ?)`,
        [logId, timeStr, 'Successfully imported configuration backup.']
      );

      res.json({ success: true, message: 'Backup restored successfully' });
    } catch (err: any) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'Failed to import JSON configuration backup: ' + err.message });
    }
  });

  // 5.4 Domains Routes
  app.get('/api/domains', checkAuth, async (req, res) => {
    try {
      const domains = await db.all('SELECT * FROM domains');
      const mapped = domains.map(d => ({
        ...d,
        dnsRecords: JSON.parse(d.dnsRecords || '{}')
      }));
      res.json(mapped);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/domains', checkAuth, async (req, res) => {
    try {
      const { domainName } = req.body;
      if (!domainName) {
        return res.status(400).json({ error: 'Domain name is required' });
      }
      const id = `domain-${Date.now()}`;
      await db.run(
        `INSERT INTO domains (id, domainName, dnsRecords, sslExpireDate, sslStatus, lastChecked)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, domainName, '{}', '', 'unknown', '']
      );

      setTimeout(async () => {
        try {
          await checkDomainTelemetry(id, domainName);
        } catch (e) {
          console.error('Initial domain check failed:', e);
        }
      }, 0);

      const created = await db.get('SELECT * FROM domains WHERE id = ?', [id]);
      res.json({
        ...created,
        dnsRecords: JSON.parse(created.dnsRecords || '{}')
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/domains/:id', checkAuth, async (req, res) => {
    try {
      const { domainName } = req.body;
      const { id } = req.params;
      if (!domainName) {
        return res.status(400).json({ error: 'Domain name is required' });
      }
      await db.run(
        `UPDATE domains SET domainName = ? WHERE id = ?`,
        [domainName, id]
      );

      setTimeout(async () => {
        try {
          await checkDomainTelemetry(id, domainName);
        } catch (e) {
          console.error('Domain edit update check failed:', e);
        }
      }, 0);

      const updated = await db.get('SELECT * FROM domains WHERE id = ?', [id]);
      res.json({
        ...updated,
        dnsRecords: JSON.parse(updated.dnsRecords || '{}')
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/domains/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM domains WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/domains/:id/check', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const domain = await db.get('SELECT * FROM domains WHERE id = ?', [id]);
      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }
      const updated = await checkDomainTelemetry(id, domain.domainName);
      res.json(updated);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Verification check failed' });
    }
  });

  // 6. Get nodes
  app.get('/api/nodes', checkAuth, async (req, res) => {
    try {
      const dbNodes = await db.all('SELECT * FROM nodes');
      const mappedNodes = dbNodes.map(node => ({
        ...node,
        cpuHistory: JSON.parse(node.cpuHistory || '[]'),
        ramHistory: JSON.parse(node.ramHistory || '[]'),
        isPaused: Boolean(node.isPaused),
      }));
      res.json(mappedNodes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 6.1 Toggle Pause node telemetry stats
  app.post('/api/nodes/:id/toggle-pause', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const node = await db.get('SELECT * FROM nodes WHERE id = ?', [id]);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      const newPaused = node.isPaused ? 0 : 1;
      await db.run('UPDATE nodes SET isPaused = ? WHERE id = ?', [newPaused, id]);

      const updated = await db.get('SELECT * FROM nodes WHERE id = ?', [id]);
      res.json({
        ...updated,
        cpuHistory: JSON.parse(updated.cpuHistory || '[]'),
        ramHistory: JSON.parse(updated.ramHistory || '[]'),
        isPaused: Boolean(updated.isPaused)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 7. Register VPS Linux node
  app.post('/api/nodes', checkAuth, async (req, res) => {
    try {
      const { name, ip, ramTotal, sshUsername, sshPassword, sshKey, sshPort } = req.body;
      if (!name || !ip) {
        return res.status(400).json({ error: 'Name and IP are required' });
      }
      const id = `node-${Date.now()}`;
      const ramTotalVal = parseFloat(ramTotal) || 8.0;
      const cpuHistory = JSON.stringify(Array(9).fill(0));
      const ramHistory = JSON.stringify(Array(9).fill(0));

      await db.run(
        `INSERT INTO nodes (id, name, status, ip, cpu, cpuHistory, ramUsed, ramTotal, ramHistory, temp, uptime, sshUsername, sshPassword, sshKey, sshPort, isPaused)
         VALUES (?, ?, 'offline', ?, 0, ?, 0, ?, ?, NULL, 'offline', ?, ?, ?, ?, 0)`,
        [
          id,
          name,
          ip,
          cpuHistory,
          ramTotalVal,
          ramHistory,
          sshUsername || null,
          sshPassword || null,
          sshKey || null,
          sshPort ? Number(sshPort) : 22
        ]
      );

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Monitor', ?)`,
        [logId, timeStr, `Registered new external VPS Linux node: ${name} (${ip})`]
      );

      const created = await db.get('SELECT * FROM nodes WHERE id = ?', [id]);
      res.json({
        ...created,
        cpuHistory: JSON.parse(created.cpuHistory || '[]'),
        ramHistory: JSON.parse(created.ramHistory || '[]'),
        isPaused: false
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 8. De-register VPS node
  app.delete('/api/nodes/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (id === 'node-local') {
        return res.status(400).json({ error: 'Cannot delete primary local host node' });
      }
      const node = await db.get('SELECT * FROM nodes WHERE id = ?', [id]);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      await db.run('DELETE FROM nodes WHERE id = ?', [id]);

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'System Monitor', ?)`,
        [logId, timeStr, `De-registered external VPS node: ${node.name}`]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 8.1 Edit VPS Node
  app.put('/api/nodes/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, ip, ramTotal, sshUsername, sshPassword, sshKey, sshPort } = req.body;
      await db.run(
        `UPDATE nodes
         SET name = ?, ip = ?, ramTotal = ?, sshUsername = ?, sshPassword = ?, sshKey = ?, sshPort = ?
         WHERE id = ?`,
        [
          name,
          ip,
          Number(ramTotal || 8.0),
          sshUsername || null,
          sshPassword || null,
          sshKey || null,
          sshPort ? Number(sshPort) : 22,
          id
        ]
      );
      const updated = await db.get('SELECT * FROM nodes WHERE id = ?', [id]);
      res.json({
        ...updated,
        cpuHistory: JSON.parse(updated.cpuHistory || '[]'),
        ramHistory: JSON.parse(updated.ramHistory || '[]'),
        isPaused: Boolean(updated.isPaused)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 9. Get Docker containers
  app.get('/api/containers', checkAuth, async (req, res) => {
    try {
      const dbContainers = await db.all('SELECT * FROM containers');
      const filtered = dbContainers.filter(c =>
        !c.name.toLowerCase().includes('vitalmesh') &&
        !c.image.toLowerCase().includes('vitalmesh')
      );
      const mappedContainers = filtered.map(c => ({
        ...c,
        logs: JSON.parse(c.logs || '[]'),
      }));
      res.json(mappedContainers);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 10. Register external Docker container
  app.post('/api/containers', checkAuth, async (req, res) => {
    try {
      const { name, image, ports, maxRam, nodeId, ip, url, githubUrl } = req.body;
      if (!name || !image) {
        return res.status(400).json({ error: 'Container Name and Image are required' });
      }

      const id = `c-${Date.now()}`;
      const mRam = parseFloat(maxRam) || 512;
      const logs = JSON.stringify([
        `External container ${name} registered.`,
        `Image: ${image}`,
      ]);

      await db.run(
        `INSERT INTO containers (id, name, image, status, cpu, ram, maxRam, uptime, ports, logs, nodeId, ip, url, githubUrl)
         VALUES (?, ?, ?, 'stopped', 0, 0, ?, 'offline', ?, ?, ?, ?, ?, ?)`,
        [id, name, image, mRam, ports || '', logs, nodeId || 'node-local', ip || null, url || null, githubUrl || null]
      );

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Docker Daemon', ?)`,
        [logId, timeStr, `Registered new external Docker container: ${name} (Image: ${image})`]
      );

      const created = await db.get('SELECT * FROM containers WHERE id = ?', [id]);
      res.json({
        ...created,
        logs: JSON.parse(created.logs || '[]'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 10.5 Auto-import containers from host or external Docker TCP host daemon
  app.post('/api/containers/import-host', checkAuth, async (req, res) => {
    try {
      let { hostUrl, nodeId } = req.body;
      if (!hostUrl) {
        await scanLocalContainers();
        const dbContainers = await db.all('SELECT * FROM containers');
        return res.json(dbContainers.map(c => ({ ...c, logs: JSON.parse(c.logs || '[]') })));
      }

      if (!hostUrl.startsWith('http://') && !hostUrl.startsWith('https://')) {
        hostUrl = 'http://' + hostUrl;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${hostUrl}/containers/json?all=1`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({ error: `Docker API responded with status ${response.status}` });
      }

      const rawContainers = await response.json();
      if (!Array.isArray(rawContainers)) {
        return res.status(400).json({ error: 'Docker Host API returned invalid response (expected array of containers)' });
      }

      let importedCount = 0;
      for (const raw of rawContainers) {
        const rawName = raw.Names && raw.Names[0] ? raw.Names[0] : `imported-${Date.now()}`;
        const name = rawName.startsWith('/') ? rawName.slice(1) : rawName;
        const image = raw.Image || 'unknown:latest';
        
        let status = 'stopped';
        if (raw.State === 'running') {
          status = 'running';
        } else if (raw.State === 'paused') {
          status = 'paused';
        }

        let ports = '';
        if (Array.isArray(raw.Ports) && raw.Ports.length > 0) {
          ports = raw.Ports
            .filter((p: any) => p.PublicPort)
            .map((p: any) => `${p.PublicPort}:${p.PrivatePort}`)
            .join(', ');
        }

        const existing = await db.get('SELECT * FROM containers WHERE name = ? AND nodeId = ?', [name, nodeId || 'node-local']);
        
        if (existing) {
          await db.run(
            `UPDATE containers SET image = ?, status = ?, ports = ? WHERE id = ?`,
            [image, status, ports || existing.ports, existing.id]
          );
        } else {
          const id = `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const logs = JSON.stringify([
            `Imported container ${name} from docker host ${hostUrl}.`,
            `Image: ${image}`,
          ]);
          await db.run(
            `INSERT INTO containers (id, name, image, status, cpu, ram, maxRam, uptime, ports, logs, nodeId)
             VALUES (?, ?, ?, ?, 0, 0, 512, 'offline', ?, ?, ?)`,
            [id, name, image, status, ports, logs, nodeId || 'node-local']
          );
          importedCount++;
        }
      }

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Docker Daemon', ?)`,
        [logId, timeStr, `Successfully auto-imported/synced ${importedCount} containers from Docker host: ${hostUrl}`]
      );

      res.json({ success: true, count: importedCount });
    } catch (err: any) {
      console.error('Docker import error:', err);
      let errorMsg = 'Failed to connect to Docker host TCP socket.';
      if (err.name === 'AbortError') {
        errorMsg = 'Connection timed out. Check firewall rules.';
      } else if (err.code === 'ECONNREFUSED' || err.message?.includes('refused')) {
        errorMsg = 'Connection refused. Docker TCP socket might not be active.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // 11. De-register Docker container
  app.delete('/api/containers/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const container = await db.get('SELECT * FROM containers WHERE id = ?', [id]);
      if (!container) {
        return res.status(404).json({ error: 'Container not found' });
      }

      await db.run('DELETE FROM containers WHERE id = ?', [id]);

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Docker Daemon', ?)`,
        [logId, timeStr, `De-registered container: ${container.name}`]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 11.1 Edit Docker Container
  app.put('/api/containers/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, image, ports, maxRam, nodeId, ip, url, githubUrl } = req.body;
      await db.run(
        `UPDATE containers SET name = ?, image = ?, ports = ?, maxRam = ?, nodeId = ?, ip = ?, url = ?, githubUrl = ? WHERE id = ?`,
        [name, image, ports || '', Number(maxRam || 1024), nodeId || 'node-local', ip || null, url || null, githubUrl || null, id]
      );
      const updated = await db.get('SELECT * FROM containers WHERE id = ?', [id]);
      res.json({
        ...updated,
        logs: JSON.parse(updated.logs || '[]'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 12. Toggle Docker container state
  app.post('/api/containers/:id/toggle', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const container = await db.get('SELECT * FROM containers WHERE id = ? OR name = ?', [id, id.replace(/^cnt-local-/, '')]);
      if (!container) {
        return res.status(404).json({ error: 'Container not found' });
      }

      transitionLocks.set(container.name, Date.now());
      transitionLocks.set(container.id, Date.now());

      const isRunning = container.status === 'running' || container.status === 'up' || container.status?.toLowerCase().includes('up');
      const newStatus = isRunning ? 'stopped' : 'running';
      const action = isRunning ? 'stop' : 'start';

      const isRemoteContext = container.nodeId && container.nodeId !== 'node-local';

      try {
        if (isRemoteContext) {
          const dockerName = container.id.startsWith('c-oracle-') ? container.id.replace('c-oracle-', '') : container.name;
          await execAsync(`docker --context ` + oracleName + ` ${action} "${dockerName}"`);
        } else {
          await execAsync(`docker ${action} "${container.name}"`);
        }
      } catch (e: any) {
        console.warn(`[Container Toggle] Docker ${action} warning:`, e?.message || e);
      }

      await db.run('UPDATE containers SET status = ? WHERE id = ?', [newStatus, container.id]);
      await writeLog('INFO', 'Container Controller', `Toggled container "${container.name}" status to ${newStatus}`);

      await scanLocalContainers();

      const updated = await db.get('SELECT * FROM containers WHERE id = ?', [container.id]);
      if (updated) {
        await checkContainerAlerts(updated);
      }
      res.json({
        ...updated,
        logs: JSON.parse(updated?.logs || '[]')
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Database error' });
    }
  });

  // 13. Restart Docker container
  app.post('/api/containers/:id/restart', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const container = await db.get('SELECT * FROM containers WHERE id = ? OR name = ?', [id, id.replace(/^cnt-local-/, '')]);
      if (!container) {
        return res.status(404).json({ error: 'Container not found' });
      }

      transitionLocks.set(container.name, Date.now());
      transitionLocks.set(container.id, Date.now());

      const isRemoteContext = container.nodeId && container.nodeId !== 'node-local';

      try {
        if (isRemoteContext) {
          const dockerName = container.id.startsWith('c-oracle-') ? container.id.replace('c-oracle-', '') : container.name;
          await execAsync(`docker --context ` + oracleName + ` restart "${dockerName}"`);
        } else {
          await execAsync(`docker restart "${container.name}"`);
        }
      } catch (e: any) {
        console.warn(`[Container Restart] Docker restart warning:`, e?.message || e);
      }

      await db.run("UPDATE containers SET status = 'running' WHERE id = ?", [container.id]);
      await writeLog('INFO', 'Container Controller', `Restarted container "${container.name}"`);

      await scanLocalContainers();

      const updated = await db.get('SELECT * FROM containers WHERE id = ?', [container.id]);
      if (updated) {
        await checkContainerAlerts(updated);
      }
      res.json({
        ...updated,
        logs: JSON.parse(updated?.logs || '[]')
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Database error' });
    }
  });

  // 13.5 Container action route
  app.post('/api/containers/:id/action', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { action } = req.body;
      const container = await db.get('SELECT * FROM containers WHERE id = ? OR name = ?', [id, id.replace(/^cnt-local-/, '')]);
      if (!container) {
        return res.status(404).json({ error: 'Container not found' });
      }

      let newStatus = container.status;
      if (action === 'start') {
        newStatus = 'running';
        try { await execAsync(`docker start "${container.name}"`); } catch {}
      } else if (action === 'stop') {
        newStatus = 'stopped';
        try { await execAsync(`docker stop "${container.name}"`); } catch {}
      } else if (action === 'restart') {
        newStatus = 'running';
        try { await execAsync(`docker restart "${container.name}"`); } catch {}
      }

      await db.run('UPDATE containers SET status = ? WHERE id = ?', [newStatus, container.id]);
      await scanLocalContainers();

      const updated = await db.get('SELECT * FROM containers WHERE id = ?', [container.id]);
      res.json({
        ...updated,
        logs: JSON.parse(updated?.logs || '[]')
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Database error' });
    }
  });

  // 14. Get services
  app.get('/api/services', checkAuth, async (req, res) => {
    try {
      const dbServices = await db.all('SELECT * FROM services');
      const mappedServices = dbServices.map(s => ({
        ...s,
        history: JSON.parse(s.history || '[]'),
      }));
      res.json(mappedServices);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 15. Add services
  app.post('/api/services', checkAuth, async (req, res) => {
    try {
      const { id, name, url, category } = req.body;
      const svcId = id || `s-${Date.now()}`;
      
      let status = 'healthy';
      let latency = 50;
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const testRes = await fetch(url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        latency = Date.now() - start;
        if (testRes.status >= 500) {
          status = 'alert';
        } else if (testRes.status >= 400 || latency > 400) {
          status = 'warning';
        }
      } catch {
        status = 'alert';
        latency = 0;
      }

      const initialStatus = status as 'healthy' | 'warning' | 'alert';
      const initialHistory = Array(29).fill(initialStatus === 'healthy' ? 'up' : (initialStatus === 'warning' ? 'slow' : 'down'));
      initialHistory.push(initialStatus === 'healthy' ? 'up' : (initialStatus === 'warning' ? 'slow' : 'down'));

      await db.run(
        `INSERT INTO services (id, name, url, status, uptimePercentage, latency, history, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [svcId, name, url, initialStatus, initialStatus === 'healthy' ? 100.0 : 0.0, latency, JSON.stringify(initialHistory), category || 'HTTP Probes']
      );

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Uptime Monitor', ?)`,
        [logId, timeStr, `Registered new external monitor target: ${name} (${url})`]
      );

      const created = await db.get('SELECT * FROM services WHERE id = ?', [svcId]);
      res.json({
        ...created,
        history: JSON.parse(created.history || '[]'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 16. Remove service
  app.delete('/api/services/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const service = await db.get('SELECT * FROM services WHERE id = ?', [id]);
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      await db.run('DELETE FROM services WHERE id = ?', [id]);

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Uptime Monitor', ?)`,
        [logId, timeStr, `De-registered monitor target: ${service.name}`]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 16.1 Edit Service
  app.put('/api/services/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, url, category } = req.body;
      await db.run(
        `UPDATE services SET name = ?, url = ?, category = ? WHERE id = ?`,
        [name, url, category || 'HTTP Probes', id]
      );
      const updated = await db.get('SELECT * FROM services WHERE id = ?', [id]);
      res.json({
        ...updated,
        history: JSON.parse(updated.history || '[]'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 17. Get disks
  app.get('/api/disks', checkAuth, async (req, res) => {
    try {
      const dbDisks = await db.all('SELECT * FROM disks');
      res.json(dbDisks);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 18. Add disk
  app.post('/api/disks', checkAuth, async (req, res) => {
    try {
      const {
        id,
        name,
        type,
        sizeUsed,
        sizeTotal,
        health,
        temp,
        ip,
        nodeId,
        sshUsername,
        sshPassword,
        sshKey,
        sshPort,
        sshPath
      } = req.body;

      const diskId = id || `disk-${Date.now()}`;

      await db.run(
        `INSERT INTO disks (
          id, name, type, sizeUsed, sizeTotal, health, temp, ip, nodeId,
          sshUsername, sshPassword, sshKey, sshPort, sshPath
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          diskId,
          name,
          type || 'zfs',
          Number(sizeUsed || 0.1),
          Number(sizeTotal || 4.0),
          health || 'healthy',
          Number(temp || 34),
          ip || null,
          nodeId || 'node-local',
          sshUsername || null,
          sshPassword || null,
          sshKey || null,
          sshPort ? Number(sshPort) : 22,
          sshPath || null
        ]
      );

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Storage Daemon', ?)`,
        [logId, timeStr, `Provisioned storage pool [${name}] (${sizeTotal} TB)`]
      );

      const created = await db.get('SELECT * FROM disks WHERE id = ?', [diskId]);
      res.json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 18.1 Edit Disk
  app.put('/api/disks/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const {
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
      } = req.body;

      await db.run(
        `UPDATE disks
         SET name = ?, type = ?, sizeTotal = ?, ip = ?, nodeId = ?,
             sshUsername = ?, sshPassword = ?, sshKey = ?, sshPort = ?, sshPath = ?
         WHERE id = ?`,
        [
          name,
          type || 'zfs',
          Number(sizeTotal || 4.0),
          ip || null,
          nodeId || 'node-local',
          sshUsername || null,
          sshPassword || null,
          sshKey || null,
          sshPort ? Number(sshPort) : 22,
          sshPath || null,
          id
        ]
      );
      const updated = await db.get('SELECT * FROM disks WHERE id = ?', [id]);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 18.2 Remove Disk Pool
  app.delete('/api/disks/:id', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const disk = await db.get('SELECT * FROM disks WHERE id = ?', [id]);
      if (!disk) {
        return res.status(404).json({ error: 'Disk pool not found' });
      }

      await db.run('DELETE FROM disks WHERE id = ?', [id]);

      const timeStr = new Date().toTimeString().split(' ')[0];
      const logId = `log-${Date.now()}`;
      await db.run(
        `INSERT INTO logs (id, timestamp, level, source, message)
         VALUES (?, ?, 'INFO', 'Storage Core', ?)`,
        [logId, timeStr, `De-registered storage pool target: ${disk.name}`]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 18.3 Diagnose Storage Pool
  app.post('/api/disks/:id/diagnose', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const disk = await db.get('SELECT * FROM disks WHERE id = ?', [id]);
      if (!disk) {
        return res.status(404).json({ error: 'Disk pool not found' });
      }

      if (disk.sshUsername) {
        const config: any = {
          host: disk.ip,
          port: disk.sshPort || 22,
          username: disk.sshUsername,
          readyTimeout: 10000,
        };
        if (disk.sshKey) {
          config.privateKey = disk.sshKey;
        } else if (disk.sshPassword) {
          config.password = disk.sshPassword;
        }

        try {
          const pathStr = disk.sshPath || '/';
          const dfOutput = await sshExecCommand(config, `df -h "${pathStr}"`);
          const smartOutput = await sshExecCommand(config, `smartctl -H /dev/sda || echo "smartctl command not found or requires root access."`).catch(() => "smartctl check failed.");
          
          const result = `=== REMOTE STORAGE DIAGNOSTICS FOR [${disk.name}] ===\n` +
            `Connection: ssh://${disk.sshUsername}@${disk.ip}:${disk.sshPort || 22}\n` +
            `Mount Path: ${pathStr}\n\n` +
            `--- Disk Space Usage ---\n${dfOutput}\n` +
            `--- SMART Health Status (if supported) ---\n${smartOutput}`;
          return res.json({ result });
        } catch (sshErr: any) {
          return res.json({ result: `Failed to connect via SSH to execute diagnostics: ${sshErr.message || sshErr}` });
        }
      }

      if (process.platform === 'win32') {
        try {
          const { stdout } = await execAsync('powershell -Command "Get-PhysicalDisk | Format-List DeviceId, FriendlyName, OperationalStatus, HealthStatus, Size"');
          const result = `=== LOCAL WINDOWS PHYSICAL DISK TELEMETRY ===\n\n${stdout.trim() || 'No physical storage devices detected.'}`;
          return res.json({ result });
        } catch (execErr: any) {
          return res.json({ result: `Failed to query local physical disks: ${execErr.message || execErr}` });
        }
      } else {
        try {
          const { stdout } = await execAsync('df -h');
          const result = `=== LOCAL LINUX STORAGE TELEMETRY ===\n\n${stdout}`;
          return res.json({ result });
        } catch (execErr: any) {
          return res.json({ result: `Failed to query local filesystems: ${execErr.message || execErr}` });
        }
      }
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Diagnostics execution error' });
    }
  });

  // 19. Get logs
  app.get('/api/logs', checkAuth, async (req, res) => {
    try {
      const dbLogs = await db.all('SELECT * FROM logs ORDER BY id DESC LIMIT 250');
      res.json(dbLogs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 20. Clear logs
  app.post('/api/logs/clear', checkAuth, async (req, res) => {
    try {
      await db.run('DELETE FROM logs');
      await writeLog('INFO', 'Log Manager', 'Cleared all system debug logs');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 21. Get alerts
  app.get('/api/alerts', checkAuth, async (req, res) => {
    try {
      const dbAlerts = await db.all('SELECT * FROM alerts');
      const mappedAlerts = dbAlerts.map(a => ({
        ...a,
        read: Boolean(a.read),
      }));
      res.json(mappedAlerts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 22. Acknowledge alert
  app.post('/api/alerts/:id/read', checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('UPDATE alerts SET read = 1 WHERE id = ?', [id]);
      const updated = await db.get('SELECT * FROM alerts WHERE id = ?', [id]);
      res.json({
        ...updated,
        read: Boolean(updated?.read),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 22.1 Clear / acknowledge all alerts
  app.post('/api/alerts/clear-all', checkAuth, async (req, res) => {
    try {
      await db.run('DELETE FROM alerts');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/version', (req, res) => {
    res.json({
      version: process.env.APP_VERSION || 'dev',
    });
  });

  // Guard API routes from returning HTML fallback on 404
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found` });
  });

  // --- Background Real-Time Monitoring Loop ---
  let nextLoopDelay = 5000;
  async function monitorLoop() {
    try {
      const pref = await db.get("SELECT * FROM preferences WHERE id = 'default'");
      const moduleMesh = pref ? Boolean(pref.moduleMesh ?? true) : true;
      const moduleContainers = pref ? Boolean(pref.moduleContainers ?? true) : true;
      const moduleStorage = pref ? Boolean(pref.moduleStorage ?? true) : true;
      const moduleUptime = pref ? Boolean(pref.moduleUptime ?? true) : true;
      const moduleDomains = pref ? Boolean(pref.moduleDomains ?? true) : true;

      const pollSec = pref?.daemonPollInterval ? Number(pref.daemonPollInterval) : 5;
      const domainMin = pref?.domainCheckInterval ? Number(pref.domainCheckInterval) : 30;
      const httpTimeoutMs = pref?.httpPingTimeout ? Number(pref.httpPingTimeout) : 5000;

      nextLoopDelay = Math.max(1, pollSec) * 1000;

      await writeDebugLog('Daemon Loop', `Starting telemetry poll cycle (${pollSec}s interval). Enabled modules: Mesh=${moduleMesh}, Containers=${moduleContainers}, Storage=${moduleStorage}, Uptime=${moduleUptime}, Domains=${moduleDomains}`);

      // 0. Background domains DNS & SSL checker
      const now = Date.now();
      if (moduleDomains && now - lastDomainCheckTime > domainMin * 60 * 1000) {
        lastDomainCheckTime = now;
        (async () => {
          try {
            const allDomains = await db.all('SELECT * FROM domains');
            for (const d of allDomains) {
              await checkDomainTelemetry(d.id, d.domainName);
            }
          } catch (e) {
            console.error('Background domains check error:', e);
          }
        })();
      }

      if (moduleMesh) {
        // 1. Sync real host node metrics
        const realCpu = await getCpuUsage();
        const realRamTotal = parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
        const realRamUsed = parseFloat(((os.totalmem() - os.freemem()) / (1024 * 1024 * 1024)).toFixed(1));
        const { rx: realRxSpeed, tx: realTxSpeed } = await getNetworkTraffic();
        
        const hostNode = await db.get('SELECT * FROM nodes WHERE id = ?', ['node-local']);
        if (hostNode && !hostNode.isPaused) {
          let cpuHistory = [];
          let ramHistory = [];
          try { cpuHistory = JSON.parse(hostNode.cpuHistory || '[]'); } catch {}
          try { ramHistory = JSON.parse(hostNode.ramHistory || '[]'); } catch {}
          if (!Array.isArray(cpuHistory) || cpuHistory.length === 0) cpuHistory = Array(9).fill(0);
          if (!Array.isArray(ramHistory) || ramHistory.length === 0) ramHistory = Array(9).fill(0);

          const newCpuHistory = [...cpuHistory.slice(-8), realCpu];
          const newRamHistory = [...ramHistory.slice(-8), realRamUsed];

          const uptimeSeconds = os.uptime();
          const days = Math.floor(uptimeSeconds / (3600 * 24));
          const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
          const minutes = Math.floor((uptimeSeconds % 3600) / 60);
          const uptimeStr = `${days}d ${hours}h ${minutes}m`;
          const tempVal = Math.round(35 + (realCpu / 100) * 30);

          await db.run(
            `UPDATE nodes
             SET cpu = ?, ramUsed = ?, ramTotal = ?, uptime = ?, temp = ?, rxSpeed = ?, txSpeed = ?, cpuHistory = ?, ramHistory = ?, status = 'healthy'
             WHERE id = ?`,
            [realCpu, realRamUsed, realRamTotal, uptimeStr, tempVal, realRxSpeed, realTxSpeed, JSON.stringify(newCpuHistory), JSON.stringify(newRamHistory), 'node-local']
          );
        }

        // 2. Poll remote VPS nodes via SSH if they are configured
        const vpsNodes = await db.all("SELECT * FROM nodes WHERE id != 'node-local'");
        for (const node of vpsNodes) {
          if (node.isPaused) {
            continue;
          }
          if (node.sshUsername) {
            pollRemoteNodeAsync(node).catch(() => {});
          } else {
            const isOnline = await pingHost(node.ip);
            if (isOnline) {
              const cpuHistory = JSON.stringify(Array(9).fill(0));
              const ramHistory = JSON.stringify(Array(9).fill(0));
              await db.run(
                `UPDATE nodes
                 SET status = 'healthy', cpu = 0, cpuHistory = ?, ramUsed = 0, ramHistory = ?, temp = NULL, uptime = 'online'
                 WHERE id = ?`,
                [cpuHistory, ramHistory, node.id]
              );
            } else {
              const cpuHistory = JSON.stringify(Array(9).fill(0));
              const ramHistory = JSON.stringify(Array(9).fill(0));
              await db.run(
                `UPDATE nodes
                 SET status = 'offline', cpu = 0, cpuHistory = ?, ramUsed = 0, ramHistory = ?, temp = NULL, uptime = 'offline'
                 WHERE id = ?`,
                [cpuHistory, ramHistory, node.id]
              );
            }
          }
        }
      }

      if (moduleContainers) {
        // 3. Sync real local Docker containers
        await scanLocalContainers();

        // Query remote node container status asynchronously if configured
        const remoteVPSNodes = await db.all("SELECT * FROM nodes WHERE id != 'node-local' AND sshUsername IS NOT NULL");
        if (remoteVPSNodes.length > 0) {
          const syncNow = Date.now();
          if (syncNow - lastRemoteSyncTime > 20000) {
            lastRemoteSyncTime = syncNow;
            syncRemoteContainersAsync().catch(() => {});
          }
        }

        // 4. Update external / manually registered Docker containers
        const externalContainers = await db.all("SELECT * FROM containers WHERE id LIKE 'c-%'");
        for (const c of externalContainers) {
          if (contextSyncedNames.has(c.name)) {
            continue;
          }
          if (transitionLocks.has(c.name) && Date.now() - transitionLocks.get(c.name)! < 25000) {
            continue;
          }
          let parentOffline = false;
          if (c.nodeId && c.nodeId !== 'node-local') {
            const parentNode = await db.get("SELECT status FROM nodes WHERE id = ?", [c.nodeId]);
            if (parentNode && parentNode.status === 'offline') {
              parentOffline = true;
            }
          }

          if (parentOffline) {
            await db.run(
              `UPDATE containers SET status = 'stopped', cpu = 0, ram = 0, uptime = 'offline' WHERE id = ?`,
              [c.id]
            );
          } else if (c.url) {
            let isAlive = false;
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000);
              const res = await fetch(c.url, { method: 'GET', signal: controller.signal });
              clearTimeout(timeoutId);
              if (res.status < 500) {
                isAlive = true;
              }
            } catch (urlErr) {}

            if (isAlive) {
              await db.run(
                `UPDATE containers SET status = 'running', cpu = 0, ram = 0, uptime = 'active' WHERE id = ?`,
                [c.id]
              );
            } else {
              await db.run(
                `UPDATE containers SET status = 'stopped', cpu = 0, ram = 0, uptime = 'offline' WHERE id = ?`,
                [c.id]
              );
            }
          } else if (c.ip) {
            let isAlive = false;
            try {
              const isWindows = process.platform === 'win32';
              const cmd = isWindows ? `ping -n 1 -w 1500 ${c.ip}` : `ping -c 1 -W 2 ${c.ip}`;
              await execAsync(cmd);
              isAlive = true;
            } catch (pingErr) {}

            if (isAlive) {
              await db.run(
                `UPDATE containers SET status = 'running', cpu = 0, ram = 0, uptime = 'active' WHERE id = ?`,
                [c.id]
              );
            } else {
              await db.run(
                `UPDATE containers SET status = 'stopped', cpu = 0, ram = 0, uptime = 'offline' WHERE id = ?`,
                [c.id]
              );
            }
          } else if (c.status === 'running') {
            await db.run(
              `UPDATE containers SET cpu = 0, ram = 0 WHERE id = ?`,
              [c.id]
            );
          }

          const updated = await db.get("SELECT * FROM containers WHERE id = ?", [c.id]);
          if (updated) {
            await checkContainerAlerts(updated);
          }
        }
      }

      if (moduleUptime) {
        // 5. Monitor external services via HTTP fetch ping
        const dbServices = await db.all('SELECT * FROM services');
        for (const s of dbServices) {
          const start = Date.now();
          let status: 'healthy' | 'warning' | 'alert' = 'healthy';
          let latency = 50;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), httpTimeoutMs);
            const res = await fetch(s.url, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeoutId);
            latency = Date.now() - start;
            if (res.status >= 500) {
              status = 'alert';
            } else if (res.status >= 400 || latency > 400) {
              status = 'warning';
            }
          } catch {
            status = 'alert';
            latency = 0;
          }

          let historyArr = [];
          try { historyArr = JSON.parse(s.history || '[]'); } catch {}
          if (!Array.isArray(historyArr) || historyArr.length === 0) historyArr = Array(29).fill('up');

          const currentCheck = status === 'healthy' ? 'up' : (status === 'warning' ? 'slow' : 'down');
          const newHistory = [...historyArr.slice(-29), currentCheck];
          
          const upCount = newHistory.filter(h => h === 'up').length;
          const newUptimePercentage = parseFloat(((upCount / newHistory.length) * 100).toFixed(2));

          if (status === 'alert' && s.status !== 'alert') {
            if (!activeServiceAlerts.has(s.id)) {
              activeServiceAlerts.add(s.id);
              const prefAlert = await db.get("SELECT alertUptimeDown FROM preferences WHERE id = 'default'");
              if (prefAlert?.alertUptimeDown) {
                await triggerAlert(
                  `Service Offline: ${s.name}`,
                  `External service ${s.name} (${s.url}) is unreachable or returned a server error.`,
                  'error',
                  'uptime'
                );
              }
            }
          } else if (status === 'healthy' && s.status === 'alert') {
            if (activeServiceAlerts.has(s.id)) {
              activeServiceAlerts.delete(s.id);
              const prefAlert = await db.get("SELECT alertUptimeDown FROM preferences WHERE id = 'default'");
              if (prefAlert?.alertUptimeDown) {
                await triggerAlert(
                  `Service Recovered: ${s.name}`,
                  `External service ${s.name} (${s.url}) is back online.`,
                  'info',
                  'uptime'
                );
              }
            }
          }

          await db.run(
            `UPDATE services
             SET status = ?, latency = ?, history = ?, uptimePercentage = ?
             WHERE id = ?`,
            [status, latency, JSON.stringify(newHistory), newUptimePercentage, s.id]
          );
        }
      }

      if (moduleStorage) {
        // 6. Monitor external storages (NAS, SMB, VPS volume pings / SSH capacity check)
        const dbDisks = await db.all("SELECT * FROM disks WHERE ip IS NOT NULL");
        for (const disk of dbDisks) {
          if (disk.sshUsername) {
            pollRemoteStorageAsync(disk).catch(() => {});
          } else {
            const isOnline = await pingHost(disk.ip);
            const health = isOnline ? 'healthy' : 'critical';
            await db.run("UPDATE disks SET health = ? WHERE id = ?", [health, disk.id]);
          }
        }

        // 7. Sync local drives
        await syncDisks();
      }

    } catch (loopErr) {
      console.error("Telemetry collection loop error:", loopErr);
    } finally {
      setTimeout(monitorLoop, nextLoopDelay);
    }
  }

  // Initial runs
  await syncDisks();
  monitorLoop();

  // --- Front-end Integration: Dynamic Dev / Production Static Server ---
  let currentFilename = '';
  let currentDirname = process.cwd();
  try {
    currentFilename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
    currentDirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(currentFilename);
  } catch {
    currentFilename = '';
    currentDirname = process.cwd();
  }

  const isProduction = process.env.NODE_ENV === 'production' || currentFilename.endsWith('server.cjs');

  if (!isProduction) {
    console.log('[Server] Initializing Vite Development Middleware...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    //let distPath = path.resolve(process.cwd(), 'dist');
    let distPath = process.env.VITALMESH_DIST_DIR
  ? path.resolve(process.env.VITALMESH_DIST_DIR)
  : path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      if (fs.existsSync(path.resolve(process.cwd(), 'index.html'))) {
        distPath = process.cwd();
      } else if (fs.existsSync(path.resolve(currentDirname, 'index.html'))) {
        distPath = currentDirname;
      }
    }

    console.log(`[Server] Running in Production mode. Serving static files from ${distPath}...`);

    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startListening = (attempt = 1) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode on http://127.0.0.1:${PORT}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        if (attempt <= 4) {
          console.warn(`[Server Warning] Port ${PORT} is currently in use (EADDRINUSE). Retrying in 1.5s... (Attempt ${attempt}/4)`);
          setTimeout(() => startListening(attempt + 1), 1500);
        } else {
          console.error(`[Server Error] Port ${PORT} is still occupied after 4 retries. Please check PM2 or process status.`);
          process.exit(1);
        }
      } else {
        console.error('[Server Error] Failed to start server:', err);
        process.exit(1);
      }
    });
  };

  startListening();
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
});