// -------------------------------------------------------------
// Redux actions for interacting with gates.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// Update an arbitrary property on a gate
export const updateGate = (gateId, parameters) => {
    return {
        type: 'UPDATE_GATE',
        payload: { gateId, parameters }
    }
}