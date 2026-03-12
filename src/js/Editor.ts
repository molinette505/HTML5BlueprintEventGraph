/**
 * Editor Class
 * Acts as the main entry point and "Glue" for the application.
 * It initializes all the subsystems (Graph, Renderer, Interaction, etc.)
 * and wires up the UI (Toolbar, Drag & Drop).
 */
import { Graph } from "./core/Graph";
import { Renderer } from "./view/Renderer";
import { Interaction } from "./interaction/Interaction";
import { Simulation } from "./Simulation";
import { VariableManager } from "./VariableManager";
import starterGraph from "../data/starter-graph.json";
import builtinSaves from "../data/builtin-saves.json";

export class Editor {
    constructor() {
        // 1. Cache all DOM elements we need to interact with
        this.dom = {
            container: document.getElementById('graph-container'),
            nodesLayer: document.getElementById('nodes-layer'),
            connectionsLayer: document.getElementById('connections-layer'),
            transformLayer: document.getElementById('transform-layer'),
            contextMenu: document.getElementById('context-menu'),
            contextList: document.getElementById('context-list'),
            contextSearch: document.getElementById('context-search'),
            contextControls: document.getElementById('context-controls'),
            contextSensitiveToggle: document.getElementById('context-sensitive-toggle'),
            variablePanel: document.getElementById('variable-panel'),
            btnToggleVars: document.getElementById('btn-toggle-vars'),
            variableDrawerHandle: document.getElementById('variable-drawer-handle'),
            
            // Simulation Toolbar Buttons
            btnStep: document.getElementById('btn-step'),
            btnReplay: document.getElementById('btn-replay'),
            btnStop: document.getElementById('btn-stop'),

            // Save / Load
            btnSave: document.getElementById('btn-save'),
            btnLoad: document.getElementById('btn-load'),
            saveLoadModal: document.getElementById('save-load-modal'),
            modalTitle: document.getElementById('modal-title'),
            modalSaveNameRow: document.getElementById('modal-save-name-row'),
            modalSaveName: document.getElementById('modal-save-name'),
            modalSaveList: document.getElementById('modal-save-list'),
            btnModalConfirm: document.getElementById('btn-modal-confirm'),
            btnModalDelete: document.getElementById('btn-modal-delete'),
            btnModalClose: document.getElementById('btn-modal-close')
        };

        this.saveStorageKey = "blueprint.graphSaves.v1";
        this.defaultSaveName = "default";
        this.builtinSaveConfig = builtinSaves && typeof builtinSaves === 'object' ? builtinSaves : { saves: {} };
        this.defaultBuiltinSaveName = this.builtinSaveConfig.defaultSaveName || null;
        this.currentSaveName = this.defaultSaveName;
        this.modalMode = null;
        this.modalSelectedSaveName = null;
        
        // 2. Instantiate the Core Systems
        this.graph = new Graph(); // The Data Model
        this.renderer = new Renderer(this.graph, this.dom); // The Visual System
        
        // The Interaction Controller (Inputs, Clicks, Drags)
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        
        // The Execution Engine
        this.simulation = new Simulation(this.graph, this.renderer);
        
        // The Variable/Property Manager
        this.variableManager = new VariableManager(this);

        // 3. Bind Simulation Events
        // When the simulation runs/stops, update the toolbar buttons (Play/Pause icons)
        this.simulation.onStateChange = (status) => this.updateControls(status);

        // 4. Run Setup Routines
        this.importFileGlobals(); // Load node definitions from window
        this.setupToolbar();      // Click listeners for UI buttons
        this.setupDragDrop();     // Allow dragging variables onto canvas
        
        // 5. Load the Default Demo
        this.initDemo();
    }

