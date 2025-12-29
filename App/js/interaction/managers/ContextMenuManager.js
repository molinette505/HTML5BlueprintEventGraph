/**
 * ContextMenuManager
 * Responsible for the visual presentation and logic of the right-click context menu.
 * It handles:
 * 1. Positioning the menu so it stays on screen.
 * 2. Switching modes (Node actions vs. Pin actions vs. Node Creation).
 * 3. Filtering/Searching available nodes.
 * 4. Categorizing nodes in the creation list.
 */
class ContextMenuManager {
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
        
        // Bind the search input listener immediately
        if (this.dom.search) {
            this.dom.search.oninput = (e) => this.filter(e.target.value);
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

        // --- 1. Position Logic (Boundary Check) ---
        // Ensure the menu doesn't flow off the right or bottom edge of the screen
        let drawX = x; 
        let drawY = y;
        if (x + 200 > window.innerWidth) drawX -= 200;  // Shift left if too far right
        if (y + 300 > window.innerHeight) drawY -= 300; // Shift up if too far down
        
        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        menu.classList.add('visible'); // CSS class to fade/pop it in

        // --- 2. Reset Content ---
        if (list) list.innerHTML = '';

        // --- 3. Render Content based on Context ---
        
        // CASE A: Right-clicked a Pin (Input/Output circle)
        if (type === 'pin') {
            if(search) search.style.display = 'none'; // No search needed for pin actions
            this._buildPinMenu(graph, targetId, pinIndex, pinDir);
        } 
        
        // CASE B: Right-clicked a Node header/body
        else if (type === 'node') {
            if(search) search.style.display = 'none'; // No search needed for node actions
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

            // Math: Convert Screen Coordinates (Pixels) -> Graph Coordinates (World Space)
            // formula: (Mouse - ContainerOffset - PanOffset) / Scale
            if (container) {
                const rect = container.getBoundingClientRect();
                this.activePos = {
                    x: (x - rect.left - graph.pan.x) / graph.scale,
                    y: (y - rect.top - graph.pan.y) / graph.scale
                };
            }

            // Add 'Paste' option at the very top
            const liPaste = document.createElement('li');
            liPaste.className = 'ctx-item';
            liPaste.innerHTML = `<span>Paste</span>`;
            liPaste.style.borderBottom = '1px solid #444'; // Visual separator
            liPaste.style.marginBottom = '5px';
            liPaste.onclick = () => {
                this.callbacks.onPaste(x, y);
                this.hide();
            };
            if(list) list.appendChild(liPaste);

            // Render the full list of available nodes from the global template
            this._renderNodeList(window.nodeTemplates || []);
        }
    }

    /**
     * Hides the menu by removing the CSS class.
     */
    hide() {
        if (this.dom.menu) {
            this.dom.menu.classList.remove('visible');
        }
    }

    /**
     * Filters the node list based on user search input.
     * @param {string} query - The search text
     */
    filter(query) {
        const lower = query.toLowerCase();
        // Filter the global templates array
        const filtered = (window.nodeTemplates || []).filter(n => n.name.toLowerCase().includes(lower));
        // Re-render list (passing 'true' for isSearching to disable categories)
        this._renderNodeList(filtered, !!query);
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
                li.onclick = () => {
                    this.callbacks.onPinChange(node, pin, t, pinIndex, dir);
                    this.hide();
                };
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
            li.onclick = () => { action(); this.hide(); };
            list.appendChild(li);
        };

        addItem('Copy', () => this.callbacks.onCopy());
        addItem('Cut', () => this.callbacks.onCut());

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
    _renderNodeList(items, isSearching = false) {
        const list = this.dom.list;
        if (!list) return;
        
        // Clear list if we are rebuilding it (filtering)
        if (!isSearching) list.innerHTML = ''; 

        // CASE 1: Standard View (Categorized)
        if (!isSearching) {
            // Group items by their 'category' property
            const grouped = {};
            items.forEach(tmpl => {
                const cat = tmpl.category || "General";
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(tmpl);
            });

            // Sort categories alphabetically
            Object.keys(grouped).sort().forEach(cat => {
                // Create Category Header (Folder)
                const header = document.createElement('li');
                header.className = `ctx-category ${this.collapsedCategories.has(cat) ? 'collapsed' : ''}`;
                header.innerText = cat;
                
                // Toggle Collapse State on Click
                header.onclick = (e) => {
                    e.stopPropagation();
                    if (this.collapsedCategories.has(cat)) this.collapsedCategories.delete(cat);
                    else this.collapsedCategories.add(cat);
                    this._renderNodeList(items, false); // Re-render to show/hide items
                };
                list.appendChild(header);

                // If not collapsed, render the items inside this category
                if (!this.collapsedCategories.has(cat)) {
                    grouped[cat].forEach(tmpl => this._createMenuItem(tmpl, true));
                }
            });
        } 
        // CASE 2: Search View (Flat List)
        else {
            // Clear list if user just started typing
            if(this.dom.search && this.dom.search.value !== '') list.innerHTML = '';
            items.forEach(tmpl => this._createMenuItem(tmpl, false));
        }
    }

    /**
     * Creates a single clickable menu item for a Node Template.
     */
    _createMenuItem(tmpl, isIndent) {
        const list = this.dom.list;
        if (!list) return;

        const li = document.createElement('li');
        // Add 'ctx-folder' class to indent items if they are inside a category
        li.className = `ctx-item ${isIndent ? 'ctx-folder' : ''}`;
        
        // Check if node is Flow (Exec) or Pure Data for visual hint
        const isFlow = (tmpl.outputs || []).some(o => o.type === 'exec');
        li.innerHTML = `<span>${tmpl.name}</span> <span style="font-size:10px; opacity:0.5">${isFlow ? 'Flow' : 'Data'}</span>`;
        
        // Click -> Trigger Spawn Callback
        li.onclick = () => {
            this.callbacks.onSpawn(tmpl, this.activePos.x, this.activePos.y);
            this.hide();
        };
        list.appendChild(li);
    }
}