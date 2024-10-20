/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	output: {
		filename: 'extension.js',
		path: path.join(__dirname, 'dist')
	}
});
