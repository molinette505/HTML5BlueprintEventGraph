/**
 * VariableManager
 * Manages the definition of variables (Name, Type, Default Value)
 * and generates the corresponding Get/Set node templates.
 */
import { Widget } from "./core/Widget";
import { WidgetRenderer } from "./view/WidgetRenderer";

export class VariableManager {
    constructor(editor) {
        this.editor = editor;
        this.variables = []; // { name, type, defaultValue }
        this.customEvents = []; // { name }
        this.runtimeValues = {};
        this.lastAddedType = 'boolean';
        this.activeTouchVariableDrag = null;
        this.touchVariableDragThreshold = 8;

        // Helper to render widgets in the sidebar
        this.widgetRenderer = new WidgetRenderer();

        this.ui = {
            eventList: document.getElementById('event-list'),
            addEventBtn: document.getElementById('btn-add-event'),
            list: document.getElementById('var-list'),
            addBtn: document.getElementById('btn-add-var')
        };

        this.bindEvents();
    }

    bindEvents() {
        if(this.ui.addEventBtn) {
            this.ui.addEventBtn.onclick = () => this.addCustomEvent();
        }
        if(this.ui.addBtn) {
            this.ui.addBtn.onclick = () => this.addVariable();
        }
    }

    serializeDefinitions() {
        return {
            customEvents: JSON.parse(JSON.stringify(this.customEvents || [])),
            variables: JSON.parse(JSON.stringify(this.variables || []))
        };
    }

    loadDefinitions(definitions = {}) {
        const incomingEvents = Array.isArray(definitions.customEvents) ? definitions.customEvents : [];
        const incomingVariables = Array.isArray(definitions.variables) ? definitions.variables : [];

        this.customEvents = incomingEvents
            .map((evt) => ({ name: String(evt && evt.name ? evt.name : "").trim() }))
            .filter((evt) => !!evt.name);

        this.variables = incomingVariables
            .map((variable) => ({
                name: String(variable && variable.name ? variable.name : "").trim(),
                type: variable && variable.type ? variable.type : 'boolean',
                defaultValue: variable && variable.defaultValue !== undefined
                    ? variable.defaultValue
                    : this.getTypeDefault(variable && variable.type ? variable.type : 'boolean')
            }))
            .filter((variable) => !!variable.name);

        this.lastAddedType = this.variables.length > 0
            ? this.variables[this.variables.length - 1].type
            : 'boolean';
        this.renderList();
    }

    ensureCustomEvent(name) {
        if (!name) return;
        if (this.customEvents.find(e => e.name === name)) return;
        this.customEvents.push({ name });
        this.renderList();
    }

    addCustomEvent() {
        let name = "CustomEvent";
        let count = 0;
        while (this.customEvents.find(e => e.name === name)) {
            count += 1;
            name = `CustomEvent_${count}`;
        }
        this.customEvents.push({ name });
        this.renderList();
    }

    deleteCustomEvent(name) {
        this.customEvents = this.customEvents.filter(e => e.name !== name);

        const nodesToRemove = this.editor.graph.nodes
            .filter(n => n.customEventName === name)
            .map(n => n.id);

        nodesToRemove.forEach(id => {
            this.editor.graph.removeNode(id);
            const el = document.getElementById(`node-${id}`);
            if (el) el.remove();
        });

        this.editor.renderer.render();
        this.renderList();
    }

    renameCustomEvent(oldName, nextNameRaw) {
        const nextName = String(nextNameRaw || "").trim();
        if (!nextName || nextName === oldName) return;
        if (this.customEvents.find(e => e.name === nextName)) {
            this.renderList();
            return;
        }

        const item = this.customEvents.find(e => e.name === oldName);
        if (!item) return;
        item.name = nextName;

        this.editor.graph.nodes.forEach(node => {
            if (node.customEventName !== oldName) return;
            node.customEventName = nextName;
            if (node.functionId === "Flow.CustomEvent") node.name = nextName;
            if (node.functionId === "Flow.CallCustomEvent") node.name = `Call ${nextName}`;
            this.editor.renderer.refreshNode(node);
        });

        this.renderList();
    }

    _isInteractiveVariableControl(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('input, select, button, textarea, .node-widget');
    }

    _beginTouchVariableDrag(event, payload) {
        if (!event.touches || event.touches.length !== 1) return;
        if (this._isInteractiveVariableControl(event.target)) return;

        const touch = event.touches[0];
        this.activeTouchVariableDrag = {
            touchId: touch.identifier,
            itemType: payload.itemType,
            itemName: payload.itemName,
            itemSubType: payload.itemSubType,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            dragging: false,
            ghost: null
        };
    }

