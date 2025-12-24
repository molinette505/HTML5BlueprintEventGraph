/**
 * Interaction Class
 * Handles all user input: Mouse clicks, dragging, zooming, selection, and context menus.
 */
class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        this.viewportManager = new ViewportManager(this.graph, this.renderer, this.dom);
        this.selectionManager = new SelectionManager(this.graph, this.dom);
        this.nodeMovementManager = new NodeMovementManager(this.graph, this.renderer, this.selectionManager);
        this.connectionManager = new ConnectionManager(this.graph, this.renderer, this.dom);
        this.clipboard = new ClipboardManager(this.graph, this.renderer, this.selectionManager, this.dom);
        
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
                    this.connectionManager.breakConnection(e.target);
                } 
                else if (e.button === 0) {
                    this.connectionManager.startDrag(e);
                    this.mode = 'DRAG_WIRE';
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
                case 'DRAG_WIRE': this.connectionManager.update(e); break;
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
                this.clipboard.copy(); 
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { 
                e.preventDefault(); 
                this.clipboard.paste(this.lastMousePos.x, this.lastMousePos.y); 
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                const itActuallyWorked = await this.clipboard.cut();
                
                if (itActuallyWorked) {
                    this.deleteSelected();
                } else {
                    alert("Cut failed: Could not copy to clipboard. Nodes were not deleted.");
                }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { 
                if (this.selectionManager.selected.size > 0) this.deleteSelected(); 
            }
        });
    }
    
    // ==========================================
    // DELETE
    // ========================================

    deleteSelected() {
        this.selectionManager.selected.forEach(id => {
            this.graph.removeNode(id);
            const el = document.getElementById(`node-${id}`);
            if (el) el.remove();
        });
        this.selectionManager.clear();
        this.renderer.render();
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
            this.renderer.createNodeElement(n)
            this.hideContextMenu();
        };
        list.appendChild(li);
    }
}