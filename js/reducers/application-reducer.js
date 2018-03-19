import { combineReducers } from 'redux'
import { removeSample } from '../actions/sample-actions'
import { removeGateTemplate } from '../actions/gate-template-actions'
import { removeGateTemplateGroup, removeGateTemplateFromGroup } from '../actions/gate-template-group-actions.js'
import sampleReducer from './sample-reducer'
import workspaceReducer from './workspace-reducer'
import gateReducer from './gate-reducer'
import gateTemplateReducer from './gate-template-reducer'
import gateTemplateGroupReducer from './gate-template-group-reducer'
import _ from 'lodash'
import path from 'path'
import { remote } from 'electron'
import fs from 'fs'

let initialState = {
    samples: sampleReducer(),
    workspaces: workspaceReducer(),
    gates: gateReducer(),
    gateTemplates: gateTemplateReducer(),
    gateTemplateGroups: gateTemplateGroupReducer(),
    selectedWorkspaceId: null,
    sessionLoading: true, // Display a global loading spinner while the session loads
    api: {}
}

const applicationReducer = (state = initialState, action) => {
    console.log('application reducer start')
    let newState = {
        samples: state.samples ? state.samples.slice(0) : [],
        workspaces: state.workspaces ? state.workspaces.slice(0) : [],
        gates: state.gates ? state.gates.slice(0) : [],
        gateTemplates: state.gateTemplates ? state.gateTemplates.slice(0) : [],
        gateTemplateGroups: state.gateTemplateGroups ? state.gateTemplateGroups.slice(0) : [],
        selectedWorkspaceId: state.selectedWorkspaceId,
        sessionLoading: state.sessionLoading,
        api: state.api
    }

    // --------------------------------------------------
    // Override the whole local session with new data.
    // Usually used when first bootstrapping from DB or 
    // filesystem.
    // --------------------------------------------------
    if (action.type === 'SET_SESSION_STATE') {
        newState.samples = action.payload.samples ? action.payload.samples.slice(0) : []
        newState.workspaces = action.payload.workspaces ? action.payload.workspaces.slice(0) : []
        newState.gates = action.payload.gates ? action.payload.gates.slice(0) : []
        newState.gateTemplates = action.payload.gateTemplates ? action.payload.gateTemplates.slice(0) : []
        newState.gateTemplateGroups = action.payload.gateTemplateGroups ? action.payload.gateTemplateGroups.slice(0) : []
        newState.selectedWorkspaceId = action.payload.selectedWorkspaceId
        newState.sessionLoading = false
    }
    // --------------------------------------------------
    // Selects which "API" object to use. This changes from
    // the web version to electron.
    // --------------------------------------------------
    else if (action.type === 'SET_API') {
        newState.api = action.payload.api
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
    // Create a gate template and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_GATE_TEMPLATE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(state.workspaces, w => w.id === action.payload.workspaceId)
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
        const workspace = _.find(state.workspaces, w => w.id === action.payload.workspaceId)
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
        const workspace = _.find(state.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new sample with the sample reducer
            newState.samples = sampleReducer(newState.samples, { type: 'CREATE_SAMPLE', payload: action.payload.sample })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_SAMPLE_TO_WORKSPACE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'SELECT_SAMPLE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
        } else {
            console.log('CREATE_SAMPLE_AND_ADD_TO_WORKSPACE failed: workspace with id', action.payload.workspaceId, 'was found')   
        }
    // --------------------------------------------------
    // Create a new subsample and a corresponding gate
    // --------------------------------------------------
    } else if (action.type === 'CREATE_SUBSAMPLE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(state.workspaces, w => w.id === action.payload.workspaceId)
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
        // Find all samples related to the workspace being removed
        const workspace = _.find(state.workspaces, w => w.id === action.payload.id)
        const samplesToRemove = workspace.sampleIds
        for (let sample of state.samples) {
            newState.samples = sampleReducer(newState.samples, { type: 'REMOVE_SAMPLE', payload: { id: sample.id } })
        }

        newState.workspaces = workspaceReducer(newState.workspaces, action)
    // --------------------------------------------------
    // Remove a gate template, any child gate templates and unselect if selected
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE') {
        // Find all gate templates that will be affected, including child templates and template groups
        const gateTemplatesToRemove = []
        const gateTemplateGroupsToRemove = []
        const addChildTemplates = (gateTemplateId) => {
            const gateTemplate = _.find(newState.gateTemplates, gt => gt.id === gateTemplateId)
            if (gateTemplateId) {
                gateTemplatesToRemove.push(gateTemplateId)

                const templateGroup = _.find(newState.gateTemplateGroups, g => g.parentGateTemplateId === gateTemplateId)
                if (templateGroup) {
                    gateTemplateGroupsToRemove.push(templateGroup.id)

                    for (let childGateTemplateId of templateGroup.childGateTemplateIds) {
                        addChildTemplates(childGateTemplateId)
                    }
                }
            }
        }

        addChildTemplates(action.payload.gateTemplateId)
        
        for (let gateTemplateId of gateTemplatesToRemove) {
            const removeAction = removeGateTemplate(gateTemplateId)
            // Find the workspace that the gateTemplate is inside and remove it from there
            const workspaceIndex = _.findIndex(state.workspaces, w => w.gateTemplateIds.includes(removeAction.payload.gateTemplateId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(state.workspaces[workspaceIndex])
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
                        console.log('REMOVE_SAMPLE failed: no gateTemplate with id', removeAction.payload.gateTemplateId, 'was found in gateTemplateIds of workspace with id', removeAction.payload.workspaceId)       
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
            const workspaceIndex = _.findIndex(state.workspaces, w => w.gateTemplateGroupIds.includes(removeAction.payload.gateTemplateGroupId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(state.workspaces[workspaceIndex])
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

            newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplates, removeAction)
        }

        // Delete any gates that no longer point to a valid gateTemplate (i.e. their parent or child has been deleted)
        let orphanGates = _.filter(newState.gates, g => !_.find(newState.gateTemplates, gt => g.gateTemplateId === gt.id))
        for (let gate of orphanGates) {
            newState.gates = gateReducer(newState.gates, { type: 'REMOVE_GATE', payload: { gateId: gate.id } })
        }
        // Delete any samples that no longer point to a valid gateTemplate (i.e. their parent or child has been deleted)
        let orphanSamples = _.filter(newState.samples, s => !_.find(newState.gateTemplates, gt => s.gateTemplateId === gt.id))
        for (let sample of orphanSamples) {
            newState.samples = sampleReducer(newState.samples, { type: 'REMOVE_SAMPLE', payload: { sampleId: sample.id } })
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
            if (sampleId) {
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
            const workspaceIndex = _.findIndex(state.workspaces, w => w.sampleIds.includes(newAction.payload.sampleId))

            if (workspaceIndex > -1) {
                const newWorkspace = _.clone(state.workspaces[workspaceIndex])
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
    // Pass on any unmatched actions to workspaceReducer and
    // sampleReducer
    // --------------------------------------------------
    } else {
        newState.workspaces = workspaceReducer(newState.workspaces, action)
        newState.samples = sampleReducer(newState.samples, action)
        newState.gates = gateReducer(newState.gates, action)
        newState.gateTemplates = gateTemplateReducer(newState.gateTemplates, action)
        newState.gateTemplateGroups = gateTemplateGroupReducer(newState.gateTemplateGroups, action)
    }

    console.log('application reducer end')

    return newState
}

export default applicationReducer