/**
 * Interaction Controller
 * * This class acts as the central "Orchestrator" for user input.
 * It listens for raw DOM events (mousedown, keydown, touch, etc.) and delegates
 * the actual logic to specialized Managers (NodeManager, ConnectionManager, etc.).
 */
import { ClipboardManager } from "./managers/ClipboardManager";
import { ConnectionManager } from "./managers/ConnectionManager";
import { ContextMenuManager } from "./managers/ContextMenuManager";
import { NodeManager } from "./managers/NodeManager";
import { NodeMovementManager } from "./managers/NodeMovementManager";
import { SelectionManager } from "./managers/SelectionManager";
import { ViewportManager } from "./managers/ViewportManager";

export class Interaction {
    constructor(graph, renderer, dom) {
        this.graph = graph;
        this.renderer = renderer;
        this.dom = dom;

        this.viewportManager = new ViewportManager(this.graph, this.renderer, this.dom);
        this.selectionManager = new SelectionManager(this.graph, this.dom);
        this.nodeMovementManager = new NodeMovementManager(this.graph, this.renderer, this.selectionManager);
        this.connectionManager = new ConnectionManager(this.graph, this.renderer, this.dom);
        this.clipboard = new ClipboardManager(this.graph, this.renderer, this.selectionManager, this.dom);

        this.nodeManager = new NodeManager(this.graph, this.renderer, (e, nodeId) => {
            this.handleNodeDown(e, nodeId);
        });

        this.contextMenu = new ContextMenuManager(
            {
                menu: dom.contextMenu,
                list: dom.contextList,
                search: dom.contextSearch,
                contextControls: dom.contextControls,
                contextSensitiveToggle: dom.contextSensitiveToggle,
                container: dom.container
            },
            {
                onSpawn: (tmpl, x, y, spawnContext = null) => {
                    this.connectionManager.clearPendingSpawn(false);
                    const node = this.nodeManager.createNode(tmpl, x, y);
                    if (spawnContext) {
                        this.connectionManager.connectSpawnedNode(spawnContext, node);
                    }
                    this.selectionManager.clear();
                    this.selectionManager.add(node.id);
                },
                onDelete: (targetId) => this.deleteWithSelectionCheck(targetId),
                onCopy: () => this.clipboard.copy(),
                onCut: () => this.cutSelection(),
                onPaste: (x, y) => this.clipboard.paste(x, y),
                onPinChange: (node, pin, newType, index, dir) => {
                    pin.setType(newType);
                    this.graph.disconnectPin(node.id, index, dir);
                    this.renderer.refreshNode(node);
                },
                onHide: () => this.connectionManager.clearPendingSpawn()
            }
        );

        this.mode = 'IDLE'; // IDLE, PANNING, DRAG_NODES, DRAG_WIRE, BOX_SELECT, PINCH_PAN
        this.dragData = { startX: 0, startY: 0, initialPan: { x: 0, y: 0 }, nodeOffsets: new Map() };

        this.lastMousePos = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };

        this.touchConfig = {
            dragThreshold: 8,
            longPressMs: 430,
            doubleTapMs: 280
        };
        this.touchState = null;
        this.touchLongPressTimer = null;
        this.touchSingleTapTimer = null;
        this.pendingDoubleTap = { nodeId: null, time: 0 };
        this.pendingCanvasTap = { time: 0, x: 0, y: 0 };
        this.lastTouchTimestamp = 0;
        this.pinchState = null;

