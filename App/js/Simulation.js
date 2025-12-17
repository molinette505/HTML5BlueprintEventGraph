/**
 * Simulation Class
 * Manages the execution flow of the blueprint graph.
 */
class Simulation {
    constructor(graph, renderer) { 
        this.graph = graph; 
        this.renderer = renderer;
        this.status = 'STOPPED'; 
        this.executionQueue = []; 
        this.timer = null;
        this.runInstanceId = 0;
        this.lastProcessedItem = null;
        this.onStateChange = null; 
        
        // Tracks all visuals (labels AND glowing wires) for the current step
        this.activeStepVisuals = [];
    }
    
    initialize() {
        this.stop(); 
        this.status = 'STOPPED'; 
        this.runInstanceId++; 
        console.clear();
        console.log(`--- Simulation Initialized (Run ${this.runInstanceId}) ---`);
        
        // Reset Variables to their Default Values
        if (window.App.variableManager) {
            window.App.variableManager.resetRuntime();
        }

        this.graph.nodes.forEach(n => n.executionResult = null);
        this.executionQueue = [];
        this.lastProcessedItem = null;
        this.clearStepVisuals(); // Ensure clean slate

        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        starts.forEach(n => {
            this.executionQueue.push({ node: n, conn: null });
        });
    }

    start() { this.initialize(); this.setStatus('RUNNING'); this.tick(); }
    startPaused() { this.initialize(); this.setStatus('PAUSED'); }
    pause() { if (this.status === 'RUNNING') { this.setStatus('PAUSED'); if(this.timer) clearTimeout(this.timer); } }
    resume() { if (this.status === 'PAUSED') { this.setStatus('RUNNING'); this.tick(); } }

