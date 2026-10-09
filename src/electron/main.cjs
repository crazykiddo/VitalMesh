const { app, BrowserWindow, Tray, nativeImage, Menu } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = process.env.PORT || '3007';
let backend;
let tray = null;
let mainWindow = null;
let isQuitting = false;

const TRAY_PAGES = [
  { id: 'dashboard', label: 'Dashboard',icon: 'dashboard.png'},
  { id: 'map', label: 'Mesh Map',icon: 'meshmap.png' },
  { id: 'containers', label: 'Containers',icon: 'containers.png' },
  { id: 'storage', label: 'Storage',icon: 'storage.png' },
  { id: 'uptime', label: 'Uptime',icon: 'uptime.png' },
  { id: 'domains', label: 'Domains',icon: 'domains.png' }  
];

const TRAY_PAGES_OPERATIONS = [  
  { id: 'alerts', label: 'Alerts',icon: 'alerts.png' },
  { id: 'settings', label: 'Settings',icon: 'settings.png' },
  { id: 'user', label: 'User Profile',icon: 'user.png' }
];

function createTray() {
  tray = new Tray(getTrayIcon());

  const pageMenuItems = TRAY_PAGES.map((page) => {
    const icon = getMenuItemIcon(page.icon);
    return {
      label: page.label,
      ...(icon ? { icon } : {}), // Only add the icon key if valid
      click: () => navigateToView(page.id),
    };
  });

  const pageMenuItemsOperations = TRAY_PAGES_OPERATIONS.map((page) => {
    const icon = getMenuItemIcon(page.icon);
    return {
      label: page.label,
      ...(icon ? { icon } : {}), // Only add the icon key if valid
      click: () => navigateToView(page.id),
    };
  });

  const quitIcon = getMenuItemIcon('favicon-96x96.png');
  const vmIcon = getMenuItemIcon('favicon-96x96.png');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VitalMesh',
      ...(vmIcon ? { icon: vmIcon } : {}),
      click: () => navigateToView(),
    },
    { type: 'separator' },
    ...pageMenuItems,
    { type: 'separator' },
    ...pageMenuItemsOperations,
    { type: 'separator' },
    {
      label: 'Quit',      
      ...(quitIcon ? { icon: quitIcon } : {}),
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('VitalMesh');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => navigateToView());
}

// Helper to safely load and resize images from the backend dist directory
function getMenuItemIcon(fileName = 'favicon-96x96.png') {
  const { distDir } = getBackendPaths();
  const iconPath = path.join(distDir, fileName);

  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16 });
    }
  }

  console.warn(`[Tray] Icon missing or empty at: ${iconPath}`);
  return undefined; // Returning undefined prevents Electron from setting a blank spacer
}

function getBackendPaths() {
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    return {
      serverScript: path.join(resourcesPath, 'backend', 'server.cjs'),
      distDir: path.join(resourcesPath, 'backend', 'dist'),
    };
  }

  const projectRoot = path.join(__dirname, '..', '..');
  return {
    serverScript: path.join(projectRoot, 'dist', 'server.cjs'),
    distDir: path.join(projectRoot, 'dist'),
  };
}

function getTrayIcon() {
  return getMenuItemIcon('favicon-96x96.png') || nativeImage.createEmpty();
}

function waitForServer(port, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        attempts += 1;
        if (attempts >= maxAttempts) {
          reject(new Error(`Backend did not start on port ${port}`));
          return;
        }
        setTimeout(check, 500);
      });

      req.setTimeout(2000, () => req.destroy());
    };

    check();
  });
}

function navigateToView(viewId) {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (viewId) {
    mainWindow.webContents.send('navigate-to', viewId);
  }
}



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('minimize', () => {
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  const { serverScript, distDir } = getBackendPaths();

  backend = fork(serverScript, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT,
      VITALMESH_DIST_DIR: distDir,
      VITALMESH_DATA_DIR: app.getPath('userData'),
    },
    stdio: 'inherit',
  });

  backend.on('error', (err) => {
    console.error('[Electron] Backend process error:', err);
  });

  backend.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[Electron] Backend exited with code ${code}`);
    }
  });

  try {
    await waitForServer(PORT);
    createWindow();
    createTray();
  } catch (err) {
    console.error('[Electron] Failed to start backend:', err.message);
    app.quit();
  }

  app.on('activate', () => {
    if (mainWindow) {
      navigateToView();
    } else {
      createWindow();
      createTray();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  backend?.kill();
});

app.on('window-all-closed', () => {
  // Keep running in the system tray.
});
