/**
 * Interaction Class
 * Handles all user input: Mouse clicks, dragging, zooming, selection, and context menus.
 */
class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        this.viewportManager = new ViewportManager(graph, renderer, dom);
        this.selectionManager = new SelectionManager(graph, dom);
        this.nodeMovementManager = new NodeMovementManager(graph, renderer, this.selectionManager);
        
        this.mode = 'IDLE'; 
        
        this.dragData = {
            startX: 0, startY: 0,
            initialPan: {x:0, y:0},
            nodeOffsets: new Map()
        };
        
        this.lastMousePos = { x: 0, y: 0 };

        this.contextMenuPos = {x:0, y:0};
        this.collapsedCategories = new Set(); 

        this.bindEvents();
        this.bindKeyboardEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        c.addEventListener('mousedown', e => {
            this.hideContextMenu();

            if (e.target.classList.contains('pin')) {
                if (e.button === 2) {
                    const pin = e.target;
                    this.showContextMenu(e.clientX, e.clientY, 'pin', parseInt(pin.dataset.node), parseInt(pin.dataset.index), pin.dataset.type);
                    return;
                }
                if (e.altKey) {
                    this.handlePinBreak(e);
                } 
                else if (e.button === 0) {
                    this.handlePinDown(e);
                }
                return;
            }

            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                if(e.target.closest('.pin') || e.target.closest('input') || 
                    e.target.closest('.node-widget') || e.target.closest('.advanced-arrow')) return;
                    
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                if (e.button === 2) {
                    this.selectionManager.add(nodeId);
                    this.showContextMenu(e.clientX, e.clientY, 'node', nodeId);
                    return;
                }
                if (e.button === 0) {

                     if (!e.ctrlKey && !e.shiftKey && !this.selectionManager.selected.has(nodeId)) {
                        this.selectionManager.clear();
                    }
                    this.selectionManager.add(nodeId);

                    this.nodeMovementManager.startDrag(e, nodeId);
                    this.mode = 'DRAG_NODES';
                    
                    return;
                }
            }

            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) {
                    this.selectionManager.startBox(e);
                    this.mode = 'BOX_SELECT';
                } else if (e.button === 2) {
                    this.viewportManager.startPan(e);
                    this.mode = 'PANNING';
                }
            }
        });

        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            switch (this.mode) {
                case 'PANNING': this.viewportManager.updatePan(e); break;
                case 'DRAG_NODES': this.nodeMovementManager.update(e); break;
                case 'DRAG_WIRE': this.updateWireDrag(e); break;
                case 'BOX_SELECT': this.selectionManager.updateBox(e); break;
            }
        });

        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                if (!this.viewportManager.isIntentionalDrag && e.button === 2) {
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
                this.selectionManager.endBox();
            }

            this.mode = 'IDLE';
            this.renderer.dom.connectionsLayer.innerHTML = ''; 
            this.renderer.render(); 
        });

        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel', e => {
            this.viewportManager.handleZoom(e);
            this.hideContextMenu();
        }, { passive: false });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { 
                e.preventDefault(); 
                await this.copySelection(); 
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') { 
                e.preventDefault(); 
                await this.cutSelection(); 
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { 
                e.preventDefault(); 
                await this.pasteFromClipboard(this.lastMousePos.x, this.lastMousePos.y); 
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { 
                if (this.selectionManager.selected.size > 0) this.deleteSelected(); 
            }
        });
    }
    
    // ==========================================
    // COPY / PASTE / DELETE
    // ==========================================

    async copySelection() {
        if (this.selectionManager.selected.size === 0) return;
        
        const nodesToCopy = [];
        const idsToCopy = new Set(this.selectionManager.selected);

        this.selectionManager.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node.toJSON());
        });

        const connectionsToCopy = this.graph.connections.filter(c => 
            idsToCopy.has(c.fromNode) && idsToCopy.has(c.toNode)
        );

        const clipboardData = {
            nodes: nodesToCopy,
            connections: connectionsToCopy
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2));
        } catch (err) {
            console.error("Clipboard Error:", err);
        }
    }

    async cutSelection() {
        await this.copySelection();
        this.deleteSelected();
    }

    async pasteFromClipboard(screenX, screenY) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            
            let data;
            try { data = JSON.parse(text); } catch(e) { return; } 

            const nodes = Array.isArray(data) ? data : data.nodes;
            const connections = Array.isArray(data) ? [] : (data.connections || []);

            if (!nodes) return;

            this.selectionManager.clear();

            let minX = Infinity, minY = Infinity;
            nodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.y < minY) minY = n.y;
            });

            const rect = this.dom.container.getBoundingClientRect();
            const pasteX = (screenX - rect.left - this.graph.pan.x) / this.graph.scale;
            const pasteY = (screenY - rect.top - this.graph.pan.y) / this.graph.scale;

            const idMap = new Map();

            // 1. Create Nodes
            nodes.forEach(nodeData => {
                let template = null;

                // Handle Variable Nodes Logic
                if (nodeData.varName && window.App.variableManager) {
                    if (nodeData.functionId === 'Variable.Get') {
                        template = window.App.variableManager.createGetTemplate(nodeData.varName);
                    } else if (nodeData.functionId === 'Variable.Set') {
                        template = window.App.variableManager.createSetTemplate(nodeData.varName);
                    }
                } 
                
                // If not a variable (or variable fallback failed), try standard library
                if (!template) {
                    template = window.nodeTemplates.find(t => t.name === nodeData.name);
                }

                if (!template) return; // Cannot paste if template is missing

                const offsetX = nodeData.x - minX;
                const offsetY = nodeData.y - minY;
                
                const newNode = this.graph.addNode(template, pasteX + offsetX, pasteY + offsetY);
                idMap.set(nodeData.id, newNode.id);

                // [STEP A] Restore Pin Types
                if (nodeData.pinTypes) {
                    if (nodeData.pinTypes.inputs) {
                        nodeData.pinTypes.inputs.forEach((type, idx) => {
                            if (newNode.inputs[idx] && type && newNode.inputs[idx].type !== type) {
                                newNode.inputs[idx].setType(type);
                            }
                        });
                    }
                    if (nodeData.pinTypes.outputs) {
                        nodeData.pinTypes.outputs.forEach((type, idx) => {
                            if (newNode.outputs[idx] && type && newNode.outputs[idx].type !== type) {
                                newNode.outputs[idx].setType(type);
                            }
                        });
                    }
                }

                // [STEP B] Restore Widget Values
                if (nodeData.inputs) {
                    nodeData.inputs.forEach((savedPin, index) => {
                        const realPin = newNode.inputs[index];
                        if (realPin) {
                            realPin.value = savedPin.value;
                            if (realPin.widget) {
                                realPin.widget.value = savedPin.value;
                            }
                        }
                    });
                }

                this.renderer.createNodeElement(newNode, (e, nid) => this.handleNodeDown(e, nid));
                this.selectionManager.add(newNode.id);
            });

            // 2. Restore Connections
            connections.forEach(c => {
                const newFrom = idMap.get(c.fromNode);
                const newTo = idMap.get(c.toNode);
                if (newFrom && newTo) {
                    this.graph.addConnection(newFrom, c.fromPin, newTo, c.toPin, c.type);
                }
            });

            this.renderer.render();

        } catch (err) {
            console.error(err);
        }
    }

    deleteSelected() {
        this.selectionManager.selected.forEach(id => {
            this.graph.removeNode(id);
            const el = document.getElementById(`node-${id}`);
            if (el) el.remove();
        });
        this.selectionManager.clear();
        this.renderer.render();
    }

    // ==========================================
    // NODE SELECTION & MOVEMENT
    // ==========================================

    handleNodeDown(e, nodeId) {
        if (e.button !== 0) return;
        e.stopPropagation(); 

        if (!e.ctrlKey && !e.shiftKey && !this.selectionManager.selected.has(nodeId)) {
            this.selectionManager.clear();
        }
        this.selectionManager.add(nodeId);

        this.mode = 'DRAG_NODES';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        this.dragData.nodeOffsets.clear();

        this.selectionManager.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                this.dragData.nodeOffsets.set(id, { x: node.x, y: node.y });
            }
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
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
            }
        });
        this.renderer.render();
    }

    clearSelection() {
        this.selectedNodes.forEach(id => {
            const el = document.getElementById(`node-${id}`);
            if(el) el.classList.remove('selected');
        });
        this.selectedNodes.clear();
    }

    // ==========================================
    // WIRE & PIN INTERACTION
    // ==========================================

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
                        sourceNode: conn.fromNode, 
                        sourcePin: conn.fromPin, 
                        sourceType: 'output',
                        dataType: pin.dataset.dataType, 
                        startX: srcPos.x, startY: srcPos.y
                    };
                    this.mode = 'DRAG_WIRE';
                }
                return;
            }
        }

        const rect = pin.getBoundingClientRect();
        const cRect = this.dom.container.getBoundingClientRect();
        
        this.dragWire = {
            sourceNode: nodeId, 
            sourcePin: index, 
            sourceType: type, 
            dataType: pin.dataset.dataType,
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
        
        if (this.dragWire.sourceType === 'output') {
            this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
        } else {
            this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
        }
    }

    finishWireDrag(target) {
        const s = this.dragWire;
        const t = {
            nodeId: parseInt(target.dataset.node),
            index: parseInt(target.dataset.index),
            type: target.dataset.type,
            dataType: target.dataset.dataType
        };

        if (s.sourceNode === t.nodeId) return; 
        if (s.sourceType === t.type) return;   

        if (s.dataType !== 'wildcard' && t.dataType === 'wildcard') {
            const targetNode = this.graph.nodes.find(n => n.id === t.nodeId);
            if (targetNode) {
                targetNode.inputs.forEach(p => p.setType(s.dataType));
                targetNode.outputs.forEach(p => p.setType(s.dataType));
                t.dataType = s.dataType; 
                this.renderer.refreshNode(targetNode);
            }
        }
        else if (s.dataType === 'wildcard' && t.dataType !== 'wildcard') {
            const sourceNode = this.graph.nodes.find(n => n.id === s.sourceNode);
            if (sourceNode) {
                sourceNode.inputs.forEach(p => p.setType(t.dataType));
                sourceNode.outputs.forEach(p => p.setType(t.dataType));
                s.dataType = t.dataType; 
                this.renderer.refreshNode(sourceNode);
            }
        }

        if (s.dataType !== t.dataType) {
            const srcType = s.sourceType === 'output' ? s.dataType : t.dataType;
            const tgtType = s.sourceType === 'output' ? t.dataType : s.dataType;
            
            const key = `${srcType}->${tgtType}`;
            const templateName = window.nodeConversions ? window.nodeConversions[key] : null;
            
            if (templateName && window.nodeTemplates) {
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

    showContextMenu(x, y, type, targetId, pinIndex, pinDir) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        let drawX = x; let drawY = y;
        if(x + 200 > window.innerWidth) drawX -= 200;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; 
        menu.style.top = drawY + 'px';
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
            } else {
                this.hideContextMenu();
            }
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
            liDelete.onclick = () => {
                this.deleteSelected();
                this.hideContextMenu();
            };
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
            liPaste.onclick = () => {
                this.pasteFromClipboard(x, y);
                this.hideContextMenu();
            };
            list.appendChild(liPaste);

            search.value = '';
            setTimeout(() => search.focus(), 50); 
            
            this.renderNodeList(window.nodeTemplates || []);
        }
    }

    hideContextMenu() { 
        this.dom.contextMenu.classList.remove('visible'); 
    }

    filterContextMenu(q) {
        const lower = q.toLowerCase();
        const filtered = (window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower));
        this.renderNodeList(filtered, !!q);
    }

    renderNodeList(items, isSearching = false) {
        const list = this.dom.contextList;
        if (this.dom.contextSearch.value !== '') list.innerHTML = '';
        
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
                    
                    this.renderNodeList(items, false);
                };
                list.appendChild(header);

                if (!this.collapsedCategories.has(cat)) {
                    grouped[cat].forEach(tmpl => {
                        this.createMenuItem(tmpl, list, true);
                    });
                }
            });
        } else {
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