/*
* This is the outer application wrapper for command pipeline.
* It kicks off the react application.
*/

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { createStore, applyMiddleware } from 'redux'
import Application from './containers/application-container.jsx'
import applicationReducer from './reducers/application-reducer'
import asyncDispatchMiddleware from './lib/async-dispatch-middleware'
import '../scss/container.scss'

const store = createStore(applicationReducer, applyMiddleware(asyncDispatchMiddleware))

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