import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import { remote } from 'electron'
import path from 'path'
const { dialog, Menu, MenuSample } = remote
import Workspace from '../containers/workspace-container.jsx'

export default class Application extends Component {

    constructor (props) {
        super(props)
        console.log(props)

        const template = [
            {
                label: 'File',
                submenu: [
                    {label: 'New Workspace', accelerator: 'Cmd+Shift+N', click: this.newWorkspace.bind(this) },
                    {label: 'Save Workspace', accelerator: 'Cmd+S' },//, click: this.showSaveWorkspaceAsDialogBox.bind(this) },
                    {label: 'Open FCS File(s)', accelerator: 'Cmd+Shift+O', click: this.showOpenFCSFileDialog.bind(this) },
                    {label: 'Open Workspace(s)',  accelerator: 'Cmd+O' }//, click: this.showOpenWorkspacesDialog.bind(this) }
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
                label: 'Auto Gating',
                submenu: [
                    {
                        label: 'Recursive Gating',
                        submenu: [
                            { label: 'Persistant Homology' }
                        ]
                    }
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
            template[5].submenu = [
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
    }

    newWorkspace () {
        this.props.api.createWorkspace({
            title: "New Workspace",
            samples: []
        })
    }

    selectWorkspace (workspaceId) {
        this.props.api.selectWorkspace(workspaceId)
    }

    closeWorkspace (workspaceId, event) {
        this.props.api.removeWorkspace(workspaceId)
        // Stop propagation to prevent the selectWorkspace event from firing
        event.stopPropagation()
    }

    addNewFCSFilesToWorkspace (filePaths) {
        // Open one or more FCS files and add them to the workspace
        if (filePaths) {
            // Loop through if multiple files were selected
            for (let filePath of filePaths) {
                if (!filePath) { console.log("Error: undefined FCS file passed to readFCSFileData"); continue }

                const sample = {
                    type: "sample",
                    filePath: filePath,
                    title: filePath.split(path.sep).slice(-1), // Returns just the filename without the path
                    description: 'Root Sample',
                }
                this.props.api.createSampleAndAddToWorkspace(this.props.selectedWorkspaceId, this.props.selectedGateTemplateId, sample)
            }
        }
    }

    // TODO
    // openWorkspaceFiles (filePaths) {
    //     const toReturn = []
    //     if (filePaths) {
    //         // Loop through if multiple files were selected
    //         for (let filePath of filePaths) {
    //             const workspace = JSON.parse(fs.readFileSync(filePath))
    //             workspace.filePath = filePath
    //             toReturn.push(workspace)
    //         }
    //     }
    //     return toReturn
    // }

    // TODO
    // showSaveWorkspaceAsDialogBox () {
    //     let workspace = _.find(this.props.workspaces, workspace => workspace.id === this.props.selectedWorkspaceId)

    //     dialog.showSaveDialog({ title: `Save Workspace As:`, message: `Save Workspace As:`, defaultPath: workspace.replace(/\ /g, '-').toLowerCase() + '.json' }, (filePath) => {
    //         if (filePath) {
    //             // Prevent runtime state information such as running commands and stdout from being saved to the workspace file
    //             for (let sample of workspace.samples) {
    //                 sample.toJSON = function () {
    //                     return _.omit(this, [ 'filePath', 'runningCommand', 'running', 'error', 'output', 'status', 'stdinInputValue'])
    //                 };
    //             }
    //             fs.writeFile(filePath, JSON.stringify(workspace, null, 4), function (error) {
    //                 if (error) {
    //                     return console.log(error);
    //                 }

    //                 console.log("The file was saved!");
    //             });
    //         }
    //     })
    // }

    // TODO
    // showOpenWorkspacesDialog () {
    //     dialog.showOpenDialog({ title: `Open Workspace File`, filters: [{ name: 'CLR workspace templates', extensions: ['json']}], message: `Open Workspace File`, properties: ['openFile'] }, (filePaths) => {
    //         const workspace = this.openWorkspaceFiles(filePaths)[0]
    //         this.props.workspaces.push(workspace)
    //         this.setState({ workspaces: this.props.workspaces }, this.saveSessionState.bind(this))
    //     })
    // }

    showOpenFCSFileDialog () {
        let workspace = _.find(this.props.workspaces, workspace => workspace.id === this.props.selectedWorkspaceId)
        dialog.showOpenDialog({ title: `Open Sample File`, filters: [{ name: 'FCS Files', extensions: ['fcs']}], message: `Open Sample File`, properties: ['openFile', 'multiSelections'] }, (filePaths) => {
            this.addNewFCSFilesToWorkspace(filePaths)
        })
    }

    render () {
        let workspace = _.find(this.props.workspaces, workspace => workspace.id === this.props.selectedWorkspaceId)

        const workspaceTabs = this.props.workspaces.map((workspace) => {
            return (
                <div className={`tab${this.props.selectedWorkspaceId === workspace.id ? ' selected' : ''}`} key={workspace.id} onClick={this.selectWorkspace.bind(this, workspace.id)}>
                    <div className='text'>{workspace.title}</div>
                    <div className='close-button' onClick={this.closeWorkspace.bind(this, workspace.id)}><i className='lnr lnr-cross' /></div>
                </div>
            )
        })

        let workspaceView

        if (workspace) {
            workspaceView = <Workspace workspaceId={this.props.selectedWorkspaceId} ref={'workspace-' + workspace.id}/>
        }

        return (
            <div className='container'>
                <div className={`loader-outer${this.props.sessionLoading ? ' active' : ''}`}><div className='loader'></div></div>
                <div className='tab-bar'>
                    {workspaceTabs}
                </div>
                <div className='container-inner'>
                    {workspaceView}
                </div>
            </div>
        )
    }
}