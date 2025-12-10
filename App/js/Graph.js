class Graph {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.nextId = 1;
        this.nextConnId = 1;
        this.scale = 1;
        this.pan = { x: 0, y: 0 };
    }

    addNode(template, x, y) {
        const node = { 
            id: this.nextId++, 
            x, y, 
            config: JSON.parse(JSON.stringify(template)) 
        };
        this.nodes.push(node);
        return node;
    }

    removeNode(id) {
        this.nodes = this.nodes.filter(n => n.id !== id);
        this.connections = this.connections.filter(c => c.fromNode !== id && c.toNode !== id);
    }

    removeConnection(connId) {
        this.connections = this.connections.filter(c => c.id !== connId);
    }

    addConnection(fromNode, fromPin, toNode, toPin, type) {
        // RULE 1: Exec Outputs are Single-Wire (replace existing)
        if (type === 'exec') {
            this.connections = this.connections.filter(c => !(c.fromNode === fromNode && c.fromPin === fromPin));
        } 
        // RULE 2: Data Inputs are Single-Wire (replace existing)
        if (type !== 'exec') {
            this.connections = this.connections.filter(c => !(c.toNode === toNode && c.toPin === toPin));
        }
        
        this.connections.push({ 
            id: this.nextConnId++, 
            fromNode, fromPin, 
            toNode, toPin, 
            type 
        });
    }
}