import { contextSensitiveNodeConfig, findBestInputForSpawn, findBestOutputForSpawn, scoreTemplateForSpawn } from "./ContextSensitiveConfig";

/**
 * ContextMenuManager
 * Responsible for the visual presentation and logic of the right-click context menu.
 * It handles:
 * 1. Positioning the menu so it stays on screen.
 * 2. Switching modes (Node actions vs. Pin actions vs. Node Creation).
 * 3. Filtering/Searching available nodes.
 * 4. Categorizing nodes in the creation list.
 */
export class ContextMenuManager {
    /**
     * @param {Object} dom - Object containing references to HTML elements { menu, list, search, container }.
     * @param {Object} callbacks - Functions from Interaction.js to trigger actions (onSpawn, onDelete, etc.).
     */
    constructor(dom, callbacks) {
        this.dom = dom;
        this.callbacks = callbacks; 
        
        // Stores the graph coordinates where the right-click happened (for spawning nodes)
        this.activePos = { x: 0, y: 0 }; 
        
        // Keeps track of which categories (e.g., "Math", "Logic") are closed in the menu
        this.collapsedCategories = new Set();
        this.menuAnchor = { x: 0, y: 0 };

        this.activeCanvasContext = null;
        this.contextSettingKey = "blueprint.contextSensitive.enabled";
        this.contextSensitiveEnabled = this._loadContextSensitiveSetting();
        this.suppressClickUntil = 0;
        
        // Bind the search input listener immediately
        if (this.dom.search) {
            this.dom.search.oninput = (e) => this.filter(e.target.value);
        }

        if (this.dom.contextSensitiveToggle) {
            this.dom.contextSensitiveToggle.checked = this.contextSensitiveEnabled;
            this.dom.contextSensitiveToggle.onchange = (e) => {
                this.contextSensitiveEnabled = !!e.target.checked;
                this._saveContextSensitiveSetting();
                if (this.activeCanvasContext) {
                    this._renderCanvasNodeList(this.dom.search ? this.dom.search.value : "");
                }
            };
        }

        if (this.dom.menu) {
            this.dom.menu.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            this.dom.menu.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
            this.dom.menu.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
        }
    }

    /**
     * Main entry point to display the menu.
     * @param {number} x - Mouse Client X (Screen coordinates)
     * @param {number} y - Mouse Client Y (Screen coordinates)
     * @param {string} type - Context type: 'pin', 'node', or 'canvas' (default)
     * @param {Object} contextData - Extra data needed for the context (graph, targetId, etc.)
     */
    show(x, y, type, contextData = {}) {
        const { menu, list, search, container } = this.dom;
        const { graph, targetId, pinIndex, pinDir } = contextData;

        // Safety check to prevent crashing if DOM isn't ready
        if (!menu) {
            console.error("ContextMenuManager: 'menu' DOM element is missing.");
            return;
        }

        this.menuAnchor = { x, y };
        menu.style.maxHeight = `${Math.min(400, Math.max(160, window.innerHeight - 16))}px`;
        menu.classList.add('visible'); // CSS class to fade/pop it in

        // --- 2. Reset Content ---
        if (list) list.innerHTML = '';

        // --- 3. Render Content based on Context ---
        
        // CASE A: Right-clicked a Pin (Input/Output circle)
        if (type === 'pin') {
            if(search) search.style.display = 'none'; // No search needed for pin actions
            this._setCanvasControlsVisible(false);
            this.activeCanvasContext = null;
            this._buildPinMenu(graph, targetId, pinIndex, pinDir);
        } 
        
        // CASE B: Right-clicked a Node header/body
        else if (type === 'node') {
            if(search) search.style.display = 'none'; // No search needed for node actions
            this._setCanvasControlsVisible(false);
            this.activeCanvasContext = null;
            this._buildNodeMenu(targetId, contextData.selectedCount);
        } 
        
        // CASE C: Right-clicked the empty Canvas (Create Node)
        else {
            // Show and reset search bar
            if(search) {
                search.style.display = 'block';
                search.value = '';
                // Small delay to ensure CSS transition finishes before focusing
                setTimeout(() => search.focus(), 50);
            }
            this._setCanvasControlsVisible(true);

            // Math: Convert Screen Coordinates (Pixels) -> Graph Coordinates (World Space)
            // formula: (Mouse - ContainerOffset - PanOffset) / Scale
            if (container) {
                const rect = container.getBoundingClientRect();
                this.activePos = {
                    x: (x - rect.left - graph.pan.x) / graph.scale,
                    y: (y - rect.top - graph.pan.y) / graph.scale
                };
            }

            this.activeCanvasContext = {
                graph,
                clickPos: { x, y },
                spawnContext: contextData.spawnContext || null
            };

            this._renderCanvasNodeList('');
        }

        this._positionMenuWithinViewport();
    }

