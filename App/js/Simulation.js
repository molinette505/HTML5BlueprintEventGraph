class Simulation {
    constructor(graph) { 
        this.graph = graph; 
    }
    
    async run() {
        console.clear();
        console.log("--- Simulation Started ---");
        
        this.graph.nodes.forEach(n => n.executionResult = null);

        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        for(const n of starts) {
            await this.executeFlow(n);
        }
    }

    async executeFlow(node) {
        this.highlightNode(node.id);
        node.setError(null); 

        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node);
                // If gatherInputs return null/undefined because of a handled error, we might stop
                if (args === null) return; 

                node.executionResult = node.jsFunctionRef(...args);
            } catch (err) {
                // Logic error in this node
                if (err.isBlueprintError) {
                    node.setError(err.message);
                    return; 
                } else {
                    console.error(err);
                }
            }
        }

        const outExecPin = node.outputs.find(p => p.type === 'exec');
        if (outExecPin) {
            const conn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
            if (conn) {
                const nextNode = this.graph.nodes.find(n => n.id === conn.toNode);
                if (nextNode) {
                    await new Promise(r => setTimeout(r, 200)); 
                    await this.executeFlow(nextNode);
                }
            }
        }
    }

    async gatherInputs(node) {
        const args = [];
        
        for(let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue;

            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            
            if (conn) {
                const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
                
                if (this.isPureNode(sourceNode)) {
                    try {
                        if (sourceNode.executionResult === null) {
                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null; // Propagate stop signal (not error)

                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                        }
                        args.push(sourceNode.executionResult);
                    } catch (err) {
                        if (err.isBlueprintError) {
                            sourceNode.setError(err.message);
                            return null; // Stop flow gracefully without erroring parent
                        }
                        throw err; // Unexpected JS error
                    }
                } else {
                    args.push(sourceNode.executionResult);
                }
            } else {
                args.push(node.getInputValue(i));
            }
        }
        return args;
    }

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