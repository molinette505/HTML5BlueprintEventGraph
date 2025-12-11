/**
 * Widget Class
 * Represents the state and configuration of a UI control (widget) attached to a Pin.
 * This is the "Model" for the widget. The "View" is handled by WidgetRenderer.js.
 * * Common widget types: 'text', 'number', 'checkbox', 'dropdown', 'vector3', 'color'.
 */
class Widget {
    /**
     * @param {String} type - The type of widget (e.g., 'number', 'dropdown').
     * @param {any} value - The initial value (e.g., 0, "Hello", true).
     * @param {Array<String>} options - Optional array of strings for 'dropdown' widgets.
     */
    constructor(type, value, options = []) {
        this.type = type;       
        this.value = value;     
        this.options = options; 
    }
}