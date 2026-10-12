/**
 * detector.js - Dual Deadlock Detection & Pre-Deadlock Predictive Engine
 * 
 * Supports:
 * 1. DURING DEADLOCK (Active Detection):
 *    - Single-Instance: Wait-For Graph (WFG) with Three-Color DFS cycle detection.
 *    - Multi-Instance: Vector-Matrix reclamation algorithm.
 * 2. PRIOR TO DEADLOCK (Predictive / Pre-Deadlock Detection):
 *    - Evaluates tentative resource claims before they are granted.
 *    - Categorizes system state into: SAFE, DEADLOCK RISK (Prior), or DEADLOCKED (During).
 */

(function (root) {
  'use strict';

  class DetectionEngine {
    constructor() {
      // Color constants for Three-Color DFS
      this.WHITE = 0; // Unvisited
      this.GRAY = 1;  // In current DFS recursion stack (visiting)
      this.BLACK = 2; // Fully visited & safe
    }

    /**
     * Builds the Wait-For Graph (WFG) from the current state snapshot.
     * In single-instance resources, if P_j holds resource R_k and P_i requests R_k,
     * then a directed edge P_i -> P_j is formed (P_i waits for P_j).
     */
    buildWaitForGraph(snapshot) {
      const { processes, allocation, request, resourceNames } = snapshot;
      const m = resourceNames.length;

      // Active process index mapping
      const activeIndices = [];
      const idToIndex = new Map();
      const indexToId = new Map();

      processes.forEach((p, idx) => {
        if (p.status !== 'TERMINATED') {
          activeIndices.push(idx);
          idToIndex.set(p.id, idx);
          indexToId.set(idx, p.id);
        }
      });

      // Adjacency list: fromProcessIdx -> Set of toProcessIdx
      const adj = new Map();
      const edgeDetails = [];

      for (const idx of activeIndices) {
        adj.set(idx, new Set());
      }

      // Check each resource
      for (let r = 0; r < m; r++) {
        // Find which active process(es) hold resource r
        const holders = [];
        for (const j of activeIndices) {
          if (allocation[j][r] > 0) {
            holders.push(j);
          }
        }

        // For each active process requesting resource r
        for (const i of activeIndices) {
          if (request[i][r] > 0) {
            for (const j of holders) {
              if (i !== j) {
                adj.get(i).add(j);
                edgeDetails.push({
                  fromIdx: i,
                  toIdx: j,
                  fromId: processes[i].id,
                  toId: processes[j].id,
                  fromName: processes[i].name,
                  toName: processes[j].name,
                  resourceIdx: r,
                  resourceName: resourceNames[r]
                });
              }
            }
          }
        }
      }

      return {
        activeIndices,
        adj,
        edges: edgeDetails,
        idToIndex,
        indexToId
      };
    }

    /**
     * Three-Color DFS cycle detection
     */
    detectSingleInstance(snapshot) {
      const { processes } = snapshot;
      const wfg = this.buildWaitForGraph(snapshot);
      const { activeIndices, adj, edges, idToIndex } = wfg;

      const colors = new Map();
      const callStack = [];
      const cycles = [];
      const deadlockedIds = new Set();
      const steps = [];

      for (const idx of activeIndices) {
        colors.set(idx, this.WHITE);
      }

      for (const startIdx of activeIndices) {
        if (colors.get(startIdx) === this.WHITE) {
          const dfsStack = [{ node: startIdx, edgeIter: Array.from(adj.get(startIdx))[Symbol.iterator]() }];
          colors.set(startIdx, this.GRAY);
          callStack.push(startIdx);

          while (dfsStack.length > 0) {
            const top = dfsStack[dfsStack.length - 1];
            const u = top.node;
            const nextEdge = top.edgeIter.next();

            if (!nextEdge.done) {
              const v = nextEdge.value;
              const vColor = colors.get(v);

              if (vColor === this.GRAY) {
                // Back-edge found! Cycle detected!
                const cycleIds = [];
                const stackIndex = callStack.indexOf(v);

                if (stackIndex !== -1) {
                  for (let k = stackIndex; k < callStack.length; k++) {
                    cycleIds.push(processes[callStack[k]].id);
                    deadlockedIds.add(processes[callStack[k]].id);
                  }
                  cycleIds.push(processes[v].id);
                } else {
                  cycleIds.push(processes[u].id, processes[v].id);
                  deadlockedIds.add(processes[u].id);
                  deadlockedIds.add(processes[v].id);
                }

                const cycleKey = cycleIds.slice(0, -1).sort().join('-');
                const isDuplicate = cycles.some(c => c.slice(0, -1).sort().join('-') === cycleKey);
                if (!isDuplicate) {
                  cycles.push(cycleIds);
                }
              } else if (vColor === this.WHITE) {
                colors.set(v, this.GRAY);
                callStack.push(v);
                dfsStack.push({ node: v, edgeIter: Array.from(adj.get(v))[Symbol.iterator]() });
              }
            } else {
              colors.set(u, this.BLACK);
              callStack.pop();
              dfsStack.pop();
            }
          }
        }
      }

      return {
        algorithm: 'single-instance-wfg',
        isDeadlocked: deadlockedIds.size > 0,
        deadlockedIds: Array.from(deadlockedIds),
        cycles,
        wfg,
        steps
      };
    }

    /**
     * Multi-Instance Vector-Matrix Deadlock Detection Algorithm
     */
    detectMultiInstance(snapshot) {
      const { processes, available, allocation, request, resourceNames } = snapshot;
      const n = processes.length;
      const m = resourceNames.length;

      const Work = [...available];
      const Finish = new Array(n).fill(false);

      for (let i = 0; i < n; i++) {
        if (processes[i].status === 'TERMINATED') {
          Finish[i] = true;
          continue;
        }
        const isZeroAlloc = allocation[i].every(val => val === 0);
        if (isZeroAlloc) {
          Finish[i] = true;
        }
      }

      const safeSequence = [];
      let foundInRound = true;

      while (foundInRound) {
        foundInRound = false;

        for (let i = 0; i < n; i++) {
          if (!Finish[i]) {
            const req = request[i];
            const canSatisfy = req.every((rVal, rIdx) => rVal <= Work[rIdx]);

            if (canSatisfy) {
              for (let r = 0; r < m; r++) {
                Work[r] += allocation[i][r];
              }
              Finish[i] = true;
              safeSequence.push(processes[i].id);
              foundInRound = true;
              break;
            }
          }
        }
      }

      const deadlockedIds = [];
      for (let i = 0; i < n; i++) {
        if (!Finish[i] && processes[i].status !== 'TERMINATED') {
          deadlockedIds.push(processes[i].id);
        }
      }

      return {
        algorithm: 'multi-instance-matrix',
        isDeadlocked: deadlockedIds.length > 0,
        deadlockedIds,
        finalWork: Work,
        finish: Finish,
        safeSequence
      };
    }

    /**
     * Standard detection runner respecting mode
     */
    detect(snapshot) {
      if (snapshot.mode === 'single') {
        return this.detectSingleInstance(snapshot);
      } else {
        return this.detectMultiInstance(snapshot);
      }
    }

    /**
     * =========================================================================
     * PRIOR TO DEADLOCK: PREDICTIVE DEADLOCK DETECTION & SAFETY EVALUATION
     * =========================================================================
     * Simulates granting a proposed resource request before it is committed.
     * Tells the user whether granting it will result in a Deadlock (Unsafe)
     * or remain completely Safe.
     */
    predictRequest(snapshot, processId, resourceIdx, amount) {
      const pIdx = snapshot.processes.findIndex(p => p.id === processId);
      if (pIdx === -1) {
        return { valid: false, message: 'Invalid process selected.' };
      }

      const requestedAmt = Math.max(1, parseInt(amount, 10) || 1);
      const resName = snapshot.resourceNames[resourceIdx] || `R${resourceIdx}`;
      const procName = snapshot.processes[pIdx].name;

      // 1. Check if the system has enough available resources right now
      const currentlyAvail = snapshot.available[resourceIdx] || 0;
      if (requestedAmt > currentlyAvail) {
        return {
          valid: true,
          immediateGrantPossible: false,
          causesDeadlock: true,
          stateType: 'IMMEDIATELY_BLOCKED',
          message: `⚠️ PRIOR WARNING: Request of ${requestedAmt} × ${resName} by ${procName} exceeds Available (${currentlyAvail}). Process would immediately block.`,
          deadlockedIds: [processId],
          cycles: []
        };
      }

      // 2. Clone state and tentatively simulate granting the request
      const trialSnapshot = {
        resourceNames: [...snapshot.resourceNames],
        available: [...snapshot.available],
        allocation: snapshot.allocation.map(r => [...r]),
        request: snapshot.request.map(r => [...r]),
        processes: snapshot.processes.map(p => ({ ...p })),
        mode: snapshot.mode
      };

      // Tentatively allocate to process
      trialSnapshot.available[resourceIdx] -= requestedAmt;
      trialSnapshot.allocation[pIdx][resourceIdx] += requestedAmt;
      trialSnapshot.request[pIdx][resourceIdx] = Math.max(0, trialSnapshot.request[pIdx][resourceIdx] - requestedAmt);

      // Run detection on the simulated post-grant state
      const detectionResult = this.detect(trialSnapshot);

      if (detectionResult.isDeadlocked) {
        const cycleStr = (detectionResult.cycles && detectionResult.cycles.length > 0)
          ? detectionResult.cycles[0].map(id => {
              const p = trialSnapshot.processes.find(pr => pr.id === id);
              return p ? p.name : `P${id}`;
            }).join(' → ')
          : detectionResult.deadlockedIds.map(id => `P${id}`).join(', ');

        return {
          valid: true,
          immediateGrantPossible: true,
          causesDeadlock: true,
          stateType: 'DEADLOCK_IMMINENT',
          deadlockedIds: detectionResult.deadlockedIds,
          cycles: detectionResult.cycles,
          message: `PRE-DEADLOCK DETECTED (PRIOR TO GRANT): Granting ${requestedAmt} × ${resName} to ${procName} places the system in an unsafe state that triggers active circular wait: [${cycleStr}].`,
          safeSequence: []
        };
      } else {
        const seqNames = (detectionResult.safeSequence || []).map(id => {
          const p = trialSnapshot.processes.find(pr => pr.id === id);
          return p ? p.name : `P${id}`;
        }).join(' → ');

        return {
          valid: true,
          immediateGrantPossible: true,
          causesDeadlock: false,
          stateType: 'SAFE_TO_GRANT',
          deadlockedIds: [],
          cycles: [],
          message: `SAFE TO GRANT (HYPOTHESIS VALIDATED): Approving ${requestedAmt} × ${resName} for ${procName} preserves system schedulability. Verified safe sequence: [${seqNames || 'All Processes'}].`,
          safeSequence: detectionResult.safeSequence || []
        };
      }
    }

    /**
     * Comprehensive System State Assessment:
     * Returns:
     * - 'SAFE': Normal running system, all processes finishable.
     * - 'RISK' (Prior to deadlock): Processes blocked on limited resources, warning state.
     * - 'DEADLOCKED' (During deadlock): Active cycle or permanent block confirmed.
     */
    assessSystemState(snapshot) {
      const activeDetection = this.detect(snapshot);

      if (activeDetection.isDeadlocked) {
        return {
          phase: 'DURING',
          status: 'DEADLOCKED',
          badgeClass: 'badge-danger',
          badgeText: 'DEADLOCK ACTIVE (DURING)',
          headline: `Deadlock Confirmed (${activeDetection.deadlockedIds.length} processes in circular wait)`,
          details: activeDetection.cycles && activeDetection.cycles.length > 0
            ? `Active circular wait cycle: ${activeDetection.cycles.map(c => c.map(id => `P${id}`).join(' → ')).join(' | ')}.`
            : `Blocked processes: ${activeDetection.deadlockedIds.map(id => `P${id}`).join(', ')} cannot obtain needed resources.`,
          deadlockedIds: activeDetection.deadlockedIds,
          cycles: activeDetection.cycles
        };
      }

      // Check if any process has unsatisfied requests (pre-deadlock risk / prior warning)
      const { processes, request, available } = snapshot;
      const waitingProcs = [];

      processes.forEach((p, pIdx) => {
        if (p.status !== 'TERMINATED') {
          const hasOverClaim = request[pIdx].some((rVal, rIdx) => rVal > available[rIdx]);
          if (hasOverClaim) {
            waitingProcs.push(p.name);
          }
        }
      });

      if (waitingProcs.length > 0) {
        return {
          phase: 'PRIOR',
          status: 'RISK',
          badgeClass: 'badge-warning',
          badgeText: 'DEADLOCK RISK (PRIOR)',
          headline: `Pre-Deadlock Warning: ${waitingProcs.join(', ')} currently pending`,
          details: `System capacity is constrained. Additional uncoordinated allocations will induce circular wait.`,
          deadlockedIds: [],
          cycles: []
        };
      }

      return {
        phase: 'SAFE',
        status: 'SAFE',
        badgeClass: 'badge-success',
        badgeText: 'SAFE CONCURRENCY STATE',
        headline: `System is in a Stable Safe State`,
        details: `All processes can proceed to completion. No circular dependency exists.`,
        deadlockedIds: [],
        cycles: []
      };
    }
  }

  // Export to browser window
  root.DeadlockDetector = new DetectionEngine();
})(typeof window !== 'undefined' ? window : this);
