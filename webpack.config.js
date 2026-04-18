const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return [
    // ── 1. Figma sandbox (controller) ────────────────────────────────────────
    {
      name: 'controller',
      target: 'web',
      entry: './src/plugin/controller.ts',
      output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'controller.js',
      },
      resolve: { extensions: ['.ts', '.js'] },
      module: {
        rules: [
          {
            test: /\.ts$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: 'tsconfig.json' },
            },
            exclude: /node_modules/,
          },
        ],
      },
      optimization: { minimize: isProd },
      devtool: isProd ? false : 'inline-source-map',
    },

    // ── 2. Plugin UI (iframe) ─────────────────────────────────────────────────
    {
      name: 'ui',
      target: 'web',
      entry: {
        ui: './src/ui/ui.ts',
      },
      output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
      },
      resolve: { extensions: ['.ts', '.js'] },
      module: {
        rules: [
          {
            test: /\.ts$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: 'tsconfig.json' },
            },
            exclude: /node_modules/,
          },
          {
            test: /\.css$/,
            use: [
              // Inline CSS into the final HTML so Figma loads one file
              { loader: MiniCssExtractPlugin.loader },
              'css-loader',
            ],
          },
        ],
      },
      plugins: [
        new MiniCssExtractPlugin({ filename: '[name].css' }),
        new HtmlWebpackPlugin({
          template: './src/ui/index.html',
          filename: 'ui.html',
          chunks: ['ui'],
          // Inline both JS and CSS so the plugin only ships one HTML file
          inject: 'body',
          inlineSource: isProd ? '.(js|css)$' : undefined,
          minify: isProd
            ? { collapseWhitespace: true, removeComments: true }
            : false,
        }),
      ],
      optimization: { minimize: isProd },
      devtool: isProd ? false : 'inline-source-map',
    },
  ];
};
