/**
 * Widget Class
 * Represents the state and configuration of a UI control (widget) attached to a Pin.
 * This acts as the "Model" for the widget. The visual "View" is handled by WidgetRenderer.js.
 * Common widget types include: 'text', 'number', 'checkbox', 'dropdown', 'vector3', 'color'.
 */
class Widget {
    /**
     * Initializes a new Widget model.
     * @param {String} widgetType - The identifier for the type of widget (e.g., 'number', 'dropdown').
     * @param {any} initialValue - The initial value held by the widget (e.g., 0, "Hello", true).
     * @param {Array<String>} dropdownOptions - Optional array of strings used only for 'dropdown' widgets.
     */
    constructor(widgetType, initialValue, dropdownOptions = []) {
        this.type = widgetType;       
        this.value = initialValue;     
        this.options = dropdownOptions; 
    }
}