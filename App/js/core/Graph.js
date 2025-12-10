class Graph {
    constructor() {
        this.nodes = []; // Now contains Node instances
        this.connections = [];
        this.nextId = 1;
        this.nextConnId = 1;
        this.scale = 1;
        this.pan = { x: 0, y: 0 };
    }

    addNode(template, x, y) {
        // CHANGE: Use the new Node Class
        const node = new Node(this.nextId++, template, x, y);
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
        if (type === 'exec') {
            this.connections = this.connections.filter(c => !(c.fromNode === fromNode && c.fromPin === fromPin));
        } else {
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