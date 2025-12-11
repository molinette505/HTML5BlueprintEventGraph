window.globalNodes = [
    // --- EVENTS ---
    {
        "name": "Event BeginPlay",
        "category": "Events",
        "color": "var(--n-event)",
        "outputs": [{"name": "Out", "type": "exec"}]
    },

    // --- FLOW CONTROL ---
    {
        "name": "Branch",
        "category": "Flow Control",
        "color": "var(--n-event)", 
        "functionId": "Flow.Branch",
        "inputs": [
            { "name": "Exec", "type": "exec" },
            { "name": "Condition", "type": "boolean", "default": true }
        ],
        "outputs": [
            { "name": "True", "type": "exec" },
            { "name": "False", "type": "exec" }
        ]
    },

    // --- DEBUGGING ---
    {
        "name": "Print String",
        "category": "String",
        "color": "var(--n-func)",
        "functionId": "Flow.Print",
        "inputs": [
            {"name": "In", "type": "exec"},
            {"name": "String", "type": "string"},
            {"name": "Log To Screen", "type": "boolean"},
            {"name": "Text Color", "type": "color"}
        ],
        "outputs": [{"name": "Out", "type": "exec"}]
    },

    // --- GENERIC MATH ---
    {
        "name": "Add",
        "category": "Math",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Math.AddGeneric",
        "centerLabel": "+",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "vector"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "vector"] }
        ],
        "outputs": [{ "name": "Result", "type": "float", "allowedTypes": ["float", "int", "vector"] }]
    },
    {
        "name": "Subtract",
        "category": "Math",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Math.SubtractGeneric",
        "centerLabel": "-",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "vector"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "vector"] }
        ],
        "outputs": [{ "name": "Result", "type": "float", "allowedTypes": ["float", "int", "vector"] }]
    },
    {
        "name": "Multiply",
        "category": "Math",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Math.MultiplyGeneric",
        "centerLabel": "×",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "vector"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "vector"] }
        ],
        "outputs": [{ "name": "Result", "type": "float", "allowedTypes": ["float", "int", "vector"] }]
    },
    {
        "name": "Divide",
        "category": "Math",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Math.DivideGeneric",
        "centerLabel": "÷",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "vector"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "vector"] }
        ],
        "outputs": [{ "name": "Result", "type": "float", "allowedTypes": ["float", "int", "vector"] }]
    },

    // --- LOGIC / COMPARISON ---
    // Added "hideHeader": true to all comparison nodes
    {
        "name": "Equal (==)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.Equal",
        "centerLabel": "==",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string", "boolean", "vector", "class", "object", "transform"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string", "boolean", "vector", "class", "object", "transform"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },
    {
        "name": "Not Equal (!=)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.NotEqual",
        "centerLabel": "!=",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string", "boolean", "vector", "class", "object", "transform"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string", "boolean", "vector", "class", "object", "transform"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },
    {
        "name": "Greater (>)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.Greater",
        "centerLabel": ">",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },
    {
        "name": "Greater Equal (>=)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.GreaterEqual",
        "centerLabel": ">=",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },
    {
        "name": "Less (<)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.Less",
        "centerLabel": "<",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },
    {
        "name": "Less Equal (<=)",
        "category": "Logic",
        "color": "var(--n-pure)",
        "hideHeader": true,
        "functionId": "Logic.LessEqual",
        "centerLabel": "<=",
        "inputs": [
            { "name": "A", "type": "float", "allowedTypes": ["float", "int", "string"] },
            { "name": "B", "type": "float", "allowedTypes": ["float", "int", "string"] }
        ],
        "outputs": [{ "name": "Result", "type": "boolean" }]
    },

    // --- VARIABLES / LITERALS ---
    {
        "name": "Make Boolean",
        "category": "Variables",
        "color": "var(--n-pure)",
        "functionId": "Make.Bool",
        "inputs": [{ "name": "Value", "type": "boolean", "default": true }],
        "outputs": [{ "name": "Val", "type": "boolean" }]
    },
    {
        "name": "Make Float",
        "category": "Variables",
        "color": "var(--n-pure)",
        "functionId": "Make.Float",
        "inputs": [{"name": "Value", "type": "float", "default": 0.0}],
        "outputs": [{"name": "Return Value", "type": "float"}]
    },
    {
        "name": "Make Integer",
        "category": "Variables",
        "color": "var(--n-pure)",
        "functionId": "Make.Int",
        "inputs": [{"name": "Value", "type": "int", "default": 0}],
        "outputs": [{"name": "Return Value", "type": "int"}]
    },
    {
        "name": "Make String",
        "category": "Variables",
        "color": "var(--n-pure)",
        "functionId": "Make.String",
        "inputs": [{"name": "Value", "type": "string", "default": "Hello"}],
        "outputs": [{"name": "Return Value", "type": "string"}]
    },
    {
        "name": "Make Vector",
        "category": "Math|Vector",
        "color": "var(--n-pure)",
        "functionId": "Vector.Make",
        "inputs": [
            {"name": "X", "type": "float"}, {"name": "Y", "type": "float"}, {"name": "Z", "type": "float"}
        ],
        "outputs": [{"name": "Vec", "type": "vector"}]
    },

    // --- CONVERSIONS ---
    {
        "name": "Int to Float",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.IntToFloat",
        "inputs": [{"name": "Int", "type": "int"}],
        "outputs": [{"name": "Float", "type": "float"}]
    },
    {
        "name": "Float to Int",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.FloatToInt",
        "inputs": [{"name": "Float", "type": "float"}],
        "outputs": [{"name": "Int", "type": "int"}]
    },
    {
        "name": "Float to String",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.FloatToString",
        "inputs": [{"name": "Float", "type": "float"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    {
        "name": "Int to String",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.IntToString",
        "inputs": [{"name": "Int", "type": "int"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    {
        "name": "Bool to String",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.BoolToString",
        "inputs": [{"name": "Bool", "type": "boolean"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    {
        "name": "Vector to String",
        "category": "Conversion",
        "color": "var(--n-pure)",
        "functionId": "Conv.VectorToString",
        "inputs": [{"name": "Vec", "type": "vector"}],
        "outputs": [{"name": "String", "type": "string"}]
    },

    // --- GAMEPLAY EXAMPLES ---
    {
        "name": "Spawn Actor From Class",
        "category": "Game",
        "color": "var(--n-func)",
        "inputs": [
            {"name": "Exec", "type": "exec"},
            { "name": "Class", "type": "class", "default": "BP_Button" },
            {"name": "Spawn Transform", "type": "transform"},
            { "name": "Collision", "type": "string", "widget": "dropdown", "options": ["Default", "Always"] }
        ],
        "outputs": [{"name": "Out", "type": "exec"}, {"name": "Return Value", "type": "object"}]
    }
];

window.nodeConversions = {
    "int->float": "Int to Float",
    "float->int": "Float to Int",
    "float->string": "Float to String",
    "int->string": "Int to String",
    "boolean->string": "Bool to String",
    "vector->string": "Vector to String"
};