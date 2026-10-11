# Interactive Deadlock Detection & Recovery Simulator

An interactive, client-side **Deadlock Detection and Recovery Visualizer & Simulator** designed for students, educators, and systems engineers. Built with vanilla modern web technologies, this tool provides real-time state visualization of single-instance Wait-For Graphs (WFG), multi-instance resource vector-matrix algorithms, starvation-resistant heuristic victim recovery, and step-by-step playback.

The application runs entirely client-side with **zero external dependencies** and is ready for immediate deployment on **GitHub Pages** or direct offline usage.

---

## 🌟 Key Features

- **Dual Deadlock Detection Algorithms**:
  - **Single-Instance Resources (Wait-For Graph - WFG)**: Constructs a directed dependency graph and identifies circular wait states using a **Three-Color Depth-First Search (DFS)** algorithm (White = unvisited, Gray = visiting, Black = visited) with exact cycle path extraction ($P_0 \to P_1 \to P_2 \to P_0$).
  - **Multi-Instance Resources (Vector-Matrix Algorithm)**: Iterative Banker's-variant matrix algorithm evaluating dynamic $\text{Work}$ vectors and $\text{Finish}$ flags per process, bypassing zero-allocation processes and identifying unresolvable claims.
- **Starvation-Resistant Recovery & Victim Selection**:
  - Implements a heuristic cost function that evaluates process termination/preemption desirability:
    $$\text{Cost} = \frac{(\text{Total Allocated} \times 1.5) + (\text{Time Elapsed} \times 1.0)}{(\text{Priority} \times 2.0) + (\text{Rollback Count} \times 3.0) + \epsilon}$$
  - **Progressive Termination**: Aborts the lowest-cost process, reclaims its allocations back to $\text{Available}$, and iteratively re-evaluates until cycles break.
  - **Preemption & Rollback**: Reclaims contested resources, increments `rollbackCount` to increase future survival priority, and restores the victim to `READY`.
- **Three Operational Trigger Modes**:
  - **Periodic Timer**: Background detection ticker with an adjustable interval slider ($500\text{ms} - 5000\text{ms}$).
  - **On-Request Block**: Automatically triggers detection whenever an edited request cell exceeds currently available capacity.
  - **Manual / Step-by-Step**: Step forward and backward through algorithmic iterations to observe state transitions.
- **Interactive High-DPI Canvas & Live Editable Matrices**:
  - Draggable circular process nodes with 60fps pulsing crimson glow animations on detected cycles.
  - Directional dependency arrows labeled with requested resource types.
  - Hover tooltips displaying runtime, priority, allocation, request, and real-time victim cost breakdown.
  - Live editable table grids for $\text{Available}$, $\text{Allocation}$, and $\text{Request}$ with dynamic row highlights and validation.
- **Execution Diagnostics Log**:
  - Terminal-style scrollable event feed capturing real-time events (`[TRIGGER]`, `[CYCLE DETECTED]`, `[VICTIM EVALUATED]`, `[RECOVERY]`, `[SAFE STATE RESTORED]`).
  - Event filter buttons and one-click log export to `.log` text files.

---

## 📐 Algorithmic Details & Formulations

### 1. Wait-For Graph (WFG) & Three-Color DFS
For single-instance resources, a directed edge $P_i \to P_j$ exists if process $P_i$ is waiting for a resource currently held by $P_j$:
$$\text{Edge}(P_i, P_j) \iff \exists r : \text{Request}[i][r] > 0 \land \text{Allocation}[j][r] > 0 \land i \neq j$$
The Three-Color DFS algorithm traverses the graph:
1. All active nodes start as **WHITE** (0).
2. When a node is entered, it turns **GRAY** (1) and pushes to the active recursion stack.
3. If an edge leads to a **GRAY** node, a back-edge (circular wait deadlock) is confirmed and the cycle loop is recorded.
4. When all outgoing edges of a node are fully explored, it turns **BLACK** (2) and pops from the stack.

### 2. Multi-Instance Vector-Matrix Algorithm
For arbitrary quantities of multiple resource types:
1. Initialize $\text{Work} = [\dots\text{Available}]$.
2. Initialize $\text{Finish}[i] = \text{true}$ if $\text{Allocation}_i = \vec{0}$; otherwise $\text{false}$.
3. Find an index $i$ such that $\text{Finish}[i] == \text{false}$ and $\text{Request}_i \le \text{Work}$.
4. If found:
   $$\text{Work} = \text{Work} + \text{Allocation}_i, \quad \text{Finish}[i] = \text{true}$$
   Repeat step 3 until no further processes can finish.
5. Any process where $\text{Finish}[i] == \text{false}$ upon completion is flagged as **DEADLOCKED**.

### 3. Starvation-Resistant Victim Heuristic
When resolving deadlocks:
- **Numerator**: Quantifies work and computation lost if the process is preempted ($(\text{Allocated} \times 1.5) + (\text{Time} \times 1.0)$).
- **Denominator**: Quantifies process priority and accumulated rollbacks ($(\text{Priority} \times 2.0) + (\text{Rollbacks} \times 3.0) + \epsilon$).
- As a process experiences rollbacks, its `rollbackCount` increases, raising its survival weight and preventing it from being repeatedly chosen as a victim (**Starvation Prevention**).

---

## 📂 Repository Structure

