class Node {
    constructor(id, template, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.name = template.name;
        this.color = template.color || "var(--header-bg)";
        this.width = template.width; // Optional
        this.hideHeader = template.hideHeader || false;
        this.centerLabel = template.centerLabel || null;

        // Convert raw pins into structured objects
        this.inputs = (template.inputs || []).map((p, i) => this.createPin(p, i, 'input'));
        this.outputs = (template.outputs || []).map((p, i) => this.createPin(p, i, 'output'));
    }

    createPin(raw, index, direction) {
        return {
            id: `${this.id}-${direction}-${index}`, // Unique ID for cache
            nodeId: this.id,
            index: index,
            direction: direction,
            name: raw.name,
            type: raw.type,
            value: raw.default, // Stores the current widget value
            dataType: raw.type 
        };
    }

    // --- HELPER FOR SIMULATION ---
    getInputValue(index) {
        // Safety check
        if (!this.inputs[index]) return null;
        return this.inputs[index].value;
    }
}