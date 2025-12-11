/**
 * Interaction Class
 * Handles all user input: Mouse clicks, dragging, zooming, selection, and context menus.
 */
class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        this.mode = 'IDLE'; 
        this.selectedNodes = new Set();
        
        this.dragData = {
            startX: 0, startY: 0,
            initialPan: {x:0, y:0},
            nodeOffsets: new Map()
        };

        this.lastMousePos = { x: 0, y: 0 };

        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        this.contextMenuPos = {x:0, y:0};

        this.bindEvents();
        this.bindKeyboardEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        c.addEventListener('mousedown', e => {
            this.hideContextMenu();
            if(e.target.classList.contains('pin')) {
                if (e.altKey) {
                    this.handlePinBreak(e);
                } else if (e.button === 0) {
                    this.handlePinDown(e);
                }
                return;
            }
            const nodeEl = e.target.closest('.node');
            if (nodeEl && e.button === 0) {
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                this.handleNodeDown(e, nodeId);
                return;
            }
            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) this.startBoxSelect(e);
                else if (e.button === 2) this.startPan(e);
            }
        });

        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            switch (this.mode) {
                case 'PANNING': this.updatePan(e); break;
                case 'DRAG_NODES': this.updateNodeDrag(e); break;
                case 'DRAG_WIRE': this.updateWireDrag(e); break;
                case 'BOX_SELECT': this.updateBoxSelect(e); break;
            }
        });

        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
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
            this.renderer.dom.connectionsLayer.innerHTML = ''; 
            this.renderer.render(); 
            this.selectionBox.style.display = 'none';
        });

        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel', e => this.handleZoom(e), { passive: false });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                await this.copySelection();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                await this.pasteFromClipboard(this.lastMousePos.x, this.lastMousePos.y);
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedNodes.size > 0) this.deleteSelected();
            }
        });
    }

    // --- LOGIC ---

    finishWireDrag(target) {
        const s = this.dragWire;
        const t = {
            nodeId: parseInt(target.dataset.node),
            index: parseInt(target.dataset.index),
            type: target.dataset.type,
            dataType: target.dataset.dataType
        };

        // Basic Rules
        if (s.sourceNode === t.nodeId) return; // Self
        if (s.sourceType === t.type) return;   // Same IO

        // --- TYPE MISMATCH & AUTO-CONVERSION ---
        if (s.dataType !== t.dataType) {
            
            // 1. Look up conversion rule
            // We need to know which is Source Type and which is Target Type
            const srcType = s.sourceType === 'output' ? s.dataType : t.dataType;
            const tgtType = s.sourceType === 'output' ? t.dataType : s.dataType;
            
            const key = `${srcType}->${tgtType}`;
            const templateName = window.nodeConversions ? window.nodeConversions[key] : null;

            if (templateName) {
                // 2. Find Conversion Node Template
                const template = window.nodeTemplates.find(n => n.name === templateName);
                if (template) {
                    
                    // 3. Calculate position (Middle of the two nodes)
                    const nodeA = this.graph.nodes.find(n => n.id === s.sourceNode);
                    const nodeB = this.graph.nodes.find(n => n.id === t.nodeId);
                    
                    // Simple average position
                    const midX = (nodeA.x + nodeB.x) / 2;
                    const midY = (nodeA.y + nodeB.y) / 2;

                    // 4. Create the Conversion Node
                    const convNode = this.graph.addNode(template, midX, midY);
                    
                    // 5. Render it immediately so we can connect to it
                    this.renderer.createNodeElement(convNode, (e, nid) => this.handleNodeDown(e, nid));

                    // 6. Connect Source -> Conversion -> Target
                    // The conversion node usually has Input at 0 and Output at 0
                    
                    // Determine which endpoint is which
                    const fromNodeId = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
                    const fromPinIdx = s.sourceType === 'output' ? s.sourcePin : t.index;
                    
                    const toNodeId = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
                    const toPinIdx = s.sourceType === 'output' ? t.index : s.sourcePin;

                    // Link 1: Original Source -> Conversion Input (0)
                    this.graph.addConnection(fromNodeId, fromPinIdx, convNode.id, 0, srcType);
                    
                    // Link 2: Conversion Output (0) -> Original Target
                    this.graph.addConnection(convNode.id, 0, toNodeId, toPinIdx, tgtType);
                    
                    // Success
                    return;
                }
            }
            // If no conversion found, fail silently (standard behavior)
            return; 
        }

        // Standard Connection (Types Match)
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }
    
    async copySelection() {
        if (this.selectedNodes.size === 0) return;
        const nodesToCopy = [];
        const idsToCopy = new Set(this.selectedNodes);
        this.selectedNodes.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node.toJSON());
        });
        const connectionsToCopy = this.graph.connections.filter(c => 
            idsToCopy.has(c.fromNode) && idsToCopy.has(c.toNode)
        );
        const clipboardData = { nodes: nodesToCopy, connections: connectionsToCopy };
        try {
            await navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2));
        } catch (err) { console.error('Failed to copy: ', err); }
    }

    async pasteFromClipboard(screenX, screenY) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            let data; try { data = JSON.parse(text); } catch(e) { return; } 
            const nodes = Array.isArray(data) ? data : data.nodes;
            const connections = Array.isArray(data) ? [] : (data.connections || []);
            if (!nodes) return;
            this.clearSelection();
            let minX = Infinity, minY = Infinity;
            nodes.forEach(n => { if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y; });
            const rect = this.dom.container.getBoundingClientRect();
            const pasteX = (screenX - rect.left - this.graph.pan.x) / this.graph.scale;
            const pasteY = (screenY - rect.top - this.graph.pan.y) / this.graph.scale;
            const idMap = new Map();
            nodes.forEach(nodeData => {
                const template = window.nodeTemplates.find(t => t.name === nodeData.name);
                if (!template) return;
                const offsetX = nodeData.x - minX;
                const offsetY = nodeData.y - minY;
                const newNode = this.graph.addNode(template, pasteX + offsetX, pasteY + offsetY);
                idMap.set(nodeData.id, newNode.id);
                if (nodeData.inputs) {
                    nodeData.inputs.forEach(savedPin => {
                        const realPin = newNode.inputs.find(p => p.name === savedPin.name);
                        if (realPin) {
                            realPin.value = savedPin.value;
                            if (realPin.widget) realPin.widget.value = savedPin.value;
                        }
                    });
                }
                this.renderer.createNodeElement(newNode, (e, nid) => this.handleNodeDown(e, nid));
                this.addSelection(newNode.id);
            });
            connections.forEach(c => {
                const newFrom = idMap.get(c.fromNode);
                const newTo = idMap.get(c.toNode);
                if (newFrom && newTo) {
                    this.graph.addConnection(newFrom, c.fromPin, newTo, c.toPin, c.type);
                }
            });
            this.renderer.render();
        } catch (err) { console.error('Failed to paste: ', err); }
    }

    deleteSelected() {
        this.selectedNodes.forEach(id => {
            this.graph.removeNode(id);
            const el = document.getElementById(`node-${id}`);
            if (el) el.remove();
        });
        this.selectedNodes.clear();
        this.renderer.render();
    }

    handleNodeDown(e, nodeId) {
        e.stopPropagation();
        if (!e.ctrlKey && !e.shiftKey && !this.selectedNodes.has(nodeId)) {
            this.clearSelection();
        }
        this.addSelection(nodeId);
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
                const el = document.getElementById(`node-${id}`);
                if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
            }
        });
        this.renderer.render();
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
            const intersect = !(boxRect.left > r.right || boxRect.right < r.left || boxRect.top > r.bottom || boxRect.bottom < r.top);
            if (intersect) this.addSelection(node.id);
            else if (!e.ctrlKey) { 
                this.selectedNodes.delete(node.id);
                el.classList.remove('selected');
            }
        });
    }

    finishBoxSelect() { this.selectionBox.style.display = 'none'; }

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
        if(this.dragWire.sourceType === 'output') this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
        else this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
    }

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
            if (this.selectedNodes.size > 0) {
                const liCopy = document.createElement('li');
                liCopy.className = 'ctx-item';
                liCopy.innerHTML = `<span>Copy</span>`;
                liCopy.onclick = () => { this.copySelection(); this.hideContextMenu(); };
                list.appendChild(liCopy);
            }
            const count = this.selectedNodes.size > 1 && this.selectedNodes.has(targetId) ? this.selectedNodes.size : 1;
            const liDelete = document.createElement('li');
            liDelete.className = 'ctx-item';
            liDelete.innerHTML = `<span style="color:var(--danger-color)">Delete ${count > 1 ? count+' Nodes' : 'Node'}</span>`;
            liDelete.onclick = () => { this.deleteSelected(); this.hideContextMenu(); };
            list.appendChild(liDelete);
        } else {
            search.style.display = 'block';
            const liPaste = document.createElement('li');
            liPaste.className = 'ctx-item';
            liPaste.innerHTML = `<span>Paste</span>`;
            liPaste.style.borderBottom = '1px solid #444';
            liPaste.onclick = () => { this.pasteFromClipboard(x, y); this.hideContextMenu(); };
            list.appendChild(liPaste);
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
        if (this.dom.contextSearch.value !== '') list.innerHTML = '';
        items.forEach(tmpl => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            const isFlow = (tmpl.outputs||[]).some(o=>o.type==='exec');
            li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow?'Flow':'Data'}</span>`;
            li.onclick = () => {
                const n = this.graph.addNode(tmpl, this.contextMenuPos.x, this.contextMenuPos.y);
                this.renderer.createNodeElement(n, (e, nid) => this.handleNodeDown(e, nid));
                this.hideContextMenu();
            };
            list.appendChild(li);
        });
    }
}