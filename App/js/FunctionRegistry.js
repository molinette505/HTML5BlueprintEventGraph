window.FunctionRegistry = {
    // --- FLOW CONTROL ---
    "Flow.Print": (msg) => {
        console.log("%c[Blueprint Output]:", "color: cyan", msg);
        return msg;
    },
    "Flow.Branch": (condition) => !!condition,

    // --- MATH ---
    "Math.AddGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';
        if (isVector(a) && isVector(b)) return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
        if (isNumber(a) && isNumber(b)) return a + b; 
        const err = new Error("Addition is not supported between these types.");
        err.isBlueprintError = true; throw err; 
    },
    "Math.SubtractGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';
        if (isVector(a) && isVector(b)) return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
        if (isNumber(a) && isNumber(b)) return a - b;
        const err = new Error("Subtraction is not supported between these types.");
        err.isBlueprintError = true; throw err; 
    },
    "Math.MultiplyGeneric": (a, b) => {
        const isVector = (v) => v && typeof v === 'object' && 'x' in v;
        const isNumber = (v) => typeof v === 'number';
        if (isNumber(a) && isNumber(b)) return a * b;
        if (isNumber(a) && isVector(b)) return { x: a * b.x, y: a * b.y, z: a * b.z };
        if (isVector(a) && isNumber(b)) return { x: a.x * b, y: a.y * b, z: a.z * b };
        const err = new Error("Multiplication not supported (Cannot multiply Vector by Vector).");
        err.isBlueprintError = true; throw err; 
    },
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

    // --- LOGIC / COMPARISONS (Updated) ---
    "Logic.Equal": (a, b) => {
        // Handle Vector/Object Deep Equality (simplified via JSON)
        if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
            return JSON.stringify(a) === JSON.stringify(b);
        }
        return a == b;
    },
    "Logic.NotEqual": (a, b) => {
        if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
            return JSON.stringify(a) !== JSON.stringify(b);
        }
        return a != b;
    },
    
    // For Inequalities, ensure we only compare Numbers or Strings
    "Logic.Greater": (a, b) => {
        if (typeof a === 'object' || typeof b === 'object') {
            const err = new Error("Cannot compare Objects/Vectors with '>'");
            err.isBlueprintError = true; throw err;
        }
        return a > b;
    },
    "Logic.GreaterEqual": (a, b) => {
        if (typeof a === 'object' || typeof b === 'object') {
            const err = new Error("Cannot compare Objects/Vectors with '>='");
            err.isBlueprintError = true; throw err;
        }
        return a >= b;
    },
    "Logic.Less": (a, b) => {
        if (typeof a === 'object' || typeof b === 'object') {
            const err = new Error("Cannot compare Objects/Vectors with '<'");
            err.isBlueprintError = true; throw err;
        }
        return a < b;
    },
    "Logic.LessEqual": (a, b) => {
        if (typeof a === 'object' || typeof b === 'object') {
            const err = new Error("Cannot compare Objects/Vectors with '<='");
            err.isBlueprintError = true; throw err;
        }
        return a <= b;
    },

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