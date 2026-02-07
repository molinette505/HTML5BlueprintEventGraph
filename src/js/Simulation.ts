/**
 * Simulation Class
 * Manages the execution flow of the blueprint graph.
 */
export class Simulation {
    constructor(graph, renderer) {
        this.graph = graph;
        this.renderer = renderer;
        this.status = 'STOPPED';
        this.executionQueue = [];
        this.timer = null;
        this.runInstanceId = 0;
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        this.onStateChange = null;

        // Request tracking for queued evaluations
        this.nextRequestId = 1;
        this.pendingRequests = new Map();

        // Tracks all visuals (labels AND glowing wires) for the current step
        this.activeStepVisuals = [];
        this.connectionVisuals = new Map();

        this.execPolicies = {
            "For Loop": (node, ctx, item, continuations, currentRunId) => this.runForLoop(node, ctx, continuations, !!item.isLoopContinuation),
            "WhileLoop": (node, ctx, item, continuations, currentRunId) => this.runWhileLoop(node, ctx, continuations),
            "Do Once": (node, ctx, item, continuations, currentRunId) => this.runDoOnce(node, item.conn ? item.conn.toPin : null, continuations),
            "Delay": (node, ctx, item, continuations, currentRunId) => this.runDelay(node, ctx, continuations, currentRunId),
            "Branch": (node, ctx, item, continuations, currentRunId) => this.runDefaultExec(node, ctx, continuations)
        };
        this.purePolicies = {
            "default": (node, ctx, item, currentRunId) => this.runDefaultPure(node, ctx, item, currentRunId)
        };
    }

    initialize() {
        this.stop();
        this.status = 'STOPPED';
        this.runInstanceId++;
        console.clear();
        console.log(`--- Simulation Initialized (Run ${this.runInstanceId}) ---`);

        // Reset Variables to their Default Values
        if (window.App && window.App.variableManager) {
            window.App.variableManager.resetRuntime();
        }

        this.graph.nodes.forEach(n => {
            n.executionResult = null;
            n.loopState = null;
            n.doOnceFired = false;
        });
        this.executionQueue = [];
        this.pendingRequests.clear();
        this.nextRequestId = 1;
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        this.clearStepVisuals(); // Ensure clean slate

        const starts = this.graph.nodes.filter(n => n.name === "Event BeginPlay");
        starts.forEach(n => {
            this.queueExec(n, null);
        });
    }

    start() { this.initialize(); this.setStatus('RUNNING'); this.tick(); }
    startPaused() { this.initialize(); this.setStatus('PAUSED'); }
    pause() { if (this.status === 'RUNNING') { this.setStatus('PAUSED'); if (this.timer) clearTimeout(this.timer); } }
    resume() { if (this.status === 'PAUSED') { this.setStatus('RUNNING'); this.tick(); } }

