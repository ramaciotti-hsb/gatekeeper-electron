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
            'process.env.CONTEXT': JSON.stringify('electron'),
            'process.env.JOBS_API_URL': JSON.stringify('http://localhost:3145')
        })
    ],
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