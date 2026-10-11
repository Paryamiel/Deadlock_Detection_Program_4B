/**
 * app.js - Simplified, Beginner-Friendly Application Controller
 * 
 * Features:
 * 1. Pre-deadlock detection (Prior) & Active deadlock detection (During).
 * 2. Interactive "Test Request Before Granting" Predictive Simulator.
 * 3. 3 Clear, educational presets:
 *    - Preset 1: 🟢 Safe Running State (No Deadlock)
 *    - Preset 2: 🟡 Prior to Deadlock (Deadlock Risk / Pre-Deadlock Warning)
 *    - Preset 3: 🔴 During Deadlock (Active Circular Wait)
 * 4. Simple one-click "Break Deadlock / Auto-Resolve".
 */

(function (root) {
  'use strict';

  class ApplicationController {
    constructor() {
      this.timerId = null;
      this.isAutoDetect = true;
      this.logs = [];
    }

    init() {
      // 1. Initialize renderer
      root.DeadlockRenderer?.init('wfg-canvas');

      // 2. Subscribe to state changes
      root.DeadlockState?.subscribe((event, snapshot, payload) => {
        this.onStateChanged(event, snapshot, payload);
      });

      // 3. Bind UI buttons and inputs
      this.bindControls();

      // 4. Load initial preset (Preset 1: Safe)
      this.loadPreset(1);

      // 5. Start auto-detection ticker
      this.startAutoDetection();

      this.log('SYSTEM', 'Deadlock Detection Visualizer initialized. Ready for detection.');
    }

    onStateChanged(event, snapshot, payload) {
      root.DeadlockRenderer?.renderMatrices();
      root.DeadlockRenderer?.updateStatusSummary();

      if (this.isAutoDetect) {
        this.runDetection(false);
      }
    }

    bindControls() {
      // 1. Presets
      document.getElementById('btn-preset-safe')?.addEventListener('click', () => this.loadPreset(1));
      document.getElementById('btn-preset-risk')?.addEventListener('click', () => this.loadPreset(2));
      document.getElementById('btn-preset-deadlock')?.addEventListener('click', () => this.loadPreset(3));

      // 2. Main Detection Action
      document.getElementById('btn-run-detect')?.addEventListener('click', () => {
        this.runDetection(true);
      });

      // 3. Predictive Simulator: Test Request Before Granting (Prior to Deadlock)
      document.getElementById('btn-predict-request')?.addEventListener('click', () => {
        this.runPredictiveTest();
      });

      // 4. Grant Tested Request button
      document.getElementById('btn-apply-tested-request')?.addEventListener('click', () => {
        this.applyTestedRequest();
      });

      // 5. One-Click Resolve Deadlock
      document.getElementById('btn-break-deadlock')?.addEventListener('click', () => {
        this.breakDeadlock();
      });

      // 6. Reset / Undo
      document.getElementById('btn-reset-state')?.addEventListener('click', () => {
        this.loadPreset(1);
      });

      // 7. Add Process & Add Resource
      document.getElementById('btn-add-proc-simple')?.addEventListener('click', () => {
        const proc = root.DeadlockState?.addProcess();
        if (proc) {
          this.log('STATE', `Added new process ${proc.name}.`);
          this.runDetection(true);
        }
      });

      document.getElementById('btn-add-res-simple')?.addEventListener('click', () => {
        const rName = root.DeadlockState?.addResource();
        if (rName) {
          this.log('STATE', `Added new resource type ${rName}.`);
          this.runDetection(true);
        }
      });

      // 8. Terminal Logs
      document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
        this.logs = [];
        this.renderLogs();
      });
    }

    startAutoDetection() {
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => {
        if (this.isAutoDetect) {
          this.runDetection(false);
        }
      }, 1500);
    }

    /**
     * Runs detection on the current state (During Deadlock evaluation)
     */
    runDetection(verbose = false) {
      const state = root.DeadlockState;
      if (!state) return;

      const snapshot = state.getSnapshot();
      const result = root.DeadlockDetector.detect(snapshot);

      const previousHadDeadlock = snapshot.deadlockedProcessIds.length > 0;
      state.setDetectionResults(result.deadlockedIds, result.cycles || []);

      if (verbose || (result.isDeadlocked !== previousHadDeadlock)) {
        if (result.isDeadlocked) {
          if (result.cycles && result.cycles.length > 0) {
            const cycleText = result.cycles.map(c => {
              return c.map(id => {
                const p = snapshot.processes.find(pr => pr.id === id);
                return p ? p.name : `P${id}`;
              }).join(' → ');
            }).join(' | ');
            this.log('DURING: DEADLOCK DETECTED', `Circular wait cycle: [${cycleText}]. Processes are stuck waiting for each other!`);
          } else {
            const names = result.deadlockedIds.map(id => `P${id}`).join(', ');
            this.log('DURING: DEADLOCK DETECTED', `Processes [${names}] are permanently blocked and cannot finish.`);
          }
        } else if (previousHadDeadlock && !result.isDeadlocked) {
          this.log('SAFE STATE RESTORED', 'Deadlock resolved! All processes can now complete.');
        }
      }

      root.DeadlockRenderer?.updateStatusSummary();
      return result;
    }

    /**
     * Executes the Predictive Request Test (Prior to Deadlock)
     */
    runPredictiveTest() {
      const state = root.DeadlockState;
      if (!state) return;

      const procSelect = document.getElementById('predict-process-select');
      const resSelect = document.getElementById('predict-resource-select');
      const amtInput = document.getElementById('predict-amount-input');
      const resultBox = document.getElementById('predict-result-box');
      const applyBtn = document.getElementById('btn-apply-tested-request');

      const processId = parseInt(procSelect?.value, 10);
      const resourceIdx = parseInt(resSelect?.value, 10);
      const amount = Math.max(1, parseInt(amtInput?.value, 10) || 1);

      const snapshot = state.getSnapshot();
      const prediction = root.DeadlockDetector.predictRequest(snapshot, processId, resourceIdx, amount);

      if (!resultBox) return;
      resultBox.style.display = 'block';

      if (prediction.causesDeadlock) {
        resultBox.className = 'prediction-result-box result-deadlock';
        resultBox.innerHTML = `
          <strong>🚨 PRE-DEADLOCK DETECTED (PRIOR TO ALLOCATION):</strong>
          <p>${prediction.message}</p>
          <small>Recommendation: Do NOT grant this request. System should wait until resources are released to prevent deadlock.</small>
        `;
        if (applyBtn) {
          applyBtn.style.display = 'inline-flex';
          applyBtn.textContent = '⚠️ Force Grant Anyway (Trigger Deadlock)';
          applyBtn.className = 'btn btn-danger';
        }
        this.log('PRIOR: PRE-DEADLOCK WARNING', prediction.message);
      } else {
        resultBox.className = 'prediction-result-box result-safe';
        resultBox.innerHTML = `
          <strong>✅ SAFE TO GRANT (PRIOR TO ALLOCATION):</strong>
          <p>${prediction.message}</p>
          <small>Recommendation: Safe to approve. Granting this will NOT cause a deadlock.</small>
        `;
        if (applyBtn) {
          applyBtn.style.display = 'inline-flex';
          applyBtn.textContent = '✅ Grant Request (Safe)';
          applyBtn.className = 'btn btn-primary';
        }
        this.log('PRIOR: SAFE PREDICTION', prediction.message);
      }

      this.lastTestParams = { processId, resourceIdx, amount };
    }

    /**
     * Grants the tested request into active state
     */
    applyTestedRequest() {
      if (!this.lastTestParams) return;
      const { processId, resourceIdx, amount } = this.lastTestParams;
      const state = root.DeadlockState;
      const pIdx = state.processes.findIndex(p => p.id === processId);
      if (pIdx === -1) return;

      const avail = state.available[resourceIdx] || 0;
      if (amount <= avail) {
        state.setAvailable(resourceIdx, avail - amount);
        state.setAllocation(pIdx, resourceIdx, (state.allocation[pIdx][resourceIdx] || 0) + amount);
        this.log('ACTION: GRANTED', `Granted ${amount} × ${state.resourceNames[resourceIdx]} to ${state.processes[pIdx].name}.`);
      } else {
        // Exceeds available, set as blocked request
        state.setRequest(pIdx, resourceIdx, (state.request[pIdx][resourceIdx] || 0) + amount);
        this.log('ACTION: BLOCKED REQUEST', `${state.processes[pIdx].name} requested ${amount} × ${state.resourceNames[resourceIdx]} (exceeds available, now WAITING).`);
      }

      this.runDetection(true);
      const applyBtn = document.getElementById('btn-apply-tested-request');
      if (applyBtn) applyBtn.style.display = 'none';
    }

    /**
     * Simple one-click "Break Deadlock" action
     */
    breakDeadlock() {
      const snapshot = root.DeadlockState.getSnapshot();
      const detection = root.DeadlockDetector.detect(snapshot);

      if (!detection.isDeadlocked || detection.deadlockedIds.length === 0) {
        this.log('INFO', 'System is already safe. No deadlock to break.');
        return;
      }

      // Preempt contested resource from the first deadlocked process
      const victimId = detection.deadlockedIds[0];
      const victimName = snapshot.processes.find(p => p.id === victimId)?.name || `P${victimId}`;

      root.DeadlockRecovery?.executePreemptionRollback(victimId);
      this.log('RECOVERY', `Preempted resources from ${victimName} to break the circular dependency.`);

      this.runDetection(true);
    }

    /**
     * Loads one of the 3 beginner-friendly presets
     */
    loadPreset(presetNumber) {
      const state = root.DeadlockState;
      const now = Date.now();

      // Reset test result box
      const resultBox = document.getElementById('predict-result-box');
      if (resultBox) resultBox.style.display = 'none';
      const applyBtn = document.getElementById('btn-apply-tested-request');
      if (applyBtn) applyBtn.style.display = 'none';

      // Highlight active preset button
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

      if (presetNumber === 1) {
        // Preset 1: 🟢 Safe Running State (No Deadlock)
        document.getElementById('btn-preset-safe')?.classList.add('active');
        state.loadSnapshot({
          resourceNames: ['R0', 'R1', 'R2'],
          available: [2, 1, 1],
          processes: [
            { id: 0, name: 'P0', priority: 5, timestamp: now - 10000, rollbackCount: 0, status: 'READY', x: 180, y: 130 },
            { id: 1, name: 'P1', priority: 6, timestamp: now - 8000, rollbackCount: 0, status: 'READY', x: 380, y: 130 },
            { id: 2, name: 'P2', priority: 4, timestamp: now - 4000, rollbackCount: 0, status: 'READY', x: 280, y: 260 }
          ],
          allocation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ],
          request: [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
          ],
          mode: 'single',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        this.log('PRESET 1', '🟢 Loaded Safe State: System has ample free resources. No deadlocks.');
      } else if (presetNumber === 2) {
        // Preset 2: 🟡 Prior to Deadlock (Deadlock Risk / Pre-Deadlock Warning)
        document.getElementById('btn-preset-risk')?.classList.add('active');
        state.loadSnapshot({
          resourceNames: ['R0', 'R1'],
          available: [1, 0],
          processes: [
            { id: 0, name: 'P0', priority: 5, timestamp: now - 9000, rollbackCount: 0, status: 'READY', x: 200, y: 180 },
            { id: 1, name: 'P1', priority: 7, timestamp: now - 7000, rollbackCount: 0, status: 'WAITING', x: 380, y: 180 }
          ],
          allocation: [
            [0, 1], // P0 holds R1
            [0, 0]  // P1 holds nothing
          ],
          request: [
            [0, 0], // P0 has no pending request currently
            [0, 1]  // P1 is waiting for R1 (held by P0)
          ],
          mode: 'single',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        this.log('PRESET 2', '🟡 Loaded Prior-to-Deadlock Risk: P1 is waiting for R1 held by P0. If P0 requests R0, a circular deadlock is imminent! Use "Test Request" below.');
      } else if (presetNumber === 3) {
        // Preset 3: 🔴 During Deadlock (Active Circular Wait)
        document.getElementById('btn-preset-deadlock')?.classList.add('active');
        state.loadSnapshot({
          resourceNames: ['R0', 'R1'],
          available: [0, 0],
          processes: [
            { id: 0, name: 'P0', priority: 5, timestamp: now - 15000, rollbackCount: 0, status: 'WAITING', x: 200, y: 180 },
            { id: 1, name: 'P1', priority: 7, timestamp: now - 10000, rollbackCount: 0, status: 'WAITING', x: 380, y: 180 }
          ],
          allocation: [
            [1, 0], // P0 holds R0
            [0, 1]  // P1 holds R1
          ],
          request: [
            [0, 1], // P0 waits for R1
            [1, 0]  // P1 waits for R0
          ],
          mode: 'single',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        this.log('PRESET 3', '🔴 Loaded Active Deadlock (During): P0 holds R0 and wants R1; P1 holds R1 and wants R0. Active cycle P0 ⇄ P1!');
      }

      this.runDetection(true);
    }

    log(tag, message) {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.logs.unshift({ time: timeStr, tag: tag.toUpperCase(), message });
      if (this.logs.length > 80) this.logs.pop();
      this.renderLogs();
    }

    renderLogs() {
      const container = document.getElementById('diagnostics-log-stream');
      if (!container) return;

      container.innerHTML = this.logs.map(item => {
        let tagClass = 'tag-default';
        if (item.tag.includes('PRIOR')) tagClass = 'tag-amber';
        else if (item.tag.includes('DURING') || item.tag.includes('DEADLOCK')) tagClass = 'tag-danger';
        else if (item.tag.includes('SAFE')) tagClass = 'tag-success';
        else if (item.tag.includes('RECOVERY')) tagClass = 'tag-purple';

        return `
          <div class="log-entry">
            <span class="log-time">${item.time}</span>
            <span class="log-tag ${tagClass}">[${item.tag}]</span>
            <span class="log-msg">${item.message}</span>
          </div>
        `;
      }).join('');
    }
  }

  // Export to browser window
  root.DeadlockApp = new ApplicationController();

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      root.DeadlockApp.init();
    });
  }
})(typeof window !== 'undefined' ? window : this);
