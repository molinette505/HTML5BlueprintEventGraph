/**
 * Interaction Class
 * Handles all user input: Mouse clicks, dragging, zooming, selection, and context menus.
 * Acts as the "Controller" in the MVC pattern, updating the Graph (Model) and Renderer (View).
 */
class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        this.mode = 'IDLE'; 
        this.selectedNodes = new Set();
        this.clipboard = null; 
        
        this.dragData = {
            startX: 0, startY: 0,
            initialPan: {x:0, y:0},
            nodeOffsets: new Map()
        };

        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        this.contextMenuPos = {x:0, y:0};
        this.bindEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        // --- MOUSE DOWN ---
        c.addEventListener('mousedown', e => {
            this.hideContextMenu();

            // 1. PIN INTERACTION
            if (e.target.classList.contains('pin')) {
                e.stopPropagation();
                
                // Right Click -> Pin Context Menu (Change Type)
                if (e.button === 2) {
                    const pinId = {
                        nodeId: parseInt(e.target.dataset.node),
                        index: parseInt(e.target.dataset.index),
                        direction: e.target.dataset.type
                    };
                    this.showContextMenu(e.clientX, e.clientY, 'pin', pinId);
                    return;
                }
                // Alt+Click -> Disconnect
                if (e.altKey) {
                    this.handlePinBreak(e);
                    return;
                }
                // Left Click -> Drag Wire
                if (e.button === 0) {
                    this.handlePinDown(e);
                    return;
                }
            }

            // 2. NODE INTERACTION
            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                // Right Click -> Node Context Menu
                if (e.button === 2) {
                    // Select node if not already selected
                    if (!this.selectedNodes.has(nodeId)) {
                        this.clearSelection();
                        this.addSelection(nodeId);
                    }
                    this.showContextMenu(e.clientX, e.clientY, 'node', nodeId);
                    return;
                }
                // Left Click -> Drag/Select
                if (e.button === 0) {
                    this.handleNodeDown(e, nodeId); 
                    return;
                }
            }

            // 3. BACKGROUND INTERACTION
            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) {
                    this.startBoxSelect(e);
                } else if (e.button === 2) {
                    this.startPan(e);
                }
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
                // Heuristic: Small move = Context Menu
                const dist = Math.hypot(e.clientX - this.dragData.startX, e.clientY - this.dragData.startY);
                if (dist < 5) {
                    this.showContextMenu(e.clientX, e.clientY, 'canvas');
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
        
        // Keyboard Shortcuts
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
            if (e.ctrlKey && e.key === 'c') this.copySelection();
            if (e.ctrlKey && e.key === 'x') this.cutSelection();
            if (e.ctrlKey && e.key === 'v') this.pasteClipboard();
        });
    }

    // ==========================================
    // CONTEXT MENU
    // ==========================================

    showContextMenu(x, y, type, target) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        let drawX = x; let drawY = y;
        if(x + 220 > window.innerWidth) drawX -= 220;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; 
        menu.style.top = drawY + 'px';
        menu.classList.add('visible');

        const rect = this.dom.container.getBoundingClientRect();
        this.contextMenuPos = {
            x: (x - rect.left - this.graph.pan.x)/this.graph.scale,
            y: (y - rect.top - this.graph.pan.y)/this.graph.scale
        };

        list.innerHTML = '';
        search.style.display = 'none';

        // --- 1. PIN MENU (Allowed Types) ---
        if (type === 'pin') {
            const { nodeId, index, direction } = target;
            const node = this.graph.nodes.find(n => n.id === nodeId);
            const pin = direction === 'input' ? node.inputs[index] : node.outputs[index];

            const header = document.createElement('li');
            header.className = 'ctx-category';
            header.innerText = `Pin: ${pin.name}`;
            list.appendChild(header);

            // [RESTORED] Use 'allowedTypes' from Node Definition
            if (pin.allowedTypes && pin.allowedTypes.length > 0) {
                pin.allowedTypes.forEach(typeName => {
                    const typeDef = window.globalDataTypes.find(t => t.name === typeName) || {name: typeName, color:'#fff'};
                    
                    const li = document.createElement('li');
                    li.className = 'ctx-item';
                    li.innerHTML = `<span style="color:${typeDef.color}">●</span> ${typeDef.name}`;
                    li.onclick = () => {
                        // Update Pin Type
                        pin.setType(typeDef.name);
                        // Also update sibling wildcard pins if this is a generic node (Add/Sub)
                        if (node.inputs.some(p => p.type === 'wildcard') || node.outputs.some(p => p.type === 'wildcard')) {
                             node.inputs.forEach(p => p.setType(typeDef.name));
                             node.outputs.forEach(p => p.setType(typeDef.name));
                        }
                        
                        this.graph.disconnectPin(nodeId, index, direction);
                        this.renderer.refreshNode(node); 
                        this.hideContextMenu();
                    };
                    list.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.className = 'ctx-item';
                li.innerHTML = `<span style="opacity:0.5">No conversions available</span>`;
                list.appendChild(li);
            }
        }

        // --- 2. NODE MENU ---
        else if (type === 'node') {
            const count = this.selectedNodes.size;
            
            const addIdx = (txt, fn) => {
                const li = document.createElement('li');
                li.className = 'ctx-item';
                li.innerHTML = txt;
                li.onclick = () => { fn(); this.hideContextMenu(); };
                list.appendChild(li);
            };

            addIdx("Auto Layout Selected", () => this.layoutSelected());
            addIdx(`Copy (${count})`, () => this.copySelection());
            addIdx(`Cut (${count})`, () => this.cutSelection());
            addIdx(`<span style="color:var(--danger-color)">Delete</span>`, () => this.deleteSelected());
        }

        // --- 3. BACKGROUND MENU ---
        else {
            search.style.display = 'block';
            search.value = '';
            setTimeout(() => search.focus(), 50);

            if (this.clipboard && this.clipboard.length > 0) {
                const liPaste = document.createElement('li');
                liPaste.className = 'ctx-item';
                liPaste.innerText = `Paste ${this.clipboard.length} Nodes`;
                liPaste.onclick = () => { this.pasteClipboard(); this.hideContextMenu(); };
                list.appendChild(liPaste);
                
                const sep = document.createElement('li');
                sep.style.borderBottom = "1px solid #333";
                sep.style.margin = "4px 0";
                list.appendChild(sep);
            }

            this.renderNodeList(window.nodeTemplates || []);
        }
    }

    renderNodeList(items) {
        const list = this.dom.contextList;
        list.innerHTML = '';
        
        // Sort by Category -> Name
        items.sort((a, b) => {
            const catA = a.category || "Uncategorized";
            const catB = b.category || "Uncategorized";
            if (catA === catB) return a.name.localeCompare(b.name);
            return catA.localeCompare(catB);
        });

        let lastCat = null;
        items.forEach(tmpl => {
            const cat = tmpl.category || "Uncategorized";
            if (cat !== lastCat) {
                const h = document.createElement('li');
                h.className = 'ctx-category';
                h.innerText = cat;
                list.appendChild(h);
                lastCat = cat;
            }

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

    // ==========================================
    // CLIPBOARD & LAYOUT
    // ==========================================

    copySelection() {
        if (this.selectedNodes.size === 0) return;
        this.clipboard = [];
        this.selectedNodes.forEach(id => {
            const n = this.graph.nodes.find(node => node.id === id);
            if (n) this.clipboard.push(n.toJSON());
        });
    }

    cutSelection() {
        this.copySelection();
        this.deleteSelected();
    }

    pasteClipboard() {
        if (!this.clipboard || this.clipboard.length === 0) return;
        this.clearSelection();
        
        let minX = Infinity, minY = Infinity;
        this.clipboard.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
        });
        const offsetX = this.contextMenuPos.x - minX;
        const offsetY = this.contextMenuPos.y - minY;

        this.clipboard.forEach(tmpl => {
            const newNode = this.graph.addNode(tmpl, tmpl.x + offsetX, tmpl.y + offsetY);
            
            // Restore widget values
            if (tmpl.inputs) {
                tmpl.inputs.forEach((inpData, i) => {
                    if (newNode.inputs[i] && newNode.inputs[i].widget) {
                        newNode.inputs[i].widget.value = inpData.value;
                        newNode.inputs[i].value = inpData.value;
                    }
                });
            }
            // Restore Pin Types (Critically important for pasted Wildcards!)
            if (tmpl.pinTypes) {
                if (tmpl.pinTypes.inputs) {
                    tmpl.pinTypes.inputs.forEach((t, i) => { if(newNode.inputs[i]) newNode.inputs[i].setType(t); });
                }
                if (tmpl.pinTypes.outputs) {
                    tmpl.pinTypes.outputs.forEach((t, i) => { if(newNode.outputs[i]) newNode.outputs[i].setType(t); });
                }
            }

            this.renderer.createNodeElement(newNode, (e, nid) => this.handleNodeDown(e, nid));
            this.addSelection(newNode.id);
        });
        this.renderer.render();
    }

    deleteSelected() {
        this.selectedNodes.forEach(id => {
            this.graph.removeNode(id);
            const el = document.getElementById(`node-${id}`);
            if(el) el.remove();
        });
        this.selectedNodes.clear();
        this.renderer.render();
    }

    layoutSelected() {
        if (this.selectedNodes.size === 0) return;
        
        const nodes = [];
        this.selectedNodes.forEach(id => {
            const n = this.graph.nodes.find(node => node.id === id);
            if (n) nodes.push(n);
        });

        // 1. Build Dependency Graph
        const adj = new Map(); 
        const inDegree = new Map();
        nodes.forEach(n => { adj.set(n.id, []); inDegree.set(n.id, 0); });

        this.graph.connections.forEach(c => {
            if (this.selectedNodes.has(c.fromNode) && this.selectedNodes.has(c.toNode)) {
                adj.get(c.fromNode).push(c.toNode);
                inDegree.set(c.toNode, (inDegree.get(c.toNode) || 0) + 1);
            }
        });

        // 2. Kahn's Algorithm
        let queue = nodes.filter(n => inDegree.get(n.id) === 0);
        const layers = [];
        const visited = new Set();
        
        if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0]);

        while (queue.length > 0) {
            layers.push(queue);
            const nextQueue = [];
            queue.forEach(n => {
                visited.add(n.id);
                (adj.get(n.id)||[]).forEach(childId => {
                    inDegree.set(childId, inDegree.get(childId) - 1);
                    if (inDegree.get(childId) === 0) {
                        const childNode = nodes.find(x => x.id === childId);
                        if (childNode) nextQueue.push(childNode);
                    }
                });
            });
            if (nextQueue.length === 0 && visited.size < nodes.length) {
                const unvisited = nodes.find(n => !visited.has(n.id));
                if (unvisited) nextQueue.push(unvisited);
            }
            queue = nextQueue;
        }

        // 3. Apply Positions
        let startX = Math.min(...nodes.map(n => n.x));
        let startY = Math.min(...nodes.map(n => n.y));
        const COL_SPACING = 300;
        const ROW_SPACING = 150;

        layers.forEach((layerNodes, colIdx) => {
            let currentY = startY;
            layerNodes.forEach(node => {
                node.x = startX + (colIdx * COL_SPACING);
                node.y = currentY;
                const el = document.getElementById(`node-${node.id}`);
                if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
                currentY += ROW_SPACING;
            });
        });
        this.renderer.render();
    }

    // ==========================================
    // UTILS (From Previous)
    // ==========================================

    hideContextMenu() { 
        this.dom.contextMenu.classList.remove('visible'); 
    }

    filterContextMenu(q) {
        const lower = q.toLowerCase();
        const filtered = (window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower));
        this.renderNodeList(filtered);
    }

    // ==========================================
    // NODE DRAG & SELECTION (Standard)
    // ==========================================

    handleNodeDown(e, nodeId) {
        if (e.button !== 0) return; // IGNORE RIGHT CLICKS FOR DRAG

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
        
        const rect = this.dom.container.getBoundingClientRect();
        const container = this.dom.container;

        // [FIX] Calculate relative position accounting for Border and Scroll
        // clientLeft/clientTop is the width of the border
        const relX = e.clientX - rect.left - container.clientLeft + container.scrollLeft;
        const relY = e.clientY - rect.top - container.clientTop + container.scrollTop;

        this.selectionBox.style.left = relX + 'px';
        this.selectionBox.style.top = relY + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
    }

    updateBoxSelect(e) {
        // Calculate dimensions in Screen Space first
        const x = Math.min(e.clientX, this.dragData.startX);
        const y = Math.min(e.clientY, this.dragData.startY);
        const w = Math.abs(e.clientX - this.dragData.startX);
        const h = Math.abs(e.clientY - this.dragData.startY);
        
        const rect = this.dom.container.getBoundingClientRect();
        const container = this.dom.container;

        // [FIX] Convert Screen Space -> Container Relative Space
        const relX = x - rect.left - container.clientLeft + container.scrollLeft;
        const relY = y - rect.top - container.clientTop + container.scrollTop;

        this.selectionBox.style.left = relX + 'px';
        this.selectionBox.style.top = relY + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';

        // Collision Detection uses Screen Coordinates (Client Space), so 'x' and 'y' are correct here
        const boxRect = { left: x, top: y, right: x+w, bottom: y+h };

        this.graph.nodes.forEach(node => {
            const el = document.getElementById(`node-${node.id}`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            
            // Standard AABB Intersection test
            const intersect = !(boxRect.left > r.right || 
                                boxRect.right < r.left || 
                                boxRect.top > r.bottom || 
                                boxRect.bottom < r.top);
            
            if (intersect) {
                this.addSelection(node.id);
            } else if (!e.ctrlKey) { 
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
                    this.dragWire = { sourceNode: conn.fromNode, sourcePin: conn.fromPin, sourceType: 'output', dataType: pin.dataset.dataType, startX: srcPos.x, startY: srcPos.y };
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

    // [RESTORED] POLYTYPE / WILDCARD LOGIC
    finishWireDrag(target) {
        const s = this.dragWire;
        const t = { nodeId: parseInt(target.dataset.node), index: parseInt(target.dataset.index), type: target.dataset.type, dataType: target.dataset.dataType };
        
        // 1. Basic Validation
        if (s.sourceNode === t.nodeId) return; 
        if (s.sourceType === t.type) return;   
        
        // 2. Wildcard Logic (Polytype)
        // If connecting Specific -> Wildcard, update the Wildcard Node
        if (s.dataType !== 'wildcard' && t.dataType === 'wildcard') {
            const targetNode = this.graph.nodes.find(n => n.id === t.nodeId);
            if (targetNode) {
                // Update all pins on this node to the new specific type
                targetNode.inputs.forEach(p => p.setType(s.dataType));
                targetNode.outputs.forEach(p => p.setType(s.dataType));
                // Update our target reference to match the new type
                t.dataType = s.dataType;
                // Redraw node to show new colors
                this.renderer.refreshNode(targetNode);
            }
        }
        // If connecting Wildcard -> Specific, update the Wildcard Node
        else if (s.dataType === 'wildcard' && t.dataType !== 'wildcard') {
            const sourceNode = this.graph.nodes.find(n => n.id === s.sourceNode);
            if (sourceNode) {
                sourceNode.inputs.forEach(p => p.setType(t.dataType));
                sourceNode.outputs.forEach(p => p.setType(t.dataType));
                s.dataType = t.dataType;
                this.renderer.refreshNode(sourceNode);
            }
        }
        
        // 3. Final Type Check (block if still mismatched)
        if (s.dataType !== t.dataType && s.dataType !== 'wildcard' && t.dataType !== 'wildcard') {
            // Optional: You could add "Auto Convert" logic here later
            return;
        }

        // 4. Create Connection
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }
}