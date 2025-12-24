/**
 * ViewportManager
 * Handles infinite canvas navigation, including panning (translation) 
 * and zooming (scaling) relative to the mouse cursor position.
 */
class ViewportManager {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        // Origin points for the current drag operation
        this.startX = 0;
        this.startY = 0;
        this.initialPan = { x: 0, y: 0 };

        /** * Used to distinguish between a "click" and a "drag".
         * Prevents context menus from appearing if the user was actually trying to pan.
         */
        this.isIntentionalDrag = false;
    }

    // ==========================================
    // PANNING LOGIC
    // ==========================================

    /**
     * Initializes the panning operation.
     * Captures the starting mouse position and the current graph offset.
     * @param {MouseEvent} e 
     */
    startPan(e) {
        this.isIntentionalDrag = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.initialPan = { ...this.graph.pan };
    }

    /**
     * Updates the graph's pan coordinates based on mouse delta.
     * Includes a threshold check to determine if the movement is significant enough to be a drag.
     * @param {MouseEvent} e 
     */
    updatePan(e) {
        // Calculate new pan by adding the mouse delta (distance moved) to the starting pan
        this.graph.pan.x = this.initialPan.x + (e.clientX - this.startX);
        this.graph.pan.y = this.initialPan.y + (e.clientY - this.startY);
        
        // Push changes to the CSS transform via the renderer
        this.renderer.updateTransform();

        // If movement exceeds 5 pixels, flag it as an intentional drag (not a click)
        if (!this.isIntentionalDrag) {
            const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
            if (dist > 5) {
                this.isIntentionalDrag = true;
            }
        }
    }

    // ==========================================
    // ZOOM LOGIC
    // ==========================================

    /**
     * Handles focal-point zooming. 
     * Adjusts the scale and offsets the pan so the content under the mouse stays stationary.
     * @param {WheelEvent} e 
     */
    handleZoom(e) {
        e.preventDefault(); // Stop the browser from scrolling the page
        
        const rect = this.dom.container.getBoundingClientRect();
        
        // Mouse position relative to the container (Local Space)
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Determine zoom direction and clamp the final scale between 20% and 300%
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldScale = this.graph.scale;
        const newScale = Math.min(Math.max(0.2, oldScale + delta), 3);

        /**
         * ZOOM MATH EXPLANATION:
         * To keep the point under the cursor stationary, we adjust the pan (translation).
         * We calculate the distance from the pan origin to the mouse, scale that distance 
         * by the ratio of change, and re-apply it.
         */
        this.graph.pan.x = mouseX - (mouseX - this.graph.pan.x) * (newScale / oldScale);
        this.graph.pan.y = mouseY - (mouseY - this.graph.pan.y) * (newScale / oldScale);
        this.graph.scale = newScale;

        this.renderer.updateTransform();
    }
}