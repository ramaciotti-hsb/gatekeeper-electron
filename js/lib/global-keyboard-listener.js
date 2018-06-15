// -------------------------------------------------------------
// Listens for keyboard events on the body and passes them on
// to registered listeners.
// -------------------------------------------------------------

import _ from 'lodash'

const escapeKeyListeners = {}

const keypressHandler = (event) => {
    // Escape key
    if (event.keyCode === 27) {
        for (let listener of _.values(escapeKeyListeners)) {
            listener(event)
        }
    }
}

export const initialize = (event) => {
    document.body.addEventListener('keydown', keypressHandler)
}

export const registerEscapeKeyListener = (key, listener) => {
    escapeKeyListeners[key] = listener
}

export const unregisterEscapeKeyListener = (key, listener) => {
    delete escapeKeyListeners[key]
}