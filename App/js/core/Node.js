class Node {
    constructor(id, template, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.name = template.name;
        this.color = template.color || "var(--header-bg)";
        this.width = template.width;
        this.hideHeader = template.hideHeader || false;
        this.centerLabel = template.centerLabel || null;
        
        this.showAdvanced = false;

        this.inputs = (template.inputs || []).map((p, i) => new Pin(this, i, 'input', p));
        this.outputs = (template.outputs || []).map((p, i) => new Pin(this, i, 'output', p));
    }

    getInputValue(index) {
        if (!this.inputs[index]) return null;
        // Prioritize widget value if exists (Note: Simulation should also check for connections)
        if (this.inputs[index].widget) return this.inputs[index].widget.value;
        return null; 
    }
    
    hasAdvancedPins() {
        return this.inputs.some(p => p.advanced) || this.outputs.some(p => p.advanced);
    }
}