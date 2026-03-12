function routeToNextExec(api, node, continuations) {
    const nextInfo = api.getNextExecConnection(node);
    if (nextInfo) {
        const { nextConn, nextNode } = nextInfo;
        api.queueExec(nextNode, nextConn, false, continuations);
    } else {
        api.enqueueContinuation(continuations);
    }
}

function runForLoop(api, node, ctx, item, continuations) {
    if (!item.isLoopContinuation) {
        const args = api.buildArgs(node, ctx);
        const firstIndex = api.castValue(args[0], 'int') ?? 0;
        const lastIndex = api.castValue(args[1], 'int') ?? 0;
        node.loopState = { current: firstIndex, last: lastIndex, active: true };
    } else if (!node.loopState || node.loopState.active !== true) {
        return;
    }

    const state = node.loopState;
    if (state.current <= state.last) {
        node.executionResult = state.current;
        api.setNodeHighlight(node.id, '#ffffff');

        const loopBodyPin = node.outputs.find((pin) => pin.type === 'exec' && pin.name === "Loop Body");
        const loopConn = loopBodyPin
            ? api.graph.connections.find((conn) => conn.fromNode === node.id && conn.fromPin === loopBodyPin.index)
            : null;
        const loopNode = loopConn ? api.graph.nodes.find((candidate) => candidate.id === loopConn.toNode) : null;

        const loopContinuation = api.createTask('exec', node, { conn: null, isLoopContinuation: true });
        const chainContinuations = continuations.slice();
        chainContinuations.push(loopContinuation);

        state.current += 1;

        if (loopNode) {
            api.queueExec(loopNode, loopConn, false, chainContinuations);
        } else {
            loopContinuation.continuations = chainContinuations.slice(0, -1);
            api.pushExecutionTask(loopContinuation);
        }
        return;
    }

    state.active = false;
    node.executionResult = state.last;
    api.highlightNode(node.id, '#ff9900');

    const completedPin = node.outputs.find((pin) => pin.type === 'exec' && pin.name === "Completed");
    const completedConn = completedPin
        ? api.graph.connections.find((conn) => conn.fromNode === node.id && conn.fromPin === completedPin.index)
        : null;
    const completedNode = completedConn ? api.graph.nodes.find((candidate) => candidate.id === completedConn.toNode) : null;

    if (completedNode) {
        api.queueExec(completedNode, completedConn, false, continuations);
    } else {
        api.enqueueContinuation(continuations);
    }
}

function runWhileLoop(api, node, ctx, item, continuations) {
    const args = api.buildArgs(node, ctx);
    const condition = Boolean(args[0]);

    if (condition) {
        node.executionResult = condition;
        api.setNodeHighlight(node.id, '#ffffff');

        const loopBodyPin = node.outputs.find((pin) => pin.type === 'exec' && pin.name === "Loop Body");
        const loopConn = loopBodyPin
            ? api.graph.connections.find((conn) => conn.fromNode === node.id && conn.fromPin === loopBodyPin.index)
            : null;
        const loopNode = loopConn ? api.graph.nodes.find((candidate) => candidate.id === loopConn.toNode) : null;

        const loopContinuation = api.createTask('exec', node, { conn: null });
        const chainContinuations = continuations.slice();
        chainContinuations.push(loopContinuation);

        if (loopNode) {
            api.queueExec(loopNode, loopConn, false, chainContinuations);
        } else {
            loopContinuation.continuations = chainContinuations.slice(0, -1);
            api.pushExecutionTask(loopContinuation);
        }
        return;
    }

    node.executionResult = null;
    api.highlightNode(node.id, '#ff9900');

    const completedPin = node.outputs.find((pin) => pin.type === 'exec' && pin.name === "Completed");
    const completedConn = completedPin
        ? api.graph.connections.find((conn) => conn.fromNode === node.id && conn.fromPin === completedPin.index)
        : null;
    const completedNode = completedConn ? api.graph.nodes.find((candidate) => candidate.id === completedConn.toNode) : null;

    if (completedNode) {
        api.queueExec(completedNode, completedConn, false, continuations);
    } else {
        api.enqueueContinuation(continuations);
    }
}

