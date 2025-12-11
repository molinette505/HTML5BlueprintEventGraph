/**
 * Interaction Class
 * Handles all user input: Mouse clicks, dragging, zooming, selection, and context menus.
 * Acts as the "Controller" in the MVC pattern, updating the Graph (Model) and Renderer (View).
 */
class Interaction {
    /**
     * @param {Graph} graph - The data model containing nodes and connections.
     * @param {Renderer} renderer - The view component that handles DOM/SVG updates.
     * @param {Object} dom - Cache of DOM elements (container, layers, etc).
     */
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        // --- State Management ---
        // Current interaction mode: 'IDLE', 'PANNING', 'DRAG_NODES', 'DRAG_WIRE', 'BOX_SELECT'
        this.mode = 'IDLE'; 
        
        // Set of Node IDs that are currently selected
        this.selectedNodes = new Set();
        
        // Temporary data used during dragging operations
        this.dragData = {
            startX: 0, startY: 0,       // Mouse screen coordinates at start
            initialPan: {x:0, y:0},     // Camera pan at start
            nodeOffsets: new Map()      // Map<NodeId, {x, y}> (Initial positions for multi-drag)
        };

        // Create the Selection Box DOM element (hidden by default)
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        // Context Menu position (Graph coordinates) for spawning new nodes
        this.contextMenuPos = {x:0, y:0};

