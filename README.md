# Deadlock Detection & Analysis System (Prior & During Detection)

An interactive, beginner-friendly **Deadlock Detection Visualizer & Concurrency Laboratory** built for Operating Systems courses and concurrency labs. 

The application focuses on detecting deadlocks across both critical phases:
1. **PRIOR TO DEADLOCK (Pre-Deadlock Risk & Predictive Detection)**: Detects warning signs and allows users to simulate resource requests *before* granting them to predict whether an allocation preserves safety or triggers a deadlock cycle.
2. **DURING DEADLOCK (Active Circular Wait Detection)**: Constructs the real-time Resource Allocation Graph (RAG) and Wait-For Graph (WFG), highlighting active dependency cycles using Three-Color Depth-First Search (DFS) with pulsing visual animations.

Runs 100% client-side with zero external dependencies and is ready for immediate deployment on **GitHub Pages**.

---

## 🌟 Beginner-Friendly Features

- **4 Educational Scenarios (One-Click Learning)**:
  - 🟢 **Case I: Safe State**: Normal healthy execution. Adequate capacity; all processes can complete without deadlock.
  - 🟡 **Case II: Prior to Deadlock (Pre-Deadlock Risk)**: Demonstrates an unsafe state where holding resources while waiting for contested ones creates deadlock risk.
  - 🔴 **Case III: During Deadlock (Active Circular Wait)**: Demonstrates an active circular wait ($P_0 \to P_1 \to P_0$). Highlighted in pulsing crimson arrows on the graph.
  - 🎲 **Case IV: Random Scenario**: Generates a dynamic randomized configuration of processes and resources with immediate centered visualization!
- **Interactive Visual Graph (Resource Allocation Graph & Wait-For Graph)**:
  - **Draggable Processes & Resources**: Freely click and drag both Process circles and Resource boxes to place and arrange them anywhere on the canvas.
  - **Immediate Presentation**: The graph is automatically centered and fitted on start and for every preset (including Random)—no manual centering required!
  - **Graph View Toggle**: Switch between **Resource Allocation Graph (RAG)** (Processes + Resources with assignment/request arrows) and **Wait-For Graph (WFG)** (process-to-process wait edges).
- **Live Graph Interpretation (Figure 1.1)**:
  - Directly beneath the graph, a live plain-English summary explains what the graph represents, e.g.:
    `"P1 holds 1 instance of R1 and requests 1 instance of R2 (Waiting for R2)."`
    along with an immediate system-level conclusion.
- **📘 Built-in Instructions & Beginner's Guide Tab**:
  - Accessible via the top navigation tab bar.
  - Explains deadlocks with real-world analogies (4-way intersection), defines all graph symbols, and provides a clear 6-step practical tutorial.
- **🔮 Test a Request (Detect Prior to Deadlock)**:
  - Select any process and resource in Experiment 1, click **"Evaluate Request Safety"**, and the system tests whether granting it is safe or if it triggers a deadlock cycle before committing the allocation.
- **Intuitive Resource & Process Table**:
  - Live editable boxes for Free Available Resources, Held Resources, and Requested Resources.
- **⚡ One-Click Break Deadlock**:
  - Automatically preempts contested resources from the optimal victim process to restore safety.

---

## 📐 How Detection Works

### 1. During Deadlock (Active Cycle Detection)
When two or more processes are locked in circular wait:
- In Resource Allocation Graphs:
  - Assignment edge: Resource $R_j \to$ Process $P_i$ (Process holds resource).
  - Request edge: Process $P_i \to$ Resource $R_j$ (Process awaits resource).
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
   git commit -m "Update: add random option, movable processes and resources, live graph interpretation, and beginner instructions tab"
   git push origin main
   ```
2. The GitHub Actions workflow automatically deploys to:
   `https://paryamiel.github.io/Deadlock_Detection_Program_4B/`

---

## 📁 Repository Structure

```text
DeadlockDetectionProgram/
├── index.html                   # Semantic UI layout with Dashboard & Instructions tabs
├── css/
│   └── styles.css               # Clean academic styling, responsive layouts
├── js/
│   ├── state.js                 # Reactive state manager with process & resource node tracking
│   ├── detector.js              # Prior (Predictive) & During (Cycle) detection engine
│   ├── recovery.js              # Resource preemption & rollback resolution
│   ├── renderer.js              # Dual RAG/WFG visualizer & live graph interpretation
│   └── app.js                   # Application controller with presets & random scenario generator
└── .github/
    └── workflows/
        └── deploy.yml           # Automated deployment workflow for GitHub Pages
```
