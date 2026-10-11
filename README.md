# Deadlock Detection Visualizer (Prior & During Detection)

An interactive, beginner-friendly **Deadlock Detection Visualizer & Simulator** built for Operating Systems courses and concurrency labs. 

The application focuses on detecting deadlocks across both critical phases:
1. **PRIOR TO DEADLOCK (Pre-Deadlock Risk & Predictive Detection)**: Detects warning signs and allows users to simulate resource requests *before* granting them to predict whether an allocation will cause a deadlock.
2. **DURING DEADLOCK (Active Circular Wait Detection)**: Constructs the real-time Wait-For Graph (WFG) and highlights active dependency cycles using Three-Color Depth-First Search (DFS) with pulsing visual animations.

Runs 100% client-side with zero external dependencies and is ready for immediate deployment on **GitHub Pages**.

---

## 🌟 Beginner-Friendly Features

- **3 Educational Scenarios (One-Click Learning)**:
  - 🟢 **1. Safe State**: Normal healthy execution. Available resources satisfy process claims; no deadlocks.
  - 🟡 **2. Prior to Deadlock (Pre-Deadlock Risk)**: Demonstrates an unsafe state where holding resources while waiting for contested ones creates deadlock risk.
  - 🔴 **3. During Deadlock (Active Circular Wait)**: Demonstrates an active circular wait ($P_0 \to P_1 \to P_0$). Highlighted in pulsing crimson arrows on the graph.
- **🔮 Test a Request (Detect Prior to Deadlock)**:
  - Select any process and resource, click **"Test Request"**, and the system tests whether granting it keeps the system in a safe sequence or traps it into a deadlock cycle.
- **Plain-English Explanation Card**:
  - Automatically translates complex graph states into simple sentences explaining what is happening right now and why.
- **Interactive Visual Graph (Wait-For Graph)**:
  - Circular process nodes that can be dragged freely.
  - Directional arrows labeled with the requested resource.
  - Pulsing crimson highlight when a deadlock cycle is detected.
- **Intuitive Resource & Process Table**:
  - Live editable boxes for Free Available Resources, Held Resources, and Requested Resources.
- **⚡ One-Click Break Deadlock**:
  - Automatically breaks circular wait states to restore the system to safety.

---

## 📐 How Detection Works

### 1. During Deadlock (Active Cycle Detection)
When two or more processes are locked in circular wait:
- A directed edge $P_i \to P_j$ exists if $P_i$ is waiting for a resource held by $P_j$.
- Cycle detection uses **Three-Color Depth-First Search (DFS)**:
  - **White (0)**: Unvisited node.
  - **Gray (1)**: Currently exploring node in recursion stack. If an edge leads to a Gray node, a **cycle is confirmed**!
  - **Black (2)**: Fully explored node.

### 2. Prior to Deadlock (Predictive Safety Detection)
Before granting a requested resource to a process:
- The system tentatively simulates:
  $$\text{Available} \gets \text{Available} - \text{Request}$$
  $$\text{Allocation} \gets \text{Allocation} + \text{Request}$$
- It runs the detection algorithm on the simulated state:
  - If a cycle forms $\implies$ 🚨 **PRE-DEADLOCK DETECTED! Granting this will cause deadlock.**
  - If an execution sequence completes safely $\implies$ ✅ **SAFE TO GRANT.**

---

## 🚀 How to Run the Program

### Option 1: Direct File Opening (No Installation Required)
1. Navigate to:
   ```text
   c:\Users\USER\Desktop\SchoolWorks\DeadlockDetectionProgram
   ```
2. Double-click **`index.html`** to open it in your browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local Python Server
Run in PowerShell:
```powershell
python -m http.server 8080
```
Open your browser at `http://localhost:8080`.

---

## 🌐 Deploy to GitHub Pages

The repository contains an automated deployment workflow in `.github/workflows/deploy.yml`:
1. Push changes to GitHub:
   ```bash
   git add .
   git commit -m "Update: simplified prior & during deadlock detection visualizer"
   git push origin main
   ```
2. In your repository on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions** (or **Deploy from a branch → main / (root)**).
4. The site will be live at:
   `https://paryamiel.github.io/Deadlock_Detection_Program_4B/`

---

## 📁 Repository Structure

```text
DeadlockDetectionProgram/
├── index.html                   # Simplified, beginner-friendly UI layout
├── css/
│   └── styles.css               # Clean modern dark-mode styling
├── js/
│   ├── state.js                 # Reactive state manager
│   ├── detector.js              # Prior (Predictive) & During (Cycle) detection engine
│   ├── recovery.js              # Resource preemption & rollback resolution
│   ├── renderer.js              # HTML5 Canvas graph & simplified resource tables
│   └── app.js                   # Application controller, presets & request tester
├── .github/
│   └── workflows/
│       └── deploy.yml           # GitHub Actions workflow for automated Pages deployment
├── prompt.md                    # Initial assignment specification
└── README.md                    # Documentation
```
