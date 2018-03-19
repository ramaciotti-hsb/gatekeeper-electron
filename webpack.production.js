const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const webpack = require('webpack')
const MinifyPlugin = require('babel-minify-webpack-plugin')
const ExtractTextPlugin = require("extract-text-webpack-plugin")
const HtmlPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

const htmlPlugin = new HtmlPlugin({
    template: './index.production.html',
    filename: 'index.html',
    inject: 'body'
})

const extractSass = new ExtractTextPlugin({
    filename: "app.bundle.css"
});

module.exports = merge(common, {
    plugins: [
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
        new webpack.DefinePlugin({
            'process.env': {
                'NODE_ENV': JSON.stringify('production')
            }
        }),
        new MinifyPlugin({}, { comments: false }),
        extractSass,
        htmlPlugin
    ],
    module: {
        rules: [{
            test: /\.scss$/,
            use: extractSass.extract({
                use: [{
                    loader: "css-loader?minimize"
                }, {
                    loader: "sass-loader"
                }],
                // use style-loader in development
                fallback: "style-loader"
            })
        }]
    }
});