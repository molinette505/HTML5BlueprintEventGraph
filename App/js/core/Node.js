/**
 * Node Class
 * Represents a single logical node in the graph.
 */
class GraphNode {
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

        this.functionId = template.functionId || null;
        this.jsFunctionRef = window.FunctionRegistry ? window.FunctionRegistry[this.functionId] : null;
        this.executionResult = null; 

        this.inputs = (template.inputs || []).map((p, i) => new Pin(this, i, 'input', p));
        this.outputs = (template.outputs || []).map((p, i) => new Pin(this, i, 'output', p));
    }

    getInputValue(index) {
        if (!this.inputs[index]) return null;
        if (this.inputs[index].widget) {
            return this.inputs[index].widget.value;
        }
        return null; 
    }
    
    hasAdvancedPins() {
        return this.inputs.some(p => p.advanced) || this.outputs.some(p => p.advanced);
    }

    setError(msg) {
        const el = document.getElementById(`node-${this.id}`);
        if (!el) return;
        
        let errDiv = el.querySelector('.node-error');
        if (!msg) {
            if (errDiv) errDiv.style.display = 'none';
            el.classList.remove('has-error');
            return;
        }

        if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.className = 'node-error';
            el.appendChild(errDiv);
        }
        errDiv.innerText = msg;
        errDiv.style.display = 'block';
        el.classList.add('has-error');
    }

    /**
     * Serializes the node state for Copy/Paste or Saving.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            // [FIX] Ensure pinTypes are saved so we can restore Wildcard nodes correctly
            pinTypes: {
                inputs: this.inputs.map(p => p.type),
                outputs: this.outputs.map(p => p.type)
            },
            // [FIX] Save Widget value if present, else Pin value
            inputs: this.inputs.map(p => ({
                name: p.name,
                value: p.widget ? p.widget.value : p.value 
            }))
        };
    }
}