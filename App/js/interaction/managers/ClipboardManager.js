/**
 * ClipboardManager
 * Handles serialization of graph data to the system clipboard and 
 * deserialization back into the graph. Manages ID remapping to prevent 
 * data collisions upon pasting.
 */
class ClipboardManager {
    constructor(graph, renderer, selectionManager, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.selection = selectionManager;
        this.dom = dom;
    }

    /**
     * Copies selected nodes and their internal connections to the system clipboard.
     * @returns {Promise<boolean>} - Success status of the clipboard write operation.
     */
    async copy() {
        if (this.selection.selected.size === 0) return false;
        
        const nodesToCopy = [];
        const idsToCopy = new Set(this.selection.selected);

        // Snapshot selected nodes into plain JSON objects
        this.selection.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node.toJSON());
        });

        // SNAPSHOT CONNECTIONS: Only copy wires where both start and end nodes are selected.
        const connectionsToCopy = this.graph.connections.filter(c => 
            idsToCopy.has(c.fromNode) && idsToCopy.has(c.toNode)
        );

        const clipboardData = {
            nodes: nodesToCopy,
            connections: connectionsToCopy,
            appIdentifier: 'NodeGraphEditor' // Useful if users copy/paste between tabs
        };

        try {
            const jsonString = JSON.stringify(clipboardData);
            await navigator.clipboard.writeText(jsonString);
            return true; 
        } catch (err) {
            console.error("Clipboard blocked! Ensure the tab is focused.", err);
            return false;
        }
    }

    /**
     * Pastes nodes from the clipboard at a specific screen coordinate.
     * Re-maps internal IDs to ensure connections are preserved in the new instances.
     * @param {number} screenX - Mouse X coordinate
     * @param {number} screenY - Mouse Y coordinate
     */
    async paste(screenX, screenY) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            
            let data;
            try { 
                data = JSON.parse(text); 
            } catch(e) { 
                return; // Not valid JSON or not our format
            } 

            const nodes = Array.isArray(data) ? data : data.nodes;
            const connections = Array.isArray(data) ? [] : (data.connections || []);
            if (!nodes || nodes.length === 0) return;

            // Clear existing selection to focus on the newly pasted items
            this.selection.clear();

            // 1. CALCULATE BOUNDS: Find the top-left corner of the copied group
            // to maintain the relative spacing between nodes.
            let minX = Infinity, minY = Infinity;
            nodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.y < minY) minY = n.y;
            });

            // 2. COORDINATE TRANSFORM: Convert screen pixels to graph world-space
            const rect = this.dom.container.getBoundingClientRect();
            const pasteX = (screenX - rect.left - this.graph.pan.x) / this.graph.scale;
            const pasteY = (screenY - rect.top - this.graph.pan.y) / this.graph.scale;

            /** * ID MAPPING:
             * Since original IDs might already exist in the graph, we map 
             * 'Old ID' -> 'New ID' to re-wire connections correctly.
             */
            const idMap = new Map(); 

            // 3. RECREATE NODES
            nodes.forEach(nodeData => {
                const template = this._findTemplate(nodeData);
                if (!template) return;

                const offsetX = nodeData.x - minX;
                const offsetY = nodeData.y - minY;
                
                // Add the node and store the mapping for wire reconstruction
                const newNode = this.graph.addNode(template, pasteX + offsetX, pasteY + offsetY);
                idMap.set(nodeData.id, newNode.id);

                // Restore dynamic state (pin types and widget inputs)
                this._restoreNodeState(newNode, nodeData);
                
                this.renderer.createNodeElement(newNode);
                this.selection.add(newNode.id);
            });

            // 4. RECONSTRUCT CONNECTIONS
            connections.forEach(c => {
                const newFrom = idMap.get(c.fromNode);
                const newTo = idMap.get(c.toNode);
                
                // Only create the connection if both ends were successfully pasted
                if (newFrom && newTo) {
                    this.graph.addConnection(newFrom, c.fromPin, newTo, c.toPin, c.type);
                }
            });

            this.renderer.render();
        } catch (err) {
            console.error("Clipboard Paste Error:", err);
        }
    }

    /**
     * Initiates a cut operation.
     * Note: Deletion of nodes should be handled by the Orchestrator/NodeManager 
     * ONLY if this returns true.
     */
    async cut() {
        return await this.copy(); 
    }

    // --- Private Helpers ---

    /** Resolves node templates, including specialized variable nodes. */
    _findTemplate(nodeData) {
        if (nodeData.varName && window.App.variableManager) {
            if (nodeData.functionId === 'Variable.Get') return window.App.variableManager.createGetTemplate(nodeData.varName);
            if (nodeData.functionId === 'Variable.Set') return window.App.variableManager.createSetTemplate(nodeData.varName);
        }
        return window.nodeTemplates.find(t => t.name === nodeData.name);
    }

    /** Restores dynamic data (pin types/widget values) to a newly instantiated node. */
    _restoreNodeState(newNode, nodeData) {
        if (nodeData.pinTypes) {
            ['inputs', 'outputs'].forEach(dir => {
                if (nodeData.pinTypes[dir]) {
                    nodeData.pinTypes[dir].forEach((type, idx) => {
                        if (newNode[dir][idx] && type) newNode[dir][idx].setType(type);
                    });
                }
            });
        }
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