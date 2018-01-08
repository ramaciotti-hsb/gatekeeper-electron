import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import uuidv4 from 'uuid/v4'
import _ from 'lodash'
import { remote } from 'electron'
const { dialog, Menu, MenuSample } = remote
import sudo from 'electron-sudo'
import path from 'path'
import fs from 'fs'
import SampleView from './sample-view.jsx'
import kill from 'tree-kill'
import shellPath from 'shell-path'
import homePath from 'user-home'
import FCS from 'fcs'
const childProcess = require('child_process')

export default class Container extends Component {

    constructor (props) {
        super(props)
        const newId = uuidv4()
        this.state = {
            selectedWorkspaceId: newId,
            workspaces: [
                {
                    id: newId,
                    title: 'New Workspace',
                    samples: []
                }
            ]
        }

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

        // Load the workspaces and samples the user last had open when the app was used
        const sessionFilePath = path.join(remote.app.getPath('userData'), 'session.json')
        try {
            const session = JSON.parse(fs.readFileSync(sessionFilePath))
            if (!session.workspaces) { return }
            for (let workspace of session.workspaces) {
                if (!workspace.samples) { break }
                for (let sample of workspace.samples) {
                    if (sample.filePath) {
                        fs.readFile(sample.filePath, (error, buffer) => {
                            if (error) {
                                console.log('Error reading FCS file: ', error)
                            } else {
                                workspace = _.find(this.state.workspaces, ws => ws.id === workspace.id)
                                sample = _.find(workspace.samples, s => s.id === sample.id)
                                sample.FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
                                this.setState({
                                    workspaces: this.state.workspaces
                                })
                            }
                        })
                    }
                }
            }
            this.state = _.merge(this.state, session)
        } catch (error) {
            // If there's no session file, create one
            if (error.code === 'ENOENT') {
                fs.writeFile(sessionFilePath, JSON.stringify(this.state), () => {})
            } else {
                console.log(error)
            }
        }
    }

    saveSessionState () {
        const sessionFilePath = path.join(remote.app.getPath('userData'), 'session.json')
        // Prevent runtime state information such as running commands and stdout from being saved to the workspace file
        for (let workspace of this.state.workspaces) {
            for (let sample of workspace.samples) {
                sample.toJSON = function () {
                    return _.omit(this, [ 'FCSFile' ])
                };
            }
        }
        fs.writeFile(sessionFilePath, JSON.stringify(this.state, null, 4), () => {})
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
        this.saveSessionState()
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

    deleteSample (sampleId) {
        // Only allow deletion of samples in the currently selected workspace
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)

        let sampleIndex = _.findIndex(workspace.samples, (sample) => {
            return sample.id === sampleId
        })

        if (sampleIndex === -1) { return }
        workspace.samples.splice(sampleIndex, 1)
        if (sampleIndex === workspace.samples.length) {
            sampleIndex--
        }
        // If there are still any samples left in the workspace, select the next one
        if (sampleIndex >= 0) {
            workspace.selectedSampleId = workspace.samples[sampleIndex].id
        }
        this.setState({
            workspaces: this.state.workspaces
        })
        this.saveSessionState()
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
                    FCSFile: new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, fs.readFileSync(filePath)),
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
        this.saveSessionState()
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

    exportSampleToFile (sampleId) {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)

        const sample = _.find(workspace.samples, sample => sample.id === sampleId)

        if (!sample) { return }

        dialog.showSaveDialog({ title: `Save ${sample.title}`, defaultPath: (sample.workingDirectory ? sample.workingDirectory.replace('\\', '') : homePath) + sample.title.replace(/\ /g, '-').toLowerCase() + '.json', message: `Save ${sample.title}` }, (filePath) => {
            if (filePath) {
                fs.writeFile(filePath, JSON.stringify(sample, null, 4), function (error) {
                    if (error) {
                        return console.log(error);
                    }

                    console.log("The file was saved!");
                });
            }
        })
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

    selectSample (sampleId) {
        const workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)
        workspace.selectedSampleId = sampleId

        const sample = _.find(workspace.samples, sample => sample.id === sampleId)

        if (sample && sample.filePath) {
            fs.readFile(sample.filePath, (error, buffer) => {
                if (error) {
                    console.log('Error reading FCS file: ', error)
                } else {
                    sample.FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
                    this.setState({
                        workspaces: this.state.workspaces
                    })
                }
            })
        }
        this.setState({
            workspaces: this.state.workspaces
        }, () => { this.saveSessionState() })
    }

    // Updates a property of a sample
    updateSample (sampleId, key, value) {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)
        const sample = _.find(workspace.samples, (sample) => {
            return sample.id === sampleId
        })

        if (!sample) { return }

        sample[key] = value
        this.setState({
            workspaces: this.state.workspaces
        })
    }

    render () {
        let workspace = _.find(this.state.workspaces, workspace => workspace.id === this.state.selectedWorkspaceId)
        const workspacesSamplesRendered = workspace.samples.map((sample, index) => {
            return (
                <div className={'sidebar-sample' + (sample.id === workspace.selectedSampleId ? ' selected' : '')} key={index} onClick={this.selectSample.bind(this, sample.id)}>
                    <div className='body'>
                        <div className='title'>{sample.title}</div>
                        <div className='description'>{sample.description}</div>
                    </div>
                </div>
            )
        })

        const sample = _.find(workspace.samples, (sample) => {
            return sample.id === workspace.selectedSampleId
        })

        let panel = <div className='panel'></div>

        if (sample) {
            if (sample.type === 'sample') {
                panel = <SampleView ref={'sampleView'} {...sample}
                    exportSampleToFile={this.exportSampleToFile.bind(this, sample.id)}
                    deleteSample={this.deleteSample.bind(this, sample.id)}
                />
            }
        }

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
                    <div className='sidebar'>
                        {workspacesSamplesRendered}
                    </div>
                    {panel}
                </div>
            </div>
        )
    }
}