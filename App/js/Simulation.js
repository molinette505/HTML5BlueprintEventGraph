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
        // 'STOPPED': Reset state.
        // 'RUNNING': Executing automatically on a timer.
        // 'PAUSED': executionQueue is preserved, but tick() is suspended.
        this.status = 'STOPPED'; 
        
        // The Queue holds {node, conn} objects representing the execution path.
        this.executionQueue = []; 
        this.timer = null;
        
        // --- Concurrency Control ---
        // A unique ID generated every time the simulation starts or stops.
        // This is checked after every 'await' delay. If the ID has changed 
        // (meaning the user stopped/restarted), the old async operation aborts immediately.
        this.runInstanceId = 0;

        // --- Replay Support ---
        // Stores the last executed item {node, conn} so we can re-queue it.
        this.lastProcessedItem = null;
        
        // Callback for the Editor to update UI buttons (Play/Pause states)
        this.onStateChange = null; 
    }
    
    /**
     * Resets the graph state and finds all Entry Points (Events).
     * Does NOT start the loop.
     */
    initialize() {
        this.stop(); // Ensure clean state
        this.status = 'STOPPED'; // Temporarily reset
        
        this.runInstanceId++; // New Run ID to invalidate old timers
        console.clear();
        console.log(`--- Simulation Initialized (Run ${this.runInstanceId}) ---`);
        
        // Reset old execution data
        this.graph.nodes.forEach(n => n.executionResult = null);
        this.executionQueue = [];
        this.lastProcessedItem = null;

        // Find all "Event BeginPlay" nodes to bootstrap the execution
        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        starts.forEach(n => {
            this.executionQueue.push({ node: n, conn: null });
        });
    }

    /**
     * Starts the simulation immediately.
     */
    start() {
        this.initialize();
        this.setStatus('RUNNING');
        this.tick();
    }

    /**
     * Initializes the simulation but waits in a PAUSED state.
     * Useful for debugging from the very first frame.
     */
    startPaused() {
        this.initialize();
        this.setStatus('PAUSED');
        // We don't call tick(), waiting for user Step/Play.
    }

    /**
     * Pauses the automatic execution loop.
     * Existing async wire animations will finish, but the next node won't process.
     */
    pause() {
        if (this.status === 'RUNNING') {
            this.setStatus('PAUSED');
            if(this.timer) clearTimeout(this.timer);
        }
    }

    /**
     * Resumes execution from the current point in the queue.
     */
    resume() {
        if (this.status === 'PAUSED') {
            this.setStatus('RUNNING');
            this.tick();
        }
    }

    /**
     * Hard stop. Clears queue, resets run ID, and clears visual highlights.
     */
    stop() {
        this.setStatus('STOPPED');
        this.executionQueue = [];
        this.lastProcessedItem = null;
        if(this.timer) clearTimeout(this.timer);
        
        // Increment ID to kill any "zombie" async processes currently waiting
        this.runInstanceId++; 
        
        // Clear all node highlights
        this.graph.nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if(el) el.style.boxShadow = "";
        });
        
        console.log("--- Simulation Stopped ---");
    }

    /**
     * Steps forward by one node.
     * If Stopped: Starts Paused and steps once.
     * If Paused: Steps once.
     */
    step() {
        if (this.status === 'STOPPED') {
            this.startPaused();
            this.processNext(true); // true = Single Step Mode
        } else if (this.status === 'PAUSED') {
            this.processNext(true); 
        }
    }

    /**
     * Re-runs the last executed node.
     * Useful to re-trigger data flow animations and see values again.
     */
    replayStep() {
        if (this.status === 'PAUSED' && this.lastProcessedItem) {
            // Important: Clear the cache of the current node's dependencies.
            // This forces gatherInputs() to re-run and re-animate the data wires.
            this.clearPureNodeCache(this.lastProcessedItem.node);

            // Push the item back to the front of the queue
            this.executionQueue.unshift(this.lastProcessedItem);
            this.processNext(true);
        }
    }

    /**
     * Helper to recursively clear cached results of upstream Pure nodes.
     * Ensures that when we "Replay", the data calculations actually happen again.
     */
    clearPureNodeCache(node) {
        node.inputs.forEach(pin => {
            if (pin.type === 'exec') return;
            
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            if (conn) {
                const src = this.graph.nodes.find(n => n.id === conn.fromNode);
                // Only clear Pure nodes (math/logic), not stateful nodes
                if (this.isPureNode(src)) {
                    src.executionResult = null; 
                    this.clearPureNodeCache(src); // Recurse upstream
                }
            }
        });
    }

    /**
     * Updates the status and notifies the Editor (to update button states).
     */
    setStatus(s) {
        this.status = s;
        if (this.onStateChange) this.onStateChange(s);
    }

    /**
     * The main loop trigger.
     */
    tick() {
        if (this.status !== 'RUNNING') return;
        this.processNext(false);
    }

    /**
     * Processes the next item in the execution queue.
     * @param {Boolean} isSingleStep - If true, we pause after this node.
     */
    async processNext(isSingleStep) {
        // [CONCURRENCY] Capture the ID at the start of the step.
        const currentRunId = this.runInstanceId;

        if (this.executionQueue.length === 0) {
            if (this.status === 'RUNNING') this.stop();
            return;
        }

        const item = this.executionQueue.shift();
        this.lastProcessedItem = item; // Store for Replay
        
        // Notify UI (Replay button might need enabling)
        if (this.onStateChange) this.onStateChange(this.status);

        const { node, conn } = item;

        // --- 1. WIRE ANIMATION ---
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            // Visual Delay: Wait for the ball to travel (1.5s)
            await new Promise(r => setTimeout(r, 1500));
            
            // [CONCURRENCY] If simulation stopped/restarted while we waited, abort.
            if (this.runInstanceId !== currentRunId) return;
        }

        // --- 2. PAUSE CHECK ---
        // If user hit Pause *during* the wire animation, stop here.
        if (this.status === 'PAUSED' && !isSingleStep) {
            this.executionQueue.unshift(item); // Put back in queue
            return;
        }

        // --- 3. EVALUATION PHASE (White Highlight) ---
        // Visual indication that the node is "Thinking" / Gathering Data
        this.highlightNode(node.id, '#ffffff'); 
        node.setError(null);

        // Execute Node Logic
        if (node.jsFunctionRef) {
            try {
                // This might take time if data wires need to animate
                const args = await this.gatherInputs(node, currentRunId);
                
                // [CONCURRENCY] Check again after data gathering
                if (this.runInstanceId !== currentRunId) return;

                if (args !== null) {
                    // --- 4. EXECUTION PHASE (Orange Highlight) ---
                    // Data is ready, executing the function.
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
            // Nodes without logic (Events) execution immediately
            this.highlightNode(node.id, '#ff9900');
        }

        // --- 5. FLOW CONTROL (Branching) ---
        let targetPinName = null;
        if (node.name === "Branch") {
            // Branch Node: Choose output based on boolean result
            targetPinName = node.executionResult ? "True" : "False";
        }

        // Find the correct Output Pin
        let outExecPin = null;
        if (targetPinName) {
            outExecPin = node.outputs.find(p => p.type === 'exec' && p.name === targetPinName);
        } else {
            // Default: Take the first execution pin found
            outExecPin = node.outputs.find(p => p.type === 'exec');
        }

        // Queue the next node
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

    /**
     * Recursively calculates inputs for a node.
     * Triggers animations for Pure (Data) nodes.
     * @param {Node} node - The node requesting data.
     * @param {Number} runId - The current simulation ID for concurrency checks.
     */
    async gatherInputs(node, runId) {
        const args = [];
        
        // Loop through all Inputs
        for(let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue; // Skip Exec pins

            // Check for incoming connection
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            
            if (conn) {
                const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
                
                // If it's a Pure Node (Math/Logic), we must execute it on demand
                if (this.isPureNode(sourceNode)) {
                    try {
                        // Only execute if not already cached (Lazy Evaluation)
                        if (sourceNode.executionResult === null) {
                            
                            // [VISUAL] Step 1: Highlight Source Node (White/Waiting)
                            this.highlightNode(sourceNode.id, '#ffffff'); 
                            await new Promise(r => setTimeout(r, 600)); 
                            
                            // [CONCURRENCY]
                            if (this.runInstanceId !== runId) return null;

                            // [VISUAL] Step 2: Recurse (Calculate dependencies of the source)
                            const sourceArgs = await this.gatherInputs(sourceNode, runId);
                            if (sourceArgs === null) return null; 
                            if (this.runInstanceId !== runId) return null;

                            // [LOGIC] Execute the Pure Node
                            sourceNode.setError(null);
                            sourceNode.executionResult = sourceNode.jsFunctionRef(...sourceArgs);
                            
                            // [VISUAL] Step 3: Highlight Source Node (Orange/Done)
                            this.highlightNode(sourceNode.id, '#ff9900'); 
                        }
                    } catch (err) {
                        sourceNode.setError(err.message || "Error");
                        return null;
                    }
                }
                
                // [VISUAL] DATA WIRE ANIMATION
                if (this.renderer) {
                    // Re-gather inputs to generate the specific debug string (e.g. "5 + 2 = 7")
                    let debugInputs = [];
                    for(let k=0; k<sourceNode.inputs.length; k++) {
                        const inputConn = this.graph.connections.find(c => c.toNode === sourceNode.id && c.toPin === k);
                        if (inputConn) {
                            // If input is connected, use the result of that upstream node
                            const upNode = this.graph.nodes.find(n => n.id === inputConn.fromNode);
                            debugInputs.push(upNode.executionResult);
                        } else {
                            // If input is not connected, use the local widget value
                            debugInputs.push(sourceNode.getInputValue(k));
                        }
                    }

                    // Get formatted string from Registry
                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, debugInputs, sourceNode.executionResult);
                    this.renderer.animateDataWire(conn, debugLabel);
                    
                    // Delay to allow user to see the flow
                    await new Promise(r => setTimeout(r, 1000)); 
                    if (this.runInstanceId !== runId) return null;
                }
                
                args.push(sourceNode.executionResult);
            } else {
                // If not connected, use the Widget's value
                args.push(node.getInputValue(i));
            }
        }
        return args;
    }

    /**
     * Checks if a node is "Pure" (has no execution pins).
     */
    isPureNode(node) {
        return !node.inputs.some(p => p.type === 'exec');
    }

    /**
     * Applies a colored shadow to a node for visual feedback.
     * @param {Number} id - Node ID
     * @param {String} color - CSS Color string
     */
    highlightNode(id, color = '#ff9900') {
        const el = document.getElementById(`node-${id}`);
        if(el) {
            el.style.transition = "box-shadow 0.2s ease-out";
            el.style.boxShadow = `0 0 0 4px ${color}`;
            
            // Auto-remove highlight after a short delay (unless stopped)
            setTimeout(() => {
                if (this.status !== 'STOPPED') { 
                    el.style.boxShadow = ""; 
                }
            }, 800);
        }
    }
}