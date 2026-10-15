/**
 * state.js - Reactive Core State Tracker for Deadlock Detection Simulator
 * Manages Available, Allocation, Request matrices and Process metadata
 * Supports snapshot immutability for atomic detection & rollback analysis.
 */

(function (root) {
  'use strict';

  class StateManager {
    constructor() {
      this.subscribers = new Set();
      this.history = [];
      this.initDefault();
    }

    /**
     * Initializes default baseline state
     */
    initDefault() {
      this.resourceNames = ['R0', 'R1', 'R2'];
      this.available = [3, 3, 2]; // Vector m

      this.processes = [
        { id: 0, name: 'P0', priority: 5, timestamp: Date.now() - 12000, rollbackCount: 0, status: 'READY', x: 160, y: 250 },
        { id: 1, name: 'P1', priority: 7, timestamp: Date.now() - 8000, rollbackCount: 0, status: 'READY', x: 300, y: 250 },
        { id: 2, name: 'P2', priority: 3, timestamp: Date.now() - 4000, rollbackCount: 0, status: 'READY', x: 440, y: 250 }
      ];

      // Resource node positions for RAG rendering & interaction
      this.resources = [
        { id: 0, name: 'R0', x: 160, y: 95, instances: 3 },
        { id: 1, name: 'R1', x: 300, y: 95, instances: 3 },
        { id: 2, name: 'R2', x: 440, y: 95, instances: 2 }
      ];

      // Allocation matrix n x m
      this.allocation = [
        [0, 1, 0],
        [2, 0, 0],
        [3, 0, 2]
      ];

      // Request matrix n x m
      this.request = [
        [0, 0, 0],
        [2, 0, 2],
        [0, 0, 0]
      ];

      this.mode = 'multi'; // 'single' (WFG) or 'multi' (Vector-Matrix)
      this.deadlockedProcessIds = [];
      this.detectedCycles = [];
      this.lastVictimInfo = null;
      this.startTime = Date.now();
    }

    /**
     * Subscribe to state change notifications
     */
    subscribe(callback) {
      this.subscribers.add(callback);
      return () => this.subscribers.delete(callback);
    }

    /**
     * Notify all registered listeners
     */
    notify(event = 'stateChanged', payload = {}) {
      const snapshot = this.getSnapshot();
      for (const cb of this.subscribers) {
        try {
          cb(event, snapshot, payload);
        } catch (err) {
          console.error('[StateManager] Listener error:', err);
        }
      }
    }

    /**
     * Returns an immutable deep clone of the current state
     */
    getSnapshot() {
      // Calculate total instances per resource (Available + sum of Allocation)
      const computedResources = this.resourceNames.map((name, rIdx) => {
        let heldSum = 0;
        for (let i = 0; i < this.processes.length; i++) {
          heldSum += (this.allocation[i] && this.allocation[i][rIdx]) || 0;
        }
        const total = (this.available[rIdx] || 0) + heldSum;
        const existing = (this.resources && this.resources[rIdx]) || {};
        return {
          id: rIdx,
          name: name,
          instances: total,
          available: this.available[rIdx] || 0,
          x: existing.x !== undefined ? existing.x : 200 + rIdx * 130,
          y: existing.y !== undefined ? existing.y : 95
        };
      });

      return {
        resourceNames: [...this.resourceNames],
        available: [...this.available],
        resources: computedResources,
        allocation: this.allocation.map(row => [...row]),
        request: this.request.map(row => [...row]),
        processes: this.processes.map(p => ({ ...p })),
        mode: this.mode,
        deadlockedProcessIds: [...this.deadlockedProcessIds],
        detectedCycles: this.detectedCycles.map(c => [...c]),
        lastVictimInfo: this.lastVictimInfo ? { ...this.lastVictimInfo } : null,
        timestamp: Date.now()
      };
    }

    /**
     * Save a snapshot into history for undo
     */
    pushHistory() {
      this.history.push(this.getSnapshot());
      if (this.history.length > 30) this.history.shift();
    }

    /**
     * Undo last user action if history exists
     */
    undo() {
      if (this.history.length === 0) return false;
      const prev = this.history.pop();
      this.loadSnapshot(prev, false);
      this.notify('undo', { message: 'Reverted to previous state snapshot' });
      return true;
    }

    /**
     * Loads a complete snapshot into current state
     */
    loadSnapshot(snapshot, saveHistory = true) {
      if (saveHistory) this.pushHistory();

      this.resourceNames = [...snapshot.resourceNames];
      this.available = [...snapshot.available];
      this.allocation = snapshot.allocation.map(r => [...r]);
      this.request = snapshot.request.map(r => [...r]);
      this.processes = snapshot.processes.map(p => ({ ...p }));
      this.mode = snapshot.mode || 'single';
      this.deadlockedProcessIds = [...(snapshot.deadlockedProcessIds || [])];
      this.detectedCycles = (snapshot.detectedCycles || []).map(c => [...c]);
      this.lastVictimInfo = snapshot.lastVictimInfo ? { ...snapshot.lastVictimInfo } : null;

      if (snapshot.resources && snapshot.resources.length === this.resourceNames.length) {
        this.resources = snapshot.resources.map(r => ({ ...r }));
      } else {
        // Auto-generate resource objects
        this.resources = this.resourceNames.map((name, rIdx) => {
          let heldSum = 0;
          for (let i = 0; i < this.processes.length; i++) {
            heldSum += (this.allocation[i] && this.allocation[i][rIdx]) || 0;
          }
          return {
            id: rIdx,
            name: name,
            instances: (this.available[rIdx] || 0) + heldSum,
            available: this.available[rIdx] || 0,
            x: 180 + rIdx * 140,
            y: 95
          };
        });
      }

      this.notify('snapshotLoaded');
    }

    /**
     * Get process count (n) and resource count (m)
     */
    getDimensions() {
      return {
        n: this.processes.length,
        m: this.resourceNames.length
      };
    }

    /**
     * Sets simulation algorithm mode ('single' or 'multi')
     */
    setMode(mode) {
      if (this.mode !== mode) {
        this.mode = mode;
        this.notify('modeChanged', { mode });
      }
    }

    /**
     * Safely updates an Allocation matrix cell
     */
    setAllocation(processIdx, resourceIdx, value) {
      if (processIdx < 0 || processIdx >= this.processes.length) return false;
      if (resourceIdx < 0 || resourceIdx >= this.resourceNames.length) return false;
      const val = Math.max(0, parseInt(value, 10) || 0);

      this.pushHistory();
      this.allocation[processIdx][resourceIdx] = val;
      this.syncProcessStatus(processIdx);
      this.notify('cellEdited', { type: 'allocation', p: processIdx, r: resourceIdx, val });
      return true;
    }

    /**
     * Safely updates a Request matrix cell
     */
    setRequest(processIdx, resourceIdx, value) {
      if (processIdx < 0 || processIdx >= this.processes.length) return false;
      if (resourceIdx < 0 || resourceIdx >= this.resourceNames.length) return false;
      const val = Math.max(0, parseInt(value, 10) || 0);

      this.pushHistory();
      this.request[processIdx][resourceIdx] = val;
      this.syncProcessStatus(processIdx);
      this.notify('cellEdited', { type: 'request', p: processIdx, r: resourceIdx, val });
      return true;
    }

    /**
     * Safely updates an Available vector cell
     */
    setAvailable(resourceIdx, value) {
      if (resourceIdx < 0 || resourceIdx >= this.resourceNames.length) return false;
      const val = Math.max(0, parseInt(value, 10) || 0);

      this.pushHistory();
      this.available[resourceIdx] = val;
      this.notify('cellEdited', { type: 'available', r: resourceIdx, val });
      return true;
    }

    /**
     * Synchronizes a process's readiness status based on allocation & request
     */
    syncProcessStatus(idx) {
      const p = this.processes[idx];
      if (!p || p.status === 'TERMINATED') return;

      const hasPendingRequest = this.request[idx].some((req, rIdx) => req > this.available[rIdx]);
      if (this.deadlockedProcessIds.includes(p.id)) {
        p.status = 'DEADLOCKED';
      } else if (hasPendingRequest) {
        p.status = 'WAITING';
      } else {
        p.status = 'READY';
      }
    }

    /**
     * Updates deadlocked process IDs and cycles from detector
     */
    setDetectionResults(deadlockedIds, cycles = []) {
      this.deadlockedProcessIds = [...deadlockedIds];
      this.detectedCycles = cycles.map(c => [...c]);

      this.processes.forEach((p, idx) => {
        if (p.status === 'TERMINATED') return;
        if (this.deadlockedProcessIds.includes(p.id)) {
          p.status = 'DEADLOCKED';
        } else {
          const hasPending = this.request[idx].some((req, rIdx) => req > this.available[rIdx]);
          p.status = hasPending ? 'WAITING' : 'READY';
        }
      });

      this.notify('detectionUpdated', { deadlockedIds, cycles });
    }

    /**
     * Add a new process
     */
    addProcess(name = null, priority = 5) {
      this.pushHistory();
      const id = this.processes.length > 0 ? Math.max(...this.processes.map(p => p.id)) + 1 : 0;
      const procName = name || `P${id}`;
      const m = this.resourceNames.length;

      // Layout position
      const angle = (this.processes.length / Math.max(1, this.processes.length + 1)) * 2 * Math.PI;
      const cx = 280, cy = 200, r = 130;
      const x = Math.round(cx + r * Math.cos(angle));
      const y = Math.round(cy + r * Math.sin(angle));

      const newProc = {
        id,
        name: procName,
        priority: Math.min(10, Math.max(1, priority)),
        timestamp: Date.now(),
        rollbackCount: 0,
        status: 'READY',
        x: Math.max(50, Math.min(500, x)),
        y: Math.max(50, Math.min(350, y))
      };

      this.processes.push(newProc);
      this.allocation.push(new Array(m).fill(0));
      this.request.push(new Array(m).fill(0));

      this.notify('processAdded', { process: newProc });
      return newProc;
    }

    /**
     * Remove a process by ID
     */
    removeProcess(id) {
      const idx = this.processes.findIndex(p => p.id === id);
      if (idx === -1) return false;

      this.pushHistory();
      // Return allocated resources to Available
      for (let r = 0; r < this.resourceNames.length; r++) {
        this.available[r] += this.allocation[idx][r];
      }

      this.processes.splice(idx, 1);
      this.allocation.splice(idx, 1);
      this.request.splice(idx, 1);
      this.deadlockedProcessIds = this.deadlockedProcessIds.filter(pid => pid !== id);

      this.notify('processRemoved', { id });
      return true;
    }

    /**
     * Add a new resource type
     */
    addResource(name = null, initialAvailable = 2) {
      this.pushHistory();
      const rIdx = this.resourceNames.length;
      const rName = name || `R${rIdx}`;
      const avail = Math.max(0, initialAvailable);

      this.resourceNames.push(rName);
      this.available.push(avail);

      if (!this.resources) this.resources = [];
      this.resources.push({
        id: rIdx,
        name: rName,
        instances: avail,
        available: avail,
        x: Math.round(100 + (rIdx % 5) * 120),
        y: 95
      });

      for (let i = 0; i < this.processes.length; i++) {
        this.allocation[i].push(0);
        this.request[i].push(0);
      }

      this.notify('resourceAdded', { name: rName });
      return rName;
    }

    /**
     * Remove the last resource type
     */
    removeResource() {
      if (this.resourceNames.length <= 1) return false;
      this.pushHistory();

      const rName = this.resourceNames.pop();
      this.available.pop();
      if (this.resources) this.resources.pop();

      for (let i = 0; i < this.processes.length; i++) {
        this.allocation[i].pop();
        this.request[i].pop();
      }

      this.notify('resourceRemoved', { name: rName });
      return true;
    }

    /**
     * Update process node visual coordinates (for interactive drag)
     */
    updateProcessPosition(id, x, y) {
      const p = this.processes.find(proc => proc.id === id);
      if (p) {
        p.x = x;
        p.y = y;
      }
    }

    /**
     * Update resource node visual coordinates (for interactive drag)
     */
    updateResourcePosition(idOrIdx, x, y) {
      if (!this.resources) return;
      const r = typeof idOrIdx === 'number'
        ? (this.resources.find(res => res.id === idOrIdx) || this.resources[idOrIdx])
        : this.resources.find(res => res.name === idOrIdx);
      if (r) {
        r.x = x;
        r.y = y;
      }
    }

    /**
     * Auto-center all nodes neatly in the viewport based on logical canvas dimensions
     */
    autoCenterLayout(width = 600, height = 360) {
      const W = Math.max(400, width);
      const H = Math.max(280, height);
      const n = this.processes.length;
      const m = this.resourceNames.length;

      // Arrange Resources along top row
      if (this.resources) {
        const yR = Math.round(H * 0.26);
        for (let j = 0; j < m; j++) {
          const xR = Math.round((W / (m + 1)) * (j + 1));
          if (!this.resources[j]) {
            this.resources[j] = { id: j, name: this.resourceNames[j], instances: this.available[j] || 1, available: this.available[j] || 1, x: xR, y: yR };
          } else {
            this.resources[j].x = Math.max(50, Math.min(W - 50, xR));
            this.resources[j].y = Math.max(45, Math.min(H - 45, yR));
          }
        }
      }

      // Arrange Processes along bottom row
      const yP = Math.round(H * 0.74);
      for (let i = 0; i < n; i++) {
        const xP = Math.round((W / (n + 1)) * (i + 1));
        this.processes[i].x = Math.max(50, Math.min(W - 50, xP));
        this.processes[i].y = Math.max(45, Math.min(H - 45, yP));
      }
    }

    /**
     * Update process priority
     */
    setProcessPriority(id, priority) {
      const p = this.processes.find(proc => proc.id === id);
      if (p) {
        p.priority = Math.max(1, Math.min(10, parseInt(priority, 10) || 5));
        this.notify('priorityChanged', { id, priority: p.priority });
      }
    }

    /**
     * Terminates a process, returning its allocated resources to Available
     */
    terminateProcess(id) {
      const idx = this.processes.findIndex(p => p.id === id);
      if (idx === -1) return null;

      this.pushHistory();
      const proc = this.processes[idx];
      const released = [...this.allocation[idx]];

      // Return allocations
      for (let r = 0; r < this.resourceNames.length; r++) {
        this.available[r] += this.allocation[idx][r];
        this.allocation[idx][r] = 0;
        this.request[idx][r] = 0;
      }

      proc.status = 'TERMINATED';
      this.deadlockedProcessIds = this.deadlockedProcessIds.filter(pid => pid !== id);

      this.notify('processTerminated', { process: proc, released });
      return { process: proc, released };
    }

    /**
     * Preempts contested resources from process and increments its rollbackCount
     */
    preemptProcess(id) {
      const idx = this.processes.findIndex(p => p.id === id);
      if (idx === -1) return null;

      this.pushHistory();
      const proc = this.processes[idx];
      const preempted = [...this.allocation[idx]];

      // Reclaim held allocations and restore to Available
      for (let r = 0; r < this.resourceNames.length; r++) {
        this.available[r] += this.allocation[idx][r];
        this.allocation[idx][r] = 0;
      }

      proc.rollbackCount = (proc.rollbackCount || 0) + 1;
      proc.status = 'READY';
      this.deadlockedProcessIds = this.deadlockedProcessIds.filter(pid => pid !== id);

      this.notify('processPreempted', { process: proc, preempted });
      return { process: proc, preempted };
    }
  }

  // Export to browser window
  root.DeadlockState = new StateManager();
})(typeof window !== 'undefined' ? window : this);
