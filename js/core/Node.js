/**
 * Node Class
 * Represents a single logical node in the graph (a vertex).
 * It holds the state of the node, including its position, associated data, 
 * and the specific input/output pins that allow connections.
 */
class GraphNode {
    /**
     * Creates a new instance of a GraphNode.
     * @param {Number} uniqueIdentifier - The unique ID assigned to this node by the Graph.
     * @param {Object} nodeTemplate - The JSON definition/template defining the node's capabilities.
     * @param {Number} initialXPosition - The starting horizontal position on the canvas.
     * @param {Number} initialYPosition - The starting vertical position on the canvas.
     */
    constructor(uniqueIdentifier, nodeTemplate, initialXPosition, initialYPosition) {
        this.id = uniqueIdentifier;
        this.x = initialXPosition;
        this.y = initialYPosition;
        
        // Metadata from the template
        this.name = nodeTemplate.name;
        this.color = nodeTemplate.color || "var(--header-bg)";
        this.width = nodeTemplate.width; 
        
        // UI Configuration flags
        this.hideHeader = nodeTemplate.hideHeader || false; 
        this.centerLabel = nodeTemplate.centerLabel || null; 
        
        this.showAdvanced = false;

        // Restore Variable Name if this node represents a Getter/Setter
        this.varName = nodeTemplate.varName || null;

        // Function reference for logic execution
        this.functionId = nodeTemplate.functionId || null;
        this.jsFunctionRef = window.FunctionRegistry ? window.FunctionRegistry[this.functionId] : null;
        this.executionResult = null; 

        // Initialize Input Pins
        this.inputs = (nodeTemplate.inputs || []).map((pinDefinition, pinIndex) => {
            return new Pin(this, pinIndex, 'input', pinDefinition);
        });

        // Initialize Output Pins
        this.outputs = (nodeTemplate.outputs || []).map((pinDefinition, pinIndex) => {
            return new Pin(this, pinIndex, 'output', pinDefinition);
        });
    }

    /**
     * Retrieves the current value of a specific input pin.
     * If the pin has a widget (like a text box), returns the widget's internal value.
     * @param {Number} inputIndex - The index of the input pin to check.
     * @returns {any} The value of the input, or null if not found.
     */
    getInputValue(inputIndex) {
        if (!this.inputs[inputIndex]) return null;
        
        const inputPin = this.inputs[inputIndex];
        if (inputPin.widget) {
            return inputPin.widget.value;
        }
        return null; 
    }
    
    /**
     * Checks if this node contains any 'advanced' pins that are typically hidden.
     * @returns {Boolean} True if advanced pins exist on either inputs or outputs.
     */
    hasAdvancedPins() {
        const hasAdvancedInput = this.inputs.some(pin => pin.advanced);
        const hasAdvancedOutput = this.outputs.some(pin => pin.advanced);
        return hasAdvancedInput || hasAdvancedOutput;
    }

    /**
     * Displays or hides an error message on the node's UI element.
     * @param {String} errorMessage - The message to display. If null/empty, clears the error.
     */
    setError(errorMessage) {
        // Attempt to find the DOM element corresponding to this node
        const nodeDomElement = document.getElementById(`node-${this.id}`);
        if (!nodeDomElement) return;
        
        let errorContainer = nodeDomElement.querySelector('.node-error');
        
        // Clear Error State
        if (!errorMessage) {
            if (errorContainer) errorContainer.style.display = 'none';
            nodeDomElement.classList.remove('has-error');
            return;
        }

        // Create Error Container if it doesn't exist
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'node-error';
            nodeDomElement.appendChild(errorContainer);
        }
        
        // Set Message and Show
        errorContainer.innerText = errorMessage;
        errorContainer.style.display = 'block';
        nodeDomElement.classList.add('has-error');
    }

    /**
     * Serializes the node state into a JSON-compatible object.
     * Used for copying to clipboard or saving the graph to a file.
     * @returns {Object} The serialized node data.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            varName: this.varName, 
            functionId: this.functionId, // Persist functionId to identify logic (e.g. Get/Set) on restore
            
            // Save types to validation/reconstruction
            pinTypes: {
                inputs: this.inputs.map(pin => pin.type),
                outputs: this.outputs.map(pin => pin.type)
            },
            // Save current values of input widgets
            inputs: this.inputs.map(pin => ({
                name: pin.name,
                value: pin.widget ? pin.widget.value : pin.value 
            }))
        };
    }
}