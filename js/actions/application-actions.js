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

export const setPlotDimensions = (plotWidth, plotHeight) => {
    return {
        type: 'SET_PLOT_DIMENSIONS',
        payload: { plotWidth, plotHeight }
    }
}

export const setPlotDisplayDimensions = (plotDisplayWidth, plotDisplayHeight) => {
    return {
        type: 'SET_PLOT_DISPLAY_DIMENSIONS',
        payload: { plotDisplayWidth, plotDisplayHeight }
    }
}


export const toggleShowDisabledParameters = () => {
    return {
        type: 'TOGGLE_SHOW_DISABLED_PARAMETERS'
    }
}