/**
 * NodeMovementManager
 * Handles the logic for dragging one or more nodes across the canvas.
 * Accounts for zoom scaling to ensure movement speed matches the mouse cursor.
 */
class NodeMovementManager {
    constructor(graph, renderer, selectionManager) {
        this.graph = graph;
        this.renderer = renderer;
        this.selection = selectionManager;

        // Mouse coordinates at the moment the drag started (Screen Space)
        this.startX = 0;
        this.startY = 0;

        /** * @type {Map<number, {x: number, y: number}>} 
         * Snapshot of node positions at the start of the drag to prevent "drift"
         */
        this.nodeOffsets = new Map();
    }

    /**
     * Initializes the drag operation for all currently selected nodes.
     * @param {MouseEvent} e - The mousedown event
     * @param {number} nodeId - The ID of the node that triggered the drag
     */
    startDrag(e, nodeId) {
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.nodeOffsets.clear();

        // Capture initial positions for every node in the selection.
        // This allows us to move nodes as a cohesive group.
        this.selection.selected.forEach(id => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                this.nodeOffsets.set(id, { x: node.x, y: node.y });
            }
        });
    }

    /**
     * Updates node positions based on current mouse displacement.
     * Converts screen-space pixels into graph-space coordinates using the current scale.
     * @param {MouseEvent} e - The mousemove event
     */
    update(e) {
        /**
         * COORDINATE TRANSFORMATION:
         * We divide the screen delta by the graph scale.
         * If scale is 0.5 (zoomed out), we need to move the node 2px for every 1px of mouse movement
         * to keep the node perfectly under the cursor.
         */
        const dx = (e.clientX - this.startX) / this.graph.scale;
        const dy = (e.clientY - this.startY) / this.graph.scale;

        this.nodeOffsets.forEach((initialPos, id) => {
            const node = this.graph.nodes.find(n => n.id === id);
            if (node) {
                // 1. Update the internal data model (Source of Truth)
                node.x = initialPos.x + dx;
                node.y = initialPos.y + dy;

                // 2. Direct DOM Update (Performance)
                // We manipulate style.left/top directly to bypass expensive React/Framework 
                // re-renders during high-frequency mousemove events.
                const el = document.getElementById(`node-${id}`);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
            }
        });

        // 3. Redraw connections to ensure wires "stretch" and follow the moving nodes.
        this.renderer.render(); 
    }

    /**
     * Cleans up state after a drag operation finishes.
     */
    endDrag() {
        this.nodeOffsets.clear();
    }
}