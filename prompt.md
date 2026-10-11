# TASK: Interactive Deadlock Detection & Recovery Simulator (GitHub Pages Ready)

## 1. System Role & Objective
You are an expert Systems and Frontend Web Engineer. Build an interactive, client-side **Deadlock Detection and Recovery Visualizer & Simulator** ready for immediate deployment on **GitHub Pages**.

The application must run entirely client-side in the browser (zero backend server required) using clean, modern **Vanilla HTML5, CSS3, and ES6+ JavaScript** (or a single zero-config bundle). It must visually demonstrate both single-instance graph cycles and multi-instance matrix algorithms, execute starvation-resistant recovery, and provide real-time state manipulation.

---

## 2. GitHub Pages Deployment Specification

To guarantee seamless deployment to GitHub Pages without complex build steps:
- **Repository Structure:**
  ```text
  ├── index.html            # Main entry point and semantic UI layout
  ├── css/
  │   └── styles.css        # Responsive, modern dark-mode dashboard styling
  ├── js/
  │   ├── state.js          # Resource manager & atomic state transitions
  │   ├── detector.js       # WFG (DFS cycle) & multi-instance matrix routines
  │   ├── recovery.js       # Heuristic victim selection & rollback manager
  │   ├── renderer.js       # Canvas/SVG graph & matrix DOM updates
  │   └── app.js            # Main event loop, trigger listeners, & scenario loader
  └── .github/
      └── workflows/
          └── deploy.yml    # GitHub Actions workflow for automated Pages deployment
  ```
- **Deployment Strategy:** Provide both:
  1. Root static serving compatibility (deployable directly via **Settings → Pages → Branch: main / (root)**).
  2. A production-ready `.github/workflows/deploy.yml` utilizing `actions/deploy-pages@v4`.

---

## 3. Core Architectural Modules

### A. Core State Tracker (`state.js`)
Maintain a unified, reactive state model:
- `Available`: 1D array of integers of size $m$ (Resource types $R_0, \dots, R_{m-1}$).
- `Allocation`: $n \times m$ matrix tracking currently held resources per process.
- `Request`: $n \times m$ matrix tracking blocked/pending claims per process.
- `Processes`: Metadata array containing `id`, `name`, `priority` (1–10), `timestamp`, `rollbackCount`, and `status` (`READY`, `WAITING`, `DEADLOCKED`, `TERMINATED`).
- State mutation methods with snapshot immutability to simulate atomic reads and prevent phantom deadlock states during analysis runs.

### B. Detection Engine (`detector.js`)
Implement dual detection algorithms with step-by-step yield/playback capability:

1. **Single-Instance Resources (Wait-For Graph - WFG):**
   - Construct directed graph $G = (V, E)$ where nodes are active processes.
   - Directed edge $P_i \to P_j$ exists if $P_i$ requests a resource exclusively held by $P_j$.
   - Cycle detection via **Three-Color Depth-First Search (DFS)** (White = unvisited, Gray = visiting, Black = visited) to pinpoint exact cycle paths (e.g., $P_1 \to P_3 \to P_4 \to P_1$).
2. **Multi-Instance Resources (Vector-Matrix Algorithm):**
   - Initialize temporary `Work = [...Available]`.
   - Initialize `Finish[i] = true` if $\text{Allocation}_i = \vec{0}$; otherwise `false`.
   - Iterate to find index $i$ such that $\text{Finish}[i] = \text{false}$ and $\text{Request}_i \le \text{Work}$.
   - Simulate reclamation: $\text{Work} = \text{Work} + \text{Allocation}_i$, $\text{Finish}[i] = \text{true}$.
   - All processes with $\text{Finish}[i] == \text{false}$ upon completion are returned as deadlocked.

### C. Trigger Invoker & Simulation Engine (`app.js`)
Provide three operational trigger modes:
- **Periodic Timer:** Configurable tick slider ($500\text{ms} - 5000\text{ms}$) running continuous background detection.
- **On-Request Block:** Runs automatically whenever a user manually adds a resource request that exceeds available capacity.
- **Manual / Step-by-Step:** Allows students or engineers to step through algorithmic iterations forward and inspect variables.

### D. Recovery Interface (`recovery.js`)
When deadlocks are confirmed, invoke automated recovery:
- **Starvation-Resistant Victim Cost Function:**
  $$\text{Cost} = \frac{(\text{Total Allocated} \times 1.5) + (\text{Time Elapsed} \times 1.0)}{(\text{Priority} \times 2.0) + (\text{Rollback Count} \times 3.0) + \epsilon}$$
- **Resolution Mechanisms:**
  1. *Progressive Termination:* Abort the lowest-cost process, return its allocated resources to `Available`, and re-run detection until the cycle breaks.
  2. *Preemption & Rollback:* Reclaim contested resources, increment `rollbackCount` (raising its future survival weight), and return the victim to `READY`.

---

## 4. UI & Interactive Visualizer Specification (`renderer.js`, `index.html`)

Implement an intuitive dashboard divided into functional panels:
1. **Interactive Wait-For Graph Canvas:**
   - HTML5 Canvas or SVG renderer showing processes as circular nodes and dependency arrows.
   - Highlight detected deadlock cycles in vibrant crimson/orange with pulsing animations.
2. **Matrix State Grid:**
   - Live editable tables for `Allocation`, `Request`, and `Available`. Users can click cells to modify values on the fly.
   - Visual inspection view during multi-instance runs showing live vector states (`Work` and `Finish` flags per step).
3. **Control Bar & Preset Scenarios:**
   - Preset 1: *Single-Instance Classic 3-Node Cycle* ($P_0 \to P_1 \to P_2 \to P_0$).
   - Preset 2: *Banker's Multi-Instance 5-Process Deadlock* (demonstrating zero-allocation process bypassing).
   - Preset 3: *Starvation Prevention Demonstration* (running repeated recoveries to show shifting victim choice).
4. **Execution Diagnostics Log:**
   - Terminal-style scrollable event feed documenting state shifts:
     `[TRIGGER: REQUEST]` → `[CYCLE DETECTED: P1 -> P2 -> P1]` → `[VICTIM EVALUATED: P2 (Cost: 2.1)]` → `[RECOVERY: TERMINATED]` → `[SAFE STATE RESTORED]`.

---

## 5. Acceptance Criteria
- Fully functional offline and on GitHub Pages via static file serving (no `npm run dev` required to view; opens directly via file/HTTP server).
- Clean, semantic code with zero console errors or warnings.
- Fully responsive layout that scales down to tablet viewports.
- Cycle paths accurately drawn and animated on the graph canvas.