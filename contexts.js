// a custom loader for jsonld

// exports loader(url,callback) where callback has signature 
//callback(err, {contextUrl: null, document: {CONTEXT}, documentUrl: the actual context url after redirects})
jsonld = require('jsonld');
fs = require('fs');

function load_context_file(url, filename,callback){
	fs.readFile('files/'+filename, function (err,data){
		if (err || !isJson(data)) callback(err,data);

		var result = {
			contextUrl: null,
			document: JSON.parse(data),
			documentUrl: url
		}
		callback(null,result);
	});
}


function loader(url,callback){
	var CONTEXT_FILES = {
		"http://openbadges.org/context": "test-obi-context.json",
		"http://openbadges.org/extension1": "test-obi-extension.json"
	}
	if (url in CONTEXT_FILES){
		load_context_file(url, CONTEXT_FILES[url], callback);
	}
	else{
		var nodeDocumentloader = jsonld.documentLoaders.node();
		nodeDocumentloader(url, callback);
	} 
	
}

//utils
function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}



module.exports = loader;