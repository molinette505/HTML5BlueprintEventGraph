class Renderer {
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
    }

    render() {
        this.updateTransform();
        this.dom.connectionsLayer.innerHTML = ''; 
        
        // Reset classes
        const pins = document.querySelectorAll('.pin');
        pins.forEach(p => p.classList.remove('connected', 'snapped'));
        document.querySelectorAll('.pin-row').forEach(r => r.classList.remove('has-connection'));

        this.graph.connections.forEach(c => {
            this.drawConnection(c);
            
            // Update Visual State (Connected)
            const outPin = this.dom.nodesLayer.querySelector(`.pin[data-node="${c.fromNode}"][data-index="${c.fromPin}"][data-type="output"]`);
            const inPin = this.dom.nodesLayer.querySelector(`.pin[data-node="${c.toNode}"][data-index="${c.toPin}"][data-type="input"]`);
            
            if(outPin) outPin.classList.add('connected');
            if(inPin) {
                inPin.classList.add('connected');
                inPin.closest('.pin-row')?.classList.add('has-connection');
            }
        });
    }

    createNodeElement(node, onDrag) {
        const el = document.createElement('div');
        el.className = `node ${node.config.hideHeader ? 'compact' : ''}`;
        el.id = `node-${node.id}`;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        if(node.config.width) el.style.width = node.config.width + 'px';
        if(node.config.color) el.style.setProperty('--header-bg', node.config.color);

        if (!node.config.hideHeader) {
            const header = document.createElement('div');
            header.className = 'node-header';
            header.innerText = node.config.name;
            header.style.background = node.config.color || '#444';
            el.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = 'node-body';

        const left = document.createElement('div'); left.className = 'col col-left';
        const right = document.createElement('div'); right.className = 'col col-right';
        const center = document.createElement('div'); center.className = 'col col-center';

        if (node.config.centerLabel) {
            const lbl = document.createElement('div');
            lbl.className = 'center-label';
            lbl.innerText = node.config.centerLabel;
            center.appendChild(lbl);
        }

        (node.config.inputs||[]).forEach((p,i) => left.appendChild(this.createPin(node.id, i, p, 'input')));
        (node.config.outputs||[]).forEach((p,i) => right.appendChild(this.createPin(node.id, i, p, 'output')));

        body.append(left, center, right);
        el.appendChild(body);

        // NODE DRAG EVENT
        el.addEventListener('mousedown', (e) => {
            if(e.target.closest('.pin') || e.target.closest('input') || e.target.closest('.node-widget')) return;
            onDrag(e, node.id);
        });

        this.dom.nodesLayer.appendChild(el);
    }

    createPin(nid, idx, cfg, type) {
        const row = document.createElement('div'); row.className = 'pin-row';
        const pin = document.createElement('div'); 
        pin.className = `pin ${cfg.type}`;
        pin.dataset.node = nid;
        pin.dataset.index = idx;
        pin.dataset.type = type;
        pin.dataset.dataType = cfg.type;

        const typeDef = window.typeDefinitions[cfg.type] || {color: '#999'};
        pin.style.setProperty('--pin-color', typeDef.color);

        const lbl = document.createElement('span'); 
        lbl.className = 'pin-label'; 
        lbl.innerText = cfg.name || '';

        const widget = this.createWidget(cfg);

        if(type === 'input') { 
            row.appendChild(pin); 
            if(cfg.name) row.appendChild(lbl);
            if(widget) row.appendChild(widget);
        } else { 
            if(cfg.name) row.appendChild(lbl); 
            row.appendChild(pin); 
        }
        return row;
    }

    createWidget(config) {
        const typeConf = window.typeDefinitions[config.type];
        if(!typeConf || !typeConf.widget || typeConf.widget === 'none') return null;
        
        const stop = (el) => {
            el.addEventListener('mousedown', e => e.stopPropagation());
        };

        if (typeConf.widget === 'text') {
            const inp = document.createElement('input');
            inp.className = 'node-widget';
            inp.value = config.default || '';
            inp.style.width = '60px';
            stop(inp);
            return inp;
        }
        if (typeConf.widget === 'number') {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.className = 'node-widget';
            inp.value = config.default || 0;
            inp.style.width = '40px';
            stop(inp);
            return inp;
        }
        if (typeConf.widget === 'checkbox') {
            const inp = document.createElement('input');
            inp.type = 'checkbox';
            stop(inp);
            return inp;
        }
        if (typeConf.widget === 'vector3') {
            const wrap = document.createElement('div');
            wrap.className = 'widget-vec3';
            ['X','Y','Z'].forEach(l => {
                const i = document.createElement('input');
                i.placeholder = l; stop(i);
                wrap.appendChild(i);
            });
            return wrap;
        }
        return null;
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
        const el = this.dom.nodesLayer.querySelector(`.pin[data-node="${nid}"][data-index="${idx}"][data-type="${type}"]`);
        if(!el) return null;
        const r = el.getBoundingClientRect();
        const c = this.dom.container.getBoundingClientRect();
        return { 
            x: (r.left+r.width/2 - c.left - this.graph.pan.x)/this.graph.scale, 
            y: (r.top+r.height/2 - c.top - this.graph.pan.y)/this.graph.scale 
        };
    }

    updateTransform() {
        this.dom.transformLayer.style.transform = `translate(${this.graph.pan.x}px, ${this.graph.pan.y}px) scale(${this.graph.scale})`;
        this.dom.container.style.backgroundPosition = `${this.graph.pan.x}px ${this.graph.pan.y}px`;
        const s = this.graph.scale * 100;
        this.dom.container.style.backgroundSize = `${s}px ${s}px`;
    }
}