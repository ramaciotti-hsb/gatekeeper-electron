/*
* This is the outer application wrapper for command pipeline.
* It kicks off the react application.
*/

import React from 'react'
import ReactDOM from 'react-dom'
import Container from './container.jsx'
import '../scss/container.scss'

document.addEventListener("DOMContentLoaded", () => {
    ReactDOM.render(<Container />, document.getElementById('container-outer'))
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