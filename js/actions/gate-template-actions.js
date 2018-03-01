// -------------------------------------------------------------
// Redux actions for interacting with gates.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// Update an arbitrary property on a gate
export const createGateTemplate = (parameters) => {
    if (!parameters.id) { parameters.id = uuidv4() }
    return {
        type: 'CREATE_GATE_TEMPLATE',
        payload: { gateTemplate: parameters }
    }
}