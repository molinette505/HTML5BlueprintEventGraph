/**
 * Simulation Class
 * Manages the execution flow of the blueprint graph.
 */
import { createExecPolicies } from "./simulation/ExecPolicies";

export class Simulation {
    constructor(graph, renderer) {
        this.graph = graph;
        this.renderer = renderer;
        this.status = 'STOPPED';
        this.executionQueue = [];
        this.timer = null;
        this.isProcessingNext = false;
        this.runInstanceId = 0;
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        this.onStateChange = null;

        // Request tracking for queued evaluations
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.pendingAsyncExecCount = 0;

        // Tracks all visuals (labels AND glowing wires) for the current step
        this.activeStepVisuals = [];
        this.connectionVisuals = new Map();
        this.stepBurstActive = false;
        this.resumeBreakpointTaskId = null;
        this.resumeBreakpointConsumed = true;

        this.execPolicies = createExecPolicies({
            graph: this.graph,
            pushExecutionTask: (task) => { this.executionQueue.push(task); },
            getStatus: () => this.status,
            buildArgs: (node, ctx) => this.buildArgs(node, ctx),
            castValue: (val, type) => this.castValue(val, type),
            createTask: (kind, node, extra = {}) => this.createTask(kind, node, extra),
            queueExec: (node, conn, toFront = false, continuations = null) => this.queueExec(node, conn, toFront, continuations),
            enqueueContinuation: (continuations) => this.enqueueContinuation(continuations),
            getNextExecConnection: (node) => this.getNextExecConnection(node),
            setNodeHighlight: (id, color) => this.setNodeHighlight(id, color),
            highlightNode: (id, color) => this.highlightNode(id, color),
            setPrimaryDataOutputValue: (node, value) => this.setPrimaryDataOutputValue(node, value),
            setNodeOutputValue: (node, pinIndex, value) => this.setNodeOutputValue(node, pinIndex, value),
            beginAsyncExec: () => { this.pendingAsyncExecCount += 1; },
            endAsyncExec: () => { this.pendingAsyncExecCount = Math.max(0, this.pendingAsyncExecCount - 1); },
            getSpeedFactor: () => this.speedFactor,
            isRunActive: (runId) => this.runInstanceId === runId,
            tick: () => this.tick(),
            stop: () => this.stop()
        });
        this.purePolicies = {
            "default": (node, ctx, item, currentRunId) => this.runDefaultPure(node, ctx, item, currentRunId)
        };
        this.basePostInputSettleDelayMs = 360;
        this.speedFactor = 1;
        this.postInputSettleDelayMs = this.basePostInputSettleDelayMs;
    }

    normalizeSpeedFactor(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        return Math.min(1.75, Math.max(0.25, n));
    }

    getScaledDelay(ms) {
        const base = Number(ms) || 0;
        const factor = Math.max(0.01, this.speedFactor || 1);
        return Math.max(0, base / factor);
    }

