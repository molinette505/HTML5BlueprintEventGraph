/**
 * ConnectionManager Class
 * Encapsulates the logic for pin interactions and dragging wires.
 */
class ConnectionManager {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        // Internal state for the wire currently being dragged
        this.dragWire = null;
    }

    /**
     * Starts a wire drag from a pin element.
     * Handles "re-dragging" an existing connection if the target is an input pin.
     */
    startDrag(e) {
        const pin = e.target;
        const nodeId = parseInt(pin.dataset.node);
        const index = parseInt(pin.dataset.index);
        const type = pin.dataset.type;
        const dataType = pin.dataset.dataType;
        
        // 1. Logic for Input Pins: If already connected, "steal" the connection to re-drag it
        if (type === 'input') {
            const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPin === index);
            if (conn) {
                this.graph.removeConnection(conn.id);
                this.renderer.render();
                
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

        // 2. Logic for starting a new wire from an output (or empty input)
        const rect = pin.getBoundingClientRect();
        const cRect = this.dom.container.getBoundingClientRect();
        
        this.dragWire = {
            sourceNode: nodeId, 
            sourcePin: index, 
            sourceType: type, 
            dataType: dataType,
            // Calculate starting position in graph space
            startX: (rect.left + rect.width/2 - cRect.left - this.graph.pan.x) / this.graph.scale,
            startY: (rect.top + rect.height/2 - cRect.top - this.graph.pan.y) / this.graph.scale
        };
    }

    /**
     * Updates the visual state of the dragged wire during mousemove.
     */
    update(e) {
        if (!this.dragWire) return;

        const rect = this.dom.container.getBoundingClientRect();
        const mx = (e.clientX - rect.left - this.graph.pan.x) / this.graph.scale;
        const my = (e.clientY - rect.top - this.graph.pan.y) / this.graph.scale;
        
        // Refresh the connections layer
        this.dom.connectionsLayer.innerHTML = '';
        this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
        
        const p1 = { x: this.dragWire.startX, y: this.dragWire.startY };
        const p2 = { x: mx, y: my };
        
        // Draw the preview curve based on whether we started from an output or input
        if (this.dragWire.sourceType === 'output') {
            this.renderer.drawCurve(p1, p2, this.dragWire.dataType, true);
        } else {
            this.renderer.drawCurve(p2, p1, this.dragWire.dataType, true);
        }
    }

    /**
     * Finalizes the connection logic when mouse is released over a pin.
     */
    commit(targetElement) {
        if (!this.dragWire) return;

        const s = this.dragWire;
        const t = {
            nodeId: parseInt(targetElement.dataset.node),
            index: parseInt(targetElement.dataset.index),
            type: targetElement.dataset.type,
            dataType: targetElement.dataset.dataType
        };

        this.dragWire = null; // Reset state immediately

        // --- VALIDATION ---
        if (s.sourceNode === t.nodeId) return; // Cannot connect to self
        if (s.sourceType === t.type) return;   // Cannot connect output-to-output or input-to-input

        // --- WILDCARD LOGIC ---
        // If connecting a typed pin to a wildcard, propagate the type to the wildcard node
        if (s.dataType !== 'wildcard' && t.dataType === 'wildcard') {
            const targetNode = this.graph.nodes.find(n => n.id === t.nodeId);
            if (targetNode) {
                targetNode.inputs.forEach(p => p.setType(s.dataType));
                targetNode.outputs.forEach(p => p.setType(s.dataType));
                t.dataType = s.dataType; 
                this.renderer.refreshNode(targetNode);
            }
        }
        else if (s.dataType === 'wildcard' && t.dataType !== 'wildcard') {
            const sourceNode = this.graph.nodes.find(n => n.id === s.sourceNode);
            if (sourceNode) {
                sourceNode.inputs.forEach(p => p.setType(t.dataType));
                sourceNode.outputs.forEach(p => p.setType(t.dataType));
                s.dataType = t.dataType; 
                this.renderer.refreshNode(sourceNode);
            }
        }

        // --- TYPE CONVERSION LOGIC ---
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
            return; // Incompatible types with no conversion
        }

        // --- STANDARD CONNECTION ---
        const fromNode = s.sourceType === 'output' ? s.sourceNode : t.nodeId;
        const fromPin = s.sourceType === 'output' ? s.sourcePin : t.index;
        const toNode = s.sourceType === 'output' ? t.nodeId : s.sourceNode;
        const toPin = s.sourceType === 'output' ? t.index : s.sourcePin;

        this.graph.addConnection(fromNode, fromPin, toNode, toPin, s.dataType);
    }

    /**
     * Breaks a connection on a specific pin.
     */
    breakConnection(pinElement) {
        this.graph.disconnectPin(
            parseInt(pinElement.dataset.node), 
            parseInt(pinElement.dataset.index), 
            pinElement.dataset.type
        );
        this.renderer.render();
    }
}