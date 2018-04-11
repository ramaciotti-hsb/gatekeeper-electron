// -------------------------------------------------------------
// Redux actions for interacting with the global application state.
// -------------------------------------------------------------

// This is also picked up by the application reducer
export const updateModalParameters = (modalKey, parameters) => {
    return {
        type: 'UPDATE_MODAL_PARAMETERS',
        payload: { modalKey, parameters }
    }
}