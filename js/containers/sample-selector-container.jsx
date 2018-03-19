// -------------------------------------------------------------
// A react-redux container for sample-view-outer-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import constants from '../lib/constants'
import SampleSelector from '../components/sample-selector-component.jsx'
import '../../scss/sample-selector-component.scss'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    return { api: state.api, samples: state.samples, selectedSample: ownProps.selectedSample, workspaceId: ownProps.workspaceId }
}

const mapDispatchToProps = dispatch => {
    return {}
}

const SampleSelectorWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(SampleSelector)

export default SampleSelectorWrapped