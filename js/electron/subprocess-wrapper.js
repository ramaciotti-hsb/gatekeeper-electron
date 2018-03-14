// -------------------------------------------------------------
// IPC wrapper for running cpu intensive subprocess tasks
// -------------------------------------------------------------

const whitelist = ['d3-scale']
require('babel-polyfill')
require("babel-register")({
    "presets": ["env"],
    ignore: function (filename) {
        var ignore = false

        if (filename.match('/node_modules/')) {
            ignore = true

            for (var i = 0, len = whitelist.length; i < len; i++) {
                var moduleName = whitelist[i]

                if (filename.match('/' + moduleName + '/')) {
                    ignore = false
                    break
                }
            }
        }

        return ignore
    }
})

const getSubPopulation = require('../lib/get-population-data.js').default
const getImageForPlot = require('../lib/get-image-for-plot.js').default
const PersistentHomology = require('../lib/persistent-homology.js').default

process.on('message', (options) => {
    process.stdout.write(JSON.stringify({ jobId: options.jobId, data: 'Recieved message'}))
    const jobId = options.jobId
    if (options.type === 'get-population-data') {
        getSubPopulation(options.payload.sample, options.payload.options).then((data) => {
            process.stdout.write(JSON.stringify({ jobId: options.jobId, data: 'Finished job on worker side'}))
            process.send({ jobId: jobId, type: 'complete', data: data })
        }).catch((error) => {
            process.stderr.write({ jobId, data: JSON.stringify(error) })
        })
    } else if (options.type === 'get-image-for-plot') {
        getImageForPlot(options.payload.sample, options.payload.subPopulation, options.payload.options).then((path) => {
            process.send({ jobId: jobId, type: 'complete', data: path })
        }).catch((error) => {
            process.stderr.write({ jobId, data: JSON.stringify(error) })
        })
    } else if (options.type === 'find-peaks') {
        const homology = new PersistentHomology(options.payload)
        let percentageComplete = 0
        const truePeaks = homology.findPeaks((message) => {
            // console.log({ jobId: jobId, type: 'loading-update', data: message })
            process.send({ jobId: jobId, type: 'loading-update', data: message })
        })
        process.send({ jobId: jobId, type: 'complete', data: truePeaks })
    } else if (options.type === 'find-peaks-with-template') {
        const homology = new PersistentHomology(options.payload)
        let percentageComplete = 0
        const truePeaks = homology.findPeaksWithTemplate((message) => {
            process.send({ jobId: jobId, type: 'loading-update', message })
        })
        process.send({ jobId: jobId, type: 'complete', data: truePeaks })
    }
})