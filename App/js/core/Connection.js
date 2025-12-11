/**
 * Connection Class
 * Represents a wire linking two pins in the graph.
 * This is the "Model" for a connection. The "View" (SVG path) is handled by Renderer.js.
 */
class Connection {
    /**
     * @param {Number} id - Unique ID for the connection.
     * @param {Number} fromNodeId - ID of the source Node.
     * @param {Number} fromPinIdx - Index of the output pin on the source Node.
     * @param {Number} toNodeId - ID of the target Node.
     * @param {Number} toPinIdx - Index of the input pin on the target Node.
     * @param {String} type - Data type of the connection (e.g., 'exec', 'string', 'int').
     */
    constructor(id, fromNodeId, fromPinIdx, toNodeId, toPinIdx, type) {
        this.id = id;
        
        // Source (Output Pin)
        this.fromNode = fromNodeId;
        this.fromPin = fromPinIdx;
        
        // Target (Input Pin)
        this.toNode = toNodeId;
        this.toPin = toPinIdx;
        
        // Type determines the color and compatibility rules
        this.type = type; 
    }
}