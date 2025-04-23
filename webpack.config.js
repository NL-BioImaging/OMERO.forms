// webpack.config.js
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    'bundle.min': ['whatwg-fetch', './src/main.jsx'],
    'bundle': ['whatwg-fetch', './src/main.jsx'],
    'designer': ['whatwg-fetch', './src/designer.jsx'],
    'designer.min': ['whatwg-fetch', './src/designer.jsx'],
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      terserOptions: {
        format: {
          comments: false,
        },
      },
      extractComments: false,
    })],
  },
  output: {
    path: path.resolve(__dirname, 'omero_forms/static/forms/js'),
    filename: '[name].js',
    library: {
      name: 'omeroforms',
      type: 'umd'
    },
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                auto: true
              }
            }
          },
          'postcss-loader'
        ]
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8192
          }
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  }
};
