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
        this.state = {
            filterValue: ''
        }
    }

    onFilter (event) {
        this.setState({
            filterValue: event.target.value
        })
    }

    render () {
        const parameters = _.filter(this.props.selectedFCSFile.FCSParameters, p => p.key.toLowerCase().match(this.state.filterValue.toLowerCase()) || p.label.toLowerCase().match(this.state.filterValue.toLowerCase())).map((parameter) => {
            const disabled = this.props.selectedWorkspace.disabledParameters && this.props.selectedWorkspace.disabledParameters[parameter.key]
            return (
                <div className={'parameter-row ' + (disabled ? 'disabled' : 'enabled')} key={parameter.key} onClick={this.props.api.setFCSParametersDisabled.bind(null, this.props.selectedWorkspace.id, { [parameter.key]: !disabled })}>
                    <i className={'lnr ' + (disabled ? 'lnr-circle-minus' : 'lnr-checkmark-circle')} />
                    <div className='text'>{parameter.label}</div>
                </div>
            )
        })

        const disabledKeys = _.filter(_.keys(this.props.selectedWorkspace.disabledParameters), k => _.find(this.props.selectedFCSFile.FCSParameters, p => p.key === k))
        let someDisabled = false
        disabledKeys.map((k) => {
            someDisabled = this.props.selectedWorkspace.disabledParameters[k] || someDisabled
        })

        return (
            <div className='parameter-selector-outer' style={{ width: this.props.showDisabledParameters ? 'auto' : 0, minWidth: this.props.showDisabledParameters ? 200 : 0 }}>
                <div className='header'>Toggle Parameters</div>
                <div className='parameter-row toggle-all' onClick={someDisabled ?
                    this.props.api.setFCSParametersDisabled.bind(null, this.props.selectedWorkspace.id, _.zipObject(this.props.selectedFCSFile.FCSParameters.map(p => p.key), this.props.selectedFCSFile.FCSParameters.map(p => false))) :
                    this.props.api.setFCSParametersDisabled.bind(null, this.props.selectedWorkspace.id, _.zipObject(this.props.selectedFCSFile.FCSParameters.map(p => p.key), this.props.selectedFCSFile.FCSParameters.map(p => true))) }>
                    <i className={'lnr lnr-menu-circle'} />
                    <div className='text'>{someDisabled ? 'Enable All' : 'Disable All'}</div>
                </div>
                <div className='parameter-row filter'>
                    <i className={'lnr lnr-magnifier'} />
                    <input type='text' placeholder='Filter' value={this.state.filterValue} onChange={this.onFilter.bind(this)} />
                </div>
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