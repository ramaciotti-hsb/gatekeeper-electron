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

let heartbeatTime = process.hrtime()[0]

const getSubPopulation = require('../lib/get-population-data.js').default
const getImageForPlot = require('../lib/get-image-for-plot.js').default
const PersistentHomology = require('../lib/persistent-homology.js').default
const getFCSMetadata = require('../lib/get-fcs-metadata.js').default

const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length - 1;

if (cluster.isMaster) {
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
    console.log(`Child ${process.pid} is running`);
    const populationCache = {}

    http.createServer((req, res) => {
        res.writeHead(200);
        let bodyRaw = ''
        req.on('data', chunk => bodyRaw += chunk)
        req.on('end', () => {
            const body = JSON.parse(bodyRaw)
            const jobId = body.jobId
            if (body.type === 'heartbeat') {
                heartbeatTime = process.hrtime()[0]
            } else {
                if (body.type === 'get-fcs-metadata') {
                    getFCSMetadata(body.payload.filePath).then((data) => {
                        process.stdout.write(JSON.stringify({ jobId: body.jobId, data: 'Finished job on worker side'}))
                        res.end(JSON.stringify(data))
                    })
                } else if (body.type === 'get-population-data') {
                    const key = `${body.payload.sample.id}-${body.payload.options.selectedXParameterIndex}_${body.payload.options.selectedXScale}-${body.payload.options.selectedYParameterIndex}_${body.payload.options.selectedYScale}`
                    if (populationCache[key]) {
                        res.end(JSON.stringify(populationCache[key]))
                    } else {
                        getSubPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((data) => {
                            process.stdout.write(JSON.stringify({ jobId: body.jobId, data: 'Finished job on worker side'}))
                            populationCache[key] = data
                            res.end(JSON.stringify(data))
                        }).catch((error) => {
                            console.log(error)
                            process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                        })
                    }
                } else if (body.type === 'get-image-for-plot') {
                    // console.log(body.payload.options)
                    const key = `${body.payload.sample.id}-${body.payload.options.selectedXParameterIndex}_${body.payload.options.selectedXScale}-${body.payload.options.selectedYParameterIndex}_${body.payload.options.selectedYScale}`
                    new Promise((resolve, reject) => {
                        if (populationCache[key]) {
                            resolve(populationCache[key])
                        } else {
                            getSubPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((data) => {
                                populationCache[key] = data
                                resolve(data)
                            }).catch((error) => {
                                console.log(error)
                                process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                            })
                        }
                    }).then((population) => {
                        getImageForPlot(body.payload.sample, body.payload.FCSFile, population, body.payload.options).then((data) => {
                            res.end(JSON.stringify(data))
                        }).catch((error) => {
                            console.log(error)
                            process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                        })
                    })
                } else if (body.type === 'find-peaks') {
                    const key = `${body.payload.sample.id}-${body.payload.options.selectedXParameterIndex}_${body.payload.options.selectedXScale}-${body.payload.options.selectedYParameterIndex}_${body.payload.options.selectedYScale}`
                    new Promise((resolve, reject) => {
                        if (populationCache[key]) {
                            resolve(populationCache[key])
                        } else {
                            getSubPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((data) => {
                                populationCache[key] = data
                                resolve(data)
                            }).catch((error) => {
                                console.log(error)
                                process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                            })
                        }
                    }).then((population) => {
                        const homology = new PersistentHomology({
                            sample: body.payload.sample,
                            FCSFile: body.payload.FCSFile,
                            population,
                            options: body.payload.options
                        })
                        let percentageComplete = 0
                        const data = homology.findPeaks((message) => {
                            // console.log({ jobId: jobId, type: 'loading-update', data: message })
                            // res.send({ jobId: jobId, type: 'loading-update', data: message })
                        })
                        res.end(JSON.stringify(data))
                    }).catch((error) => {
                        console.log(error)
                        process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                        res.end(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                    })
                } else if (body.type === 'find-peaks-with-template') {
                    const key = `${body.payload.sample.id}-${body.payload.options.selectedXParameterIndex}_${body.payload.options.selectedXScale}-${body.payload.options.selectedYParameterIndex}_${body.payload.options.selectedYScale}`
                    new Promise((resolve, reject) => {
                        if (populationCache[key]) {
                            resolve(populationCache[key])
                        } else {
                            getSubPopulation(body.payload.sample, body.payload.FCSFile, body.payload.options).then((data) => {
                                populationCache[key] = data
                                resolve(data)
                            }).catch((error) => {
                                console.log(error)
                                process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                            })
                        }
                    }).then((population) => {
                        const homology = new PersistentHomology({
                            sample: body.payload.sample,
                            FCSFile: body.payload.FCSFile,
                            population,
                            options: body.payload.options,
                            gateTemplates: body.payload.gateTemplates
                        })
                        let percentageComplete = 0
                        const data = homology.findPeaksWithTemplate((message) => {
                            // console.log({ jobId: jobId, type: 'loading-update', data: message })
                            // res.send({ jobId: jobId, type: 'loading-update', data: message })
                        })
                        res.end(JSON.stringify(data))
                    }).catch((error) => {
                        console.log(error)
                        process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                        res.end(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                    })
                }
            }  
        })
    }).listen(3145);
}

process.on('disconnect', function() {
  console.log('parent exited')
  process.exit();
});