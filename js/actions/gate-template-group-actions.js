// -------------------------------------------------------------
// Redux actions for interacting with gates template groups.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// Create a new gate template group
export const createGateTemplateGroup = (parameters) => {
    if (!parameters.id) { parameters.id = uuidv4() }
    return {
        type: 'CREATE_GATE_TEMPLATE_GROUP',
        payload: { gateTemplate: parameters }
    }
}

// Remove a gate template group
export const removeGateTemplateGroup = (gateTemplateGroupId) => {
    return {
        type: 'REMOVE_GATE_TEMPLATE_GROUP',
        payload: { gateTemplateGroupId }
    }
}

// Update an arbitrary property on a gate template group
export const updateGateTemplateGroup = (gateTemplateGroupId, parameters) => {
    return {
        type: 'UPDATE_GATE_TEMPLATE_GROUP',
        payload: { gateTemplateGroupId, parameters }
    }
}

// Remove a gate template from a gate template group
export const removeGateTemplateFromGroup = (gateTemplateId, gateTemplateGroupId) => {
    return {
        type: 'REMOVE_GATE_TEMPLATE_FROM_GROUP',
        payload: { gateTemplateId, gateTemplateGroupId }
    }
}