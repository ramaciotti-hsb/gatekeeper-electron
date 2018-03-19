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

const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length - 1;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
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
                if (body.type === 'get-population-data') {
                    getSubPopulation(body.payload.sample, body.payload.options).then((data) => {
                        process.stdout.write(JSON.stringify({ jobId: body.jobId, data: 'Finished job on worker side'}))
                        res.end(JSON.stringify(data))
                    }).catch((error) => {
                        process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                    })
                } else if (body.type === 'get-image-for-plot') {
                    getImageForPlot(body.payload.sample, body.payload.subPopulation, body.payload.options).then((data) => {
                        res.end(JSON.stringify(data))
                    }).catch((error) => {
                        console.log(error)
                        process.stderr.write(JSON.stringify({ jobId, data: JSON.stringify(error) }))
                    })
                } else if (body.type === 'find-peaks') {
                    const homology = new PersistentHomology(body.payload)
                    let percentageComplete = 0
                    const data = homology.findPeaks((message) => {
                        // console.log({ jobId: jobId, type: 'loading-update', data: message })
                        // res.send({ jobId: jobId, type: 'loading-update', data: message })
                    })
                    res.end(JSON.stringify(data))
                } else if (body.type === 'find-peaks-with-template') {
                    const homology = new PersistentHomology(body.payload)
                    let percentageComplete = 0
                    const data = homology.findPeaksWithTemplate((message) => {
                        // res.send({ jobId: jobId, type: 'loading-update', message })
                    })
                    res.end(JSON.stringify(data))
                }
            }  
        })
    }).listen(3145);
}

process.on('disconnect', function() {
  console.log('parent exited')
  process.exit();
});