// -------------------------------------------------------------
// Redux actions for interacting with fcs files.
// -------------------------------------------------------------

// This is also picked up by the application reducer
export const updateFCSFile = (FCSFileId, parameters) => {
    return {
        type: 'UPDATE_FCS_FILE',
        payload: { FCSFileId, parameters }
    }
}

// This is also picked up by the application reducer
export const removeFCSFile = (FCSFileId) => {
    return {
        type: 'REMOVE_FCS_FILE',
        payload: { FCSFileId }
    }
}
