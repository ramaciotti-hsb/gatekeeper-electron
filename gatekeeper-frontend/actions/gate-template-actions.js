// -------------------------------------------------------------
// Redux actions for interacting with gates.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// Create a new gate template
export const createGateTemplate = (parameters) => {
    if (!parameters.id) { parameters.id = uuidv4() }
    return {
        type: 'CREATE_GATE_TEMPLATE',
        payload: { gateTemplate: parameters }
    }
}

// Remove a gate template
export const removeGateTemplate = (gateTemplateId) => {
    return {
        type: 'REMOVE_GATE_TEMPLATE',
        payload: { gateTemplateId }
    }
}

// Update an arbitrary property on a gate template
export const updateGateTemplate = (gateTemplateId, parameters) => {
    return {
        type: 'UPDATE_GATE_TEMPLATE',
        payload: { gateTemplateId, parameters }
    }
}