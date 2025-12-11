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
        this.dragData = { startX: 0, startY: 0, initialPan: {x:0, y:0}, nodeOffsets: new Map() };
        this.lastMousePos = { x: 0, y: 0 };
        
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);
        this.contextMenuPos = {x:0, y:0};
        
        // Track collapsed categories
        this.collapsedCategories = new Set(); 

        this.bindEvents();
        this.bindKeyboardEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        c.addEventListener('mousedown', e => {
            this.hideContextMenu();

            // 1. PIN INTERACTION
            if (e.target.classList.contains('pin')) {
                if (e.button === 2) {
                    const pin = e.target;
                    this.showContextMenu(e.clientX, e.clientY, 'pin', parseInt(pin.dataset.node), parseInt(pin.dataset.index), pin.dataset.type);
                    return;
                }
                if (e.altKey) this.handlePinBreak(e);
                else if (e.button === 0) this.handlePinDown(e);
                return;
            }

            // 2. NODE INTERACTION
            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                if (e.button === 2) {
                    this.addSelection(nodeId);
                    this.showContextMenu(e.clientX, e.clientY, 'node', nodeId);
                    return;
                }
                if (e.button === 0) {
                    this.handleNodeDown(e, nodeId);
                    return;
                }
            }

            // 3. BACKGROUND INTERACTION
            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) this.startBoxSelect(e);
                else if (e.button === 2) this.startPan(e);
            }
        });

        // Mouse Move (standard logic)
        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            switch (this.mode) {
                case 'PANNING': this.updatePan(e); break;
                case 'DRAG_NODES': this.updateNodeDrag(e); break;
                case 'DRAG_WIRE': this.updateWireDrag(e); break;
                case 'BOX_SELECT': this.updateBoxSelect(e); break;
            }
        });

        // Mouse Up (Check for context menu on background)
        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                const dist = Math.hypot(e.clientX - this.dragData.startX, e.clientY - this.dragData.startY);
                if (dist < 5 && e.button === 2) {
                    if(!e.target.closest('.node') && !e.target.closest('.pin')) {
                        this.showContextMenu(e.clientX, e.clientY, 'canvas');
                    }
                }
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

    // ... (Keep bindKeyboardEvents, copy/paste/cut/delete/handlers etc from previous response) ...
    // ... [Including copySelection, pasteFromClipboard, handleNodeDown, updateNodeDrag etc] ...
    
    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); await this.copySelection(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); await this.cutSelection(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); await this.pasteFromClipboard(this.lastMousePos.x, this.lastMousePos.y); }
            if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selectedNodes.size > 0) this.deleteSelected(); }
        });
    }
    
    async copySelection() {
        if (this.selectedNodes.size === 0) return;
        const nodesToCopy = [];
        const idsToCopy = new Set(this.selectedNodes);
        this.selectedNodes.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node.toJSON());
        });
        const connectionsToCopy = this.graph.connections.filter(c => idsToCopy.has(c.fromNode) && idsToCopy.has(c.toNode));
        const clipboardData = { nodes: nodesToCopy, connections: connectionsToCopy };
        try { await navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2)); } catch (err) { console.error(err); }
    }
    async cutSelection() { await this.copySelection(); this.deleteSelected(); }
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
                        if (realPin) { realPin.value = savedPin.value; if (realPin.widget) realPin.widget.value = savedPin.value; }
                    });
                }
                if (nodeData.pinTypes) {
                    if (nodeData.pinTypes.inputs) { nodeData.pinTypes.inputs.forEach((type, idx) => { if (newNode.inputs[idx] && type) newNode.inputs[idx].setType(type); }); }
                    if (nodeData.pinTypes.outputs) { nodeData.pinTypes.outputs.forEach((type, idx) => { if (newNode.outputs[idx] && type) newNode.outputs[idx].setType(type); }); }
                }
                this.renderer.createNodeElement(newNode, (e, nid) => this.handleNodeDown(e, nid));
                this.addSelection(newNode.id);
            });
            connections.forEach(c => {
                const newFrom = idMap.get(c.fromNode);
                const newTo = idMap.get(c.toNode);
                if (newFrom && newTo) this.graph.addConnection(newFrom, c.fromPin, newTo, c.toPin, c.type);
            });
            this.renderer.render();
        } catch (err) { console.error(err); }
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
        if (!e.ctrlKey && !e.shiftKey && !this.selectedNodes.has(nodeId)) { this.clearSelection(); }
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
    finishWireDrag(target) {
        const s = this.dragWire;
        const t = { nodeId: parseInt(target.dataset.node), index: parseInt(target.dataset.index), type: target.dataset.type, dataType: target.dataset.dataType };
        
        // Auto-Conversion Logic
        if (s.dataType !== t.dataType) {
            const srcType = s.sourceType === 'output' ? s.dataType : t.dataType;
            const tgtType = s.sourceType === 'output' ? t.dataType : s.dataType;
            const key = `${srcType}->${tgtType}`;
            const templateName = window.nodeConversions ? window.nodeConversions[key] : null;
            if (templateName) {
                const template = window.nodeTemplates.find(n => n.name === templateName);
                if (template) {
                    const nodeA = this.graph.nodes.find(n => n.id === s.sourceNode);
                    const nodeB = this.graph.nodes.find(n => n.id === t.nodeId);
                    const midX = (nodeA.x + nodeB.x) / 2;
                    const midY = (nodeA.y + nodeB.y) / 2;
                    const convNode = this.graph.addNode(template, midX, midY);
                    this.renderer.createNodeElement(convNode, (e, nid) => this.handleNodeDown(e, nid));
                    const fromNodeId = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
                    const fromPinIdx = s.sourceType === 'output' ? s.sourcePin : t.index;
                    const toNodeId = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
                    const toPinIdx = s.sourceType === 'output' ? t.index : s.sourcePin;
                    this.graph.addConnection(fromNodeId, fromPinIdx, convNode.id, 0, srcType);
                    this.graph.addConnection(convNode.id, 0, toNodeId, toPinIdx, tgtType);
                    return;
                }
            }
            return; 
        }
        
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;
        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
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

    // --- CONTEXT MENU IMPLEMENTATION (with Categories) ---
    showContextMenu(x, y, type, targetId, pinIndex, pinDir) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        let drawX = x; let drawY = y;
        if(x + 200 > window.innerWidth) drawX -= 200;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; menu.style.top = drawY + 'px';
        menu.classList.add('visible');
        list.innerHTML = '';

        if (type === 'pin') {
            search.style.display = 'none';
            const node = this.graph.nodes.find(n => n.id === targetId);
            if (!node) return;
            const pin = (pinDir === 'input') ? node.inputs[pinIndex] : node.outputs[pinIndex];
            if (pin && pin.allowedTypes) {
                const head = document.createElement('li');
                head.className = 'ctx-item';
                head.style.fontWeight = 'bold';
                head.style.cursor = 'default';
                head.innerHTML = `<span>Change Pin Type</span>`;
                list.appendChild(head);
                pin.allowedTypes.forEach(t => {
                    const li = document.createElement('li');
                    li.className = 'ctx-item';
                    const check = (t === pin.type) ? "✓ " : "";
                    const typeDef = window.globalDataTypes.find(g => g.name === t);
                    const colorVar = typeDef ? typeDef.color : '#fff';
                    li.innerHTML = `<span style="color:${colorVar}">${check}${t.toUpperCase()}</span>`;
                    li.onclick = () => {
                        pin.setType(t);
                        this.graph.disconnectPin(node.id, pinIndex, pinDir);
                        this.renderer.refreshNode(node); 
                        this.hideContextMenu();
                    };
                    list.appendChild(li);
                });
            } else { this.hideContextMenu(); }
        }
        else if (type === 'node') {
            search.style.display = 'none';
            const liCopy = document.createElement('li');
            liCopy.className = 'ctx-item';
            liCopy.innerHTML = `<span>Copy</span>`;
            liCopy.onclick = () => { this.copySelection(); this.hideContextMenu(); };
            list.appendChild(liCopy);
            
            const liCut = document.createElement('li');
            liCut.className = 'ctx-item';
            liCut.innerHTML = `<span>Cut</span>`;
            liCut.onclick = () => { this.cutSelection(); this.hideContextMenu(); };
            list.appendChild(liCut);

            const count = this.selectedNodes.size > 1 && this.selectedNodes.has(targetId) ? this.selectedNodes.size : 1;
            const liDelete = document.createElement('li');
            liDelete.className = 'ctx-item';
            liDelete.innerHTML = `<span style="color:var(--danger-color)">Delete ${count > 1 ? count + ' Nodes' : 'Node'}</span>`;
            liDelete.onclick = () => { this.deleteSelected(); this.hideContextMenu(); };
            list.appendChild(liDelete);
        } 
        else {
            search.style.display = 'block';
            this.contextMenuPos = {
                x: (x - this.dom.container.getBoundingClientRect().left - this.graph.pan.x)/this.graph.scale,
                y: (y - this.dom.container.getBoundingClientRect().top - this.graph.pan.y)/this.graph.scale
            };
            const liPaste = document.createElement('li');
            liPaste.className = 'ctx-item';
            liPaste.innerHTML = `<span>Paste</span>`;
            liPaste.style.borderBottom = '1px solid #444';
            liPaste.style.marginBottom = '5px';
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
        // If searching, ignore categories and show flat list
        const filtered = (window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower));
        this.renderNodeList(filtered, !!q);
    }

    renderNodeList(items, isSearching = false) {
        const list = this.dom.contextList;
        if (this.dom.contextSearch.value !== '') list.innerHTML = '';
        
        // Group by Category
        if (!isSearching) {
            const grouped = {};
            items.forEach(tmpl => {
                const cat = tmpl.category || "General";
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(tmpl);
            });

            Object.keys(grouped).sort().forEach(cat => {
                const header = document.createElement('li');
                header.className = `ctx-category ${this.collapsedCategories.has(cat) ? 'collapsed' : ''}`;
                header.innerText = cat;
                header.onclick = (e) => {
                    e.stopPropagation();
                    if (this.collapsedCategories.has(cat)) this.collapsedCategories.delete(cat);
                    else this.collapsedCategories.add(cat);
                    this.renderNodeList(items, false); // Re-render to update collapse state
                };
                list.appendChild(header);

                if (!this.collapsedCategories.has(cat)) {
                    grouped[cat].forEach(tmpl => {
                        this.createMenuItem(tmpl, list, true);
                    });
                }
            });
        } else {
            // Flat list for search
            items.forEach(tmpl => this.createMenuItem(tmpl, list, false));
        }
    }

    createMenuItem(tmpl, list, isIndent) {
        const li = document.createElement('li');
        li.className = `ctx-item ${isIndent ? 'ctx-folder' : ''}`;
        const isFlow = (tmpl.outputs||[]).some(o=>o.type==='exec');
        li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow?'Flow':'Data'}</span>`;
        li.onclick = () => {
            const n = this.graph.addNode(tmpl, this.contextMenuPos.x, this.contextMenuPos.y);
            this.renderer.createNodeElement(n, (e, nid) => this.handleNodeDown(e, nid));
            this.hideContextMenu();
        };
        list.appendChild(li);
    }
}