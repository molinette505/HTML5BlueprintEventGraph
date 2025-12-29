/**
 * Interaction Controller
 * * This class acts as the central "Orchestrator" for user input.
 * It listens for raw DOM events (mousedown, keydown, etc.) and delegates 
 * the actual logic to specialized Managers (NodeManager, ConnectionManager, etc.).
 * * It implements a simple State Machine using `this.mode` to determine 
 * how mouse movements should be interpreted (e.g., Panning vs. Dragging Nodes).
 */
class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        // =========================================================
        // 1. Instantiate Sub-Systems (The Logic Handlers)
        // =========================================================
        
        // Handles Zooming and Panning calculations
        this.viewportManager = new ViewportManager(this.graph, this.renderer, this.dom);
        
        // Handles the Set of selected nodes and visual selection box
        this.selectionManager = new SelectionManager(this.graph, this.dom);
        
        // Handles calculating node positions while dragging
        this.nodeMovementManager = new NodeMovementManager(this.graph, this.renderer, this.selectionManager);
        
        // Handles drawing wires and connecting pins
        this.connectionManager = new ConnectionManager(this.graph, this.renderer, this.dom);
        
        // Handles Copy/Paste/Cut operations
        this.clipboard = new ClipboardManager(this.graph, this.renderer, this.selectionManager, this.dom);

        // =========================================================
        // 2. Instantiate UI Managers (The Visual Handlers)
        // =========================================================

        // NodeManager: Handles creating/deleting nodes. 
        // We pass a callback so it can immediately attach interaction listeners to new DOM elements.
        this.nodeManager = new NodeManager(this.graph, this.renderer, (e, nodeId) => {
            this.handleNodeDown(e, nodeId);
        });

        // ContextMenuManager: Handles the Right-Click Menu UI.
        // We inject the specific actions (Callbacks) here so the UI doesn't need to know about the Graph.
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
                     // UX Polish: Auto-select the newly created node
                     this.selectionManager.clear();
                     this.selectionManager.add(node.id);
                },
                onDelete: (targetId) => this.deleteWithSelectionCheck(targetId),
                onCopy: () => this.clipboard.copy(),
                onCut: () => this.cutSelection(),
                onPaste: (x, y) => this.clipboard.paste(x, y),
                onPinChange: (node, pin, newType, index, dir) => {
                    // Logic to update the data model when a user changes a pin type
                    pin.setType(newType);
                    this.graph.disconnectPin(node.id, index, dir);
                    this.renderer.refreshNode(node);
                }
            }
        );

        // =========================================================
        // 3. Initialize State
        // =========================================================
        this.mode = 'IDLE'; // Modes: IDLE, PANNING, DRAG_NODES, DRAG_WIRE, BOX_SELECT
        this.dragData = { startX: 0, startY: 0, initialPan: {x:0, y:0}, nodeOffsets: new Map() };
        
        // Default to center screen to prevent "paste at 0,0" bug if mouse hasn't moved
        this.lastMousePos = { 
            x: window.innerWidth / 2, 
            y: window.innerHeight / 2 
        };

        this.bindEvents();
        this.bindKeyboardEvents();
    }

   /**
    * Main Event Loop.
    * Captures events at the container level and routes them.
    */
   bindEvents() {
        const c = this.dom.container;

        // --- MOUSE DOWN (Input Routing) ---
        c.addEventListener('mousedown', e => {
            // Always close menu on click
            this.contextMenu.hide();

            // 1. Check if user clicked a Pin (Priority #1)
            if (e.target.classList.contains('pin')) {
                return this._handlePinInteraction(e);
            }

            // 2. Check if user clicked a Node (Priority #2)
            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                return this._handleNodeInteraction(e, nodeEl);
            }

            // 3. Fallback: User clicked the Background
            if (this._isBackground(e.target)) {
                return this._handleCanvasInteraction(e);
            }
        });

        // --- MOUSE MOVE (State Update) ---
        // Uses 'this.mode' to decide which Manager needs the mouse data.
        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            
            if (this.mode === 'PANNING') this.viewportManager.updatePan(e);
            else if (this.mode === 'DRAG_NODES') this.nodeMovementManager.update(e);
            else if (this.mode === 'DRAG_WIRE') this.connectionManager.update(e);
            else if (this.mode === 'BOX_SELECT') this.selectionManager.updateBox(e);
        });

        // --- MOUSE UP (Action Commit) ---
        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                // Heuristic: If we panned, it's a drag. If we didn't move, it's a Right Click -> Open Menu.
                if (!this.viewportManager.isIntentionalDrag && e.button === 2) {
                    // Double check we aren't hovering a node/pin to prevent menu overlap
                    if(!e.target.closest('.node') && !e.target.closest('.pin')) {
                        this.contextMenu.show(e.clientX, e.clientY, 'canvas', { graph: this.graph });
                    }
                }
            }
            else if (this.mode === 'DRAG_WIRE') {
                // Check if we dropped the wire on a valid pin
                const target = e.target.closest('.pin');
                if (target) this.connectionManager.commit(target);
                this.renderer.render(); // Redraw to finalize wire
            }
            else if (this.mode === 'BOX_SELECT') {
                this.selectionManager.endBox();
            }

            // Reset State
            this.mode = 'IDLE';
            this.renderer.dom.connectionsLayer.innerHTML = ''; // Clear temporary drag lines
            this.renderer.render(); 
        });

        // --- MISC EVENTS ---
        c.addEventListener('contextmenu', e => e.preventDefault()); // Block default browser menu
        c.addEventListener('wheel', e => {
            this.viewportManager.handleZoom(e);
            this.contextMenu.hide();
        }, { passive: false });
    }

    /**
     * Handles Global Keyboard Shortcuts
     */
    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            // Don't trigger shortcuts if typing in a text field
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

    // =========================================================
    // Helpers & Logic
    // =========================================================

    /**
     * Standardizes logic for clicking a node (Select + Prepare for Drag).
     */
    handleNodeDown(e, nodeId) {
        // Handle Multi-Select Modifiers (Ctrl/Shift)
        if (!e.ctrlKey && !e.shiftKey && !this.selectionManager.selected.has(nodeId)) {
            this.selectionManager.clear();
        }
        this.selectionManager.add(nodeId);
        
        // Initialize movement logic
        this.nodeMovementManager.startDrag(e, nodeId);
        this.mode = 'DRAG_NODES';
    }

    /**
     * Smart Delete:
     * If user Right Clicks a node that IS NOT selected, delete only that node.
     * If user Right Clicks a node that IS selected, delete the whole selection group.
     */
    deleteWithSelectionCheck(targetId) {
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

    // Helper: Prevent dragging the node when user is trying to type in an input
    _isInteractiveElement(el) {
        return el.closest('.pin') || el.closest('input') || 
               el.closest('.node-widget') || el.closest('.advanced-arrow');
    }

    // Helper: Validates if the target is truly the background
    _isBackground(el) {
        return el === this.dom.container || el === this.dom.transformLayer || el.id === 'connections-layer';
    }

    // =========================================================
    // Interaction Handlers (Routing Logic)
    // =========================================================

    _handlePinInteraction(e) {
        // Right Click: Show Context Menu for Pin (Change Type)
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
        // Ignore clicks on internal widgets (inputs/sliders)
        if (this._isInteractiveElement(e.target)) return;
            
        const nodeId = parseInt(nodeEl.id.replace('node-', ''));
        
        // Right Click: Context Menu
        if (e.button === 2) { 
            // UX: If right-clicking an unselected node, select it first
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

        // Left Click: Select & Drag
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
        // Right Click: Pan Canvas
        else if (e.button === 2) {
            this.viewportManager.startPan(e);
            this.mode = 'PANNING';
        }
    }
}