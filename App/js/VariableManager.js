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

    updateVariable(oldName, key, value) {
        const v = this.variables.find(i => i.name === oldName);
        if(!v) return;

        v[key] = value;
        
        // If type changed, reset default value
        if (key === 'type') {
            v.defaultValue = this.getTypeDefault(value);
        }

        this.renderList();
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

    renderList() {
        if(!this.ui.list) return;
        this.ui.list.innerHTML = '';

        this.variables.forEach(v => {
            const row = document.createElement('div');
            row.className = 'var-row';
            
            // 1. Name Input
            const nameInput = document.createElement('input');
            nameInput.value = v.name;
            nameInput.className = 'var-name';
            nameInput.title = "Variable Name";
            nameInput.onchange = (e) => this.updateVariable(v.name, 'name', e.target.value);
            
            // Drag Events
            row.draggable = true;
            row.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'variable',
                    name: v.name,
                    varType: v.type
                }));
            };

            // 2. Type Dropdown
            const typeSelect = document.createElement('select');
            typeSelect.className = 'var-type';
            ['boolean', 'int', 'float', 'string', 'vector'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.innerText = t;
                if(t === v.type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = (e) => this.updateVariable(v.name, 'type', e.target.value);

            // 3. Default Value Input (Dynamic based on type)
            const defContainer = document.createElement('div');
            defContainer.className = 'var-default';
            defContainer.style.flexGrow = '1';
            defContainer.style.marginLeft = '5px';
            
            const defInput = this.createDefaultInput(v);
            defContainer.appendChild(defInput);

            // 4. Delete Button
            const delBtn = document.createElement('button');
            delBtn.innerText = '×';
            delBtn.className = 'var-del';
            delBtn.onclick = () => this.deleteVariable(v.name);

            row.append(nameInput, typeSelect, defContainer, delBtn);
            this.ui.list.appendChild(row);
        });
    }

    createDefaultInput(v) {
        let input;
        
        if (v.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = v.defaultValue;
            input.onchange = (e) => this.updateVariable(v.name, 'defaultValue', e.target.checked);
        } 
        else if (v.type === 'int' || v.type === 'float') {
            input = document.createElement('input');
            input.type = 'number';
            input.value = v.defaultValue;
            input.style.width = '50px';
            input.style.background = '#111';
            input.style.border = '1px solid #333';
            input.style.color = '#ccc';
            input.step = v.type === 'float' ? '0.1' : '1';
            input.onchange = (e) => {
                const val = v.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value);
                this.updateVariable(v.name, 'defaultValue', val);
            };
        }
        else if (v.type === 'vector') {
            input = document.createElement('span');
            input.innerText = '(x,y,z)'; // Simplified for sidebar
            input.style.fontSize = '10px';
            input.style.color = '#888';
        }
        else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = v.defaultValue;
            input.style.width = '60px';
            input.style.background = '#111';
            input.style.border = '1px solid #333';
            input.style.color = '#ccc';
            input.onchange = (e) => this.updateVariable(v.name, 'defaultValue', e.target.value);
        }
        return input;
    }

    resetRuntime() {
        this.runtimeValues = {};
        this.variables.forEach(v => {
            // Deep copy for objects (like vectors)
            this.runtimeValues[v.name] = (typeof v.defaultValue === 'object' && v.defaultValue !== null) 
                ? JSON.parse(JSON.stringify(v.defaultValue))
                : v.defaultValue;
        });
    }

    createGetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        return {
            name: "", // Hidden header
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

        return {
            name: "Set",
            color: this.getTypeColor(v.type), 
            functionId: "Variable.Set",
            inputs: [
                { name: "Exec", type: "exec" },
                { name: v.name, type: v.type } 
            ],
            outputs: [
                { name: "Out", type: "exec" },
                { name: "", type: v.type } 
            ]
        };
    }
}