// -------------------------------------------------------------
// Listens for keyboard events on the body and passes them on
// to registered listeners.
// -------------------------------------------------------------

import _ from 'lodash'

const keyListeners = {}

const keypressHandler = (event) => {
    for (let listener of _.values(keyListeners)) {
        if (listener['key'] === event.keyCode) {
            listener.listener(event)            
        }
    }
}

export const initialize = (event) => {
    document.body.addEventListener('keydown', keypressHandler)
}

export const registerKeyListener = (listenerId, key, listener) => {
    keyListeners[listenerId] = { key, listener }
}

export const deregisterKeyListener = (listenerId, key, listener) => {
    delete keyListeners[listenerId]
}