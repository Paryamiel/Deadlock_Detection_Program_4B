/**
 * app.js - Main Application Orchestrator & Simulation Controller
 * Manages trigger modes (Periodic Timer, On-Request Block, Manual Step-by-Step),
 * scenario presets, diagnostics terminal logging, and UI bindings.
 */

(function (root) {
  'use strict';

  class ApplicationController {
    constructor() {
      // Trigger modes
      this.triggerMode = 'timer'; // 'timer', 'on-request', 'manual'
      this.timerInterval = 2000;  // 500ms to 5000ms
      this.timerId = null;
      this.isTimerRunning = false;

      // Manual Step-by-step state
      this.stepIterator = null;
      this.stepHistory = [];
      this.currentStepIndex = -1;
      this.stepAutoPlayId = null;

      // Diagnostics logs
      this.logs = [];
      this.logFilter = 'ALL';
    }

    /**
     * Initializes the entire application
     */
    init() {
      // 1. Initialize renderer
      root.DeadlockRenderer?.init('wfg-canvas');

      // 2. Subscribe renderer to state changes
      root.DeadlockState?.subscribe((event, snapshot, payload) => {
        this.onStateChanged(event, snapshot, payload);
      });

      // 3. Bind UI event listeners
      this.bindControls();

      // 4. Load initial preset (Preset 1)
      this.loadPreset(1);

      // 5. Start periodic timer by default
      this.startPeriodicTimer();

      this.log('SYSTEM', 'Deadlock Detection & Recovery Visualizer initialized successfully.');
    }

    /**
     * Responds to core state changes
     */
    onStateChanged(event, snapshot, payload) {
      // Render matrices and canvas
      root.DeadlockRenderer?.renderMatrices();
      root.DeadlockRenderer?.updateStatusSummary();

      // Trigger On-Request Block if in that mode
      if (this.triggerMode === 'on-request' && event === 'cellEdited') {
        if (payload.type === 'request' && payload.val > snapshot.available[payload.r]) {
          this.log('TRIGGER: REQUEST', `Process P${payload.p} requested ${payload.val} of ${snapshot.resourceNames[payload.r]} (exceeds Available: ${snapshot.available[payload.r]}). Immediate detection invoked.`);
          this.runDetection(true);
        }
      }
    }

    /**
     * Bind all buttons, sliders, preset buttons, and mode switches
     */
    bindControls() {
      // Algorithm mode switch (Single-Instance vs Multi-Instance)
      const modeSelect = document.getElementById('select-algorithm-mode');
      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          root.DeadlockState?.setMode(e.target.value);
          this.log('CONFIG', `Detection algorithm switched to: ${e.target.value.toUpperCase()}`);
          this.runDetection(true);
        });
      }

      // Trigger Mode selection
      const triggerRadioButtons = document.querySelectorAll('input[name="trigger-mode"]');
      triggerRadioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
          this.setTriggerMode(e.target.value);
        });
      });

      // Periodic Timer Slider & Controls
      const timerSlider = document.getElementById('slider-timer-speed');
      const timerSpeedLabel = document.getElementById('label-timer-speed');
      const btnToggleTimer = document.getElementById('btn-toggle-timer');

      if (timerSlider) {
        timerSlider.addEventListener('input', (e) => {
          this.timerInterval = parseInt(e.target.value, 10);
          if (timerSpeedLabel) timerSpeedLabel.textContent = `${this.timerInterval}ms`;
          if (this.isTimerRunning) {
            this.stopPeriodicTimer();
            this.startPeriodicTimer();
          }
        });
      }

      if (btnToggleTimer) {
        btnToggleTimer.addEventListener('click', () => {
          if (this.isTimerRunning) {
            this.stopPeriodicTimer();
          } else {
            this.startPeriodicTimer();
          }
        });
      }

      // Detection & Step Controls
      document.getElementById('btn-run-detection')?.addEventListener('click', () => {
        this.runDetection(true);
      });

      document.getElementById('btn-step-init')?.addEventListener('click', () => {
        this.initStepByStep();
      });

      document.getElementById('btn-step-forward')?.addEventListener('click', () => {
        this.stepForward();
      });

      document.getElementById('btn-step-backward')?.addEventListener('click', () => {
        this.stepBackward();
      });

      document.getElementById('btn-step-autoplay')?.addEventListener('click', () => {
        this.toggleStepAutoPlay();
      });

      // Recovery Controls
      document.getElementById('btn-recover-terminate')?.addEventListener('click', () => {
        this.triggerRecovery('termination');
      });

      document.getElementById('btn-recover-rollback')?.addEventListener('click', () => {
        this.triggerRecovery('rollback');
      });

      document.getElementById('btn-recover-all')?.addEventListener('click', () => {
        this.triggerRecoveryAll();
      });

      // Scenario Presets
      document.getElementById('btn-preset-1')?.addEventListener('click', () => this.loadPreset(1));
      document.getElementById('btn-preset-2')?.addEventListener('click', () => this.loadPreset(2));
      document.getElementById('btn-preset-3')?.addEventListener('click', () => this.loadPreset(3));

      // Entity Management
      document.getElementById('btn-add-process')?.addEventListener('click', () => {
        const proc = root.DeadlockState?.addProcess();
        if (proc) {
          this.log('STATE', `Added new process ${proc.name} (Priority: ${proc.priority}).`);
          this.runDetection(false);
        }
      });

      document.getElementById('btn-add-resource')?.addEventListener('click', () => {
        const rName = root.DeadlockState?.addResource();
        if (rName) {
          this.log('STATE', `Added new resource type ${rName}.`);
          this.runDetection(false);
        }
      });

      document.getElementById('btn-undo')?.addEventListener('click', () => {
        if (root.DeadlockState?.undo()) {
          this.log('STATE', 'Reverted to previous snapshot state.');
          this.runDetection(false);
        }
      });

      // Terminal Logs Controls
      document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
        this.logs = [];
        this.renderLogs();
      });

      document.getElementById('btn-export-logs')?.addEventListener('click', () => {
        this.exportLogs();
      });

      // Log Filter Buttons
      document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this.logFilter = e.target.dataset.filter || 'ALL';
          this.renderLogs();
        });
      });
    }

    /**
     * Sets current trigger mode
     */
    setTriggerMode(mode) {
      this.triggerMode = mode;
      this.log('TRIGGER', `Active trigger mode set to: ${mode.toUpperCase()}`);

      const timerControls = document.getElementById('timer-controls-group');
      const stepControls = document.getElementById('step-controls-group');

      if (mode === 'timer') {
        if (timerControls) timerControls.style.display = 'flex';
        if (stepControls) stepControls.style.display = 'none';
        this.startPeriodicTimer();
      } else if (mode === 'manual') {
        if (timerControls) timerControls.style.display = 'none';
        if (stepControls) stepControls.style.display = 'flex';
        this.stopPeriodicTimer();
        this.initStepByStep();
      } else {
        // on-request
        if (timerControls) timerControls.style.display = 'none';
        if (stepControls) stepControls.style.display = 'none';
        this.stopPeriodicTimer();
      }
    }

    /**
     * Periodic background timer
     */
    startPeriodicTimer() {
      if (this.isTimerRunning) return;
      this.isTimerRunning = true;

      const btn = document.getElementById('btn-toggle-timer');
      if (btn) {
        btn.classList.add('active');
        btn.innerHTML = `<span class="icon">⏸</span> Pause Timer`;
      }

      this.timerId = setInterval(() => {
        this.runDetection(false);
      }, this.timerInterval);
    }

    stopPeriodicTimer() {
      if (!this.isTimerRunning) return;
      this.isTimerRunning = false;

      const btn = document.getElementById('btn-toggle-timer');
      if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = `<span class="icon">▶</span> Resume Timer`;
      }

      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
    }

    /**
     * Runs full detection algorithm synchronously
     */
    runDetection(verbose = true) {
      const state = root.DeadlockState;
      if (!state) return;

      const snapshot = state.getSnapshot();
      const result = root.DeadlockDetector.detect(snapshot);

      const hadDeadlock = snapshot.deadlockedProcessIds.length > 0;
      state.setDetectionResults(result.deadlockedIds, result.cycles || []);

      if (verbose || (result.isDeadlocked !== hadDeadlock)) {
        if (result.isDeadlocked) {
          const names = result.deadlockedIds.map(id => {
            const p = snapshot.processes.find(pr => pr.id === id);
            return p ? p.name : `P${id}`;
          }).join(', ');

          let cycleMsg = '';
          if (result.cycles && result.cycles.length > 0) {
            cycleMsg = result.cycles.map(c => {
              return c.map(id => {
                const p = snapshot.processes.find(pr => pr.id === id);
                return p ? p.name : `P${id}`;
              }).join(' \u2192 ');
            }).join(' | ');
            this.log('CYCLE DETECTED', `Deadlock cycle: [${cycleMsg}]`);
          } else {
            this.log('DEADLOCK DETECTED', `Multi-instance blocked processes: [${names}]`);
          }
        } else if (hadDeadlock && !result.isDeadlocked) {
          this.log('SAFE STATE RESTORED', 'All resource dependencies resolved. No active deadlock.');
        }
      }

      root.DeadlockRenderer?.renderInspectionView({
        Work: result.finalWork || [...snapshot.available],
        Finish: result.finish || [],
        message: result.isDeadlocked
          ? `\u26A0\uFE0F Deadlock Confirmed: ${result.deadlockedIds.length} process(es) unable to finish.`
          : `\u2705 System in Safe State: Valid execution sequence: [${(result.safeSequence || []).map(id => `P${id}`).join(' \u2192 ')}]`
      });

      return result;
    }

    /**
     * Initializes Step-by-Step Playback
     */
    initStepByStep() {
      const snapshot = root.DeadlockState.getSnapshot();
      if (snapshot.mode === 'single') {
        this.stepIterator = root.DeadlockDetector.stepSingleInstance(snapshot);
      } else {
        this.stepIterator = root.DeadlockDetector.stepMultiInstance(snapshot);
      }

      this.stepHistory = [];
      this.currentStepIndex = -1;

      // Advance to first step
      this.stepForward();
      this.log('STEP', 'Step-by-step detection walkthrough initialized.');
    }

    /**
     * Advance one iteration forward in algorithmic walkthrough
     */
    stepForward() {
      // If we are inspecting previous steps, advance in history
      if (this.currentStepIndex < this.stepHistory.length - 1) {
        this.currentStepIndex++;
        this.applyStepData(this.stepHistory[this.currentStepIndex]);
        return;
      }

      if (!this.stepIterator) {
        this.initStepByStep();
        return;
      }

      const next = this.stepIterator.next();
      if (!next.done) {
        const stepData = next.value;
        this.stepHistory.push(stepData);
        this.currentStepIndex = this.stepHistory.length - 1;
        this.applyStepData(stepData);

        if (stepData.type === 'CYCLE_DETECTED') {
          this.log('CYCLE DETECTED', stepData.message);
        } else if (stepData.type === 'COMPLETE') {
          this.log('COMPLETE', stepData.message);
          this.stopStepAutoPlay();
        }
      } else {
        this.stopStepAutoPlay();
      }
    }

    /**
     * Step backward in algorithmic history
     */
    stepBackward() {
      if (this.currentStepIndex > 0) {
        this.currentStepIndex--;
        this.applyStepData(this.stepHistory[this.currentStepIndex]);
      }
    }

    /**
     * Toggle auto-play stepping
     */
    toggleStepAutoPlay() {
      const btn = document.getElementById('btn-step-autoplay');
      if (this.stepAutoPlayId) {
        this.stopStepAutoPlay();
      } else {
        if (btn) btn.innerHTML = `<span class="icon">⏸</span> Pause Playback`;
        this.stepAutoPlayId = setInterval(() => {
          this.stepForward();
        }, 1200);
      }
    }

    stopStepAutoPlay() {
      if (this.stepAutoPlayId) {
        clearInterval(this.stepAutoPlayId);
        this.stepAutoPlayId = null;
        const btn = document.getElementById('btn-step-autoplay');
        if (btn) btn.innerHTML = `<span class="icon">▶</span> Auto-Play Steps`;
      }
    }

    /**
     * Updates visual components with step-by-step iteration data
     */
    applyStepData(stepData) {
      if (!stepData) return;
      root.DeadlockRenderer?.renderInspectionView(stepData);

      const stepCounter = document.getElementById('step-counter-label');
      if (stepCounter) {
        stepCounter.textContent = `Step ${this.currentStepIndex + 1} (${stepData.type})`;
      }

      // If cycles detected during step, update state
      if (stepData.cycles) {
        root.DeadlockState.detectedCycles = stepData.cycles.map(c => [...c]);
      }
      if (stepData.deadlockedIds) {
        root.DeadlockState.deadlockedProcessIds = [...stepData.deadlockedIds];
      }
    }

    /**
     * Triggers deadlock recovery action
     */
    triggerRecovery(strategy) {
      const snapshot = root.DeadlockState.getSnapshot();
      const detection = root.DeadlockDetector.detect(snapshot);

      if (!detection.isDeadlocked || detection.deadlockedIds.length === 0) {
        this.log('RECOVERY', 'No deadlocks currently detected. System is safe.');
        return;
      }

      // Select victim with starvation-resistant heuristic
      const preferProtection = true; // Protect previously rolled-back processes
      const victimSelection = root.DeadlockRecovery.selectVictim(detection.deadlockedIds, snapshot, preferProtection);

      if (!victimSelection || !victimSelection.victim) {
        this.log('RECOVERY', 'Unable to evaluate victim candidates.');
        return;
      }

      const victim = victimSelection.victim;
      this.log('VICTIM EVALUATED', `${victim.processName} chosen as victim. Cost: ${victim.cost} (${victim.breakdownString}).`);

      let outcome = null;
      if (strategy === 'termination') {
        outcome = root.DeadlockRecovery.executeProgressiveTermination(victim.processId);
        this.log('RECOVERY: TERMINATED', `Process ${outcome.victimName} aborted. Released resources: [${outcome.releasedResources.join(', ')}].`);
      } else {
        outcome = root.DeadlockRecovery.executePreemptionRollback(victim.processId);
        this.log('RECOVERY: ROLLBACK', `Process ${outcome.victimName} preempted and returned to READY. Rollback count increased to ${outcome.newRollbackCount}.`);
      }

      if (outcome.isResolved) {
        this.log('SAFE STATE RESTORED', `Deadlock broken! System successfully returned to safe state.`);
      } else {
        this.log('RECOVERY', `Deadlock cycle partially broken. ${outcome.remainingDeadlocked.length} process(es) remain deadlocked.`);
      }

      root.DeadlockRenderer?.renderMatrices();
      root.DeadlockRenderer?.updateStatusSummary();
    }

    /**
     * Automated recovery until all deadlocks are resolved
     */
    triggerRecoveryAll() {
      const steps = root.DeadlockRecovery.recoverAll('rollback', true, 10);
      if (steps.length === 0) {
        this.log('RECOVERY', 'System already safe. No recovery actions needed.');
      } else {
        this.log('RECOVERY', `Automated recovery executed ${steps.length} resolution step(s). Safe state restored.`);
      }
      root.DeadlockRenderer?.renderMatrices();
      root.DeadlockRenderer?.updateStatusSummary();
    }

    /**
     * Loads one of the 3 specified scenarios
     */
    loadPreset(presetNumber) {
      this.stopStepAutoPlay();
      const state = root.DeadlockState;
      const now = Date.now();

      if (presetNumber === 1) {
        // Preset 1: Single-Instance Classic 3-Node Cycle (P0 -> P1 -> P2 -> P0)
        state.loadSnapshot({
          resourceNames: ['R0', 'R1', 'R2'],
          available: [0, 0, 0],
          processes: [
            { id: 0, name: 'P0', priority: 5, timestamp: now - 15000, rollbackCount: 0, status: 'WAITING', x: 200, y: 130 },
            { id: 1, name: 'P1', priority: 7, timestamp: now - 10000, rollbackCount: 0, status: 'WAITING', x: 420, y: 130 },
            { id: 2, name: 'P2', priority: 3, timestamp: now - 5000, rollbackCount: 0, status: 'WAITING', x: 310, y: 290 }
          ],
          allocation: [
            [1, 0, 0], // P0 holds R0
            [0, 1, 0], // P1 holds R1
            [0, 0, 1]  // P2 holds R2
          ],
          request: [
            [0, 1, 0], // P0 requests R1
            [0, 0, 1], // P1 requests R2
            [1, 0, 0]  // P2 requests R0
          ],
          mode: 'single',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        const modeSelect = document.getElementById('select-algorithm-mode');
        if (modeSelect) modeSelect.value = 'single';

        this.log('PRESET 1', 'Loaded Preset 1: Single-Instance Classic 3-Node Circular Wait (P0 \u2192 P1 \u2192 P2 \u2192 P0).');
      } else if (presetNumber === 2) {
        // Preset 2: Banker's Multi-Instance 5-Process Deadlock
        // Demonstrating zero-allocation process bypassing (P0 holds 0, finishes immediately; P2 finishes; P1, P3, P4 deadlock)
        state.loadSnapshot({
          resourceNames: ['A', 'B', 'C'],
          available: [0, 0, 0],
          processes: [
            { id: 0, name: 'P0', priority: 4, timestamp: now - 18000, rollbackCount: 0, status: 'READY', x: 140, y: 110 },
            { id: 1, name: 'P1', priority: 6, timestamp: now - 14000, rollbackCount: 0, status: 'WAITING', x: 300, y: 90 },
            { id: 2, name: 'P2', priority: 8, timestamp: now - 11000, rollbackCount: 0, status: 'READY', x: 460, y: 110 },
            { id: 3, name: 'P3', priority: 5, timestamp: now - 7000, rollbackCount: 0, status: 'WAITING', x: 410, y: 270 },
            { id: 4, name: 'P4', priority: 3, timestamp: now - 3000, rollbackCount: 0, status: 'WAITING', x: 190, y: 270 }
          ],
          allocation: [
            [0, 0, 0], // P0 has 0 allocations (bypassed / finishes instantly)
            [2, 0, 0], // P1
            [3, 0, 3], // P2
            [2, 1, 1], // P3
            [0, 0, 2]  // P4
          ],
          request: [
            [0, 0, 0], // P0 has 0 requests
            [2, 0, 2], // P1 requests (2,0,2)
            [0, 0, 0], // P2 has 0 requests (can release [3,0,3])
            [1, 0, 0], // P3 requests (1,0,0)
            [0, 0, 2]  // P4 requests (0,0,2)
          ],
          mode: 'multi',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        const modeSelect = document.getElementById('select-algorithm-mode');
        if (modeSelect) modeSelect.value = 'multi';

        this.log('PRESET 2', 'Loaded Preset 2: Banker\'s Multi-Instance 5-Process Deadlock with zero-allocation bypassing.');
      } else if (presetNumber === 3) {
        // Preset 3: Starvation Prevention Demonstration
        // Two competing processes P0 and P1. P0 has lower cost initially and is rolled back.
        // Its rollbackCount increments, shifting victim selection to P1 in subsequent recovery.
        state.loadSnapshot({
          resourceNames: ['R0', 'R1'],
          available: [0, 0],
          processes: [
            { id: 0, name: 'P0', priority: 5, timestamp: now - 6000, rollbackCount: 0, status: 'WAITING', x: 230, y: 180 },
            { id: 1, name: 'P1', priority: 4, timestamp: now - 6000, rollbackCount: 0, status: 'WAITING', x: 380, y: 180 }
          ],
          allocation: [
            [1, 0], // P0 holds R0
            [0, 1]  // P1 holds R1
          ],
          request: [
            [0, 1], // P0 requests R1
            [1, 0]  // P1 requests R0
          ],
          mode: 'single',
          deadlockedProcessIds: [],
          detectedCycles: []
        });

        const modeSelect = document.getElementById('select-algorithm-mode');
        if (modeSelect) modeSelect.value = 'single';

        this.log('PRESET 3', 'Loaded Preset 3: Starvation Prevention Demonstration. Execute "Preempt & Rollback" repeatedly to observe shifting victim choice.');
      }

      this.runDetection(true);
    }

    /**
     * Appends an event to the Diagnostics Terminal Log
     */
    log(tag, message) {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const entry = {
        time: timeStr,
        tag: tag.toUpperCase(),
        message
      };

      this.logs.unshift(entry);
      if (this.logs.length > 150) this.logs.pop();

      this.renderLogs();
    }

    /**
     * Renders log entries into the DOM with syntax highlights
     */
    renderLogs() {
      const container = document.getElementById('diagnostics-log-stream');
      if (!container) return;

      const filtered = this.logs.filter(entry => {
        if (this.logFilter === 'ALL') return true;
        if (this.logFilter === 'TRIGGER' && entry.tag.includes('TRIGGER')) return true;
        if (this.logFilter === 'CYCLE' && (entry.tag.includes('CYCLE') || entry.tag.includes('DEADLOCK'))) return true;
        if (this.logFilter === 'RECOVERY' && (entry.tag.includes('RECOVERY') || entry.tag.includes('VICTIM') || entry.tag.includes('SAFE'))) return true;
        return false;
      });

      container.innerHTML = filtered.map(item => {
        let tagClass = 'tag-default';
        if (item.tag.includes('TRIGGER')) tagClass = 'tag-trigger';
        else if (item.tag.includes('CYCLE') || item.tag.includes('DEADLOCK')) tagClass = 'tag-danger';
        else if (item.tag.includes('VICTIM')) tagClass = 'tag-amber';
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

    /**
     * Exports terminal logs to a downloadable text file
     */
    exportLogs() {
      const text = this.logs.map(l => `[${l.time}] [${l.tag}] ${l.message}`).join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deadlock_diagnostics_${Date.now()}.log`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Export to browser window
  root.DeadlockApp = new ApplicationController();

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      root.DeadlockApp.init();
    });
  }
})(typeof window !== 'undefined' ? window : this);
