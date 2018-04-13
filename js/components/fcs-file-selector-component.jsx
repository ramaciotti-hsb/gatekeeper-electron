import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import Dropdown from '../lib/dropdown-inline.jsx'
import constants from '../lib/constants'
import MultipleSampleView from '../containers/multiple-sample-view-container.jsx'

export default class FCSFileSelector extends Component {
    
    constructor(props) {
        super(props)
        this.state = {}
    }

    selectFCSFile (FCSFileId) {
        this.refs['FCSFileDropdown'].getInstance().hideDropdown()
        this.props.api.selectFCSFile(FCSFileId, this.props.workspaceId)   
    }

    render () {
        let inner

        if (this.props.FCSFiles.length > 0) {
            let multipleSampleView
            if (this.props.selectedFCSFile && this.props.selectedSample) {
                multipleSampleView = <MultipleSampleView FCSFileId={this.props.selectedFCSFile.id} sampleId={this.props.selectedSample.id} />
            }

            const FCSFiles = this.props.FCSFiles.map((FCSFile) => {
                return {
                    value: FCSFile.title,
                    component: <div className='item' onClick={this.selectFCSFile.bind(this, FCSFile.id, this.props.workspaceId)} key={FCSFile.id}>{FCSFile.title}</div>
                }
            })

            inner = (
                <div className='fcs-file-selector-inner'>
                    <div className='header'>
                        <div className='fcs-file-selector-dropdown'><Dropdown items={FCSFiles} textLabel={this.props.selectedFCSFile ? this.props.selectedFCSFile.title : 'Select FCSFile'} ref='FCSFileDropdown' /></div>
                        <div className='button' onClick={this.props.api.removeFCSFile.bind(null, this.props.selectedFCSFile.id)}><i className='lnr lnr-cross-circle'></i>Remove File From Workspace</div>
                    </div>
                    {multipleSampleView}
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
            <div className='fcs-file-selector-outer'>
                {inner}
            </div>
        )
    }
}