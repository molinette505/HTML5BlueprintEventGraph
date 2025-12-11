class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        // Mode State
        this.mode = 'IDLE'; // IDLE, PANNING, DRAG_NODES, DRAG_WIRE, BOX_SELECT
        this.selectedNodes = new Set();
        
        // Interaction Data
        this.dragData = {
            startX: 0, startY: 0,
            initialPan: {x:0, y:0},
            nodeOffsets: new Map() // For multi-drag
        };

        // Create Selection Box DOM
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        this.bindEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        // --- MOUSE DOWN ---
        c.addEventListener('mousedown', e => {
            this.hideContextMenu();

            // 1. PINS (Wire Drag or Break)
            if (e.target.classList.contains('pin')) {
                if (e.altKey) this.handlePinBreak(e); // Alt+Click
                else if (e.button === 0) this.handlePinDown(e); // Left Click
                return;
            }

            // 2. NODES (Select / Move)
            const nodeEl = e.target.closest('.node');
            if (nodeEl && e.button === 0) {
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                this.handleNodeDown(e, nodeId);
                return;
            }

            // 3. BACKGROUND (Box Select / Pan)
            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) this.startBoxSelect(e); // Left Click
                else if (e.button === 2) this.startPan(e);  // Right Click
            }
        });

        // --- MOUSE MOVE ---
        window.addEventListener('mousemove', e => {
            switch (this.mode) {
                case 'PANNING': this.updatePan(e); break;
                case 'DRAG_NODES': this.updateNodeDrag(e); break;
                case 'DRAG_WIRE': this.updateWireDrag(e); break;
                case 'BOX_SELECT': this.updateBoxSelect(e); break;
            }
        });

        // --- MOUSE UP ---
        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                // If barely moved, show context menu
                const dist = Math.hypot(e.clientX - this.dragData.startX, e.clientY - this.dragData.startY);
                if (dist < 5) this.showContextMenu(e.clientX, e.clientY, 'canvas');
            }
            else if (this.mode === 'DRAG_WIRE') {
                const target = e.target.closest('.pin');
                if (target) this.finishWireDrag(target);
                this.renderer.render();
            }
            else if (this.mode === 'BOX_SELECT') {
                this.finishBoxSelect();
            }

            this.mode = 'IDLE';
            this.renderer.dom.connectionsLayer.innerHTML = ''; // Clear drag line
            this.renderer.render(); // Redraw graph
            this.selectionBox.style.display = 'none';
        });

        // --- CONTEXT MENU ---
        c.addEventListener('contextmenu', e => e.preventDefault()); // Always prevent native menu

        // --- ZOOM ---
        c.addEventListener('wheel', e => this.handleZoom(e), { passive: false });
    }

    // ================== LOGIC ==================

    // --- NODE SELECTION & DRAG ---
    handleNodeDown(e, nodeId) {
        e.stopPropagation();
        
        // Multi-Select Logic (Shift/Ctrl)
        if (!e.ctrlKey && !e.shiftKey && !this.selectedNodes.has(nodeId)) {
            this.clearSelection();
        }
        this.addSelection(nodeId);

        // Setup Drag for ALL selected nodes
        this.mode = 'DRAG_NODES';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        this.dragData.nodeOffsets.clear();

        this.selectedNodes.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) this.dragData.nodeOffsets.set(id, { x: node.x, y: node.y });
        });
    }

    updateNodeDrag(e) {
        const dx = (e.clientX - this.dragData.startX) / this.graph.scale;
        const dy = (e.clientY - this.dragData.startY) / this.graph.scale;

        this.dragData.nodeOffsets.forEach((initialPos, id) => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                node.x = initialPos.x + dx;
                node.y = initialPos.y + dy;
                // Direct DOM update
                const el = document.getElementById(`node-${id}`);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
            }
        });
        this.renderer.render(); // Wires
    }

    addSelection(id) {
        this.selectedNodes.add(id);
        const el = document.getElementById(`node-${id}`);
        if(el) el.classList.add('selected');
    }

    clearSelection() {
        this.selectedNodes.forEach(id => {
            const el = document.getElementById(`node-${id}`);
            if(el) el.classList.remove('selected');
        });
        this.selectedNodes.clear();
    }

    // --- BOX SELECT ---
    startBoxSelect(e) {
        if (!e.ctrlKey && !e.shiftKey) this.clearSelection();
        this.mode = 'BOX_SELECT';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        
        this.selectionBox.style.left = e.clientX + 'px';
        this.selectionBox.style.top = e.clientY + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
    }

    updateBoxSelect(e) {
        const x = Math.min(e.clientX, this.dragData.startX);
        const y = Math.min(e.clientY, this.dragData.startY);
        const w = Math.abs(e.clientX - this.dragData.startX);
        const h = Math.abs(e.clientY - this.dragData.startY);

        this.selectionBox.style.left = x + 'px';
        this.selectionBox.style.top = y + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';

        const boxRect = { left: x, top: y, right: x+w, bottom: y+h };

        this.graph.nodes.forEach(node => {
            const el = document.getElementById(`node-${node.id}`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            
            const intersect = !(boxRect.left > r.right || boxRect.right < r.left || 
                                boxRect.top > r.bottom || boxRect.bottom < r.top);
            
            if (intersect) this.addSelection(node.id);
            else if (!e.ctrlKey) { // Only deselect if not holding ctrl
                this.selectedNodes.delete(node.id);
                el.classList.remove('selected');
            }
        });
    }

    finishBoxSelect() {
        this.selectionBox.style.display = 'none';
    }

    // --- PANNING ---
    startPan(e) {
        this.mode = 'PANNING';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        this.dragData.initialPan = { ...this.graph.pan };
    }

    updatePan(e) {
        this.graph.pan.x = this.dragData.initialPan.x + (e.clientX - this.dragData.startX);
        this.graph.pan.y = this.dragData.initialPan.y + (e.clientY - this.dragData.startY);
        this.renderer.updateTransform();
    }

    // --- PINS & WIRES ---
    handlePinBreak(e) {
        const pin = e.target;
        this.graph.disconnectPin(parseInt(pin.dataset.node), parseInt(pin.dataset.index), pin.dataset.type);
        this.renderer.render();
    }

    handlePinDown(e) {
        e.stopPropagation();
        const pin = e.target;
        const nodeId = parseInt(pin.dataset.node);
        const index = parseInt(pin.dataset.index);
        const type = pin.dataset.type;

        if (type === 'input') {
            const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPin === index);
            if (conn) {
                this.graph.removeConnection(conn.id);
                this.renderer.render();
                const srcPos = this.renderer.getPinPos(conn.fromNode, conn.fromPin, 'output');
                if (srcPos) {
                    this.dragWire = {
                        sourceNode: conn.fromNode, sourcePin: conn.fromPin, sourceType: 'output',
                        dataType: pin.dataset.dataType, startX: srcPos.x, startY: srcPos.y
                    };
                    this.mode = 'DRAG_WIRE';
                }
                return;
            }
        }

        const rect = pin.getBoundingClientRect();
        const cRect = this.dom.container.getBoundingClientRect();
        this.dragWire = {
            sourceNode: nodeId, sourcePin: index, sourceType: type, dataType: pin.dataset.dataType,
            startX: (rect.left + rect.width/2 - cRect.left - this.graph.pan.x)/this.graph.scale,
            startY: (rect.top + rect.height/2 - cRect.top - this.graph.pan.y)/this.graph.scale
        };
        this.mode = 'DRAG_WIRE';
    }

    updateWireDrag(e) {
        const rect = this.dom.container.getBoundingClientRect();
        const mx = (e.clientX - rect.left - this.graph.pan.x)/this.graph.scale;
        const my = (e.clientY - rect.top - this.graph.pan.y)/this.graph.scale;
        
        this.renderer.dom.connectionsLayer.innerHTML = '';
        this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
        
        const p1 = {x: this.dragWire.startX, y: this.dragWire.startY};
        const p2 = {x: mx, y: my};
        
        if (this.dragWire.sourceType === 'output') this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
        else this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
    }

    finishWireDrag(target) {
        const s = this.dragWire;
        const t = {
            nodeId: parseInt(target.dataset.node),
            index: parseInt(target.dataset.index),
            type: target.dataset.type,
            dataType: target.dataset.dataType
        };

        if (s.sourceNode !== t.nodeId && s.sourceType !== t.type && s.dataType === t.dataType) {
            const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
            const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
            const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
            const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;
            this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
        }
    }

    // --- ZOOM ---
    handleZoom(e) {
        e.preventDefault();
        const rect = this.dom.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldScale = this.graph.scale;
        const newScale = Math.min(Math.max(0.2, oldScale + delta), 3);

        this.graph.pan.x = mouseX - (mouseX - this.graph.pan.x) * (newScale / oldScale);
        this.graph.pan.y = mouseY - (mouseY - this.graph.pan.y) * (newScale / oldScale);
        this.graph.scale = newScale;

        this.renderer.updateTransform();
        this.hideContextMenu();
    }

    // --- CONTEXT MENU ---
    showContextMenu(x, y, type, targetId) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        let drawX = x; let drawY = y;
        if(x + 200 > window.innerWidth) drawX -= 200;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; menu.style.top = drawY + 'px';
        menu.classList.add('visible');

        const rect = this.dom.container.getBoundingClientRect();
        this.contextMenuPos = {
            x: (x - rect.left - this.graph.pan.x)/this.graph.scale,
            y: (y - rect.top - this.graph.pan.y)/this.graph.scale
        };

        list.innerHTML = '';
        if (type === 'node') {
            search.style.display = 'none';
            // Selection Aware Delete
            const count = this.selectedNodes.size > 1 && this.selectedNodes.has(targetId) ? this.selectedNodes.size : 1;
            const label = count > 1 ? `Delete ${count} Nodes` : `Delete Node`;
            
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerHTML = `<span style="color:#ff6666">${label}</span>`;
            li.onclick = () => {
                const nodesToDelete = count > 1 ? Array.from(this.selectedNodes) : [targetId];
                nodesToDelete.forEach(id => {
                    this.graph.removeNode(id);
                    const el = document.getElementById(`node-${id}`);
                    if(el) el.remove();
                });
                this.selectedNodes.clear();
                this.renderer.render();
                this.hideContextMenu();
            };
            list.appendChild(li);
        } else {
            search.style.display = 'block';
            search.value = '';
            setTimeout(() => search.focus(), 50);
            this.renderNodeList(window.nodeTemplates || []);
        }
    }

    hideContextMenu() { this.dom.contextMenu.classList.remove('visible'); }

    filterContextMenu(q) {
        const lower = q.toLowerCase();
        this.renderNodeList((window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower)));
    }

    renderNodeList(items) {
        const list = this.dom.contextList;
        list.innerHTML = '';
        items.forEach(tmpl => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            const isFlow = (tmpl.outputs||[]).some(o=>o.type==='exec');
            li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow?'Flow':'Data'}</span>`;
            li.onclick = () => {
                const n = this.graph.addNode(tmpl, this.contextMenuPos.x, this.contextMenuPos.y);
                // Manually trigger node creation hook if needed, but Graph handles data.
                // Renderer needs to know to create element.
                this.renderer.createNodeElement(n, (e, nid) => this.handleNodeDown(e, nid));
                this.hideContextMenu();
            };
            list.appendChild(li);
        });
    }
}