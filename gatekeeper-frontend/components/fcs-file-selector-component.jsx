import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import Dropdown from '../lib/dropdown-inline.jsx'
import constants from '../../gatekeeper-utilities/constants'
import uuidv4 from 'uuid/v4'
import FCSParameterSelector from '../containers/fcs-parameter-selector-container.jsx'
import MultipleSampleView from '../containers/multiple-sample-view-container.jsx'
import { registerKeyListener, deregisterKeyListener } from '../lib/global-keyboard-listener'

export default class FCSFileSelector extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            containerWidth: 1000
        }
    }

    updateContainerSize () {
        this.setState({ containerWidth: this.refs.container.offsetWidth })
    }

    arrowKeyPressed (characterCode) {
        // Don't allow the user to switch between FCS files if there are unsaved gates in a gating modal
        if (this.props.unsavedGates) {
            console.log('Warning: arrow key navigation of FCS files is disabled while unsaved gates exist.')
            return
        }
        // Get the index of the currently selected FCS file
        let index = _.findIndex(this.props.FCSFiles, fcs => fcs.id === this.props.selectedFCSFile.id)
        console.log(index, this.props.FCSFiles.length)
        let newIndex = index
        if (characterCode === constants.CHARACTER_CODE_LEFT_ARROW && index > 0) {
            newIndex = index - 1
        }

        if (characterCode === constants.CHARACTER_CODE_RIGHT_ARROW && index < this.props.FCSFiles.length - 1) {
            newIndex = index + 1
        }

        if (index !== newIndex) {
            this.props.api.selectFCSFile(this.props.FCSFiles[newIndex].id, this.props.workspaceId)
        }
    }

    componentDidMount () {
        this.updateContainerSize()
        this.resizeFunction = _.debounce(this.updateContainerSize.bind(this), 100)
        window.addEventListener('resize', this.resizeFunction)
        // Bind the left and right arrow keys to switch between samples
        this.leftKeyListenerId = uuidv4()
        this.rightKeyListenerId = uuidv4()
        registerKeyListener(this.leftKeyListenerId, constants.CHARACTER_CODE_LEFT_ARROW, this.arrowKeyPressed.bind(this, constants.CHARACTER_CODE_LEFT_ARROW))
        registerKeyListener(this.rightKeyListenerId, constants.CHARACTER_CODE_RIGHT_ARROW, this.arrowKeyPressed.bind(this, constants.CHARACTER_CODE_RIGHT_ARROW))
    }

    componentWillUnmount () {
        window.removeEventListener('resize', this.resizeFunction)   
    }

    selectFCSFile (FCSFileId) {
        this.refs['FCSFileDropdown'].getInstance().hideDropdown()
        this.props.api.selectFCSFile(FCSFileId, this.props.workspaceId)   
    }

    selectMachineType (FCSFileId, machineType) {
        this.refs['machineTypeDropdown'].getInstance().hideDropdown()
        this.props.api.updateFCSFile(FCSFileId, { machineType })
    }

    render () {
        let inner

        if (this.props.FCSFiles.length > 0) {
            let multipleSampleView
            if (this.props.selectedFCSFile && this.props.selectedSample) {
                multipleSampleView = <MultipleSampleView FCSFileId={this.props.selectedFCSFile.id} sampleId={this.props.selectedSample.id} />
            }

            const FCSFiles = this.props.FCSFiles.map((FCSFile) => {
                const isSelected = FCSFile.id === this.props.selectedFCSFile.id
                return {
                    value: FCSFile.title,
                    component: (
                        <div className={'item' + (isSelected ? ' selected' : '')} onClick={isSelected ? () => {} : this.selectFCSFile.bind(this, FCSFile.id, this.props.workspaceId)} key={FCSFile.id}>
                            <div className='text'>{FCSFile.title}</div>
                            <div className='dot' />
                        </div>
                    )
                }
            })

            const machineTypes = [
                {
                    key: constants.MACHINE_FLORESCENT,
                    label: 'Florescent'
                },
                {
                    key: constants.MACHINE_CYTOF,
                    label: 'Mass Cytometry'
                }
            ]

            const machineTypesRendered = machineTypes.map((machineType) => {
                return {
                    value: machineType.label,
                    component: <div className='item' onClick={this.selectMachineType.bind(this, this.props.selectedFCSFile.id, machineType.key)} key={machineType.key}>{machineType.label}</div>
                }
            })

            let machineTypeMessage
            if (this.props.selectedFCSFile && this.props.selectedFCSFile.machineType) {
                machineTypeMessage = 'Machine Type: ' + _.find(machineTypes, m => m.key === this.props.selectedFCSFile.machineType).label
            } else {
                machineTypeMessage = 'Loading...'
            }

            inner = (
                <div className='fcs-file-selector-inner'>
                    <div className='header'>
                        <div className='fcs-file-selector-dropdown'><Dropdown items={FCSFiles} textLabel={this.props.selectedFCSFile ? this.props.selectedFCSFile.title : 'Select FCSFile'} ref='FCSFileDropdown' /></div>
                        <div className={'button delete' + (this.state.containerWidth < 1200 ? ' compact' : '')} onClick={this.props.api.removeFCSFile.bind(null, this.props.selectedFCSFile.id)}>
                            <i className='lnr lnr-cross-circle'></i>
                            <div className='text'>Remove File From Workspace</div>
                        </div>
                        <div className='machine-type-selector-dropdown'><Dropdown items={machineTypesRendered} textLabel={machineTypeMessage} ref='machineTypeDropdown' /></div>
                        <div className='divider' />
                        <div className={'button jobs' + (this.state.containerWidth < 1200 ? ' compact' : '') + (this.props.backgroundJobsEnabled ? ' enabled' : ' disabled')} onClick={this.props.api.setBackgroundJobsEnabled.bind(this, !this.props.backgroundJobsEnabled)}>
                            <i className='lnr lnr-cloud-sync'></i>
                            <div className='text'>Background Jobs {this.props.backgroundJobsEnabled ? 'Enabled' : 'Disabled'}</div>
                        </div>
                    </div>
                    <div className='container-horizontal'>
                        <FCSParameterSelector />
                        {multipleSampleView}
                    </div>
                </div>
            )
        } else {
            inner = (
                <div className='fcs-file-selector-inner empty'>
                    <div>Drag and drop FCS Files or use Use File -> Add to workspace to add an FCSFile.</div>
                </div>
            )
        }

        return (
            <div className='fcs-file-selector-outer' ref='container'>
                {inner}
            </div>
        )
    }
}