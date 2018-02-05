/*
* This is the outer application wrapper for command pipeline.
* It kicks off the react application.
*/

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import Application from './containers/application-container.jsx'
import '../scss/container.scss'
import applicationReducers from './reducers/application-reducers'

const store = createStore(applicationReducers)

window.store = store

document.addEventListener("DOMContentLoaded", () => {
    ReactDOM.render(<Provider store={store}><Application /></Provider>, document.getElementById('container-outer'))
})

document.addEventListener('dragleave', function (event) {
  event.preventDefault();
  return false;
}, false);

document.addEventListener('dragend', function (event) {
  event.preventDefault();
  return false;
}, false);

document.addEventListener('dragover', function (event) {
  event.preventDefault();
  return false;
}, false);

document.addEventListener('drop', function (event) {
  event.preventDefault();
  return false;
}, false);