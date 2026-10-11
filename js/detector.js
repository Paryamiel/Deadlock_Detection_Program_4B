/**
 * detector.js - Dual Deadlock Detection Engine
 * 1. Single-Instance Resources: Wait-For Graph (WFG) with Three-Color DFS cycle detection
 * 2. Multi-Instance Resources: Vector-Matrix Algorithm (Banker's reclamation variant)
 * Both algorithms provide synchronous execution and step-by-step playback traces.
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
     * Works for multi-instance dependencies as well by mapping held resource claims.
     */
    buildWaitForGraph(snapshot) {
      const { processes, allocation, request, resourceNames } = snapshot;
      const n = processes.length;
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
      const edgeDetails = []; // [{ fromId, toId, resourceName, fromName, toName }]

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
     * Generator for Single-Instance Three-Color DFS cycle detection
     * Yields execution steps for interactive visual inspection
     */
    *stepSingleInstance(snapshot) {
      const { processes } = snapshot;
      const wfg = this.buildWaitForGraph(snapshot);
      const { activeIndices, adj, edges, idToIndex, indexToId } = wfg;

      const colors = new Map();
      const parent = new Map();
      const callStack = []; // stores current recursion path [idx1, idx2, ...]
      const cycles = [];
      const deadlockedIds = new Set();

      for (const idx of activeIndices) {
        colors.set(idx, this.WHITE);
        parent.set(idx, null);
      }

      yield {
        type: 'INIT',
        message: `Constructed Wait-For Graph with ${activeIndices.length} active nodes and ${edges.length} dependency edges.`,
        wfg,
        colors: new Map(colors),
        callStack: [...callStack],
        currentCycle: null,
        cycles: []
      };

      // DFS function with step generation
      for (const startIdx of activeIndices) {
        if (colors.get(startIdx) === this.WHITE) {
          // Recursive DFS implemented with generator steps
          const dfsStack = [{ node: startIdx, edgeIter: Array.from(adj.get(startIdx))[Symbol.iterator]() }];
          colors.set(startIdx, this.GRAY);
          callStack.push(startIdx);

          yield {
            type: 'ENTER_NODE',
            nodeIdx: startIdx,
            processId: processes[startIdx].id,
            processName: processes[startIdx].name,
            color: 'GRAY',
            message: `Visiting ${processes[startIdx].name} (marked GRAY / exploring).`,
            wfg,
            colors: new Map(colors),
            callStack: [...callStack],
            cycles: [...cycles]
          };

          while (dfsStack.length > 0) {
            const top = dfsStack[dfsStack.length - 1];
            const u = top.node;
            const nextEdge = top.edgeIter.next();

            if (!nextEdge.done) {
              const v = nextEdge.value;
              const vColor = colors.get(v);

              yield {
                type: 'CHECK_EDGE',
                fromIdx: u,
                toIdx: v,
                fromName: processes[u].name,
                toName: processes[v].name,
                targetColor: vColor === this.WHITE ? 'WHITE' : vColor === this.GRAY ? 'GRAY' : 'BLACK',
                message: `Checking edge: ${processes[u].name} \u2192 ${processes[v].name} (Target is ${vColor === this.WHITE ? 'WHITE' : vColor === this.GRAY ? 'GRAY' : 'BLACK'}).`,
                wfg,
                colors: new Map(colors),
                callStack: [...callStack],
                cycles: [...cycles]
              };

              if (vColor === this.GRAY) {
                // Back-edge found! We have a cycle!
                const cycleNodes = [];
                const cycleIds = [];
                const stackIndex = callStack.indexOf(v);

                if (stackIndex !== -1) {
                  for (let k = stackIndex; k < callStack.length; k++) {
                    cycleNodes.push(callStack[k]);
                    cycleIds.push(processes[callStack[k]].id);
                    deadlockedIds.add(processes[callStack[k]].id);
                  }
                  // Close the cycle loop
                  cycleIds.push(processes[v].id);
                } else {
                  cycleIds.push(processes[u].id, processes[v].id);
                  deadlockedIds.add(processes[u].id);
                  deadlockedIds.add(processes[v].id);
                }

                // Check for duplicate cycle
                const cycleKey = cycleIds.slice(0, -1).sort().join('-');
                const isDuplicate = cycles.some(c => c.slice(0, -1).sort().join('-') === cycleKey);
                if (!isDuplicate) {
                  cycles.push(cycleIds);
                }

                yield {
                  type: 'CYCLE_DETECTED',
                  fromIdx: u,
                  toIdx: v,
                  cycle: cycleIds,
                  cycleString: cycleIds.map(id => processes[idToIndex.get(id)].name).join(' \u2192 '),
                  message: `\u26A0\uFE0F DEADLOCK CYCLE FOUND: ${cycleIds.map(id => processes[idToIndex.get(id)].name).join(' \u2192 ')}!`,
                  wfg,
                  colors: new Map(colors),
                  callStack: [...callStack],
                  cycles: [...cycles]
                };
              } else if (vColor === this.WHITE) {
                // Explore unvisited neighbor
                colors.set(v, this.GRAY);
                callStack.push(v);
                parent.set(v, u);

                yield {
                  type: 'ENTER_NODE',
                  nodeIdx: v,
                  processId: processes[v].id,
                  processName: processes[v].name,
                  color: 'GRAY',
                  message: `Advancing to ${processes[v].name} (marked GRAY).`,
                  wfg,
                  colors: new Map(colors),
                  callStack: [...callStack],
                  cycles: [...cycles]
                };

                dfsStack.push({ node: v, edgeIter: Array.from(adj.get(v))[Symbol.iterator]() });
              }
            } else {
              // Finished exploring all outgoing edges of u
              colors.set(u, this.BLACK);
              callStack.pop();
              dfsStack.pop();

              yield {
                type: 'FINISH_NODE',
                nodeIdx: u,
                processId: processes[u].id,
                processName: processes[u].name,
                color: 'BLACK',
                message: `Fully explored ${processes[u].name} (marked BLACK / closed branch).`,
                wfg,
                colors: new Map(colors),
                callStack: [...callStack],
                cycles: [...cycles]
              };
            }
          }
        }
      }

      yield {
        type: 'COMPLETE',
        deadlockedIds: Array.from(deadlockedIds),
        cycles,
        message: deadlockedIds.size > 0
          ? `DFS Finished: ${deadlockedIds.size} process(es) deadlocked in ${cycles.length} cycle(s).`
          : 'DFS Finished: Graph is acyclic. No single-instance deadlock detected.',
        wfg,
        colors: new Map(colors),
        callStack: []
      };
    }

    /**
     * Synchronous execution of Single-Instance Three-Color DFS
     */
    detectSingleInstance(snapshot) {
      const steps = [];
      const gen = this.stepSingleInstance(snapshot);
      let result = gen.next();

      while (!result.done) {
        steps.push(result.value);
        result = gen.next();
      }

      const lastStep = steps[steps.length - 1] || {};
      return {
        algorithm: 'single-instance-wfg',
        isDeadlocked: (lastStep.deadlockedIds || []).length > 0,
        deadlockedIds: lastStep.deadlockedIds || [],
        cycles: lastStep.cycles || [],
        wfg: lastStep.wfg || this.buildWaitForGraph(snapshot),
        steps
      };
    }

    /**
     * Generator for Multi-Instance Vector-Matrix Deadlock Detection Algorithm
     * Yields iteration steps for detailed walkthrough
     */
    *stepMultiInstance(snapshot) {
      const { processes, available, allocation, request, resourceNames } = snapshot;
      const n = processes.length;
      const m = resourceNames.length;

      // 1. Initialize Work vector
      const Work = [...available];

      // 2. Initialize Finish vector: Finish[i] = true if Allocation_i == 0
      const Finish = new Array(n).fill(false);
      const activeIndices = [];

      for (let i = 0; i < n; i++) {
        if (processes[i].status === 'TERMINATED') {
          Finish[i] = true;
          continue;
        }
        activeIndices.push(i);
        const isZeroAlloc = allocation[i].every(val => val === 0);
        if (isZeroAlloc) {
          Finish[i] = true;
        }
      }

      const safeSequence = [];
      let round = 1;

      yield {
        type: 'INIT',
        message: `Multi-Instance Algorithm initialized. Work = [${Work.join(', ')}]. Zero-allocation processes marked Finished.`,
        Work: [...Work],
        Finish: [...Finish],
        safeSequence: [...safeSequence],
        stepInfo: { round: 0, checkedIdx: null, passed: null }
      };

      // 3. Repeatedly find i such that Finish[i] == false and Request_i <= Work
      let foundInRound = true;

      while (foundInRound) {
        foundInRound = false;

        for (let i = 0; i < n; i++) {
          if (!Finish[i]) {
            // Check if Request_i <= Work for all resources
            const req = request[i];
            const canSatisfy = req.every((rVal, rIdx) => rVal <= Work[rIdx]);

            yield {
              type: 'CHECK_PROCESS',
              message: `Evaluating ${processes[i].name}: Request [${req.join(', ')}] \u2264 Work [${Work.join(', ')}] ? \u2192 ${canSatisfy ? 'YES \u2705' : 'NO \u274C'}`,
              processIdx: i,
              processId: processes[i].id,
              processName: processes[i].name,
              requestVec: [...req],
              Work: [...Work],
              Finish: [...Finish],
              canSatisfy,
              safeSequence: [...safeSequence]
            };

            if (canSatisfy) {
              // Simulate reclamation: Work = Work + Allocation_i
              const oldWork = [...Work];
              for (let r = 0; r < m; r++) {
                Work[r] += allocation[i][r];
              }
              Finish[i] = true;
              safeSequence.push(processes[i].id);
              foundInRound = true;

              yield {
                type: 'RECLAIM_RESOURCES',
                message: `Reclaimed resources from ${processes[i].name}! Reclaimed: [${allocation[i].join(', ')}]. New Work: [${Work.join(', ')}].`,
                processIdx: i,
                processId: processes[i].id,
                processName: processes[i].name,
                allocatedVec: [...allocation[i]],
                oldWork,
                Work: [...Work],
                Finish: [...Finish],
                safeSequence: [...safeSequence]
              };

              // Restart search from beginning to simulate greedy progression
              break;
            }
          }
        }
        round++;
      }

      // 4. Any process with Finish[i] == false is deadlocked
      const deadlockedIds = [];
      for (let i = 0; i < n; i++) {
        if (!Finish[i] && processes[i].status !== 'TERMINATED') {
          deadlockedIds.push(processes[i].id);
        }
      }

      yield {
        type: 'COMPLETE',
        message: deadlockedIds.length > 0
          ? `Algorithm completed: ${deadlockedIds.length} process(es) could not finish \u2192 Deadlock detected!`
          : 'Algorithm completed: All processes finished successfully \u2192 System is SAFE.',
        Work: [...Work],
        Finish: [...Finish],
        safeSequence: [...safeSequence],
        deadlockedIds: [...deadlockedIds],
        isDeadlocked: deadlockedIds.length > 0
      };
    }

    /**
     * Synchronous execution of Multi-Instance Vector-Matrix algorithm
     */
    detectMultiInstance(snapshot) {
      const steps = [];
      const gen = this.stepMultiInstance(snapshot);
      let result = gen.next();

      while (!result.done) {
        steps.push(result.value);
        result = gen.next();
      }

      const lastStep = steps[steps.length - 1] || {};
      return {
        algorithm: 'multi-instance-matrix',
        isDeadlocked: (lastStep.deadlockedIds || []).length > 0,
        deadlockedIds: lastStep.deadlockedIds || [],
        finalWork: lastStep.Work || [...snapshot.available],
        finish: lastStep.Finish || [],
        safeSequence: lastStep.safeSequence || [],
        steps
      };
    }

    /**
     * Uniform detection runner that respects current mode ('single' or 'multi')
     */
    detect(snapshot) {
      if (snapshot.mode === 'single') {
        return this.detectSingleInstance(snapshot);
      } else {
        return this.detectMultiInstance(snapshot);
      }
    }
  }

  // Export to browser window
  root.DeadlockDetector = new DetectionEngine();
})(typeof window !== 'undefined' ? window : this);
