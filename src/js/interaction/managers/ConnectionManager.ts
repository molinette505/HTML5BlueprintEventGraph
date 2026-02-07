import { findBestInputForSpawn, findBestOutputForSpawn } from "./ContextSensitiveConfig";

/**
 * ConnectionManager
 * Manages the lifecycle of "Wires" (connections).
 * Handles pin-to-pin validation, wildcard type propagation, 
 * and automatic conversion node spawning.
 */
export class ConnectionManager {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        /** @type {Object|null} - State of the wire currently being dragged by the user */
        this.dragWire = null;
        this.pendingSpawnWire = null;
        this.snapTarget = null;
        this.snapDistancePx = 42;
    }

    buildSpawnContext() {
        if (!this.dragWire) return null;

        const sourceNode = this.graph.nodes.find(node => node.id === this.dragWire.sourceNode);
        const sourcePins = this.dragWire.sourceType === 'output' ? sourceNode && sourceNode.outputs : sourceNode && sourceNode.inputs;
        const sourcePin = sourcePins ? sourcePins[this.dragWire.sourcePin] : null;

        const context = {
            sourceNodeId: this.dragWire.sourceNode,
            sourcePinIndex: this.dragWire.sourcePin,
            sourceType: this.dragWire.sourceType,
            dataType: this.dragWire.dataType,
            sourceNodeName: sourceNode ? sourceNode.name : null,
            sourcePinName: sourcePin ? sourcePin.name : null
        };

        if (this.dragWire.sourceType === 'input') {
            context.targetNodeId = this.dragWire.sourceNode;
            context.targetPinIndex = this.dragWire.sourcePin;
        }

        return context;
    }

    clearDrag() {
        this.dragWire = null;
        this._clearSnapVisual();
    }

    beginPendingSpawn(clientX, clientY) {
        const spawnContext = this.buildSpawnContext();
        if (!spawnContext || !this.dragWire) return null;

        const rect = this.dom.container.getBoundingClientRect();
        const endX = (clientX - rect.left - this.graph.pan.x) / this.graph.scale;
        const endY = (clientY - rect.top - this.graph.pan.y) / this.graph.scale;

        this.pendingSpawnWire = {
            sourceType: this.dragWire.sourceType,
            dataType: this.dragWire.dataType,
            startX: this.dragWire.startX,
            startY: this.dragWire.startY,
            endX,
            endY
        };

        this.dragWire = null;
        this._clearSnapVisual();
        return spawnContext;
    }

    renderPendingSpawnPreview() {
        if (!this.pendingSpawnWire) return;

        const p1 = { x: this.pendingSpawnWire.startX, y: this.pendingSpawnWire.startY };
        const p2 = { x: this.pendingSpawnWire.endX, y: this.pendingSpawnWire.endY };

        if (this.pendingSpawnWire.sourceType === 'output') {
            this.renderer.drawCurve(p1, p2, this.pendingSpawnWire.dataType, true);
        } else {
            this.renderer.drawCurve(p2, p1, this.pendingSpawnWire.dataType, true);
        }
    }

    clearPendingSpawn(render = true) {
        const hadPendingSpawn = !!this.pendingSpawnWire;
        this.pendingSpawnWire = null;
        this._clearSnapVisual();
        if (render && hadPendingSpawn) {
            this.renderer.render();
        }
    }

    connectSpawnedNode(spawnContext, targetNode) {
        if (!spawnContext || !targetNode) return;

        if (spawnContext.sourceType === 'output') {
            const preferredInputIndex = Number.isInteger(spawnContext.preferredInputIndex)
                ? spawnContext.preferredInputIndex
                : null;

            let inputIndex = -1;
            if (
                preferredInputIndex !== null &&
                this._isInputCompatible(targetNode.inputs[preferredInputIndex], spawnContext.dataType)
            ) {
                inputIndex = preferredInputIndex;
            } else {
                const best = findBestInputForSpawn({ inputs: targetNode.inputs }, spawnContext);
                inputIndex = best ? best.index : -1;
            }

            if (inputIndex < 0) return;

            const inputPin = targetNode.inputs[inputIndex];
            if (inputPin && inputPin.type === 'wildcard' && spawnContext.dataType !== 'wildcard' && spawnContext.dataType !== 'exec') {
                this._applyWildcardTypes(targetNode, spawnContext.dataType);
                this.renderer.refreshNode(targetNode);
            }

            this.graph.addConnection(
                spawnContext.sourceNodeId,
                spawnContext.sourcePinIndex,
                targetNode.id,
                inputIndex,
                spawnContext.dataType
            );
        } else if (spawnContext.sourceType === 'input') {
            const preferredOutputIndex = Number.isInteger(spawnContext.preferredOutputIndex)
                ? spawnContext.preferredOutputIndex
                : null;

            let outputIndex = -1;
            if (
                preferredOutputIndex !== null &&
                this._isOutputCompatible(targetNode.outputs[preferredOutputIndex], spawnContext.dataType)
            ) {
                outputIndex = preferredOutputIndex;
            } else {
                const best = findBestOutputForSpawn({ outputs: targetNode.outputs }, spawnContext);
                outputIndex = best ? best.index : -1;
            }

            if (outputIndex < 0) return;

            const outputPin = targetNode.outputs[outputIndex];
            if (outputPin && outputPin.type === 'wildcard' && spawnContext.dataType !== 'wildcard' && spawnContext.dataType !== 'exec') {
                this._applyWildcardTypes(targetNode, spawnContext.dataType);
                this.renderer.refreshNode(targetNode);
            }

            this.graph.addConnection(
                targetNode.id,
                outputIndex,
                spawnContext.targetNodeId,
                spawnContext.targetPinIndex,
                spawnContext.dataType
            );
        } else {
            return;
        }

        this.pendingSpawnWire = null;
        this.renderer.render();
    }

    /**
     * Initiates a wire dragging operation.
     * Features "Socket Stealing": if an input pin is clicked, we disconnect the 
     * existing wire and start dragging it from the source instead.
     * @param {MouseEvent} e 
     */
    startDrag(e) {
        this.startDragFromElement(e.target);
    }

    /**
     * Initiates a wire drag using a pin DOM element.
     * Useful for touch interactions where we don't always have a MouseEvent.
     * @param {HTMLElement} pin
     */
    startDragFromElement(pin) {
        if (!pin || !pin.dataset) return;
        const nodeId = parseInt(pin.dataset.node);
        const index = parseInt(pin.dataset.index);
        const type = pin.dataset.type; // 'input' or 'output'
        const dataType = pin.dataset.dataType;
        
        // --- SOCKET STEALING LOGIC ---
        // If the user clicks an input that is already occupied, we allow them to 
        // "pull" the wire out to move it to a different pin.
        if (type === 'input') {
            const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPin === index);
            if (conn) {
                this.graph.removeConnection(conn.id);
                this.renderer.render(); // Redraw immediately to show the break
                
                const srcPos = this.renderer.getPinPos(conn.fromNode, conn.fromPin, 'output');
                if (srcPos) {
                    this.dragWire = {
                        sourceNode: conn.fromNode, 
                        sourcePin: conn.fromPin, 
                        sourceType: 'output',
                        dataType: conn.type, 
                        startX: srcPos.x, startY: srcPos.y
                    };
                }
                return;
            }
        }

        // --- NEW WIRE LOGIC ---
        const rect = pin.getBoundingClientRect();
        const cRect = this.dom.container.getBoundingClientRect();
        
        this.dragWire = {
            sourceNode: nodeId, 
            sourcePin: index, 
            sourceType: type, 
            dataType: dataType,
            // Map screen coordinates to the transformed graph space
            startX: (rect.left + rect.width/2 - cRect.left - this.graph.pan.x) / this.graph.scale,
            startY: (rect.top + rect.height/2 - cRect.top - this.graph.pan.y) / this.graph.scale
        };
    }

    /**
     * Updates the temporary Bezier curve being drawn while dragging.
     * @param {MouseEvent} e 
     */
    update(e) {
        if (!this.dragWire) return;

        const rect = this.dom.container.getBoundingClientRect();
        const mx = (e.clientX - rect.left - this.graph.pan.x) / this.graph.scale;
        const my = (e.clientY - rect.top - this.graph.pan.y) / this.graph.scale;
        const snap = this._findBestSnapTarget(mx, my);
        this._setSnapTarget(snap);
        
        // Clear the overlay and redraw existing connections + the current preview
        this.dom.connectionsLayer.innerHTML = '';
        this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
        
        const p1 = { x: this.dragWire.startX, y: this.dragWire.startY };
        const p2 = snap ? { x: snap.x, y: snap.y } : { x: mx, y: my };
        
        // Orient the curve correctly (always Output -> Input for curvature math)
        if (this.dragWire.sourceType === 'output') {
            this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
        } else {
            this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
        }
    }

    /**
     * Finalizes the connection when the mouse is released.
     * Handles complex logic like Type Conversions and Wildcard updates.
     * @param {HTMLElement} targetElement - The pin element the user released on.
     */
    commit(targetElement = null) {
        if (!this.dragWire) return;
        if (!targetElement && this.snapTarget && this.snapTarget.element) {
            targetElement = this.snapTarget.element;
        }
        if (!targetElement) {
            this.dragWire = null;
            this._clearSnapVisual();
            return;
        }

        const s = this.dragWire;
        const t = {
            nodeId: parseInt(targetElement.dataset.node),
            index: parseInt(targetElement.dataset.index),
            type: targetElement.dataset.type,
            dataType: targetElement.dataset.dataType
        };

        this.dragWire = null; // Reset dragging state immediately
        this._clearSnapVisual();

        // --- VALIDATION ---
        if (s.sourceNode === t.nodeId) return; // Prevent connecting a node to itself
        if (s.sourceType === t.type) return;   // Prevent Output-to-Output or Input-to-Input

        // --- WILDCARD PROPAGATION ---
        // If one of the nodes is a generic "Wildcard" node (like a 'Print' node),
        // it adopts the data type of the node it is being connected to.
        if (s.dataType !== 'wildcard' && t.dataType === 'wildcard') {
            const targetNode = this.graph.nodes.find(n => n.id === t.nodeId);
            if (targetNode) {
                this._applyWildcardTypes(targetNode, s.dataType);
                t.dataType = s.dataType; 
                this.renderer.refreshNode(targetNode);
            }
        }
        else if (s.dataType === 'wildcard' && t.dataType !== 'wildcard') {
            const sourceNode = this.graph.nodes.find(n => n.id === s.sourceNode);
            if (sourceNode) {
                this._applyWildcardTypes(sourceNode, t.dataType);
                s.dataType = t.dataType; 
                this.renderer.refreshNode(sourceNode);
            }
        }

        // --- AUTOMATIC TYPE CONVERSION ---
        // If user connects Float -> String, we look for a "ToString" converter node 
        // to place automatically between them.
        if (s.dataType !== t.dataType) {
            const srcType = s.sourceType === 'output' ? s.dataType : t.dataType;
            const tgtType = s.sourceType === 'output' ? t.dataType : s.dataType;
            
            const key = `${srcType}->${tgtType}`;
            const templateName = window.nodeConversions ? window.nodeConversions[key] : null;
            
            if (templateName && window.nodeTemplates) {
                const template = window.nodeTemplates.find(n => n.name === templateName);
                if (template) {
                    const nodeA = this.graph.nodes.find(n => n.id === s.sourceNode);
                    const nodeB = this.graph.nodes.find(n => n.id === t.nodeId);
                    
                    // Spawn the converter at the midpoint between the two nodes
                    const midX = (nodeA.x + nodeB.x) / 2;
                    const midY = (nodeA.y + nodeB.y) / 2;
                    
                    const convNode = this.graph.addNode(template, midX, midY);
                    this.renderer.createNodeElement(convNode);
                    
                    const fromNodeId = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
                    const fromPinIdx = s.sourceType === 'output' ? s.sourcePin : t.index;
                    const toNodeId = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
                    const toPinIdx = s.sourceType === 'output' ? t.index : s.sourcePin;

                    this.graph.addConnection(fromNodeId, fromPinIdx, convNode.id, 0, srcType);
                    this.graph.addConnection(convNode.id, 0, toNodeId, toPinIdx, tgtType);
                    return; 
                }
            }
            return; // Reject if no conversion is available
        }

        // --- FINAL CONNECTION ---
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }

    getSnapTargetElement() {
        return this.snapTarget ? this.snapTarget.element : null;
    }

    /**
     * Sever connections for a specific pin.
     * @param {HTMLElement} pinElement 
     */
    breakConnection(pinElement) {
        this.graph.disconnectPin(
            parseInt(pinElement.dataset.node), 
            parseInt(pinElement.dataset.index), 
            pinElement.dataset.type
        );
        this.renderer.render();
    }

    _applyWildcardTypes(node, newType) {
        node.inputs.forEach(pin => { if (pin.type === 'wildcard') pin.setType(newType); });
        node.outputs.forEach(pin => { if (pin.type === 'wildcard') pin.setType(newType); });
    }

    _isInputCompatible(inputPin, sourceType) {
        if (!inputPin) return false;
        if (sourceType === 'exec') return inputPin.type === 'exec';
        if (inputPin.type === 'exec') return false;
        if (sourceType === 'wildcard') return true;
        if (inputPin.type === sourceType) return true;
        if (inputPin.type === 'wildcard') {
            return !Array.isArray(inputPin.allowedTypes) || inputPin.allowedTypes.includes(sourceType);
        }
        return Array.isArray(inputPin.allowedTypes) && inputPin.allowedTypes.includes(sourceType);
    }

    _isOutputCompatible(outputPin, targetType) {
        if (!outputPin) return false;
        if (targetType === 'exec') return outputPin.type === 'exec';
        if (outputPin.type === 'exec') return false;
        if (targetType === 'wildcard') return true;
        if (outputPin.type === targetType) return true;
        if (outputPin.type === 'wildcard') {
            return !Array.isArray(outputPin.allowedTypes) || outputPin.allowedTypes.includes(targetType);
        }
        return Array.isArray(outputPin.allowedTypes) && outputPin.allowedTypes.includes(targetType);
    }

    _findBestSnapTarget(mx, my) {
        if (!this.dragWire) return null;

        const threshold = this.snapDistancePx / Math.max(this.graph.scale, 0.01);
        const pins = this.dom.nodesLayer.querySelectorAll('.pin');
        let best = null;

        pins.forEach((pinEl) => {
            const target = {
                nodeId: parseInt(pinEl.dataset.node),
                index: parseInt(pinEl.dataset.index),
                type: pinEl.dataset.type,
                dataType: pinEl.dataset.dataType
            };

            if (!this._isCandidateCompatible(this.dragWire, target)) return;

            const pos = this.renderer.getPinPos(target.nodeId, target.index, target.type);
            if (!pos) return;

            const distance = Math.hypot(pos.x - mx, pos.y - my);
            if (distance > threshold) return;
            if (!best || distance < best.distance) {
                best = {
                    element: pinEl,
                    nodeId: target.nodeId,
                    index: target.index,
                    type: target.type,
                    dataType: target.dataType,
                    x: pos.x,
                    y: pos.y,
                    distance
                };
            }
        });

        return best;
    }

    _setSnapTarget(nextTarget) {
        if (this.snapTarget && this.snapTarget.element && this.snapTarget.element !== (nextTarget && nextTarget.element)) {
            this.snapTarget.element.classList.remove('snapped');
        }
        this.snapTarget = nextTarget || null;
        if (this.snapTarget && this.snapTarget.element) {
            this.snapTarget.element.classList.add('snapped');
        }
    }

    _clearSnapVisual() {
        if (this.snapTarget && this.snapTarget.element) {
            this.snapTarget.element.classList.remove('snapped');
        }
        this.snapTarget = null;
    }

    _isCandidateCompatible(source, target) {
        if (!source || !target) return false;
        if (source.sourceNode === target.nodeId) return false;
        if (source.sourceType === target.type) return false;

        if (source.sourceType === 'output') {
            const targetNode = this.graph.nodes.find(n => n.id === target.nodeId);
            const inputPin = targetNode && targetNode.inputs ? targetNode.inputs[target.index] : null;
            if (!inputPin) return false;
            if (this._isInputCompatible(inputPin, source.dataType)) return true;
            return this._hasConversion(source.dataType, target.dataType);
        }

        const outputNode = this.graph.nodes.find(n => n.id === target.nodeId);
        const outputPin = outputNode && outputNode.outputs ? outputNode.outputs[target.index] : null;
        if (!outputPin) return false;
        if (this._isOutputCompatible(outputPin, source.dataType)) return true;
        return this._hasConversion(target.dataType, source.dataType);
    }

    _hasConversion(fromType, toType) {
        if (!fromType || !toType) return false;
        if (fromType === toType) return false;
        if (fromType === 'exec' || toType === 'exec') return false;
        const key = `${fromType}->${toType}`;
        return !!(window.nodeConversions && window.nodeConversions[key]);
    }
}
