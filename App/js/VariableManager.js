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

    /**
     * Helper to get the CSS variable for a given type's color.
     * Matches definitions in App/css/colors.css
     */
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
            
            const nameInput = document.createElement('input');
            nameInput.value = v.name;
            nameInput.className = 'var-name';
            nameInput.onchange = (e) => this.updateVariable(v.name, 'name', e.target.value);
            
            row.draggable = true;
            row.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'variable',
                    name: v.name,
                    varType: v.type
                }));
            };

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

            const delBtn = document.createElement('button');
            delBtn.innerText = '×';
            delBtn.className = 'var-del';
            delBtn.onclick = () => this.deleteVariable(v.name);

            row.append(nameInput, typeSelect, delBtn);
            this.ui.list.appendChild(row);
        });
    }

    resetRuntime() {
        this.runtimeValues = {};
        this.variables.forEach(v => {
            this.runtimeValues[v.name] = JSON.parse(JSON.stringify(v.defaultValue));
        });
    }

    /**
     * GET NODE:
     * - Color: Matches Variable Type
     */
    createGetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        return {
            name: "", // Empty header text, but colored bar
            color: this.getTypeColor(v.type), // Correct Color
            functionId: "Variable.Get",
            inputs: [], // No inputs
            outputs: [
                { name: v.name, type: v.type }
            ]
        };
    }

    /**
     * SET NODE:
     * - Color: Matches Variable Type
     */
    createSetTemplate(varName) {
        const v = this.variables.find(i => i.name === varName);
        if(!v) return null;

        return {
            name: "Set",
            color: this.getTypeColor(v.type), // Correct Color
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