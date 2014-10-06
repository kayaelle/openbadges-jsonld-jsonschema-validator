// a custom loader for json-schema

const path = require('path');
const utils = require('../lib/utils.js');

// exports loader(url,callback) where callback has signature 
// callback(err, {schema})

fs = require('fs');

const http = require('http');
const https = require('https');
const request = require('request');

function load_schema_file(url, filename, callback){
  fs.readFile(path.resolve(__dirname, '../files/schema/', filename), function (err, data){
    if (err || !utils.isJson(data)) callback(err,data);
    else{ 
      var result = JSON.parse(data);
      callback(null,result);
    }
  });
}

function load_schema_remote(url, callback) {
  var options = {
    url: url,
    timeout: 3000
  };
   
  request(options, function(err,res,body) {
    if (err || res.statusCode != 200) {
      callback(new Error("Schema Url could not be reached"), null);
    }
      
    //success:
    if (utils.isJson(body)){
      var schema = JSON.parse(body);
      callback(null, schema);
    }
    //such fail:
    else {
      console.log('Schema is not valid JSON');
      callback(new Error("Schema retrieved wasn't JSON"), null);
    }     
  });
}

function loader(url,callback){
  const SCHEMA_FILES = {
    "http://openbadges.org/schema/1.1/assertion": "1.0-assertion-backpackerror.json",
    "http://openbadges.org/schema/1.1/badgeClass": "1.0-badgeclass.json",
    "http://openbadges.org/schema/1.1/issuerOrg": "1.0-issuerOrg.json",
    "https://app.achievery.com/tmp/test-OBI-schema.json": "1.0-assertion-backpackerror.json",
    "http://openbadges.org/extension1-schema": "extension-testvalue.json"
  }
  if (url in SCHEMA_FILES){
    load_schema_file(url, SCHEMA_FILES[url], callback);
  }
  else{
    load_schema_remote(url, callback);  
  } 
  
}


module.exports = loader;