    stop() {
        this.setStatus('STOPPED');
        this.executionQueue = [];
        this.pendingRequests.clear();
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        if (this.timer) clearTimeout(this.timer);
        this.runInstanceId++;

        this.graph.nodes.forEach(n => {
            n.executionResult = null;
            n.loopState = null;
            n.doOnceFired = false;
        });

        // Cleanup visuals
        this.graph.nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if (el) el.style.boxShadow = "";
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
        if (this.status === 'PAUSED' && this.lastProcessedExec) {
            const task = this.createTask('exec', this.lastProcessedExec.node, { conn: this.lastProcessedExec.conn });
            this.executionQueue.unshift(task);
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

    createTask(kind, node, extra = {}) {
        const id = this.nextRequestId++;
        const inputValues = new Array(node.inputs.length);
        const inputReady = new Array(node.inputs.length).fill(false);
        const inputScheduled = new Array(node.inputs.length).fill(false);

        node.inputs.forEach((pin, idx) => {
            if (pin.type === 'exec') inputReady[idx] = true;
        });

        this.pendingRequests.set(id, { node, inputValues, inputReady, inputScheduled });
        return { id, kind, node, ...extra };
    }

    queueExec(node, conn, toFront = false, continuations = null) {
        const task = this.createTask('exec', node, { conn, continuations });
        if (toFront) this.executionQueue.unshift(task);
        else this.executionQueue.push(task);
        return task;
    }

    queuePure(node, deliverTo, toFront = false) {
        const task = this.createTask('pure', node, { deliverTo });
        if (toFront) this.executionQueue.unshift(task);
        else this.executionQueue.push(task);
        return task;
    }

    buildArgs(node, ctx) {
        const args = [];
        for (let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue;
            args.push(ctx.inputValues[i]);
        }
        return args;
    }

    resolveInputs(task) {
        const ctx = this.pendingRequests.get(task.id);
        if (!ctx) return { ready: false, deps: [] };

        const deps = [];
        const node = task.node;

        for (let i = 0; i < node.inputs.length; i++) {
            const pin = node.inputs[i];
            if (pin.type === 'exec') continue;
            if (ctx.inputReady[i]) continue;

            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === i);

            if (!conn) {
                const rawVal = node.getInputValue(i);
                ctx.inputValues[i] = this.castValue(rawVal, pin.type);
                ctx.inputReady[i] = true;
                continue;
            }

            const sourceNode = this.graph.nodes.find(n => n.id === conn.fromNode);
            if (!sourceNode) {
                ctx.inputValues[i] = this.castValue(null, pin.type);
                ctx.inputReady[i] = true;
                continue;
            }

            if (this.isPureNode(sourceNode)) {
                if (!ctx.inputScheduled[i]) {
                    ctx.inputScheduled[i] = true;
                    const pureTask = this.createTask('pure', sourceNode, {
                        deliverTo: { requestId: task.id, inputIndex: i, conn }
                    });
                    deps.push(pureTask);
                }
            } else {
                const incomingVal = this.castValue(sourceNode.executionResult, pin.type);
                ctx.inputValues[i] = incomingVal;
                ctx.inputReady[i] = true;
                if (this.renderer && conn) {
                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, [], incomingVal);
                    const visualObj = this.renderer.animateDataWire(conn, debugLabel);
                    this.addStepVisual(visualObj);
                    ctx.inputVisualDelay = true;
                }
            }
        }

        const ready = node.inputs.every((pin, idx) => pin.type === 'exec' || ctx.inputReady[idx]);
        return { ready, deps };
    }

    deliverInput(deliverTo, value) {
        const targetCtx = this.pendingRequests.get(deliverTo.requestId);
        if (!targetCtx) return;
        targetCtx.inputValues[deliverTo.inputIndex] = value;
        targetCtx.inputReady[deliverTo.inputIndex] = true;
    }

    enqueueContinuation(continuations) {
        if (!continuations || continuations.length === 0) return false;
        const next = continuations.pop();
        if (!next) return false;
        next.continuations = continuations;
        this.executionQueue.push(next);
        return true;
    }

    clearInputVisuals(node) {
        node.inputs.forEach(pin => {
            if (pin.type === 'exec') return;
            const conn = this.graph.connections.find(c => c.toNode === node.id && c.toPin === pin.index);
            if (conn) this.removeConnectionVisual(conn.id);
        });
    }