    _updateTouchVariableDrag(event) {
        const drag = this.activeTouchVariableDrag;
        if (!drag) return;

        const touch = Array.from(event.touches || []).find(t => t.identifier === drag.touchId);
        if (!touch) return;

        drag.lastX = touch.clientX;
        drag.lastY = touch.clientY;

        if (!drag.dragging) {
            const distance = Math.hypot(drag.lastX - drag.startX, drag.lastY - drag.startY);
            if (distance <= this.touchVariableDragThreshold) return;

            drag.dragging = true;
            const ghost = document.createElement('div');
            ghost.className = 'var-drag-ghost';
            ghost.textContent = drag.itemName;
            document.body.appendChild(ghost);
            drag.ghost = ghost;
        }

        if (drag.ghost) {
            drag.ghost.style.left = `${drag.lastX + 14}px`;
            drag.ghost.style.top = `${drag.lastY + 14}px`;
        }
        event.preventDefault();
    }

    _endTouchVariableDrag(event) {
        const drag = this.activeTouchVariableDrag;
        if (!drag) return;

        const touch = Array.from(event.changedTouches || []).find(t => t.identifier === drag.touchId);
        if (!touch) return;

        if (drag.dragging) {
            const dropX = touch.clientX;
            const dropY = touch.clientY;
            const graphContainer = this.editor.dom.container;
            const dropTarget = document.elementFromPoint(dropX, dropY);
            if (graphContainer && dropTarget && graphContainer.contains(dropTarget)) {
                const rect = graphContainer.getBoundingClientRect();
                const gx = (dropX - rect.left - this.editor.graph.pan.x) / this.editor.graph.scale;
                const gy = (dropY - rect.top - this.editor.graph.pan.y) / this.editor.graph.scale;
                if (drag.itemType === 'custom-event') {
                    this.editor.showCustomEventMenu(dropX, dropY, drag.itemName, gx, gy);
                } else {
                    this.editor.showVariableMenu(dropX, dropY, drag.itemName, gx, gy);
                }
            }
            event.preventDefault();
        }

        this._clearTouchVariableDrag();
    }

    _clearTouchVariableDrag() {
        if (this.activeTouchVariableDrag && this.activeTouchVariableDrag.ghost) {
            this.activeTouchVariableDrag.ghost.remove();
        }
        this.activeTouchVariableDrag = null;
    }

    addVariable() {
        let name = "NewVar";
        let count = 0;
        while(this.variables.find(v => v.name === name)) {
            count++;
            name = `NewVar_${count}`;
        }

        const selectedType = this.variables.length === 0
            ? 'boolean'
            : (this.lastAddedType || 'boolean');

        const newVar = {
            name: name,
            type: selectedType,
            defaultValue: this.getTypeDefault(selectedType)
        };

        this.variables.push(newVar);
        this.lastAddedType = selectedType;
        this.renderList();
    }

    deleteVariable(name) {
        // 1. Remove from Data Model
        this.variables = this.variables.filter(v => v.name !== name);
        
        // 2. [FIX] Remove associated nodes from Graph
        // We collect IDs first to avoid modifying the array while iterating
        const nodesToRemove = this.editor.graph.nodes
            .filter(n => n.varName === name)
            .map(n => n.id);

        nodesToRemove.forEach(id => {
            this.editor.graph.removeNode(id);
            
            // Remove DOM element
            const el = document.getElementById(`node-${id}`);
            if(el) el.remove();
        });

        // 3. Re-render View
        this.editor.renderer.render(); // Redraw wires (since nodes are gone)
        this.renderList();
    }

    updateVariable(oldName, key, value) {
        const v = this.variables.find(i => i.name === oldName);
        if(!v) return;

        v[key] = value;
        let shouldRenderList = false;
        
        if (key === 'type') {
            v.defaultValue = this.getTypeDefault(value);
            this.lastAddedType = value;
            this.updateGraphNodes(v.name, value);
            shouldRenderList = true;
        }

        if (key === 'name') {
            shouldRenderList = true;
        }

        if (shouldRenderList) {
            this.renderList();
        }
    }

