class Simulation {
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
        
        // State Machine: STOPPED -> RUNNING <-> PAUSED
        this.status = 'STOPPED'; 
        this.executionQueue = []; 
        this.timer = null;
        
        // Track the last item to support "Replay"
        this.lastProcessedItem = null;
        
        this.onStateChange = null; 
    }
    
    initialize() {
        if (this.status !== 'STOPPED') this.stop();
        
        console.clear();
        console.log("--- Simulation Initialized ---");
        
        this.graph.nodes.forEach(n => n.executionResult = null);
        this.executionQueue = [];
        this.lastProcessedItem = null;

        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        starts.forEach(n => {
            this.executionQueue.push({ node: n, conn: null });
        });
    }

    start() {
        this.initialize();
        this.setStatus('RUNNING');
        this.tick();
    }

    startPaused() {
        this.initialize();
        this.setStatus('PAUSED');
    }

    pause() {
        if (this.status === 'RUNNING') {
            this.setStatus('PAUSED');
            if(this.timer) clearTimeout(this.timer);
        }
    }

    resume() {
        if (this.status === 'PAUSED') {
            this.setStatus('RUNNING');
            this.tick();
        }
    }

    stop() {
        this.setStatus('STOPPED');
        this.executionQueue = [];
        this.lastProcessedItem = null;
        if(this.timer) clearTimeout(this.timer);
        console.log("--- Simulation Stopped ---");
    }

    step() {
        if (this.status === 'STOPPED') {
            this.startPaused();
            this.processNext(true); 
        } else if (this.status === 'PAUSED') {
            this.processNext(true); 
        }
    }

    /**
     * REPLAY: Clears the cache for the current step's data dependencies
     * and re-executes the node so animations play again.
     */
    replayStep() {
        if (this.status === 'PAUSED' && this.lastProcessedItem) {
            // [FIX] Clear cached results for the subgraph of this node
            // so gatherInputs() is forced to re-run and re-animate the data flow.
            this.clearPureNodeCache(this.lastProcessedItem.node);

            // Push back to front
            this.executionQueue.unshift(this.lastProcessedItem);
            this.processNext(true);
        }
    }

    /**
     * Recursive helper to clear execution results of upstream pure nodes.
     */
    clearPureNodeCache(node) {
        node.inputs.forEach(pin => {
            if (pin.type === 'exec') return;
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            if (conn) {
                const src = this.graph.nodes.find(n => n.id === conn.fromNode);
                if (this.isPureNode(src)) {
                    src.executionResult = null; // Clear cache
                    this.clearPureNodeCache(src); // Recurse up
                }
            }
        });
    }

    setStatus(s) {
        this.status = s;
        if (this.onStateChange) this.onStateChange(s);
    }

    tick() {
        if (this.status !== 'RUNNING') return;
        this.processNext(false);
    }

    async processNext(isSingleStep) {
        if (this.executionQueue.length === 0) {
            this.stop();
            return;
        }

        const item = this.executionQueue.shift();
        
        // Save for Replay capability
        this.lastProcessedItem = item;
        
        const { node, conn } = item;

        // 1. Animate Wire
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            await new Promise(r => setTimeout(r, 1500));
        }

        // 2. Re-check Pause
        if (this.status === 'PAUSED' && !isSingleStep) {
            this.executionQueue.unshift(item); 
            return;
        }

        // 3. Execute Node
        // Note: Highlighting happens here for the Impusle node itself
        this.highlightNode(node.id);
        node.setError(null);

        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node);
                if (args !== null) {
                    node.executionResult = node.jsFunctionRef(...args);
                }
            } catch (err) {
                if (err.isBlueprintError) node.setError(err.message);
                else console.error(err);
                this.stop(); 
                return;
            }
        }

        // 4. Find Next
        let targetPinName = null;
        if (node.name === "Branch") {
            targetPinName = node.executionResult ? "True" : "False";
        }

        let outExecPin = null;
        if (targetPinName) {
            outExecPin = node.outputs.find(p => p.type === 'exec' && p.name === targetPinName);
        } else {
            outExecPin = node.outputs.find(p => p.type === 'exec');
        }

        if (outExecPin) {
            const nextConn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
            if (nextConn) {
                const nextNode = this.graph.nodes.find(n => n.id === nextConn.toNode);
                if (nextNode) {
                    this.executionQueue.push({ node: nextNode, conn: nextConn });
                }
            }
        }

        if (this.status === 'RUNNING' && !isSingleStep) {
            this.timer = setTimeout(() => this.tick(), 100);
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
                
                // Process Pure Nodes
                if (this.isPureNode(sourceNode)) {
                    try {
                        if (sourceNode.executionResult === null) {
                            
                            // [FIX] RECURSE FIRST, then HIGHLIGHT/CALCULATE
                            // This ensures the visualization flows from Leaf -> Root (Data Flow direction)
                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null;

                            // Now that dependencies are done, we highlight this node as "working"
                            this.highlightNode(sourceNode.id);
                            await new Promise(r => setTimeout(r, 600)); 

                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                        }
                    } catch (err) {
                        sourceNode.setError(err.message || "Error");
                        return null;
                    }
                }
                
                // DATA FLOW ANIMATION
                if (this.renderer) {
                    // [FIX] Correctly gather input values for the visualizer.
                    // Instead of blindly reading widgets (which are empty if connected),
                    // we must check connections to get the actual upstream values.
                    let debugInputs = [];
                    for(let k=0; k<sourceNode.inputs.length; k++) {
                        const inputConn = this.graph.connections.find(c => c.toNode === sourceNode.id && c.toPin === k);
                        if (inputConn) {
                            // If connected, read the calculated result from the upstream node
                            const upstreamNode = this.graph.nodes.find(n => n.id === inputConn.fromNode);
                            debugInputs.push(upstreamNode.executionResult);
                        } else {
                            // If not connected, safe to read the widget
                            debugInputs.push(sourceNode.getInputValue(k));
                        }
                    }

                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, debugInputs, sourceNode.executionResult);
                    this.renderer.animateDataWire(conn, debugLabel);
                    
                    await new Promise(r => setTimeout(r, 1000)); 
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