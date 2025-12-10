class Pin {
    constructor(node, index, direction, template) {
        this.node = node;          // Reference to parent Node object
        this.nodeId = node.id;     // ID for easy DOM dataset access
        this.index = index;        // 0, 1, 2...
        this.direction = direction; // 'input' or 'output'
        
        this.name = template.name;
        this.type = template.type;      // 'exec', 'string', 'int'
        this.dataType = template.type;  // Alias for code compatibility
        this.value = template.default;  // Current value (if input)
        
        // Unique ID for DOM lookup (e.g. "1-input-0")
        this.id = `${node.id}-${direction}-${index}`;
    }
}