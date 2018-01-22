import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import uuidv4 from 'uuid/v4'
import _ from 'lodash'
import { remote } from 'electron'
const { dialog, Menu, MenuSample } = remote
import path from 'path'
import fs from 'fs'
import sessionHelper from './session-helper.js'
import WorkspaceView from './workspace-view.jsx'

export default class Container extends Component {

    constructor (props) {
        super(props)

        const template = [
            {
                label: 'File',
                submenu: [
                    {label: 'New Workspace', accelerator: 'Cmd+Shift+N', click: this.newWorkspace.bind(this) },
                    {label: 'Save Workspace', accelerator: 'Cmd+S', click: this.showSaveWorkspaceAsDialogBox.bind(this) },
                    {label: 'Open FCS File(s)', accelerator: 'Cmd+Shift+O', click: this.showOpenFCSFileDialog.bind(this) },
                    {label: 'Open Workspace(s)',  accelerator: 'Cmd+O', click: this.showOpenWorkspacesDialog.bind(this) }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    {role: 'undo'},
                    {role: 'redo'},
                    {type: 'separator'},
                    {role: 'cut'},
                    {role: 'copy'},
                    {role: 'paste'},
                    {role: 'pasteandmatchstyle'},
                    {role: 'delete'},
                    {role: 'selectall'}
                ]
            },
            {
                label: 'View',
                submenu: [
                    {role: 'reload'},
                    {role: 'forcereload'},
                    {role: 'toggledevtools'},
                    {type: 'separator'},
                    {role: 'resetzoom'},
                    {role: 'zoomin'},
                    {role: 'zoomout'},
                    {type: 'separator'},
                    {role: 'togglefullscreen'}
                ]
            },
            {
                role: 'window',
                submenu: [
                    {role: 'minimize'},
                    {role: 'close'}
                ]
            },
            {
                role: 'help',
                submenu: [
                    {
                        label: 'Learn More'
                    }
                ]
            }
        ]

        if (process.platform === 'darwin') {
            template.unshift({
                label: remote.app.getName(),
                submenu: [
                    {role: 'about'},
                    {type: 'separator'},
                    {role: 'services', submenu: []},
                    {type: 'separator'},
                    {role: 'hide'},
                    {role: 'hideothers'},
                    {role: 'unhide'},
                    {type: 'separator'},
                    {role: 'quit'}
                ]
            })

            // Edit menu
            template[2].submenu.push(
                {type: 'separator'},
                {
                    label: 'Speech',
                    submenu: [
                        {role: 'startspeaking'},
                        {role: 'stopspeaking'}
                    ]
                }
            )

            // Windows menu
            template[4].submenu = [
                {role: 'close'},
                {role: 'minimize'},
                {role: 'zoom'},
                {type: 'separator'},
                {role: 'front'}
            ]
        }

        // Create the file menu with open, etc
        const menu = Menu.buildFromTemplate(template)
        Menu.setApplicationMenu(menu)

        sessionHelper.setRootComponent(this)
        this.state = sessionHelper.getSessionState()
    }

    newWorkspace () {
        const newId = uuidv4()
        const newWorkspace = {
            id: newId,
            title: "New Workspace",
            samples: []
        }
        this.state.workspaces.push(newWorkspace)
        this.setState({
            workspaces: this.state.workspaces,
            selectedWorkspaceId: newId
        })
        sessionHelper.saveSessionStateToDisk()
        return 
    }

    selectWorkspace (workspaceId) {
        this.setState({
            selectedWorkspaceId: workspaceId
        }, this.saveSessionState.bind(this))
    }

    closeWorkspace (workspaceId, event) {
        let workspaceIndex = _.findIndex(this.state.workspaces, workspace => workspace.id === workspaceId)

        if (workspaceIndex === -1) { return }
        this.state.workspaces.splice(workspaceIndex, 1)
        if (workspaceIndex === this.state.workspaces.length) {
            workspaceIndex--
        }

        // If we closed the workspace that was currently selected, select the next one
        if (workspaceId === this.state.selectedWorkspaceId && this.state.workspaces.length > 0) {
            this.state.selectedWorkspaceId = this.state.workspaces[workspaceIndex].id
        } else if (this.state.workspaces.length === 0) {
            this.state.selectedWorkspaceId = null
        }
        this.setState(this.state, this.saveSessionState.bind(this))
        // Stop propagation to prevent the selectWorkspace event from firing
        event.stopPropagation()
    }

