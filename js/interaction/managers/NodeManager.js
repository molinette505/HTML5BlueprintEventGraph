class NodeManager {
    constructor(graph, renderer, onNodeInteraction) {
        this.graph = graph;
        this.renderer = renderer;
        this.onNodeInteraction = onNodeInteraction; // Callback for (e, nodeId) => ...
    }

    /**
     * Creates a node in the Model and the View.
     * @param {Object} template - The JSON template for the node.
     * @param {Number} x - Graph X coordinate.
     * @param {Number} y - Graph Y coordinate.
     */
    createNode(template, x, y) {
        // 1. Add to Model
        const node = this.graph.addNode(template, x, y);
        
        // 2. Add to View (DOM) and attach interaction listeners
        this.renderer.createNodeElement(node, this.onNodeInteraction);
        
        return node;
    }

    /**
     * Deletes a set of nodes from Model and View.
     * @param {Set|Array} nodeIds - IDs of nodes to delete.
     */
    deleteNodes(nodeIds) {
        nodeIds.forEach(id => {
            // 1. Remove from Model
            this.graph.removeNode(id);
            
            // 2. Remove from View
            const el = document.getElementById(`node-${id}`);
            if (el) el.remove();
        });
        
        // 3. Refresh connections in case wires were removed
        this.renderer.render();
    }
}