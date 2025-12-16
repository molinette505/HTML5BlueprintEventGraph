/**
 * Renderer Class
 * Responsible for the "View" layer.
 * Handles DOM manipulation, SVG drawing for wires, and updating CSS transforms for Pan/Zoom.
 * It delegates specific Node HTML creation to the NodeRenderer helper.
 */
class Renderer {
    /**
     * @param {Graph} graph - The data model to render.
     * @param {Object} dom - Cache of DOM elements (container, layers, etc).
     */
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
        
        // Helper class to build the actual HTML for a node
        this.nodeRenderer = new NodeRenderer();
        
        // Store the drag callback so we can re-attach it when refreshing nodes
        this.dragCallback = null;

        // Listen for requests to redraw a specific node (e.g., expanding advanced pins)
        window.addEventListener('node-refresh', (e) => {
            const node = this.graph.nodes.find(n => n.id === e.detail.nodeId);
            if (node) this.refreshNode(node);
        });
    }

    /**
     * Main Render Loop.
     * 1. Updates Pan/Zoom CSS.
     * 2. Clears and Redraws all wires (SVG).
     * 3. Updates Pin visual states (connected style).
     * Note: It does NOT redraw nodes every frame (performance optimization). Nodes are DOM elements.
     */
    render() {
        this.updateTransform();
        
        // Clear existing wires
        this.dom.connectionsLayer.innerHTML = ''; 
        
        // Reset pin visual states
        const pins = document.querySelectorAll('.pin');
        pins.forEach(p => p.classList.remove('connected', 'snapped'));
        document.querySelectorAll('.pin-row').forEach(r => r.classList.remove('has-connection'));

        // Draw every active connection in the graph
        this.graph.connections.forEach(c => {
            this.drawConnection(c);
            
            // Find the specific DOM elements for the From/To pins
            const outSelector = `.pin[data-node="${c.fromNode}"][data-index="${c.fromPin}"][data-type="output"]`;
            const inSelector = `.pin[data-node="${c.toNode}"][data-index="${c.toPin}"][data-type="input"]`;
            
            const outPin = this.dom.nodesLayer.querySelector(outSelector);
            const inPin = this.dom.nodesLayer.querySelector(inSelector);
            
            // Apply CSS classes to hide widgets or change color
            if(outPin) outPin.classList.add('connected');
            if(inPin) {
                inPin.classList.add('connected');
                inPin.closest('.pin-row')?.classList.add('has-connection');
            }
        });
    }

    /**
     * Creates the DOM element for a new Node and adds it to the screen.
     * @param {Node} node - The Node Model object.
     * @param {Function} onDragCallback - Function to call when user tries to drag this node.
     */
    createNodeElement(node, onDragCallback) {
        this.dragCallback = onDragCallback; // Cache for later use
        const el = this.nodeRenderer.createElement(node);
        this.attachEvents(el, node);
        this.dom.nodesLayer.appendChild(el);
    }

    /**
     * Re-renders a specific node in place.
     * Used when node state changes (e.g., expanding Advanced Pins).
     */
    refreshNode(node) {
        const oldEl = document.getElementById(`node-${node.id}`);
        if (!oldEl) return;
        
        // Create new HTML structure
        const newEl = this.nodeRenderer.createElement(node);
        
        // Re-attach listeners
        this.attachEvents(newEl, node);
        
        // Swap in DOM
        this.dom.nodesLayer.replaceChild(newEl, oldEl);
        
        // Trigger full render to update wire positions attached to this node
        this.render();
    }

    /**
     * Attaches the MouseDown event for node dragging.
     * Includes logic to preventing dragging if clicking on a Pin, Input, or Arrow.
     */
    attachEvents(el, node) {
        el.addEventListener('mousedown', (e) => {
            // Stop drag if clicking interactive elements
            if(e.target.closest('.pin') || e.target.closest('input') || 
               e.target.closest('.node-widget') || e.target.closest('.advanced-arrow')) return;
            
            if(this.dragCallback) this.dragCallback(e, node.id);
        });
    }

    /**
     * Calculates positions and draws a wire for a Connection object.
     */
    drawConnection(c) {
        const p1 = this.getPinPos(c.fromNode, c.fromPin, 'output');
        const p2 = this.getPinPos(c.toNode, c.toPin, 'input');
        
        // Only draw if both endpoints exist in the DOM
        if(p1 && p2) this.drawCurve(p1, p2, c.type, false, c.id);
    }

    /**
     * Generates and appends the SVG Path for a wire.
     * @param {Object} p1 - Start {x,y}
     * @param {Object} p2 - End {x,y}
     * @param {String} type - Data Type (for color)
     * @param {Boolean} isDrag - If true, adds special styling
     * @param {Number} id - Optional Connection ID to assign to the DOM element
     */
    drawCurve(p1, p2, type, isDrag, id = null) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Bezier Curve Logic
        const dist = Math.abs(p2.x - p1.x);
        // Control Point Offset: Smoothness based on distance
        const cp = Math.max(dist * 0.5, 50); 
        
        // SVG Path Command (M = Move, C = Cubic Bezier)
        const d = `M ${p1.x} ${p1.y} C ${p1.x+cp} ${p1.y}, ${p2.x-cp} ${p2.y}, ${p2.x} ${p2.y}`;
        
        path.setAttribute('d', d); 
        path.setAttribute('class', `connection ${type==='exec'?'exec':''} ${isDrag?'dragging':''}`);
        
        if (id) path.id = `conn-${id}`; // Assign ID for animation lookups

        // Set Color
        const col = (window.typeDefinitions[type]||{}).color || '#fff';
        path.style.stroke = col;
        
        this.dom.connectionsLayer.appendChild(path);
    }

    /**
     * ANIMATION: Moves a glowing ball along the execution wire.
     */
    animateExecWire(conn) {
        const path = document.getElementById(`conn-${conn.id}`);
        if (!path) return;

        // Create the Ball
        const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ball.setAttribute('r', '4');
        ball.setAttribute('class', 'exec-ball');
        this.dom.connectionsLayer.appendChild(ball);

        // Animation Logic
        const duration = 1500; // 1.5 seconds match simulation delay
        const start = performance.now();
        const totalLen = path.getTotalLength();

        const animate = (time) => {
            const elapsed = time - start;
            const progress = Math.min(elapsed / duration, 1);
            
            // Move ball along path
            const point = path.getPointAtLength(progress * totalLen);
            ball.setAttribute('cx', point.x);
            ball.setAttribute('cy', point.y);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                ball.remove(); // Cleanup
            }
        };
        requestAnimationFrame(animate);
    }

    /**
     * ANIMATION: Flashes the wire and floats the data value above it.
     */
    animateDataWire(conn, value) {
        const path = document.getElementById(`conn-${conn.id}`);
        if (!path) return;

        // 1. Flash the wire
        path.classList.remove('data-flow');
        void path.offsetWidth; // Trigger reflow
        path.classList.add('data-flow');

        // 2. Create Floating Label
        const totalLen = path.getTotalLength();
        const midPoint = path.getPointAtLength(totalLen * 0.5);

        // The simulation now passes a formatted string from FunctionRegistry.
        // We only do a sanity check here.
        let displayVal = value;
        if (typeof value === 'object' && value !== null) {
             // Fallback if registry didn't format it
             displayVal = '{Obj}'; 
        }
        
        const label = document.createElement('div');
        label.className = 'data-value-label';
        label.innerText = displayVal;
        
        // Position in the transform layer so it moves with the graph
        label.style.left = `${midPoint.x}px`;
        label.style.top = `${midPoint.y}px`;
        
        // --- NEW STYLE OVERRIDES ---
        // Ensure newlines are respected and text is centered
        label.style.whiteSpace = 'pre';
        label.style.textAlign = 'center';
        label.style.zIndex = '200'; // Ensure it floats above nodes
        
        this.dom.nodesLayer.appendChild(label); 

        // CSS Animation handles movement and removal (fade out).
        setTimeout(() => label.remove(), 2000); 
    }

    /**
     * Calculates the exact center of a pin in "Graph Space".
     * Converts DOM Client Rect (Screen Pixels) -> Graph Coordinates (Pan/Zoom adjusted).
     */
    getPinPos(nid, idx, type) {
        const selector = `.pin[data-node="${nid}"][data-index="${idx}"][data-type="${type}"]`;
        const el = this.dom.nodesLayer.querySelector(selector);
        
        if(!el) return null;
        
        const r = el.getBoundingClientRect();
        const c = this.dom.container.getBoundingClientRect();
        
        return { 
            // Formula: (PinScreenPos - ContainerPos - PanOffset) / ZoomScale
            x: (r.left + r.width/2 - c.left - this.graph.pan.x) / this.graph.scale, 
            y: (r.top + r.height/2 - c.top - this.graph.pan.y) / this.graph.scale 
        };
    }

    /**
     * Updates the CSS Transform of the main layers to reflect Pan/Zoom state.
     * [FIX] Now properly sets multiple background sizes to support the sub-grid.
     */
    updateTransform() {
        // Move the layer holding Nodes and Wires
        this.dom.transformLayer.style.transform = `translate(${this.graph.pan.x}px, ${this.graph.pan.y}px) scale(${this.graph.scale})`;
        
        // Move the background grid 
        this.dom.container.style.backgroundPosition = `${this.graph.pan.x}px ${this.graph.pan.y}px`;
        
        // Scale the grid sizes
        // Major grid (100px base)
        const sMaj = this.graph.scale * 100;
        // Sub grid (20px base)
        const sMin = this.graph.scale * 20;
        
        // Apply list of sizes matching the 4-layer gradients in graph.css
        // (Major Horizontal, Major Vertical, Minor Horizontal, Minor Vertical)
        this.dom.container.style.backgroundSize = `${sMaj}px ${sMaj}px, ${sMaj}px ${sMaj}px, ${sMin}px ${sMin}px, ${sMin}px ${sMin}px`;
    }
}