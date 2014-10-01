// a custom loader for json-schema

const path = require('path');

// exports loader(url,callback) where callback has signature 
// callback(err, {schema})

fs = require('fs');

const http = require('http');
const https = require('https');
const request = require('request');

function load_schema_file(url, filename, callback){
  console.log("GOING TO LOAD SCHEMA: " + resolve_file_dir(filename));
  fs.readFile(resolve_file_dir(filename), function (err, data){
    if (err || !isJson(data)) callback(err,data);
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
    if (isJson(body)){
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
    "http://openbadges.org/assertionSchema": "test-OBI-schema.json",
    "https://app.achievery.com/tmp/test-OBI-schema.json": "test-OBI-schema.json",
    "http://openbadges.org/extension1-schema": "test-obi-extension-schema.json"
  }
  if (url in SCHEMA_FILES){
    load_schema_file(url, SCHEMA_FILES[url], callback);
  }
  else{
    load_schema_remote(url, callback);  
  } 
  
}

//utils
function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}

function resolve_file_dir(file){
  return path.resolve(__dirname, '../files/', file);
}



module.exports = loader;