    async processNext(isSingleStep) {
        const currentRunId = this.runInstanceId;
        if (this.executionQueue.length === 0) {
            if (this.status === 'RUNNING') this.stop();
            return;
        }

        const item = this.executionQueue.shift();
        if (this.onStateChange) this.onStateChange(this.status);

        if (this.status === 'PAUSED' && !isSingleStep) {
            this.executionQueue.unshift(item);
            return;
        }

        const ctx = this.pendingRequests.get(item.id);
        if (!ctx) {
            if (this.status === 'RUNNING' && !isSingleStep) {
                this.timer = setTimeout(() => this.tick(), 100);
            }
            return;
        }

        if (item.kind === 'exec') {
            if (!item.execWireDone && item.conn && this.renderer) {
                this.renderer.animateExecWire(item.conn);
                await new Promise(r => setTimeout(r, 1500));
                if (this.runInstanceId !== currentRunId) return;
                item.execWireDone = true;
            } else if (!item.execWireDone) {
                item.execWireDone = true;
            }

            if (!item.waitingHighlight) {
                this.setNodeHighlight(item.node.id, '#ffffff');
                item.waitingHighlight = true;
            }
        }

        let ready = false;
        let deps = [];
        if (item.kind === 'exec' && item.node.name === "For Loop" && item.isLoopContinuation) {
            ready = true;
        } else {
            const res = this.resolveInputs(item);
            ready = res.ready;
            deps = res.deps;
        }
        if (!ready) {
            if (deps.length > 0) {
                this.executionQueue = deps.concat([item], this.executionQueue);
            } else {
                this.executionQueue.push(item);
            }

            if (this.status === 'RUNNING' && !isSingleStep) {
                this.timer = setTimeout(() => this.tick(), 100);
            }
            return;
        }

        if (item.kind === 'pure' && ctx.inputVisualDelay && !item.inputVisualWaited) {
            item.inputVisualWaited = true;
            ctx.inputVisualDelay = false;
            await new Promise(r => setTimeout(r, 2000));
            if (this.runInstanceId !== currentRunId) return;
        }

        if (item.kind === 'exec') {
            const node = item.node;

            if (this.status === 'PAUSED' && !isSingleStep) {
                this.executionQueue.unshift(item);
                return;
            }

            this.clearInputVisuals(node);
            node.setError(null);

            const continuations = item.continuations ? item.continuations.slice() : [];

            const incomingPinIndex = item.conn ? item.conn.toPin : null;

            this.executeExecNode(node, ctx, item, continuations, currentRunId);

            this.pendingRequests.delete(item.id);
            this.lastProcessedItem = item;
            this.lastProcessedExec = item;
            if (this.onStateChange) this.onStateChange(this.status);
        } else if (item.kind === 'pure') {
            const node = item.node;
            node.setError(null);

            await this.executePureNode(node, ctx, item, currentRunId);

            this.pendingRequests.delete(item.id);
        }

        if (this.status === 'RUNNING' && !isSingleStep) {
            this.timer = setTimeout(() => this.tick(), 100);
        }
    }

