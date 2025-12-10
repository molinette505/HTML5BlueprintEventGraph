window.globalNodes = [
    {
        "name": "Event BeginPlay",
        "color": "var(--n-event)",
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Print String",
        "color": "var(--n-func)",
        "inputs": [
            {"name": "In", "type": "exec"},
            {"name": "String", "type": "string"},
            {"name": "Log To Screen", "type": "boolean"},
            {"name": "Text Color", "type": "color"}
        ],
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Make Vector",
        "color": "var(--n-pure)",
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
            // ADVANCED PINS
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
        "inputs": [{"name": "", "type": "vector"}, {"name": "", "type": "vector"}],
        "outputs": [{"name": "", "type": "vector"}]
    },
    {
        "name": "Int + Int",
        "hideHeader": true,
        "centerLabel": "+",
        "inputs": [{"name": "", "type": "int"}, {"name": "", "type": "int"}],
        "outputs": [{"name": "", "type": "int"}]
    }
];