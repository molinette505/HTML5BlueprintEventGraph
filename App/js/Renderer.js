class Renderer {
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
        // CHANGE: Initialize the helper
        this.nodeRenderer = new NodeRenderer();
    }

    render() {
        this.updateTransform();
        this.dom.connectionsLayer.innerHTML = ''; 
        
        // Reset visual states
        const pins = document.querySelectorAll('.pin');
        pins.forEach(p => p.classList.remove('connected', 'snapped'));
        document.querySelectorAll('.pin-row').forEach(r => r.classList.remove('has-connection'));

        // Draw connections
        this.graph.connections.forEach(c => {
            this.drawConnection(c);
            
            // Mark pins as connected (Visual feedback)
            // Note: We use the selector attributes set by NodeRenderer
            const outPin = this.dom.nodesLayer.querySelector(`.pin[data-node="${c.fromNode}"][data-index="${c.fromPin}"][data-type="output"]`);
            const inPin = this.dom.nodesLayer.querySelector(`.pin[data-node="${c.toNode}"][data-index="${c.toPin}"][data-type="input"]`);
            
            if(outPin) outPin.classList.add('connected');
            if(inPin) {
                inPin.classList.add('connected');
                inPin.closest('.pin-row')?.classList.add('has-connection');
            }
        });
    }

    createNodeElement(node, onDragCallback) {
        // CHANGE: Use the NodeRenderer to build the DOM
        const el = this.nodeRenderer.createElement(node);

        // Attach the Drag Event (Logic from Editor/Interaction)
        el.addEventListener('mousedown', (e) => {
            if(e.target.closest('.pin') || e.target.closest('input') || e.target.closest('.node-widget')) return;
            onDragCallback(e, node.id);
        });

        this.dom.nodesLayer.appendChild(el);
    }

    drawConnection(c) {
        const p1 = this.getPinPos(c.fromNode, c.fromPin, 'output');
        const p2 = this.getPinPos(c.toNode, c.toPin, 'input');
        if(p1 && p2) this.drawCurve(p1, p2, c.type);
    }

    drawCurve(p1, p2, type, isDrag) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dist = Math.abs(p2.x - p1.x);
        const cp = Math.max(dist * 0.5, 50);
        const d = `M ${p1.x} ${p1.y} C ${p1.x+cp} ${p1.y}, ${p2.x-cp} ${p2.y}, ${p2.x} ${p2.y}`;
        path.setAttribute('d', d); 
        path.setAttribute('class', `connection ${type==='exec'?'exec':''} ${isDrag?'dragging':''}`);
        
        const col = (window.typeDefinitions[type]||{}).color || '#fff';
        path.style.stroke = col;
        
        this.dom.connectionsLayer.appendChild(path);
    }

    getPinPos(nid, idx, type) {
        // Use the dataset attributes that NodeRenderer set up
        const selector = `.pin[data-node="${nid}"][data-index="${idx}"][data-type="${type}"]`;
        const el = this.dom.nodesLayer.querySelector(selector);
        
        if(!el) return null;
        
        const r = el.getBoundingClientRect();
        const c = this.dom.container.getBoundingClientRect();
        
        return { 
            x: (r.left + r.width/2 - c.left - this.graph.pan.x) / this.graph.scale, 
            y: (r.top + r.height/2 - c.top - this.graph.pan.y) / this.graph.scale 
        };
    }

    updateTransform() {
        this.dom.transformLayer.style.transform = `translate(${this.graph.pan.x}px, ${this.graph.pan.y}px) scale(${this.graph.scale})`;
        this.dom.container.style.backgroundPosition = `${this.graph.pan.x}px ${this.graph.pan.y}px`;
        const s = this.graph.scale * 100;
        this.dom.container.style.backgroundSize = `${s}px ${s}px`;
    }
}