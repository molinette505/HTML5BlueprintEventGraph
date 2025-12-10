class WidgetRenderer {
    render(widget, onUpdate) {
        if (!widget) return null;

        switch (widget.type) {
            case 'text': return this.createInput(widget, 'text', '60px', onUpdate);
            case 'number': return this.createInput(widget, 'number', '40px', onUpdate);
            case 'color': return this.createInput(widget, 'color', null, onUpdate); // Null width = CSS handles it
            case 'checkbox': return this.createCheckbox(widget, onUpdate);
            case 'dropdown': return this.createDropdown(widget, onUpdate);
            case 'vector3': return this.createVector(widget, onUpdate);
            default: return null;
        }
    }

    createInput(widget, type, width, onUpdate) {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'node-widget';
        // Only set width inline if specific override is passed (like for text inputs)
        if (width) input.style.width = width;
        
        input.value = widget.value;
        const evt = type === 'color' ? 'change' : 'input';
        input.addEventListener(evt, (e) => {
            widget.value = e.target.value;
            if(onUpdate) onUpdate(widget.value);
        });
        this.stopDrag(input);
        return input;
    }

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

    createDropdown(widget, onUpdate) {
        const select = document.createElement('select');
        select.className = 'node-widget';
        // Removed hardcoded width here to let CSS (auto) handle it
        
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

    createVector(widget, onUpdate) {
        const div = document.createElement('div');
        div.className = 'widget-vec3';
        const val = widget.value || {x:0, y:0, z:0};
        ['x', 'y', 'z'].forEach(axis => {
            const i = document.createElement('input');
            i.type = 'number';
            i.placeholder = axis.toUpperCase();
            i.value = val[axis];
            i.addEventListener('input', (e) => {
                val[axis] = parseFloat(e.target.value);
                widget.value = val;
                if(onUpdate) onUpdate(val);
            });
            this.stopDrag(i);
            div.appendChild(i);
        });
        return div;
    }

    stopDrag(el) {
        el.addEventListener('mousedown', e => e.stopPropagation());
    }
}