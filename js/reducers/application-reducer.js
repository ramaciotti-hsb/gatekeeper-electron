import { combineReducers } from 'redux'
import { removeFCSFile } from '../actions/fcs-file-actions'
import { removeSample } from '../actions/sample-actions'
import { removeGateTemplate } from '../actions/gate-template-actions'
import { removeGateTemplateGroup, removeGateTemplateFromGroup } from '../actions/gate-template-group-actions.js'
import FCSFileReducer from './fcs-file-reducer'
import sampleReducer from './sample-reducer'
import workspaceReducer from './workspace-reducer'
import gateReducer from './gate-reducer'
import gateTemplateReducer from './gate-template-reducer'
import gateTemplateGroupReducer from './gate-template-group-reducer'
import gatingErrorReducer from './gating-error-reducer'
import _ from 'lodash'
import uuidv4 from 'uuid/v4'
import path from 'path'
import { remote } from 'electron'
import fs from 'fs'

let initialState = {
    FCSFiles: FCSFileReducer(),
    samples: sampleReducer(),
    workspaces: workspaceReducer(),
    gates: gateReducer(),
    gateTemplates: gateTemplateReducer(),
    gateTemplateGroups: gateTemplateGroupReducer(),
    gatingErrors: gatingErrorReducer(),
    selectedWorkspaceId: null,
    sessionLoading: true, // Display a global loading spinner while the session loads
    backgroundJobsEnabled: true,
    showDisabledParameters: true,
    gatingModal: {},
    unsavedGates: null,
    // These values determine how large the plots generated on the backend are
    plotWidth: 380,
    plotHeight: 380,
    // This value determines how large the plot should be displayed on the front end
    plotDisplayWidth: 380,
    plotDisplayHeight: 380,
    sessionBroken: false,
    api: {}
}

