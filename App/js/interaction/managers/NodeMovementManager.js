class NodeMovementManager {
    constructor(graph, renderer, selectionManager) {
        this.graph = graph;
        this.renderer = renderer;
        this.selection = selectionManager;

        this.startX = 0;
        this.startY = 0;
        this.nodeOffsets = new Map(); // Stores the original (x, y) of each dragged node
    }

    /**
     * Prepares nodes for dragging.
     * @param {MouseEvent} e - The trigger event
     * @param {number} nodeId - The ID of the node actually clicked
     */
    startDrag(e, nodeId) {
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.nodeOffsets.clear();

        this.selection.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                this.nodeOffsets.set(id, { x: node.x, y: node.y });
            }
        });
    }

    /**
     * Updates node positions based on mouse movement.
     */
    update(e) {
        // Translate screen delta to graph space by dividing by scale
        const dx = (e.clientX - this.startX) / this.graph.scale;
        const dy = (e.clientY - this.startY) / this.graph.scale;

        this.nodeOffsets.forEach((initialPos, id) => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                // Update internal graph data
                node.x = initialPos.x + dx;
                node.y = initialPos.y + dy;

                // Update the DOM element directly for performance
                const el = document.getElementById(`node-${id}`);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
            }
        });

        // Tell the renderer to redraw connections to follow the moving nodes
        this.renderer.render(); 
    }

    endDrag() {
        this.nodeOffsets.clear();
    }
}