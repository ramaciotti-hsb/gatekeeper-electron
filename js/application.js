// -------------------------------------------------------------
// This is the outer application wrapper for Gatekeeper.
// It kicks off the react application.
// -------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { createStore, applyMiddleware } from 'redux'
import Application from './containers/application-container.jsx'
import applicationReducer from './reducers/application-reducer'
import '../scss/container.scss'
import { setStore, api } from './gatekeeper-electron/electron-backend.js'
import { initialize } from './lib/global-keyboard-listener'

const store = createStore(applicationReducer)

window.store = store

setStore(store)

document.addEventListener("DOMContentLoaded", async () => {
    ReactDOM.render(<Provider store={store}><Application /></Provider>, document.getElementById('container-outer'))
    store.dispatch({ type: 'SET_API', payload: { api } })
    await api.getSession()
    initialize()
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