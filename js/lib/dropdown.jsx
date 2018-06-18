// -------------------------------------------------------------
// This file contains a react.js component that renders a dropdown
// menu.
// -------------------------------------------------------------

import React                from 'react'
import { Component }        from 'react'
import ReactDOM             from 'react-dom'
import _                    from 'lodash'
import constants            from 'constants'
import OnClickOutside       from 'react-onclickoutside'
import uuidv4               from 'uuid/v4'
import                           '../../scss/dropdown.scss'
import { registerKeyListener, deregisterKeyListener } from './global-keyboard-listener'

/* REQUIRED MARKUP FOR Dropdown CHILDREN:
<Dropdown>
    <div className='inner'>
        <i className='icon fa fa-gear'></i>
        <div className='menu'>
            <div className='menu-header'>Account Settings</div>
            <div className='menu-inner'>
                <Link to='/app/settings/password' className='item'><i className='icon fa fa-key'></i><div>Email & Password</div></Link>
                <Link to='/app/settings/billing' className='item'><i className='icon fa fa-credit-card'></i><div>Billing</div></Link>
                <a href='mailto:contact@manageflitter.com' className='item'><i className='icon fa fa-phone'></i><div>Support</div></a>
                <a onClick={this.logout} className={'item' + (this.state.logoutLoading ? ' loading' : '')}><i className='icon fa fa-arrow-circle-o-left'></i><div>Logout</div></a>
            </div>
        </div>
    </div>
</Dropdown>
*/

// The outer menu react element
class Dropdown extends Component {

    constructor (props) {
        super(props)
        this.state = {
            logoutLoading: false,
            dropdownVisible: false
        }
    }

    showDropdown (event) {
        if (this.props.onShow) {
            this.props.onShow();
        }
        if (this.state.dropdownVisible === false) {
            this.setState({ dropdownVisible: true });
        }
        event.stopPropagation();
    }

    hideDropdown () {
        if (this.props.onHide) {
            this.props.onHide();
        }
        this.setState({ dropdownVisible: false });
    }

    handleClickOutside () {
        this.hideDropdown();
    }

    componentDidMount () {
        this.keyboardListenerId = uuidv4()
        // Hide the dropdown when the escape key is pressed
        registerKeyListener(this.keyboardListenerId, constants.CHARACTER_CODE_ESCAPE, this.hideDropdown.bind(this))
    }

    componentWillUnmount () {
        deregisterKeyListener(this.keyboardListenerId)   
    }
    
    render () {
        return (
            <div className={this.props.outerClasses + ' dropdown' + (this.state.dropdownVisible ? ' active' : '')} onClick={this.showDropdown.bind(this)}>
                { React.cloneElement(this.props.children, {}) }
            </div>
        )
    }
}

export default OnClickOutside(Dropdown)