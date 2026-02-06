/**
 * VariableManager
 * Manages the definition of variables (Name, Type, Default Value)
 * and generates the corresponding Get/Set node templates.
 */
class VariableManager {
    constructor(editor) {
        this.editor = editor;
        this.variables = []; // { name, type, defaultValue }
        this.runtimeValues = {};

        // Helper to render widgets in the sidebar
        this.widgetRenderer = new WidgetRenderer();

        this.ui = {
            list: document.getElementById('var-list'),
            addBtn: document.getElementById('btn-add-var')
        };

        this.bindEvents();
    }

    bindEvents() {
        if(this.ui.addBtn) {
            this.ui.addBtn.onclick = () => this.addVariable();
        }
    }

    addVariable() {
        let name = "NewVar";
        let count = 0;
        while(this.variables.find(v => v.name === name)) {
            count++;
            name = `NewVar_${count}`;
        }

        const newVar = {
            name: name,
            type: 'boolean',
            defaultValue: false
        };

        this.variables.push(newVar);
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
        
        if (key === 'type') {
            v.defaultValue = this.getTypeDefault(value);
            this.updateGraphNodes(v.name, value);
        }

        this.renderList();
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
        if(!this.ui.list) return;
        this.ui.list.innerHTML = '';

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
            name: "", 
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

        return {
            name: "Set",
            color: this.getTypeColor(v.type), 
            functionId: "Variable.Set",
            varName: varName, // Ensure this is in template
            inputs: [
                { name: "Exec", type: "exec" },
                { name: v.name, type: v.type, widget: widgetConfig } 
            ],
            outputs: [
                { name: "Out", type: "exec" },
                { name: "", type: v.type } 
            ]
        };
    }
}