const applicationReducer = (state = initialState, action) => {
    let newState = {
        FCSFiles: state.FCSFiles ? state.FCSFiles.slice(0) : [],
        samples: state.samples ? state.samples.slice(0) : [],
        workspaces: state.workspaces ? state.workspaces.slice(0) : [],
        gates: state.gates ? state.gates.slice(0) : [],
        gateTemplates: state.gateTemplates ? state.gateTemplates.slice(0) : [],
        gateTemplateGroups: state.gateTemplateGroups ? state.gateTemplateGroups.slice(0) : [],
        gatingErrors: state.gatingErrors ? state.gatingErrors.slice(0) : [],
        unsavedGates: state.unsavedGates ? state.unsavedGates.slice(0) : null,
        selectedWorkspaceId: state.selectedWorkspaceId,
        sessionLoading: state.sessionLoading,
        backgroundJobsEnabled: state.backgroundJobsEnabled,
        showDisabledParameters: state.showDisabledParameters,
        plotWidth: state.plotWidth,
        plotHeight: state.plotHeight,
        plotDisplayWidth: state.plotDisplayWidth,
        plotDisplayHeight: state.plotDisplayHeight,
        sessionBroken: state.sessionBroken,
        gatingModal: _.clone(state.gatingModal) || {},
        api: state.api
    }

    // --------------------------------------------------
    // Sometimes the session gets irrevocably broken during an
    // update or bad disk write. In this case, we need to give the user the option
    // to start again from scratch.
    // --------------------------------------------------
    if (action.type === 'SET_SESSION_BROKEN') {
        newState.sessionBroken = action.payload.sessionBroken
    }
    // --------------------------------------------------
    // Reset the inbuilt session to default.
    // --------------------------------------------------
    else if (action.type === 'RESET_SESSION') {
        newState = initialState
    }
    // --------------------------------------------------
    // Override the whole local session with new data.
    // Usually used when first bootstrapping from DB or 
    // filesystem.
    // --------------------------------------------------
    else if (action.type === 'SET_SESSION_STATE') {
        newState.FCSFiles = action.payload.FCSFiles ? action.payload.FCSFiles.slice(0) : []
        newState.samples = action.payload.samples ? action.payload.samples.slice(0) : []
        newState.workspaces = action.payload.workspaces ? action.payload.workspaces.slice(0) : []
        newState.gates = action.payload.gates ? action.payload.gates.slice(0) : []
        newState.gateTemplates = action.payload.gateTemplates ? action.payload.gateTemplates.slice(0) : []
        newState.gateTemplateGroups = action.payload.gateTemplateGroups ? action.payload.gateTemplateGroups.slice(0) : []
        newState.gatingErrors = action.payload.gatingErrors ? action.payload.gatingErrors.slice(0) : []
        newState.selectedWorkspaceId = action.payload.selectedWorkspaceId
        newState.backgroundJobsEnabled = action.payload.backgroundJobsEnabled
        newState.plotWidth = action.payload.plotWidth || newState.plotWidth
        newState.plotHeight = action.payload.plotHeight || newState.plotHeight
        newState.plotDisplayWidth = action.payload.plotDisplayWidth || newState.plotDisplayWidth
        newState.plotDisplayHeight = action.payload.plotDisplayHeight || newState.plotDisplayHeight
        newState.showDisabledParameters = action.payload.showDisabledParameters
    }
    // --------------------------------------------------
    // Selects which "API" object to use. This changes from
    // the web version to electron.
    // --------------------------------------------------
    else if (action.type === 'SET_API') {
        newState.api = action.payload.api
    }
    // --------------------------------------------------
    // Sets the global loading indicator
    // the web version to electron.
    // --------------------------------------------------
    else if (action.type === 'SET_SESSION_LOADING') {
        newState.sessionLoading = action.payload.sessionLoading
    }
    // --------------------------------------------------
    // Show a gating modal for a particular sample and
    // selected X / Y Parameters
    // --------------------------------------------------
    else if (action.type === 'SHOW_GATING_MODAL') {
        newState.gatingModal = {
            visible: true,
            selectedXParameterIndex: action.payload.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.selectedYParameterIndex
        }

        const sample = _.find(newState.samples, s => s.id === action.payload.sampleId)
        const gateTemplateGroup = _.find(newState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId && g.selectedXParameterIndex === action.payload.selectedXParameterIndex && g.selectedYParameterIndex === action.payload.selectedYParameterIndex)

        let gatingError = _.find(newState.gatingErrors, e => gateTemplateGroup && e.gateTemplateGroupId === gateTemplateGroup.id && e.sampleId === sample.id)
        if (gatingError) {
            newState.gatingModal.gatingErrorId = gatingError.id
        } else {
            newState.gatingModal.sampleId = sample.id
            if (gateTemplateGroup) {
                const unsavedGates = _.cloneDeep(_.filter(newState.gates, g => g.parentSampleId === sample.id && gateTemplateGroup.childGateTemplateIds.includes(g.gateTemplateId))).map((gate) => {
                    const childSample = _.find(newState.samples, s => s.id === gate.childSampleId)
                    gate.includeEventIds = childSample.includeEventIds
                    gate.FCSFileId = sample.FCSFileId
                    gate.sampleId = sample.id
                    gate.id = uuidv4()
                    return gate
                })
                newState.unsavedGates = unsavedGates
            }
        }
    }
    // --------------------------------------------------
    // Hide the gating modal
    // --------------------------------------------------
    else if (action.type === 'HIDE_GATING_MODAL') {
        newState.gatingModal = { visible: false }
    }
    // --------------------------------------------------
    // Disables and re enabled background jobs
    // --------------------------------------------------
    else if (action.type === 'SET_BACKGROUND_JOBS_ENABLED') {
        newState.backgroundJobsEnabled = action.payload.backgroundJobsEnabled
    }
    // --------------------------------------------------
    // Toggles display of the parameter enable / disable sidebar
    // --------------------------------------------------
    else if (action.type === 'TOGGLE_SHOW_DISABLED_PARAMETERS') {
        newState.showDisabledParameters = !newState.showDisabledParameters
    }
    // --------------------------------------------------
    // Sets plot width and height
    // --------------------------------------------------
    else if (action.type === 'SET_PLOT_DIMENSIONS') {
        newState.plotWidth = action.payload.plotWidth
        newState.plotHeight = action.payload.plotHeight
    }
    // --------------------------------------------------
    // Sets plot display width and height
    // --------------------------------------------------
    else if (action.type === 'SET_PLOT_DISPLAY_DIMENSIONS') {
        newState.plotDisplayWidth = action.payload.plotDisplayWidth
        newState.plotDisplayHeight = action.payload.plotDisplayHeight
    }
    // --------------------------------------------------
    // Sets unsaved gates which will display on the auto gating modal
    // --------------------------------------------------
    else if (action.type === 'SET_UNSAVED_GATES') {
        newState.unsavedGates = _.cloneDeep(action.payload.unsavedGates)
    }
    // --------------------------------------------------
    // Create a new workspace and select it
    // --------------------------------------------------
    else if (action.type === 'CREATE_WORKSPACE') {
        // Workspaces are always selected after creating them
        newState.workspaces = workspaceReducer(newState.workspaces, { type: 'CREATE_WORKSPACE', payload: action.payload })
        newState.selectedWorkspaceId = action.payload.workspace.id
    // --------------------------------------------------
    // Select an existing workspace
    // --------------------------------------------------
    } else if (action.type === 'SELECT_WORKSPACE') {
        newState.selectedWorkspaceId = action.payload.id
    // --------------------------------------------------
    // Create an FCS File and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_FCS_FILE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new sample with the sample reducer
            newState.FCSFiles = FCSFileReducer(newState.FCSFiles, { type: 'CREATE_FCS_FILE', payload: action.payload.FCSFile })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_FCS_FILE_TO_WORKSPACE', payload: { workspaceId: workspace.id, FCSFileId: action.payload.FCSFile.id } })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'SELECT_FCS_FILE', payload: { workspaceId: workspace.id, FCSFileId: action.payload.FCSFile.id } })
        } else {
            console.log('CREATE_FCS_FILE_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Create a gate template and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_GATE_TEMPLATE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new gate template with the gate template reducer
            newState.gateTemplates = gateTemplateReducer(newState.gateTemplates, { type: 'CREATE_GATE_TEMPLATE', payload: action.payload })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_GATE_TEMPLATE_TO_WORKSPACE', payload: { workspaceId: workspace.id, gateTemplateId: action.payload.gateTemplate.id } })
        } else {
            console.log('CREATE_GATE_TEMPLATE_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Create a gate template group and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_GATE_TEMPLATE_GROUP_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new gate template with the gate template reducer
            newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, { type: 'CREATE_GATE_TEMPLATE_GROUP', payload: action.payload })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_GATE_TEMPLATE_GROUP_TO_WORKSPACE', payload: { workspaceId: workspace.id, gateTemplateGroupId: action.payload.gateTemplateGroup.id } })
        } else {
            console.log('CREATE_GATE_TEMPLATE_GROUP_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Create a sample and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_SAMPLE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new sample with the sample reducer
            newState.samples = sampleReducer(newState.samples, { type: 'CREATE_SAMPLE', payload: action.payload.sample })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_SAMPLE_TO_WORKSPACE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
        } else {
            console.log('CREATE_SAMPLE_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Create a new subsample and a corresponding gate
    // --------------------------------------------------
    } else if (action.type === 'CREATE_SUBSAMPLE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new sample with the sample reducer
            newState.samples = sampleReducer(newState.samples, { type: 'CREATE_SAMPLE', payload: action.payload.sample })
            newState.samples = sampleReducer(newState.samples, { type: 'ADD_CHILD_SAMPLE', payload: { childSampleId: action.payload.sample.id, parentSampleId: action.payload.parentSampleId } })
            newState.gates = gateReducer(newState.gates, { type: 'CREATE_GATE', payload: { childSampleId: action.payload.sample.id, parentSampleId: action.payload.parentSampleId, gate: action.payload.gate } })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_SAMPLE_TO_WORKSPACE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
            // newState.workspaces = workspaceReducer(newState.workspaces, { type: 'SELECT_SAMPLE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
        } else {
            console.log('CREATE_SAMPLE_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Remove a workspace and all the samples in it
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_WORKSPACE') {
        if (newState.selectedWorkspaceId === action.payload.id) {
            const workspaceIndex = _.findIndex(newState.workspaces, w => w.id === action.payload.id)
            let indexToSelect = Math.max(workspaceIndex - 1, 0)
            if (newState.workspaces.length > 1) {
                newState = applicationReducer(newState, { type: 'SELECT_WORKSPACE', payload: { id: newState.workspaces[indexToSelect].id }})
            } else {
                newState = applicationReducer(newState, { type: 'SELECT_WORKSPACE', payload: { id: null }})
            }
        }
        
        newState.workspaces = workspaceReducer(newState.workspaces, action)

        // Delete any gate template groups that are no longer in a workspace
        let removedGroups = _.filter(newState.gateTemplateGroups, g => !_.find(newState.workspaces, w => w.gateTemplateGroupIds.includes(g.id)))
        for (let gateTemplateGroup of removedGroups) {
            newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, { type: 'REMOVE_GATE_TEMPLATE_GROUP', payload: { gateTemplateGroupId: gateTemplateGroup.id } })
        }

        // Delete any gate templates that are no longer in a workspace
        let removedTemplates = _.filter(newState.gateTemplates, gt => !_.find(newState.workspaces, w => w.gateTemplateIds.includes(gt.id)))
        for (let gateTemplate of removedTemplates) {
            newState.gateTemplates = gateTemplateReducer(newState.gateTemplates, { type: 'REMOVE_GATE_TEMPLATE', payload: { gateTemplateId: gateTemplate.id } })
        }

        // Delete any FCS Files that are no longer in a workspace
        let removedFCSFiles = _.filter(newState.FCSFiles, gt => !_.find(newState.workspaces, w => w.FCSFileIds.includes(gt.id)))
        for (let FCSFile of removedFCSFiles) {
            newState.FCSFiles = FCSFileReducer(newState.FCSFiles, { type: 'REMOVE_FCS_FILE', payload: { FCSFileId: FCSFile.id } })
        }

        // Delete any samples that are no longer in a workspace
        let orphanSamples = _.filter(newState.samples, s => !_.find(newState.workspaces, w => w.sampleIds.includes(s.id)))
        for (let sample of orphanSamples) {
            newState = applicationReducer(newState, { type: 'REMOVE_SAMPLE', payload: { sampleId: sample.id } })
        }

    // --------------------------------------------------
    // Remove an FCS File, and all the samples that depend on it
    // --------------------------------------------------    
    } else if (action.type === 'REMOVE_FCS_FILE') {
        // newState.FCSFiles = FCSFileReducer(newState.FCSFiles, action)
        const removeAction = removeFCSFile(action.payload.FCSFileId)
        // Find the workspace that the gateTemplate is inside and remove it from there
        const workspaceIndex = _.findIndex(newState.workspaces, w => w.FCSFileIds.includes(removeAction.payload.FCSFileId))

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(newState.workspaces[workspaceIndex])
            newWorkspace.FCSFileIds = newWorkspace.FCSFileIds.slice(0)

            if (newWorkspace.selectedFCSFileId === removeAction.payload.FCSFileId) {
                const selectedFCSFileIndex = _.findIndex(newWorkspace.FCSFileIds, id => id === removeAction.payload.FCSFileId)
                if (selectedFCSFileIndex > -1) {
                    // Select another FCS File if there is one available to select, otherwise do nothing
                    if (newWorkspace.FCSFileIds.length > 1) {

                        if (selectedFCSFileIndex < newWorkspace.FCSFileIds.length - 1) {
                            newWorkspace.selectedFCSFileId = newWorkspace.FCSFileIds[Math.min(Math.max(selectedFCSFileIndex + 1, 0), newWorkspace.FCSFileIds.length - 1)]
                        } else {
                            newWorkspace.selectedFCSFileId = newWorkspace.FCSFileIds[Math.max(newWorkspace.FCSFileIds.length - 2, 0)]
                        }
                    } else {
                        newWorkspace.selectedFCSFileId = null
                    }

                    newWorkspace.FCSFileIds = newWorkspace.FCSFileIds.slice(0, selectedFCSFileIndex).concat(newWorkspace.FCSFileIds.slice(selectedFCSFileIndex + 1))

                    console.log('selecting fcs file', newWorkspace.selectedFCSFileId)

                    newState.workspaces = newState.workspaces.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.workspaces.slice(workspaceIndex + 1))
                } else {
                    console.log('REMOVE_FCS_FILE failed: selected FCS file is null or undefined')
                }
            }

            newState.FCSFiles = FCSFileReducer(newState.FCSFiles, removeAction)
        } else {
            console.log('REMOVE_FCS_FILE failed: no FCS File with id', removeAction.payload.FCSFileId, 'was found in FCSFileIds of workspace with id', removeAction.payload.workspaceId)       
        }

        // Delete any samples that no longer point to a valid FCSFile (i.e. their parent or child has been deleted)
        let orphanSamples = _.filter(newState.samples, s => !_.find(newState.FCSFiles, fcs => s.FCSFileId === fcs.id))
        for (let sample of orphanSamples) {
            newState = applicationReducer(newState, { type: 'REMOVE_SAMPLE', payload: { sampleId: sample.id } })
        }
    // --------------------------------------------------
    // Remove a gate template, any child gate templates and unselect if selected
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE_GROUP') {
        // Find all gate templates that will be affected, including child templates and template groups
        const gateTemplatesToRemove = []
        const gateTemplateGroupsToRemove = [action.payload.gateTemplateGroupId]
        const addChildTemplates = (gateTemplateId) => {
            const gateTemplate = _.find(newState.gateTemplates, gt => gt.id === gateTemplateId)
            gateTemplatesToRemove.push(gateTemplateId)

            const templateGroup = _.find(newState.gateTemplateGroups, g => g.parentGateTemplateId === gateTemplateId)
            if (templateGroup) {
                gateTemplateGroupsToRemove.push(templateGroup.id)

                for (let childGateTemplateId of templateGroup.childGateTemplateIds) {
                    addChildTemplates(childGateTemplateId)
                }
            }
        }

        const gateTemplateGroup = _.find(newState.gateTemplateGroups, g => g.id === action.payload.gateTemplateGroupId)

        for (let gateTemplateId of gateTemplateGroup.childGateTemplateIds) {
            addChildTemplates(gateTemplateId)
        }
        
        for (let gateTemplateId of gateTemplatesToRemove) {
            const removeAction = removeGateTemplate(gateTemplateId)
            // Find the workspace that the gateTemplate is inside and remove it from there
            const workspaceIndex = _.findIndex(newState.workspaces, w => w.gateTemplateIds.includes(removeAction.payload.gateTemplateId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(newState.workspaces[workspaceIndex])
                newWorkspace.gateTemplateIds = newWorkspace.gateTemplateIds.slice(0)

                if (newWorkspace.selectedGateTemplateId === removeAction.payload.gateTemplateId) {
                    const selectedGateTemplateIndex = _.findIndex(newWorkspace.gateTemplateIds, s => s === removeAction.payload.gateTemplateId)
                    if (selectedGateTemplateIndex > -1) {

                        // Select another gateTemplate if there is one available to select, otherwise do nothing
                        if (newWorkspace.gateTemplateIds.length > 1) {

                            if (selectedGateTemplateIndex < newWorkspace.gateTemplateIds.length - 1) {
                                newWorkspace.selectedGateTemplateId = newWorkspace.gateTemplateIds[Math.min(Math.max(selectedGateTemplateIndex + 1, 0), newWorkspace.gateTemplateIds.length - 1)]
                            } else {
                                newWorkspace.selectedGateTemplateId = newWorkspace.gateTemplateIds[newWorkspace.gateTemplateIds.length - 2]
                            }
                        } else {
                            newWorkspace.selectedGateTemplateId = null
                        }

                        newState.workspaces = newState.workspaces.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.workspaces.slice(workspaceIndex + 1))
                    } else {
                        console.log('REMOVE_GATE_TEMPLATE failed: no gateTemplate with id', removeAction.payload.gateTemplateId, 'was found in gateTemplateIds of workspace with id', removeAction.payload.workspaceId)       
                    }
                }

                newState.workspaces = workspaceReducer(newState.workspaces, removeAction)
            }

            newState.gateTemplates = gateTemplateReducer(newState.gateTemplates, removeAction)
            // Remove the gate template from it's group if there is one
            const group = _.find(newState.gateTemplateGroups, gt => gt.childGateTemplateIds.includes(gateTemplateId))
            if (group) {
                newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, removeGateTemplateFromGroup(gateTemplateId, group.id))
            }
        }

        for (let gateTemplateGroupId of gateTemplateGroupsToRemove) {
            const removeAction = removeGateTemplateGroup(gateTemplateGroupId)
            // Find the workspace that the gateTemplateGroup is inside and remove it from there
            const workspaceIndex = _.findIndex(newState.workspaces, w => w.gateTemplateGroupIds.includes(removeAction.payload.gateTemplateGroupId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(newState.workspaces[workspaceIndex])
                newWorkspace.gateTemplateGroupIds = newWorkspace.gateTemplateGroupIds.slice(0)

                if (newWorkspace.selectedGateTemplateId === removeAction.payload.gateTemplateGroupId) {
                    const selectedGateTemplateIndex = _.findIndex(newWorkspace.gateTemplateGroupIds, s => s === removeAction.payload.gateTemplateGroupId)
                    if (selectedGateTemplateIndex > -1) {

                        // Select another gateTemplateGroup if there is one available to select, otherwise do nothing
                        if (newWorkspace.gateTemplateGroupIds.length > 1) {

                            if (selectedGateTemplateIndex < newWorkspace.gateTemplateGroupIds.length - 1) {
                                newWorkspace.selectedGateTemplateId = newWorkspace.gateTemplateGroupIds[Math.min(Math.max(selectedGateTemplateIndex + 1, 0), newWorkspace.gateTemplateGroupIds.length - 1)]
                            } else {
                                newWorkspace.selectedGateTemplateId = newWorkspace.gateTemplateGroupIds[newWorkspace.gateTemplateGroupIds.length - 2]
                            }
                        } else {
                            newWorkspace.selectedGateTemplateId = null
                        }

                        newState.workspaces = newState.workspaces.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.workspaces.slice(workspaceIndex + 1))
                    } else {
                        console.log('REMOVE_SAMPLE failed: no gateTemplateGroup with id', removeAction.payload.gateTemplateGroupId, 'was found in gateTemplateGroupIds of workspace with id', removeAction.payload.workspaceId)       
                    }
                }

                newState.workspaces = workspaceReducer(newState.workspaces, removeAction)
            }

            newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, removeAction)
        }

        // Delete any gating errors that no longer point to a valid gate template group
        let orphanGatingErrors = _.filter(newState.gatingErrors, e => !_.find(newState.gateTemplateGroups, g => e.gateTemplateGroupId === g.id))
        for (let error of orphanGatingErrors) {
            newState.gatingErrors = gatingErrorReducer(newState.gatingErrors, { type: 'REMOVE_GATING_ERROR', payload: { gatingErrorId: error.id } })
        }
        // Delete any gates that no longer point to a valid gateTemplate (i.e. their parent or child has been deleted)
        let orphanGates = _.filter(newState.gates, g => !_.find(newState.gateTemplates, gt => g.gateTemplateId === gt.id))
        for (let gate of orphanGates) {
            newState.gates = gateReducer(newState.gates, { type: 'REMOVE_GATE', payload: { gateId: gate.id } })
        }
        // Delete any samples that no longer point to a valid gateTemplate (i.e. their parent or child has been deleted)
        let orphanSamples = _.filter(newState.samples, s => !_.find(newState.gateTemplates, gt => s.gateTemplateId === gt.id))
        for (let sample of orphanSamples) {
            newState = applicationReducer(newState, { type: 'REMOVE_SAMPLE', payload: { sampleId: sample.id } })
        }
        // Delete any empty gate template groups
        let emptyGroups = _.filter(newState.gateTemplateGroups, g => g.childGateTemplateIds.length === 0)
        for (let gateTemplateGroup of emptyGroups) {
            newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, { type: 'REMOVE_GATE_TEMPLATE_GROUP', payload: { gateTemplateGroupId: gateTemplateGroup.id } })
        }
    // --------------------------------------------------
    // Remove a sample, any subsamples and unselect if selected
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_SAMPLE') {
        // Find all samples that will be affected, including subsamples
        const samplesToRemove = []
        const addSubSamples = (sampleId) => {
            const sample = _.find(newState.samples, s => s.id === sampleId)
            if (sampleId && sample) {
                samplesToRemove.push(sampleId)

                if (sample.subSampleIds) {
                    for (let subSampleId of sample.subSampleIds) {
                        addSubSamples(subSampleId)
                    }
                }
            }
        }

        addSubSamples(action.payload.sampleId)
        
        for (let sampleId of samplesToRemove) {
            const newAction = removeSample(sampleId)
            // Find the workspace that the sample is inside and remove it from there
            console.log(newState.workspaces)
            const workspaceIndex = _.findIndex(newState.workspaces, w => w.sampleIds.includes(newAction.payload.sampleId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(newState.workspaces[workspaceIndex])
                newWorkspace.sampleIds = newWorkspace.sampleIds.slice(0)

                if (newWorkspace.selectedSampleId === newAction.payload.sampleId) {
                    const selectedSampleIndex = _.findIndex(newWorkspace.sampleIds, s => s === newAction.payload.sampleId)
                    if (selectedSampleIndex > -1) {

                        // Select another sample if there is one available to select, otherwise do nothing
                        if (newWorkspace.sampleIds.length > 1) {

                            if (selectedSampleIndex < newWorkspace.sampleIds.length - 1) {
                                newWorkspace.selectedSampleId = newWorkspace.sampleIds[Math.min(Math.max(selectedSampleIndex + 1, 0), newWorkspace.sampleIds.length - 1)]
                            } else {
                                newWorkspace.selectedSampleId = newWorkspace.sampleIds[newWorkspace.sampleIds.length - 2]
                            }
                        } else {
                            newWorkspace.selectedSampleId = null
                        }

                        newState.workspaces = newState.workspaces.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.workspaces.slice(workspaceIndex + 1))
                    } else {
                        console.log('REMOVE_SAMPLE failed: no sample with id', newAction.payload.sampleId, 'was found in sampleIds of workspace with id', newAction.payload.workspaceId)       
                    }
                }

                newState.workspaces = workspaceReducer(newState.workspaces, newAction)
            }

            newState.samples = sampleReducer(newState.samples, newAction)
            // Delete any gates that no longer point to a valid sample (i.e. their parent or child has been deleted)
            let orphanGates = _.filter(newState.gates, g => !_.find(newState.samples, s => g.parentSampleId === s.id) || !_.find(newState.samples, s => g.childSampleId === s.id))
            for (let gate of orphanGates) {
                newState.gates = gateReducer(newState.gates, { type: 'REMOVE_GATE', payload: { gateId: gate.id } })
            }
        }
    // --------------------------------------------------
    // Select a different FCS File
    // --------------------------------------------------
    } else if (action.type === 'SELECT_FCS_FILE') {
        // Pass on to the workspace reducer
        newState.workspaces = workspaceReducer(newState.workspaces, { type: 'SELECT_FCS_FILE', payload: { workspaceId: action.payload.workspaceId, FCSFileId: action.payload.FCSFileId } })
        const workspace = _.find(newState.workspaces, w => w.id === action.payload.workspaceId)
        const currentSample = _.find(newState.samples, s => s.FCSFileId === action.payload.FCSFileId && s.gateTemplateId === workspace.selectedGateTemplateId)
        
        if (currentSample) {
            if (newState.gatingModal.visible) {
                console.log('visible')
                newState = applicationReducer(newState, { type: 'SHOW_GATING_MODAL', payload: { selectedXParameterIndex: newState.gatingModal.selectedXParameterIndex, selectedYParameterIndex: newState.gatingModal.selectedYParameterIndex, sampleId: currentSample.id } })
            }
        }

    // --------------------------------------------------
    // Remove a gating error
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATING_ERROR') {
        const gatingError = _.find(newState.gatingErrors, e => e.id === action.payload.gatingErrorId)
        // Pass on to the gating error reducer
        newState.gatingErrors = gatingErrorReducer(newState.gatingErrors, action)
        // Hide the gating error modal if it's visible and looking at the current gating error
        if (newState.gatingModal.visible && newState.gatingModal.gatingErrorId === action.payload.gatingErrorId) {
            newState = applicationReducer(newState, { type: 'SHOW_GATING_MODAL', payload: { selectedXParameterIndex: newState.gatingModal.selectedXParameterIndex, selectedYParameterIndex: newState.gatingModal.selectedYParameterIndex, sampleId: gatingError.sampleId } })
        }
    // --------------------------------------------------
    // Pass on any unmatched actions to workspaceReducer and
    // sampleReducer
    // --------------------------------------------------
    } else {
        newState.FCSFiles = FCSFileReducer(newState.FCSFiles, action)
        newState.workspaces = workspaceReducer(newState.workspaces, action)
        newState.samples = sampleReducer(newState.samples, action)
        newState.gates = gateReducer(newState.gates, action)
        newState.gateTemplates = gateTemplateReducer(newState.gateTemplates, action)
        newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, action)
        newState.gatingErrors = gatingErrorReducer(newState.gatingErrors, action)
    }

    return newState
}

export default applicationReducer