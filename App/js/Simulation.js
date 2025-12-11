class Simulation {
    // [UPDATE] Accept renderer in constructor
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
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

        // 1. Run Node Logic
        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node);
                if (args === null) return; 

                node.executionResult = node.jsFunctionRef(...args);
            } catch (err) {
                if (err.isBlueprintError) {
                    node.setError(err.message);
                    return; 
                } else {
                    console.error(err);
                }
            }
        }

        // 2. Pick Next Pin (Branch Logic)
        let targetPinName = null;
        if (node.name === "Branch") {
            const condition = node.executionResult; 
            targetPinName = condition ? "True" : "False";
        }

        // 3. Find Output Pin
        let outExecPin = null;
        if (targetPinName) {
            outExecPin = node.outputs.find(p => p.type === 'exec' && p.name === targetPinName);
        } else {
            outExecPin = node.outputs.find(p => p.type === 'exec');
        }

        // 4. Move to Next Node with Animation
        if (outExecPin) {
            const conn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
            if (conn) {
                const nextNode = this.graph.nodes.find(n => n.id === conn.toNode);
                if (nextNode) {
                    // [VISUAL] Trigger the 1.5s white ball animation
                    if(this.renderer) this.renderer.animateExecWire(conn);
                    
                    // [DELAY] Wait for the animation to travel before executing the next node.
                    await new Promise(r => setTimeout(r, 1500)); 

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
                
                // If pure, calculate now
                if (this.isPureNode(sourceNode)) {
                    try {
                        if (sourceNode.executionResult === null) {
                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null;

                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                        }
                    } catch (err) {
                        if (err.isBlueprintError) {
                            sourceNode.setError(err.message);
                            return null; 
                        }
                        throw err; 
                    }
                }

                // [VISUAL] Trigger Data Animation (Glow + Floating Value)
                if (this.renderer) {
                    this.renderer.animateDataWire(conn, sourceNode.executionResult);
                    // Slight delay for visual effect so it's not instant
                    await new Promise(r => setTimeout(r, 300));
                }

                args.push(sourceNode.executionResult);
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