    getNextExecConnection(node) {
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

        if (!outExecPin) return null;
        const nextConn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outExecPin.index);
        if (!nextConn) return null;
        const nextNode = this.graph.nodes.find(n => n.id === nextConn.toNode);
        if (!nextNode) return null;
        return { nextConn, nextNode };
    }

    runForLoop(node, ctx, continuations, isContinuation) {
        if (!isContinuation) {
            const args = this.buildArgs(node, ctx);
            const firstIndex = this.castValue(args[0], 'int') ?? 0;
            const lastIndex = this.castValue(args[1], 'int') ?? 0;
            node.loopState = { current: firstIndex, last: lastIndex, active: true };
        } else if (!node.loopState || node.loopState.active !== true) {
            // If continuation arrives without valid state, do nothing.
            return;
        }

        const state = node.loopState;
        if (state.current <= state.last) {
            node.executionResult = state.current;
            this.highlightNode(node.id, '#ff9900');
            this.emitOutputData(node);

            const loopBodyPin = node.outputs.find(p => p.type === 'exec' && p.name === "Loop Body");
            const loopConn = loopBodyPin
                ? this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === loopBodyPin.index)
                : null;
            const loopNode = loopConn ? this.graph.nodes.find(n => n.id === loopConn.toNode) : null;

            const loopContinuation = this.createTask('exec', node, { conn: null, isLoopContinuation: true });
            const chainContinuations = continuations.slice();
            chainContinuations.push(loopContinuation);

            state.current += 1;

            if (loopNode) {
                this.queueExec(loopNode, loopConn, false, chainContinuations);
            } else {
                loopContinuation.continuations = chainContinuations.slice(0, -1);
                this.executionQueue.push(loopContinuation);
            }
        } else {
            state.active = false;
            node.executionResult = state.last;
            this.highlightNode(node.id, '#ff9900');
            this.emitOutputData(node);

            const completedPin = node.outputs.find(p => p.type === 'exec' && p.name === "Completed");
            const completedConn = completedPin
                ? this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === completedPin.index)
                : null;
            const completedNode = completedConn ? this.graph.nodes.find(n => n.id === completedConn.toNode) : null;

            if (completedNode) {
                this.queueExec(completedNode, completedConn, false, continuations);
            } else {
                this.enqueueContinuation(continuations);
            }
        }
    }

    runWhileLoop(node, ctx, continuations) {
        const args = this.buildArgs(node, ctx);
        const condition = Boolean(args[0]);

        if (condition) {
            node.executionResult = condition;
            this.highlightNode(node.id, '#ff9900');

            const loopBodyPin = node.outputs.find(p => p.type === 'exec' && p.name === "Loop Body");
            const loopConn = loopBodyPin
                ? this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === loopBodyPin.index)
                : null;
            const loopNode = loopConn ? this.graph.nodes.find(n => n.id === loopConn.toNode) : null;

            const loopContinuation = this.createTask('exec', node, { conn: null });
            const chainContinuations = continuations.slice();
            chainContinuations.push(loopContinuation);

            if (loopNode) {
                this.queueExec(loopNode, loopConn, false, chainContinuations);
            } else {
                loopContinuation.continuations = chainContinuations.slice(0, -1);
                this.executionQueue.push(loopContinuation);
            }
        } else {
            node.executionResult = null;
            this.highlightNode(node.id, '#ff9900');

            const completedPin = node.outputs.find(p => p.type === 'exec' && p.name === "Completed");
            const completedConn = completedPin
                ? this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === completedPin.index)
                : null;
            const completedNode = completedConn ? this.graph.nodes.find(n => n.id === completedConn.toNode) : null;

            if (completedNode) {
                this.queueExec(completedNode, completedConn, false, continuations);
            } else {
                this.enqueueContinuation(continuations);
            }
        }
    }

    emitOutputData(node) {
        if (!this.renderer) return;
        node.outputs.forEach((pin) => {
            if (pin.type === 'exec') return;
            const conns = this.graph.connections.filter(c => c.fromNode === node.id && c.fromPin === pin.index);
            if (conns.length === 0) return;
            const debugLabel = window.FunctionRegistry.getVisualDebug(node, [], node.executionResult);
            conns.forEach(conn => {
                const visualObj = this.renderer.animateDataWire(conn, debugLabel);
                this.addStepVisual(visualObj);
            });
        });
    }

    runDoOnce(node, incomingPinIndex, continuations) {
        if (incomingPinIndex !== null && node.inputs[incomingPinIndex] && node.inputs[incomingPinIndex].name === "Reset") {
            node.doOnceFired = false;
            this.enqueueContinuation(continuations);
            return;
        }

        if (!node.doOnceFired) {
            node.doOnceFired = true;
            this.highlightNode(node.id, '#ff9900');

            const nextInfo = this.getNextExecConnection(node);
            if (nextInfo) {
                const { nextConn, nextNode } = nextInfo;
                this.queueExec(nextNode, nextConn, false, continuations);
            } else {
                this.enqueueContinuation(continuations);
            }
        }
    }

    runDelay(node, ctx, continuations, currentRunId) {
        const args = this.buildArgs(node, ctx);
        const durationSeconds = this.castValue(args[0], 'float') ?? 0;
        const delayMs = Math.max(0, durationSeconds * 1000);
        this.highlightNode(node.id, '#ff9900');

        const nextInfo = this.getNextExecConnection(node);
        if (!nextInfo) {
            this.enqueueContinuation(continuations);
            return;
        }

        const { nextConn, nextNode } = nextInfo;
        setTimeout(() => {
            if (this.runInstanceId !== currentRunId) return;
            this.queueExec(nextNode, nextConn, false, continuations);
            if (this.status === 'RUNNING') this.tick();
        }, delayMs);
    }

    executeExecNode(node, ctx, item, continuations, currentRunId) {
        const policy = this.execPolicies[node.name] || ((n, c, i, cont, runId) => this.runDefaultExec(n, c, cont));
        return policy(node, ctx, item, continuations, currentRunId);
    }

    runDefaultExec(node, ctx, continuations) {
        if (node.jsFunctionRef) {
            try {
                const args = this.buildArgs(node, ctx);
                this.highlightNode(node.id, '#ff9900');
                node.executionResult = node.jsFunctionRef.apply(node, args);
            } catch (err) {
                if (err.isBlueprintError) node.setError(err.message);
                else console.error(err);
                this.stop();
                return;
            }
        } else {
            this.highlightNode(node.id, '#ff9900');
        }

        const nextInfo = this.getNextExecConnection(node);
        if (nextInfo) {
            const { nextConn, nextNode } = nextInfo;
            this.queueExec(nextNode, nextConn, false, continuations);
        } else {
            this.enqueueContinuation(continuations);
        }
    }

    async executePureNode(node, ctx, item, currentRunId) {
        const policy = this.purePolicies["default"];
        return policy(node, ctx, item, currentRunId);
    }

    async runDefaultPure(node, ctx, item, currentRunId) {
        let result = null;
        const args = this.buildArgs(node, ctx);

        if (node.jsFunctionRef) {
            try {
                const rawRes = node.jsFunctionRef.apply(node, args);
                const outPinIndex = item.deliverTo && item.deliverTo.conn ? item.deliverTo.conn.fromPin : 0;
                const outPin = node.outputs[outPinIndex];
                result = this.castValue(rawRes, outPin ? outPin.type : 'wildcard');

                node.executionResult = result;

                if (item.deliverTo) {
                    const targetCtx = this.pendingRequests.get(item.deliverTo.requestId);
                    if (targetCtx) {
                        const targetNode = targetCtx.node;
                        const targetPin = targetNode.inputs[item.deliverTo.inputIndex];
                        const valueForTarget = this.castValue(result, targetPin ? targetPin.type : 'wildcard');
                        this.deliverInput(item.deliverTo, valueForTarget);
                    }

                    if (this.renderer) {
                        const debugLabel = window.FunctionRegistry.getVisualDebug(node, args, result);
                        const visualObj = this.renderer.animateDataWire(item.deliverTo.conn, debugLabel);
                        this.addStepVisual(visualObj);
                        await new Promise(r => setTimeout(r, 2000));
                        if (this.runInstanceId !== currentRunId) return;
                    }
                }
            } catch (err) {
                if (err.isBlueprintError) node.setError(err.message);
                else console.error(err);
                this.stop();
                return;
            }
        } else if (item.deliverTo) {
            this.deliverInput(item.deliverTo, null);
        }
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
        if (el) {
            el.style.transition = "box-shadow 0.2s ease-out";
            el.style.boxShadow = `0 0 0 4px ${color}`;
            setTimeout(() => {
                if (this.status !== 'STOPPED') el.style.boxShadow = "";
            }, 800);
        }
    }

    setNodeHighlight(id, color = '#ffffff') {
        const el = document.getElementById(`node-${id}`);
        if (el) {
            el.style.transition = "box-shadow 0.2s ease-out";
            el.style.boxShadow = `0 0 0 4px ${color}`;
        }
    }

    // --- HELPER METHODS ---

    addStepVisual(visualObj) {
        if (!visualObj) return;
        if (visualObj.connId !== undefined && visualObj.connId !== null) {
            const existing = this.connectionVisuals.get(visualObj.connId);
            if (existing) {
                this.removeVisual(existing);
                this.activeStepVisuals = this.activeStepVisuals.filter(v => v !== existing);
            }
            this.connectionVisuals.set(visualObj.connId, visualObj);
        }
        this.activeStepVisuals.push(visualObj);
    }

    removeVisual(visualObj) {
        if (!visualObj) return;
        if (visualObj.label) visualObj.label.remove();
        if (visualObj.path) visualObj.path.classList.remove('data-flow');
    }

    removeConnectionVisual(connId) {
        const visual = this.connectionVisuals.get(connId);
        if (visual) {
            this.removeVisual(visual);
            this.connectionVisuals.delete(connId);
            this.activeStepVisuals = this.activeStepVisuals.filter(v => v !== visual);
        }
    }

    clearStepVisuals() {
        if (this.activeStepVisuals && this.activeStepVisuals.length > 0) {
            this.activeStepVisuals.forEach(obj => this.removeVisual(obj));
            this.activeStepVisuals = [];
        }
        this.connectionVisuals.clear();
    }

    resetWireColor(conn) {
        const path = document.getElementById(`conn-${conn.id}`);
        if (path) {
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
