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

        //Instantiate Pins
        this.inputs = (template.inputs || []).map((p, i) => new Pin(this, i, 'input', p));
        this.outputs = (template.outputs || []).map((p, i) => new Pin(this, i, 'output', p));
    }

    getInputValue(index) {
        if (!this.inputs[index]) return null;
        return this.inputs[index].value;
    }
}