    stop() {
        this.setStatus('STOPPED');
        this.executionQueue = [];
        this.lastProcessedItem = null;
        if(this.timer) clearTimeout(this.timer);
        this.runInstanceId++; 
        
        // Cleanup visuals
        this.graph.nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if(el) el.style.boxShadow = "";
        });
        this.clearStepVisuals(); 
        
        // Also clear any persistent wire highlights
        this.graph.connections.forEach(c => this.resetWireColor(c));

        console.log("--- Simulation Stopped ---");
    }

    step() {
        if (this.status === 'STOPPED') { this.startPaused(); this.processNext(true); }
        else if (this.status === 'PAUSED') { this.processNext(true); }
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

        // Animate Wire (Execution Flow)
        if (conn && this.renderer) {
            this.renderer.animateExecWire(conn);
            // Visual pause for the execution wire flowing to this node
            await new Promise(r => setTimeout(r, 1500));
            if (this.runInstanceId !== currentRunId) return;
        }

        if (this.status === 'PAUSED' && !isSingleStep) {
            this.executionQueue.unshift(item); 
            return;
        }

        this.highlightNode(node.id, '#ffffff'); 
        node.setError(null);

        if (node.jsFunctionRef) {
            try {
                const args = await this.gatherInputs(node, currentRunId);
                if (this.runInstanceId !== currentRunId) return;
                
                if (args === null) {
                    this.stop();
                    return;
                }

                if (args !== null) {
                    this.highlightNode(node.id, '#ff9900'); 
                    
                    // --- CHANGED: CLEAR LABELS HERE ---
                    // The labels from gatherInputs() are cleared exactly when the node starts "running".
                    this.clearStepVisuals(); 

                    // Execution Phase
                    node.executionResult = node.jsFunctionRef.apply(node, args);
                }
            } catch (err) {
                if (err.isBlueprintError) node.setError(err.message);
                else console.error(err);
                this.stop(); 
                return;
            }
        } else {
            this.highlightNode(node.id, '#ff9900');
            // If it's a dummy node or event, still clear old visuals
            this.clearStepVisuals(); 
        }

        // Branching Logic
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

    async gatherInputs(node, runId) {
        const args = [];
        
        // --- VISUALIZATION: BACKTRACK HIGHLIGHT ---
        // If this is an Impure Node (Start of chain), light up the path white.
        let dependencyConnections = [];
        if (!this.isPureNode(node)) {
            const { nodes, connections } = this.collectPureDependencyChain(node);
            dependencyConnections = connections;
            if (nodes.length > 0) {
                this.highlightElements(nodes, connections, '#ffffff');
                await new Promise(r => setTimeout(r, 600)); 
                if (this.runInstanceId !== runId) return null;
            }
        }

        for(let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue; 

            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            let val = null;

            if (conn) {
                const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
                
                if (this.isPureNode(sourceNode)) {
                    try {
                        // FORCE RE-EVALUATION for Variable.Get
                        const isVariableGet = sourceNode.functionId === 'Variable.Get';

                        if (sourceNode.executionResult === null || isVariableGet) {
                            if (this.runInstanceId !== runId) return null;

                            const sourceArgs = await this.gatherInputs(sourceNode, runId);
                            if (sourceArgs === null) return null; 
                            if (this.runInstanceId !== runId) return null;

                            sourceNode.setError(null);
                            
                            // Calculate
                            const rawRes = sourceNode.jsFunctionRef.apply(sourceNode, sourceArgs);
                            
                            const outPin = sourceNode.outputs[0];
                            sourceNode.executionResult = this.castValue(rawRes, outPin ? outPin.type : 'wildcard');
                            
                            // Execution triggers the Orange flash
                            this.highlightNode(sourceNode.id, '#ff9900');
                            
                            // DO NOT CLEAR LABELS/WIRES HERE. 
                            // They must persist so the parent node can show them alongside other inputs.

                        } else {
                            // If cached, just clear the "highlight" effect (white box) 
                            // but we do NOT clear the data wire flow yet.
                            this.clearNodeHighlight(sourceNode.id);
                            
                            // Important: We need to ensure the cached inputs are also reset 
                            // from "White" to "Normal" so they can be animated to "Flowing" if needed.
                            this.resetInputWiresRecursively(sourceNode);
                        }
                    } catch (err) {
                        sourceNode.setError(err.message || "Error");
                        return null;
                    }
                }
                
                val = sourceNode.executionResult;

                if (this.renderer) {
                    // Turn off "White" highlight, so "Data Flow" color can take over
                    this.resetWireColor(conn);

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

                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, debugInputs, val);
                    
                    // --- PERSISTENT VISUAL LOGIC ---
                    // 1. animateDataWire turns on the "data-flow" class (for 500ms) AND creates the label.
                    // 2. It returns both.
                    // 3. We track them so we can force-remove the label later.
                    const visualObj = this.renderer.animateDataWire(conn, debugLabel);
                    this.addStepVisual(visualObj);
                    
                    // Wait 1s for the "pulse" to travel visually before moving to next input
                    await new Promise(r => setTimeout(r, 1000)); 
                    if (this.runInstanceId !== runId) return null;
                }
            } else {
                val = node.getInputValue(i);
            }

            args.push(this.castValue(val, pin.type));
        }

        // --- CLEANUP OF HIGHLIGHTS ---
        // We only reset the "White" path color. 
        // We do NOT remove the text labels or the "Data Flow" glow here.
        if (!this.isPureNode(node) && dependencyConnections.length > 0) {
            dependencyConnections.forEach(c => this.resetWireColor(c));
        }

        return args;
    }

    castValue(val, type) {
        if (val === null || val === undefined) return val;
        if (type === 'wildcard') return val;

        switch (type) {
            case 'int':
                if (typeof val === 'number') return Math.floor(val);
                return parseInt(val) || 0;
            case 'float':
                if (typeof val === 'number') return val;
                return parseFloat(val) || 0.0;
            case 'string':
                 if (typeof val === 'object') {
                    if ('x' in val && 'y' in val && 'z' in val) 
                        return `X=${val.x.toFixed(3)} Y=${val.y.toFixed(3)} Z=${val.z.toFixed(3)}`;
                    return JSON.stringify(val);
                }
                return String(val);
            case 'boolean':
                return Boolean(val);
            default:
                return val;
        }
    }

    isPureNode(node) { return !node.inputs.some(p => p.type === 'exec'); }

    highlightNode(id, color = '#ff9900') {
        const el = document.getElementById(`node-${id}`);
        if(el) {
            el.style.transition = "box-shadow 0.2s ease-out";
            el.style.boxShadow = `0 0 0 4px ${color}`;
            setTimeout(() => {
                if (this.status !== 'STOPPED') el.style.boxShadow = ""; 
            }, 800);
        }
    }

    // --- HELPER METHODS ---

    /**
     * Stores a reference to a visual object (Label + Wire Element).
     */
    addStepVisual(visualObj) {
        if (visualObj) {
            this.activeStepVisuals.push(visualObj);
        }
    }

    /**
     * Removes ALL currently active step visuals (Labels and Wire Glows).
     */
    clearStepVisuals() {
        if (this.activeStepVisuals && this.activeStepVisuals.length > 0) {
            this.activeStepVisuals.forEach(obj => {
                // Remove Label
                if (obj.label) obj.label.remove();
                // Remove Wire Glow (just in case the timeout hasn't fired yet)
                if (obj.path) obj.path.classList.remove('data-flow');
            });
            this.activeStepVisuals = [];
        }
    }

    collectPureDependencyChain(rootNode) {
        let nodes = new Set();
        let connections = new Set();
        
        const traverse = (n) => {
            n.inputs.forEach(pin => {
                if (pin.type === 'exec') return; 
                const conn = this.graph.connections.find(c => c.toNode === n.id && c.toPin === pin.index);
                if (conn) {
                    const src = this.graph.nodes.find(node => node.id === conn.fromNode);
                    if (this.isPureNode(src)) {
                        connections.add(conn);
                        if (!nodes.has(src)) {
                            nodes.add(src);
                            traverse(src);
                        }
                    }
                }
            });
        };
        
        traverse(rootNode);
        return { nodes: Array.from(nodes), connections: Array.from(connections) };
    }

    resetInputWiresRecursively(node) {
        node.inputs.forEach(pin => {
            if (pin.type === 'exec') return;
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            if (conn) {
                this.resetWireColor(conn);
                const src = this.graph.nodes.find(n => n.id === conn.fromNode);
                if (src && this.isPureNode(src)) {
                    this.clearNodeHighlight(src.id);
                    this.resetInputWiresRecursively(src);
                }
            }
        });
    }

    highlightElements(nodes, connections, color) {
        nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if(el) {
                el.style.transition = "box-shadow 0.2s ease-out";
                el.style.boxShadow = `0 0 0 4px ${color}`;
            }
        });
        connections.forEach(c => {
            const path = document.getElementById(`conn-${c.id}`);
            if(path) {
                if (!path.dataset.originalColor) {
                    path.dataset.originalColor = path.style.stroke;
                }
                path.style.stroke = color;
            }
        });
    }

    clearNodeHighlight(id) {
        const el = document.getElementById(`node-${id}`);
        if(el) el.style.boxShadow = "";
    }

    resetWireColor(conn) {
         const path = document.getElementById(`conn-${conn.id}`);
         if(path) {
             if (path.dataset.originalColor) {
                 path.style.stroke = path.dataset.originalColor;
                 delete path.dataset.originalColor;
             } else {
                 const typeDef = window.typeDefinitions ? window.typeDefinitions[conn.type] : null;
                 const color = typeDef ? typeDef.color : '#fff'; 
                 path.style.stroke = color; 
             }
         }
    }
}