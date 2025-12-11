class Simulation {
    constructor(graph) { 
        this.graph = graph; 
    }
    
    async run() {
        console.clear();
        console.log("--- Simulation Started ---");
        
        // Reset execution results from previous runs
        this.graph.nodes.forEach(n => n.executionResult = null);

        // Find all Entry points (Event nodes)
        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        for(const n of starts) {
            await this.executeFlow(n);
        }
    }

    /**
     * Recursive executor for Flow (Event/Impulse) nodes.
     * Handles specific logic for branching (Branch node).
     */
    async executeFlow(node) {
        this.highlightNode(node.id);
        node.setError(null); 

        // 1. Run the node's internal logic (if any)
        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node);
                // If gatherInputs return null, it means an error was caught upstream
                if (args === null) return; 

                node.executionResult = node.jsFunctionRef(...args);
            } catch (err) {
                // Handle logic errors gracefully
                if (err.isBlueprintError) {
                    node.setError(err.message);
                    return; 
                } else {
                    console.error(err);
                }
            }
        }

        // 2. Determine which output pin to trigger
        let targetPinName = null;

        // Special handling for the Branch node:
        // It checks the 'executionResult' (boolean) to pick "True" or "False" output.
        if (node.name === "Branch") {
            const condition = node.executionResult; 
            targetPinName = condition ? "True" : "False";
        }

        // 3. Find the output Execution Pin
        let outExecPin = null;
        if (targetPinName) {
            // Find specific named pin (e.g., Branch True/False)
            outExecPin = node.outputs.find(p => p.type === 'exec' && p.name === targetPinName);
        } else {
            // Default behavior: Find the first standard Exec pin
            outExecPin = node.outputs.find(p => p.type === 'exec');
        }

        // 4. Continue Flow
        if (outExecPin) {
            const conn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
            if (conn) {
                const nextNode = this.graph.nodes.find(n => n.id === conn.toNode);
                if (nextNode) {
                    await new Promise(r => setTimeout(r, 200)); // Visual delay for effect
                    await this.executeFlow(nextNode);
                }
            }
        }
    }

    async gatherInputs(node) {
        const args = [];
        
        for(let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue; // Skip flow pins, we only want data

            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            
            if (conn) {
                // Data comes from another node
                const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
                
                // If source is a "Pure" node (no exec pins), it runs on-demand now.
                if (this.isPureNode(sourceNode)) {
                    try {
                        // Caching: Only run if we haven't already calculated it this frame
                        if (sourceNode.executionResult === null) {
                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null; // Propagate stop signal

                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                        }
                        args.push(sourceNode.executionResult);
                    } catch (err) {
                        if (err.isBlueprintError) {
                            sourceNode.setError(err.message);
                            return null; 
                        }
                        throw err; 
                    }
                } else {
                    // If source is a Function/Flow node, it should have already run.
                    // We just grab its cached result.
                    args.push(sourceNode.executionResult);
                }
            } else {
                // No connection: Use the literal value from the widget
                args.push(node.getInputValue(i));
            }
        }
        return args;
    }

    isPureNode(node) {
        // Pure nodes are those that don't have execution pins (impulses).
        // They are passive data calculators.
        return !node.inputs.some(p => p.type === 'exec');
    }

    highlightNode(id) {
        const el = document.getElementById(`node-${id}`);
        if(el) {
            el.style.transition = "box-shadow 0.1s";
            el.style.boxShadow = "0 0 0 4px #ff9900";
            setTimeout(() => el.style.boxShadow = "", 300);
        }
    }
}