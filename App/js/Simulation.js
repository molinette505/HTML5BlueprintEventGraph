class Simulation {
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
        
        // State Machine: STOPPED -> RUNNING <-> PAUSED
        this.status = 'STOPPED'; 
        this.executionQueue = []; // Queue of { node, conn } waiting to process
        this.timer = null;
        
        // Track the last item to support "Replay"
        this.lastProcessedItem = null;
        
        // Optional callback to update UI buttons in Editor.js
        this.onStateChange = null; 
    }
    
    /**
     * Prepares the simulation state but does not trigger the loop.
     */
    initialize() {
        if (this.status !== 'STOPPED') this.stop();
        
        console.clear();
        console.log("--- Simulation Initialized ---");
        
        // Reset old data
        this.graph.nodes.forEach(n => n.executionResult = null);
        this.executionQueue = [];
        this.lastProcessedItem = null;

        // Find Entry Points
        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        starts.forEach(n => {
            this.executionQueue.push({ node: n, conn: null });
        });
    }

    /**
     * Starts execution immediately.
     */
    start() {
        this.initialize();
        this.setStatus('RUNNING');
        this.tick();
    }

    /**
     * Initializes the simulation but keeps it paused at the beginning.
     */
    startPaused() {
        this.initialize();
        this.setStatus('PAUSED');
        // We don't call tick(), so it waits here.
    }

    /**
     * Pauses execution after the current step finishes.
     */
    pause() {
        if (this.status === 'RUNNING') {
            this.setStatus('PAUSED');
            if(this.timer) clearTimeout(this.timer);
        }
    }

    /**
     * Resumes execution from the current queue.
     */
    resume() {
        if (this.status === 'PAUSED') {
            this.setStatus('RUNNING');
            this.tick();
        }
    }

    /**
     * Stops execution, clears queue, and resets UI.
     */
    stop() {
        this.setStatus('STOPPED');
        this.executionQueue = [];
        this.lastProcessedItem = null;
        if(this.timer) clearTimeout(this.timer);
        console.log("--- Simulation Stopped ---");
    }

    /**
     * Executes exactly one step (the next node in the queue).
     * Can now start the simulation if it's currently stopped.
     */
    step() {
        if (this.status === 'STOPPED') {
            this.startPaused();
            // Allow visual update to settle before processing
            this.processNext(true); 
        } else if (this.status === 'PAUSED') {
            this.processNext(true); 
        }
    }

    /**
     * REPLAY: Puts the last executed node back at the front of the queue
     * and executes it again immediately.
     */
    replayStep() {
        if (this.status === 'PAUSED' && this.lastProcessedItem) {
            // Push back to front
            this.executionQueue.unshift(this.lastProcessedItem);
            this.processNext(true);
        }
    }

    setStatus(s) {
        this.status = s;
        if (this.onStateChange) this.onStateChange(s);
    }

    /**
     * Main Loop Trigger
     */
    tick() {
        if (this.status !== 'RUNNING') return;
        this.processNext(false);
    }

    /**
     * Processes the next item in the execution queue.
     * @param {Boolean} isSingleStep - If true, do not schedule the next tick.
     */
    async processNext(isSingleStep) {
        if (this.executionQueue.length === 0) {
            this.stop();
            return;
        }

        // Pop next task
        const item = this.executionQueue.shift();
        
        // Save for Replay capability
        this.lastProcessedItem = item;
        
        const { node, conn } = item;

        // 1. Animate Wire (if arriving via connection)
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            // Wait for visual travel time (1.5s)
            await new Promise(r => setTimeout(r, 1500));
        }

        // 2. Check Pause State again (user might have clicked Pause during animation)
        if (this.status === 'PAUSED' && !isSingleStep) {
            // Put it back in front of queue to retry later
            this.executionQueue.unshift(item); 
            return;
        }

        // 3. Execute Node Logic
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
                this.stop(); // Stop on error
                return;
            }
        }

        // 4. Find Next Node(s)
        let targetPinName = null;
        // Branching Logic
        if (node.name === "Branch") {
            targetPinName = node.executionResult ? "True" : "False";
        }

        // Find outputs
        let outExecPin = null;
        if (targetPinName) {
            outExecPin = node.outputs.find(p => p.type === 'exec' && p.name === targetPinName);
        } else {
            // Default: First exec pin
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

        // 5. Schedule Next Tick
        if (this.status === 'RUNNING' && !isSingleStep) {
            // Small delay between nodes for visual pacing
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
                
                // Pure nodes (Math, Logic) are executed on demand here
                if (this.isPureNode(sourceNode)) {
                    try {
                        // Recurse to calculate dependency
                        if (sourceNode.executionResult === null) {
                            
                            // [VISUAL] Highlight Pure Node as a "Step"
                            this.highlightNode(sourceNode.id);
                            // Short delay to visualize the Pure node doing work
                            await new Promise(r => setTimeout(r, 600)); 

                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null; // Propagate stop signal

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

                // DATA FLOW ANIMATION
                if (this.renderer) {
                    // Gather input values again to generate the visual label string
                    let debugInputs = [];
                    for(let k=0; k<sourceNode.inputs.length; k++) {
                        // Simple lookup: if connected, use upstream result, else use widget value
                        // Since we just calculated sourceNode, its upstream inputs are effectively resolved/cached or available.
                        // However, strictly speaking, we'd need to peek at them. 
                        // For simplicity, we just use the widget values if not connected, or we'd need a more complex 'peek' function.
                        // Ideally, we'd cache inputs in the node during execution.
                        // Here we just grab what we can for the visualizer.
                        
                        // NOTE: This re-access is safe but might be slightly inaccurate for complex chains if we don't traverse. 
                        // But since we just executed it, we assume we can just look at `getInputValue` or we skip it.
                        // Let's rely on FunctionRegistry to handle missing inputs gracefully.
                        debugInputs.push(sourceNode.getInputValue(k)); 
                    }

                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, debugInputs, sourceNode.executionResult);
                    this.renderer.animateDataWire(conn, debugLabel);
                    
                    // [DELAY] Spend time on data wire
                    await new Promise(r => setTimeout(r, 1000)); 
                }

                args.push(sourceNode.executionResult);
            } else {
                // No connection: Use the literal value from the widget
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