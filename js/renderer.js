/**
 * renderer.js - Interactive HTML5 Canvas Graph & DOM Matrix Renderer
 * Renders Wait-For Graph (WFG) with animated pulsing cycles, draggable nodes,
 * editable Matrix State Grids, and live Vector-Matrix algorithm inspector.
 */

(function (root) {
  'use strict';

  class VisualRenderer {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;

      // Interaction state
      this.draggedNode = null;
      this.hoveredNode = null;
      this.dragOffset = { x: 0, y: 0 };
      this.mousePos = { x: 0, y: 0 };

      // Animation & rendering
      this.animTime = 0;
      this.animId = null;

      // Color scheme tokens
      this.theme = {
        bg: '#0f172a',
        gridLine: 'rgba(255, 255, 255, 0.04)',
        nodeReady: '#10b981',      // Emerald
        nodeWaiting: '#f59e0b',    // Amber
        nodeDeadlocked: '#f43f5e', // Crimson
        nodeTerminated: '#64748b', // Slate
        edgeNormal: 'rgba(56, 189, 248, 0.45)', // Sky blue
        edgeCycle: '#f43f5e',      // Crimson
        edgeCycleGlow: 'rgba(244, 63, 94, 0.6)',
        text: '#f8fafc',
        textMuted: '#94a3b8'
      };

      // Playback / inspection highlight state
      this.inspectionState = null;
    }

    /**
     * Initializes canvas and event listeners
     */
    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      this.setupCanvasDpi();
      this.bindCanvasEvents();
      this.startAnimationLoop();

      window.addEventListener('resize', () => {
        this.setupCanvasDpi();
        this.renderGraph();
      });
    }

    /**
     * Retina / High-DPI Canvas scaling
     */
    setupCanvasDpi() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;

      // Logical dimensions
      const width = rect.width || 600;
      const height = rect.height || 420;

      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);

      this.ctx.resetTransform?.();
      this.ctx.scale(this.dpr, this.dpr);
      this.logicalWidth = width;
      this.logicalHeight = height;
    }

    /**
     * Bind dragging & hover events on canvas
     */
    bindCanvasEvents() {
      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      };

      this.canvas.addEventListener('mousedown', (e) => {
        const pos = getPos(e);
        const node = this.findNodeAt(pos.x, pos.y);
        if (node) {
          this.draggedNode = node;
          this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };
        }
      });

      this.canvas.addEventListener('mousemove', (e) => {
        const pos = getPos(e);
        this.mousePos = pos;

        if (this.draggedNode) {
          this.draggedNode.x = Math.max(35, Math.min(this.logicalWidth - 35, pos.x - this.dragOffset.x));
          this.draggedNode.y = Math.max(35, Math.min(this.logicalHeight - 35, pos.y - this.dragOffset.y));
          root.DeadlockState?.updateProcessPosition(this.draggedNode.id, this.draggedNode.x, this.draggedNode.y);
        } else {
          const hovered = this.findNodeAt(pos.x, pos.y);
          if (hovered !== this.hoveredNode) {
            this.hoveredNode = hovered;
            this.canvas.style.cursor = hovered ? 'grab' : 'default';
          }
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.draggedNode) {
          this.draggedNode = null;
          this.canvas.style.cursor = this.hoveredNode ? 'grab' : 'default';
        }
      });

      // Touch events for mobile/tablet
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
          const node = this.findNodeAt(pos.x, pos.y);
          if (node) {
            this.draggedNode = node;
            this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };
            e.preventDefault();
          }
        }
      }, { passive: false });

      this.canvas.addEventListener('touchmove', (e) => {
        if (this.draggedNode && e.touches.length === 1) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
          this.draggedNode.x = Math.max(35, Math.min(this.logicalWidth - 35, pos.x - this.dragOffset.x));
          this.draggedNode.y = Math.max(35, Math.min(this.logicalHeight - 35, pos.y - this.dragOffset.y));
          root.DeadlockState?.updateProcessPosition(this.draggedNode.id, this.draggedNode.x, this.draggedNode.y);
          e.preventDefault();
        }
      }, { passive: false });

      this.canvas.addEventListener('touchend', () => {
        this.draggedNode = null;
      });
    }

    /**
     * Locates a process node under coordinate (x, y)
     */
    findNodeAt(x, y) {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return null;
      const radius = 28;

      for (let i = state.processes.length - 1; i >= 0; i--) {
        const p = state.processes[i];
        if (p.status === 'TERMINATED') continue;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy <= radius * radius) {
          return p;
        }
      }
      return null;
    }

    /**
     * Continuous 60fps animation loop
     */
    startAnimationLoop() {
      const loop = (timestamp) => {
        this.animTime = timestamp * 0.003;
        this.renderGraph();
        this.animId = requestAnimationFrame(loop);
      };
      this.animId = requestAnimationFrame(loop);
    }

    /**
     * Renders the entire graph on canvas
     */
    renderGraph() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.logicalWidth;
      const h = this.logicalHeight;
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      // Clear canvas
      ctx.clearRect(0, 0, w, h);

      // 1. Draw subtle background grid
      this.drawBackgroundGrid(ctx, w, h);

      // 2. Build WFG dependencies
      const wfg = root.DeadlockDetector?.buildWaitForGraph(state) || { edges: [] };
      const edges = wfg.edges || [];

      // Determine cycle edges for glow styling
      const cycleEdgeSet = new Set();
      if (state.detectedCycles && state.detectedCycles.length > 0) {
        state.detectedCycles.forEach(cycle => {
          for (let k = 0; k < cycle.length - 1; k++) {
            cycleEdgeSet.add(`${cycle[k]}->${cycle[k + 1]}`);
          }
        });
      }

      // 3. Draw Dependency Edges
      edges.forEach(edge => {
        const fromNode = state.processes.find(p => p.id === edge.fromId);
        const toNode = state.processes.find(p => p.id === edge.toId);
        if (!fromNode || !toNode || fromNode.status === 'TERMINATED' || toNode.status === 'TERMINATED') return;

        const isCycleEdge = cycleEdgeSet.has(`${edge.fromId}->${edge.toId}`);
        this.drawDirectedEdge(ctx, fromNode, toNode, edge.resourceName, isCycleEdge);
      });

      // 4. Draw Process Nodes
      state.processes.forEach(proc => {
        if (proc.status === 'TERMINATED') {
          this.drawTerminatedNode(ctx, proc);
        } else {
          const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
          const isHovered = this.hoveredNode && this.hoveredNode.id === proc.id;
          this.drawProcessNode(ctx, proc, isDeadlocked, isHovered);
        }
      });

      // 5. Draw Tooltip if hovering a node
      if (this.hoveredNode && !this.draggedNode) {
        this.drawTooltip(ctx, this.hoveredNode, state);
      }
    }

    /**
     * Draw subtle modern grid background
     */
    drawBackgroundGrid(ctx, w, h) {
      const step = 32;
      ctx.save();
      ctx.strokeStyle = this.theme.gridLine;
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = 0; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    /**
     * Draw directed edge arrow from P_i to P_j with curved arc and label
     */
    drawDirectedEdge(ctx, fromNode, toNode, label, isCycleEdge) {
      const radius = 26;
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) return;

      // Unit vector
      const ux = dx / dist;
      const uy = dy / dist;

      // Slight curvature offset to separate bidirectional edges
      const curvature = 18;
      const mx = (fromNode.x + toNode.x) / 2 - uy * curvature;
      const my = (fromNode.y + toNode.y) / 2 + ux * curvature;

      // Start and end points clamped to node boundaries
      const startX = fromNode.x + ux * radius;
      const startY = fromNode.y + uy * radius;
      const endX = toNode.x - ux * (radius + 4);
      const endY = toNode.y - uy * (radius + 4);

      ctx.save();

      if (isCycleEdge) {
        // Vibrant crimson cycle with pulsing glow and animated dash flow
        const pulse = (Math.sin(this.animTime * 3) + 1) * 0.5; // 0 to 1
        ctx.strokeStyle = this.theme.edgeCycle;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = this.theme.edgeCycleGlow;
        ctx.shadowBlur = 10 + pulse * 12;

        // Animated dashed flow
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -this.animTime * 18;
      } else {
        // Sleek cyan normal dependency edge
        ctx.strokeStyle = this.theme.edgeNormal;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
      }

      // Draw quadratic bezier curve
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(mx, my, endX, endY);
      ctx.stroke();

      // Draw Arrow Head
      const arrowLen = isCycleEdge ? 11 : 9;
      const angle = Math.atan2(endY - my, endX - mx);

      ctx.setLineDash([]);
      ctx.fillStyle = isCycleEdge ? this.theme.edgeCycle : 'rgba(56, 189, 248, 0.9)';
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLen * Math.cos(angle - Math.PI / 6),
        endY - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endX - arrowLen * Math.cos(angle + Math.PI / 6),
        endY - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      // Edge label (Resource requested)
      if (label) {
        const textX = mx;
        const textY = my - 6;

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Badge pill background
        const metrics = ctx.measureText(label);
        const padX = 5, padY = 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(
          textX - metrics.width / 2 - padX,
          textY - 6 - padY,
          metrics.width + padX * 2,
          12 + padY * 2
        );
        ctx.strokeStyle = isCycleEdge ? 'rgba(244, 63, 94, 0.5)' : 'rgba(56, 189, 248, 0.3)';
        ctx.strokeRect(
          textX - metrics.width / 2 - padX,
          textY - 6 - padY,
          metrics.width + padX * 2,
          12 + padY * 2
        );

        ctx.fillStyle = isCycleEdge ? '#fca5a5' : '#bae6fd';
        ctx.fillText(label, textX, textY);
      }

      ctx.restore();
    }

    /**
     * Draws an active process node with status rings, glowing deadlocks, and priority tags
     */
    drawProcessNode(ctx, proc, isDeadlocked, isHovered) {
      const radius = 25;
      const x = proc.x;
      const y = proc.y;

      ctx.save();

      // 1. Halo / Glow
      if (isDeadlocked) {
        const pulse = (Math.sin(this.animTime * 4) + 1) * 0.5;
        const glowRadius = radius + 8 + pulse * 8;

        const grad = ctx.createRadialGradient(x, y, radius, x, y, glowRadius);
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.5)');
        grad.addColorStop(1, 'rgba(244, 63, 94, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.arc(x, y, radius + 8, 0, 2 * Math.PI);
        ctx.fill();
      }

      // 2. Node Body (radial gradient)
      const grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
      if (isDeadlocked) {
        grad.addColorStop(0, '#f43f5e');
        grad.addColorStop(1, '#9f1239');
      } else if (proc.status === 'WAITING') {
        grad.addColorStop(0, '#fbbf24');
        grad.addColorStop(1, '#b45309');
      } else {
        grad.addColorStop(0, '#34d399');
        grad.addColorStop(1, '#065f46');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();

      // 3. Node Border Ring
      ctx.strokeStyle = isDeadlocked ? '#ffe4e6' : isHovered ? '#38bdf8' : 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = isHovered || isDeadlocked ? 2.5 : 1.5;
      ctx.stroke();

      // 4. Process Name Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proc.name, x, y - 2);

      // 5. Priority Mini-pill (below name)
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(`P:${proc.priority}`, x, y + 11);

      // 6. Rollback Badge (if rollbackCount > 0)
      if (proc.rollbackCount > 0) {
        const badgeX = x + radius - 4;
        const badgeY = y - radius + 4;
        const badgeR = 8;

        ctx.fillStyle = '#8b5cf6'; // Purple badge
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${proc.rollbackCount}`, badgeX, badgeY);
      }

      ctx.restore();
    }

    /**
     * Draws terminated process node with subdued dashed outline
     */
    drawTerminatedNode(ctx, proc) {
      const radius = 22;
      const x = proc.x;
      const y = proc.y;

      ctx.save();
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.theme.nodeTerminated;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = this.theme.textMuted;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proc.name, x, y - 3);

      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('TERMINATED', x, y + 9);
      ctx.restore();
    }

    /**
     * Hover tooltip with detailed process diagnostics
     */
    drawTooltip(ctx, proc, state) {
      const idx = state.processes.findIndex(p => p.id === proc.id);
      if (idx === -1) return;

      const alloc = state.allocation[idx] || [];
      const req = state.request[idx] || [];
      const totalAlloc = alloc.reduce((a, b) => a + b, 0);
      const totalReq = req.reduce((a, b) => a + b, 0);

      // Victim cost calculation
      const evalCost = root.DeadlockRecovery?.evaluateProcessCost(proc, state);
      const costStr = evalCost ? `${evalCost.cost}` : 'N/A';

      const lines = [
        `${proc.name} [${proc.status}]`,
        `Priority: ${proc.priority} | Rollbacks: ${proc.rollbackCount || 0}`,
        `Allocated: [${alloc.join(', ')}] (Total: ${totalAlloc})`,
        `Requested: [${req.join(', ')}] (Total: ${totalReq})`,
        `Victim Cost: ${costStr}`
      ];

      const pad = 8;
      ctx.font = '11px Inter, sans-serif';
      let maxW = 0;
      lines.forEach(l => {
        const w = ctx.measureText(l).width;
        if (w > maxW) maxW = w;
      });

      const boxW = maxW + pad * 2;
      const boxH = lines.length * 16 + pad * 2;
      let tx = proc.x + 32;
      let ty = proc.y - 10;

      if (tx + boxW > this.logicalWidth) tx = proc.x - boxW - 32;
      if (ty + boxH > this.logicalHeight) ty = this.logicalHeight - boxH - 10;
      if (ty < 10) ty = 10;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = proc.status === 'DEADLOCKED' ? '#f43f5e' : '#38bdf8';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tx, ty, boxW, boxH, 6) : ctx.rect(tx, ty, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0
          ? (proc.status === 'DEADLOCKED' ? '#fda4af' : '#7dd3fc')
          : (i === lines.length - 1 ? '#fde047' : '#e2e8f0');
        ctx.font = i === 0 ? 'bold 11px Inter, sans-serif' : '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(line, tx + pad, ty + pad + 12 + i * 16);
      });
      ctx.restore();
    }

    /**
     * Renders Matrix State Grids (Allocation, Request, Available)
     */
    renderMatrices() {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const { resourceNames, available, allocation, request, processes } = state;
      const matrixContainer = document.getElementById('matrix-grids-container');
      if (!matrixContainer) return;

      // 1. Available Vector HTML
      let availHtml = `
        <div class="matrix-card">
          <div class="matrix-card-header">
            <h4><span class="icon">📦</span> Available Vector (m = ${resourceNames.length})</h4>
            <span class="badge badge-info">System Capacity</span>
          </div>
          <div class="table-responsive">
            <table class="matrix-table available-table">
              <thead>
                <tr>
                  ${resourceNames.map(r => `<th>${r}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${available.map((val, rIdx) => `
                    <td>
                      <input type="number" min="0" max="99" class="cell-input" 
                        data-type="available" data-r="${rIdx}" value="${val}"
                        id="cell-avail-${rIdx}" aria-label="Available ${resourceNames[rIdx]}">
                    </td>
                  `).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      // 2. Allocation Matrix HTML
      let allocHtml = `
        <div class="matrix-card">
          <div class="matrix-card-header">
            <h4><span class="icon">🔒</span> Allocation Matrix (${processes.length} \u00D7 ${resourceNames.length})</h4>
            <span class="badge badge-emerald">Held Resources</span>
          </div>
          <div class="table-responsive">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>Status</th>
                  ${resourceNames.map(r => `<th>${r}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${processes.map((proc, pIdx) => {
                  const isTerminated = proc.status === 'TERMINATED';
                  const row = allocation[pIdx] || [];
                  const rowSum = row.reduce((a, b) => a + b, 0);
                  const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
                  const rowClass = isDeadlocked ? 'row-deadlocked' : (isTerminated ? 'row-terminated' : '');

                  return `
                    <tr class="${rowClass}">
                      <td class="proc-cell"><strong>${proc.name}</strong></td>
                      <td><span class="status-pill status-${proc.status.toLowerCase()}">${proc.status}</span></td>
                      ${row.map((val, rIdx) => `
                        <td>
                          <input type="number" min="0" max="99" class="cell-input" 
                            data-type="allocation" data-p="${pIdx}" data-r="${rIdx}" value="${val}"
                            ${isTerminated ? 'disabled' : ''}
                            id="cell-alloc-${pIdx}-${rIdx}" aria-label="${proc.name} Alloc ${resourceNames[rIdx]}">
                        </td>
                      `).join('')}
                      <td class="sum-cell">${rowSum}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // 3. Request Matrix HTML
      let reqHtml = `
        <div class="matrix-card">
          <div class="matrix-card-header">
            <h4><span class="icon">⏳</span> Request Matrix (${processes.length} \u00D7 ${resourceNames.length})</h4>
            <span class="badge badge-amber">Blocked Claims</span>
          </div>
          <div class="table-responsive">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>Priority</th>
                  ${resourceNames.map(r => `<th>${r}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${processes.map((proc, pIdx) => {
                  const isTerminated = proc.status === 'TERMINATED';
                  const row = request[pIdx] || [];
                  const rowSum = row.reduce((a, b) => a + b, 0);
                  const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
                  const rowClass = isDeadlocked ? 'row-deadlocked' : (isTerminated ? 'row-terminated' : '');

                  return `
                    <tr class="${rowClass}">
                      <td class="proc-cell"><strong>${proc.name}</strong></td>
                      <td>
                        <input type="number" min="1" max="10" class="priority-input" 
                          data-pid="${proc.id}" value="${proc.priority}" 
                          ${isTerminated ? 'disabled' : ''}
                          id="proc-priority-${proc.id}" aria-label="${proc.name} Priority">
                      </td>
                      ${row.map((val, rIdx) => {
                        const exceedsAvail = val > available[rIdx];
                        return `
                          <td>
                            <input type="number" min="0" max="99" 
                              class="cell-input ${exceedsAvail && val > 0 ? 'cell-blocking' : ''}" 
                              data-type="request" data-p="${pIdx}" data-r="${rIdx}" value="${val}"
                              ${isTerminated ? 'disabled' : ''}
                              id="cell-req-${pIdx}-${rIdx}" aria-label="${proc.name} Req ${resourceNames[rIdx]}">
                          </td>
                        `;
                      }).join('')}
                      <td class="sum-cell">${rowSum}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      matrixContainer.innerHTML = availHtml + allocHtml + reqHtml;

      // Attach instant cell input listeners
      this.attachMatrixInputListeners(matrixContainer);
    }

    /**
     * Attaches live input change listeners to matrix tables
     */
    attachMatrixInputListeners(container) {
      container.querySelectorAll('.cell-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const type = e.target.dataset.type;
          const val = parseInt(e.target.value, 10) || 0;
          e.target.value = Math.max(0, val);

          if (type === 'available') {
            const r = parseInt(e.target.dataset.r, 10);
            root.DeadlockState?.setAvailable(r, val);
          } else if (type === 'allocation') {
            const p = parseInt(e.target.dataset.p, 10);
            const r = parseInt(e.target.dataset.r, 10);
            root.DeadlockState?.setAllocation(p, r, val);
          } else if (type === 'request') {
            const p = parseInt(e.target.dataset.p, 10);
            const r = parseInt(e.target.dataset.r, 10);
            root.DeadlockState?.setRequest(p, r, val);
          }
        });
      });

      container.querySelectorAll('.priority-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const pid = parseInt(e.target.dataset.pid, 10);
          const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 5));
          e.target.value = val;
          root.DeadlockState?.setProcessPriority(pid, val);
        });
      });
    }

    /**
     * Updates Live Vector Inspection View (Work & Finish arrays)
     */
    renderInspectionView(stepData) {
      const container = document.getElementById('inspection-panel-body');
      if (!container) return;

      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const Work = stepData?.Work || [...state.available];
      const Finish = stepData?.Finish || [];

      let html = `
        <div class="vector-display">
          <div class="vector-item">
            <span class="vector-label">Work Vector:</span>
            <div class="vector-chips">
              ${state.resourceNames.map((r, i) => `
                <span class="chip chip-cyan">${r}: <strong>${Work[i] ?? 0}</strong></span>
              `).join('')}
            </div>
          </div>
          <div class="vector-item">
            <span class="vector-label">Finish Flags:</span>
            <div class="vector-chips">
              ${state.processes.map((p, i) => {
                const isFin = Finish[i] === true;
                return `
                  <span class="chip ${isFin ? 'chip-green' : 'chip-red'}">
                    ${p.name}: ${isFin ? '\u2705 True' : '\u274C False'}
                  </span>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      if (stepData?.message) {
        html += `<div class="step-explanation-box">${stepData.message}</div>`;
      }

      container.innerHTML = html;
    }

    /**
     * Updates the Status Badge and Dashboard Metrics
     */
    updateStatusSummary() {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const badge = document.getElementById('system-status-badge');
      const deadlockedCountElem = document.getElementById('metric-deadlocked-count');
      const activeCountElem = document.getElementById('metric-active-count');
      const cyclesCountElem = document.getElementById('metric-cycles-count');

      const isDeadlocked = state.deadlockedProcessIds.length > 0;

      if (badge) {
        if (isDeadlocked) {
          badge.className = 'status-badge badge-danger pulsating';
          badge.innerHTML = `<span class="dot"></span> DEADLOCKED (${state.deadlockedProcessIds.length} Procs)`;
        } else {
          badge.className = 'status-badge badge-success';
          badge.innerHTML = `<span class="dot"></span> SAFE STATE`;
        }
      }

      if (deadlockedCountElem) deadlockedCountElem.textContent = state.deadlockedProcessIds.length;
      if (activeCountElem) activeCountElem.textContent = state.processes.filter(p => p.status !== 'TERMINATED').length;
      if (cyclesCountElem) cyclesCountElem.textContent = state.detectedCycles.length;
    }
  }

  // Export to browser window
  root.DeadlockRenderer = new VisualRenderer();
})(typeof window !== 'undefined' ? window : this);
