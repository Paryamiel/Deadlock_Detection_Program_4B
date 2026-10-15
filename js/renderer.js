/**
 * renderer.js - Academic & Formal Visual Graph & Matrix Renderer
 * 
 * Provides:
 * 1. Dual-Graph Canvas Engine:
 *    - Resource Allocation Graph (RAG) [Default]: Displays both Processes (circles)
 *      and Resources (rectangles with instance capacity). Both can be moved and placed freely.
 *    - Wait-For Graph (WFG): Direct process-to-process dependency topology.
 * 2. Instant Auto-Centering on Start, Presets & Random option (never requires manual center click).
 * 3. Live Figure 1.1: Human-readable Graph Interpretation & Flow Analysis
 *    (e.g., "P1 holds 1 instance of R1 and requests 1 instance of R2").
 * 4. Interactive table & metric synchronization.
 */

(function (root) {
  'use strict';

  class VisualRenderer {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;

      this.logicalWidth = 600;
      this.logicalHeight = 360;

      this.graphMode = 'rag'; // 'rag' (Resource Allocation Graph) or 'wfg' (Wait-For Graph)

      this.draggedNode = null;
      this.hoveredNode = null;
      this.dragOffset = { x: 0, y: 0 };

      this.animTime = 0;
      this.animId = null;

      // Formal Academic Palette (High Contrast, Publication Quality)
      this.theme = {
        bg: '#ffffff',
        gridLine: '#f1f5f9',
        borderFrame: '#cbd5e1',
        nodeReady: '#15803d',        // Academic Forest Green
        nodeWaiting: '#b45309',      // Academic Warm Amber
        nodeDeadlocked: '#991b1b',   // Academic Crimson
        nodeTerminated: '#64748b',   // Slate
        resourceBorder: '#1e3a8a',   // Academic Oxford Blue
        resourceBg: '#f8fafc',
        resourceContested: '#991b1b',
        edgeHold: '#0f766e',         // Teal/Forest for Allocation (Resource -> Process)
        edgeRequest: '#b45309',      // Amber for Request (Process -> Resource)
        edgeCycle: '#991b1b',        // Crimson for Deadlock Cycle
        edgeWfg: '#334155'
      };
    }

    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      this.setupCanvasDpi();
      this.bindCanvasEvents();
      this.centerGraph(false);
      this.startAnimationLoop();

      // Listen for window resize and container resizing
      window.addEventListener('resize', () => {
        this.setupCanvasDpi();
        this.renderGraph();
      });

      if (window.ResizeObserver && this.canvas.parentElement) {
        const ro = new ResizeObserver(() => {
          this.setupCanvasDpi();
          this.renderGraph();
        });
        ro.observe(this.canvas.parentElement);
      }

      // Initial interpretation & status update
      this.updateStatusSummary();
      this.updateGraphInterpretation();
    }

    setGraphMode(mode) {
      if (mode === 'rag' || mode === 'wfg') {
        this.graphMode = mode;
        this.renderGraph();
        this.updateGraphInterpretation();
      }
    }

    setupCanvasDpi() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;

      // Ensure valid width even if layout is computing
      const parentW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 600;
      const width = rect.width > 50 ? rect.width : (parentW > 50 ? parentW : 640);
      const height = rect.height > 50 ? rect.height : 360;

      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);

      this.ctx.resetTransform?.();
      this.ctx.scale(this.dpr, this.dpr);
      this.logicalWidth = width;
      this.logicalHeight = height;
    }

    /**
     * Center nodes automatically in the viewport
     */
    centerGraph(reRender = true) {
      this.setupCanvasDpi();
      root.DeadlockState?.autoCenterLayout(this.logicalWidth, this.logicalHeight);
      if (reRender) {
        this.renderGraph();
        this.updateGraphInterpretation();
      }
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
          const nx = Math.max(45, Math.min(this.logicalWidth - 45, pos.x - this.dragOffset.x));
          const ny = Math.max(35, Math.min(this.logicalHeight - 35, pos.y - this.dragOffset.y));
          this.draggedNode.x = nx;
          this.draggedNode.y = ny;

          if (this.draggedNode.nodeType === 'resource') {
            root.DeadlockState?.updateResourcePosition(this.draggedNode.id, nx, ny);
          } else {
            root.DeadlockState?.updateProcessPosition(this.draggedNode.id, nx, ny);
          }
          this.updateGraphInterpretation();
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

      // Touch events for mobile/tablet devices
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
          const nx = Math.max(45, Math.min(this.logicalWidth - 45, pos.x - this.dragOffset.x));
          const ny = Math.max(35, Math.min(this.logicalHeight - 35, pos.y - this.dragOffset.y));
          this.draggedNode.x = nx;
          this.draggedNode.y = ny;

          if (this.draggedNode.nodeType === 'resource') {
            root.DeadlockState?.updateResourcePosition(this.draggedNode.id, nx, ny);
          } else {
            root.DeadlockState?.updateProcessPosition(this.draggedNode.id, nx, ny);
          }
          this.updateGraphInterpretation();
          e.preventDefault();
        }
      }, { passive: false });

      this.canvas.addEventListener('touchend', () => {
        this.draggedNode = null;
      });
    }

    /**
     * Hit tests both Processes and Resources
     */
    findNodeAt(x, y) {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return null;

      // 1. Check Processes (circles, radius 30)
      const procRadius = 32;
      for (let i = state.processes.length - 1; i >= 0; i--) {
        const p = state.processes[i];
        if (p.status === 'TERMINATED') continue;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy <= procRadius * procRadius) {
          return { ...p, nodeType: 'process' };
        }
      }

      // 2. Check Resources (rectangles 68 x 44) in RAG mode
      if (this.graphMode === 'rag' && state.resources) {
        const halfW = 38, halfH = 26;
        for (let j = state.resources.length - 1; j >= 0; j--) {
          const r = state.resources[j];
          if (Math.abs(x - r.x) <= halfW && Math.abs(y - r.y) <= halfH) {
            return { ...r, index: j, nodeType: 'resource' };
          }
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

    /**
     * Main canvas rendering entrypoint
     */
    renderGraph() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.logicalWidth;
      const h = this.logicalHeight;
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      ctx.clearRect(0, 0, w, h);
      this.drawBackgroundGrid(ctx, w, h);

      if (this.graphMode === 'rag') {
        this.renderResourceAllocationGraph(ctx, state, w, h);
      } else {
        this.renderWaitForGraph(ctx, state, w, h);
      }

      // Hover tooltip
      if (this.hoveredNode && !this.draggedNode) {
        this.drawTooltip(ctx, this.hoveredNode, state);
      }
    }

    drawBackgroundGrid(ctx, w, h) {
      const step = 28;
      ctx.save();
      ctx.fillStyle = this.theme.bg;
      ctx.fillRect(0, 0, w, h);

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

      // Subtle architectural frame around the canvas
      ctx.strokeStyle = this.theme.borderFrame;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      ctx.restore();
    }

    /**
     * Renders Resource Allocation Graph (Processes + Resources + Assignment & Request Edges)
     */
    renderResourceAllocationGraph(ctx, state, w, h) {
      const { processes, resources, allocation, request } = state;

      // Identify cycle edges in RAG
      const cycleEdges = this.computeCycleRAGEdges(state);

      // 1. Draw Assignment Edges: Resource -> Process (Process holds Resource)
      for (let i = 0; i < processes.length; i++) {
        const proc = processes[i];
        if (proc.status === 'TERMINATED') continue;

        for (let j = 0; j < resources.length; j++) {
          const held = (allocation[i] && allocation[i][j]) || 0;
          if (held > 0) {
            const res = resources[j];
            const isCycle = cycleEdges.assignments.has(`${res.id}->${proc.id}`);
            this.drawRagArrow(ctx, res, proc, 'resource', 'process', `holds: ${held}`, this.theme.edgeHold, isCycle);
          }
        }
      }

      // 2. Draw Request Edges: Process -> Resource (Process requests Resource)
      for (let i = 0; i < processes.length; i++) {
        const proc = processes[i];
        if (proc.status === 'TERMINATED') continue;

        for (let j = 0; j < resources.length; j++) {
          const req = (request[i] && request[i][j]) || 0;
          if (req > 0) {
            const res = resources[j];
            const isCycle = cycleEdges.requests.has(`${proc.id}->${res.id}`);
            this.drawRagArrow(ctx, proc, res, 'process', 'resource', `requests: ${req}`, this.theme.edgeRequest, isCycle);
          }
        }
      }

      // 3. Draw Resource Nodes (Rectangles with instances)
      resources.forEach((res, rIdx) => {
        const isHovered = this.hoveredNode && this.hoveredNode.nodeType === 'resource' && (this.hoveredNode.id === res.id || this.hoveredNode.index === rIdx);
        const isContested = cycleEdges.contestedResources.has(res.id);
        this.drawResourceNode(ctx, res, isContested, isHovered);
      });

      // 4. Draw Process Nodes (Circles)
      processes.forEach(proc => {
        if (proc.status === 'TERMINATED') return;
        const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
        const isHovered = this.hoveredNode && this.hoveredNode.nodeType === 'process' && this.hoveredNode.id === proc.id;
        this.drawProcessNode(ctx, proc, isDeadlocked, isHovered);
      });
    }

    /**
     * Computes which assignment & request edges belong to detected cycles
     */
    computeCycleRAGEdges(state) {
      const assignments = new Set();
      const requests = new Set();
      const contestedResources = new Set();

      if (!state.detectedCycles || state.detectedCycles.length === 0) {
        return { assignments, requests, contestedResources };
      }

      const { processes, allocation, request, resources } = state;

      state.detectedCycles.forEach(cycle => {
        for (let k = 0; k < cycle.length - 1; k++) {
          const fromPid = cycle[k];
          const toPid = cycle[k + 1];

          const fromIdx = processes.findIndex(p => p.id === fromPid);
          const toIdx = processes.findIndex(p => p.id === toPid);
          if (fromIdx === -1 || toIdx === -1) continue;

          // Find which resource fromPid is requesting that toPid holds
          for (let r = 0; r < resources.length; r++) {
            if ((request[fromIdx] && request[fromIdx][r] > 0) && (allocation[toIdx] && allocation[toIdx][r] > 0)) {
              requests.add(`${fromPid}->${resources[r].id}`);
              assignments.add(`${resources[r].id}->${toPid}`);
              contestedResources.add(resources[r].id);
            }
          }
        }
      });

      return { assignments, requests, contestedResources };
    }

    /**
     * Draws Resource rectangle node
     */
    drawResourceNode(ctx, res, isContested, isHovered) {
      const w = 68;
      const h = 42;
      const x = res.x - w / 2;
      const y = res.y - h / 2;
      const r = 6; // border radius

      ctx.save();

      // Pulsing indicator for contested resource in cycle
      if (isContested) {
        const pulse = (Math.sin(this.animTime * 3) + 1) * 0.5;
        ctx.strokeStyle = `rgba(153, 27, 27, ${0.4 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        this.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Fill & Border
      ctx.fillStyle = isContested ? '#fef2f2' : (isHovered ? '#eff6ff' : '#f8fafc');
      ctx.strokeStyle = isContested ? '#991b1b' : (isHovered ? '#1e3a8a' : '#334155');
      ctx.lineWidth = isHovered ? 2.5 : 1.75;

      this.roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.stroke();

      // Resource Title
      ctx.fillStyle = isContested ? '#991b1b' : '#0f172a';
      ctx.font = 'bold 13px "Inter", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(res.name, res.x, res.y - 7);

      // Subtitle / Capacity info
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.fillStyle = isContested ? '#b91c1c' : '#475569';
      ctx.fillText(`${res.available}/${res.instances} free`, res.x, res.y + 9);

      ctx.restore();
    }

    roundRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    /**
     * Renders Wait-For Graph (Processes only, P_i -> P_j edges)
     */
    renderWaitForGraph(ctx, state, w, h) {
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

      // Draw processes as circular nodes
      state.processes.forEach(proc => {
        if (proc.status === 'TERMINATED') return;
        const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);
        const isHovered = this.hoveredNode && this.hoveredNode.nodeType === 'process' && this.hoveredNode.id === proc.id;
        this.drawProcessNode(ctx, proc, isDeadlocked, isHovered);
      });
    }

    /**
     * Directed arrow between RAG nodes (Process <-> Resource)
     */
    drawRagArrow(ctx, fromNode, toNode, fromType, toType, label, defaultColor, isCycle) {
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 15) return;

      const ux = dx / dist;
      const uy = dy / dist;

      // Adjust start and end offsets based on node shapes
      const fromOffset = fromType === 'process' ? 28 : 22;
      const toOffset = toType === 'process' ? 32 : 26;

      const curvature = 16;
      const mx = (fromNode.x + toNode.x) / 2 - uy * curvature;
      const my = (fromNode.y + toNode.y) / 2 + ux * curvature;

      const startX = fromNode.x + ux * fromOffset;
      const startY = fromNode.y + uy * fromOffset;
      const endX = toNode.x - ux * toOffset;
      const endY = toNode.y - uy * toOffset;

      ctx.save();

      const color = isCycle ? this.theme.edgeCycle : defaultColor;
      ctx.strokeStyle = color;
      ctx.lineWidth = isCycle ? 2.5 : 1.8;

      if (isCycle) {
        ctx.setLineDash([7, 4]);
        ctx.lineDashOffset = -this.animTime * 14;
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(mx, my, endX, endY);
      ctx.stroke();

      // Arrow head
      const arrowLen = isCycle ? 11 : 9;
      const angle = Math.atan2(endY - my, endX - mx);

      ctx.setLineDash([]);
      ctx.fillStyle = color;
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

      // Label Plaque
      if (label) {
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(label);
        const padX = 5, padY = 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - metrics.width / 2 - padX, my - 6 - padY, metrics.width + padX * 2, 12 + padY * 2);
        ctx.strokeStyle = isCycle ? '#991b1b' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - metrics.width / 2 - padX, my - 6 - padY, metrics.width + padX * 2, 12 + padY * 2);

        ctx.fillStyle = isCycle ? '#991b1b' : '#1e293b';
        ctx.fillText(label, mx, my);
      }

      ctx.restore();
    }

    /**
     * Directed edge for WFG
     */
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
        ctx.strokeStyle = this.theme.edgeCycle;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 4]);
        ctx.lineDashOffset = -this.animTime * 14;
      } else {
        ctx.strokeStyle = this.theme.edgeWfg;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(mx, my, endX, endY);
      ctx.stroke();

      // Arrow head
      const arrowLen = isCycleEdge ? 11 : 9;
      const angle = Math.atan2(endY - my, endX - mx);

      ctx.setLineDash([]);
      ctx.fillStyle = isCycleEdge ? this.theme.edgeCycle : this.theme.edgeWfg;
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

      // Label plaque
      if (label) {
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelText = `waits: ${label}`;
        const metrics = ctx.measureText(labelText);
        const padX = 6, padY = 3;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - metrics.width / 2 - padX, my - 7 - padY, metrics.width + padX * 2, 14 + padY * 2);
        ctx.strokeStyle = isCycleEdge ? '#991b1b' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - metrics.width / 2 - padX, my - 7 - padY, metrics.width + padX * 2, 14 + padY * 2);

        ctx.fillStyle = isCycleEdge ? '#991b1b' : '#1e293b';
        ctx.fillText(labelText, mx, my);
      }

      ctx.restore();
    }

    drawProcessNode(ctx, proc, isDeadlocked, isHovered) {
      const radius = 28;
      const x = proc.x;
      const y = proc.y;

      ctx.save();

      // Formal concentric indicator for deadlocked node
      if (isDeadlocked) {
        const pulse = (Math.sin(this.animTime * 3) + 1) * 0.5;
        ctx.strokeStyle = `rgba(153, 27, 27, ${0.4 + pulse * 0.5})`;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Academic formal node fill & borders
      let fillColor = '#f0fdf4'; // Normal ready
      let strokeColor = '#15803d';
      let statusTextColor = '#166534';

      if (isDeadlocked) {
        fillColor = '#fef2f2';
        strokeColor = '#991b1b';
        statusTextColor = '#991b1b';
      } else if (proc.status === 'WAITING') {
        fillColor = '#fffbeb';
        strokeColor = '#b45309';
        statusTextColor = '#b45309';
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Outer formal border ring
      ctx.strokeStyle = isHovered ? '#1e3a8a' : strokeColor;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.stroke();

      // Process Identifier
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px "Inter", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proc.name, x, y - 4);

      // Status Sub-label
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.fillStyle = statusTextColor;
      ctx.fillText(isDeadlocked ? 'DEADLOCKED' : proc.status, x, y + 11);

      ctx.restore();
    }

    drawTooltip(ctx, node, state) {
      const lines = [];

      if (node.nodeType === 'resource') {
        const res = state.resources.find(r => r.id === node.id) || node;
        const holders = [];
        const requesters = [];

        state.processes.forEach((p, pIdx) => {
          if (p.status === 'TERMINATED') return;
          const h = (state.allocation[pIdx] && state.allocation[pIdx][res.id]) || 0;
          if (h > 0) holders.push(`${p.name} (${h})`);
          const r = (state.request[pIdx] && state.request[pIdx][res.id]) || 0;
          if (r > 0) requesters.push(`${p.name} (${r})`);
        });

        lines.push(`Resource: ${res.name} (Type)`);
        lines.push(`Total Capacity: ${res.instances} instance(s)`);
        lines.push(`Available (Free): ${res.available}`);
        lines.push(`Held By: ${holders.length > 0 ? holders.join(', ') : 'None'}`);
        lines.push(`Requested By: ${requesters.length > 0 ? requesters.join(', ') : 'None'}`);
        lines.push(`Drag resource box to reposition`);
      } else {
        const proc = node;
        const idx = state.processes.findIndex(p => p.id === proc.id);
        if (idx === -1) return;

        const alloc = state.allocation[idx] || [];
        const req = state.request[idx] || [];
        const isDeadlocked = state.deadlockedProcessIds.includes(proc.id);

        lines.push(`${proc.name} [${isDeadlocked ? 'DEADLOCKED' : proc.status}]`);
        lines.push(`Holding: [${alloc.map((v, i) => `${state.resourceNames[i]}:${v}`).join(', ')}]`);
        lines.push(`Requests: [${req.map((v, i) => `${state.resourceNames[i]}:${v}`).join(', ')}]`);
        lines.push(`Drag process circle to reposition`);
      }

      ctx.font = '11px "Inter", sans-serif';
      let maxW = 0;
      lines.forEach(l => {
        const w = ctx.measureText(l).width;
        if (w > maxW) maxW = w;
      });

      const pad = 9;
      const boxW = maxW + pad * 2;
      const boxH = lines.length * 16 + pad * 2;
      let tx = node.x + 35;
      let ty = node.y - 10;

      if (tx + boxW > this.logicalWidth) tx = node.x - boxW - 35;
      if (ty + boxH > this.logicalHeight) ty = this.logicalHeight - boxH - 10;
      if (ty < 10) ty = 10;

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.25;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.rect(tx, ty, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#0f294a' : '#334155';
        ctx.font = i === 0 ? 'bold 12px "Inter", sans-serif' : '10px "JetBrains Mono", monospace';
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

      // Also update the description below the graph
      this.updateGraphInterpretation();
    }

    /**
     * Updates Figure 1.1: Live Short Description Below the Graph
     * Formats exact state sentences: "P1 holds R1 and requests an instance to R2"
     */
    updateGraphInterpretation() {
      const state = root.DeadlockState?.getSnapshot();
      if (!state) return;

      const listElem = document.getElementById('interpretation-list');
      const summaryElem = document.getElementById('interpretation-summary');
      const tagElem = document.getElementById('interpretation-status-tag');
      if (!listElem || !summaryElem) return;

      const { processes, resourceNames, allocation, request, deadlockedProcessIds, detectedCycles } = state;

      const sentences = [];

      processes.forEach((proc, pIdx) => {
        if (proc.status === 'TERMINATED') {
          sentences.push(`<strong>${proc.name}</strong> has finished and terminated (released all resources).`);
          return;
        }

        // Held resources
        const heldParts = [];
        (allocation[pIdx] || []).forEach((count, rIdx) => {
          if (count > 0) {
            heldParts.push(`${count} instance${count > 1 ? 's' : ''} of <strong>${resourceNames[rIdx]}</strong>`);
          }
        });

        // Requested resources
        const reqParts = [];
        (request[pIdx] || []).forEach((count, rIdx) => {
          if (count > 0) {
            reqParts.push(`${count} instance${count > 1 ? 's' : ''} of <strong>${resourceNames[rIdx]}</strong>`);
          }
        });

        let sentence = '';
        if (heldParts.length > 0 && reqParts.length > 0) {
          sentence = `<strong>${proc.name}</strong> holds ${heldParts.join(', ')} and requests ${reqParts.join(', ')}.`;
        } else if (heldParts.length > 0) {
          sentence = `<strong>${proc.name}</strong> holds ${heldParts.join(', ')} (no pending requests).`;
        } else if (reqParts.length > 0) {
          sentence = `<strong>${proc.name}</strong> holds no resources and requests ${reqParts.join(', ')}.`;
        } else {
          sentence = `<strong>${proc.name}</strong> is idle (holds no resources and has no pending claims).`;
        }

        const isDeadlocked = deadlockedProcessIds.includes(proc.id);
        if (isDeadlocked) {
          sentence += ` <span class="badge badge-crimson-inline">BLOCKED IN DEADLOCK</span>`;
        } else if (proc.status === 'WAITING') {
          sentence += ` <span class="badge badge-amber-inline">WAITING</span>`;
        } else {
          sentence += ` <span class="badge badge-green-inline">READY / RUNNING</span>`;
        }

        sentences.push(sentence);
      });

      listElem.innerHTML = sentences.map(s => `<li class="interpretation-item">${s}</li>`).join('');

      // Overall interpretation summary
      const isDeadlocked = deadlockedProcessIds.length > 0;
      if (tagElem) {
        tagElem.className = `interpretation-status-tag ${isDeadlocked ? 'tag-deadlocked' : 'tag-safe'}`;
        tagElem.textContent = isDeadlocked ? 'DEADLOCK CONFIRMED' : 'SAFE CONCURRENCY';
      }

      if (isDeadlocked) {
        let cycleText = '';
        if (detectedCycles && detectedCycles.length > 0) {
          cycleText = detectedCycles.map(c => c.map(id => {
            const p = processes.find(pr => pr.id === id);
            return p ? p.name : `P${id}`;
          }).join(' → ')).join(' | ');
        } else {
          cycleText = deadlockedProcessIds.map(id => `P${id}`).join(' ⇄ ');
        }

        summaryElem.className = 'interpretation-summary summary-deadlock';
        summaryElem.innerHTML = `
          <strong>Conclusion:</strong> Circular wait detected [<code>${cycleText}</code>]. 
          The processes are waiting on resources held by each other; neither can proceed without intervention.
        `;
      } else {
        const hasPending = processes.some((p, pIdx) => 
          (request[pIdx] || []).some((req, rIdx) => req > (state.available[rIdx] || 0))
        );

        if (hasPending) {
          summaryElem.className = 'interpretation-summary summary-risk';
          summaryElem.innerHTML = `
            <strong>Conclusion:</strong> Resource contention warning. Some processes are waiting for resources currently held, 
            but no circular wait exists. Schedulable order preserved.
          `;
        } else {
          summaryElem.className = 'interpretation-summary summary-safe';
          summaryElem.innerHTML = `
            <strong>Conclusion:</strong> Stable state. All active processes hold sufficient capacity or have free available resources 
            to execute and release without deadlock.
          `;
        }
      }
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
            <span class="strip-label">Available Capacity Vector (V<sub>avail</sub>):</span>
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
                  <th>Process Identifier</th>
                  <th>Operational State</th>
                  <th>Allocated Vector (Held)</th>
                  <th>Pending Claim (Required)</th>
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
