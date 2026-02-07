const buildCategoryPriority = (entries) => {
    const result = {};
    entries.forEach(([category, score]) => {
        result[category] = score;
    });
    return result;
};

const buildNodePriority = (entries) => {
    const result = {};
    entries.forEach(([name, score]) => {
        result[name] = score;
    });
    return result;
};

export const contextSensitiveNodeConfig = {
    enabledByDefault: true,
    defaults: {
        dataOutput: {
            categoryPriority: buildCategoryPriority([
                ["Math", 250],
                ["Logic", 230],
                ["Conversion", 170],
                ["String", 90],
                ["Variables", 60]
            ]),
            nodePriority: buildNodePriority([
                ["Add", 40],
                ["Subtract", 40],
                ["Multiply", 38],
                ["Divide", 38],
                ["Equal (==)", 34],
                ["Not Equal (!=)", 34]
            ])
        },
        execOutput: {
            categoryPriority: buildCategoryPriority([
                ["Flow Control", 260],
                ["String", 170],
                ["Events", 20]
            ]),
            nodePriority: buildNodePriority([
                ["Print String", 220]
            ])
        }
    },
    overridesBySourceNode: {
        "Event BeginPlay": {
            execOutput: {
                nodePriority: buildNodePriority([
                    ["Branch", 240],
                    ["For Loop", 220],
                    ["WhileLoop", 210],
                    ["Do Once", 200],
                    ["Delay", 190]
                ])
            }
        },
        "For Loop": {
            dataOutput: {
                nodePriority: buildNodePriority([
                    ["Int to String", 220],
                    ["Float to String", 160]
                ])
            }
        }
    },
    overridesBySourcePin: {
        "For Loop.Index": {
            dataOutput: {
                nodePriority: buildNodePriority([
                    ["Int to String", 260],
                    ["Equal (==)", 180],
                    ["Greater Equal (>=)", 170]
                ])
            }
        }
    }
};

const getRootCategory = (categoryName) => {
    if (!categoryName) return "General";
    return String(categoryName).split("|")[0].trim();
};

const mergePriorityProfiles = (baseProfile = {}, overrideProfile = {}) => {
    return {
        categoryPriority: {
            ...(baseProfile.categoryPriority || {}),
            ...(overrideProfile.categoryPriority || {})
        },
        nodePriority: {
            ...(baseProfile.nodePriority || {}),
            ...(overrideProfile.nodePriority || {})
        }
    };
};

const getOutputProfileKey = (spawnContext) => {
    if (!spawnContext) return null;
    return spawnContext.dataType === "exec" ? "execOutput" : "dataOutput";
};

const getResolvedPriorityProfile = (spawnContext) => {
    const profileKey = getOutputProfileKey(spawnContext);
    if (!profileKey) return null;

    const baseProfile = contextSensitiveNodeConfig.defaults[profileKey] || {};
    const nodeOverride = spawnContext && spawnContext.sourceNodeName
        ? (((contextSensitiveNodeConfig.overridesBySourceNode || {})[spawnContext.sourceNodeName] || {})[profileKey] || {})
        : {};

    const pinKey = spawnContext && spawnContext.sourceNodeName && spawnContext.sourcePinName
        ? `${spawnContext.sourceNodeName}.${spawnContext.sourcePinName}`
        : null;
    const pinOverride = pinKey
        ? (((contextSensitiveNodeConfig.overridesBySourcePin || {})[pinKey] || {})[profileKey] || {})
        : {};

    return mergePriorityProfiles(mergePriorityProfiles(baseProfile, nodeOverride), pinOverride);
};

const getAllowedTypes = (pinDefinition) => {
    if (!pinDefinition || !Array.isArray(pinDefinition.allowedTypes)) return null;
    return pinDefinition.allowedTypes;
};

const evaluateDataInputCompatibility = (inputPin, sourceType) => {
    if (!inputPin || inputPin.type === "exec") return null;

    const allowedTypes = getAllowedTypes(inputPin);
    const inputType = inputPin.type;

    if (sourceType === "wildcard") {
        if (inputType === "wildcard") return { score: 150, kind: "wildcard-wildcard" };
        return { score: 80, kind: "wildcard-generic" };
    }

    if (inputType === sourceType) {
        return { score: 220, kind: "exact" };
    }

    if (inputType === "wildcard" && (!allowedTypes || allowedTypes.includes(sourceType))) {
        return { score: 180, kind: "wildcard" };
    }

    if (allowedTypes && allowedTypes.includes(sourceType)) {
        return { score: 140, kind: "allowed" };
    }

    return null;
};

export const findBestInputForSpawn = (template, spawnContext) => {
    if (!template || !spawnContext || spawnContext.sourceType !== "output") return null;

    const inputs = Array.isArray(template.inputs) ? template.inputs : [];
    if (spawnContext.dataType === "exec") {
        for (let index = 0; index < inputs.length; index += 1) {
            if (inputs[index].type === "exec") {
                return { index, score: 300 - index, kind: "exec" };
            }
        }
        return null;
    }

    let best = null;
    for (let index = 0; index < inputs.length; index += 1) {
        const compatibility = evaluateDataInputCompatibility(inputs[index], spawnContext.dataType);
        if (!compatibility) continue;

        const candidate = {
            index,
            score: compatibility.score - index,
            kind: compatibility.kind
        };

        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }

    return best;
};

const evaluateDataOutputCompatibility = (outputPin, targetType) => {
    if (!outputPin || outputPin.type === "exec") return null;

    const allowedTypes = getAllowedTypes(outputPin);
    const outputType = outputPin.type;

    if (targetType === "wildcard") {
        if (outputType === "wildcard") return { score: 150, kind: "wildcard-wildcard" };
        return { score: 80, kind: "wildcard-generic" };
    }

    if (outputType === targetType) {
        return { score: 220, kind: "exact" };
    }

    if (outputType === "wildcard" && (!allowedTypes || allowedTypes.includes(targetType))) {
        return { score: 180, kind: "wildcard" };
    }

    if (allowedTypes && allowedTypes.includes(targetType)) {
        return { score: 140, kind: "allowed" };
    }

    return null;
};

export const findBestOutputForSpawn = (template, spawnContext) => {
    if (!template || !spawnContext || spawnContext.sourceType !== "input") return null;

    const outputs = Array.isArray(template.outputs) ? template.outputs : [];
    if (spawnContext.dataType === "exec") {
        for (let index = 0; index < outputs.length; index += 1) {
            if (outputs[index].type === "exec") {
                return { index, score: 300 - index, kind: "exec" };
            }
        }
        return null;
    }

    let best = null;
    for (let index = 0; index < outputs.length; index += 1) {
        const compatibility = evaluateDataOutputCompatibility(outputs[index], spawnContext.dataType);
        if (!compatibility) continue;

        const candidate = {
            index,
            score: compatibility.score - index,
            kind: compatibility.kind
        };

        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }

    return best;
};

export const scoreTemplateForSpawn = (template, spawnContext, compatibility = null) => {
    if (!spawnContext) return 0;

    const profile = getResolvedPriorityProfile(spawnContext);
    if (!profile) return 0;

    const category = template.category || "General";
    const rootCategory = getRootCategory(category);

    let score = compatibility ? compatibility.score : 0;
    score += (profile.categoryPriority[category] || 0);
    if (rootCategory !== category) score += (profile.categoryPriority[rootCategory] || 0);
    score += (profile.nodePriority[template.name] || 0);

    return score;
};
