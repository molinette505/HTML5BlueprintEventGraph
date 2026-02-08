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

        this.lastMousePos = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };

        this.touchConfig = {
            dragThreshold: 8,
            longPressMs: 430,
            doubleTapMs: 280,
            doubleTapRadius: 32
        };

        this.touchState = null;
        this.touchLongPressTimer = null;
        this.lastTouchTimestamp = 0;
        this.pinchState = null;

        this.pendingTap = null;
        this.pendingPinSingleAction = null;
        this.pendingNodeSingleAction = null;
        this.pendingCanvasClearAction = null;

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

    _closeVariableDrawer() {
        const panel = this.dom.variablePanel;
        if (!panel || !panel.classList.contains('visible')) return false;

        panel.classList.remove('visible');
        if (this.dom.variableDrawerHandle) this.dom.variableDrawerHandle.classList.remove('open');
        if (this.dom.btnToggleVars) this.dom.btnToggleVars.style.background = '';
        return true;
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
            const closedDrawer = this._closeVariableDrawer();
            if (closedDrawer) return;
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

        if (e.touches.length >= 2) {
            if (this._handleAssistMultiSelectTouch(e)) return;
            if (e.touches.length === 2) {
                this._startPinchPan(e);
            }
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
            if (state.longPressTriggered) return;

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
                if (state.longPressTriggered) {
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
                } else {
                    const shouldCancelWithoutSpawn = state.startedFromConnected && state.pinDir === 'input';
                    if (shouldCancelWithoutSpawn) {
                        this.connectionManager.clearDrag();
                    } else {
                        const spawnContext = this.connectionManager.beginPendingSpawn(state.lastX, state.lastY);
                        if (spawnContext) {
                            this.contextMenu.show(state.lastX, state.lastY, 'canvas', { graph: this.graph, spawnContext });
                        } else {
                            this.connectionManager.clearDrag();
                        }
                    }
                }
            } else if (!state.hasMoved && !state.longPressTriggered) {
                const pinMeta = this._pinData(state.pinElement);
                const tap = {
                    type: 'pin',
                    targetId: pinMeta ? `${pinMeta.nodeId}:${pinMeta.index}:${pinMeta.dir}` : 'pin',
                    x: state.lastX,
                    y: state.lastY,
                    time: Date.now(),
                    meta: pinMeta
                };
                const usedForContext = this._registerTouchTap(tap);
                if (!usedForContext && this._pinHasConnection(state.pinElement)) {
                    if (this.pendingPinSingleAction && this.pendingPinSingleAction.timer) {
                        clearTimeout(this.pendingPinSingleAction.timer);
                    }
                    const timer = setTimeout(() => {
                        if (this.pendingPinSingleAction && this.pendingPinSingleAction.key === tap.targetId) {
                            this.connectionManager.breakConnection(state.pinElement);
                            this.pendingPinSingleAction = null;
                        }
                    }, this.touchConfig.doubleTapMs + 20);
                    this.pendingPinSingleAction = { key: tap.targetId, timer };
                }
            }
        }
        else if (state.type === 'node') {
            if (state.dragStarted && this.mode === 'DRAG_NODES') {
                this.nodeMovementManager.endDrag();
            } else if (!state.hasMoved && !state.longPressTriggered) {
                const tap = {
                    type: 'node',
                    targetId: String(state.nodeId),
                    x: state.lastX,
                    y: state.lastY,
                    time: Date.now(),
                    meta: { nodeId: state.nodeId }
                };
                const usedForContext = this._registerTouchTap(tap);
                if (!usedForContext) {
                    const isSelectedMultiTap = this.selectionManager.selected.size > 1
                        && this.selectionManager.selected.has(state.nodeId);
                    if (isSelectedMultiTap) {
                        if (this.pendingNodeSingleAction && this.pendingNodeSingleAction.timer) {
                            clearTimeout(this.pendingNodeSingleAction.timer);
                        }
                        const timer = setTimeout(() => {
                            if (this.pendingNodeSingleAction && this.pendingNodeSingleAction.tapTime === tap.time) {
                                this._handleNodeTap(state.nodeId);
                                this.pendingNodeSingleAction = null;
                            }
                        }, this.touchConfig.doubleTapMs + 20);
                        this.pendingNodeSingleAction = { tapTime: tap.time, targetId: tap.targetId, timer };
                    } else {
                        this._handleNodeTap(state.nodeId);
                    }
                }
            }
        }
        else if (state.type === 'canvas') {
            if (state.dragStarted && this.mode === 'BOX_SELECT') {
                this.selectionManager.endBox();
            } else if (state.dragStarted && this.mode === 'PANNING') {
                // No-op: panning state already updated continuously in move.
            } else if (!state.hasMoved && !state.longPressTriggered) {
                const tap = {
                    type: 'canvas',
                    targetId: 'canvas',
                    x: state.lastX,
                    y: state.lastY,
                    time: Date.now(),
                    meta: null
                };
                const usedForContext = this._registerTouchTap(tap);
                if (!usedForContext) {
                    if (this.selectionManager.selected.size > 0) {
                        if (this.pendingCanvasClearAction && this.pendingCanvasClearAction.timer) {
                            clearTimeout(this.pendingCanvasClearAction.timer);
                        }
                        const timer = setTimeout(() => {
                            if (this.pendingCanvasClearAction && this.pendingCanvasClearAction.tapTime === tap.time) {
                                this.selectionManager.clear();
                                this.pendingCanvasClearAction = null;
                            }
                        }, this.touchConfig.doubleTapMs + 20);
                        this.pendingCanvasClearAction = { tapTime: tap.time, timer };
                    }
                }
            }
        }

        if (e.touches.length === 0) {
            this.pinchState = null;
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
        const pinMeta = this._pinData(pinElement);
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
            pinDir: pinMeta ? pinMeta.dir : null,
            pinElement
        };

        this._armTouchLongPress(() => {
            // Long-press now enters multi-select mode instead of opening context menu.
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
            const selected = this.selectionManager.selected;
            if (selected.size <= 1) {
                if (selected.has(nodeId)) this.selectionManager.remove(nodeId);
                else {
                    this.selectionManager.clear();
                    this.selectionManager.add(nodeId);
                }
                return;
            }

            if (selected.has(nodeId)) this.selectionManager.remove(nodeId);
            else this.selectionManager.add(nodeId);
        });
    }

    _beginCanvasTouch(touch) {
        const closedDrawer = this._closeVariableDrawer();

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
            closedDrawerOnTouchStart: closedDrawer
        };

        this._armTouchLongPress(() => {
            // Long-press now enters multi-select mode.
        });
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
        if (this.selectionManager.selected.size > 1) {
            this.selectionManager.clear();
            this.selectionManager.add(nodeId);
            return;
        }
        if (!this.selectionManager.selected.has(nodeId) || this.selectionManager.selected.size !== 1) {
            this.selectionManager.clear();
            this.selectionManager.add(nodeId);
        }
    }

    _registerTouchTap(tap) {
        if (this.pendingNodeSingleAction) {
            const isSameNodeTap = tap && tap.type === 'node' && tap.targetId === this.pendingNodeSingleAction.targetId;
            if (!isSameNodeTap) {
                if (this.pendingNodeSingleAction.timer) clearTimeout(this.pendingNodeSingleAction.timer);
                this.pendingNodeSingleAction = null;
            }
        }
        if (this.pendingCanvasClearAction) {
            const isCanvasTap = tap && tap.type === 'canvas';
            if (!isCanvasTap) {
                if (this.pendingCanvasClearAction.timer) clearTimeout(this.pendingCanvasClearAction.timer);
                this.pendingCanvasClearAction = null;
            }
        }

        if (this._isDoubleTap(this.pendingTap, tap)) {
            this.pendingTap = null;
            if (this.pendingPinSingleAction && this.pendingPinSingleAction.timer) {
                clearTimeout(this.pendingPinSingleAction.timer);
                this.pendingPinSingleAction = null;
            }
            if (this.pendingNodeSingleAction && this.pendingNodeSingleAction.timer) {
                clearTimeout(this.pendingNodeSingleAction.timer);
                this.pendingNodeSingleAction = null;
            }
            if (this.pendingCanvasClearAction && this.pendingCanvasClearAction.timer) {
                clearTimeout(this.pendingCanvasClearAction.timer);
                this.pendingCanvasClearAction = null;
            }
            this._showTouchContextMenu(tap);
            return true;
        }

        this.pendingTap = tap;
        return false;
    }

    _isDoubleTap(previousTap, currentTap) {
        if (!previousTap || !currentTap) return false;
        if (previousTap.type !== currentTap.type) return false;
        if (previousTap.targetId !== currentTap.targetId) return false;

        const dt = currentTap.time - previousTap.time;
        if (dt > this.touchConfig.doubleTapMs) return false;

        const dist = Math.hypot(currentTap.x - previousTap.x, currentTap.y - previousTap.y);
        return dist <= this.touchConfig.doubleTapRadius;
    }

    _showTouchContextMenu(tap) {
        if (!tap) return;

        if (tap.type === 'pin' && tap.meta) {
            if (!this._canOpenPinContextMenu(tap.meta)) return;
            this.contextMenu.show(tap.x, tap.y, 'pin', {
                graph: this.graph,
                targetId: tap.meta.nodeId,
                pinIndex: tap.meta.index,
                pinDir: tap.meta.dir
            });
            return;
        }

        if (tap.type === 'node' && tap.meta) {
            if (!this.selectionManager.selected.has(tap.meta.nodeId)) {
                this.selectionManager.clear();
                this.selectionManager.add(tap.meta.nodeId);
            }

            if (this.selectionManager.selected.size > 1) {
                this.contextMenu.show(tap.x, tap.y, 'node', {
                    targetId: tap.meta.nodeId,
                    selectedCount: this.selectionManager.selected.size
                });
                return;
            }

            this.contextMenu.show(tap.x, tap.y, 'node', {
                targetId: tap.meta.nodeId,
                selectedCount: this.selectionManager.selected.size
            });
            return;
        }

        this.contextMenu.show(tap.x, tap.y, 'canvas', { graph: this.graph });
    }

    _canOpenPinContextMenu(pinMeta) {
        if (!pinMeta) return false;
        const node = this.graph.nodes.find(n => n.id === pinMeta.nodeId);
        if (!node) return false;

        const pins = pinMeta.dir === 'input' ? node.inputs : node.outputs;
        const pin = pins && pins[pinMeta.index] ? pins[pinMeta.index] : null;
        if (!pin) return false;

        return Array.isArray(pin.allowedTypes) && pin.allowedTypes.length > 0;
    }

    _handleAssistMultiSelectTouch(e) {
        if (!this.touchState) return false;
        if (!this.touchState.longPressTriggered) return false;
        if (this.touchState.type !== 'canvas' && this.touchState.type !== 'node') return false;

        const assistTouch = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null;
        if (!assistTouch) return false;

        const target = document.elementFromPoint(assistTouch.clientX, assistTouch.clientY);
        if (!target) return false;

        const nodeEl = target.closest && target.closest('.node');
        if (nodeEl) {
            const nodeId = parseInt(nodeEl.id.replace('node-', ''));
            this.selectionManager.add(nodeId);
            e.preventDefault();
            return true;
        }

        if (this._isBackground(target)) {
            e.preventDefault();
            return true;
        }

        return false;
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
