// -------------------------------------------------------------------------
// React component for rendering a scrollable selector for enabling and
// disabling fcs file parameters
// -------------------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/fcs-parameter-selector.scss'

export default class FCSParameterSelector extends Component {

    constructor (props) {
        super(props)
    }

    toggleParameter (key) {
        this.props.api.toggleFCSParameterEnabled(this.props.selectedWorkspace.id, key)
    }

    render () {
        const parameters = this.props.selectedFCSFile.FCSParameters.map((parameter) => {
            const disabled = this.props.selectedWorkspace.disabledParameters && this.props.selectedWorkspace.disabledParameters[parameter.key]
            return (
                <div className={'parameter-row ' + (disabled ? 'disabled' : 'enabled')} key={parameter.key} onClick={this.toggleParameter.bind(this, parameter.key)}>
                    <i className={'lnr ' + (disabled ? 'lnr-circle-minus' : 'lnr-checkmark-circle')} />
                    <div className='text'>{parameter.label}</div>
                </div>
            )
        })
        return (
            <div className='parameter-selector-outer' style={{ width: this.props.showDisabledParameters ? 'auto' : 0 }}>
                <div className='header'>Toggle Parameters</div>
                <div className='parameter-selector-inner'>
                    {parameters}
                </div>
                <div className='close-tab' onClick={this.props.api.toggleShowDisabledParameters} >
                    <div className='arrow top' />
                    <i className={'lnr lnr-chevron-' + (this.props.showDisabledParameters ? 'left' : 'right')} />
                    <div className='arrow bottom' />
                </div>
            </div>
        )
    }
}