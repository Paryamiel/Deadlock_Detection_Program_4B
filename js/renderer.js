/**
 * renderer.js - Simplified, Beginner-Friendly Visual Graph & Matrix Renderer
 * 
 * Provides:
 * 1. Clean, readable Canvas Wait-For Graph with big nodes, animated arrows, and cycle highlighting.
 * 2. Plain-English status banners clearly distinguishing:
 *    - SAFE STATE
 *    - PRIOR TO DEADLOCK (Risk Warning)
 *    - DURING DEADLOCK (Active Circular Wait)
 * 3. Intuitive table grids for processes, holding, requesting, and available resources.
 */

(function (root) {
  'use strict';

  class VisualRenderer {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;

      this.draggedNode = null;
      this.hoveredNode = null;
      this.dragOffset = { x: 0, y: 0 };

      this.animTime = 0;
      this.animId = null;

      this.theme = {
        bg: '#0f172a',
        gridLine: 'rgba(255, 255, 255, 0.04)',
        nodeReady: '#10b981',      // Emerald
        nodeWaiting: '#f59e0b',    // Amber
        nodeDeadlocked: '#f43f5e', // Crimson
        nodeTerminated: '#64748b', // Slate
        edgeNormal: 'rgba(56, 189, 248, 0.6)',
        edgeCycle: '#f43f5e',
        edgeCycleGlow: 'rgba(244, 63, 94, 0.7)'
      };
    }

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

    setupCanvasDpi() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;

      const width = rect.width || 600;
      const height = rect.height || 360;

      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);

      this.ctx.resetTransform?.();
      this.ctx.scale(this.dpr, this.dpr);
      this.logicalWidth = width;
      this.logicalHeight = height;
    }

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
        if (this.draggedNode) {
          this.draggedNode.x = Math.max(40, Math.min(this.logicalWidth - 40, pos.x - this.dragOffset.x));
          this.draggedNode.y = Math.max(40, Math.min(this.logicalHeight - 40, pos.y - this.dragOffset.y));
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

      // Touch events for tablets & touch devices
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
          this.draggedNode.x = Math.max(40, Math.min(this.logicalWidth - 40, pos.x - this.dragOffset.x));
          this.draggedNode.y = Math.max(40, Math.min(this.logicalHeight - 40, pos.y - this.dragOffset.y));
          root.DeadlockState?.updateProcessPosition(this.draggedNode.id, this.draggedNode.x, this.draggedNode.y);
          e.preventDefault();
        }
      }, { passive: false });

      this.canvas.addEventListener('touchend', () => {
        this.draggedNode = null;
      });
    }

    findNodeAt(x, y) {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return null;
      const radius = 32;

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

    startAnimationLoop() {
      const loop = (timestamp) => {
        this.animTime = timestamp * 0.003;
        this.renderGraph();
        this.animId = requestAnimationFrame(loop);
      };
      this.animId = requestAnimationFrame(loop);
    }

    renderGraph() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.logicalWidth;
      const h = this.logicalHeight;
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      ctx.clearRect(0, 0, w, h);
      this.drawBackgroundGrid(ctx, w, h);

      const wfg = root.DeadlockDetector?.buildWaitForGraph(state) || { edges: [] };
      const edges = wfg.edges || [];

      // Detect active cycle edges
      const cycleEdgeSet = new Set();
      if (state.detectedCycles && state.detectedCycles.length > 0) {
        state.detectedCycles.forEach(cycle => {
          for (let k = 0; k < cycle.length - 1; k++) {
            cycleEdgeSet.add(`${cycle[k]}->${cycle[k + 1]}`);
          }
        });
      }

      // Draw dependency arrows
      edges.forEach(edge => {
        const fromNode = state.processes.find(p => p.id === edge.fromId);
        const toNode = state.processes.find(p => p.id === edge.toId);
        if (!fromNode || !toNode || fromNode.status === 'TERMINATED' || toNode.status === 'TERMINATED') return;

        const isCycleEdge = cycleEdgeSet.has(`${edge.fromId}->${edge.toId}`);
        this.drawDirectedEdge(ctx, fromNode, toNode, edge.resourceName, isCycleEdge);
      });

      // Draw processes as large, clear circular nodes
      state.processes.forEach(proc => {
        const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
        const isHovered = this.hoveredNode && this.hoveredNode.id === proc.id;
        this.drawProcessNode(ctx, proc, isDeadlocked, isHovered);
      });

      // Hover tooltip
      if (this.hoveredNode && !this.draggedNode) {
        this.drawTooltip(ctx, this.hoveredNode, state);
      }
    }

    drawBackgroundGrid(ctx, w, h) {
      const step = 32;
      ctx.save();
      ctx.strokeStyle = this.theme.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += step) {
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += step) {
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawDirectedEdge(ctx, fromNode, toNode, label, isCycleEdge) {
      const radius = 30;
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) return;

      const ux = dx / dist;
      const uy = dy / dist;
      const curvature = 20;

      const mx = (fromNode.x + toNode.x) / 2 - uy * curvature;
      const my = (fromNode.y + toNode.y) / 2 + ux * curvature;

      const startX = fromNode.x + ux * radius;
      const startY = fromNode.y + uy * radius;
      const endX = toNode.x - ux * (radius + 5);
      const endY = toNode.y - uy * (radius + 5);

      ctx.save();

      if (isCycleEdge) {
        const pulse = (Math.sin(this.animTime * 3) + 1) * 0.5;
        ctx.strokeStyle = this.theme.edgeCycle;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = this.theme.edgeCycleGlow;
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -this.animTime * 18;
      } else {
        ctx.strokeStyle = this.theme.edgeNormal;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(mx, my, endX, endY);
      ctx.stroke();

      // Arrow head
      const arrowLen = isCycleEdge ? 12 : 10;
      const angle = Math.atan2(endY - my, endX - mx);

      ctx.setLineDash([]);
      ctx.fillStyle = isCycleEdge ? this.theme.edgeCycle : '#38bdf8';
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

      // Label
      if (label) {
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(`waits: ${label}`);
        const padX = 6, padY = 3;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(mx - metrics.width / 2 - padX, my - 7 - padY, metrics.width + padX * 2, 14 + padY * 2);
        ctx.strokeStyle = isCycleEdge ? '#f43f5e' : '#38bdf8';
        ctx.strokeRect(mx - metrics.width / 2 - padX, my - 7 - padY, metrics.width + padX * 2, 14 + padY * 2);

        ctx.fillStyle = isCycleEdge ? '#fecdd3' : '#bae6fd';
        ctx.fillText(`waits: ${label}`, mx, my);
      }

      ctx.restore();
    }

    drawProcessNode(ctx, proc, isDeadlocked, isHovered) {
      const radius = 28;
      const x = proc.x;
      const y = proc.y;

      ctx.save();

      // Glow on cycle nodes
      if (isDeadlocked) {
        const pulse = (Math.sin(this.animTime * 4) + 1) * 0.5;
        const glowRadius = radius + 10 + pulse * 8;
        const grad = ctx.createRadialGradient(x, y, radius, x, y, glowRadius);
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.6)');
        grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Main circular body
      const grad = ctx.createRadialGradient(x - 6, y - 6, 3, x, y, radius);
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

      // Outer ring
      ctx.strokeStyle = isDeadlocked ? '#ffe4e6' : isHovered ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = isDeadlocked || isHovered ? 3 : 2;
      ctx.stroke();

      // Text inside node
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proc.name, x, y - 4);

      // Status sub-label
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(isDeadlocked ? 'DEADLOCKED' : proc.status, x, y + 12);

      ctx.restore();
    }

    drawTooltip(ctx, proc, state) {
      const idx = state.processes.findIndex(p => p.id === proc.id);
      if (idx === -1) return;

      const alloc = state.allocation[idx] || [];
      const req = state.request[idx] || [];
      const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);

      const lines = [
        `${proc.name} (${isDeadlocked ? 'DEADLOCKED' : proc.status})`,
        `Holding: [${alloc.join(', ')}]`,
        `Needs: [${req.join(', ')}]`,
        `Drag node to reposition`
      ];

      ctx.font = '11px Inter, sans-serif';
      let maxW = 0;
      lines.forEach(l => {
        const w = ctx.measureText(l).width;
        if (w > maxW) maxW = w;
      });

      const pad = 8;
      const boxW = maxW + pad * 2;
      const boxH = lines.length * 16 + pad * 2;
      let tx = proc.x + 35;
      let ty = proc.y - 10;

      if (tx + boxW > this.logicalWidth) tx = proc.x - boxW - 35;
      if (ty + boxH > this.logicalHeight) ty = this.logicalHeight - boxH - 10;
      if (ty < 10) ty = 10;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      ctx.strokeStyle = isDeadlocked ? '#f43f5e' : '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(tx, ty, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? (isDeadlocked ? '#fda4af' : '#7dd3fc') : '#e2e8f0';
        ctx.font = i === 0 ? 'bold 12px Inter, sans-serif' : '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(line, tx + pad, ty + pad + 12 + i * 16);
      });
      ctx.restore();
    }

    /**
     * Updates the status banner and plain-English explanation card
     */
    updateStatusSummary() {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const assessment = root.DeadlockDetector?.assessSystemState(state);
      if (!assessment) return;

      // Update Top Status Badge
      const statusBadge = document.getElementById('system-status-badge');
      if (statusBadge) {
        statusBadge.className = `status-badge ${assessment.badgeClass} ${assessment.status === 'DEADLOCKED' ? 'pulsating' : ''}`;
        statusBadge.innerHTML = `<span class="dot"></span> ${assessment.badgeText}`;
      }

      // Update Plain-English Explanation Card
      const explanationTitle = document.getElementById('explanation-headline');
      const explanationBody = document.getElementById('explanation-details');
      const phaseIndicator = document.getElementById('detection-phase-indicator');

      if (explanationTitle) explanationTitle.textContent = assessment.headline;
      if (explanationBody) explanationBody.textContent = assessment.details;

      if (phaseIndicator) {
        if (assessment.phase === 'DURING') {
          phaseIndicator.className = 'phase-tag phase-during';
          phaseIndicator.textContent = 'DURING DEADLOCK EVENT';
        } else if (assessment.phase === 'PRIOR') {
          phaseIndicator.className = 'phase-tag phase-prior';
          phaseIndicator.textContent = 'PRIOR TO DEADLOCK (AT RISK)';
        } else {
          phaseIndicator.className = 'phase-tag phase-safe';
          phaseIndicator.textContent = 'NORMAL OPERATION (SAFE)';
        }
      }

      // Update header counters
      const metricDeadlocked = document.getElementById('metric-deadlocked-count');
      const metricActive = document.getElementById('metric-active-count');
      if (metricDeadlocked) metricDeadlocked.textContent = state.deadlockedProcessIds.length;
      if (metricActive) metricActive.textContent = state.processes.filter(p => p.status !== 'TERMINATED').length;
    }

    /**
     * Renders simplified, intuitive tables for processes & resources
     */
    renderMatrices() {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const { resourceNames, available, allocation, request, processes } = state;
      const container = document.getElementById('matrix-grids-container');
      if (!container) return;

      let html = `
        <div class="simple-table-container">
          <!-- Available System Resources Strip -->
          <div class="available-strip">
            <span class="strip-label">📦 Free Available Resources:</span>
            <div class="available-items">
              ${resourceNames.map((r, rIdx) => `
                <div class="avail-box">
                  <span class="res-tag">${r}</span>
                  <input type="number" min="0" max="99" class="avail-input" 
                    data-type="available" data-r="${rIdx}" value="${available[rIdx]}" 
                    id="cell-avail-${rIdx}" aria-label="Available ${r}">
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Process State Summary Table -->
          <div class="table-responsive">
            <table class="simple-grid-table">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>Status</th>
                  <th>Holding (Allocated)</th>
                  <th>Waiting For (Requested)</th>
                </tr>
              </thead>
              <tbody>
                ${processes.map((proc, pIdx) => {
                  const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
                  const isTerminated = proc.status === 'TERMINATED';
                  const rowClass = isDeadlocked ? 'row-deadlocked' : (isTerminated ? 'row-terminated' : '');

                  return `
                    <tr class="${rowClass}">
                      <td class="proc-name-cell">
                        <strong>${proc.name}</strong>
                      </td>
                      <td>
                        <span class="status-pill status-${isDeadlocked ? 'deadlocked' : proc.status.toLowerCase()}">
                          ${isDeadlocked ? 'DEADLOCKED' : proc.status}
                        </span>
                      </td>
                      <td class="vector-cell">
                        <div class="mini-input-group">
                          ${(allocation[pIdx] || []).map((val, rIdx) => `
                            <span class="cell-wrap">
                              <small>${resourceNames[rIdx]}:</small>
                              <input type="number" min="0" max="99" class="cell-input"
                                data-type="allocation" data-p="${pIdx}" data-r="${rIdx}" value="${val}"
                                id="cell-alloc-${pIdx}-${rIdx}">
                            </span>
                          `).join('')}
                        </div>
                      </td>
                      <td class="vector-cell">
                        <div class="mini-input-group">
                          ${(request[pIdx] || []).map((val, rIdx) => {
                            const isBlocking = val > available[rIdx] && val > 0;
                            return `
                              <span class="cell-wrap ${isBlocking ? 'blocking-wrap' : ''}">
                                <small>${resourceNames[rIdx]}:</small>
                                <input type="number" min="0" max="99" class="cell-input ${isBlocking ? 'cell-blocking' : ''}"
                                  data-type="request" data-p="${pIdx}" data-r="${rIdx}" value="${val}"
                                  id="cell-req-${pIdx}-${rIdx}">
                              </span>
                            `;
                          }).join('')}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.innerHTML = html;
      this.attachInputListeners(container);
      this.updatePredictorSelectors(state);
    }

    attachInputListeners(container) {
      container.querySelectorAll('.avail-input, .cell-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const type = e.target.dataset.type;
          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
          e.target.value = val;

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
    }

    /**
     * Updates the Predictive Request Simulator dropdowns with current processes and resources
     */
    updatePredictorSelectors(state) {
      const procSelect = document.getElementById('predict-process-select');
      const resSelect = document.getElementById('predict-resource-select');

      if (procSelect) {
        const curVal = procSelect.value;
        procSelect.innerHTML = state.processes
          .filter(p => p.status !== 'TERMINATED')
          .map(p => `<option value="${p.id}" ${curVal == p.id ? 'selected' : ''}>${p.name}</option>`)
          .join('');
      }

      if (resSelect) {
        const curVal = resSelect.value;
        resSelect.innerHTML = state.resourceNames
          .map((r, i) => `<option value="${i}" ${curVal == i ? 'selected' : ''}>${r}</option>`)
          .join('');
      }
    }
  }

  // Export to browser window
  root.DeadlockRenderer = new VisualRenderer();
})(typeof window !== 'undefined' ? window : this);
