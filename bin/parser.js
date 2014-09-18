#!/usr/bin/env node

const fs = require('fs');
const argv = require('optimist').argv;
const parse = require('../');
const input = argv._[0];
var infile = argv.in||argv.infile;
const jsonld = require('jsonld');

function readAssertion(infile) {
  fs.readFile(infile, 'utf8', function(err, data) {
    if (err) throw err;
    console.log('OK: ' + infile);
    
    if(isJson(data)){      
      console.log('File successfully read as JSON.');
      data = JSON.parse(data);
     
     jsonld.expand(data, function(err, expanded) {
       // Not valid JSONLD. Return error and exit.
       if (err) {
         console.log("Invalid (JSON-LD Error)" +err);
         process.exit(1);
       }
       
       // Not JSONLD. Continue to validate against schmema.
       if (expanded.length == 0) {
         console.log('This is not JSONLD');
       }
       // Get the validation link
       else {
         
       }
       
       console.log(JSON.stringify(expanded));
       process.exit(1);
     });
     
    // Not valid JSON. Return error and exit.
    } else {
      console.log("Invalid: File data is not JSON.");
      process.exit(1);
    }    
  }); 
}

(function main() {
  if (!input)  {
    console.log('File not provided. Using default Mojito recipe.');
    var infile = "./files/test-recipe.json";
  }  
  return readAssertion(infile);
})()

process.on('SIGINT', function () {
  log('interrupt');
  process.exit(2);
});

function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}