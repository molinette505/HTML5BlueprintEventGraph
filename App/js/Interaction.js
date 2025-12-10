class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        this.dragNode = null;
        this.dragWire = null;
        this.isPanning = false;
        this.startPos = {x:0, y:0};
        this.offset = {x:0, y:0};
        this.contextMenuPos = {x:0, y:0};

        this.bindEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        // MOUSE DOWN
        c.addEventListener('mousedown', e => {
            this.hideContextMenu();
            
            // Wire Drag (Pin)
            if(e.target.classList.contains('pin')) {
                this.handlePinDown(e);
                return;
            }
            
            // Pan (Background)
            if(e.target === c || e.target === this.dom.transformLayer || e.target.id === 'connections-layer') {
                this.isPanning = true;
                this.startPos = { x: e.clientX - this.graph.pan.x, y: e.clientY - this.graph.pan.y };
            }
        });

        // RIGHT CLICK (Context Menu)
        c.addEventListener('contextmenu', e => {
            e.preventDefault();
            const nodeEl = e.target.closest('.node');
            if(nodeEl) {
                const nodeId = parseInt(nodeEl.id.replace('node-', ''));
                this.showContextMenu(e.clientX, e.clientY, 'node', nodeId);
            } else {
                this.showContextMenu(e.clientX, e.clientY, 'canvas');
            }
        });

        // MOUSE MOVE
        window.addEventListener('mousemove', e => {
            // Panning
            if(this.isPanning) {
                this.graph.pan.x = e.clientX - this.startPos.x;
                this.graph.pan.y = e.clientY - this.startPos.y;
                this.renderer.updateTransform();
            }
            // Drag Node
            if(this.dragNode) {
                const rect = c.getBoundingClientRect();
                this.dragNode.x = (e.clientX - rect.left - this.graph.pan.x)/this.graph.scale - this.offset.x;
                this.dragNode.y = (e.clientY - rect.top - this.graph.pan.y)/this.graph.scale - this.offset.y;
                const el = document.getElementById(`node-${this.dragNode.id}`);
                if(el) { el.style.left = this.dragNode.x+'px'; el.style.top = this.dragNode.y+'px'; }
                this.renderer.render(); 
            }
            // Drag Wire
            if(this.dragWire) {
                const rect = c.getBoundingClientRect();
                const mx = (e.clientX - rect.left - this.graph.pan.x)/this.graph.scale;
                const my = (e.clientY - rect.top - this.graph.pan.y)/this.graph.scale;
                
                // Clear & Redraw existing, then draw drag line
                this.renderer.dom.connectionsLayer.innerHTML = '';
                this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
                
                const p1 = {x: this.dragWire.startX, y: this.dragWire.startY};
                const p2 = {x: mx, y: my};
                
                // Snap visual
                const snap = e.target.closest('.pin');
                if(snap) {
                    // add visual snap logic here if desired
                }

                if(this.dragWire.sourceType === 'output') this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
                else this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
            }
        });

        // MOUSE UP
        window.addEventListener('mouseup', e => {
            this.isPanning = false;
            this.dragNode = null;
            if(this.dragWire) {
                const target = e.target.closest('.pin');
                if(target) this.finishWireDrag(target);
                // If target is null, wire is dropped/deleted
                this.dragWire = null;
                this.renderer.render(); 
            }
        });

        // ZOOM
        c.addEventListener('wheel', e => {
            e.preventDefault();
            const d = e.deltaY > 0 ? -0.1 : 0.1;
            this.graph.scale = Math.max(0.2, this.graph.scale + d);
            this.renderer.updateTransform();
            this.hideContextMenu();
        });
    }

    startNodeDrag(e, nodeId) {
        e.stopPropagation(); 
        this.hideContextMenu();
        const node = this.graph.nodes.find(n => n.id === nodeId);
        if(!node) return;
        this.dragNode = node;
        const rect = this.dom.container.getBoundingClientRect();
        const nx = node.x * this.graph.scale + this.graph.pan.x + rect.left;
        const ny = node.y * this.graph.scale + this.graph.pan.y + rect.top;
        this.offset = { x: (e.clientX - nx)/this.graph.scale, y: (e.clientY - ny)/this.graph.scale };
    }

    handlePinDown(e) {
        e.stopPropagation();
        const pin = e.target;
        const nodeId = parseInt(pin.dataset.node);
        const index = parseInt(pin.dataset.index);
        const type = pin.dataset.type;
        
        // DISCONNECT LOGIC: If clicking Input with existing connection
        if (type === 'input') {
            const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPin === index);
            if (conn) {
                this.graph.removeConnection(conn.id);
                this.renderer.render();
                // Start dragging from the Output source
                const srcPos = this.renderer.getPinPos(conn.fromNode, conn.fromPin, 'output');
                if(srcPos) {
                    this.dragWire = {
                        sourceNode: conn.fromNode,
                        sourcePin: conn.fromPin,
                        sourceType: 'output',
                        dataType: pin.dataset.dataType,
                        startX: srcPos.x, startY: srcPos.y
                    };
                }
                return;
            }
        }

        // NEW WIRE LOGIC
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
    }

    finishWireDrag(target) {
        const s = this.dragWire;
        const t = {
            nodeId: parseInt(target.dataset.node),
            index: parseInt(target.dataset.index),
            type: target.dataset.type,
            dataType: target.dataset.dataType
        };

        if(s.sourceNode === t.nodeId) return; // Self
        if(s.sourceType === t.type) return; // Same IO
        if(s.dataType !== t.dataType) return; // Wrong Type

        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }

    showContextMenu(x, y, type, targetId) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;
        
        let drawX = x; let drawY = y;
        if(x + 200 > window.innerWidth) drawX -= 200;
        if(y + 300 > window.innerHeight) drawY -= 300;
        menu.style.left = drawX + 'px'; menu.style.top = drawY + 'px';
        menu.classList.add('visible');

        const rect = this.dom.container.getBoundingClientRect();
        this.contextMenuPos = {
            x: (x - rect.left - this.graph.pan.x)/this.graph.scale,
            y: (y - rect.top - this.graph.pan.y)/this.graph.scale
        };

        list.innerHTML = '';
        if (type === 'node') {
            search.style.display = 'none';
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerHTML = '<span style="color:#ff6666">Delete Node</span>';
            li.onclick = () => {
                this.graph.removeNode(targetId);
                const el = document.getElementById(`node-${targetId}`);
                if(el) el.remove();
                this.renderer.render();
                this.hideContextMenu();
            };
            list.appendChild(li);
        } else {
            search.style.display = 'block';
            search.value = '';
            setTimeout(() => search.focus(), 50);
            this.renderNodeList(window.nodeTemplates || []);
        }
    }

    hideContextMenu() { this.dom.contextMenu.classList.remove('visible'); }

    filterContextMenu(q) {
        const lower = q.toLowerCase();
        this.renderNodeList((window.nodeTemplates||[]).filter(n => n.name.toLowerCase().includes(lower)));
    }

    renderNodeList(items) {
        const list = this.dom.contextList;
        list.innerHTML = '';
        items.forEach(tmpl => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            const isFlow = (tmpl.outputs||[]).some(o=>o.type==='exec');
            li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow?'Flow':'Data'}</span>`;
            li.onclick = () => {
                const n = this.graph.addNode(tmpl, this.contextMenuPos.x, this.contextMenuPos.y);
                this.renderer.createNodeElement(n, (e, nid) => this.startNodeDrag(e, nid));
                this.hideContextMenu();
            };
            list.appendChild(li);
        });
    }
}