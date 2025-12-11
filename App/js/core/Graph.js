/**
 * Graph Class
 * Serves as the central Data Model for the entire blueprint editor.
 * It manages the collection of Nodes and Connections, tracks the viewport state (pan/zoom), 
 * and enforces the core topological rules for connections (e.g., single-wire outputs).
 */
class Graph {
    constructor() {
        this.nodes = [];            // Array of Node instances (the vertices)
        this.connections = [];      // Array of Connection instances (the edges)
        
        this.nextId = 1;            // Counter for generating unique Node IDs
        this.nextConnId = 1;        // Counter for generating unique Connection IDs
        
        // Viewport State (Managed by Interaction/Renderer)
        this.scale = 1;
        this.pan = { x: 0, y: 0 };  // Translation offset for the canvas
    }

    /**
     * Creates a new Node instance from a template and adds it to the graph.
     * @param {Object} template - The JSON definition for the node type.
     * @param {Number} x - Initial X position.
     * @param {Number} y - Initial Y position.
     * @returns {Node} The newly created Node instance.
     */
    addNode(template, x, y) {
        // Node constructor implicitly clones properties from the template
        const node = new GraphNode(this.nextId++, template, x, y);
        this.nodes.push(node);
        return node;
    }

    /**
     * Removes a node and all associated connections from the graph.
     * @param {Number} id - The ID of the node to remove.
     */
    removeNode(id) {
        this.nodes = this.nodes.filter(n => n.id !== id);
        // Filter out connections where this node is either the source or the target
        this.connections = this.connections.filter(c => c.fromNode !== id && c.toNode !== id);
    }

    /**
     * Removes a specific connection by its ID.
     * @param {Number} connId - The ID of the connection to remove.
     */
    removeConnection(connId) {
        this.connections = this.connections.filter(c => c.id !== connId);
    }

    /**
     * Helper used for the Alt+Click interaction: removes all links associated with a single pin.
     * @param {Number} nodeId - The ID of the pin's parent node.
     * @param {Number} pinIndex - The index of the pin on the node.
     * @param {String} type - The direction of the pin ('input' or 'output').
     */
    disconnectPin(nodeId, pinIndex, type) {
        if (type === 'input') {
            // Remove connections coming TO this specific input pin
            this.connections = this.connections.filter(c => !(c.toNode === nodeId && c.toPin === pinIndex));
        } else {
            // Remove connections going FROM this specific output pin
            this.connections = this.connections.filter(c => !(c.fromNode === nodeId && c.fromPin === pinIndex));
        }
    }

    /**
     * Creates a new connection, applying single-wire rules (replacement).
     * @param {Number} fromNode - Source node ID.
     * @param {Number} fromPin - Source pin index.
     * @param {Number} toNode - Target node ID.
     * @param {Number} toPin - Target pin index.
     * @param {String} type - Data type of the connection ('exec' or data type).
     * @returns {Connection} The new connection object.
     */
    addConnection(fromNode, fromPin, toNode, toPin, type) {
        // RULE 1: Exec Outputs are Single-Wire. Remove existing connection FROM the source pin.
        if (type === 'exec') {
            this.connections = this.connections.filter(c => !(c.fromNode === fromNode && c.fromPin === fromPin));
        } 
        
        // RULE 2: Data Inputs are Single-Wire. Remove existing connection TO the target pin.
        else {
            this.connections = this.connections.filter(c => !(c.toNode === toNode && c.toPin === toPin));
        }
        
        // Create and add the new connection
        const conn = new Connection(this.nextConnId++, fromNode, fromPin, toNode, toPin, type);
        this.connections.push(conn);
        return conn;
    }

    /**
     * Serializes the entire graph state (nodes, connections, viewport).
     * @returns {Object} 
     */
    toJSON() {
        return {
            nodes: this.nodes.map(n => n.toJSON()),
            connections: this.connections,
            viewport: { x: this.pan.x, y: this.pan.y, scale: this.scale },
            counters: { nextId: this.nextId, nextConnId: this.nextConnId }
        };
    }

    /**
     * Clears the graph state.
     */
    clear() {
        this.nodes = [];
        this.connections = [];
        this.nextId = 1;
        this.nextConnId = 1;
    }
}