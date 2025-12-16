/**
 * VariableManager
 * Manages the definition of variables (Name, Type, Default Value)
 * and generates the corresponding Get/Set node templates.
 */
class VariableManager {
    constructor(editor) {
        this.editor = editor;
        this.variables = []; // { name, type, defaultValue }
        
        // Runtime storage (reset on simulation start)
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
        this.variables = this.variables.filter(v => v.name !== name);
        this.renderList();
    }

    /**
     * Updates a variable property.
     * INTELLIGENT RENDER: Only re-renders the list if the TYPE changes.
     * Name/Value changes update the graph but keep the sidebar DOM intact to preserve focus.
     */
    updateVariable(oldName, key, value) {
        const v = this.variables.find(i => i.name === oldName);
        if(!v) return;

        // 1. Handle TYPE Change (Requires full re-render)
        if (key === 'type') {
            v.type = value;
            v.defaultValue = this.getTypeDefault(value);
            
            // Update Graph Nodes (Type & Color)
            this.updateGraphNodes(v.name, value);
            
            // Re-render list because the widget type changed (e.g. Checkbox -> Number)
            this.renderList();
        }
        
        // 2. Handle NAME Change (No re-render)
        else if (key === 'name') {
            const newName = value;
            // Prevent duplicate names
            if (newName !== oldName && !this.variables.find(x => x.name === newName)) {
                v.name = newName;
                this.renameGraphNodes(oldName, newName);
            }
            // Do NOT re-render list (keeps focus in the input)
        }

        // 3. Handle VALUE Change (No re-render)
        else if (key === 'defaultValue') {
            v.defaultValue = value;
            
            // Sync default value to "Set" nodes in the graph
            this.updateGraphNodes(v.name, v.type);
            
            // Do NOT re-render list (keeps focus in the input)
        }
    }

    /**
     * Updates the text labels of Get/Set nodes when a variable is renamed.
     */
    renameGraphNodes(oldName, newName) {
        const graph = this.editor.graph;
        const renderer = this.editor.renderer;

        graph.nodes.forEach(node => {
            if (node.varName === oldName) {
                // Update internal reference
                node.varName = newName;

                // Update Pin Names
                if (node.functionId === "Variable.Get") {
                    if(node.outputs[0]) node.outputs[0].name = newName;
                } 
                else if (node.functionId === "Variable.Set") {
                    if(node.inputs[1]) node.inputs[1].name = newName;
                }

                // Refresh Node DOM
                renderer.refreshNode(node);
            }
        });
    }

    /**
     * Scans the graph for Get/Set nodes for this variable and updates them (Type/Color/Widget).
     */
    updateGraphNodes(varName, newType) {
        const graph = this.editor.graph;
        const renderer = this.editor.renderer;
        const color = this.getTypeColor(newType);
        const defaultValue = this.getTypeDefault(newType);

        graph.nodes.forEach(node => {
            if (node.varName === varName) {
                
                // Update Node Color
                node.color = color; 

                // Update Get Node
                if (node.functionId === "Variable.Get") {
                    if(node.outputs[0]) {
                        node.outputs[0].type = newType;
                        node.outputs[0].dataType = newType;
                    }
                } 
                // Update Set Node
                else if (node.functionId === "Variable.Set") {
                    // Update Input Pin
                    if(node.inputs[1]) {
                        const pin = node.inputs[1];
                        pin.type = newType;
                        pin.dataType = newType;
                        
                        // Update Widget Model
                        const config = this.getWidgetConfig(newType, defaultValue);
                        if (config) {
                            // If widget type matches, update value; else create new
                            // (Simplest is to always recreate for safety)
                            pin.widget = new Widget(config.type, config.value);
                            
                            // If we are just updating the value (not type), preserve the value?
                            // Actually, if this is called from 'defaultValue' change, 
                            // we WANT to overwrite the Set node's value with the new default.
                            const v = this.variables.find(i => i.name === varName);
                            if(v) pin.widget.value = v.defaultValue;
                        } else {
                            pin.widget = null;
                        }
                    }
                    // Update Output Pin
                    if(node.outputs[1]) {
                        node.outputs[1].type = newType;
                        node.outputs[1].dataType = newType;
                    }
                }
                
                // Refresh DOM
                renderer.refreshNode(node);
            }
        });
    }

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
            
            // 1. Color Indicator
            const typeIndicator = document.createElement('div');
            typeIndicator.style.width = '4px';
            typeIndicator.style.backgroundColor = this.getTypeColor(v.type);
            typeIndicator.style.borderRadius = '2px';
            typeIndicator.style.flexShrink = '0';

            // 2. Main Content Column
            const col = document.createElement('div');
            col.style.display = 'flex';
            col.style.flexDirection = 'column';
            col.style.flexGrow = '1';
            col.style.gap = '6px';
            col.style.minWidth = '0';

                // Row A: Name + Delete
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
                    // Use 'change' for name to update on Blur/Enter
                    nameInput.onchange = (e) => this.updateVariable(v.name, 'name', e.target.value);

                    const delBtn = document.createElement('button');
                    delBtn.innerText = '×';
                    delBtn.className = 'var-del';
                    delBtn.onclick = () => this.deleteVariable(v.name);

                topRow.append(nameInput, delBtn);

                // Row B: Type + Default Value
                const botRow = document.createElement('div');
                botRow.style.display = 'flex';
                botRow.style.alignItems = 'center';
                botRow.style.gap = '8px';
                botRow.style.flexWrap = 'wrap'; 

                    // Type Dropdown
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

                    // Default Value Container
                    const defContainer = document.createElement('div');
                    defContainer.className = 'var-default';
                    defContainer.style.flexGrow = '1'; 
                    defContainer.style.display = 'flex';
                    defContainer.style.justifyContent = 'flex-start';
                    
                    const widgetConfig = this.getWidgetConfig(v.type, v.defaultValue);
                    if (widgetConfig) {
                        const widgetEl = this.widgetRenderer.render(widgetConfig, (newVal) => {
                            // This callback fires on every keystroke ('input' event)
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