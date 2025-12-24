class ClipboardManager {
    constructor(graph, renderer, selectionManager, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.selection = selectionManager;
        this.dom = dom;
    }

    /**
     * Copies selected nodes and internal connections to system clipboard
     */
    async copy() {
        if (this.selection.selected.size === 0) return;
        
        const nodesToCopy = [];
        const idsToCopy = new Set(this.selection.selected);

        this.selection.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node.toJSON());
        });

        // Only copy connections where BOTH nodes are in the selection
        const connectionsToCopy = this.graph.connections.filter(c => 
            idsToCopy.has(c.fromNode) && idsToCopy.has(c.toNode)
        );

        const clipboardData = {
            nodes: nodesToCopy,
            connections: connectionsToCopy
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(clipboardData));
            return true; // The OS confirmed: "I have the data"
        } catch (err) {
            console.error("Clipboard blocked!", err);
            return false; // Something went wrong (e.g. user denied permission)
        }
    }

    /**
     * Pastes nodes from JSON at a specific screen coordinate
     */
    async paste(screenX, screenY) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            
            let data;
            try { data = JSON.parse(text); } catch(e) { return; } 

            const nodes = Array.isArray(data) ? data : data.nodes;
            const connections = Array.isArray(data) ? [] : (data.connections || []);
            if (!nodes || nodes.length === 0) return;

            this.selection.clear();

            // 1. Calculate the center/top-left of the copied group
            let minX = Infinity, minY = Infinity;
            nodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.y < minY) minY = n.y;
            });

            // 2. Convert mouse screen position to graph position
            const rect = this.dom.container.getBoundingClientRect();
            const pasteX = (screenX - rect.left - this.graph.pan.x) / this.graph.scale;
            const pasteY = (screenY - rect.top - this.graph.pan.y) / this.graph.scale;

            const idMap = new Map(); // Maps old ID -> new ID

            // 3. Recreate Nodes
            nodes.forEach(nodeData => {
                const template = this._findTemplate(nodeData);
                if (!template) return;

                const offsetX = nodeData.x - minX;
                const offsetY = nodeData.y - minY;
                
                const newNode = this.graph.addNode(template, pasteX + offsetX, pasteY + offsetY);
                idMap.set(nodeData.id, newNode.id);

                this._restoreNodeState(newNode, nodeData);
                
                this.renderer.createNodeElement(newNode);
                this.selection.add(newNode.id);
            });

            // 4. Recreate Connections using the ID Map
            connections.forEach(c => {
                const newFrom = idMap.get(c.fromNode);
                const newTo = idMap.get(c.toNode);
                if (newFrom && newTo) {
                    this.graph.addConnection(newFrom, c.fromPin, newTo, c.toPin, c.type);
                }
            });

            this.renderer.render();
        } catch (err) {
            console.error("Clipboard Paste Error:", err);
        }
    }

    async cut() {
        const success = await this.copy();
        return success; 
    }

    // --- Private Helpers ---

    _findTemplate(nodeData) {
        // Support for specialized variables
        if (nodeData.varName && window.App.variableManager) {
            if (nodeData.functionId === 'Variable.Get') return window.App.variableManager.createGetTemplate(nodeData.varName);
            if (nodeData.functionId === 'Variable.Set') return window.App.variableManager.createSetTemplate(nodeData.varName);
        }
        return window.nodeTemplates.find(t => t.name === nodeData.name);
    }

    _restoreNodeState(newNode, nodeData) {
        // Restore Dynamic Types
        if (nodeData.pinTypes) {
            ['inputs', 'outputs'].forEach(dir => {
                if (nodeData.pinTypes[dir]) {
                    nodeData.pinTypes[dir].forEach((type, idx) => {
                        if (newNode[dir][idx] && type) newNode[dir][idx].setType(type);
                    });
                }
            });
        }
        // Restore Widget Values
        if (nodeData.inputs) {
            nodeData.inputs.forEach((savedPin, index) => {
                const realPin = newNode.inputs[index];
                if (realPin && savedPin.value !== undefined) {
                    realPin.value = savedPin.value;
                    if (realPin.widget) realPin.widget.value = savedPin.value;
                }
            });
        }
    }
}