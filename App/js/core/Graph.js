/**
 * Graph Class
 * Serves as the central Data Model for the entire blueprint editor.
 * It manages the collection of Nodes and Connections, tracks the viewport state (pan/zoom), 
 * and enforces the core topological rules for connections (e.g., single-wire outputs for execution).
 */
class Graph {
    constructor() {
        this.nodes = [];            // Array of GraphNode instances (the vertices)
        this.connections = [];      // Array of Connection instances (the edges)
        
        this.nextAvailableNodeId = 1;       // Counter for generating unique Node IDs
        this.nextAvailableConnectionId = 1; // Counter for generating unique Connection IDs
        
        // Viewport State (Managed by Interaction/Renderer systems)
        this.scale = 1;
        this.pan = { x: 0, y: 0 };  // Translation offset for the canvas
    }

    /**
     * Creates a new Node instance from a template and adds it to the graph.
     * @param {Object} nodeTemplate - The JSON definition for the node type.
     * @param {Number} initialX - Initial X position on the canvas.
     * @param {Number} initialY - Initial Y position on the canvas.
     * @returns {GraphNode} The newly created Node instance.
     */
    addNode(nodeTemplate, initialX, initialY) {
        // Node constructor implicitly clones properties from the template
        const newNode = new GraphNode(this.nextAvailableNodeId++, nodeTemplate, initialX, initialY);
        this.nodes.push(newNode);
        return newNode;
    }

    /**
     * Removes a node and all associated connections from the graph.
     * @param {Number} targetNodeId - The unique ID of the node to remove.
     */
    removeNode(targetNodeId) {
        this.nodes = this.nodes.filter(graphNode => graphNode.id !== targetNodeId);
        
        // Filter out any connections where this node is either the source or the target
        this.connections = this.connections.filter(existingConnection => 
            existingConnection.fromNode !== targetNodeId && existingConnection.toNode !== targetNodeId
        );
    }

    /**
     * Removes a specific connection by its ID.
     * @param {Number} connectionId - The unique ID of the connection to remove.
     */
    removeConnection(connectionId) {
        this.connections = this.connections.filter(existingConnection => existingConnection.id !== connectionId);
    }

    /**
     * Helper used for the Alt+Click interaction: removes all links associated with a single pin.
     * @param {Number} targetNodeId - The ID of the pin's parent node.
     * @param {Number} targetPinIndex - The index of the pin on the node.
     * @param {String} pinDirection - The direction of the pin ('input' or 'output').
     */
    disconnectPin(targetNodeId, targetPinIndex, pinDirection) {
        if (pinDirection === 'input') {
            // Remove connections coming TO this specific input pin
            this.connections = this.connections.filter(existingConnection => 
                !(existingConnection.toNode === targetNodeId && existingConnection.toPin === targetPinIndex)
            );
        } else {
            // Remove connections going FROM this specific output pin
            this.connections = this.connections.filter(existingConnection => 
                !(existingConnection.fromNode === targetNodeId && existingConnection.fromPin === targetPinIndex)
            );
        }
    }

    /**
     * Creates a new connection between two pins, applying single-wire rules (replacement).
     * @param {Number} sourceNodeId - ID of the source (output) node.
     * @param {Number} sourcePinIndex - Index of the output pin.
     * @param {Number} targetNodeId - ID of the target (input) node.
     * @param {Number} targetPinIndex - Index of the input pin.
     * @param {String} connectionType - Data type of the connection ('exec' or data type).
     * @returns {Connection} The new connection object.
     */
    addConnection(sourceNodeId, sourcePinIndex, targetNodeId, targetPinIndex, connectionType) {
        // RULE 1: Exec Outputs are Single-Wire. 
        // If this is an execution flow wire, remove any existing connection FROM the source pin.
        if (connectionType === 'exec') {
            this.connections = this.connections.filter(existingConnection => 
                !(existingConnection.fromNode === sourceNodeId && existingConnection.fromPin === sourcePinIndex)
            );
        } 
        
        // RULE 2: Data Inputs are Single-Wire. 
        // An input pin can only accept one value. Remove any existing connection TO the target pin.
        else {
            this.connections = this.connections.filter(existingConnection => 
                !(existingConnection.toNode === targetNodeId && existingConnection.toPin === targetPinIndex)
            );
        }
        
        // Create and add the new connection
        const newConnection = new Connection(
            this.nextAvailableConnectionId++, 
            sourceNodeId, 
            sourcePinIndex, 
            targetNodeId, 
            targetPinIndex, 
            connectionType
        );
        this.connections.push(newConnection);
        return newConnection;
    }

    /**
     * Serializes the entire graph state (nodes, connections, viewport).
     * @returns {Object} The complete state of the graph.
     */
    toJSON() {
        return {
            nodes: this.nodes.map(node => node.toJSON()),
            connections: this.connections,
            viewport: { 
                x: this.pan.x, 
                y: this.pan.y, 
                scale: this.scale 
            },
            counters: { 
                nextId: this.nextAvailableNodeId, 
                nextConnId: this.nextAvailableConnectionId 
            }
        };
    }

    /**
     * Completely resets the graph state, removing all nodes and connections.
     */
    clear() {
        this.nodes = [];
        this.connections = [];
        this.nextAvailableNodeId = 1;
        this.nextAvailableConnectionId = 1;
    }
}