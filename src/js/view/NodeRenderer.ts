/**
 * NodeRenderer Class
 * Responsible for creating the HTML structure of a single Node.
 * It handles the layout (Header, Body, Columns), Pin rendering, and the Advanced Expansion arrow.
 * It delegates Widget creation to the WidgetRenderer.
 */
import { WidgetRenderer } from "./WidgetRenderer";

export class NodeRenderer {
    constructor() {
        // Helper to render input widgets (text boxes, checkboxes, etc.)
        this.widgetRenderer = new WidgetRenderer();
    }

    /**
     * Creates the main DOM element for a Node.
     * @param {Node} node - The Node Model object containing data and state.
     * @returns {HTMLElement} The complete .node DOM element.
     */
    createElement(node) {
        const el = document.createElement('div');
        const isRerouteNode = node.functionId === 'Flow.RerouteData' || node.functionId === 'Flow.RerouteExec';

        if (isRerouteNode) {
            return this.createRerouteElement(node, el);
        }
        
        // Apply classes: 'compact' for math nodes, 'expanded' for advanced view
        el.className = `node ${node.hideHeader ? 'compact' : ''} ${node.showAdvanced ? 'expanded' : ''}`;
        el.id = `node-${node.id}`;
        
        // Positioning
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        
        // Styling Overrides (Width & Color)
        if (node.width) el.style.width = `${node.width}px`;
        if (node.color) el.style.setProperty('--header-bg', node.color);

        // 1. Header (Name & Color)
        if (!node.hideHeader) {
            const header = document.createElement('div');
            header.className = 'node-header';
            header.innerText = node.name;
            header.style.background = node.color;
            el.appendChild(header);
        }

        // 2. Body (Grid Layout)
        const body = document.createElement('div');
        body.className = 'node-body';
        const left = this.col('col-left');     // Input Pins
        const center = this.col('col-center'); // Center Label
        const right = this.col('col-right');   // Output Pins

        // Center Label (used for Math nodes like "+")
        if (node.centerLabel) {
            const lbl = document.createElement('div');
            lbl.className = 'center-label';
            lbl.innerText = node.centerLabel;
            center.appendChild(lbl);
        }

        // Render Input Pins (Filter out hidden advanced pins)
        node.inputs.forEach(p => {
            if (!p.advanced || node.showAdvanced) left.appendChild(this.renderPin(p));
        });

        if (node.functionId === "Array.Make") {
            const addPinRow = document.createElement('div');
            addPinRow.className = 'pin-row make-array-add-row';

            const addPinBtn = document.createElement('button');
            addPinBtn.type = 'button';
            addPinBtn.className = 'make-array-add-pin-circle';
            addPinBtn.innerText = '+';
            const arrayOutputPin = node.outputs.find((pin) => pin.isArray) || node.outputs[0];
            const typeDef = arrayOutputPin ? (window.typeDefinitions[arrayOutputPin.type] || { color: '#999' }) : { color: '#999' };
            addPinBtn.style.setProperty('--pin-color', typeDef.color);
            addPinBtn.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('node-add-make-array-pin', { detail: { nodeId: node.id } }));
            });
            addPinBtn.addEventListener('touchstart', (event) => {
                event.stopPropagation();
            }, { passive: true });
            addPinBtn.addEventListener('touchend', (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('node-add-make-array-pin', { detail: { nodeId: node.id } }));
            }, { passive: false });

            addPinRow.appendChild(addPinBtn);
            left.appendChild(addPinRow);
        }

        // Render Output Pins (Filter out hidden advanced pins)
        node.outputs.forEach(p => {
            if (!p.advanced || node.showAdvanced) right.appendChild(this.renderPin(p));
        });

        body.append(left, center, right);
        el.appendChild(body);

        // 3. Advanced Expansion Arrow
        // Only rendered if the node actually has advanced pins
        if (node.hasAdvancedPins()) {
            const arrow = document.createElement('div');
            arrow.className = 'advanced-arrow';
            arrow.title = "Toggle Advanced Pins";
            
            // Toggle Event
            arrow.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent node drag
                node.showAdvanced = !node.showAdvanced; // Toggle state in Model
                
                // Dispatch event to request a full re-render of this node
                const evt = new CustomEvent('node-refresh', { detail: { nodeId: node.id } });
                window.dispatchEvent(evt);
            });
            el.appendChild(arrow);
        }

        return el;
    }

    createRerouteElement(node, el) {
        el.className = 'node reroute';
        el.id = `node-${node.id}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;

        const rerouteType = (node.outputs && node.outputs[0] && node.outputs[0].type)
            || (node.inputs && node.inputs[0] && node.inputs[0].type)
            || 'wildcard';
        const typeDef = window.typeDefinitions[rerouteType] || window.typeDefinitions.wildcard || { color: '#fff' };
        el.style.setProperty('--reroute-color', typeDef.color);

        const dot = document.createElement('div');
        dot.className = 'reroute-dot';
        el.appendChild(dot);

        const grabZone = document.createElement('div');
        grabZone.className = 'reroute-grab';
        el.appendChild(grabZone);

        const inPin = this.renderReroutePin(node.inputs[0], 'reroute-pin-in');
        const outPin = this.renderReroutePin(node.outputs[0], 'reroute-pin-out');
        if (inPin) el.appendChild(inPin);
        if (outPin) el.appendChild(outPin);

        return el;
    }

    /**
     * Helper to create a column div.
     * @param {String} cls - CSS class name.
     */
    col(cls) {
        const d = document.createElement('div');
        d.className = `col ${cls}`;
        return d;
    }

    /**
     * Creates the DOM for a single Pin (Shape + Label + Widget).
     * @param {Pin} pin - The Pin Model object.
     * @returns {HTMLElement} The .pin-row element.
     */
    renderPin(pin) {
        const row = document.createElement('div');
        row.className = 'pin-row';
        
        // The Pin Circle (Connection Point)
        const shape = document.createElement('div');
        const isArrayDataPin = pin.type !== 'exec' && !!pin.isArray;
        shape.className = `pin ${pin.type} ${isArrayDataPin ? 'array-pin' : ''}`;
        
        // Dataset attributes used by Interaction.js for wiring logic
        shape.dataset.node = pin.nodeId;
        shape.dataset.index = pin.index;
        shape.dataset.type = pin.direction;
        shape.dataset.dataType = pin.dataType;
        shape.dataset.id = pin.id;
        shape.dataset.isArray = pin.isArray ? 'true' : 'false';

        // Apply Data Type Color
        const typeDef = window.typeDefinitions[pin.type] || { color: '#999' };
        shape.style.setProperty('--pin-color', typeDef.color);
        if (isArrayDataPin) {
            shape.innerHTML = this.createArrayPinIconMarkup();
        }

        // Pin Label
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.innerText = pin.name;

        // Widget (If applicable)
        let widgetEl = null;
        if (pin.widget) {
            // Render widget and attach callback to sync value back to Model
            widgetEl = this.widgetRenderer.render(pin.widget, (val) => { pin.value = val; });
        }

        // Layout: Input (Pin -> Label -> Widget), Output (Label -> Pin)
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

    renderReroutePin(pin, sideClass) {
        if (!pin) return null;

        const shape = document.createElement('div');
        const isArrayDataPin = pin.type !== 'exec' && !!pin.isArray;
        shape.className = `pin ${pin.type} reroute-pin ${sideClass} ${isArrayDataPin ? 'array-pin' : ''}`;
        shape.dataset.node = pin.nodeId;
        shape.dataset.index = pin.index;
        shape.dataset.type = pin.direction;
        shape.dataset.dataType = pin.dataType;
        shape.dataset.id = pin.id;
        shape.dataset.isArray = pin.isArray ? 'true' : 'false';

        const typeDef = window.typeDefinitions[pin.type] || { color: '#999' };
        shape.style.setProperty('--pin-color', typeDef.color);
        if (isArrayDataPin) {
            shape.innerHTML = this.createArrayPinIconMarkup();
        }
        return shape;
    }

    createArrayPinIconMarkup() {
        return `
            <svg class="pin-array-icon" viewBox="0 0 24 24" fill="none" stroke="var(--pin-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            </svg>
        `;
    }
}
