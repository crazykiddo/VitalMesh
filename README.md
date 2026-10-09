# VitalMesh — Unified Homelab & Multi-Node Cluster Orchestrator

VitalMesh is a polished, high-performance, full-stack home server dashboard and multi-node cluster orchestrator. Designed for homelab sysadmins and operators, it provides a centralized command center to visualize real-time cluster telemetry, manage Docker containers, monitor ZFS/RAID storage pools, check external service uptimes, view active hardware alerts, and customize layout or lighting settings.

The application leverages a robust full-stack architecture that combines a high-performance **React 18** and **Vanilla CSS / Tailwind** client-side interface with a secure **Express** backend proxy. State persistence is backed by a transactional, fast **SQLite** database (`vitalmesh.db`), providing real database queries and schema-driven tables.

---

## Key Features

1. **Integrated Telemetry Dashboard & SSH Node Monitors**
   - **Visual SVG Radial Map**: Interactive physical/virtual layout map linking nodes together with glowing, themed, vector connection paths.
   - **SSH Host Telemetry**: External node telemetry is retrieved over non-blocking, asynchronous SSH tunnels. Measures CPU (via `/proc/stat` delta analysis), RAM allocations (via `/proc/meminfo`), temperature (via CPU thermal zones), and system uptimes.
   - **Form Configuration**: Expandable SSH drawers in Add and Edit Node panels allow configuring SSH Username, Password, Private Key, and Custom Port.

2. **Docker Container Console & Remote Context Sync**
   - **Remote Context Sync (`vps`)**: Polls and tracks containers running on remote virtual servers using the `vps` docker CLI context over SSH.
   - **Non-Blocking Actions**: Spin up, shut down, or restart local and remote containers asynchronously without hanging UI updates.
   - **Transition Lock System**: Implements a 25-second lockout window when changing container states to prevent temporary telemetry updates from overwriting immediate transition progress.
   - **Telemetry Sparkbars**: Real-time CPU and RAM allocation indicators.

3. **ZFS & Remote Storage Manager**
   - **Remote SSH Storage Monitoring**: Configure storage disks with SSH credentials (host, port, username, password, private key, and mount path) to pull capacity statistics (`df`) over secure tunnels.
   - **Physical Disk Diagnostics**: Trigger diagnostic reports (`POST /api/disks/:id/diagnose`) that execute live local `Get-PhysicalDisk` PowerShell metrics on Windows hosts, or remote terminal diagnostics on remote SSH targets.

4. **Uptime & External Link Monitors**
   - Live latency checks of external/internal URLs.
   - 30-day visual status grids detailing historical uptime.
   - Add/Remove monitor forms to track secondary network targets dynamically.

5. **Alerts & System Log Streamer**
   - Dedicated hardware threshold warnings (thermal limit indicators, offline nodes).
   - Filterable, searchable, and exportable global system logger console.
   - Log exporting mechanism generating clean `.log` text files for offline diagnostics.

6. **Operator Personalization & Security**
   - **Dynamic Key Generation**: Auto-generates a unique OPERATOR API ACCESS TOKEN and NODE SIGNING HMAC SECRET KEY on the first run, securing the API endpoint against unauthorized access.
   - **Credential Update Panel**: Forms to change the operator's login email and update their password (properly hashed and persisted).
   - **Advisory Warning Banner**: A visual warning banner at the top of the interface alerts the operator if they are currently logged in using the default system credentials, with a direct link to update them.
   - **Theming Toggles**: Dark/Light mode and theme schemes (Cyber-Vitality and Bauhaus themes).

---

## Tech Stack & Architecture

- **Frontend Client**:
  - **Framework**: React 18+ (Vite)
  - **Icons**: Lucide React
  - **Styling**: Tailwind CSS & Vanilla CSS variable themes.
- **Backend Server**:
  - **Web Framework**: Express
  - **Runtime**: Node.js with TypeScript (`tsx` in dev, `esbuild` production compiler)
  - **Database**: SQLite3 database (`vitalmesh.db`) for secure relational querying.
  - **SSH Library**: `ssh2` for executing remote queries and telemetry.

---

## Getting Started

### Prerequisites
- **Node.js** (v18.x or newer is recommended)
- **npm** (v9.x or newer)

---

### Local Development Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   npm run dev
   ```

3. **Access the application**:
   Open your browser and navigate to `http://localhost:3007`.

---

### Production Deployment

1. **Build the Application**:
   ```bash
   npm run build
   ```
   This compiles Vite assets to the `dist/` directory and bundles the backend `server.ts` file to `dist/server.cjs` using `esbuild`.

2. **Start the Production Server**:
   ```bash
   npm run start
   ```

---

### Docker Production Deployment
1. **Build the Application**:
   Run
   ```
   $env:APP_VERSION = git rev-parse --short HEAD

   docker build `
   --build-arg APP_VERSION=$env:APP_VERSION `
   -t "vitalmesh:$env:APP_VERSION" `
   -t vitalmesh:latest `
   .

   docker run -d `
   --name vitalmesh `
   --restart unless-stopped `
   -p 3007:3007 `
   -e APP_VERSION=$env:APP_VERSION `
   -v vitalmesh-data:/app/data `
   -v /var/run/docker.sock:/var/run/docker.sock `
   "vitalmesh:$env:APP_VERSION"
   ```
2. **Run**:
   Open http://localhost:3007

---

### Docker Composer Production Deployment
1. **Build the Application**:
   Run
   ```
   docker compose up -d --build
   ```
2. **Run**:
   Open http://localhost:3007


## Project Structure

```text
├── dist/                  # Compiled production build assets
├── src/                   # Client-side React source code
│   ├── components/        # Reusable view panels (Dashboard, Map, Storage, etc.)
│   ├── types.ts           # Shared TypeScript types & interfaces
│   ├── index.css          # Tailwind imports, custom color tokens & graphic themes
│   └── main.tsx           # React entry point
├── server.ts              # Express API server & SQLite JSON db setup
├── package.json           # Project manifests, scripts, and dependencies
├── vite.config.ts         # Vite configuration settings
└── README.md              # System documentation
```
