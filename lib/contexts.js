// a custom loader for jsonld
const utils = require('../lib/utils.js');
const path = require('path');

// exports loader(url,callback) where callback has signature 
//callback(err, {contextUrl: null, document: {CONTEXT}, documentUrl: the actual context url after redirects})
jsonld = require('jsonld');
fs = require('fs');

function load_context_file(url, filename, callback){
	fs.readFile(path.resolve(__dirname, '../files/context/', filename), function (err, data){
		if (err || !utils.isJson(data)) callback(err,data);

		var result = {
			contextUrl: null,
			document: JSON.parse(data),
			documentUrl: url
		}
		callback(null,result);
	});
}


function loader(url, callback){
	var CONTEXT_FILES = {
		"http://openbadges.org/standard/1.1/context": "obi-main-context.json",
		"http://openbadges.org/extension1": "extension-testvalue-context.json"
	}
	if (url in CONTEXT_FILES){
		load_context_file(url, CONTEXT_FILES[url], callback);
	}
	else{
		var nodeDocumentloader = jsonld.documentLoaders.node();
		nodeDocumentloader(url, callback);
	} 
	
}

module.exports = loader;