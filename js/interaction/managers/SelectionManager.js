/**
 * SelectionManager
 * Manages the state of selected nodes and handles the visual "Marquee" box selection.
 * Separates selection logic from interaction and rendering.
 */
class SelectionManager {
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
        
        /** @type {Set<number>} - Unique IDs of currently selected nodes */
        this.selectedNodes = new Set();

        /** @type {HTMLElement} - The visual div used for marquee selection */
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        // Tracking start coordinates for the drag-box logic
        this.startX = 0;
        this.startY = 0;
    }

    // --- State Accessors ---
    
    /** * Returns the set of selected IDs. 
     * Using a getter allows other managers to read state without modifying it directly.
     */
    get selected() {
        return this.selectedNodes;
    }

    /** Checks if a specific node is currently selected */
    has(nodeId) {
        return this.selectedNodes.has(nodeId);
    }

    // --- Basic Actions ---

    /**
     * Adds a node to the selection and updates its visual CSS state.
     * @param {number} nodeId 
     */
    add(nodeId) {
        this.selectedNodes.add(nodeId);
        const el = document.getElementById(`node-${nodeId}`);
        if (el) el.classList.add('selected');
    }

    /**
     * Removes a node from selection and clears its visual highlight.
     * @param {number} nodeId 
     */
    remove(nodeId) {
        this.selectedNodes.delete(nodeId);
        const el = document.getElementById(`node-${nodeId}`);
        if (el) el.classList.remove('selected');
    }

    /** Clears all selected nodes and resets their visual state. */
    clear() {
        this.selectedNodes.forEach(id => {
            const el = document.getElementById(`node-${id}`);
            if (el) el.classList.remove('selected');
        });
        this.selectedNodes.clear();
    }

    // --- Box Selection (Marquee) Logic ---

    /**
     * Initiates the marquee selection box.
     * @param {MouseEvent} e - The mousedown event
     */
    startBox(e) {
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        // Calculate container offset to position the box correctly inside the relative parent
        const rect = this.dom.container.getBoundingClientRect();
        this.selectionBox.style.left = (e.clientX - rect.left) + 'px';
        this.selectionBox.style.top = (e.clientY - rect.top) + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
    }

    /**
     * Expands the selection box and performs AABB (Axis-Aligned Bounding Box) 
     * intersection checks against all nodes in the graph.
     * @param {MouseEvent} e - The mousemove event
     * @param {boolean} isMultiSelect - If true (e.g., Shift held), keeps previous selection
     */
    updateBox(e, isMultiSelect = false) {
        // Calculate the bounding dimensions of the selection marquee
        const x = Math.min(e.clientX, this.startX);
        const y = Math.min(e.clientY, this.startY);
        const w = Math.abs(e.clientX - this.startX);
        const h = Math.abs(e.clientY - this.startY);

        // Update the visual representation
        const rect = this.dom.container.getBoundingClientRect();
        this.selectionBox.style.left = (x - rect.left) + 'px';
        this.selectionBox.style.top = (y - rect.top) + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';

        const boxRect = { left: x, top: y, right: x + w, bottom: y + h };

        // Perform collision detection between the box and every node element
        this.graph.nodes.forEach(node => {
            const el = document.getElementById(`node-${node.id}`);
            if (!el) return;
            
            const r = el.getBoundingClientRect();
            
            // Standard AABB Intersection check
            const intersect = !(boxRect.left > r.right || 
                                boxRect.right < r.left || 
                                boxRect.top > r.bottom || 
                                boxRect.bottom < r.top);
            
            if (intersect) {
                this.add(node.id);
            } else if (!isMultiSelect) { 
                // If the box moved away and we aren't holding shift, deselect the node
                this.remove(node.id);
            }
        });
    }

    /** Hides the selection box when the mouse is released. */
    endBox() {
        this.selectionBox.style.display = 'none';
    }
}