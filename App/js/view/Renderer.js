/**
 * Renderer Class
 * Responsible for the "View" layer.
 * Handles DOM manipulation, SVG drawing for wires, and updating CSS transforms for Pan/Zoom.
 * It delegates specific Node HTML creation to the NodeRenderer helper.
 */
class Renderer {
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
        this.nodeRenderer = new NodeRenderer();
        this.dragCallback = null;

        window.addEventListener('node-refresh', (e) => {
            const node = this.graph.nodes.find(n => n.id === e.detail.nodeId);
            if (node) this.refreshNode(node);
        });
    }

    render() {
        this.updateTransform();
        this.dom.connectionsLayer.innerHTML = ''; 
        
        const pins = document.querySelectorAll('.pin');
        pins.forEach(p => p.classList.remove('connected', 'snapped'));
        document.querySelectorAll('.pin-row').forEach(r => r.classList.remove('has-connection'));

        this.graph.connections.forEach(c => {
            this.drawConnection(c);
            
            const outSelector = `.pin[data-node="${c.fromNode}"][data-index="${c.fromPin}"][data-type="output"]`;
            const inSelector = `.pin[data-node="${c.toNode}"][data-index="${c.toPin}"][data-type="input"]`;
            
            const outPin = this.dom.nodesLayer.querySelector(outSelector);
            const inPin = this.dom.nodesLayer.querySelector(inSelector);
            
            if(outPin) outPin.classList.add('connected');
            if(inPin) {
                inPin.classList.add('connected');
                inPin.closest('.pin-row')?.classList.add('has-connection');
            }
        });
    }

    createNodeElement(node, onDragCallback) {
        this.dragCallback = onDragCallback;
        const el = this.nodeRenderer.createElement(node);
        this.attachEvents(el, node);
        this.dom.nodesLayer.appendChild(el);
    }

    refreshNode(node) {
        const oldEl = document.getElementById(`node-${node.id}`);
        if (!oldEl) return;
        const newEl = this.nodeRenderer.createElement(node);
        this.attachEvents(newEl, node);
        this.dom.nodesLayer.replaceChild(newEl, oldEl);
        this.render();
    }

    attachEvents(el, node) {
        el.addEventListener('mousedown', (e) => {
            if(e.target.closest('.pin') || e.target.closest('input') || 
               e.target.closest('.node-widget') || e.target.closest('.advanced-arrow')) return;
            if(this.dragCallback) this.dragCallback(e, node.id);
        });
    }

    drawConnection(c) {
        const p1 = this.getPinPos(c.fromNode, c.fromPin, 'output');
        const p2 = this.getPinPos(c.toNode, c.toPin, 'input');
        if(p1 && p2) this.drawCurve(p1, p2, c.type, false, c.id);
    }

    drawCurve(p1, p2, type, isDrag, id = null) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dist = Math.abs(p2.x - p1.x);
        const cp = Math.max(dist * 0.5, 50); 
        const d = `M ${p1.x} ${p1.y} C ${p1.x+cp} ${p1.y}, ${p2.x-cp} ${p2.y}, ${p2.x} ${p2.y}`;
        
        path.setAttribute('d', d); 
        path.setAttribute('class', `connection ${type==='exec'?'exec':''} ${isDrag?'dragging':''}`);
        
        if (id) path.id = `conn-${id}`; 

        const col = (window.typeDefinitions[type]||{}).color || '#fff';
        path.style.stroke = col;
        
        this.dom.connectionsLayer.appendChild(path);
    }

    animateExecWire(conn) {
        const path = document.getElementById(`conn-${conn.id}`);
        if (!path) return;

        const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ball.setAttribute('r', '4');
        ball.setAttribute('class', 'exec-ball');
        this.dom.connectionsLayer.appendChild(ball);

        const duration = 1500; 
        const start = performance.now();
        const totalLen = path.getTotalLength();

        const animate = (time) => {
            const elapsed = time - start;
            const progress = Math.min(elapsed / duration, 1);
            
            const point = path.getPointAtLength(progress * totalLen);
            ball.setAttribute('cx', point.x);
            ball.setAttribute('cy', point.y);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                ball.remove(); 
            }
        };
        requestAnimationFrame(animate);
    }

    animateDataWire(conn, value) {
        const path = document.getElementById(`conn-${conn.id}`);
        if (!path) return;

        path.classList.remove('data-flow');
        void path.offsetWidth; 
        path.classList.add('data-flow');

        const totalLen = path.getTotalLength();
        const midPoint = path.getPointAtLength(totalLen * 0.5);

        let displayVal = value;
        if (typeof value === 'object' && value !== null) {
             displayVal = '{Obj}'; 
        }
        
        const label = document.createElement('div');
        label.className = 'data-value-label';
        label.innerText = displayVal;
        
        label.style.left = `${midPoint.x}px`;
        label.style.top = `${midPoint.y}px`;
        
        this.dom.nodesLayer.appendChild(label); 

        setTimeout(() => label.remove(), 2000); 
    }

    getPinPos(nid, idx, type) {
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