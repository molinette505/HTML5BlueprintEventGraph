class ViewportManager {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        this.startX = 0;
        this.startY = 0;
        this.initialPan = { x: 0, y: 0 };

        this.isIntentionalDrag = false;
    }

    // ==========================================
    // PANNING & ZOOM
    // ==========================================

    startPan(e) {
        this.isIntentionalDrag = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.initialPan = { ...this.graph.pan };
    }

    updatePan(e) {
        this.graph.pan.x = this.initialPan.x + (e.clientX - this.startX);
        this.graph.pan.y = this.initialPan.y + (e.clientY - this.startY);
        this.renderer.updateTransform();
        if (!this.isIntentionalDrag) {
            const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
            if (dist > 5) {
                this.isIntentionalDrag = true;
            }
        }
    }

    handleZoom(e) {
        e.preventDefault();
        const rect = this.dom.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldScale = this.graph.scale;
        const newScale = Math.min(Math.max(0.2, oldScale + delta), 3);

        this.graph.pan.x = mouseX - (mouseX - this.graph.pan.x) * (newScale / oldScale);
        this.graph.pan.y = mouseY - (mouseY - this.graph.pan.y) * (newScale / oldScale);
        this.graph.scale = newScale;

        this.renderer.updateTransform();
    }
}