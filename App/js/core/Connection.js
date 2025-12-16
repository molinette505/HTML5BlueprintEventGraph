/**
 * Connection Class
 * Represents a wire linking two pins in the graph.
 * This class acts as the "Model" for a connection. 
 * The visual representation "View" (SVG path) is handled separately by Renderer.js.
 */
class Connection {
    /**
     * Initializes a new Connection.
     * @param {Number} uniqueConnectionId - Unique ID for the connection.
     * @param {Number} sourceNodeId - The ID of the node where the connection starts (Output).
     * @param {Number} sourcePinIndex - The index of the specific output pin on the source Node.
     * @param {Number} targetNodeId - The ID of the node where the connection ends (Input).
     * @param {Number} targetPinIndex - The index of the specific input pin on the target Node.
     * @param {String} connectionType - Data type of the connection (e.g., 'exec', 'string', 'int').
     */
    constructor(uniqueConnectionId, sourceNodeId, sourcePinIndex, targetNodeId, targetPinIndex, connectionType) {
        this.id = uniqueConnectionId;
        
        // Source Information (Output Pin)
        this.fromNode = sourceNodeId;
        this.fromPin = sourcePinIndex;
        
        // Target Information (Input Pin)
        this.toNode = targetNodeId;
        this.toPin = targetPinIndex;
        
        // Type determines the color and compatibility rules during interaction
        this.type = connectionType; 
    }
}