const merge = require('webpack-merge');
const common = require('./webpack.common.js');
const webpack = require('webpack')

const HtmlPlugin = require('html-webpack-plugin')
const htmlPlugin = new HtmlPlugin({
    template: './index.dev.html',
    filename: 'index.html',
    inject: 'body'
})

module.exports = merge(common, {
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                'CONTEXT': JSON.stringify('electron')
            }
        })
    ]
    module: {
        rules: [
            {
                test: /\.scss$/,
                use: [
                    { loader: "style-loader" },
                    { loader: "css-loader" },
                    { loader: "sass-loader" }
                ]
            }
        ]
    },
    plugins: [htmlPlugin]
});