    updateGraphNodes(varName, newType) {
        const graph = this.editor.graph;
        const renderer = this.editor.renderer;
        const color = this.getTypeColor(newType);
        const defaultValue = this.getTypeDefault(newType);

        graph.nodes.forEach(node => {
            if (node.varName === varName) {
                
                node.color = color; 

                if (node.functionId === "Variable.Get") {
                    if(node.outputs[0]) {
                        node.outputs[0].type = newType;
                        node.outputs[0].dataType = newType;
                    }
                } 
                else if (node.functionId === "Variable.Set") {
                    if(node.inputs[1]) {
                        const pin = node.inputs[1];
                        pin.type = newType;
                        pin.dataType = newType;
                        
                        const config = this.getWidgetConfig(newType, defaultValue);
                        if (config) {
                            pin.widget = new Widget(config.type, config.value);
                        } else {
                            pin.widget = null;
                        }
                    }
                    if(node.outputs[1]) {
                        node.outputs[1].type = newType;
                        node.outputs[1].dataType = newType;
                    }
                }
                renderer.refreshNode(node);
            }
        });
    }

    // ... (Rest of methods: getTypeDefault, getTypeColor, getWidgetConfig, etc. remain the same) ...

    getTypeDefault(type) {
        switch(type) {
            case 'boolean': return false;
            case 'int': return 0;
            case 'float': return 0.0;
            case 'string': return "";
            case 'vector': return {x:0, y:0, z:0};
            default: return null;
        }
    }

    getTypeColor(type) {
        switch(type) {
            case 'boolean': return 'var(--c-boolean)'; 
            case 'int':     return 'var(--c-int)';    
            case 'float':   return 'var(--c-float)';  
            case 'string':  return 'var(--c-string)'; 
            case 'vector':  return 'var(--c-vector)'; 
            default:        return 'gray';
        }
    }

    getWidgetConfig(type, value) {
        switch(type) {
            case 'boolean': return { type: 'checkbox', value: value };
            case 'int':     return { type: 'number', value: value };
            case 'float':   return { type: 'number', value: value };
            case 'string':  return { type: 'text', value: value };
            case 'vector':  return { type: 'vector3', value: value };
            default: return null; 
        }
    }

