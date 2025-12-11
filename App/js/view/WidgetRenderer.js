/**
 * WidgetRenderer Class
 * Responsible for creating the specific HTML input elements (Widgets) for Node pins.
 * Acts as a factory that switches on the widget type ('text', 'color', 'vector3', etc.).
 * It handles binding change events to update the underlying Data Model.
 */
class WidgetRenderer {
    
    /**
     * Factory method to generate the appropriate DOM element for a widget.
     * @param {Widget} widget - The Widget Model containing type, value, and options.
     * @param {Function} onUpdate - Callback function (val) => {} to sync changes back to the Model.
     * @returns {HTMLElement|null} The created input element or container.
     */
    render(widget, onUpdate) {
        if (!widget) return null;

        switch (widget.type) {
            case 'text': return this.createInput(widget, 'text', '60px', onUpdate);
            case 'number': return this.createInput(widget, 'number', '40px', onUpdate, true);
            // Color: Pass null width so CSS handles the square aspect ratio
            case 'color': return this.createInput(widget, 'color', null, onUpdate); 
            case 'checkbox': return this.createCheckbox(widget, onUpdate);
            case 'dropdown': return this.createDropdown(widget, onUpdate);
            case 'vector3': return this.createVector(widget, onUpdate);
            default: return null;
        }
    }

    /**
     * Creates standard HTML inputs (text, number, color).
     */
    createInput(widget, type, width, onUpdate, isNumber = false) {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'node-widget';
        
        // Only override CSS width if a specific width is provided (e.g. for text inputs)
        if (width) input.style.width = width;
        if (isNumber) input.step = "any"; // Allow floats
        
        input.value = widget.value;
        
        // [FIX] Explicitly set attribute for DOM persistence.
        // This ensures the value is restored if the browser redraws the tab (e.g. display:none toggle).
        input.setAttribute('value', widget.value); 
        
        // Color inputs use 'change' (on close), others use 'input' (live typing)
        const evt = type === 'color' ? 'change' : 'input';
        
        input.addEventListener(evt, (e) => {
            let val = e.target.value;
            // Parse numbers immediately to ensure math operations work
            if (isNumber) val = (val === '' || val === '-') ? 0 : parseFloat(val);
            
            widget.value = val;
            
            // [FIX] Update attribute to keep it synced
            input.setAttribute('value', val); 

            if(onUpdate) onUpdate(widget.value);
        });
        
        // Prevent Graph panning when clicking/dragging inside the input
        this.stopDrag(input);
        return input;
    }

    /**
     * Creates a boolean checkbox.
     */
    createCheckbox(widget, onUpdate) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'node-widget widget-bool';
        input.checked = widget.value === true;
        
        input.addEventListener('change', (e) => {
            widget.value = e.target.checked;
            if(onUpdate) onUpdate(widget.value);
        });
        
        this.stopDrag(input);
        return input;
    }

    /**
     * Creates a Select dropdown.
     */
    createDropdown(widget, onUpdate) {
        const select = document.createElement('select');
        select.className = 'node-widget';
        // Note: Width is handled by CSS (auto/max-width) to fit long options
        
        (widget.options || []).forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt;
            if (opt === widget.value) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            widget.value = e.target.value;
            if(onUpdate) onUpdate(widget.value);
        });

        this.stopDrag(select);
        return select;
    }

    /**
     * Creates a compound widget for Vector3 (X, Y, Z inputs).
     */
    createVector(widget, onUpdate) {
        const div = document.createElement('div');
        div.className = 'widget-vec3';
        
        // Ensure value is an object, default to 0,0,0
        const val = widget.value || {x:0, y:0, z:0};
        
        ['x', 'y', 'z'].forEach(axis => {
            const i = document.createElement('input');
            i.type = 'number'; 
            i.step = 'any';
            i.placeholder = axis.toUpperCase();
            i.value = val[axis];
            
            // [FIX] Set attribute for persistence
            i.setAttribute('value', val[axis]); 

            i.addEventListener('input', (e) => {
                const num = parseFloat(e.target.value);
                val[axis] = isNaN(num) ? 0 : num;
                
                // [FIX] Update attribute
                i.setAttribute('value', val[axis]);

                widget.value = val; // Update Model reference
                if(onUpdate) onUpdate(val);
            });
            
            this.stopDrag(i);
            div.appendChild(i);
        });
        return div;
    }

    /**
     * Helper to stop MouseDown propagation.
     * Essential to prevent the Graph from panning/selecting when interacting with widgets.
     */
    stopDrag(el) {
        el.addEventListener('mousedown', e => e.stopPropagation());
    }
}