        this.bindEvents();
        this.bindKeyboardEvents();
    }

    bindEvents() {
        const c = this.dom.container;

        c.addEventListener('mousedown', e => {
            if (Date.now() - this.lastTouchTimestamp < 700) return;

            this.contextMenu.hide();

            if (e.target.classList.contains('pin')) {
                return this._handlePinInteraction(e);
            }

            const nodeEl = e.target.closest('.node');
            if (nodeEl) {
                return this._handleNodeInteraction(e, nodeEl);
            }

            if (this._isBackground(e.target)) {
                return this._handleCanvasInteraction(e);
            }
        });

        window.addEventListener('mousemove', e => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };

            if (this.mode === 'PANNING') this.viewportManager.updatePan(e);
            else if (this.mode === 'DRAG_NODES') this.nodeMovementManager.update(e);
            else if (this.mode === 'DRAG_WIRE') this.connectionManager.update(e);
            else if (this.mode === 'BOX_SELECT') this.selectionManager.updateBox(e);
        });

        window.addEventListener('mouseup', e => {
            if (this.mode === 'PANNING') {
                if (!this.viewportManager.isIntentionalDrag && e.button === 2) {
                    if (!e.target.closest('.node') && !e.target.closest('.pin')) {
                        this.contextMenu.show(e.clientX, e.clientY, 'canvas', { graph: this.graph });
                    }
                }
            }
            else if (this.mode === 'DRAG_WIRE') {
                const target = e.target.closest('.pin') || this.connectionManager.getSnapTargetElement();
                if (target) {
                    this.connectionManager.commit(target);
                } else {
                    const spawnContext = this.connectionManager.beginPendingSpawn(e.clientX, e.clientY);
                    if (spawnContext) {
                        this.contextMenu.show(e.clientX, e.clientY, 'canvas', { graph: this.graph, spawnContext });
                    } else {
                        this.connectionManager.clearDrag();
                    }
                }
            }
            else if (this.mode === 'BOX_SELECT') {
                this.selectionManager.endBox();
            }
            else if (this.mode === 'DRAG_NODES') {
                this.nodeMovementManager.endDrag();
            }

            this._finishPointerInteraction();
        });

        c.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
        c.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
        c.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
        c.addEventListener('touchcancel', () => this._handleTouchCancel(), { passive: false });

        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel', e => {
            this.viewportManager.handleZoom(e);
            this.contextMenu.hide();
        }, { passive: false });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', async (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); this.clipboard.copy(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); this.clipboard.paste(this.lastMousePos.x, this.lastMousePos.y); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') { this.cutSelection(); }

            if (['Delete', 'Backspace'].includes(e.key)) {
                if (this.selectionManager.selected.size > 0) this.nodeManager.deleteNodes(this.selectionManager.selected);
                this.selectionManager.clear();
            }
        });
    }

    handleNodeDown(e, nodeId) {
        if (!e.ctrlKey && !e.shiftKey && !this.selectionManager.selected.has(nodeId)) {
            this.selectionManager.clear();
        }
        this.selectionManager.add(nodeId);

        this.nodeMovementManager.startDrag(e, nodeId);
        this.mode = 'DRAG_NODES';
    }

    deleteWithSelectionCheck(targetId) {
        if (this.selectionManager.selected.size > 1 && this.selectionManager.selected.has(targetId)) {
            this.nodeManager.deleteNodes(this.selectionManager.selected);
        } else {
            this.nodeManager.deleteNodes([targetId]);
        }
        this.selectionManager.clear();
    }

    async cutSelection() {
        const success = await this.clipboard.cut();
        if (success) {
            this.nodeManager.deleteNodes(this.selectionManager.selected);
            this.selectionManager.clear();
        }
    }

    _isInteractiveElement(el) {
        return el.closest('.pin') || el.closest('input') ||
            el.closest('.node-widget') || el.closest('.advanced-arrow') || el.closest('select') || el.closest('textarea');
    }

    _isBackground(el) {
        return el === this.dom.container || el === this.dom.transformLayer || el.id === 'connections-layer' || el.id === 'selection-box';
    }

    _handlePinInteraction(e) {
        if (e.button === 2) {
            const pin = e.target;
            this.contextMenu.show(e.clientX, e.clientY, 'pin', {
                graph: this.graph,
                targetId: parseInt(pin.dataset.node),
                pinIndex: parseInt(pin.dataset.index),
                pinDir: pin.dataset.type
            });
            return;
        }

        if (e.altKey) {
            this.connectionManager.breakConnection(e.target);
            return;
        }

        if (e.button === 0) {
            this.connectionManager.startDrag(e);
            this.mode = 'DRAG_WIRE';
        }
    }

    _handleNodeInteraction(e, nodeEl) {
        if (this._isInteractiveElement(e.target)) return;

        const nodeId = parseInt(nodeEl.id.replace('node-', ''));

        if (e.button === 2) {
            if (!this.selectionManager.selected.has(nodeId)) {
                this.selectionManager.clear();
                this.selectionManager.add(nodeId);
            }

            this.contextMenu.show(e.clientX, e.clientY, 'node', {
                targetId: nodeId,
                selectedCount: this.selectionManager.selected.size
            });
            return;
        }

        if (e.button === 0) {
            this.handleNodeDown(e, nodeId);
        }
    }

    _handleCanvasInteraction(e) {
        if (e.button === 0) {
            this.selectionManager.startBox(e);
            this.mode = 'BOX_SELECT';
        }
        else if (e.button === 2) {
            this.viewportManager.startPan(e);
            this.mode = 'PANNING';
        }
    }

    _handleTouchStart(e) {
        this.lastTouchTimestamp = Date.now();

        if (e.touches.length === 2) {
            this._startPinchPan(e);
            return;
        }
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const target = e.target;

        this.contextMenu.hide();

        const pinEl = target.closest && target.closest('.pin');
        if (pinEl) {
            e.preventDefault();
            this._beginPinTouch(touch, pinEl);
            return;
        }

        const nodeEl = target.closest && target.closest('.node');
        if (nodeEl) {
            if (this._isInteractiveElement(target)) return;
            e.preventDefault();
            this._beginNodeTouch(touch, nodeEl);
            return;
        }

        if (this._isBackground(target)) {
            e.preventDefault();
            this._beginCanvasTouch(touch);
        }
    }

    _handleTouchMove(e) {
        this.lastTouchTimestamp = Date.now();

        if (this.mode === 'PINCH_PAN' || e.touches.length === 2) {
            this._updatePinchPan(e);
            return;
        }

        if (!this.touchState) return;

        const touch = this._findTouchById(e.touches, this.touchState.touchId);
        if (!touch) return;

        const state = this.touchState;
        state.lastX = touch.clientX;
        state.lastY = touch.clientY;

        const distance = Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY);
        if (distance > this.touchConfig.dragThreshold) {
            state.hasMoved = true;
            this._clearTouchLongPress();
        }

        if (state.type === 'pin') {
            if (!state.dragStarted && distance > this.touchConfig.dragThreshold) {
                this.connectionManager.startDragFromElement(state.pinElement);
                state.dragStarted = true;
                this.mode = 'DRAG_WIRE';
            }
            if (state.dragStarted && this.mode === 'DRAG_WIRE') {
                e.preventDefault();
                this.connectionManager.update(this._asPointerEvent(touch.clientX, touch.clientY));
            }
            return;
        }

        if (state.type === 'node') {
            if (!state.dragStarted && distance > this.touchConfig.dragThreshold) {
                this.handleNodeDown(this._asPointerEvent(state.startX, state.startY), state.nodeId);
                state.dragStarted = true;
            }
            if (state.dragStarted && this.mode === 'DRAG_NODES') {
                e.preventDefault();
                this.nodeMovementManager.update(this._asPointerEvent(touch.clientX, touch.clientY));
            }
            return;
        }

        if (state.type === 'canvas') {
            if (!state.dragStarted && distance > this.touchConfig.dragThreshold) {
                if (state.boxSelectArmed) {
                    this.selectionManager.startBox(this._asPointerEvent(state.startX, state.startY));
                    this.mode = 'BOX_SELECT';
                } else {
                    this.viewportManager.startPan(this._asPointerEvent(state.startX, state.startY));
                    this.mode = 'PANNING';
                }
                state.dragStarted = true;
            }
            if (state.dragStarted && this.mode === 'BOX_SELECT') {
                e.preventDefault();
                this.selectionManager.updateBox(this._asPointerEvent(touch.clientX, touch.clientY));
            } else if (state.dragStarted && this.mode === 'PANNING') {
                e.preventDefault();
                this.viewportManager.updatePan(this._asPointerEvent(touch.clientX, touch.clientY));
            }
        }
    }

    _handleTouchEnd(e) {
        this.lastTouchTimestamp = Date.now();

        if (this.mode === 'PINCH_PAN') {
            if (e.touches.length < 2) {
                this.mode = 'IDLE';
                this.pinchState = null;
            }
            return;
        }

        if (!this.touchState) return;

        const endedTouch = this._findTouchById(e.changedTouches, this.touchState.touchId);
        if (!endedTouch) return;

        this.touchState.lastX = endedTouch.clientX;
        this.touchState.lastY = endedTouch.clientY;

        this._clearTouchLongPress();

        const state = this.touchState;
        this.touchState = null;

        if (state.type === 'pin') {
            if (state.dragStarted && this.mode === 'DRAG_WIRE') {
                const targetPin = this._pinFromPoint(state.lastX, state.lastY) || this.connectionManager.getSnapTargetElement();
                if (targetPin) {
                    this.connectionManager.commit(targetPin);
                } else if (state.startedFromConnected) {
                    this.connectionManager.clearDrag();
                } else {
                    const spawnContext = this.connectionManager.beginPendingSpawn(state.lastX, state.lastY);
                    if (spawnContext) {
                        this.contextMenu.show(state.lastX, state.lastY, 'canvas', { graph: this.graph, spawnContext });
                    }
                }
            } else if (!state.hasMoved && !state.longPressTriggered && this._pinHasConnection(state.pinElement)) {
                this.connectionManager.breakConnection(state.pinElement);
            }
        }
        else if (state.type === 'node') {
            if (state.dragStarted && this.mode === 'DRAG_NODES') {
                this.nodeMovementManager.endDrag();
            } else if (!state.hasMoved && !state.longPressTriggered) {
                this._handleNodeTap(state.nodeId);
            }
        }
        else if (state.type === 'canvas') {
            if (state.dragStarted && this.mode === 'BOX_SELECT') {
                this.selectionManager.endBox();
            } else if (state.dragStarted && this.mode === 'PANNING') {
                // No-op: panning state already updated continuously in move.
            } else if (!state.hasMoved && !state.longPressTriggered) {
                this.selectionManager.clear();
            }
        }

        this._finishPointerInteraction();
    }

    _handleTouchCancel() {
        this.lastTouchTimestamp = Date.now();
        this._clearTouchLongPress();

        if (this.mode === 'DRAG_NODES') this.nodeMovementManager.endDrag();
        if (this.mode === 'BOX_SELECT') this.selectionManager.endBox();
        if (this.mode === 'DRAG_WIRE') this.connectionManager.clearDrag();

        this.pinchState = null;
        this.touchState = null;
        this._finishPointerInteraction();
    }

    _beginPinTouch(touch, pinElement) {
        this.touchState = {
            type: 'pin',
            touchId: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            hasMoved: false,
            dragStarted: false,
            longPressTriggered: false,
            startedFromConnected: this._pinHasConnection(pinElement),
            pinElement
        };

        this._armTouchLongPress(() => {
            const pinData = this._pinData(pinElement);
            if (!pinData) return;
            this.contextMenu.show(this.touchState.lastX, this.touchState.lastY, 'pin', {
                graph: this.graph,
                targetId: pinData.nodeId,
                pinIndex: pinData.index,
                pinDir: pinData.dir
            });
        });
    }

    _beginNodeTouch(touch, nodeElement) {
        const nodeId = parseInt(nodeElement.id.replace('node-', ''));
        this.touchState = {
            type: 'node',
            touchId: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            hasMoved: false,
            dragStarted: false,
            longPressTriggered: false,
            nodeId
        };

        this._armTouchLongPress(() => {
            if (!this.selectionManager.selected.has(nodeId)) {
                this.selectionManager.clear();
                this.selectionManager.add(nodeId);
            }
            this.contextMenu.show(this.touchState.lastX, this.touchState.lastY, 'node', {
                targetId: nodeId,
                selectedCount: this.selectionManager.selected.size
            });
        });
    }

    _beginCanvasTouch(touch) {
        const now = Date.now();
        const distFromLastTap = Math.hypot(touch.clientX - this.pendingCanvasTap.x, touch.clientY - this.pendingCanvasTap.y);
        const isDoubleTap = (now - this.pendingCanvasTap.time) <= this.touchConfig.doubleTapMs && distFromLastTap <= 32;

        if (isDoubleTap) {
            this.pendingCanvasTap = { time: 0, x: 0, y: 0 };
        } else {
            this.pendingCanvasTap = { time: now, x: touch.clientX, y: touch.clientY };
        }

        this.touchState = {
            type: 'canvas',
            touchId: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            hasMoved: false,
            dragStarted: false,
            longPressTriggered: false,
            boxSelectArmed: isDoubleTap
        };

        if (!isDoubleTap) {
            this._armTouchLongPress(() => {
                this.contextMenu.show(this.touchState.lastX, this.touchState.lastY, 'canvas', { graph: this.graph });
            });
        }
    }

    _startPinchPan(e) {
        if (e.touches.length < 2) return;

        e.preventDefault();
        this._clearTouchLongPress();
        this.touchState = null;

        if (this.mode === 'DRAG_NODES') this.nodeMovementManager.endDrag();
        if (this.mode === 'BOX_SELECT') this.selectionManager.endBox();
        if (this.mode === 'DRAG_WIRE') this.connectionManager.clearDrag();

        const [a, b] = [e.touches[0], e.touches[1]];
        const rect = this.dom.container.getBoundingClientRect();

        const centerX = (a.clientX + b.clientX) / 2;
        const centerY = (a.clientY + b.clientY) / 2;
        const startDistance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));

        const localCenterX = centerX - rect.left;
        const localCenterY = centerY - rect.top;

        this.pinchState = {
            startDistance,
            startScale: this.graph.scale,
            worldAnchor: {
                x: (localCenterX - this.graph.pan.x) / this.graph.scale,
                y: (localCenterY - this.graph.pan.y) / this.graph.scale
            }
        };

        this.mode = 'PINCH_PAN';
    }

    _updatePinchPan(e) {
        if (e.touches.length < 2) return;
        e.preventDefault();

        if (!this.pinchState) {
            this._startPinchPan(e);
            return;
        }

        const [a, b] = [e.touches[0], e.touches[1]];
        const rect = this.dom.container.getBoundingClientRect();

        const centerX = (a.clientX + b.clientX) / 2 - rect.left;
        const centerY = (a.clientY + b.clientY) / 2 - rect.top;
        const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));

        const rawScale = this.pinchState.startScale * (distance / this.pinchState.startDistance);
        const newScale = Math.min(Math.max(0.2, rawScale), 3);

        this.graph.scale = newScale;
        this.graph.pan.x = centerX - this.pinchState.worldAnchor.x * newScale;
        this.graph.pan.y = centerY - this.pinchState.worldAnchor.y * newScale;

        this.renderer.updateTransform();
    }

    _armTouchLongPress(callback) {
        this._clearTouchLongPress();
        this.touchLongPressTimer = window.setTimeout(() => {
            if (!this.touchState) return;
            if (this.touchState.hasMoved || this.touchState.dragStarted) return;
            this.touchState.longPressTriggered = true;
            callback();
        }, this.touchConfig.longPressMs);
    }

    _clearTouchLongPress() {
        if (this.touchLongPressTimer) {
            clearTimeout(this.touchLongPressTimer);
            this.touchLongPressTimer = null;
        }
    }

    _handleNodeTap(nodeId) {
        const now = Date.now();
        const isDoubleTap = this.pendingDoubleTap.nodeId === nodeId && (now - this.pendingDoubleTap.time) <= this.touchConfig.doubleTapMs;

        if (isDoubleTap) {
            if (this.touchSingleTapTimer) {
                clearTimeout(this.touchSingleTapTimer);
                this.touchSingleTapTimer = null;
            }

            this.pendingDoubleTap = { nodeId: null, time: 0 };

            if (this.selectionManager.selected.has(nodeId)) {
                this.selectionManager.remove(nodeId);
            } else {
                this.selectionManager.add(nodeId);
            }
            return;
        }

        this.pendingDoubleTap = { nodeId, time: now };
        if (this.touchSingleTapTimer) clearTimeout(this.touchSingleTapTimer);

        this.touchSingleTapTimer = window.setTimeout(() => {
            if (this.pendingDoubleTap.nodeId !== nodeId) return;

            if (this.selectionManager.selected.size > 1) {
                this.selectionManager.clear();
                this.selectionManager.add(nodeId);
            } else if (this.selectionManager.selected.has(nodeId)) {
                this.selectionManager.remove(nodeId);
            } else {
                this.selectionManager.clear();
                this.selectionManager.add(nodeId);
            }

            this.pendingDoubleTap = { nodeId: null, time: 0 };
            this.touchSingleTapTimer = null;
        }, this.touchConfig.doubleTapMs + 20);
    }

    _asPointerEvent(clientX, clientY) {
        return {
            clientX,
            clientY,
            button: 0,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            target: this.dom.container
        };
    }

    _findTouchById(touchList, id) {
        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === id) return touchList[i];
        }
        return null;
    }

    _pinData(pinElement) {
        if (!pinElement || !pinElement.dataset) return null;
        return {
            nodeId: parseInt(pinElement.dataset.node),
            index: parseInt(pinElement.dataset.index),
            dir: pinElement.dataset.type
        };
    }

    _pinHasConnection(pinElement) {
        const pin = this._pinData(pinElement);
        if (!pin) return false;

        if (pin.dir === 'input') {
            return this.graph.connections.some(c => c.toNode === pin.nodeId && c.toPin === pin.index);
        }
        return this.graph.connections.some(c => c.fromNode === pin.nodeId && c.fromPin === pin.index);
    }

    _pinFromPoint(clientX, clientY) {
        const target = document.elementFromPoint(clientX, clientY);
        if (!target) return null;
        return target.closest('.pin');
    }

    _finishPointerInteraction() {
        this.mode = 'IDLE';
        this.renderer.dom.connectionsLayer.innerHTML = '';
        this.renderer.render();
        this.connectionManager.renderPendingSpawnPreview();
    }
}
