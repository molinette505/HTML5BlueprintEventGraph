/**
 * ConnectionManager
 * Manages the lifecycle of "Wires" (connections).
 * Handles pin-to-pin validation, wildcard type propagation, 
 * and automatic conversion node spawning.
 */
class ConnectionManager {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;
        
        /** @type {Object|null} - State of the wire currently being dragged by the user */
        this.dragWire = null;
    }

    /**
     * Initiates a wire dragging operation.
     * Features "Socket Stealing": if an input pin is clicked, we disconnect the 
     * existing wire and start dragging it from the source instead.
     * @param {MouseEvent} e 
     */
    startDrag(e) {
        const pin = e.target;
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
        
        // Clear the overlay and redraw existing connections + the current preview
        this.dom.connectionsLayer.innerHTML = '';
        this.graph.connections.forEach(cx => this.renderer.drawConnection(cx));
        
        const p1 = { x: this.dragWire.startX, y: this.dragWire.startY };
        const p2 = { x: mx, y: my };
        
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
    commit(targetElement) {
        if (!this.dragWire) return;

        const s = this.dragWire;
        const t = {
            nodeId: parseInt(targetElement.dataset.node),
            index: parseInt(targetElement.dataset.index),
            type: targetElement.dataset.type,
            dataType: targetElement.dataset.dataType
        };

        this.dragWire = null; // Reset dragging state immediately

        // --- VALIDATION ---
        if (s.sourceNode === t.nodeId) return; // Prevent connecting a node to itself
        if (s.sourceType === t.type) return;   // Prevent Output-to-Output or Input-to-Input

        // --- WILDCARD PROPAGATION ---
        // If one of the nodes is a generic "Wildcard" node (like a 'Print' node),
        // it adopts the data type of the node it is being connected to.
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
}