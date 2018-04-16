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

export const setBackgroundJobsEnabled = (backgroundJobsEnabled) => {
    return {
        type: 'SET_BACKGROUND_JOBS_ENABLED',
        payload: { backgroundJobsEnabled }
    }
}