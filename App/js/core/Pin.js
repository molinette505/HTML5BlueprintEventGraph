class Pin {
    constructor(node, index, direction, template) {
        this.node = node;
        this.nodeId = node.id;
        this.index = index;
        this.direction = direction;
        
        this.name = template.name;
        this.type = template.type;
        this.dataType = template.type;
        this.advanced = template.advanced || false;
        
        this.widget = null;
        if (direction === 'input') {
            const typeDef = window.typeDefinitions ? window.typeDefinitions[this.type] : null;
            const widgetType = template.widget || (typeDef ? typeDef.widget : 'none');

            if (widgetType && widgetType !== 'none') {
                const defaultValue = this.getDefaultValue(this.type, template.default);
                this.widget = new Widget(widgetType, defaultValue, template.options);
                this.value = defaultValue;
            }
        }
    }

    getDefaultValue(type, manualDefault) {
        if (manualDefault !== undefined) return manualDefault;
        switch (type) {
            case 'string': return "Hello World";
            case 'float': return 0.0;
            case 'int': return 0;
            case 'boolean': return true;
            case 'color': return "#FFFFFF";
            case 'vector': return {x:0, y:0, z:0};
            case 'class': return "None";
            case 'object': return "None";
            default: return null;
        }
    }
}