function runDoOnce(api, node, ctx, item, continuations) {
    const incomingPinIndex = item.conn ? item.conn.toPin : null;
    if (incomingPinIndex !== null && node.inputs[incomingPinIndex] && node.inputs[incomingPinIndex].name === "Reset") {
        node.doOnceFired = false;
        api.enqueueContinuation(continuations);
        return;
    }

    if (!node.doOnceFired) {
        node.doOnceFired = true;
        api.highlightNode(node.id, '#ff9900');
        routeToNextExec(api, node, continuations);
    }
}

function runDelay(api, node, ctx, item, continuations, currentRunId) {
    const args = api.buildArgs(node, ctx);
    const durationSeconds = api.castValue(args[0], 'float') ?? 0;
    const speedFactor = typeof api.getSpeedFactor === 'function'
        ? Math.max(0.01, api.getSpeedFactor())
        : 1;
    const delayMs = Math.max(0, (durationSeconds * 1000) / speedFactor);
    api.setNodeHighlight(node.id, '#ffffff');

    const nextInfo = api.getNextExecConnection(node);
    if (!nextInfo) {
        api.enqueueContinuation(continuations);
        return;
    }

    const { nextConn, nextNode } = nextInfo;
    if (item && item.instantMode) {
        api.highlightNode(node.id, '#ff9900');
        api.queueExec(nextNode, nextConn, false, continuations);
        return;
    }
    api.beginAsyncExec();
    setTimeout(() => {
        try {
            if (!api.isRunActive(currentRunId)) return;
            api.highlightNode(node.id, '#ff9900');
            api.queueExec(nextNode, nextConn, false, continuations);
            if (api.getStatus() === 'RUNNING') api.tick();
        } finally {
            api.endAsyncExec();
        }
    }, delayMs);
}

function runCallCustomEvent(api, node, ctx, item, continuations) {
    api.highlightNode(node.id, '#ff9900');

    const eventName = node.customEventName || '';
    if (eventName) {
        const targets = api.graph.nodes.filter(
            (candidate) => candidate.functionId === 'Flow.CustomEvent' && candidate.customEventName === eventName
        );
        targets.forEach((targetNode) => {
            api.queueExec(targetNode, null, false, null);
        });
    }

    routeToNextExec(api, node, continuations);
}

function runDefaultExec(api, node, ctx, item, continuations) {
    if (node.jsFunctionRef) {
        try {
            const args = api.buildArgs(node, ctx);
            api.highlightNode(node.id, '#ff9900');
            node.executionResult = node.jsFunctionRef.apply(node, args);
        } catch (err) {
            if (err.isBlueprintError) node.setError(err.message);
            else console.error(err);
            api.stop();
            return;
        }
    } else {
        api.highlightNode(node.id, '#ff9900');
    }

    routeToNextExec(api, node, continuations);
}

export function createExecPolicies(api) {
    const byFunctionId = {
        "Flow.ForLoop": (node, ctx, item, continuations, currentRunId) => runForLoop(api, node, ctx, item, continuations, currentRunId),
        "Flow.WhileLoop": (node, ctx, item, continuations, currentRunId) => runWhileLoop(api, node, ctx, item, continuations, currentRunId),
        "Flow.DoOnce": (node, ctx, item, continuations, currentRunId) => runDoOnce(api, node, ctx, item, continuations, currentRunId),
        "Flow.Delay": (node, ctx, item, continuations, currentRunId) => runDelay(api, node, ctx, item, continuations, currentRunId),
        "Flow.Branch": (node, ctx, item, continuations, currentRunId) => runDefaultExec(api, node, ctx, item, continuations, currentRunId),
        "Flow.CallCustomEvent": (node, ctx, item, continuations, currentRunId) => runCallCustomEvent(api, node, ctx, item, continuations, currentRunId)
    };

    const byNodeName = {
        "For Loop": byFunctionId["Flow.ForLoop"],
        "While Loop": byFunctionId["Flow.WhileLoop"],
        "WhileLoop": byFunctionId["Flow.WhileLoop"],
        "Do Once": byFunctionId["Flow.DoOnce"],
        "Delay": byFunctionId["Flow.Delay"],
        "Branch": byFunctionId["Flow.Branch"]
    };

    return {
        byFunctionId,
        byNodeName,
        default: (node, ctx, item, continuations, currentRunId) => runDefaultExec(api, node, ctx, item, continuations, currentRunId),
        shouldSkipInputResolution: (item) => {
            if (!item || item.kind !== 'exec' || !item.isLoopContinuation || !item.node) return false;
            return item.node.functionId === 'Flow.ForLoop' || item.node.name === 'For Loop';
        }
    };
}