        this.bindEvents();
    }

    /**
     * Attaches global event listeners to the graph container and window.
     */
    bindEvents() {
        const c = this.dom.container;

        // --- MOUSE DOWN: Entry point for most interactions ---
        c.addEventListener('mousedown', e => {
            this.hideContextMenu();

            // 1. PIN INTERACTION
            if (e.target.classList.contains('pin')) {
                if (e.altKey) {
                    this.handlePinBreak(e); // Alt+Click = Disconnect
                } else if (e.button === 0) {
                    this.handlePinDown(e);  // Left Click = Drag Wire
                }
                return;
            }

            // 2. NODE INTERACTION
            const nodeEl = e.target.closest('.node');
            if (nodeEl && e.button === 0) {
                // Extract ID from "node-123"
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                this.handleNodeDown(e, nodeId); // Select or Drag Node
                return;
            }

            // 3. BACKGROUND INTERACTION
            // Check if clicking the canvas directly (not on top of something else)
            if (e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                if (e.button === 0) {
                    this.startBoxSelect(e); // Left Click = Box Select
                } else if (e.button === 2) {
                    this.startPan(e);       // Right Click = Pan Camera
                }
            }
        });

        // --- MOUSE MOVE: Update state based on current Mode ---
        window.addEventListener('mousemove', e => {
            switch (this.mode) {
                case 'PANNING':
                    this.updatePan(e);
                    break;
                case 'DRAG_NODES':
                    this.updateNodeDrag(e);
                    break;
                case 'DRAG_WIRE':
                    this.updateWireDrag(e);
                    break;
                case 'BOX_SELECT':
                    this.updateBoxSelect(e);
                    break;
            }
        });

        // --- MOUSE UP: Commit actions or Cleanup ---
        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                // Heuristic: If mouse barely moved during right-click, treat as Context Menu request
                const dist = Math.hypot(e.clientX - this.dragData.startX, e.clientY - this.dragData.startY);
                if (dist < 5) {
                    this.showContextMenu(e.clientX, e.clientY, 'canvas');
                }
            }
            else if (this.mode === 'DRAG_WIRE') {
                // Check if we dropped on a valid pin
                const target = e.target.closest('.pin');
                if (target) this.finishWireDrag(target);
                this.renderer.render();
            }
            else if (this.mode === 'BOX_SELECT') {
                this.finishBoxSelect();
            }

            // Reset state
            this.mode = 'IDLE';
            this.renderer.dom.connectionsLayer.innerHTML = ''; // Clear temporary drag wire
            this.renderer.render(); // Redraw persistent wires
            this.selectionBox.style.display = 'none';
        });

        // Prevent default browser context menu so we can use Right Click for Panning
        c.addEventListener('contextmenu', e => e.preventDefault());

        // Zoom Handling
        c.addEventListener('wheel', e => this.handleZoom(e), { passive: false });
    }

    // ==========================================
    // NODE LAYOUT (AUTO-ARRANGE)
    // ==========================================

    /**
     * Helper to retrieve currently selected Node objects and run layout.
     */
    layoutSelected() {
        const nodes = [];
        this.selectedNodes.forEach(id => {
            const n = this.graph.nodes.find(node => node.id === id);
            if (n) nodes.push(n);
        });
        this.layoutNodes(nodes);
    }

    /**
     * Arranges the given nodes into columns based on topological depth.
     * Prevents overlap by stacking nodes vertically within each column.
     * @param {Array<Node>} nodes - The list of nodes to arrange.
     */
    layoutNodes(nodes) {
        if (!nodes || nodes.length === 0) return;

        // 1. Build Adjacency Graph (Internal only)
        // We only care about connections that exist *between* the nodes in the selection.
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const adj = new Map();
        const inDegree = new Map();
        
        nodes.forEach(n => {
            adj.set(n.id, []);
            inDegree.set(n.id, 0);
        });

        this.graph.connections.forEach(c => {
            if (nodeMap.has(c.fromNode) && nodeMap.has(c.toNode)) {
                adj.get(c.fromNode).push(c.toNode);
                inDegree.set(c.toNode, inDegree.get(c.toNode) + 1);
            }
        });

        // 2. Identify Levels (Layering via BFS / Kahn's Algorithm)
        const levels = [];
        let queue = nodes.filter(n => inDegree.get(n.id) === 0);
        
        // Handle cycles or disjoint graphs: if no clear source, pick the first one arbitrarily
        if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0]);

        const visited = new Set(queue.map(n => n.id));

        while(queue.length > 0) {
            levels.push(queue); // Add current "column" of nodes
            const nextQueue = [];
            
            queue.forEach(node => {
                const neighbors = adj.get(node.id) || [];
                neighbors.forEach(neighborId => {
                    const d = inDegree.get(neighborId) - 1;
                    inDegree.set(neighborId, d);
                    
                    // If all dependencies processed, add to next level
                    if (d <= 0 && !visited.has(neighborId)) {
                        visited.add(neighborId);
                        nextQueue.push(nodeMap.get(neighborId));
                    }
                });
            });
            
            // Cycle/Disjoint Breaking: If we have unvisited nodes but nextQueue is empty
            if (nextQueue.length === 0 && visited.size < nodes.length) {
                const unvisited = nodes.find(n => !visited.has(n.id));
                if (unvisited) {
                    visited.add(unvisited.id);
                    nextQueue.push(unvisited);
                }
            }
            
            queue = nextQueue;
        }

        // 3. Apply Positions
        // Find top-left of selection to anchor the layout
        let minX = Infinity, minY = Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
        });
        
        // If layout is called on new nodes (like initDemo), set a default start
        if (minX === Infinity) minX = 100;
        if (minY === Infinity) minY = 100;

        const COL_WIDTH = 300;
        const ROW_HEIGHT = 180; // Enough space for most nodes

        levels.forEach((levelNodes, colIndex) => {
            let currentY = minY;
            levelNodes.forEach(node => {
                node.x = minX + (colIndex * COL_WIDTH);
                node.y = currentY;
                
                // Update DOM immediately
                const el = document.getElementById(`node-${node.id}`);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
                
                currentY += ROW_HEIGHT;
            });
        });

        this.renderer.render(); // Redraw wires to match new positions
    }

    // ==========================================
    // NODE SELECTION & MOVEMENT
    // ==========================================

    /**
     * Handles clicking on a node. Manages selection state and prepares for dragging.
     */
    handleNodeDown(e, nodeId) {
        e.stopPropagation(); // Prevent background click logic
        
        // Multi-Select Logic (Shift or Ctrl adds to selection)
        // If clicking a node NOT already selected, and NOT holding modifier, clear previous selection.
        if (!e.ctrlKey && !e.shiftKey && !this.selectedNodes.has(nodeId)) {
            this.clearSelection();
        }
        this.addSelection(nodeId);

        // Switch to Drag Mode
        this.mode = 'DRAG_NODES';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        this.dragData.nodeOffsets.clear();

        // Store initial positions of ALL selected nodes relative to the mouse start
        // This ensures they move as a group
        this.selectedNodes.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                this.dragData.nodeOffsets.set(id, { x: node.x, y: node.y });
            }
        });
    }

    /**
     * Updates position of all selected nodes based on mouse delta.
     */
    updateNodeDrag(e) {
        // Calculate delta in Graph Space (screen delta / scale)
        const dx = (e.clientX - this.dragData.startX) / this.graph.scale;
        const dy = (e.clientY - this.dragData.startY) / this.graph.scale;

        this.dragData.nodeOffsets.forEach((initialPos, id) => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                node.x = initialPos.x + dx;
                node.y = initialPos.y + dy;
                // Direct DOM update for performance (avoids full re-render loop)
                const el = document.getElementById(`node-${id}`);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
            }
        });
        this.renderer.render(); // Re-draw connected wires
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

    // ==========================================
    // BOX SELECTION
    // ==========================================

    startBoxSelect(e) {
        // Clear existing selection unless holding modifier
        if (!e.ctrlKey && !e.shiftKey) this.clearSelection();
        
        this.mode = 'BOX_SELECT';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        
        // Initialize visual box
        this.selectionBox.style.left = e.clientX + 'px';
        this.selectionBox.style.top = e.clientY + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
    }

    updateBoxSelect(e) {
        // Calculate box dimensions (handling negative drag directions)
        const x = Math.min(e.clientX, this.dragData.startX);
        const y = Math.min(e.clientY, this.dragData.startY);
        const w = Math.abs(e.clientX - this.dragData.startX);
        const h = Math.abs(e.clientY - this.dragData.startY);

        // Update Visuals
        this.selectionBox.style.left = x + 'px';
        this.selectionBox.style.top = y + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';

        // Collision Detection (Box vs Nodes)
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
                // Only deselect if not holding Ctrl (allows adding to selection)
                this.selectedNodes.delete(node.id);
                el.classList.remove('selected');
            }
        });
    }

    finishBoxSelect() {
        this.selectionBox.style.display = 'none';
    }

    // ==========================================
    // PANNING & ZOOM
    // ==========================================

    startPan(e) {
        this.mode = 'PANNING';
        this.dragData.startX = e.clientX;
        this.dragData.startY = e.clientY;
        this.dragData.initialPan = { ...this.graph.pan };
    }

    updatePan(e) {
        // Simple 1:1 movement
        this.graph.pan.x = this.dragData.initialPan.x + (e.clientX - this.dragData.startX);
        this.graph.pan.y = this.dragData.initialPan.y + (e.clientY - this.dragData.startY);
        this.renderer.updateTransform();
    }

    handleZoom(e) {
        e.preventDefault();
        
        // 1. Get mouse position relative to container
        const rect = this.dom.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 2. Calculate New Scale
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldScale = this.graph.scale;
        const newScale = Math.min(Math.max(0.2, oldScale + delta), 3); // Clamp zoom

        // 3. Zoom towards mouse pointer logic:
        // Move the pan offset so that the point under the mouse remains in the same screen location
        this.graph.pan.x = mouseX - (mouseX - this.graph.pan.x) * (newScale / oldScale);
        this.graph.pan.y = mouseY - (mouseY - this.graph.pan.y) * (newScale / oldScale);
        this.graph.scale = newScale;

        this.renderer.updateTransform();
        this.hideContextMenu();
    }

    // ==========================================
    // WIRE & PIN INTERACTION
    // ==========================================

    /**
     * Alt + Click on a pin: Deletes all connections to/from that pin.
     */
    handlePinBreak(e) {
        const pin = e.target;
        this.graph.disconnectPin(
            parseInt(pin.dataset.node), 
            parseInt(pin.dataset.index), 
            pin.dataset.type
        );
        this.renderer.render();
    }

    /**
     * Starts dragging a wire from a pin.
     * Handles "Disconnect and Drag" logic if clicking an occupied Input.
     */
    handlePinDown(e) {
        e.stopPropagation();
        const pin = e.target;
        const nodeId = parseInt(pin.dataset.node);
        const index = parseInt(pin.dataset.index);
        const type = pin.dataset.type;
        
        // LOGIC: If clicking an Input Pin that IS connected...
        if (type === 'input') {
            const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPin === index);
            if (conn) {
                // 1. Delete the existing connection
                this.graph.removeConnection(conn.id);
                this.renderer.render();
                
                // 2. Start dragging from the Output pin (the other end of the wire)
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

        // STANDARD LOGIC: Start new wire from this pin
        const rect = pin.getBoundingClientRect();
        const cRect = this.dom.container.getBoundingClientRect();
        
        this.dragWire = {
            sourceNode: nodeId, 
            sourcePin: index, 
            sourceType: type, 
            dataType: pin.dataset.dataType,
            // Calculate start pos in Graph Space
            startX: (rect.left + rect.width/2 - cRect.left - this.graph.pan.x)/this.graph.scale,
            startY: (rect.top + rect.height/2 - cRect.top - this.graph.pan.y)/this.graph.scale
        };
        this.mode = 'DRAG_WIRE';
    }

    updateWireDrag(e) {
        const rect = this.dom.container.getBoundingClientRect();
        // Calculate mouse pos in Graph Space
        const mx = (e.clientX - rect.left - this.graph.pan.x)/this.graph.scale;
        const my = (e.clientY - rect.top - this.graph.pan.y)/this.graph.scale;
        
        // Redraw existing wires
        this.renderer.dom.connectionsLayer.innerHTML = '';
        this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
        
        // Draw the temporary dragging wire
        const p1 = {x: this.dragWire.startX, y: this.dragWire.startY};
        const p2 = {x: mx, y: my};
        
        // Determine curve direction based on source type
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

        // Validation Rules
        if (s.sourceNode === t.nodeId) return; // Cannot connect to self
        if (s.sourceType === t.type) return;   // Cannot connect Output-to-Output
        // if (s.dataType !== t.dataType) return; // (Previously blocked mismatched types)
        
        // [FIX] Allow Wildcard connections to resolve automatically
        // If one is wildcard and other is specific, it's valid. 
        // Logic handled in Editor or Graph? For now, we trust Interaction to allow the drop, 
        // but maybe we should trigger the type-set here.
        // NOTE: The user requested a "layout function". The wildcard fix was in Editor.js.
        
        // Normalize Connection (Always From -> To)
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }

    // ==========================================
    // CONTEXT MENU
    // ==========================================

    showContextMenu(x, y, type, targetId) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        // Boundary Check (keep menu within window)
        let drawX = x; let drawY = y;
        if(x + 200 > window.innerWidth) drawX -= 200;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; 
        menu.style.top = drawY + 'px';
        menu.classList.add('visible');

        // Store Graph Position for spawning nodes later
        const rect = this.dom.container.getBoundingClientRect();
        this.contextMenuPos = {
            x: (x - rect.left - this.graph.pan.x)/this.graph.scale,
            y: (y - rect.top - this.graph.pan.y)/this.graph.scale
        };

        list.innerHTML = '';
        
        if (type === 'node') {
            // Node Context Menu
            search.style.display = 'none';
            
            // "Selection Aware" Delete Text
            const count = this.selectedNodes.size > 1 && this.selectedNodes.has(targetId) ? this.selectedNodes.size : 1;
            const label = count > 1 ? `Delete ${count} Nodes` : `Delete Node`;
            
            const liDelete = document.createElement('li');
            liDelete.className = 'ctx-item';
            liDelete.innerHTML = `<span style="color:var(--danger-color)">${label}</span>`;
            liDelete.onclick = () => {
                // Delete logic
                const nodesToDelete = count > 1 ? Array.from(this.selectedNodes) : [targetId];
                nodesToDelete.forEach(id => {
                    this.graph.removeNode(id);
                    const el = document.getElementById(`node-${id}`);
                    if(el) el.remove();
                });
                this.selectedNodes.clear();
                this.renderer.render(); // Redraw wires
                this.hideContextMenu();
            };
            list.appendChild(liDelete);

            // [NEW] Auto Layout Option
            // Only show if we have nodes selected
            const liLayout = document.createElement('li');
            liLayout.className = 'ctx-item';
            liLayout.innerHTML = `<span>Auto Layout</span>`;
            liLayout.onclick = () => {
                // If the clicked node is not in selection, select it first
                if (!this.selectedNodes.has(targetId)) {
                    this.clearSelection();
                    this.addSelection(targetId);
                }
                this.layoutSelected();
                this.hideContextMenu();
            };
            list.appendChild(liLayout);

        } else {
            // Background Context Menu (Spawn Node)
            search.style.display = 'block';
            search.value = '';
            setTimeout(() => search.focus(), 50); // Auto-focus search input
            this.renderNodeList(window.nodeTemplates || []);
        }
    }

    hideContextMenu() { 
        this.dom.contextMenu.classList.remove('visible'); 
    }

    filterContextMenu(q) {
        const lower = q.toLowerCase();
        // Filter templates based on name
        const filtered = (window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower));
        this.renderNodeList(filtered);
    }

    renderNodeList(items) {
        const list = this.dom.contextList;
        list.innerHTML = '';
        items.forEach(tmpl => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            const isFlow = (tmpl.outputs||[]).some(o=>o.type==='exec');
            // Display Name + Category hint (Flow vs Data)
            li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow?'Flow':'Data'}</span>`;
            
            li.onclick = () => {
                const n = this.graph.addNode(tmpl, this.contextMenuPos.x, this.contextMenuPos.y);
                // Manually trigger drag start so user can place it immediately? (Optional)
                this.renderer.createNodeElement(n, (e, nid) => this.handleNodeDown(e, nid));
                this.hideContextMenu();
            };
            list.appendChild(li);
        });
    }
}