class Simulation {
    constructor(graph) { 
        this.graph = graph; 
    }
    
    async run() {
        console.clear();
        console.log("--- Simulation Started ---");
        
        // 1. Reset all nodes (clear previous cached results)
        this.graph.nodes.forEach(n => n.executionResult = null);

        // 2. Find Entry Points
        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        
        // 3. Start Execution Flow
        for(const n of starts) {
            await this.executeFlow(n);
        }
    }

    /**
     * Executes the flow of logic (Impure Nodes with Exec pins).
     * This follows the white wire.
     */
    async executeFlow(node) {
        // Visual Highlight
        this.highlightNode(node.id);

        // 1. Execute THIS node's function (if it has one)
        if (node.jsFunctionRef) {
            // A. Gather Inputs
            const args = await this.gatherInputs(node);
            
            // B. Run Function
            console.log(`Executing [${node.name}]:`, args);
            node.executionResult = node.jsFunctionRef(...args);
        }

        // 2. Find NEXT node (Follow Exec Wire)
        // Find the "Out" execution pin index
        const outExecPin = node.outputs.find(p => p.type === 'exec');
        
        if (outExecPin) {
            const conn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
            if (conn) {
                // Find path element to pulse
                const nextNode = this.graph.nodes.find(n => n.id === conn.toNode);
                if (nextNode) {
                    // Small delay to visualize the "flow"
                    await new Promise(r => setTimeout(r, 200)); 
                    await this.executeFlow(nextNode);
                }
            }
        }
    }

    /**
     * Resolves inputs for a node.
     * If an input has a wire, it recursively calculates the source node.
     */
    async gatherInputs(node) {
        const args = [];
        
        for(let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            
            // Skip Exec pins, they aren't data arguments
            if (pin.type === 'exec') continue;

            // 1. Check for Connection
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            
            if (conn) {
                // DATA CONNECTED: Recursive Resolution
                const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
                
                // If the source is "Pure" (Data only, no Exec), we calculate it on demand
                if (this.isPureNode(sourceNode)) {
                    // Check cache first (avoid re-calculating same node twice in one frame)
                    if (sourceNode.executionResult === null) {
                        const sourceArgs = await this.gatherInputs(sourceNode);
                        sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                    }
                    args.push(sourceNode.executionResult);
                } else {
                    // If source is Impure (has Exec), it should have already run. Use its cached result.
                    args.push(sourceNode.executionResult);
                }
            } else {
                // NO CONNECTION: Use Widget Value
                args.push(node.getInputValue(i));
            }
        }
        return args;
    }

    /**
     * A "Pure" node is one that doesn't have Execution pins (like Math).
     * It runs only when data is requested from it.
     */
    isPureNode(node) {
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