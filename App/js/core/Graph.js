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
        const node = new Node(this.nextId++, template, x, y);
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
     * Helper used for the Alt+Click interaction