    addNewFCSFilesToWorkspace (filePaths) {
        // Open one or more FCS files and add them to the workspace
        if (filePaths) {
            // Loop through if multiple files were selected
            for (let filePath of filePaths) {
                const sample = {
                    id: uuidv4(),
                    type: "sample",
                    filePath: filePath,
                    title: filePath.split(path.sep).slice(-1), // Returns just the filename without the path
                    description: 'Root Node'
                }

                // If there's no selected workspace, create a new one first
                let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)

                if (!workspace) {
                    workspace = this.newSample()
                }

                workspace.samples.push(sample)
                workspace.selectedSampleId = sample.id
            }
        }
        this.setState({
            workspaces: this.state.workspaces
        })
        sessionHelper.saveSessionStateToDisk()
    }

    openWorkspaceFiles (filePaths) {
        const toReturn = []
        if (filePaths) {
            // Loop through if multiple files were selected
            for (let filePath of filePaths) {
                const workspace = JSON.parse(fs.readFileSync(filePath))
                workspace.filePath = filePath
                toReturn.push(workspace)
            }
        }
        return toReturn
    }

    showSaveWorkspaceAsDialogBox () {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)

        dialog.showSaveDialog({ title: `Save Workspace As:`, message: `Save Workspace As:`, defaultPath: workspace.replace(/\ /g, '-').toLowerCase() + '.json' }, (filePath) => {
            if (filePath) {
                // Prevent runtime state information such as running commands and stdout from being saved to the workspace file
                for (let sample of workspace.samples) {
                    sample.toJSON = function () {
                        return _.omit(this, [ 'filePath', 'runningCommand', 'running', 'error', 'output', 'status', 'stdinInputValue'])
                    };
                }
                fs.writeFile(filePath, JSON.stringify(workspace, null, 4), function (error) {
                    if (error) {
                        return console.log(error);
                    }

                    console.log("The file was saved!");
                });
            }
        })
    }

    showOpenWorkspacesDialog () {
        dialog.showOpenDialog({ title: `Open Workspace File`, filters: [{ name: 'CLR workspace templates', extensions: ['json']}], message: `Open Workspace File`, properties: ['openFile'] }, (filePaths) => {
            const workspace = this.openWorkspaceFiles(filePaths)[0]
            this.state.workspaces.push(workspace)
            this.setState({ workspaces: this.state.workspaces }, this.saveSessionState.bind(this))
        })
    }

    showOpenFCSFileDialog () {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)
        dialog.showOpenDialog({ title: `Open Sample File`, filters: [{ name: 'FCS Files', extensions: ['fcs']}], message: `Open Sample File`, properties: ['openFile', 'multiSelections'] }, (filePaths) => {
            this.addNewFCSFilesToWorkspace(filePaths)
        })
    }

    // Roll up the data that needs to be saved from this object and any children
    getDataRepresentation () {
        for (let i = 0; i < this.state.workspaces.length; i++) {
            let workspace = this.state.workspaces[i]
            const workspaceComponent = this.refs['workspace-' + workspace.id]
            if (workspaceComponent) {
                this.state.workspaces[i] = workspaceComponent.getDataRepresentation()
            }
        }
        return {
            workspaces: this.state.workspaces,
            selectedWorkspaceId: this.state.selectedWorkspaceId
        }
    }

    render () {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)

        const workspaceTabs = this.state.workspaces.map((workspace) => {
            return (
                <div className={`tab${this.state.selectedWorkspaceId === workspace.id ? ' selected' : ''}`} key={workspace.id} onClick={this.selectWorkspace.bind(this, workspace.id)}>
                    <div className='text'>{workspace.title}</div>
                    <div className='close-button' onClick={this.closeWorkspace.bind(this, workspace.id)}><i className='lnr lnr-cross' /></div>
                </div>
            )
        })

        return (
            <div className='container'>
                <div className='tab-bar'>
                    {workspaceTabs}
                </div>
                <div className='container-inner'>
                    <WorkspaceView {...workspace} ref={'workspace-' + workspace.id}/>
                </div>
            </div>
        )
    }
}