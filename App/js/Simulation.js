/**
 * Simulation Class
 * Manages the execution flow of the blueprint graph.
 * Handles the "Game Loop", node execution logic, data flow calculation,
 * and visual feedback (highlighting, wire animations).
 */
class Simulation {
    /**
     * @param {Graph} graph - The data model.
     * @param {Renderer} renderer - The view component (used for wire animations).
     */
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
        
        // --- State Management ---
        this.status = 'STOPPED'; 
        this.executionQueue = []; 
        this.timer = null;
        
        // --- Concurrency Control ---
        this.runInstanceId = 0;

        // --- Replay Support ---
        this.lastProcessedItem = null;
        
        this.onStateChange = null; 
    }
    
    /**
     * Resets the graph state and finds all Entry Points (Events).
     */
    initialize() {
        this.stop(); 
        this.status = 'STOPPED'; 
        
        this.runInstanceId++; 
        console.clear();
        console.log(`--- Simulation Initialized (Run ${this.runInstanceId}) ---`);
        
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
        
        this.runInstanceId++; 
        
        this.graph.nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if(el) el.style.boxShadow = "";
        });
        
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

    replayStep() {
        if (this.status === 'PAUSED' && this.lastProcessedItem) {
            this.clearPureNodeCache(this.lastProcessedItem.node);
            this.executionQueue.unshift(this.lastProcessedItem);
            this.processNext(true);
        }
    }

    clearPureNodeCache(node) {
        node.inputs.forEach(pin => {
            if (pin.type === 'exec') return;
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            if (conn) {
                const src = this.graph.nodes.find(n => n.id === conn.fromNode);
                if (this.isPureNode(src)) {
                    src.executionResult = null; 
                    this.clearPureNodeCache(src); 
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
        const currentRunId = this.runInstanceId;

        if (this.executionQueue.length === 0) {
            if (this.status === 'RUNNING') this.stop();
            return;
        }

        const item = this.executionQueue.shift();
        this.lastProcessedItem = item; 
        
        if (this.onStateChange) this.onStateChange(this.status);

        const { node, conn } = item;

        // --- 1. WIRE ANIMATION ---
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            await new Promise(r => setTimeout(r, 1500));
            if (this.runInstanceId !== currentRunId) return;
        }

        // --- 2. PAUSE CHECK ---
        if (this.status === 'PAUSED' && !isSingleStep) {
            this.executionQueue.unshift(item); 
            return;
        }

        // --- 3. EVALUATION PHASE (White) ---
        this.highlightNode(node.id, '#ffffff'); 
        node.setError(null);

        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node, currentRunId);
                if (this.runInstanceId !== currentRunId) return;

                if (args !== null) {
                    // --- 4. EXECUTION PHASE (Orange) ---
                    this.highlightNode(node.id, '#ff9900'); 
                    node.executionResult = node.jsFunctionRef(...args);
                }
            } catch (err) {
                if (err.isBlueprintError) node.setError(err.message);
                else console.error(err);
                this.stop(); 
                return;
            }
        } else {
            this.highlightNode(node.id, '#ff9900');
        }

        // --- 5. FLOW CONTROL ---
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

        // --- 6. SCHEDULE NEXT ---
        if (this.status === 'RUNNING' && !isSingleStep) {
            this.timer = setTimeout(() => this.tick(), 100);
        }
    }

    async gatherInputs(node, runId) {
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
                            
                            // [VISUAL] Highlight Pure Node (White)
                            this.highlightNode(sourceNode.id, '#ffffff'); 
                            await new Promise(r => setTimeout(r, 600)); 
                            if (this.runInstanceId !== runId) return null;

                            const sourceArgs = await this.gatherInputs(sourceNode, runId);
                            if (sourceArgs === null) return null; 
                            if (this.runInstanceId !== runId) return null;

                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                            
                            // [VISUAL] Highlight Pure Node (Orange)
                            this.highlightNode(sourceNode.id, '#ff9900'); 
                        }
                    } catch (err) {
                        sourceNode.setError(err.message || "Error");
                        return null;
                    }
                }
                
                if (this.renderer) {
                    let debugInputs = [];
                    for(let k=0; k<sourceNode.inputs.length; k++) {
                        const inputConn = this.graph.connections.find(c => c.toNode === sourceNode.id && c.toPin === k);
                        if (inputConn) {
                            const upNode = this.graph.nodes.find(n => n.id === inputConn.fromNode);
                            debugInputs.push(upNode.executionResult);
                        } else {
                            debugInputs.push(sourceNode.getInputValue(k));
                        }
                    }

                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, debugInputs, sourceNode.executionResult);
                    this.renderer.animateDataWire(conn, debugLabel);
                    
                    await new Promise(r => setTimeout(r, 1000)); 
                    if (this.runInstanceId !== runId) return null;
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

    highlightNode(id, color = '#ff9900') {
        const el = document.getElementById(`node-${id}`);
        if(el) {
            el.style.transition = "box-shadow 0.2s ease-out";
            el.style.boxShadow = `0 0 0 4px ${color}`;
            setTimeout(() => {
                if (this.status !== 'STOPPED') { 
                    el.style.boxShadow = ""; 
                }
            }, 800);
        }
    }
}