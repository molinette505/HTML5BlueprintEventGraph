class ContextMenuManager {
    constructor(dom, callbacks) {
        // dom structure: { menu, list, search, container }
        this.dom = dom;
        this.callbacks = callbacks; 
        
        this.activePos = { x: 0, y: 0 }; 
        this.collapsedCategories = new Set();
        
        // Fix: Use 'search' not 'contextSearch'
        if (this.dom.search) {
            this.dom.search.oninput = (e) => this.filter(e.target.value);
        }
    }

    show(x, y, type, contextData = {}) {
        // Destructure carefully to ensure we have the elements
        const { menu, list, search, container } = this.dom;
        const { graph, targetId, pinIndex, pinDir } = contextData;

        // Safety check
        if (!menu) {
            console.error("ContextMenuManager: 'menu' DOM element is missing.");
            return;
        }

        // 1. Position Logic
        let drawX = x; 
        let drawY = y;
        if (x + 200 > window.innerWidth) drawX -= 200;
        if (y + 300 > window.innerHeight) drawY -= 300;
        
        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        
        // FIX: Ensure we use the right property for the class
        menu.classList.add('visible');

        // 2. Clear List
        if (list) list.innerHTML = '';

        // 3. Mode Switching
        if (type === 'pin') {
            if(search) search.style.display = 'none';
            this._buildPinMenu(graph, targetId, pinIndex, pinDir);
        } 
        else if (type === 'node') {
            if(search) search.style.display = 'none';
            this._buildNodeMenu(targetId, contextData.selectedCount);
        } 
        else {
            // Background / Canvas
            if(search) {
                search.style.display = 'block';
                search.value = '';
                setTimeout(() => search.focus(), 50);
            }

            // Calculate graph coordinates
            if (container) {
                const rect = container.getBoundingClientRect();
                this.activePos = {
                    x: (x - rect.left - graph.pan.x) / graph.scale,
                    y: (y - rect.top - graph.pan.y) / graph.scale
                };
            }

            // Paste Option
            const liPaste = document.createElement('li');
            liPaste.className = 'ctx-item';
            liPaste.innerHTML = `<span>Paste</span>`;
            liPaste.style.borderBottom = '1px solid #444';
            liPaste.style.marginBottom = '5px';
            liPaste.onclick = () => {
                this.callbacks.onPaste(x, y);
                this.hide();
            };
            if(list) list.appendChild(liPaste);

            this._renderNodeList(window.nodeTemplates || []);
        }
    }

    hide() {
        // FIX: The property is 'menu', not 'contextMenu'
        if (this.dom.menu) {
            this.dom.menu.classList.remove('visible');
        }
    }

    filter(query) {
        const lower = query.toLowerCase();
        const filtered = (window.nodeTemplates || []).filter(n => n.name.toLowerCase().includes(lower));
        this._renderNodeList(filtered, !!query);
    }

    // --- Internal Builders ---

    _buildPinMenu(graph, nodeId, pinIndex, dir) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const pin = (dir === 'input') ? node.inputs[pinIndex] : node.outputs[pinIndex];
        const list = this.dom.list;

        if (pin && pin.allowedTypes && list) {
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
                const typeDef = (window.globalDataTypes || []).find(g => g.name === t);
                const colorVar = typeDef ? typeDef.color : '#fff';

                li.innerHTML = `<span style="color:${colorVar}">${check}${t.toUpperCase()}</span>`;
                li.onclick = () => {
                    this.callbacks.onPinChange(node, pin, t, pinIndex, dir);
                    this.hide();
                };
                list.appendChild(li);
            });
        }
    }

    _buildNodeMenu(targetId, selectedCount = 1) {
        const list = this.dom.list;
        if (!list) return;

        // Copy
        const liCopy = document.createElement('li');
        liCopy.className = 'ctx-item';
        liCopy.innerHTML = `<span>Copy</span>`;
        liCopy.onclick = () => { this.callbacks.onCopy(); this.hide(); };
        list.appendChild(liCopy);

        // Cut
        const liCut = document.createElement('li');
        liCut.className = 'ctx-item';
        liCut.innerHTML = `<span>Cut</span>`;
        liCut.onclick = () => { this.callbacks.onCut(); this.hide(); };
        list.appendChild(liCut);

        // Delete
        const count = selectedCount > 1 ? selectedCount : 1;
        const liDelete = document.createElement('li');
        liDelete.className = 'ctx-item';
        liDelete.innerHTML = `<span style="color:var(--danger-color)">Delete ${count > 1 ? count + ' Nodes' : 'Node'}</span>`;
        liDelete.onclick = () => {
            this.callbacks.onDelete(targetId);
            this.hide();
        };
        list.appendChild(liDelete);
    }

    _renderNodeList(items, isSearching = false) {
        const list = this.dom.list;
        if (!list) return;
        
        if (!isSearching) list.innerHTML = ''; 

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
                    this._renderNodeList(items, false);
                };
                list.appendChild(header);

                if (!this.collapsedCategories.has(cat)) {
                    grouped[cat].forEach(tmpl => this._createMenuItem(tmpl, true));
                }
            });
        } else {
            if(this.dom.search && this.dom.search.value !== '') list.innerHTML = '';
            items.forEach(tmpl => this._createMenuItem(tmpl, false));
        }
    }

    _createMenuItem(tmpl, isIndent) {
        const list = this.dom.list;
        if (!list) return;

        const li = document.createElement('li');
        li.className = `ctx-item ${isIndent ? 'ctx-folder' : ''}`;
        const isFlow = (tmpl.outputs || []).some(o => o.type === 'exec');
        li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow ? 'Flow' : 'Data'}</span>`;
        
        li.onclick = () => {
            this.callbacks.onSpawn(tmpl, this.activePos.x, this.activePos.y);
            this.hide();
        };
        list.appendChild(li);
    }
}