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

    //Helper for Alt+Click to break specific pin links
    disconnectPin(nodeId, pinIndex, type) {
        if (type === 'input') {
            this.connections = this.connections.filter(c => !(c.toNode === nodeId && c.toPin === pinIndex));
        } else {
            this.connections = this.connections.filter(c => !(c.fromNode === nodeId && c.fromPin === pinIndex));
        }
    }

    addConnection(fromNode, fromPin, toNode, toPin, type) {
        if (type === 'exec') {
            this.connections = this.connections.filter(c => !(c.fromNode === fromNode && c.fromPin === fromPin));
        } else {
            this.connections = this.connections.filter(c => !(c.toNode === toNode && c.toPin === toPin));
        }
        
        const conn = new Connection(this.nextConnId++, fromNode, fromPin, toNode, toPin, type);
        this.connections.push(conn);
        return conn;
    }
}