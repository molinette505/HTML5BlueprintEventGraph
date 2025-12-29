class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        // 1. Instantiate Helpers
        this.viewportManager = new ViewportManager(this.graph, this.renderer, this.dom);
        this.selectionManager = new SelectionManager(this.graph, this.dom);
        this.nodeMovementManager = new NodeMovementManager(this.graph, this.renderer, this.selectionManager);
        this.connectionManager = new ConnectionManager(this.graph, this.renderer, this.dom);
        this.clipboard = new ClipboardManager(this.graph, this.renderer, this.selectionManager, this.dom);

        // 2. Instantiate New Managers
        
        // NodeManager needs a callback to re-attach listeners when a node is created
        this.nodeManager = new NodeManager(this.graph, this.renderer, (e, nodeId) => {
            this.handleNodeDown(e, nodeId);
        });

        // ContextMenuManager needs callbacks for actions
        this.contextMenu = new ContextMenuManager(
            { 
                menu: dom.contextMenu, 
                list: dom.contextList, 
                search: dom.contextSearch,
                container: dom.container
            }, 
            {
                onSpawn: (tmpl, x, y) => {
                     const node = this.nodeManager.createNode(tmpl, x, y);
                     // Optional: auto-select new node
                     this.selectionManager.clear();
                     this.selectionManager.add(node.id);
                },
                onDelete: (targetId) => this.deleteWithSelectionCheck(targetId),
                onCopy: () => this.clipboard.copy(),
                onCut: () => this.cutSelection(),
                onPaste: (x, y) => this.clipboard.paste(x, y),
                onPinChange: (node, pin, newType, index, dir) => {
                    pin.setType(newType);
                    this.graph.disconnectPin(node.id, index, dir);
                    this.renderer.refreshNode(node);
                }
            }
        );

        // State
        this.mode = 'IDLE'; 
        this.dragData = { startX: 0, startY: 0, initialPan: {x:0, y:0}, nodeOffsets: new Map() };
        this.lastMousePos = { 
            x: window.innerWidth / 2, 
            y: window.innerHeight / 2 
        };

        this.bindEvents();
        this.bindKeyboardEvents();
    }

   bindEvents() {
        const c = this.dom.container;

        // 1. Mouse Down: Delegate to specific handlers
        c.addEventListener('mousedown', e => {
            this.contextMenu.hide();

            // A. Pin Interaction?
            if (e.target.classList.contains('pin')) {
                return this._handlePinInteraction(e);
            }

            // B. Node Interaction?
            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                return this._handleNodeInteraction(e, nodeEl);
            }

            // C. Canvas (Background) Interaction?
            if (this._isBackground(e.target)) {
                return this._handleCanvasInteraction(e);
            }
        });

        // 2. Global Move (kept simple for now)
        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            if (this.mode === 'PANNING') this.viewportManager.updatePan(e);
            else if (this.mode === 'DRAG_NODES') this.nodeMovementManager.update(e);
            else if (this.mode === 'DRAG_WIRE') this.connectionManager.update(e);
            else if (this.mode === 'BOX_SELECT') this.selectionManager.updateBox(e);
        });

        // 3. Global Up
        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                if (!this.viewportManager.isIntentionalDrag && e.button === 2) {
                    if(!e.target.closest('.node') && !e.target.closest('.pin')) {
                        this.contextMenu.show(e.clientX, e.clientY, 'canvas', { graph: this.graph });
                    }
                }
            }
            else if (this.mode === 'DRAG_WIRE') {
                const target = e.target.closest('.pin');
                if (target) this.connectionManager.commit(target);
                this.renderer.render();
            }
            else if (this.mode === 'BOX_SELECT') {
                this.selectionManager.endBox();
            }

            this.mode = 'IDLE';
            this.renderer.dom.connectionsLayer.innerHTML = ''; 
            this.renderer.render(); 
        });

        // 4. Other
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel', e => {
            this.viewportManager.handleZoom(e);
            this.contextMenu.hide();
        }, { passive: false });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); this.clipboard.copy(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); this.clipboard.paste(this.lastMousePos.x, this.lastMousePos.y); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') { this.cutSelection(); }
            if (['Delete', 'Backspace'].includes(e.key)) { 
                if (this.selectionManager.selected.size > 0) this.nodeManager.deleteNodes(this.selectionManager.selected); 
                this.selectionManager.clear();
            }
        });
    }

    // --- Helpers ---

    handleNodeDown(e, nodeId) {
        // Standard selection behavior (Click vs Shift+Click vs Ctrl+Click)
        if (!e.ctrlKey && !e.shiftKey && !this.selectionManager.selected.has(nodeId)) {
            this.selectionManager.clear();
        }
        this.selectionManager.add(nodeId);
        
        // Tell movement manager to start tracking
        this.nodeMovementManager.startDrag(e, nodeId);
        this.mode = 'DRAG_NODES';
    }

    deleteWithSelectionCheck(targetId) {
        // If we right-clicked a specific node that wasn't selected, delete only that one
        // Otherwise, delete the whole selection
        if (this.selectionManager.selected.size > 1 && this.selectionManager.selected.has(targetId)) {
            this.nodeManager.deleteNodes(this.selectionManager.selected);
        } else {
            this.nodeManager.deleteNodes([targetId]);
        }
        this.selectionManager.clear();
    }

    async cutSelection() {
        const success = await this.clipboard.cut();
        if (success) {
            this.nodeManager.deleteNodes(this.selectionManager.selected);
            this.selectionManager.clear();
        }
    }

    _isInteractiveElement(el) {
        return el.closest('.pin') || el.closest('input') || 
               el.closest('.node-widget') || el.closest('.advanced-arrow');
    }

    _isBackground(el) {
        return el === this.dom.container || el === this.dom.transformLayer || el.id === 'connections-layer';
    }

    // --- Interaction Handlers ---

    _handlePinInteraction(e) {
        // Right Click: Show Context Menu
        if (e.button === 2) { 
            const pin = e.target;
            this.contextMenu.show(e.clientX, e.clientY, 'pin', { 
                graph: this.graph,
                targetId: parseInt(pin.dataset.node), 
                pinIndex: parseInt(pin.dataset.index), 
                pinDir: pin.dataset.type 
            });
            return;
        }

        // Alt + Click: Break Connections
        if (e.altKey) {
            this.connectionManager.breakConnection(e.target);
            return;
        } 
        
        // Left Click: Start Dragging Wire
        if (e.button === 0) {
            this.connectionManager.startDrag(e);
            this.mode = 'DRAG_WIRE';
        }
    }

    _handleNodeInteraction(e, nodeEl) {
        // Ignore clicks on widgets/inputs inside the node
        if (this._isInteractiveElement(e.target)) return;
            
        const nodeId = parseInt(nodeEl.id.replace('node-', ''));
        
        // Right Click: Selection Logic + Context Menu
        if (e.button === 2) { 
            // If right-clicking a node that isn't selected, select ONLY that node first
            if (!this.selectionManager.selected.has(nodeId)) {
                this.selectionManager.clear();
                this.selectionManager.add(nodeId);
            }
            
            this.contextMenu.show(e.clientX, e.clientY, 'node', { 
                targetId: nodeId,
                selectedCount: this.selectionManager.selected.size 
            });
            return;
        }

        // Left Click: Select + Start Drag
        if (e.button === 0) { 
            this.handleNodeDown(e, nodeId);
        }
    }

    _handleCanvasInteraction(e) {
        // Left Click: Box Selection
        if (e.button === 0) {
            this.selectionManager.startBox(e);
            this.mode = 'BOX_SELECT';
        } 
        // Right Click: Pan
        else if (e.button === 2) {
            this.viewportManager.startPan(e);
            this.mode = 'PANNING';
        }
    }
}