    /**
     * Wires up the buttons in the top toolbar (Variables, Play, Pause, etc.)
     */
    setupToolbar() {
        const setVariablePanelVisible = (isVisible) => {
            if (!this.dom.variablePanel) return;
            this.dom.variablePanel.classList.toggle('visible', isVisible);

            if (this.dom.btnToggleVars) {
                this.dom.btnToggleVars.style.background = isVisible ? '#36a55d' : '';
            }
            if (this.dom.variableDrawerHandle) {
                this.dom.variableDrawerHandle.classList.toggle('open', isVisible);
            }
        };

        const toggleVariablePanel = () => {
            if (!this.dom.variablePanel) return;
            setVariablePanelVisible(!this.dom.variablePanel.classList.contains('visible'));
        };

        if (this.dom.btnToggleVars) {
            this.dom.btnToggleVars.onclick = () => toggleVariablePanel();
        }

        if (this.dom.variableDrawerHandle) {
            this.dom.variableDrawerHandle.onclick = () => toggleVariablePanel();
            this.dom.variableDrawerHandle.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleVariablePanel();
            }, { passive: false });
        }

        // Stepping and Stopping
        if (this.dom.btnStep) this.dom.btnStep.onclick = () => this.simulation.step();
        if (this.dom.btnReplay) this.dom.btnReplay.onclick = () => this.simulation.replayStep();
        if (this.dom.btnStop) this.dom.btnStop.onclick = () => this.simulation.stop();

        if (this.dom.btnSave) this.dom.btnSave.onclick = () => this.openSaveLoadModal('save');
        if (this.dom.btnLoad) this.dom.btnLoad.onclick = () => this.openSaveLoadModal('load');
        if (this.dom.btnModalClose) this.dom.btnModalClose.onclick = () => this.closeSaveLoadModal();
        if (this.dom.btnModalConfirm) {
            this.dom.btnModalConfirm.onclick = () => {
                if (this.modalMode === 'save') {
                    const raw = this.dom.modalSaveName ? this.dom.modalSaveName.value : '';
                    const name = String(raw || '').trim();
                    if (!name || this.isBuiltinSaveName(name)) return;
                    this.saveProject(name);
                    this.closeSaveLoadModal();
                } else if (this.modalMode === 'load' && this.modalSelectedSaveName) {
                    if (this.loadProject(this.modalSelectedSaveName)) {
                        this.closeSaveLoadModal();
                    }
                }
            };
        }
        if (this.dom.btnModalDelete) {
            this.dom.btnModalDelete.onclick = () => {
                if (this.modalMode !== 'load') return;
                if (!this.modalSelectedSaveName) return;
                this.deleteProject(this.modalSelectedSaveName);
                this.renderSaveList();
            };
        }
        if (this.dom.saveLoadModal) {
            this.dom.saveLoadModal.onclick = (e) => {
                if (e.target === this.dom.saveLoadModal) this.closeSaveLoadModal();
            };
        }
        if (this.dom.modalSaveName) {
            this.dom.modalSaveName.oninput = () => {
                this.modalSelectedSaveName = this.dom.modalSaveName.value;
                this.renderSaveList();
            };
        }
        
        // Set initial button states
        this.updateControls(this.simulation.status);
    }

    /**
     * Handles dragging a "Variable" from the side panel onto the Canvas.
     */
    setupDragDrop() {
        const c = this.dom.container;
        
        // Allow dropping logic
        c.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'copy';
        });

        // Handle the actual Drop
        c.addEventListener('drop', (e) => {
            e.preventDefault();
            const rawData = e.dataTransfer.getData('application/json');
            if(!rawData) return;

            let data;
            try { data = JSON.parse(rawData); } catch(err) { return; }
            
            // If the user dropped a variable, calculate where it landed
            if (data.type === 'variable' || data.type === 'custom-event') {
                const rect = c.getBoundingClientRect();
                // Convert Screen Coords -> Graph Coords (accounting for Pan/Zoom)
                const x = (e.clientX - rect.left - this.graph.pan.x) / this.graph.scale;
                const y = (e.clientY - rect.top - this.graph.pan.y) / this.graph.scale;

                if (data.type === 'custom-event') {
                    this.showCustomEventMenu(e.clientX, e.clientY, data.name, x, y);
                } else {
                    // Open the specific "Get vs Set" menu
                    this.showVariableMenu(e.clientX, e.clientY, data.name, x, y);
                }
            }
        });
    }

    /**
     * A specialized Context Menu for Variables.
     * Asks the user: "Do you want to GET this variable or SET it?"
     */
    showVariableMenu(mx, my, varName, gx, gy) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;

        // 1. Boundary Checks (keep menu inside screen)
        let drawX = mx; let drawY = my;
        if(mx + 150 > window.innerWidth) drawX -= 150;
        if(my + 100 > window.innerHeight) drawY -= 100;

        // 2. Show the Menu
        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        menu.classList.add('visible');
        
        // Hide search for this specific menu (we only have 2 options)
        if(search) search.style.display = 'none';
        if(this.dom.contextControls) this.dom.contextControls.style.display = 'none';
        list.innerHTML = '';

        // Helper to create the menu items
        const createOption = (label, isSet) => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerText = label;
            li.onclick = () => {
                // Ask VariableManager for the JSON template
                const template = isSet 
                    ? this.variableManager.createSetTemplate(varName)
                    : this.variableManager.createGetTemplate(varName);
                
                if (template) {
                    const node = this.graph.addNode(template, gx, gy);
                    
                    // CRITICAL: Inject the variable name into the node instance
                    // This allows the simulation to know WHICH variable to get/set
                    node.varName = varName; 

                    // Create DOM and attach Interaction listeners (Drag/Select)
                    this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
                }
                menu.classList.remove('visible');
            };
            list.appendChild(li);
        };

        // 3. Add the two options
        createOption(`Get ${varName}`, false);
        createOption(`Set ${varName}`, true);
    }

    showCustomEventMenu(mx, my, eventName, gx, gy) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;

        let drawX = mx; let drawY = my;
        if(mx + 170 > window.innerWidth) drawX -= 170;
        if(my + 100 > window.innerHeight) drawY -= 100;

        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        menu.classList.add('visible');

        if(search) search.style.display = 'none';
        if(this.dom.contextControls) this.dom.contextControls.style.display = 'none';
        list.innerHTML = '';

        const createOption = (label, makeTemplate) => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerText = label;
            li.onclick = () => {
                const template = makeTemplate();
                if (template) {
                    const node = this.graph.addNode(template, gx, gy);
                    if (template.customEventName) node.customEventName = template.customEventName;
                    this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
                }
                menu.classList.remove('visible');
            };
            list.appendChild(li);
        };

        createOption(`Custom Event ${eventName}`, () => this.variableManager.createCustomEventTemplate(eventName));
        createOption(`Call ${eventName}`, () => this.variableManager.createCallCustomEventTemplate(eventName));
    }

    openSaveLoadModal(mode) {
        this.modalMode = mode === 'load' ? 'load' : 'save';
        if (!this.dom.saveLoadModal) return;

        const loadableNames = Object.keys(this.getLoadableProjectSaves());

        if (this.modalMode === 'save') {
            if (this.dom.modalTitle) this.dom.modalTitle.innerText = 'Save Graph';
            if (this.dom.modalSaveNameRow) this.dom.modalSaveNameRow.style.display = 'flex';
            if (this.dom.btnModalConfirm) this.dom.btnModalConfirm.innerText = 'Save';
            if (this.dom.btnModalDelete) this.dom.btnModalDelete.style.display = 'none';
            const initialName = this.isBuiltinSaveName(this.currentSaveName)
                ? this.defaultSaveName
                : (this.currentSaveName || this.defaultSaveName);
            this.modalSelectedSaveName = initialName;
            if (this.dom.modalSaveName) {
                this.dom.modalSaveName.value = initialName;
                this.dom.modalSaveName.focus();
                this.dom.modalSaveName.select();
            }
        } else {
            if (this.dom.modalTitle) this.dom.modalTitle.innerText = 'Load Graph';
            if (this.dom.modalSaveNameRow) this.dom.modalSaveNameRow.style.display = 'none';
            if (this.dom.btnModalConfirm) this.dom.btnModalConfirm.innerText = 'Load';
            if (this.dom.btnModalDelete) this.dom.btnModalDelete.style.display = 'inline-flex';
            this.modalSelectedSaveName = loadableNames.includes(this.currentSaveName)
                ? this.currentSaveName
                : (loadableNames[0] || null);
        }

        this.renderSaveList();
        this.dom.saveLoadModal.classList.add('visible');
    }

    closeSaveLoadModal() {
        if (!this.dom.saveLoadModal) return;
        this.dom.saveLoadModal.classList.remove('visible');
        this.modalMode = null;
        this.modalSelectedSaveName = null;
    }

    renderSaveList() {
        const list = this.dom.modalSaveList;
        if (!list) return;
        list.innerHTML = '';

        const localSaves = this.getProjectSaves();
        const builtinSavesMap = this.getBuiltinProjectSaves();

        const entries = [];
        if (this.modalMode === 'save') {
            Object.keys(localSaves).forEach((name) => {
                entries.push({ name, isBuiltin: false });
            });
        } else {
            Object.keys(builtinSavesMap).forEach((name) => {
                entries.push({ name, isBuiltin: true });
            });
            Object.keys(localSaves).forEach((name) => {
                if (Object.prototype.hasOwnProperty.call(builtinSavesMap, name)) return;
                entries.push({ name, isBuiltin: false });
            });
        }

        entries.sort((a, b) => {
            if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
            if (a.name === this.defaultBuiltinSaveName && b.name !== this.defaultBuiltinSaveName) return -1;
            if (b.name === this.defaultBuiltinSaveName && a.name !== this.defaultBuiltinSaveName) return 1;
            if (a.name === this.defaultSaveName && b.name !== this.defaultSaveName) return -1;
            if (b.name === this.defaultSaveName && a.name !== this.defaultSaveName) return 1;
            return a.name.localeCompare(b.name);
        });

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'save-item';
            empty.style.opacity = '0.65';
            empty.style.cursor = 'default';
            empty.innerText = 'No saves yet';
            list.appendChild(empty);
        } else {
            entries.forEach((entry) => {
                const name = entry.name;
                const item = document.createElement('div');
                item.className = `save-item ${this.modalSelectedSaveName === name ? 'selected' : ''} ${entry.isBuiltin ? 'builtin' : ''}`;
                item.innerText = entry.isBuiltin ? `${name} (Demo)` : name;
                item.onclick = () => {
                    this.modalSelectedSaveName = name;
                    if (this.modalMode === 'save' && this.dom.modalSaveName) {
                        this.dom.modalSaveName.value = name;
                    }
                    this.renderSaveList();
                };
                list.appendChild(item);
            });
        }

        if (this.dom.btnModalConfirm) {
            if (this.modalMode === 'load') {
                this.dom.btnModalConfirm.disabled = !this.modalSelectedSaveName;
            } else {
                const entered = this.dom.modalSaveName ? this.dom.modalSaveName.value.trim() : '';
                const hasName = entered.length > 0;
                const isReadonlyName = this.isBuiltinSaveName(entered);
                this.dom.btnModalConfirm.disabled = !hasName || isReadonlyName;
            }
        }
        if (this.dom.btnModalDelete) {
            const isBuiltinSelected = this.modalSelectedSaveName && this.isBuiltinSaveName(this.modalSelectedSaveName);
            this.dom.btnModalDelete.disabled = !(this.modalMode === 'load' && this.modalSelectedSaveName && !isBuiltinSelected);
        }
    }

    getBuiltinProjectSaves() {
        const saves = this.builtinSaveConfig && this.builtinSaveConfig.saves;
        if (!saves || typeof saves !== 'object') return {};
        return saves;
    }

    getLoadableProjectSaves() {
        const localSaves = this.getProjectSaves();
        const builtinSavesMap = this.getBuiltinProjectSaves();
        return { ...localSaves, ...builtinSavesMap };
    }

    isBuiltinSaveName(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        const builtinSavesMap = this.getBuiltinProjectSaves();
        return Object.prototype.hasOwnProperty.call(builtinSavesMap, trimmed);
    }

    getProjectSaves() {
        try {
            const raw = localStorage.getItem(this.saveStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            return {};
        }
    }

    setProjectSaves(saves) {
        try {
            localStorage.setItem(this.saveStorageKey, JSON.stringify(saves || {}));
        } catch (err) {
        }
    }

    serializeProject() {
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            ...this.variableManager.serializeDefinitions(),
            graph: this.graph.toJSON()
        };
    }

    saveProject(name, silent = false) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        if (this.isBuiltinSaveName(trimmed)) {
            if (!silent) this.showNotification(`"${trimmed}" is read-only (demo)`);
            return false;
        }

        const saves = this.getProjectSaves();
        saves[trimmed] = this.serializeProject();
        this.setProjectSaves(saves);
        this.currentSaveName = trimmed;
        if (!silent) this.showNotification(`Saved "${trimmed}"`);
        return true;
    }

    deleteProject(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        if (this.isBuiltinSaveName(trimmed)) return false;
        const saves = this.getProjectSaves();
        if (!Object.prototype.hasOwnProperty.call(saves, trimmed)) return false;
        delete saves[trimmed];
        this.setProjectSaves(saves);
        if (this.currentSaveName === trimmed) {
            this.currentSaveName = this.defaultSaveName;
        }
        return true;
    }

    loadProject(name, silent = false) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        const loadable = this.getLoadableProjectSaves();
        const data = loadable[trimmed];
        if (!data) return false;

        this.applySerializedProject(data);
        this.currentSaveName = trimmed;
        if (!silent) this.showNotification(`Loaded "${trimmed}"`);
        return true;
    }

    applySerializedProject(data) {
        if (!data || typeof data !== 'object') return;

        if (this.simulation && this.simulation.status !== 'STOPPED') {
            this.simulation.stop();
        }

        this.graph.clear();
        if (this.dom.nodesLayer) this.dom.nodesLayer.innerHTML = '';
        if (this.dom.connectionsLayer) this.dom.connectionsLayer.innerHTML = '';

        this.variableManager.loadDefinitions({
            variables: Array.isArray(data.variables) ? data.variables : [],
            customEvents: Array.isArray(data.customEvents) ? data.customEvents : []
        });

        this._loadStarterGraph(data.graph || data);
    }

    /**
     * Updates the Toolbar buttons (Enabled/Disabled) based on the Simulation State.
     * @param {string} status - 'STOPPED', 'RUNNING', or 'PAUSED'
     */
    updateControls(status) {
        const d = this.dom;

        if (status === 'STOPPED') {
            if (d.btnReplay) d.btnReplay.disabled = true;
            if (d.btnStep) d.btnStep.disabled = false;
            if (d.btnStop) d.btnStop.disabled = true;
        } 
        else if (status === 'RUNNING') {
            if (d.btnReplay) d.btnReplay.disabled = true;
            if (d.btnStep) d.btnStep.disabled = true;
            if (d.btnStop) d.btnStop.disabled = false;
        } 
        else if (status === 'PAUSED') {
            if (d.btnReplay) d.btnReplay.disabled = !this.simulation.lastProcessedItem;
            if (d.btnStep) d.btnStep.disabled = false;
            if (d.btnStop) d.btnStop.disabled = false;
        }
    }

    /**
     * Reads Global Definitions (window.globalNodes) and prepares them.
     */
    importFileGlobals() {
        window.typeDefinitions = {};
        if (window.globalDataTypes) {
            window.globalDataTypes.forEach(t => window.typeDefinitions[t.name] = t);
        }
        window.nodeTemplates = [];
        if (window.globalNodes) {
            // Deep copy to prevent modifying the original definitions
            window.nodeTemplates = JSON.parse(JSON.stringify(window.globalNodes));
        }
    }

    initDemo() {
        const bootName = this.defaultBuiltinSaveName || this.defaultSaveName;
        const loaded = this.loadProject(bootName, true);
        if (!loaded) {
            this.applySerializedProject({
                variables: [],
                customEvents: [],
                graph: starterGraph
            });
            this.saveProject(this.defaultSaveName, true);
        }
    }

    _loadStarterGraph(serializedGraph) {
        if (!window.nodeTemplates) return;

        const nodes = Array.isArray(serializedGraph) ? serializedGraph : (serializedGraph.nodes || []);
        const connections = Array.isArray(serializedGraph) ? [] : (serializedGraph.connections || []);
        const viewport = Array.isArray(serializedGraph) ? null : (serializedGraph.viewport || null);

        if (viewport) {
            const nextScale = Number(viewport.scale);
            this.graph.scale = Number.isFinite(nextScale) ? Math.min(Math.max(nextScale, 0.2), 3) : 1;
            this.graph.pan.x = Number(viewport.x) || 0;
            this.graph.pan.y = Number(viewport.y) || 0;
        } else {
            this.graph.scale = 1;
            this.graph.pan.x = 0;
            this.graph.pan.y = 0;
        }

        if (this.variableManager) {
            nodes.forEach((nodeData) => {
                if (nodeData.customEventName) {
                    this.variableManager.ensureCustomEvent(nodeData.customEventName);
                }
            });
        }

        const idMap = new Map();
        nodes.forEach(nodeData => {
            const template = this._resolveTemplateForSerializedNode(nodeData);
            if (!template) return;

            const node = this.graph.addNode(template, nodeData.x || 0, nodeData.y || 0);
            idMap.set(nodeData.id, node.id);

            if (nodeData.varName) {
                node.varName = nodeData.varName;
            }
            if (nodeData.customEventName) {
                node.customEventName = nodeData.customEventName;
            }

            this._restoreDynamicPins(node, nodeData);
            this._restoreNodeState(node, nodeData);
            this.renderer.createNodeElement(node, (e, id) => this.interaction.handleNodeDown(e, id));
        });

        connections.forEach(conn => {
            const fromNode = idMap.get(conn.fromNode);
            const toNode = idMap.get(conn.toNode);
            if (!fromNode || !toNode) return;
            this._restoreConnectionWithLegacyPoints(fromNode, toNode, conn);
        });

        setTimeout(() => this.renderer.render(), 50);
    }

    _resolveTemplateForSerializedNode(nodeData) {
        if (nodeData.varName && this.variableManager) {
            if (nodeData.functionId === 'Variable.Get') return this.variableManager.createGetTemplate(nodeData.varName);
            if (nodeData.functionId === 'Variable.Set') return this.variableManager.createSetTemplate(nodeData.varName);
        }
        if (nodeData.customEventName && this.variableManager) {
            this.variableManager.ensureCustomEvent(nodeData.customEventName);
            if (nodeData.functionId === 'Flow.CustomEvent') return this.variableManager.createCustomEventTemplate(nodeData.customEventName);
            if (nodeData.functionId === 'Flow.CallCustomEvent') return this.variableManager.createCallCustomEventTemplate(nodeData.customEventName);
        }
        return (window.nodeTemplates || []).find(template => template.name === nodeData.name);
    }

    _getRerouteTemplateForType(connectionType) {
        const templates = Array.isArray(window.nodeTemplates) ? window.nodeTemplates : [];
        if (connectionType === 'exec') {
            return templates.find((template) => template.functionId === 'Flow.RerouteExec') || null;
        }
        return templates.find((template) => template.functionId === 'Flow.RerouteData') || null;
    }

    _createRerouteNode(connectionType, x, y) {
        const template = this._getRerouteTemplateForType(connectionType);
        if (!template) return null;

        const node = this.graph.addNode(template, x, y);
        if (connectionType !== 'exec') {
            node.inputs.forEach((pin) => {
                if (pin.type === 'wildcard') pin.setType(connectionType);
            });
            node.outputs.forEach((pin) => {
                if (pin.type === 'wildcard') pin.setType(connectionType);
            });
        }

        this.renderer.createNodeElement(node, (e, id) => this.interaction.handleNodeDown(e, id));
        return node;
    }

    _restoreConnectionWithLegacyPoints(fromNodeId, toNodeId, serializedConnection) {
        if (!serializedConnection) return;

        const points = Array.isArray(serializedConnection.controlPoints)
            ? serializedConnection.controlPoints.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            : [];

        if (points.length === 0) {
            this.graph.addConnection(
                fromNodeId,
                serializedConnection.fromPin,
                toNodeId,
                serializedConnection.toPin,
                serializedConnection.type
            );
            return;
        }

        let sourceNodeId = fromNodeId;
        let sourcePinIndex = serializedConnection.fromPin;

        points.forEach((point) => {
            const reroute = this._createRerouteNode(serializedConnection.type, Number(point.x) || 0, Number(point.y) || 0);
            if (!reroute) return;

            this.graph.addConnection(sourceNodeId, sourcePinIndex, reroute.id, 0, serializedConnection.type);
            sourceNodeId = reroute.id;
            sourcePinIndex = 0;
        });

        this.graph.addConnection(
            sourceNodeId,
            sourcePinIndex,
            toNodeId,
            serializedConnection.toPin,
            serializedConnection.type
        );
    }

    _restoreNodeState(node, nodeData) {
        node.breakpoint = !!nodeData.breakpoint;

        if (nodeData.pinTypes) {
            ['inputs', 'outputs'].forEach(dir => {
                const pins = nodeData.pinTypes[dir];
                if (!pins) return;

                pins.forEach((type, index) => {
                    if (node[dir][index] && type) {
                        node[dir][index].setType(type);
                    }
                });
            });
        }

        if (nodeData.inputs) {
            nodeData.inputs.forEach((savedPin, index) => {
                const pin = node.inputs[index];
                if (!pin || savedPin.value === undefined) return;
                pin.value = savedPin.value;
                if (pin.widget) pin.widget.value = savedPin.value;
            });
        }
    }

    _restoreDynamicPins(node, nodeData) {
        if (!node || !nodeData) return;
        if (typeof node.addMakeArrayPin !== 'function') return;

        const pinTypeCount = nodeData.pinTypes && Array.isArray(nodeData.pinTypes.inputs)
            ? nodeData.pinTypes.inputs.length
            : 0;
        const savedInputCount = Array.isArray(nodeData.inputs) ? nodeData.inputs.length : 0;
        const explicitCount = Number(nodeData.dynamicInputCount);
        const requestedCount = Number.isFinite(explicitCount)
            ? explicitCount
            : Math.max(pinTypeCount, savedInputCount);

        while (node.inputs.length < requestedCount) {
            node.addMakeArrayPin();
        }
    }

    showNotification(message) {
        const el = document.getElementById('notification');
        if (!el) return;
        el.innerText = message;
        el.style.opacity = '1';
        setTimeout(() => {
            el.style.opacity = '0';
        }, 1400);
    }
}
