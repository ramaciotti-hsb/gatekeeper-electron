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

let heartbeatTime = process.hrtime()[0]

const assetDirectory = process.argv[2]

const getPopulationForSample = require('./lib/get-population-data.js').getPopulationForSample
const getFullSubSamplePopulation = require('./lib/get-population-data.js').getFullSubSamplePopulation
const getImageForPlot = require('./lib/get-image-for-plot.js').default
const PersistentHomology = require('./lib/persistent-homology.js').default
const getFCSMetadata = require('./lib/get-fcs-metadata.js').default
const findIncludedEvents = require('./lib/gate-utilities').findIncludedEvents
const find1DPeaks = require('./lib/1d-homology').default
const importFCSFile = require('./lib/import-fcs-file').default
const expandToIncludeZeroes = require('./lib/gate-utilities').expandToIncludeZeroes
const constants = require('../gatekeeper-utilities/constants').default
const getPlotImageKey = require('../gatekeeper-utilities/utilities').getPlotImageKey
const fs = require('fs')
const _ = require('lodash')
const path = require('path')

const cluster = require('cluster');
const http = require('http');
const url = require('url');
const numCPUs = Math.max(require('os').cpus().length - 2, 1);

if (cluster.isMaster) {
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died, starting a new worker`);
    cluster.fork();
  });
} else {
    console.log(`Child ${process.pid} is running`);

    const handleError = (response, error) => {
        console.log(error)
        response.end(JSON.stringify({ status: constants.STATUS_FAIL, error: error.message }))
    }

    http.createServer((request, response) => {
        let bodyRaw = ''
        request.on('data', chunk => bodyRaw += chunk)
        request.on('end', () => {
            const parsedUrl = url.parse(request.url,true)

            if (parsedUrl.pathname === '/plot_images') {
                const query = parsedUrl.query
                for (let key of ['plotWidth', 'plotHeight', 'minXValue', 'maxXValue', 'minYValue', 'maxYValue', 'selectedXParameterIndex', 'selectedYParameterIndex']) {
                    query[key] = parseFloat(query[key])
                }
                const fileName = getPlotImageKey(query) + '.png'
                fs.readFile(path.join(assetDirectory, 'workspaces', query.workspaceId, query.FCSFileId, query.sampleId, fileName), (err, data) => {
                    if (err) {
                        getPopulationForSample(query.workspaceId, query.FCSFileId, query.sampleId, query).then((population) => {
                            getImageForPlot(query.workspaceId, query.FCSFileId, query.sampleId, population, query).then((newFileName) => {
                                fs.readFile(newFileName, (err, newData) => {
                                    response.writeHead(200, { 'Content-Type' : 'image/png' })         
                                    response.end(newData)
                                })
                            }).catch(handleError.bind(null, response))
                        }).catch(handleError.bind(null, response))
                    } else {
                        response.writeHead(200, { 'Content-Type' : 'image/png' })                       
                        response.end(data)
                    }
                })
            } else {
                response.writeHead(200, { 'Content-Type' : 'application/json' })
                let body = { payload: {} }
                try {
                    body = JSON.parse(bodyRaw)
                } catch (error) {
                    response.end(JSON.stringify('warning: no json was supplied with input'))
                }

                const jobId = body.jobId
                if (body.payload.options) {
                    body.payload.options = _.merge(body.payload.options, { assetDirectory })
                }
// import-fcs-file
                if (body.type === 'import-fcs-file') {
                    importFCSFile(body.payload.workspaceId, body.payload.FCSFileId, body.payload.filePath).then(() => {
                        response.end(JSON.stringify({ success: true }))
                    })

// get-fcs-metadata
                } else if (body.type === 'get-fcs-metadata') {
                    getFCSMetadata(body.payload.workspaceId, body.payload.FCSFileId, body.payload.fileName).then((data) => {
                        response.end(JSON.stringify(data))
                    })

// get-population-data
                } else if (body.type === 'get-population-data') {
                    getPopulation(body.payload.workspaceId, body.payload.FCSFileId, body.payload.sampleId, body.payload.options).then((data) => { response.end(JSON.stringify(data)) }).catch(handleError.bind(null, response))

// save-subsample-to-csv
                } else if (body.type === 'save-subsample-to-csv') {
                    getFullSubSamplePopulation(body.payload.sample, body.payload.FCSFile)
                    .then((data) => {
                        const header = body.payload.FCSFile.FCSParameters.map(p => p.key).join(',') + '\n'
                        fs.writeFile(body.payload.filePath, header, function (error) {
                            fs.appendFile(body.payload.filePath, data.map(p => p[0].join(',')).join('\n'), function (error) {
                                response.end(JSON.stringify({ status: 'success' }))
                            });
                        });
                    }).catch(handleError.bind(null, response))

// find-peaks
                } else if (body.type === 'find-peaks') {
                    getPopulationForSample(body.payload.workspaceId, body.payload.FCSFileId, body.payload.sampleId, body.payload.options).then((population) => {
                        const homology = new PersistentHomology(population, body.payload.options)
                        let percentageComplete = 0
                        const data = homology.findPeaks((message) => {
                            // console.log({ jobId: jobId, type: 'loading-update', data: message })
                            // response.send({ jobId: jobId, type: 'loading-update', data: message })
                        })
                        response.end(JSON.stringify(data))
                    }).catch(handleError.bind(null, response))

// find-peaks-with-templates
                } else if (body.type === 'find-peaks-with-template') {
                    getPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((population) => {
                        const homology = new PersistentHomology(population, body.payload.options)
                        let percentageComplete = 0
                        const data = homology.findPeaksWithTemplate((message) => {
                            // console.log({ jobId: jobId, type: 'loading-update', data: message })
                            // response.send({ jobId: jobId, type: 'loading-update', data: message })
                        }, body.payload.gateTemplates)
                        response.end(JSON.stringify(data))
                    }).catch(handleError.bind(null, response))
                                    
// get-expanded-gates
                } else if (body.type === 'get-expanded-gates') {
                    getPopulationForSample(body.payload.workspaceId, body.payload.FCSFileId, body.payload.sampleId, body.payload.options).then((population) => {
                        const xOptions = _.clone(body.payload.options)
                        xOptions.knownPeaks = xOptions.sampleXChannelZeroPeaks
                        const xCutoffs = find1DPeaks(population.zeroDensityX.densityMap, population.maxDensity, xOptions)
                        
                        const yOptions = _.clone(body.payload.options)
                        yOptions.knownPeaks = xOptions.sampleYChannelZeroPeaks
                        const yCutoffs = find1DPeaks(population.zeroDensityY.densityMap, population.maxDensity, yOptions)

                        const expandedGates = expandToIncludeZeroes(xCutoffs, yCutoffs, body.payload.gates, body.payload.options)
                        response.end(JSON.stringify(expandedGates))
                    }).catch(handleError.bind(null, response))

// get-included-events
                } else if (body.type === 'get-included-events') {
                    getPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((population) => {
                        const alteredGates = findIncludedEvents(body.payload.gates, population, body.payload.FCSFile, body.payload.options)
                        response.end(JSON.stringify(alteredGates))
                    }).catch(handleError.bind(null, response))
                }
            }  
        })
    }).listen(3145);
}

process.on('disconnect', function() {
  console.log('parent exited')
  process.exit();
});