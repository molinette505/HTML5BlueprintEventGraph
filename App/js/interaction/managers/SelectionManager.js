class SelectionManager {
    constructor(graph, dom) {
        this.graph = graph;
        this.dom = dom;
        this.selectedNodes = new Set();

        // Create the selection box element
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'selection-box';
        this.dom.container.appendChild(this.selectionBox);

        this.startX = 0;
        this.startY = 0;
    }

    // --- State Accessors ---
    
    get selected() {
        return this.selectedNodes;
    }

    has(nodeId) {
        return this.selectedNodes.has(nodeId);
    }

    // --- Basic Actions ---

    add(nodeId) {
        this.selectedNodes.add(nodeId);
        const el = document.getElementById(`node-${nodeId}`);
        if (el) el.classList.add('selected');
    }

    remove(nodeId) {
        this.selectedNodes.delete(nodeId);
        const el = document.getElementById(`node-${nodeId}`);
        if (el) el.classList.remove('selected');
    }

    clear() {
        this.selectedNodes.forEach(id => {
            const el = document.getElementById(`node-${id}`);
            if (el) el.classList.remove('selected');
        });
        this.selectedNodes.clear();
    }

    // --- Box Selection Logic ---

    startBox(e) {
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        const rect = this.dom.container.getBoundingClientRect();
        this.selectionBox.style.left = (e.clientX - rect.left) + 'px';
        this.selectionBox.style.top = (e.clientY - rect.top) + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
    }

    updateBox(e, isMultiSelect = false) {
        const x = Math.min(e.clientX, this.startX);
        const y = Math.min(e.clientY, this.startY);
        const w = Math.abs(e.clientX - this.startX);
        const h = Math.abs(e.clientY - this.startY);

        const rect = this.dom.container.getBoundingClientRect();
        this.selectionBox.style.left = (x - rect.left) + 'px';
        this.selectionBox.style.top = (y - rect.top) + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';

        const boxRect = { left: x, top: y, right: x + w, bottom: y + h };

        this.graph.nodes.forEach(node => {
            const el = document.getElementById(`node-${node.id}`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            
            const intersect = !(boxRect.left > r.right || 
                                boxRect.right < r.left || 
                                boxRect.top > r.bottom || 
                                boxRect.bottom < r.top);
            
            if (intersect) {
                this.add(node.id);
            } else if (!isMultiSelect) { 
                this.remove(node.id);
            }
        });
    }

    endBox() {
        this.selectionBox.style.display = 'none';
    }
}