    /**
     * Hides the menu by removing the CSS class.
     */
    hide() {
        if (this.dom.menu) {
            this.dom.menu.classList.remove('visible');
        }
        this.activeCanvasContext = null;
        if (this.callbacks.onHide) {
            this.callbacks.onHide();
        }
    }

    /**
     * Filters the node list based on user search input.
     * @param {string} query - The search text
     */
    filter(query) {
        if (!this.activeCanvasContext) return;
        this._renderCanvasNodeList(query || "");
    }

    // =========================================
    //           INTERNAL BUILDERS
    // =========================================

    /**
     * Builds the menu options for modifying a Pin (e.g., changing type from Int to Float).
     */
    _buildPinMenu(graph, nodeId, pinIndex, dir) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // Identify the specific pin data object
        const pin = (dir === 'input') ? node.inputs[pinIndex] : node.outputs[pinIndex];
        const list = this.dom.list;

        // Only show if the pin actually supports multiple types
        if (pin && pin.allowedTypes && list) {
            // Header
            const head = document.createElement('li');
            head.className = 'ctx-item';
            head.style.fontWeight = 'bold';
            head.style.cursor = 'default';
            head.innerHTML = `<span>Change Pin Type</span>`;
            list.appendChild(head);

            // Generate an option for every allowed type
            pin.allowedTypes.forEach(t => {
                const li = document.createElement('li');
                li.className = 'ctx-item';
                
                // Add a checkmark if it's the current type
                const check = (t === pin.type) ? "✓ " : "";
                
                // Find color for the type label
                const typeDef = (window.globalDataTypes || []).find(g => g.name === t);
                const colorVar = typeDef ? typeDef.color : '#fff';

                li.innerHTML = `<span style="color:${colorVar}">${check}${t.toUpperCase()}</span>`;
                this._bindMenuAction(li, () => {
                    this.callbacks.onPinChange(node, pin, t, pinIndex, dir);
                    this.hide();
                });
                list.appendChild(li);
            });
        }
    }

    /**
     * Builds the menu options for Node operations (Copy, Cut, Delete).
     */
    _buildNodeMenu(targetId, selectedCount = 1) {
        const list = this.dom.list;
        if (!list) return;

        // Helper to add list item
        const addItem = (label, action, color = null) => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            const style = color ? `style="color:${color}"` : '';
            li.innerHTML = `<span ${style}>${label}</span>`;
            this._bindMenuAction(li, () => {
                action();
                this.hide();
            });
            list.appendChild(li);
        };

        addItem('Copy', () => this.callbacks.onCopy());
        addItem('Cut', () => this.callbacks.onCut());

        if (this.callbacks.onToggleBreakpoint) {
            const bpState = this.callbacks.getBreakpointState
                ? this.callbacks.getBreakpointState(targetId, selectedCount)
                : null;
            const count = bpState && Number.isFinite(bpState.count) ? bpState.count : (selectedCount > 1 ? selectedCount : 1);
            const hasAnyWithoutBreakpoint = bpState ? !!bpState.hasAnyWithoutBreakpoint : true;
            const label = hasAnyWithoutBreakpoint
                ? `Add ${count > 1 ? 'Breakpoints' : 'Breakpoint'}`
                : `Remove ${count > 1 ? 'Breakpoints' : 'Breakpoint'}`;
            addItem(label, () => this.callbacks.onToggleBreakpoint(targetId));
        }

        // Dynamic label: "Delete Node" vs "Delete 5 Nodes"
        const count = selectedCount > 1 ? selectedCount : 1;
        const delLabel = `Delete ${count > 1 ? count + ' Nodes' : 'Node'}`;
        
        // Pass targetId in case we right-clicked a node that wasn't previously selected
        addItem(delLabel, () => this.callbacks.onDelete(targetId), 'var(--danger-color)');
    }

    /**
     * Renders the list of create-able nodes.
     * Handles Categorization (Folders) vs Flat List (Search Results).
     */
    _renderNodeList(items, options = {}) {
        const list = this.dom.list;
        if (!list) return;
        
        const isSearching = !!options.isSearching;
        const contextualSpawn = !!options.contextualSpawn;

        list.innerHTML = '';

        if (items.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ctx-item';
            empty.style.opacity = '0.75';
            empty.style.cursor = 'default';
            empty.innerHTML = `<span>No matching nodes</span>`;
            list.appendChild(empty);
            return;
        }

        if (!isSearching) {
            // Group items by their 'category' property
            const grouped = {};
            items.forEach(item => {
                const tmpl = item.template;
                const cat = tmpl.category || "General";
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(item);
            });

            const categorySort = Object.keys(grouped).sort((a, b) => {
                const rootA = this._getCategoryRoot(a);
                const rootB = this._getCategoryRoot(b);
                if (rootA === "My Blueprint" && rootB !== "My Blueprint") return 1;
                if (rootB === "My Blueprint" && rootA !== "My Blueprint") return -1;

                if (!contextualSpawn) return a.localeCompare(b);
                const scoreA = Math.max(...grouped[a].map(entry => entry.score || 0));
                const scoreB = Math.max(...grouped[b].map(entry => entry.score || 0));
                if (scoreA !== scoreB) return scoreB - scoreA;
                return a.localeCompare(b);
            });

            categorySort.forEach(cat => {
                // Create Category Header (Folder)
                const header = document.createElement('li');
                header.className = `ctx-category ${this.collapsedCategories.has(cat) ? 'collapsed' : ''}`;
                header.innerText = cat;
                
                // Toggle Collapse State on Click
                header.onclick = (e) => {
                    e.stopPropagation();
                    if (this.collapsedCategories.has(cat)) this.collapsedCategories.delete(cat);
                    else this.collapsedCategories.add(cat);
                    this._renderCanvasNodeList(this.dom.search ? this.dom.search.value : "");
                };
                list.appendChild(header);

                // If not collapsed, render the items inside this category
                if (!this.collapsedCategories.has(cat)) {
                    grouped[cat]
                        .sort((a, b) => {
                            const explicitOrderA = this._getEntryExplicitOrder(a, cat);
                            const explicitOrderB = this._getEntryExplicitOrder(b, cat);
                            if (explicitOrderA !== explicitOrderB) return explicitOrderA - explicitOrderB;
                            if (contextualSpawn && a.score !== b.score) return b.score - a.score;
                            return a.template.name.localeCompare(b.template.name);
                        })
                        .forEach(entry => this._createMenuItem(entry, true));
                }
            });
            this._positionMenuWithinViewport();
            return;
        }

        const sorted = items
            .slice()
            .sort((a, b) => {
                const explicitOrderA = this._getEntryExplicitOrder(a, null);
                const explicitOrderB = this._getEntryExplicitOrder(b, null);
                if (explicitOrderA !== explicitOrderB) return explicitOrderA - explicitOrderB;
                if (contextualSpawn && a.score !== b.score) return b.score - a.score;
                return a.template.name.localeCompare(b.template.name);
            });
        sorted.forEach(entry => this._createMenuItem(entry, false));
        this._positionMenuWithinViewport();
    }

    /**
     * Creates a single clickable menu item for a Node Template.
     */
    _createMenuItem(entry, isIndent) {
        const list = this.dom.list;
        if (!list) return;

        const tmpl = entry.template;
        const isRerouteAction = tmpl.functionId === 'Internal.AddRerouteNode';
        const li = document.createElement('li');
        // Add 'ctx-folder' class to indent items if they are inside a category
        li.className = `ctx-item ${isIndent ? 'ctx-folder' : ''}`;
        
        // Check if node is Flow (Exec) or Pure Data for visual hint
        const isFlow = isRerouteAction
            ? (entry.spawnDataType === 'exec')
            : (tmpl.outputs || []).some(o => o.type === 'exec');
        li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow ? 'Flow' : 'Data'}</span>`;
        
        // Click -> Trigger Spawn Callback
        this._bindMenuAction(li, () => {
            const spawnContext = this.activeCanvasContext && this.activeCanvasContext.spawnContext
                ? { ...this.activeCanvasContext.spawnContext }
                : null;
            if (spawnContext && entry.compatibility) {
                if (spawnContext.sourceType === 'output') {
                    spawnContext.preferredInputIndex = entry.compatibility.index;
                } else {
                    spawnContext.preferredOutputIndex = entry.compatibility.index;
                }
            }
            if (isRerouteAction && this.callbacks.onSpawnReroute) {
                this.callbacks.onSpawnReroute(this.activePos.x, this.activePos.y, spawnContext);
            } else {
                this.callbacks.onSpawn(tmpl, this.activePos.x, this.activePos.y, spawnContext);
            }
            this.hide();
        });
        list.appendChild(li);
    }

    _setCanvasControlsVisible(isVisible) {
        if (this.dom.contextControls) {
            this.dom.contextControls.style.display = isVisible ? 'flex' : 'none';
        }
        if (this.dom.contextSensitiveToggle) {
            this.dom.contextSensitiveToggle.checked = this.contextSensitiveEnabled;
        }
    }

    _renderCanvasNodeList(query = "") {
        const list = this.dom.list;
        if (!list || !this.activeCanvasContext) return;

        const lower = query.toLowerCase();
        const spawnContext = this.activeCanvasContext.spawnContext;
        const contextualSpawn = !!spawnContext && this.contextSensitiveEnabled;
        const allTemplates = this._collectContextTemplates();
        const entries = [];

        allTemplates.forEach(template => {
            if (lower && !template.name.toLowerCase().includes(lower)) return;

            let compatibility = null;
            if (spawnContext) {
                compatibility = spawnContext.sourceType === 'output'
                    ? findBestInputForSpawn(template, spawnContext)
                    : findBestOutputForSpawn(template, spawnContext);
            }
            if (contextualSpawn && !compatibility) return;

            entries.push({
                template,
                compatibility,
                score: contextualSpawn ? scoreTemplateForSpawn(template, spawnContext, compatibility) : 0
            });
        });

        if (spawnContext) {
            const rerouteActionName = 'Add Reroute Node';
            if (!lower || rerouteActionName.toLowerCase().includes(lower)) {
                entries.unshift({
                    template: {
                        name: rerouteActionName,
                        category: 'Misc',
                        functionId: 'Internal.AddRerouteNode'
                    },
                    compatibility: { index: 0 },
                    spawnDataType: spawnContext.dataType || 'wildcard',
                    score: 10000
                });
            }
        }

        const shouldShowPaste = !spawnContext && !query;
        const options = {
            isSearching: !!query,
            contextualSpawn
        };

        this._renderNodeList(entries, options);

        if (shouldShowPaste) {
            const liPaste = document.createElement('li');
            liPaste.className = 'ctx-item';
            liPaste.innerHTML = `<span>Paste</span>`;
            liPaste.style.borderBottom = '1px solid #444';
            liPaste.style.marginBottom = '5px';
            this._bindMenuAction(liPaste, () => {
                this.callbacks.onPaste(this.activeCanvasContext.clickPos.x, this.activeCanvasContext.clickPos.y);
                this.hide();
            });
            list.insertBefore(liPaste, list.firstChild);
        }
        this._positionMenuWithinViewport();
    }

    _collectContextTemplates() {
        const templates = Array.isArray(window.nodeTemplates) ? [...window.nodeTemplates] : [];
        return templates
            .filter(template => !template.hiddenInContextMenu)
            .concat(this._buildCustomEventContextTemplates())
            .concat(this._buildVariableContextTemplates());
    }

    _buildCustomEventContextTemplates() {
        const variableManager = window.App && window.App.variableManager;
        if (!variableManager || !Array.isArray(variableManager.customEvents)) return [];

        const templates = [];
        variableManager.customEvents.forEach((evt, index) => {
            const eventTemplate = variableManager.createCustomEventTemplate(evt.name);
            if (eventTemplate) {
                eventTemplate.__ctxOrder = (index * 2);
                templates.push(eventTemplate);
            }

            const callTemplate = variableManager.createCallCustomEventTemplate(evt.name);
            if (callTemplate) {
                callTemplate.__ctxOrder = (index * 2) + 1;
                templates.push(callTemplate);
            }
        });
        return templates;
    }

    _buildVariableContextTemplates() {
        const variableManager = window.App && window.App.variableManager;
        if (!variableManager || !Array.isArray(variableManager.variables)) return [];

        const templates = [];
        variableManager.variables.forEach((variable, index) => {
            const getTemplate = variableManager.createGetTemplate(variable.name);
            if (getTemplate) {
                if (!getTemplate.category) getTemplate.category = "My Blueprint";
                getTemplate.__ctxOrder = (index * 2);
                templates.push(getTemplate);
            }

            const setTemplate = variableManager.createSetTemplate(variable.name);
            if (setTemplate) {
                if (!setTemplate.category) setTemplate.category = "My Blueprint";
                setTemplate.__ctxOrder = (index * 2) + 1;
                templates.push(setTemplate);
            }
        });
        return templates;
    }

    _getCategoryRoot(categoryName) {
        if (!categoryName) return "General";
        return String(categoryName).split("|")[0].trim();
    }

    _getEntryExplicitOrder(entry, categoryName) {
        const template = entry && entry.template ? entry.template : null;
        if (!template) return Number.MAX_SAFE_INTEGER;

        if (typeof template.__ctxOrder === "number") {
            return template.__ctxOrder;
        }

        const rootCategory = this._getCategoryRoot(categoryName || template.category || "General");
        if (rootCategory !== "Logic") return Number.MAX_SAFE_INTEGER;

        const logicOrder = {
            "Logic.And": 100,
            "Logic.Or": 101,
            "Logic.Not": 102,
            "Logic.Equal": 200,
            "Logic.NotEqual": 201,
            "Logic.StrictEqual": 202,
            "Logic.StrictNotEqual": 203,
            "Logic.Greater": 300,
            "Logic.GreaterEqual": 301,
            "Logic.Less": 302,
            "Logic.LessEqual": 303
        };

        const functionId = template.functionId || "";
        if (Object.prototype.hasOwnProperty.call(logicOrder, functionId)) {
            return logicOrder[functionId];
        }
        return Number.MAX_SAFE_INTEGER;
    }

    _positionMenuWithinViewport() {
        const menu = this.dom.menu;
        if (!menu || !menu.classList.contains('visible')) return;

        const margin = 8;
        const width = menu.offsetWidth || 240;
        const height = menu.offsetHeight || 300;

        const maxX = Math.max(margin, window.innerWidth - width - margin);
        const maxY = Math.max(margin, window.innerHeight - height - margin);
        const clampedX = Math.max(margin, Math.min(this.menuAnchor.x, maxX));
        const clampedY = Math.max(margin, Math.min(this.menuAnchor.y, maxY));

        menu.style.left = `${clampedX}px`;
        menu.style.top = `${clampedY}px`;
    }

    _loadContextSensitiveSetting() {
        try {
            const raw = localStorage.getItem(this.contextSettingKey);
            if (raw === "true") return true;
            if (raw === "false") return false;
        } catch (err) {
        }
        return !!contextSensitiveNodeConfig.enabledByDefault;
    }

    _saveContextSensitiveSetting() {
        try {
            localStorage.setItem(this.contextSettingKey, String(this.contextSensitiveEnabled));
        } catch (err) {
        }
    }

    _bindMenuAction(element, action) {
        if (!element) return;

        element.onclick = (e) => {
            if (e) e.stopPropagation();
            if (Date.now() < this.suppressClickUntil) return;
            action();
        };

        let touchStartX = 0;
        let touchStartY = 0;
        let touchMoved = false;

        element.addEventListener('touchstart', (e) => {
            const touch = e.changedTouches && e.changedTouches[0];
            if (!touch) return;
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchMoved = false;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            const touch = e.changedTouches && e.changedTouches[0];
            if (!touch) return;
            const distance = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);
            if (distance > 8) touchMoved = true;
        }, { passive: true });

        element.addEventListener('touchend', (e) => {
            e.stopPropagation();
            if (touchMoved) return;
            e.preventDefault();
            this.suppressClickUntil = Date.now() + 350;
            action();
        }, { passive: false });
    }
}
