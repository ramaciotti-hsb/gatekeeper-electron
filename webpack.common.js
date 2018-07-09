const path  = require('path')
const fs    = require('fs')

let nodeModules = fs.readdirSync('./node_modules')
    .filter((module) => {
        return module !== '.bin';
    })
    .reduce((prev, module) => {
        return Object.assign(prev, {[module]: 'commonjs ' + module});
    }, {})

module.exports = {
    entry: {
        app: './gatekeeper-electron/application.js',
        fork: './gatekeeper-electron/subprocess-wrapper.js'
    },
    output: {
        path: path.resolve(__dirname, './webpack-build'),
        filename: '[name].bundle.js'
    },
    module: {
        rules: [
            { test: /\.js$/, loader: 'babel-loader', exclude: /node_modules/ },
            { test: /\.jsx$/, loader: 'babel-loader', exclude: /node_modules/ },
        ]
    },
    target: 'electron',
    node: {
        /* http://webpack.github.io/docs/configuration.html#node */
        __dirname: false,
        __filename: false
    },
    externals: nodeModules
}