    renderList() {
        if(!this.ui.list || !this.ui.eventList) return;
        this.ui.list.innerHTML = '';
        this.ui.eventList.innerHTML = '';

        this.customEvents.forEach((evt) => {
            const row = document.createElement('div');
            row.className = 'event-row';

            const nameInput = document.createElement('input');
            nameInput.value = evt.name;
            nameInput.className = 'event-name';
            nameInput.onchange = (e) => this.renameCustomEvent(evt.name, e.target.value);

            const delBtn = document.createElement('button');
            delBtn.innerText = '×';
            delBtn.className = 'var-del';
            delBtn.onclick = () => this.deleteCustomEvent(evt.name);

            row.draggable = true;
            row.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'custom-event',
                    name: evt.name
                }));
            };
            row.addEventListener('touchstart', (e) => this._beginTouchVariableDrag(e, {
                itemType: 'custom-event',
                itemName: evt.name
            }), { passive: true });
            row.addEventListener('touchmove', (e) => this._updateTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchend', (e) => this._endTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchcancel', () => this._clearTouchVariableDrag(), { passive: true });

            row.append(nameInput, delBtn);
            this.ui.eventList.appendChild(row);
        });

        this.variables.forEach(v => {
            const row = document.createElement('div');
            row.className = 'var-row';
            row.style.display = 'flex';
            row.style.flexDirection = 'row';
            row.style.alignItems = 'stretch';
            row.style.gap = '8px';
            row.style.padding = '8px';
            
            const typeIndicator = document.createElement('div');
            typeIndicator.style.width = '4px';
            typeIndicator.style.backgroundColor = this.getTypeColor(v.type);
            typeIndicator.style.borderRadius = '2px';
            typeIndicator.style.flexShrink = '0';

            const col = document.createElement('div');
            col.style.display = 'flex';
            col.style.flexDirection = 'column';
            col.style.flexGrow = '1';
            col.style.gap = '6px';
            col.style.minWidth = '0';

                const topRow = document.createElement('div');
                topRow.style.display = 'flex';
                topRow.style.justifyContent = 'space-between';
                topRow.style.alignItems = 'center';
                topRow.style.gap = '5px';

                    const nameInput = document.createElement('input');
                    nameInput.value = v.name;
                    nameInput.className = 'var-name';
                    nameInput.style.flexGrow = '1';
                    nameInput.style.minWidth = '0';
                    nameInput.onchange = (e) => this.updateVariable(v.name, 'name', e.target.value);

                    const delBtn = document.createElement('button');
                    delBtn.innerText = '×';
                    delBtn.className = 'var-del';
                    delBtn.onclick = () => this.deleteVariable(v.name);

                topRow.append(nameInput, delBtn);

                const botRow = document.createElement('div');
                botRow.style.display = 'flex';
                botRow.style.alignItems = 'center';
                botRow.style.gap = '8px';
                botRow.style.flexWrap = 'wrap'; 

                    const typeSelect = document.createElement('select');
                    typeSelect.className = 'var-type';
                    typeSelect.style.width = '70px'; 
                    ['boolean', 'int', 'float', 'string', 'vector'].forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t;
                        opt.innerText = t;
                        if(t === v.type) opt.selected = true;
                        typeSelect.appendChild(opt);
                    });
                    typeSelect.onchange = (e) => this.updateVariable(v.name, 'type', e.target.value);

                    const defContainer = document.createElement('div');
                    defContainer.className = 'var-default';
                    defContainer.style.flexGrow = '1'; 
                    defContainer.style.display = 'flex';
                    defContainer.style.justifyContent = 'flex-start';
                    
                    const widgetConfig = this.getWidgetConfig(v.type, v.defaultValue);
                    if (widgetConfig) {
                        const widgetEl = this.widgetRenderer.render(widgetConfig, (newVal) => {
                            this.updateVariable(v.name, 'defaultValue', newVal);
                        });
                        
                        if (widgetEl) {
                            if (v.type === 'string' || v.type === 'int' || v.type === 'float') {
                                widgetEl.style.width = '60px'; 
                                widgetEl.style.minWidth = '40px';
                            } 
                            else if (v.type === 'boolean') {
                                widgetEl.style.width = 'auto';
                            }
                            else if (v.type === 'vector') {
                                widgetEl.style.width = '100%';
                                widgetEl.style.minWidth = '120px';
                            }
                            
                            defContainer.appendChild(widgetEl);
                        }
                    }

                botRow.append(typeSelect, defContainer);

            col.append(topRow, botRow);

            row.draggable = true;
            row.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'variable',
                    name: v.name,
                    varType: v.type
                }));
            };
            row.addEventListener('touchstart', (e) => this._beginTouchVariableDrag(e, {
                itemType: 'variable',
                itemName: v.name,
                itemSubType: v.type
            }), { passive: true });
            row.addEventListener('touchmove', (e) => this._updateTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchend', (e) => this._endTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchcancel', () => this._clearTouchVariableDrag(), { passive: true });

            row.append(typeIndicator, col);
            this.ui.list.appendChild(row);
        });
    }

    resetRuntime() {
        this.runtimeValues = {};
        this.variables.forEach(v => {
            this.runtimeValues[v.name] = (typeof v.defaultValue === 'object' && v.defaultValue !== null) 
                ? JSON.parse(JSON.stringify(v.defaultValue))
                : v.defaultValue;
        });
    }

    createGetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        return {
            name: `Get ${v.name}`,
            category: "My Blueprint",
            color: this.getTypeColor(v.type), 
            functionId: "Variable.Get",
            varName: varName, // Ensure this is in template so copy/paste works immediately on creation
            inputs: [], 
            outputs: [
                { name: v.name, type: v.type }
            ]
        };
    }

    createSetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        const widgetConfig = this.getWidgetConfig(v.type, v.defaultValue);
        const widgetType = widgetConfig ? widgetConfig.type : null;
        const widgetDefault = widgetConfig ? widgetConfig.value : this.getTypeDefault(v.type);

        return {
            name: `Set ${v.name}`,
            category: "My Blueprint",
            color: this.getTypeColor(v.type), 
            functionId: "Variable.Set",
            varName: varName, // Ensure this is in template
            inputs: [
                { name: "Exec", type: "exec" },
                { name: v.name, type: v.type, widget: widgetType, default: widgetDefault } 
            ],
            outputs: [
                { name: "Out", type: "exec" },
                { name: "", type: v.type } 
            ]
        };
    }

    createCustomEventTemplate(eventName) {
        const evt = this.customEvents.find(e => e.name === eventName);
        if (!evt) return null;

        return {
            name: evt.name,
            category: "Custom Events",
            color: "var(--n-event)",
            functionId: "Flow.CustomEvent",
            customEventName: evt.name,
            outputs: [
                { name: "Out", type: "exec" }
            ]
        };
    }

    createCallCustomEventTemplate(eventName) {
        const evt = this.customEvents.find(e => e.name === eventName);
        if (!evt) return null;

        return {
            name: `Call ${evt.name}`,
            category: "Custom Events",
            color: "var(--n-func)",
            functionId: "Flow.CallCustomEvent",
            customEventName: evt.name,
            inputs: [
                { name: "Exec", type: "exec" }
            ],
            outputs: [
                { name: "Out", type: "exec" }
            ]
        };
    }
}
