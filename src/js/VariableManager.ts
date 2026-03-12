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
        this.variables = []; // { name, type, isArray, defaultValue }
        this.customEvents = []; // { name }
        this.runtimeValues = {};
        this.lastAddedType = 'boolean';
        this.lastAddedIsArray = false;
        this.activeTouchVariableDrag = null;
        this.touchVariableDragThreshold = 8;
        this.activeVariableContextMenuTarget = null;

        // Helper to render widgets in the sidebar
        this.widgetRenderer = new WidgetRenderer();

        this.ui = {
            eventList: document.getElementById('event-list'),
            addEventBtn: document.getElementById('btn-add-event'),
            list: document.getElementById('var-list'),
            addBtn: document.getElementById('btn-add-var'),
            watchOverlay: document.getElementById('variable-watch-overlay')
        };

        this.createVariableContextMenu();

        this.bindEvents();
    }

    bindEvents() {
        if(this.ui.addEventBtn) {
            this.ui.addEventBtn.onclick = () => this.addCustomEvent();
        }
        if(this.ui.addBtn) {
            this.ui.addBtn.onclick = () => this.addVariable();
        }

        window.addEventListener('mousedown', (event) => {
            if (!this.variableContextMenu) return;
            if (!this.variableContextMenu.classList.contains('visible')) return;
            if (this.variableContextMenu.contains(event.target)) return;
            this.hideVariableContextMenu();
        });

        window.addEventListener('contextmenu', (event) => {
            if (!this.variableContextMenu) return;
            if (!this.variableContextMenu.classList.contains('visible')) return;
            if (this.variableContextMenu.contains(event.target)) return;
            this.hideVariableContextMenu();
        });
    }

    createVariableContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'variable-context-menu';
        menu.className = 'drawer-context-menu';
        menu.innerHTML = '<ul></ul>';
        document.body.appendChild(menu);
        this.variableContextMenu = menu;
        this.variableContextMenuList = menu.querySelector('ul');
    }

    hideVariableContextMenu() {
        if (!this.variableContextMenu) return;
        this.variableContextMenu.classList.remove('visible');
        this.activeVariableContextMenuTarget = null;
    }

    showVariableContextMenu(clientX, clientY, variableName) {
        if (!this.variableContextMenu || !this.variableContextMenuList) return;
        this.activeVariableContextMenuTarget = variableName;
        this.variableContextMenuList.innerHTML = '';

        const addOption = (label, handler) => {
            const item = document.createElement('li');
            item.className = 'drawer-context-item';
            item.innerText = label;
            item.onmousedown = (event) => {
                event.preventDefault();
                event.stopPropagation();
            };
            item.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                handler();
                this.hideVariableContextMenu();
            };
            this.variableContextMenuList.appendChild(item);
        };

        const isWatched = this.isVariableWatched(variableName);
        addOption(isWatched ? 'Unwatch Variable' : 'Watch Variable', () => this.toggleVariableWatch(variableName));

        this.variableContextMenu.style.left = `${clientX}px`;
        this.variableContextMenu.style.top = `${clientY}px`;
        this.variableContextMenu.classList.add('visible');

        const rect = this.variableContextMenu.getBoundingClientRect();
        let adjustedX = clientX;
        let adjustedY = clientY;
        if (rect.right > window.innerWidth - 8) {
            adjustedX = Math.max(8, window.innerWidth - rect.width - 8);
        }
        if (rect.bottom > window.innerHeight - 8) {
            adjustedY = Math.max(8, window.innerHeight - rect.height - 8);
        }
        this.variableContextMenu.style.left = `${adjustedX}px`;
        this.variableContextMenu.style.top = `${adjustedY}px`;
    }

    getSupportedScalarTypes() {
        return ['boolean', 'int', 'float', 'string', 'vector'];
    }

    getVariablePinType(variable) {
        if (!variable) return 'wildcard';
        return variable.isArray ? `${variable.type}[]` : variable.type;
    }

    cloneValue(value) {
        if (typeof value === 'object' && value !== null) {
            return JSON.parse(JSON.stringify(value));
        }
        return value;
    }

    coerceScalarValue(type, value) {
        if (value === undefined || value === null) return this.getTypeDefault(type);
        switch (type) {
            case 'boolean':
                return !!value;
            case 'int': {
                const parsedInt = Number.parseInt(value, 10);
                return Number.isFinite(parsedInt) ? parsedInt : 0;
            }
            case 'float': {
                const parsedFloat = Number.parseFloat(value);
                return Number.isFinite(parsedFloat) ? parsedFloat : 0.0;
            }
            case 'string':
                return String(value);
            case 'vector':
                if (typeof value === 'object' && value !== null) {
                    const x = Number(value.x);
                    const y = Number(value.y);
                    const z = Number(value.z);
                    return {
                        x: Number.isFinite(x) ? x : 0,
                        y: Number.isFinite(y) ? y : 0,
                        z: Number.isFinite(z) ? z : 0
                    };
                }
                return this.getTypeDefault('vector');
            default:
                return value;
        }
    }

    normalizeVariableDefinition(rawVariable) {
        const supportedTypes = this.getSupportedScalarTypes();
        const variable = rawVariable && typeof rawVariable === 'object' ? rawVariable : {};
        const rawType = String(variable.type || 'boolean');
        const isArray = !!variable.isArray || rawType.endsWith('[]');
        let scalarType = rawType.endsWith('[]') ? rawType.slice(0, -2) : rawType;
        if (!supportedTypes.includes(scalarType)) scalarType = 'boolean';

        let defaultValue;
        if (isArray) {
            const incoming = Array.isArray(variable.defaultValue) ? variable.defaultValue : [];
            defaultValue = incoming.map((entry) => this.coerceScalarValue(scalarType, entry));
        } else if (variable.defaultValue !== undefined) {
            defaultValue = this.coerceScalarValue(scalarType, variable.defaultValue);
        } else {
            defaultValue = this.getTypeDefault(scalarType);
        }

        return {
            name: String(variable.name || '').trim(),
            type: scalarType,
            isArray,
            defaultValue,
            watched: !!variable.watched
        };
    }

    normalizeVariableDefaultValue(variable) {
        if (!variable) return;
        if (variable.isArray) {
            const incoming = Array.isArray(variable.defaultValue) ? variable.defaultValue : [];
            variable.defaultValue = incoming.map((entry) => this.coerceScalarValue(variable.type, entry));
        } else {
            variable.defaultValue = this.coerceScalarValue(variable.type, variable.defaultValue);
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
            .map((variable) => this.normalizeVariableDefinition(variable))
            .filter((variable) => !!variable.name);

        this.lastAddedType = this.variables.length > 0
            ? this.variables[this.variables.length - 1].type
            : 'boolean';
        this.lastAddedIsArray = this.variables.length > 0
            ? !!this.variables[this.variables.length - 1].isArray
            : false;
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
            isArray: this.variables.length > 0 ? !!this.lastAddedIsArray : false,
            defaultValue: this.getTypeDefault(selectedType),
            watched: false
        };
        if (newVar.isArray) newVar.defaultValue = [];

        this.variables.push(newVar);
        this.lastAddedType = selectedType;
        this.lastAddedIsArray = !!newVar.isArray;
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

    isVariableWatched(name) {
        const variable = this.variables.find((entry) => entry.name === name);
        return !!(variable && variable.watched);
    }

    toggleVariableWatch(name) {
        const variable = this.variables.find((entry) => entry.name === name);
        if (!variable) return;
        variable.watched = !variable.watched;
        this.renderWatchedVariableOverlay();
    }

    updateVariable(oldName, key, value) {
        const v = this.variables.find(i => i.name === oldName);
        if(!v) return;

        const previousName = v.name;
        v[key] = value;
        let shouldRenderList = false;
        
        if (key === 'type') {
            this.normalizeVariableDefaultValue(v);
            this.lastAddedType = value;
            this.lastAddedIsArray = !!v.isArray;
            this.updateGraphNodes(v.name, value, !!v.isArray);
            shouldRenderList = true;
        }

        if (key === 'isArray') {
            v.isArray = !!value;
            if (v.isArray) {
                if (!Array.isArray(v.defaultValue)) v.defaultValue = [];
                v.defaultValue = v.defaultValue.map((entry) => this.coerceScalarValue(v.type, entry));
            } else {
                if (Array.isArray(v.defaultValue)) {
                    v.defaultValue = v.defaultValue.length > 0
                        ? this.coerceScalarValue(v.type, v.defaultValue[0])
                        : this.getTypeDefault(v.type);
                } else {
                    v.defaultValue = this.coerceScalarValue(v.type, v.defaultValue);
                }
            }
            this.lastAddedIsArray = v.isArray;
            this.updateGraphNodes(v.name, v.type, !!v.isArray);
            shouldRenderList = true;
        }

        if (key === 'name') {
            const nextName = String(value || '').trim();
            if (!nextName || (nextName !== previousName && this.variables.some((candidate) => candidate !== v && candidate.name === nextName))) {
                v.name = previousName;
                shouldRenderList = true;
            } else if (nextName !== previousName) {
                v.name = nextName;
                this.editor.graph.nodes.forEach((node) => {
                    if (node.varName !== previousName) return;
                    node.varName = nextName;
                    node.name = node.functionId === "Variable.Set"
                        ? `Set ${nextName}`
                        : `Get ${nextName}`;
                    this.editor.renderer.refreshNode(node);
                });
            }
            shouldRenderList = true;
        }

        if (shouldRenderList) {
            this.renderList();
        }
    }

    updateGraphNodes(varName, newType, isArray = false) {
        const graph = this.editor.graph;
        const renderer = this.editor.renderer;
        const color = this.getTypeColor(newType);
        const pinType = isArray ? `${newType}[]` : newType;
        const defaultValue = isArray ? [] : this.getTypeDefault(newType);

        graph.nodes.forEach(node => {
            if (node.varName === varName) {
                
                node.color = color; 

                if (node.functionId === "Variable.Get") {
                    if(node.outputs[0]) {
                        node.outputs[0].isArray = isArray;
                        node.outputs[0].setType(pinType);
                        graph.disconnectPin(node.id, node.outputs[0].index, 'output');
                    }
                } 
                else if (node.functionId === "Variable.Set") {
                    if(node.inputs[1]) {
                        const pin = node.inputs[1];
                        pin.isArray = isArray;
                        pin.setType(pinType);
                        
                        const config = isArray ? null : this.getWidgetConfig(newType, defaultValue);
                        if (config) {
                            pin.widget = new Widget(config.type, config.value);
                        } else {
                            pin.widget = null;
                            pin.value = this.cloneValue(defaultValue);
                        }
                        graph.disconnectPin(node.id, pin.index, 'input');
                    }
                    if(node.outputs[1]) {
                        node.outputs[1].isArray = isArray;
                        node.outputs[1].setType(pinType);
                        graph.disconnectPin(node.id, node.outputs[1].index, 'output');
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
        this.hideVariableContextMenu();
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

                    const kindSelect = document.createElement('select');
                    kindSelect.className = 'var-type';
                    kindSelect.style.width = '92px';
                    [
                        { value: 'scalar', label: 'Variable' },
                        { value: 'array', label: 'Array' }
                    ].forEach((entry) => {
                        const opt = document.createElement('option');
                        opt.value = entry.value;
                        opt.innerText = entry.label;
                        if ((v.isArray ? 'array' : 'scalar') === entry.value) opt.selected = true;
                        kindSelect.appendChild(opt);
                    });
                    kindSelect.onchange = (e) => this.updateVariable(v.name, 'isArray', e.target.value === 'array');

                    const defContainer = document.createElement('div');
                    defContainer.className = 'var-default';
                    defContainer.style.flexGrow = '1'; 
                    defContainer.style.display = 'flex';
                    defContainer.style.justifyContent = 'flex-start';
                    defContainer.style.minWidth = '0';
                    defContainer.style.flexDirection = 'column';
                    defContainer.style.gap = '6px';

                    if (v.isArray) {
                        const arrayList = document.createElement('div');
                        arrayList.className = 'var-array-list';

                        if (!Array.isArray(v.defaultValue)) v.defaultValue = [];
                        v.defaultValue.forEach((entryValue, entryIndex) => {
                            const arrayRow = document.createElement('div');
                            arrayRow.className = 'var-array-item';

                            const indexLabel = document.createElement('span');
                            indexLabel.className = 'var-array-index';
                            indexLabel.innerText = `[${entryIndex}]`;

                            const widgetConfig = this.getWidgetConfig(v.type, entryValue);
                            let widgetEl = null;
                            if (widgetConfig) {
                                widgetEl = this.widgetRenderer.render(widgetConfig, (newVal) => {
                                    const currentVar = this.variables.find((variable) => variable.name === v.name);
                                    if (!currentVar || !Array.isArray(currentVar.defaultValue)) return;
                                    currentVar.defaultValue[entryIndex] = this.coerceScalarValue(currentVar.type, newVal);
                                });
                            }
                            if (!widgetEl) {
                                const fallback = document.createElement('span');
                                fallback.innerText = String(entryValue);
                                widgetEl = fallback;
                            }
                            widgetEl.classList.add('var-array-widget');

                            const removeElementBtn = document.createElement('button');
                            removeElementBtn.type = 'button';
                            removeElementBtn.className = 'var-array-remove';
                            removeElementBtn.innerText = '×';
                            removeElementBtn.onclick = () => {
                                const currentVar = this.variables.find((variable) => variable.name === v.name);
                                if (!currentVar || !Array.isArray(currentVar.defaultValue)) return;
                                currentVar.defaultValue.splice(entryIndex, 1);
                                this.renderList();
                            };

                            arrayRow.append(indexLabel, widgetEl, removeElementBtn);
                            arrayList.appendChild(arrayRow);
                        });

                        const addElementBtn = document.createElement('button');
                        addElementBtn.type = 'button';
                        addElementBtn.className = 'btn-small var-array-add';
                        addElementBtn.innerText = '+ Elem';
                        addElementBtn.onclick = () => {
                            const currentVar = this.variables.find((variable) => variable.name === v.name);
                            if (!currentVar) return;
                            if (!Array.isArray(currentVar.defaultValue)) currentVar.defaultValue = [];
                            currentVar.defaultValue.push(this.getTypeDefault(currentVar.type));
                            this.renderList();
                        };

                        defContainer.append(arrayList, addElementBtn);
                    } else {
                        const widgetConfig = this.getWidgetConfig(v.type, v.defaultValue);
                        if (widgetConfig) {
                            const widgetEl = this.widgetRenderer.render(widgetConfig, (newVal) => {
                                this.updateVariable(v.name, 'defaultValue', this.coerceScalarValue(v.type, newVal));
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
                    }

                botRow.append(kindSelect, typeSelect, defContainer);

            col.append(topRow, botRow);

            row.draggable = true;
            row.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'variable',
                    name: v.name,
                    varType: this.getVariablePinType(v)
                }));
            };
            row.addEventListener('touchstart', (e) => this._beginTouchVariableDrag(e, {
                itemType: 'variable',
                itemName: v.name,
                itemSubType: this.getVariablePinType(v)
            }), { passive: true });
            row.addEventListener('touchmove', (e) => this._updateTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchend', (e) => this._endTouchVariableDrag(e), { passive: false });
            row.addEventListener('touchcancel', () => this._clearTouchVariableDrag(), { passive: true });
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showVariableContextMenu(e.clientX, e.clientY, v.name);
            });

            row.append(typeIndicator, col);
            this.ui.list.appendChild(row);
        });

        this.renderWatchedVariableOverlay();
    }

    resetRuntime() {
        this.runtimeValues = {};
        this.variables.forEach(v => {
            this.runtimeValues[v.name] = this.cloneValue(v.defaultValue);
        });
        this.renderWatchedVariableOverlay();
    }

    formatWatchedVariableValue(value) {
        if (value === undefined) return '';
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            const shown = value.slice(0, 3).map((entry) => this.formatWatchedVariableValue(entry));
            const suffix = value.length > 3 ? ', ...' : '';
            return `[${shown.join(', ')}${suffix}]`;
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return Number.isFinite(value) ? String(parseFloat(value.toFixed(3))) : String(value);
        if (typeof value === 'object') {
            if ('x' in value && 'y' in value && 'z' in value) {
                return `(${this.formatWatchedVariableValue(value.x)}, ${this.formatWatchedVariableValue(value.y)}, ${this.formatWatchedVariableValue(value.z)})`;
            }
            return '{Obj}';
        }
        return String(value);
    }

    renderWatchedVariableOverlay() {
        const overlay = this.ui.watchOverlay;
        if (!overlay) return;
        overlay.innerHTML = '';

        this.variables
            .filter((variable) => !!variable.watched)
            .forEach((variable) => {
                const badge = document.createElement('div');
                badge.className = 'var-watch-badge';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'var-watch-name';
                nameSpan.innerText = variable.name;

                const valueSpan = document.createElement('span');
                valueSpan.className = 'var-watch-value';
                const runtimeValue = this.runtimeValues[variable.name];
                valueSpan.innerText = this.formatWatchedVariableValue(runtimeValue);

                badge.append(nameSpan, valueSpan);
                overlay.appendChild(badge);
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
                { name: v.name, type: this.getVariablePinType(v), isArray: !!v.isArray }
            ]
        };
    }

    createSetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        const widgetConfig = v.isArray ? null : this.getWidgetConfig(v.type, v.defaultValue);
        const widgetType = widgetConfig ? widgetConfig.type : null;
        const widgetDefault = widgetConfig ? widgetConfig.value : (v.isArray ? [] : this.getTypeDefault(v.type));

        return {
            name: `Set ${v.name}`,
            category: "My Blueprint",
            color: this.getTypeColor(v.type), 
            functionId: "Variable.Set",
            varName: varName, // Ensure this is in template
            inputs: [
                { name: "Exec", type: "exec" },
                { name: v.name, type: this.getVariablePinType(v), isArray: !!v.isArray, widget: widgetType, default: widgetDefault } 
            ],
            outputs: [
                { name: "Out", type: "exec" },
                { name: "", type: this.getVariablePinType(v), isArray: !!v.isArray } 
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
