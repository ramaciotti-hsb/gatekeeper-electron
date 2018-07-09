// -------------------------------------------------------------
// Redux actions for interacting with the global application state.
// -------------------------------------------------------------

export const showGatingModal = (sampleId, selectedXParameterIndex, selectedYParameterIndex) => {
    return {
        type: 'SHOW_GATING_MODAL',
        payload: { sampleId, selectedXParameterIndex, selectedYParameterIndex }
    }
}

export const hideGatingModal = () => {
    return {
        type: 'HIDE_GATING_MODAL'
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

export const setUnsavedGates = (unsavedGates) => {
    return {
        type: 'SET_UNSAVED_GATES',
        payload: { unsavedGates }
    }
}