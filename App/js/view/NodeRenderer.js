class NodeRenderer {
    constructor() {
        // Cache widget generators to keep code clean
        this.widgetGenerators = {
            'text': (pin) => this.createInput(pin, 'text', '60px'),
            'number': (pin) => this.createInput(pin, 'number', '40px'),
            'checkbox': (pin) => this.createInput(pin, 'checkbox', ''),
            'vector3': (pin) => this.createVectorWidget(pin),
            'color': (pin) => this.createInput(pin, 'color', '40px')
        };
    }

    // Create the main DOM element
    createElement(node) {
        const el = document.createElement('div');
        el.className = `node ${node.hideHeader ? 'compact' : ''}`;
        el.id = `node-${node.id}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        if (node.width) el.style.width = `${node.width}px`;
        
        // CSS Variable for color
        el.style.setProperty('--header-bg', node.color);

        // 1. Header
        if (!node.hideHeader) {
            const header = document.createElement('div');
            header.className = 'node-header';
            header.innerText = node.name;
            // Use specific color if defined, else generic header style
            header.style.background = node.color;
            el.appendChild(header);
        }

        // 2. Body
        const body = document.createElement('div');
        body.className = 'node-body';

        const left = this.createCol();
        const center = this.createCol('col-center');
        const right = this.createCol('col-right');

        // Center Label (Math nodes)
        if (node.centerLabel) {
            const lbl = document.createElement('div');
            lbl.className = 'center-label';
            lbl.innerText = node.centerLabel;
            center.appendChild(lbl);
        }

        // 3. Pins
        node.inputs.forEach(pin => left.appendChild(this.createPinElement(pin)));
        node.outputs.forEach(pin => right.appendChild(this.createPinElement(pin)));

        body.append(left, center, right);
        el.appendChild(body);

        return el;
    }

    createCol(extraClass = '') {
        const d = document.createElement('div');
        d.className = `col ${extraClass}`;
        return d;
    }

    createPinElement(pin) {
        const row = document.createElement('div');
        row.className = 'pin-row';
        
        // Find Type Definition (Color, Widget Type)
        const typeDef = window.typeDefinitions[pin.type] || { color: '#999', widget: 'none' };

        // 1. The Pin Circle
        const pinShape = document.createElement('div');
        pinShape.className = `pin ${pin.type}`;
        pinShape.dataset.id = pin.id; // "1-input-0"
        pinShape.dataset.node = pin.nodeId;
        pinShape.dataset.index = pin.index;
        pinShape.dataset.type = pin.direction;
        pinShape.dataset.dataType = pin.type;
        pinShape.style.setProperty('--pin-color', typeDef.color);

        // 2. Label
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.innerText = pin.name;

        // 3. Widget (Only for inputs)
        let widget = null;
        if (pin.direction === 'input' && typeDef.widget && typeDef.widget !== 'none') {
            if (this.widgetGenerators[typeDef.widget]) {
                widget = this.widgetGenerators[typeDef.widget](pin);
            }
        }

        // Assembly
        if (pin.direction === 'input') {
            row.appendChild(pinShape);
            if (pin.name) row.appendChild(label);
            if (widget) row.appendChild(widget);
        } else {
            if (pin.name) row.appendChild(label);
            row.appendChild(pinShape);
        }

        return row;
    }

    // --- Widgets ---
    createInput(pin, type, width) {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'node-widget';
        if (width) input.style.width = width;
        input.value = pin.value || '';
        
        // Update Model when user types
        input.oninput = (e) => { pin.value = e.target.value; };
        
        // Stop drag propagation
        input.addEventListener('mousedown', e => e.stopPropagation());
        return input;
    }

    createVectorWidget(pin) {
        const wrap = document.createElement('div');
        wrap.className = 'widget-vec3';
        const axes = ['x', 'y', 'z'];
        // Ensure value is object
        if (!pin.value || typeof pin.value !== 'object') pin.value = {x:0, y:0, z:0};

        axes.forEach(axis => {
            const i = document.createElement('input');
            i.placeholder = axis.toUpperCase();
            i.value = pin.value[axis] || 0;
            i.oninput = (e) => { pin.value[axis] = parseFloat(e.target.value); };
            i.addEventListener('mousedown', e => e.stopPropagation());
            wrap.appendChild(i);
        });
        return wrap;
    }
}