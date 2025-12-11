class Simulation {
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
        
        // State Machine: STOPPED -> RUNNING <-> PAUSED
        this.status = 'STOPPED'; 
        this.executionQueue = []; 
        this.timer = null;
        
        this.onStateChange = null; 
    }
    
    /**
     * Prepares the simulation state but does not trigger the loop.
     */
    initialize() {
        if (this.status !== 'STOPPED') this.stop();
        
        console.clear();
        console.log("--- Simulation Initialized ---");
        
        this.graph.nodes.forEach(n => n.executionResult = null);
        this.executionQueue = [];

        // Find Entry Points
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
        const { node, conn } = item;

        // 1. Animate Wire
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            await new Promise(r => setTimeout(r, 1500));
        }

        // 2. Re-check Pause State
        if (this.status === 'PAUSED' && !isSingleStep) {
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
                this.stop(); 
                return;
            }
        }

        // 4. Find Next Node(s)
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

        // 5. Schedule Next Tick
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
                
                // Pure nodes (Math, Logic) are executed on demand here
                if (this.isPureNode(sourceNode)) {
                    try {
                        if (sourceNode.executionResult === null) {
                            
                            // [FIX] Highlight Pure Node as a "Step"
                            this.highlightNode(sourceNode.id);
                            // Short delay to visualize the Pure node doing work
                            await new Promise(r => setTimeout(r, 600)); 

                            const sourceArgs = await this.gatherInputs(sourceNode);
                            if (sourceArgs === null) return null;
                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                        }
                    } catch (err) {
                        sourceNode.setError(err.message || "Error");
                        return null;
                    }
                }
                
                if (this.renderer) {
                    this.renderer.animateDataWire(conn, sourceNode.executionResult);
                    // [FIX] Increased delay to 1000ms to "spend more time" on data flow
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