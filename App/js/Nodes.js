window.globalNodes = [
    {
        "name": "Event BeginPlay",
        "color": "var(--n-event)",
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Print String",
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
    // --- MAKE LITERALS ---
    {
        "name": "Make Float",
        "color": "var(--n-pure)",
        "functionId": "Make.Float",
        "inputs": [{"name": "Value", "type": "float", "default": 0.0}],
        "outputs": [{"name": "Return Value", "type": "float"}]
    },
    {
        "name": "Make Integer",
        "color": "var(--n-pure)",
        "functionId": "Make.Int",
        "inputs": [{"name": "Value", "type": "int", "default": 0}],
        "outputs": [{"name": "Return Value", "type": "int"}]
    },
    {
        "name": "Make String",
        "color": "var(--n-pure)",
        "functionId": "Make.String",
        "inputs": [{"name": "Value", "type": "string", "default": "Hello"}],
        "outputs": [{"name": "Return Value", "type": "string"}]
    },
    // --- CONVERSIONS ---
    {
        "name": "Int to Float",
        "color": "var(--n-pure)",
        "functionId": "Conv.IntToFloat",
        "inputs": [{"name": "Int", "type": "int"}],
        "outputs": [{"name": "Float", "type": "float"}]
    },
    {
        "name": "Float to Int",
        "color": "var(--n-pure)",
        "functionId": "Conv.FloatToInt",
        "inputs": [{"name": "Float", "type": "float"}],
        "outputs": [{"name": "Int", "type": "int"}]
    },
    {
        "name": "Float to String",
        "color": "var(--n-pure)",
        "functionId": "Conv.FloatToString",
        "inputs": [{"name": "Float", "type": "float"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    {
        "name": "Int to String",
        "color": "var(--n-pure)",
        "functionId": "Conv.IntToString",
        "inputs": [{"name": "Int", "type": "int"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    {
        "name": "Vector to String",
        "color": "var(--n-pure)",
        "functionId": "Conv.VectorToString",
        "inputs": [{"name": "Vec", "type": "vector"}],
        "outputs": [{"name": "String", "type": "string"}]
    },
    // --- EXISTING NODES ---
    {
        "name": "Make Vector",
        "color": "var(--n-pure)",
        "functionId": "Vector.Make", 
        "inputs": [
            {"name": "X", "type": "float"},
            {"name": "Y", "type": "float"},
            {"name": "Z", "type": "float"}
        ],
        "outputs": [{"name": "Vec", "type": "vector"}]
    },
    {
        "name": "Spawn Actor From Class",
        "color": "var(--n-func)",
        "inputs": [
            {"name": "Exec", "type": "exec"},
            {
                "name": "Class", "type": "class", 
                "options": ["BP_Button", "BP_Door", "BP_Button1", "BP_Door1", "BP_Door2"], 
                "default": "BP_Button"
            },
            {"name": "Spawn Transform", "type": "transform"},
            {
                "name": "Collision Handling Override", "type": "string", "widget": "dropdown",
                "options": ["Default", "Always Spawn", "Try To Adjust"],
                "default": "Default"
            },
            {
                "name": "Owner", "type": "object", "advanced": true,
                "options": ["Self", "Player", "Level"], "default": "Self"
            },
            {
                "name": "Instigator", "type": "object", "advanced": true,
                "options": ["Self", "Player", "Level"], "default": "Self"
            }
        ],
        "outputs": [
            {"name": "Out", "type": "exec"},
            {"name": "Return Value", "type": "object"}
        ]
    },
    {
        "name": "Vector + Vector",
        "hideHeader": true,
        "centerLabel": "+",
        "functionId": "Vector.Add", 
        "inputs": [{"name": "", "type": "vector"}, {"name": "", "type": "vector"}],
        "outputs": [{"name": "", "type": "vector"}]
    },
    {
        "name": "Int + Int",
        "hideHeader": true,
        "centerLabel": "+",
        "functionId": "Math.Add", 
        "inputs": [{"name": "", "type": "int"}, {"name": "", "type": "int"}],
        "outputs": [{"name": "", "type": "int"}]
    }
];

// --- AUTO CONVERSION MAP ---
// Key: "SourceType->TargetType", Value: "Node Template Name"
window.nodeConversions = {
    "int->float": "Int to Float",
    "float->int": "Float to Int",
    "float->string": "Float to String",
    "int->string": "Int to String",
    "vector->string": "Vector to String"
};