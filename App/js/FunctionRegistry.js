/**
 * Function Registry
 * This object acts as a catalog of all executable logic available to the Blueprint system.
 * It maps 'functionId' strings (used in Node definitions) to actual JavaScript implementations.
 * * It also contains 'Visualizers' which format the output of nodes for debugging displays on the graph.
 */
window.FunctionRegistry = {
    
    // ==========================================================================================
    // VARIABLE OPERATIONS
    // These functions interact with the global VariableManager to Get/Set runtime state.
    // ==========================================================================================
    
    // Accessed via 'this.varName' because the calling context (the Node instance) is bound to these functions.
    "Variable.Get": function() {
        const variableManager = window.App.variableManager;
        // If the manager isn't ready or the node has no variable name assigned, return null.
        if (!variableManager || !this.varName) return null;
        
        return variableManager.runtimeValues[this.varName];
    },

    "Variable.Set": function(incomingValue) {
        const variableManager = window.App.variableManager;
        if (variableManager && this.varName) {
            variableManager.runtimeValues[this.varName] = incomingValue;
        }
        // Passthrough: The 'Set' node also outputs the value it just set.
        return incomingValue; 
    },

    // ==========================================================================================
    // DEBUGGING & VISUALIZATION
    // These helpers generate the small text previews shown on nodes after execution.
    // ==========================================================================================

    /**
     * formatting helper called by the NodeRenderer to display the last execution result.
     * @param {GraphNode} graphNode - The node being visualized.
     * @param {Array} inputValues - The values passed into the node.
     * @param {any} operationResult - The result produced by the node.
     */
    getVisualDebug: (graphNode, inputValues, operationResult) => {
        // Check if a specific visualizer exists for this function type
        const customVisualizer = window.FunctionRegistry.Visualizers[graphNode.functionId];
        
        if (customVisualizer) {
            try { 
                return customVisualizer(inputValues, operationResult, graphNode); 
            } catch(error) { 
                console.error("Visualizer Error", error); 
            }
        }

        // Default formatting if no custom visualizer is defined
        if (typeof operationResult === 'object' && operationResult !== null) {
            // Check for Vector format (x, y, z)
            if ('x' in operationResult && 'y' in operationResult && 'z' in operationResult) {
                return `(${operationResult.x.toFixed(1)}, ${operationResult.y.toFixed(1)}, ${operationResult.z.toFixed(1)})`;
            }
            // Check for Transform format (location, rotation)
            if ('loc' in operationResult && 'rot' in operationResult) {
                return `Trs(...)`;
            }
            return '{Obj}';
        }
        
        return String(operationResult);
    },

    /**
     * Dictionary of specific formatting functions for different node types.
     * Keys match the 'functionId' of the nodes.
     */
    Visualizers: {
        // Mathematical Operations with Detailed Expansion
        "Math.AddGeneric": (inputs, result) => formatMathVisualizer(inputs, result, '+'),
        "Math.SubtractGeneric": (inputs, result) => formatMathVisualizer(inputs, result, '-'),
        "Math.MultiplyGeneric": (inputs, result) => formatMathVisualizer(inputs, result, '×'),
        "Math.DivideGeneric": (inputs, result) => formatMathVisualizer(inputs, result, '÷'),
        
        // Logical Comparisons
        "Logic.Greater": (inputs, result) => `${formatValueForDisplay(inputs[0])} > ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        "Logic.Less": (inputs, result) => `${formatValueForDisplay(inputs[0])} < ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        "Logic.GreaterEqual": (inputs, result) => `${formatValueForDisplay(inputs[0])} >= ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        "Logic.LessEqual": (inputs, result) => `${formatValueForDisplay(inputs[0])} <= ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        "Logic.Equal": (inputs, result) => `${formatValueForDisplay(inputs[0])} == ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        "Logic.NotEqual": (inputs, result) => `${formatValueForDisplay(inputs[0])} != ${formatValueForDisplay(inputs[1])}\n---\n${result}`,
        
        // Vector Operations
        "Vector.Make": (inputs, result) => `Vec(${inputs[0]}, ${inputs[1]}, ${inputs[2]})\n---\n${formatValueForDisplay(result)}`,
        
        "Vector.Length": (inputs, result) => {
            const vector = inputs[0] || {x:0, y:0, z:0};
            // Shows calculation logic: sqrt(x^2 + y^2 + z^2)
            return `sqrt(${vector.x.toFixed(1)}² + ${vector.y.toFixed(1)}² + ${vector.z.toFixed(1)}²)\n---\n${formatValueForDisplay(result)}`;
        },
        
        // Type Conversions
        "Conv.FloatToInt": (inputs, result) => `${inputs[0]}\n⬇\n${result}`,
        "Conv.IntToFloat": (inputs, result) => `${inputs[0]}\n⬇\n${formatValueForDisplay(result)}`,
        "Conv.FloatToString": (inputs, result) => `${inputs[0]}\n⬇\n"${result}"`,
        "Conv.IntToString": (inputs, result) => `${inputs[0]}\n⬇\n"${result}"`,
        "Conv.BoolToString": (inputs, result) => `${inputs[0]}\n⬇\n"${result}"`,
        "Conv.VectorToString": (inputs, result) => `Vec\n⬇\n"${result}"`,

        // Variable Accessors
        "Variable.Get": (inputs, result, node) => `Get ${node.varName}\n---\n${formatValueForDisplay(result)}`,
        "Variable.Set": (inputs, result, node) => `Set ${node.varName}\n---\n${formatValueForDisplay(result)}`
    },

    // ==========================================================================================
    // EXECUTION LOGIC
    // These functions implement the actual behavior of the nodes during simulation.
    // ==========================================================================================

    // Flow Control
    "Flow.Print": (message) => { 
        console.log("%c[Blueprint Output]:", "color: cyan", message); 
        return message; 
    },
    
    "Flow.Branch": (condition) => {
        // Returns true/false to direct the Execution Flow to the appropriate output pin
        return !!condition;
    },

    // Generic Math (Handles both Numbers and Vectors via 'executePolymorphicOperation')
    "Math.AddGeneric": (leftOperand, rightOperand) => executePolymorphicOperation(leftOperand, rightOperand, (a, b) => a + b),
    "Math.SubtractGeneric": (leftOperand, rightOperand) => executePolymorphicOperation(leftOperand, rightOperand, (a, b) => a - b),
    "Math.MultiplyGeneric": (leftOperand, rightOperand) => executePolymorphicOperation(leftOperand, rightOperand, (a, b) => a * b),
    "Math.DivideGeneric": (leftOperand, rightOperand) => {
        if (typeof rightOperand === 'number' && rightOperand === 0) { 
            throw new Error("Division by zero."); 
        }
        return executePolymorphicOperation(leftOperand, rightOperand, (a, b) => a / b);
    },

    // Comparison Logic
    "Logic.Equal": (leftOperand, rightOperand) => areValuesDeeplyEqual(leftOperand, rightOperand),
    "Logic.NotEqual": (leftOperand, rightOperand) => !areValuesDeeplyEqual(leftOperand, rightOperand),
    "Logic.Greater": (leftOperand, rightOperand) => validateNumericComparison(leftOperand, rightOperand) && leftOperand > rightOperand,
    "Logic.GreaterEqual": (leftOperand, rightOperand) => validateNumericComparison(leftOperand, rightOperand) && leftOperand >= rightOperand,
    "Logic.Less": (leftOperand, rightOperand) => validateNumericComparison(leftOperand, rightOperand) && leftOperand < rightOperand,
    "Logic.LessEqual": (leftOperand, rightOperand) => validateNumericComparison(leftOperand, rightOperand) && leftOperand <= rightOperand,

    // Vector Logic
    "Vector.Make": (xInput, yInput, zInput) => ({ 
        x: xInput || 0, 
        y: yInput || 0, 
        z: zInput || 0 
    }),
    
    "Vector.Add": (vector1, vector2) => {
        const a = vector1 || {x:0, y:0, z:0};
        const b = vector2 || {x:0, y:0, z:0};
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },
    
    "Vector.Length": (vector) => {
        if (!vector) return 0;
        return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    },
    
    "Vector.Normalize": (vector) => {
        if (!vector) return {x:0, y:0, z:0};
        const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
        if (length === 0) return {x:0, y:0, z:0};
        return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
    },

    // Struct Creation
    "Rotator.Make": (roll, pitch, yaw) => ({ 
        roll: roll || 0, 
        pitch: pitch || 0, 
        yaw: yaw || 0 
    }),
    
    "Transform.Make": (location, rotation, scale) => ({
        loc: location || {x:0, y:0, z:0},
        rot: rotation || {roll:0, pitch:0, yaw:0},
        scale: scale || {x:1, y:1, z:1}
    }),

    // Primitive Constructors
    "Make.Bool": (value) => value === true,
    "Make.Float": (value) => parseFloat(value),
    "Make.Int": (value) => parseInt(value),
    "Make.String": (value) => String(value),

    // Type Conversions
    "Conv.IntToFloat": (value) => value, 
    "Conv.FloatToInt": (value) => Math.floor(value), 
    "Conv.FloatToString": (value) => (value !== undefined ? value.toString() : "0.0"),
    "Conv.IntToString": (value) => (value !== undefined ? value.toString() : "0"),
    "Conv.BoolToString": (value) => (value ? "true" : "false"),
    "Conv.VectorToString": (vector) => {
        if (!vector) return "X=0.000 Y=0.000 Z=0.000";
        return `X=${vector.x.toFixed(3)} Y=${vector.y.toFixed(3)} Z=${vector.z.toFixed(3)}`;
    }
};

// ==========================================================================================
// HELPER FUNCTIONS
// ==========================================================================================

/**
 * Handles complex formatting for Math operations to show expansion steps.
 * e.g. (1,2,3) * 5 -> "(1*5, 2*5, 3*5)"
 */
function formatMathVisualizer(inputs, result, symbol) {
    const a = inputs[0];
    const b = inputs[1];
    const isVecA = a && typeof a === 'object' && 'x' in a;
    const isVecB = b && typeof b === 'object' && 'x' in b;
    
    let expansion = "";

    // Vector * Scalar
    if (isVecA && typeof b === 'number') {
        expansion = `\n(${formatValueForDisplay(a.x)}${symbol}${b}, ${formatValueForDisplay(a.y)}${symbol}${b}, ${formatValueForDisplay(a.z)}${symbol}${b})`;
    } 
    // Scalar * Vector
    else if (typeof a === 'number' && isVecB) {
        expansion = `\n(${a}${symbol}${formatValueForDisplay(b.x)}, ${a}${symbol}${formatValueForDisplay(b.y)}, ${a}${symbol}${formatValueForDisplay(b.z)})`;
    }
    // Vector * Vector
    else if (isVecA && isVecB) {
        expansion = `\n(x${symbol}x, y${symbol}y, z${symbol}z)`; // Brief summary for space
    }

    return `${formatValueForDisplay(a)} ${symbol} ${formatValueForDisplay(b)}${expansion}\n---\n${formatValueForDisplay(result)}`;
}

/**
 * Formats a value for succinct display in the node graph visualizers.
 * @param {any} value - The value to format.
 * @returns {String} The formatted string.
 */
function formatValueForDisplay(value) {
    // Format Vectors
    if (typeof value === 'object' && value !== null && 'x' in value) 
        return `(${value.x.toFixed(1)}, ${value.y.toFixed(1)}, ${value.z.toFixed(1)})`;
    
    // Format Numbers to 2 decimal places
    if (typeof value === 'number') return parseFloat(value.toFixed(2));
    
    return String(value);
}

/**
 * Executes an operation polymorphically, handling both Scalar and Vector math.
 * Supports: (Vector, Vector), (Scalar, Scalar), (Vector, Scalar), and (Scalar, Vector).
 * * @param {any} leftOperand - The first value.
 * @param {any} rightOperand - The second value.
 * @param {Function} operationCallback - The math function (e.g., (x,y)=>x+y) to apply to components.
 * @returns {any} The result of the operation.
 */
function executePolymorphicOperation(leftOperand, rightOperand, operationCallback) {
    const isVector = (v) => v && typeof v === 'object' && 'x' in v;
    const isNumber = (v) => typeof v === 'number';

    // Case 1: Vector op Vector (Component-wise)
    if (isVector(leftOperand) && isVector(rightOperand)) {
        return { 
            x: operationCallback(leftOperand.x, rightOperand.x), 
            y: operationCallback(leftOperand.y, rightOperand.y), 
            z: operationCallback(leftOperand.z, rightOperand.z) 
        };
    }

    // Case 2: Number op Number
    if (isNumber(leftOperand) && isNumber(rightOperand)) {
        return operationCallback(leftOperand, rightOperand);
    }

    // Case 3: Vector op Scalar (Apply scalar to all components)
    if (isVector(leftOperand) && isNumber(rightOperand)) {
        return { 
            x: operationCallback(leftOperand.x, rightOperand), 
            y: operationCallback(leftOperand.y, rightOperand), 
            z: operationCallback(leftOperand.z, rightOperand) 
        };
    }

    // Case 4: Scalar op Vector (Apply scalar to all components)
    if (isNumber(leftOperand) && isVector(rightOperand)) {
        return { 
            x: operationCallback(leftOperand, rightOperand.x), 
            y: operationCallback(leftOperand, rightOperand.y), 
            z: operationCallback(leftOperand, rightOperand.z) 
        };
    }

    // Fallback for undefined inputs (treat as zero)
    if (leftOperand === undefined || rightOperand === undefined) return 0;

    // Error
    const error = new Error("Operation not supported for these types."); 
    error.isBlueprintError = true; 
    throw error; 
}

/**
 * Checks for Deep Equality between two values (including objects/vectors).
 */
function areValuesDeeplyEqual(valueA, valueB) {
    if (typeof valueA === 'object' && valueA !== null && typeof valueB === 'object' && valueB !== null) {
        return JSON.stringify(valueA) === JSON.stringify(valueB);
    }
    return valueA == valueB;
}

/**
 * Validates that inputs are numbers before performing numeric comparisons.
 * Throws an error if complex types (objects/vectors) are compared directly.
 */
function validateNumericComparison(valueA, valueB) {
    if (typeof valueA === 'object' || typeof valueB === 'object') { 
        const error = new Error("Comparison not supported for Objects/Vectors."); 
        error.isBlueprintError = true; 
        throw error; 
    }
    return true;
}