    setSpeedFactor(value) {
        this.speedFactor = this.normalizeSpeedFactor(value);
        this.postInputSettleDelayMs = this.getScaledDelay(this.basePostInputSettleDelayMs);
        if (this.renderer && typeof this.renderer.setSpeedFactor === 'function') {
            this.renderer.setSpeedFactor(this.speedFactor);
        }
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
            n.executionResult = undefined;
            n.loopState = null;
            n.doOnceFired = false;
            if (typeof n.clearOutputValueCache === 'function') {
                n.clearOutputValueCache();
            } else {
                n.outputValueCache = {};
            }
        });
        this.executionQueue = [];
        this.pendingRequests.clear();
        this.pendingAsyncExecCount = 0;
        this.nextRequestId = 1;
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        this.endStepBurst();
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
        this.pendingAsyncExecCount = 0;
        this.lastProcessedItem = null;
        this.lastProcessedExec = null;
        this.endStepBurst();
        if (this.timer) clearTimeout(this.timer);
        this.runInstanceId++;

        this.graph.nodes.forEach(n => {
            n.executionResult = undefined;
            n.loopState = null;
            n.doOnceFired = false;
            if (typeof n.clearOutputValueCache === 'function') {
                n.clearOutputValueCache();
            } else {
                n.outputValueCache = {};
            }
        });

        // Cleanup visuals
        this.graph.nodes.forEach(n => {
            const el = document.getElementById(`node-${n.id}`);
            if (el) el.style.boxShadow = "";
        });
        this.clearStepVisuals();

        // Also clear any persistent wire highlights
        this.graph.connections.forEach(c => this.resetWireColor(c));
        this.graph.nodes.forEach((node) => this.refreshWatchedOutputsForNode(node));

        console.log("--- Simulation Stopped ---");
    }

    step() {
        if (this.status === 'STOPPED') {
            this.startPaused();
            this.beginStepBurst(false);
            this.processNext(true);
            return;
        }
        if (this.status === 'PAUSED') {
            this.beginStepBurst(true);
            this.processNext(true);
        }
    }

    replayStep() {
        if (this.status === 'PAUSED' && this.lastProcessedExec) {
            this.clearStepVisuals();
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

        this.pendingRequests.set(id, { node, inputValues, inputReady, inputScheduled, inputVisualWaitMs: 0 });
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

    isDataRerouteNode(node) {
        return !!node && node.functionId === 'Flow.RerouteData';
    }

    isExecRerouteNode(node) {
        return !!node && node.functionId === 'Flow.RerouteExec';
    }

    isBreakpointNode(node) {
        return !!node && !!node.breakpoint;
    }

    isBreakpointTask(task) {
        if (!task) return false;
        if (task.kind !== 'exec' && task.kind !== 'pure') return false;
        return this.isBreakpointNode(task.node);
    }

    beginStepBurst(allowResumeCurrentBreakpoint = true) {
        this.stepBurstActive = true;
        const next = this.executionQueue[0];
        if (allowResumeCurrentBreakpoint && this.isBreakpointTask(next)) {
            this.resumeBreakpointTaskId = next.id;
            this.resumeBreakpointConsumed = false;
            return;
        }
        this.resumeBreakpointTaskId = null;
        this.resumeBreakpointConsumed = true;
    }

    endStepBurst() {
        this.stepBurstActive = false;
        this.resumeBreakpointTaskId = null;
        this.resumeBreakpointConsumed = true;
    }

    shouldUseInstantStepForItem(item, isSingleStep) {
        if (!isSingleStep || !item) return false;
        if (item.manualStepChain) return false;
        if (item.kind === 'exec' || item.kind === 'pure') {
            return !this.isBreakpointNode(item.node);
        }
        return false;
    }

    shouldAutoContinueSingleStep() {
        if (this.status !== 'PAUSED') return false;
        if (!this.stepBurstActive) return false;
        const next = this.executionQueue[0];
        if (!next) {
            this.endStepBurst();
            return false;
        }

        if (next.manualStepChain) {
            this.endStepBurst();
            return false;
        }

        if (this.isBreakpointTask(next)) {
            if (next.breakpointReadyToFire) {
                this.endStepBurst();
                return false;
            }
            if (!this.resumeBreakpointConsumed && next.id === this.resumeBreakpointTaskId) {
                this.resumeBreakpointConsumed = true;
                return true;
            }
            this.endStepBurst();
            return false;
        }

        return next.kind === 'pure' || next.kind === 'exec';
    }

    flashConnection(conn) {
        if (!conn) return;
        const path = document.getElementById(`conn-${conn.id}`);
        if (!path) return;
        path.classList.remove('data-flow');
        void path.offsetWidth;
        path.classList.add('data-flow');
        setTimeout(() => {
            if (path) path.classList.remove('data-flow');
        }, this.getScaledDelay(180));
    }

    flashDataPath(connPath) {
        const pathList = Array.isArray(connPath) ? connPath.filter(Boolean) : [];
        pathList.forEach((conn) => this.flashConnection(conn));
        return { waitMs: 0 };
    }

    getFirstDataOutputPin(node) {
        if (!node || !Array.isArray(node.outputs)) return null;
        return node.outputs.find((pin) => pin.type !== 'exec') || null;
    }

    setNodeOutputValue(node, pinIndex, value) {
        if (!node || !Number.isInteger(pinIndex)) return;
        if (typeof node.setOutputValue === 'function') {
            node.setOutputValue(pinIndex, value);
        } else {
            if (!node.outputValueCache) node.outputValueCache = {};
            node.outputValueCache[pinIndex] = value;
        }
        this.refreshWatchedOutputPin(node, pinIndex);
    }

    setPrimaryDataOutputValue(node, value) {
        const dataPin = this.getFirstDataOutputPin(node);
        node.executionResult = value;
        if (!dataPin) return;
        this.setNodeOutputValue(node, dataPin.index, value);
    }

    getNodeOutputValue(node, pinIndex) {
        if (!node || !Number.isInteger(pinIndex)) return undefined;
        if (typeof node.getOutputValue === 'function') {
            const cached = node.getOutputValue(pinIndex);
            if (cached !== undefined) return cached;
        } else if (node.outputValueCache && Object.prototype.hasOwnProperty.call(node.outputValueCache, pinIndex)) {
            return node.outputValueCache[pinIndex];
        }
        return undefined;
    }

    hasNodeOutputValue(node, pinIndex) {
        if (!node || !Number.isInteger(pinIndex)) return false;
        if (typeof node.hasOutputValue === 'function') {
            return node.hasOutputValue(pinIndex);
        }
        return !!(node.outputValueCache && Object.prototype.hasOwnProperty.call(node.outputValueCache, pinIndex));
    }

    clearNodeOutputValueCache(node) {
        if (!node || !node.isImpure || !node.isImpure()) return;
        node.executionResult = undefined;
        if (typeof node.clearOutputValueCache === 'function') {
            node.clearOutputValueCache();
        } else {
            node.outputValueCache = {};
        }
        this.refreshWatchedOutputsForNode(node);
    }

    shouldResetOutputCacheForExecItem(item) {
        if (!item || item.kind !== 'exec' || !item.node) return false;
        if (typeof item.node.isImpure !== 'function' || !item.node.isImpure()) return false;
        if (item.node.functionId === 'Flow.ForLoop' && item.isLoopContinuation) return false;
        return true;
    }

    prepareExecItemRuntime(item) {
        if (!item || item.kind !== 'exec') return;
        if (item.runtimePrepared) return;
        item.runtimePrepared = true;
        if (this.shouldResetOutputCacheForExecItem(item)) {
            this.clearNodeOutputValueCache(item.node);
        }
    }

    formatWatchValue(value) {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            const shown = value.slice(0, 3).map((entry) => this.formatWatchValue(entry));
            const suffix = value.length > 3 ? ', ...' : '';
            return `[${shown.join(', ')}${suffix}]`;
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return Number.isFinite(value) ? String(parseFloat(value.toFixed(3))) : String(value);
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            if ('x' in value && 'y' in value && 'z' in value) {
                return `(${this.formatWatchValue(value.x)}, ${this.formatWatchValue(value.y)}, ${this.formatWatchValue(value.z)})`;
            }
            return '{Obj}';
        }
        return String(value);
    }

    refreshWatchedOutputPin(node, pinIndex) {
        if (!node || !Number.isInteger(pinIndex)) return;
        const watchEl = document.querySelector(`.pin-watch-value[data-node="${node.id}"][data-index="${pinIndex}"]`);
        if (!watchEl) return;
        if (!this.hasNodeOutputValue(node, pinIndex)) {
            watchEl.innerText = 'Not executed yet';
            return;
        }
        const value = this.getNodeOutputValue(node, pinIndex);
        watchEl.innerText = this.formatWatchValue(value);
    }

    refreshWatchedOutputsForNode(node) {
        if (!node || !Array.isArray(node.outputs)) return;
        node.outputs.forEach((pin) => {
            if (pin.type === 'exec') return;
            this.refreshWatchedOutputPin(node, pin.index);
        });
    }

    refreshVariableWatches() {
        if (!window.App || !window.App.variableManager) return;
        const manager = window.App.variableManager;
        if (typeof manager.renderWatchedVariableOverlay === 'function') {
            manager.renderWatchedVariableOverlay();
        }
    }

    async animateExecConnection(conn, currentRunId) {
        if (!conn || !this.renderer) return true;
        const durationMs = this.renderer.animateExecWire(conn);
        const waitMs = Number.isFinite(durationMs) ? durationMs : this.getScaledDelay(1500);
        await new Promise(r => setTimeout(r, waitMs));
        return this.runInstanceId === currentRunId;
    }

    async advanceOutgoingExecForSingleStep(currentRunId) {
        let safety = 0;
        while (safety < 128) {
            const nextItem = this.executionQueue[0];
            if (!nextItem || nextItem.kind !== 'exec') return;
            if (nextItem.execWireDone || !nextItem.conn) return;

            if (this.isBreakpointNode(nextItem.node)) {
                const stillActive = await this.animateExecConnection(nextItem.conn, currentRunId);
                if (!stillActive) return;
            } else {
                this.flashConnection(nextItem.conn);
            }
            nextItem.execWireDone = true;
            if (!this.isExecRerouteNode(nextItem.node) && !nextItem.waitingHighlight) {
                this.setNodeHighlight(nextItem.node.id, '#ffffff');
                nextItem.waitingHighlight = true;
            }

            if (this.isBreakpointTask(nextItem)) {
                this.preExecuteBreakpointDependencyChain(nextItem);
            }

            if (!this.isExecRerouteNode(nextItem.node)) return;

            const rerouteItem = this.executionQueue.shift();
            const rerouteCtx = this.pendingRequests.get(rerouteItem.id);
            if (!rerouteCtx) {
                safety += 1;
                continue;
            }

            rerouteItem.node.setError(null);
            const continuations = rerouteItem.continuations ? rerouteItem.continuations.slice() : [];
            this.executeExecNode(rerouteItem.node, rerouteCtx, rerouteItem, continuations, currentRunId);
            this.pendingRequests.delete(rerouteItem.id);
            this.lastProcessedItem = rerouteItem;
            this.lastProcessedExec = rerouteItem;
            if (this.onStateChange) this.onStateChange(this.status);

            if (this.runInstanceId !== currentRunId) return;
            safety += 1;
        }
    }

    preExecuteBreakpointDependencyChain(item) {
        if (!item || item.kind !== 'exec') return false;
        if (!this.isBreakpointTask(item)) return false;
        if (item.hadRecursiveInputChain) return false;
        if (this.executionQueue[0] !== item) return false;

        const res = this.resolveInputs(item, false, {
            flattenUpstreamVisuals: false,
            manualStepChain: true,
            suppressVisuals: true
        });

        if (res.ready || res.deps.length === 0) return false;

        const expandedDeps = this.expandManualPureDependencyChain(res.deps);
        this.executionQueue.shift();
        this.executionQueue = expandedDeps.concat([item], this.executionQueue);
        item.hadRecursiveInputChain = true;
        return true;
    }

    async processOnePureTaskForSingleStep(currentRunId) {
        let safety = 0;
        while (safety < 128) {
            const head = this.executionQueue[0];
            if (!head) return;
            if (head.kind !== 'pure') return;

            const task = this.executionQueue.shift();
            const ctx = this.pendingRequests.get(task.id);
            if (!ctx) {
                safety += 1;
                continue;
            }

            const res = this.resolveInputs(task, !!task.instantMode, {
                flattenUpstreamVisuals: !!task.flattenUpstreamVisuals,
                manualStepChain: !!task.manualStepChain
            });
            if (!res.ready) {
                if (res.deps.length > 0) {
                    this.executionQueue = res.deps.concat([task], this.executionQueue);
                    safety += 1;
                    continue;
                }
                this.executionQueue.unshift(task);
                return;
            }

            const node = task.node;
            this.clearInputVisuals(node);
            node.setError(null);
            await this.executePureNode(node, ctx, task, currentRunId);
            this.pendingRequests.delete(task.id);
            return;
        }
    }

    expandManualPureDependencyChain(initialTasks = []) {
        const ordered = [];
        let queue = Array.isArray(initialTasks) ? initialTasks.slice() : [];
        let safety = 0;

        while (queue.length > 0 && safety < 512) {
            const task = queue.shift();
            safety += 1;
            if (!task || task.kind !== 'pure') continue;

            task.manualStepChain = true;
            if (!task.waitingHighlight) {
                this.setNodeHighlight(task.node.id, '#ffffff');
                task.waitingHighlight = true;
            }

            const ctx = this.pendingRequests.get(task.id);
            if (!ctx) continue;

            const res = this.resolveInputs(task, false, {
                flattenUpstreamVisuals: !!task.flattenUpstreamVisuals,
                manualStepChain: true,
                suppressVisuals: true
            });

            if (res.deps.length > 0) {
                queue = res.deps.concat([task], queue);
                continue;
            }

            ordered.push(task);
        }

        return ordered;
    }

    resolveDataSource(connection) {
        if (!connection) return { sourceNode: null, sourceConnection: null, connPath: [] };

        const connPath = [connection];
        let sourceConnection = connection;
        let sourceNode = this.graph.nodes.find((node) => node.id === sourceConnection.fromNode) || null;
        let safety = 0;

        while (sourceNode && this.isDataRerouteNode(sourceNode) && safety < 64) {
            const upstream = this.graph.connections.find((candidate) =>
                candidate.toNode === sourceNode.id
                && candidate.toPin === 0
                && candidate.type !== 'exec'
            );
            if (!upstream) break;
            connPath.unshift(upstream);
            sourceConnection = upstream;
            sourceNode = this.graph.nodes.find((node) => node.id === sourceConnection.fromNode) || null;
            safety += 1;
        }

        return { sourceNode, sourceConnection, connPath };
    }

    animateDataPath(connPath, debugLabel, instant = false) {
        if (!this.renderer) return { waitMs: 0 };
        const normalizedPath = Array.isArray(connPath) ? connPath.filter(Boolean) : [];
        if (normalizedPath.length === 0) return { waitMs: 0 };
        if (instant) return this.flashDataPath(normalizedPath);

        let visualObj = null;
        if (normalizedPath.length > 1 && typeof this.renderer.animateDataWirePath === 'function') {
            visualObj = this.renderer.animateDataWirePath(normalizedPath, debugLabel);
        } else {
            visualObj = this.renderer.animateDataWire(normalizedPath[0], debugLabel);
        }

        this.addStepVisual(visualObj);
        const waitMs = visualObj && typeof visualObj.durationMs === 'number' ? visualObj.durationMs : 0;
        return { waitMs };
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

    resolveInputs(task, instantDataFlow = false, options = null) {
        const ctx = this.pendingRequests.get(task.id);
        if (!ctx) return { ready: false, deps: [] };
        const opts = options || {};

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

            const resolvedSource = this.resolveDataSource(conn);
            const sourceNode = resolvedSource.sourceNode || this.graph.nodes.find(n => n.id === conn.fromNode);
            const connPath = (resolvedSource.connPath && resolvedSource.connPath.length > 0)
                ? resolvedSource.connPath
                : [conn];
            if (!sourceNode) {
                ctx.inputValues[i] = this.castValue(null, pin.type);
                ctx.inputReady[i] = true;
                continue;
            }

            if (this.isPureNode(sourceNode)) {
                if (!ctx.inputScheduled[i]) {
                    ctx.inputScheduled[i] = true;
                    const sourceIsBreakpoint = this.isBreakpointNode(sourceNode);
                    const flattenUpstreamVisuals = !!opts.flattenUpstreamVisuals && !sourceIsBreakpoint;
                    const instantMode = (instantDataFlow || flattenUpstreamVisuals) && !sourceIsBreakpoint;
                    const pureTask = this.createTask('pure', sourceNode, {
                        deliverTo: {
                            requestId: task.id,
                            inputIndex: i,
                            conn: resolvedSource.sourceConnection || conn,
                            connPath
                        },
                        instantMode,
                        flattenUpstreamVisuals,
                        manualStepChain: !!opts.manualStepChain
                    });
                    deps.push(pureTask);
                }
            } else {
                const sourceVal = this.getNodeOutputValue(sourceNode, conn.fromPin);
                const incomingVal = this.castValue(sourceVal, pin.type);
                ctx.inputValues[i] = incomingVal;
                ctx.inputReady[i] = true;
                if (this.renderer && connPath.length > 0 && !opts.suppressVisuals) {
                    const debugLabel = window.FunctionRegistry.getVisualDebug(sourceNode, [], incomingVal);
                    const animated = this.animateDataPath(connPath, debugLabel, instantDataFlow);
                    const waitMs = animated.waitMs;
                    ctx.inputVisualWaitMs = Math.max(ctx.inputVisualWaitMs || 0, waitMs);
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
            if (!conn) return;
            const resolved = this.resolveDataSource(conn);
            const connPath = (resolved.connPath && resolved.connPath.length > 0)
                ? resolved.connPath
                : [conn];
            connPath.forEach((pathConn) => this.removeConnectionVisual(pathConn.id));
        });
    }

    async processNext(isSingleStep) {
        if (this.isProcessingNext) return;
        this.isProcessingNext = true;
        try {
        const currentRunId = this.runInstanceId;
        if (this.executionQueue.length === 0) {
            if (this.pendingAsyncExecCount > 0) {
                if (this.status === 'RUNNING') {
                    this.timer = setTimeout(() => this.tick(), this.getScaledDelay(50));
                }
                return;
            }
            if (isSingleStep && this.stepBurstActive) {
                this.endStepBurst();
                this.stop();
                return;
            }
            if (this.status === 'RUNNING') {
                this.stop();
            }
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
                this.timer = setTimeout(() => this.tick(), this.getScaledDelay(100));
            }
            return;
        }

        const instantStepMode = this.shouldUseInstantStepForItem(item, isSingleStep);
        if (item.kind === 'exec') {
            this.prepareExecItemRuntime(item);
        }

        const shouldShowWaitingHighlight = !instantStepMode && !item.instantMode;
        if ((item.kind === 'exec' || item.kind === 'pure') && shouldShowWaitingHighlight && !item.waitingHighlight) {
            this.setNodeHighlight(item.node.id, '#ffffff');
            item.waitingHighlight = true;
        }

        if (item.kind === 'exec') {
            if (!item.execWireDone) {
                if (item.conn) {
                    if (instantStepMode) {
                        this.flashConnection(item.conn);
                    } else {
                        const stillActive = await this.animateExecConnection(item.conn, currentRunId);
                        if (!stillActive) return;
                    }
                }
                item.execWireDone = true;
            }
        }

        let ready = false;
        let deps = [];
        if (this.execPolicies.shouldSkipInputResolution(item)) {
            ready = true;
        } else {
            const res = this.resolveInputs(item, instantStepMode, {
                flattenUpstreamVisuals: !!item.flattenUpstreamVisuals,
                manualStepChain: this.isBreakpointTask(item) || !!item.manualStepChain
            });
            ready = res.ready;
            deps = res.deps;
        }
        if (!ready) {
            if (deps.length > 0) {
                if (isSingleStep && item.kind === 'exec' && this.isBreakpointTask(item)) {
                    const expandedDeps = this.expandManualPureDependencyChain(deps);
                    this.executionQueue = expandedDeps.concat([item], this.executionQueue);
                } else {
                    this.executionQueue = deps.concat([item], this.executionQueue);
                }
                if (isSingleStep && item.kind === 'exec' && this.isBreakpointTask(item)) {
                    item.hadRecursiveInputChain = true;
                }
                if (isSingleStep && item.kind === 'exec' && !this.isBreakpointTask(item)) {
                    await this.processOnePureTaskForSingleStep(currentRunId);
                    if (this.runInstanceId !== currentRunId) return;
                }
                if (isSingleStep && item.kind === 'exec' && this.isBreakpointTask(item)) {
                    this.endStepBurst();
                }
            } else {
                this.executionQueue.push(item);
            }

            if (this.status === 'RUNNING' && !isSingleStep) {
                this.timer = setTimeout(() => this.tick(), this.getScaledDelay(100));
            }
            return;
        }

        if ((ctx.inputVisualWaitMs || 0) > 0 && !item.inputVisualWaited) {
            item.inputVisualWaited = true;
            const waitMs = ctx.inputVisualWaitMs;
            ctx.inputVisualWaitMs = 0;
            await new Promise(r => setTimeout(r, waitMs));
            if (this.runInstanceId !== currentRunId) return;
        }

        const hasConnectedDataInputs = item.node && Array.isArray(item.node.inputs)
            ? item.node.inputs.some(pin => {
                if (pin.type === 'exec') return false;
                return this.graph.connections.some(c => c.toNode === item.node.id && c.toPin === pin.index);
            })
            : false;
        if (hasConnectedDataInputs && !item.postInputSettleDone && !instantStepMode) {
            item.postInputSettleDone = true;
            await new Promise(r => setTimeout(r, this.postInputSettleDelayMs));
            if (this.runInstanceId !== currentRunId) return;
        }

        if (
            isSingleStep
            && item.kind === 'exec'
            && this.isBreakpointTask(item)
            && hasConnectedDataInputs
            && !item.hadRecursiveInputChain
            && !item.breakpointReadyToFire
        ) {
            item.breakpointReadyToFire = true;
            this.executionQueue.unshift(item);
            this.endStepBurst();
            if (this.onStateChange) this.onStateChange(this.status);
            return;
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

            this.executeExecNode(node, ctx, item, continuations, currentRunId);
            if (this.status !== 'STOPPED' && node.functionId !== 'Flow.Delay') {
                this.highlightNode(node.id, '#ff9900');
            }

            this.pendingRequests.delete(item.id);
            this.lastProcessedItem = item;
            this.lastProcessedExec = item;
            if (this.onStateChange) this.onStateChange(this.status);

            if (isSingleStep) {
                await this.advanceOutgoingExecForSingleStep(currentRunId);
                if (this.runInstanceId !== currentRunId) return;
            }

        } else if (item.kind === 'pure') {
            const node = item.node;
            this.clearInputVisuals(node);
            node.setError(null);

            await this.executePureNode(node, ctx, item, currentRunId);

            this.pendingRequests.delete(item.id);
        }
        this.refreshVariableWatches();

        if (this.status === 'RUNNING' && !isSingleStep) {
            this.timer = setTimeout(() => this.tick(), this.getScaledDelay(100));
        }
        } finally {
            this.isProcessingNext = false;
            if (isSingleStep && this.shouldAutoContinueSingleStep()) {
                this.processNext(true);
            }
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

    executeExecNode(node, ctx, item, continuations, currentRunId) {
        const policy = this.execPolicies.byFunctionId[node.functionId]
            || this.execPolicies.byNodeName[node.name]
            || this.execPolicies.default;
        return policy(node, ctx, item, continuations, currentRunId);
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
                if (outPin) {
                    this.setNodeOutputValue(node, outPinIndex, result);
                }
                if (this.status !== 'STOPPED') {
                    this.highlightNode(node.id, '#ff9900');
                }

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
                        const connPath = item.deliverTo.connPath && item.deliverTo.connPath.length > 0
                            ? item.deliverTo.connPath
                            : (item.deliverTo.conn ? [item.deliverTo.conn] : []);
                        const useInstantOutput = !!item.instantMode;
                        const animated = this.animateDataPath(connPath, debugLabel, useInstantOutput);
                        const waitMs = animated.waitMs;
                        if (waitMs > 0) {
                            await new Promise(r => setTimeout(r, waitMs));
                        }
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
        if (type === 'wildcard[]') {
            if (Array.isArray(val)) return val;
            if (val === null || val === undefined) return [];
            return [val];
        }

        if (typeof type === 'string' && type.endsWith('[]')) {
            const elementType = type.slice(0, -2);
            if (Array.isArray(val)) {
                return val.map((entry) => this.castValue(entry, elementType));
            }
            if (val === null || val === undefined) return [];
            return [this.castValue(val, elementType)];
        }

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
            // Force an immediate switch from "waiting white" to execution color.
            el.style.transition = "none";
            el.style.boxShadow = `0 0 0 4px ${color}`;
            void el.offsetWidth;
            el.style.transition = "box-shadow 0.2s ease-out";
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
        const connIds = Array.isArray(visualObj.connIds)
            ? visualObj.connIds.filter((id) => id !== undefined && id !== null)
            : ((visualObj.connId !== undefined && visualObj.connId !== null) ? [visualObj.connId] : []);

        if (connIds.length > 0) {
            visualObj.mappedConnIds = connIds;
            connIds.forEach((connId) => {
                const existing = this.connectionVisuals.get(connId);
                if (existing) {
                    this.removeVisual(existing);
                    this.activeStepVisuals = this.activeStepVisuals.filter(v => v !== existing);
                    if (Array.isArray(existing.mappedConnIds)) {
                        existing.mappedConnIds.forEach((mappedId) => this.connectionVisuals.delete(mappedId));
                    } else if (existing.connId !== undefined && existing.connId !== null) {
                        this.connectionVisuals.delete(existing.connId);
                    }
                }
                this.connectionVisuals.set(connId, visualObj);
            });
        }
        this.activeStepVisuals.push(visualObj);
    }

    removeVisual(visualObj) {
        if (!visualObj) return;
        if (visualObj.label) visualObj.label.remove();
        if (visualObj.path) visualObj.path.classList.remove('data-flow');
        if (Array.isArray(visualObj.paths)) {
            visualObj.paths.forEach((pathEl) => pathEl.classList.remove('data-flow'));
        }
        if (visualObj.tempPath) visualObj.tempPath.remove();
    }

    removeConnectionVisual(connId) {
        const visual = this.connectionVisuals.get(connId);
        if (visual) {
            this.removeVisual(visual);
            if (Array.isArray(visual.mappedConnIds) && visual.mappedConnIds.length > 0) {
                visual.mappedConnIds.forEach((mappedId) => this.connectionVisuals.delete(mappedId));
            } else {
                this.connectionVisuals.delete(connId);
            }
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
