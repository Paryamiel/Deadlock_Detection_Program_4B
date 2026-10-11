/**
 * recovery.js - Heuristic Deadlock Recovery & Starvation Prevention Manager
 * Implements Starvation-Resistant Victim Cost Function and Automated Resolution:
 * 1. Progressive Termination: Abort lowest-cost victim and re-evaluate
 * 2. Preemption & Rollback: Reclaim contested resources and increment rollbackCount
 */

(function (root) {
  'use strict';

  class RecoveryManager {
    constructor() {
      this.epsilon = 0.0001;
      // Weight constants per prompt spec
      this.weights = {
        allocated: 1.5,
        time: 1.0,
        priority: 2.0,
        rollback: 3.0
      };
      this.victimStrategy = 'lowest-cost'; // 'lowest-cost' or 'starvation-balanced'
    }

    /**
     * Evaluates victim cost metric for a single process
     * Cost = ((Total Allocated * 1.5) + (Time Elapsed * 1.0)) / ((Priority * 2.0) + (Rollback Count * 3.0) + epsilon)
     */
    evaluateProcessCost(proc, snapshot) {
      const idx = snapshot.processes.findIndex(p => p.id === proc.id);
      if (idx === -1) return null;

      // 1. Total Allocated resources
      const allocRow = snapshot.allocation[idx] || [];
      const totalAllocated = allocRow.reduce((sum, val) => sum + val, 0);

      // 2. Time elapsed (in seconds)
      const now = Date.now();
      const timeElapsedSeconds = Math.max(1, Math.round(((now - (proc.timestamp || now)) / 1000) * 10) / 10);

      // 3. Priority (1 to 10)
      const priority = Math.max(1, Math.min(10, proc.priority || 5));

      // 4. Rollback count
      const rollbackCount = proc.rollbackCount || 0;

      // Prompt formula calculation
      const numerator = (totalAllocated * this.weights.allocated) + (timeElapsedSeconds * this.weights.time);
      const denominator = (priority * this.weights.priority) + (rollbackCount * this.weights.rollback) + this.epsilon;
      const rawCost = numerator / denominator;

      // Starvation protection factor:
      // In operating system theory, a process that has already suffered rollbacks
      // should have its termination cost raised so it becomes less prone to repeated preemption.
      const survivalBonus = 1 + (rollbackCount * 1.5);
      const starvationProtectedCost = rawCost * survivalBonus;

      return {
        processId: proc.id,
        processName: proc.name,
        totalAllocated,
        timeElapsedSeconds,
        priority,
        rollbackCount,
        numerator: Math.round(numerator * 1000) / 1000,
        denominator: Math.round(denominator * 1000) / 1000,
        rawCost: Math.round(rawCost * 100) / 100,
        starvationProtectedCost: Math.round(starvationProtectedCost * 100) / 100,
        cost: Math.round(rawCost * 100) / 100,
        breakdownString: `((${totalAllocated} \u00D7 1.5) + (${timeElapsedSeconds}s \u00D7 1.0)) / ((${priority} \u00D7 2.0) + (${rollbackCount} \u00D7 3.0) + \u03B5) = ${(rawCost).toFixed(2)}`
      };
    }

    /**
     * Rank candidate deadlocked processes and pick optimal victim
     */
    selectVictim(deadlockedIds, snapshot, preferProtection = false) {
      if (!deadlockedIds || deadlockedIds.length === 0) return null;

      const candidates = [];
      for (const id of deadlockedIds) {
        const proc = snapshot.processes.find(p => p.id === id);
        if (proc && proc.status !== 'TERMINATED') {
          const evalResult = this.evaluateProcessCost(proc, snapshot);
          if (evalResult) {
            candidates.push(evalResult);
          }
        }
      }

      if (candidates.length === 0) return null;

      // Sort candidate processes to pick victim
      // If preferProtection is active (e.g. Starvation Demo), protect processes with high rollbackCount
      if (preferProtection) {
        // Lowest starvation-protected cost or secondary tie-break on lowest rollbackCount
        candidates.sort((a, b) => {
          if (a.rollbackCount !== b.rollbackCount) {
            return a.rollbackCount - b.rollbackCount; // pick process with fewer rollbacks first!
          }
          return a.rawCost - b.rawCost;
        });
      } else {
        // Standard lowest-cost victim selection per prompt spec
        candidates.sort((a, b) => a.cost - b.cost);
      }

      const selectedVictim = candidates[0];

      return {
        victim: selectedVictim,
        candidates,
        allRankings: candidates.map((c, i) => `#${i + 1} ${c.processName} (Cost: ${c.cost}, Rollbacks: ${c.rollbackCount})`)
      };
    }

    /**
     * Executes Progressive Termination on the selected victim
     * Aborts the lowest-cost process, restores resources, and returns outcome
     */
    executeProgressiveTermination(victimId) {
      if (typeof root.DeadlockState === 'undefined') return null;

      const state = root.DeadlockState;
      const snapshotBefore = state.getSnapshot();
      const victim = snapshotBefore.processes.find(p => p.id === victimId);

      if (!victim) return null;

      const victimEval = this.evaluateProcessCost(victim, snapshotBefore);
      const terminationResult = state.terminateProcess(victimId);

      // Re-run detection to check if deadlock is broken
      const snapshotAfter = state.getSnapshot();
      const detectionAfter = root.DeadlockDetector.detect(snapshotAfter);
      state.setDetectionResults(detectionAfter.deadlockedIds, detectionAfter.cycles || []);

      const outcome = {
        action: 'TERMINATION',
        victimId,
        victimName: victim.name,
        evaluation: victimEval,
        releasedResources: terminationResult.released,
        remainingDeadlocked: detectionAfter.deadlockedIds,
        isResolved: !detectionAfter.isDeadlocked,
        cyclesRemaining: detectionAfter.cycles || []
      };

      state.lastVictimInfo = outcome;
      state.notify('recoveryExecuted', outcome);
      return outcome;
    }

    /**
     * Executes Preemption & Rollback on the selected victim
     * Reclaims contested resources, increments rollbackCount, restores victim to READY
     */
    executePreemptionRollback(victimId) {
      if (typeof root.DeadlockState === 'undefined') return null;

      const state = root.DeadlockState;
      const snapshotBefore = state.getSnapshot();
      const victim = snapshotBefore.processes.find(p => p.id === victimId);

      if (!victim) return null;

      const victimEval = this.evaluateProcessCost(victim, snapshotBefore);
      const preemptionResult = state.preemptProcess(victimId);

      // Re-run detection
      const snapshotAfter = state.getSnapshot();
      const detectionAfter = root.DeadlockDetector.detect(snapshotAfter);
      state.setDetectionResults(detectionAfter.deadlockedIds, detectionAfter.cycles || []);

      const outcome = {
        action: 'ROLLBACK',
        victimId,
        victimName: victim.name,
        evaluation: victimEval,
        preemptedResources: preemptionResult.preempted,
        newRollbackCount: preemptionResult.process.rollbackCount,
        remainingDeadlocked: detectionAfter.deadlockedIds,
        isResolved: !detectionAfter.isDeadlocked,
        cyclesRemaining: detectionAfter.cycles || []
      };

      state.lastVictimInfo = outcome;
      state.notify('recoveryExecuted', outcome);
      return outcome;
    }

    /**
     * Automated full recovery loop:
     * Continues recovering victims until deadlock is completely resolved
     */
    recoverAll(strategy = 'rollback', preferProtection = false, maxSteps = 10) {
      const recoverySteps = [];
      let stepCount = 0;

      while (stepCount < maxSteps) {
        const snapshot = root.DeadlockState.getSnapshot();
        const detection = root.DeadlockDetector.detect(snapshot);

        if (!detection.isDeadlocked || detection.deadlockedIds.length === 0) {
          break; // Deadlock resolved!
        }

        const victimSelection = this.selectVictim(detection.deadlockedIds, snapshot, preferProtection);
        if (!victimSelection || !victimSelection.victim) break;

        const victimId = victimSelection.victim.processId;
        let stepOutcome = null;

        if (strategy === 'termination') {
          stepOutcome = this.executeProgressiveTermination(victimId);
        } else {
          stepOutcome = this.executePreemptionRollback(victimId);
        }

        if (stepOutcome) {
          recoverySteps.push(stepOutcome);
        }

        stepCount++;
      }

      return recoverySteps;
    }
  }

  // Export to browser window
  root.DeadlockRecovery = new RecoveryManager();
})(typeof window !== 'undefined' ? window : this);