```text
DeadlockDetectionProgram/
├── index.html                   # Main entry point and semantic UI layout
├── css/
│   └── styles.css               # Responsive dark-mode dashboard styling & tokens
├── js/
│   ├── state.js                 # Unified state model & atomic snapshot transitions
│   ├── detector.js              # WFG Three-Color DFS & multi-instance matrix engine
│   ├── recovery.js              # Heuristic victim selection & rollback manager
│   ├── renderer.js              # 60fps HTML5 Canvas graph & editable matrix DOM grids
│   └── app.js                   # Main application event loop, triggers & scenario presets
├── .github/
│   └── workflows/
│       └── deploy.yml           # Automated deployment workflow for GitHub Pages
├── prompt.md                    # Project requirements and specification
└── README.md                    # Complete project documentation
```

---

## 🚀 How to Execute the Program

### Option 1: Direct File Opening (No Server Required)
Because the application uses zero external dependencies and standard modular scripts:
1. Navigate to the project directory:
   ```text
   c:\Users\USER\Desktop\SchoolWorks\DeadlockDetectionProgram
   ```
2. Double-click **`index.html`** or right-click and select **Open with → Google Chrome / Microsoft Edge / Mozilla Firefox**.
3. The simulator will load immediately with all features functional offline.

---

### Option 2: Local HTTP Server (Python)
To run via a local web server:
1. Open PowerShell or Command Prompt in the project folder:
   ```powershell
   cd "c:\Users\USER\Desktop\SchoolWorks\DeadlockDetectionProgram"
   ```
2. Start Python's built-in HTTP server:
   ```powershell
   python -m http.server 8080
   ```
3. Open your browser and navigate to:
   ```text
   http://localhost:8080
   ```

---

### Option 3: VS Code Live Server
1. Open the folder in **Visual Studio Code**.
2. If installed, click **Go Live** on the bottom status bar (or right-click `index.html` and select **Open with Live Server**).

---

### Option 4: Deploying to GitHub Pages

The repository is pre-configured for GitHub Pages through two deployment strategies:

#### Method A: Built-in GitHub Actions Workflow (Recommended)
1. Push the repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Deadlock Simulator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub, navigate to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. The `.github/workflows/deploy.yml` workflow will automatically build and publish the site.

#### Method B: Direct Branch Static Serving
1. In your GitHub repository, navigate to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Select **Branch: `main`** and folder **`/(root)`**, then click **Save**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

---

## 🎮 Interactive User Guide

### 1. Built-in Scenario Presets
Use the preset buttons on the control bar to test standard scenarios:
- **Preset 1: Classic 3-Node Circular Wait ($P_0 \to P_1 \to P_2 \to P_0$)**:
  - Single-instance mode where each process holds one resource and requests another in a circular chain.
  - Observe the crimson pulsing edges and cycle identification in the diagnostics log.
- **Preset 2: Banker's 5-Process Multi-Instance Deadlock**:
  - Demonstrates multi-instance matrix evaluation where zero-allocation processes ($P_0$) finish immediately, $P_2$ finishes safely, and processes $P_1, P_3, P_4$ remain in deadlock.
- **Preset 3: Starvation Prevention Demonstration**:
  - Deadlock with competing processes.
  - Click **Preempt & Rollback** repeatedly to observe the victim choice shifting between processes as `rollbackCount` increments.

### 2. Editing System State Live
- **Available Vector**: Directly edit available quantities in the input boxes.
- **Allocation Matrix**: Modify held resources for each process.
- **Request Matrix**: Adjust requested resources. Cells with requests exceeding available units are highlighted in amber.
- **Process Priorities**: Edit priority levels ($1 - 10$) directly in the Request table.
- **Add Process / Add Resource**: Use the top control bar buttons to dynamically expand the system dimensions ($n$ and $m$).
- **Undo**: Click **Undo** to revert any state change.

### 3. Executing Recovery Actions
- **Progressive Termination** (`🛑`): Aborts the victim process evaluated as the lowest cost, releasing all its held resources back to $\text{Available}$, and re-evaluates the system.
- **Preempt & Rollback** (`⏪`): Reclaims contested allocations, increments the victim's `rollbackCount`, and returns it to `READY`.
- **Auto-Resolve All** (`⚡`): Recursively resolves victims until the system returns to a safe state.

### 4. Step-by-Step Algorithmic Walkthrough
1. Under **Trigger**, select **Manual Step**.
2. Click **Reset Steps** to initialize the generator.
3. Click **Next Step** (`⏭`) or **Auto-Play Steps** (`▶`) to step through each DFS edge check or matrix process evaluation.
4. Watch the **Algorithmic State Inspector** update the $\text{Work}$ vector and $\text{Finish}$ flags in real time.

---

## 💻 Tech Stack & Design Standards

| Layer | Technology |
|---|---|
| **Structure** | HTML5 Semantic Elements (`<main>`, `<section>`, `<header>`, `<footer>`, `<canvas>`) |
| **Styling** | Vanilla CSS3 (Custom Properties, Glassmorphism, CSS Grid, Flexbox, Keyframe Animations) |
| **Logic** | Vanilla ES6+ JavaScript (Classes, Generators, Immutability via Snapshots, Event Emitters) |
| **Graphics** | HTML5 Canvas API with Retina DPI scaling (`window.devicePixelRatio`) |
| **Typography** | Inter (UI) & JetBrains Mono (Matrices & Terminal Log) via Google Fonts |
| **CI/CD** | GitHub Actions (`actions/deploy-pages@v4`) |

---

## 📄 License
This project is open-source and free to use for academic, instructional, and personal study purposes.
