/**
 * FunctionRegistry
 * Maps string identifiers (from JSON) to actual JavaScript functions.
 * This is the "Engine" that powers your nodes.
 */
window.FunctionRegistry = {
    // --- FLOW CONTROL ---
    "Flow.Print": (msg) => {
        console.log("%c[Blueprint Output]:", "color: cyan", msg);
        return msg;
    },

    // The Branch node helper: returns the boolean value so the Simulation engine
    // can decide which execution output pin to activate.
    "Flow.Branch": (condition) => {
        return !!condition; // Force boolean
    },

    // --- MATH (Polymorphic) ---
    
    // ADD: Vector+Vector, Scalar+Scalar.
    "Math.AddGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';

        if (isVector(a) && isVector(b)) return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
        if (isNumber(a) && isNumber(b)) return a + b; 

        const err = new Error("Addition is not supported between these types.");
        err.isBlueprintError = true; throw err; 
    },

    // SUBTRACT: Vector-Vector, Scalar-Scalar.
    "Math.SubtractGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';

        if (isVector(a) && isVector(b)) return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
        if (isNumber(a) && isNumber(b)) return a - b;

        const err = new Error("Subtraction is not supported between these types.");
        err.isBlueprintError = true; throw err; 
    },

    // MULTIPLY: Scalar*Scalar, Scalar*Vector, Vector*Scalar.
    "Math.MultiplyGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';

        if (isNumber(a) && isNumber(b)) return a * b;
        if (isNumber(a) && isVector(b)) return { x: a * b.x, y: a * b.y, z: a * b.z };
        if (isVector(a) && isNumber(b)) return { x: a.x * b, y: a.y * b, z: a.z * b };

        const err = new Error("Multiplication not supported (Cannot multiply Vector by Vector).");
        err.isBlueprintError = true; throw err; 
    },

    // DIVIDE: Scalar/Scalar, Vector/Scalar.
    "Math.DivideGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';

        if (isNumber(b) && b === 0) {
            const err = new Error("Division by zero.");
            err.isBlueprintError = true; throw err;
        }

        if (isNumber(a) && isNumber(b)) return a / b;
        if (isVector(a) && isNumber(b)) return { x: a.x / b, y: a.y / b, z: a.z / b };

        const err = new Error("Invalid Division (Cannot divide Scalar by Vector).");
        err.isBlueprintError = true; throw err; 
    },

    // --- LOGIC / COMPARISONS (Polymorphic) ---
    // JS weak typing handles numbers and strings automatically (e.g., 5 > 2, "b" > "a")
    "Logic.Equal": (a, b) => a == b,
    "Logic.NotEqual": (a, b) => a != b,
    "Logic.Greater": (a, b) => a > b,
    "Logic.GreaterEqual": (a, b) => a >= b,
    "Logic.Less": (a, b) => a < b,
    "Logic.LessEqual": (a, b) => a <= b,

    // --- VECTORS ---
    "Vector.Make": (x, y, z) => ({ x: x||0, y: y||0, z: z||0 }),
    
    "Vector.Add": (v1, v2) => {
        const a = v1 || {x:0, y:0, z:0};
        const b = v2 || {x:0, y:0, z:0};
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },

    // --- MAKE LITERALS ---
    "Make.Bool": (val) => val === true,
    "Make.Float": (val) => parseFloat(val),
    "Make.Int": (val) => parseInt(val),
    "Make.String": (val) => String(val),

    // --- CONVERSIONS ---
    "Conv.IntToFloat": (val) => val, 
    "Conv.FloatToInt": (val) => Math.trunc(val), 
    "Conv.FloatToString": (val) => (val !== undefined ? val.toString() : "0.0"),
    "Conv.IntToString": (val) => (val !== undefined ? val.toString() : "0"),
    "Conv.BoolToString": (val) => (val ? "true" : "false"),
    "Conv.VectorToString": (v) => {
        if (!v) return "X=0.000 Y=0.000 Z=0.000";
        return `X=${v.x.toFixed(3)} Y=${v.y.toFixed(3)} Z=${v.z.toFixed(3)}`;
    }
};