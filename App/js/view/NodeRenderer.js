class NodeRenderer {
    constructor() {
        this.widgetRenderer = new WidgetRenderer();
    }

    createElement(node) {
        const el = document.createElement('div');
        el.className = `node ${node.hideHeader ? 'compact' : ''} ${node.showAdvanced ? 'expanded' : ''}`;
        el.id = `node-${node.id}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        if (node.width) el.style.width = `${node.width}px`;
        if (node.color) el.style.setProperty('--header-bg', node.color);

        if (!node.hideHeader) {
            const header = document.createElement('div');
            header.className = 'node-header';
            header.innerText = node.name;
            header.style.background = node.color;
            el.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = 'node-body';
        const left = this.col('col-left');
        const center = this.col('col-center');
        const right = this.col('col-right');

        if (node.centerLabel) {
            const lbl = document.createElement('div');
            lbl.className = 'center-label';
            lbl.innerText = node.centerLabel;
            center.appendChild(lbl);
        }

        node.inputs.forEach(p => {
            if (!p.advanced || node.showAdvanced) left.appendChild(this.renderPin(p));
        });
        node.outputs.forEach(p => {
            if (!p.advanced || node.showAdvanced) right.appendChild(this.renderPin(p));
        });

        body.append(left, center, right);
        el.appendChild(body);

        if (node.hasAdvancedPins()) {
            const arrow = document.createElement('div');
            arrow.className = 'advanced-arrow';
            arrow.title = "Toggle Advanced Pins";
            arrow.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                node.showAdvanced = !node.showAdvanced;
                const evt = new CustomEvent('node-refresh', { detail: { nodeId: node.id } });
                window.dispatchEvent(evt);
            });
            el.appendChild(arrow);
        }

        return el;
    }

    col(cls) {
        const d = document.createElement('div');
        d.className = `col ${cls}`;
        return d;
    }

    renderPin(pin) {
        const row = document.createElement('div');
        row.className = 'pin-row';
        
        const shape = document.createElement('div');
        shape.className = `pin ${pin.type}`;
        shape.dataset.node = pin.nodeId;
        shape.dataset.index = pin.index;
        shape.dataset.type = pin.direction;
        shape.dataset.dataType = pin.dataType;
        shape.dataset.id = pin.id;

        const typeDef = window.typeDefinitions[pin.type] || { color: '#999' };
        shape.style.setProperty('--pin-color', typeDef.color);

        const label = document.createElement('span');
        label.className = 'pin-label';
        label.innerText = pin.name;

        let widgetEl = null;
        if (pin.widget) {
            widgetEl = this.widgetRenderer.render(pin.widget, (val) => { pin.value = val; });
        }

        if (pin.direction === 'input') {
            row.append(shape);
            if (pin.name) row.append(label);
            if (widgetEl) row.append(widgetEl);
        } else {
            if (pin.name) row.append(label);
            row.append(shape);
        }
        return row;
    }
}