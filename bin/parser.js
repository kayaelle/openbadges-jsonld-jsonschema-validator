#!/usr/bin/env node

const http = require('http');
const https = require('https');
const request = require('request');

const fs = require('fs');
const argv = require('optimist').argv;
const parse = require('../');
const input = argv._[0];
var infile = argv.in||argv.infile;

const schemaLoader = require('../schemaLoader.js');
const JaySchema = require('jayschema');
const jay = new JaySchema(schemaLoader);
const jaynorm = require('jayschema-error-messages');
//const bs = require('../badgeSchema.js');

const jsonld = require('jsonld');
const contexts = require('../contexts.js');
jsonld.documentLoader = contexts;



// shell script operation control
// I recommend starting from the app root directory and using shell command `./bin/parser.js --in files/example-assertion.json `
(function main() {
  infile = argv.in||argv.infile;
  if (!infile)  {
    console.log('File not provided. Using default example assertion.');
    infile = "./files/example-assertion.json";
  }  
  readAssertion(infile);
})()



// Presently, it only validates the complete object against the schema declared in the OBI assertion context file.
function openBadgesValidator(validationUrl,data){ 
  var validationResults = [];

  if (typeof validationUrl != 'string'){ 
    validationUrl = "https://app.achievery.com/tmp/test-OBI-schema.json";
  }

  validateMain(validationUrl, data);

  function validateMain(validationUrl, data){
    jay.validate(data, validationUrl, function(validationErrs){
      if (validationErrs){
        console.log("Schema validation errors follow:");
        console.log(jaynorm(validationErrs));
        process.exit(1);
      } 
      else{
        console.log("GREATEST SUCCESS OF THE PEOPLE: VALIDATION OF ASSERTION AGAINST ITS SCHEMA PASSSED WITH NO ERRORS.");
        process.exit(1);
      }
    });
  }
}


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
         console.log("Invalid (JSON-LD Error): " +err);
         process.exit(1);
       }
       // Not JSONLD. Continue to validate against schmema.
       if (expanded.length == 0) {
         console.log('This is not JSONLD. Validate against Schema.');
         openBadgesValidator(null,data);
       }
       // Get the validation link
       else {
        contexts(data["@context"],function(err,contextResult){
          if (err) {
            console.log(err);
            process.exit(1);
          }
          var validationUrl = contextResult.document.validation; 
          if (typeof validationUrl === 'string'){
            console.log("Successfully parsed the main validation URL: " + validationUrl);
            openBadgesValidator(validationUrl,data);
          }
        });
       }
     });
     
    // Not valid JSON. Return error and exit.
    } else {
      console.log("Invalid: File data is not JSON.");
      process.exit(1);
    }    
  }); 
}

process.on('SIGINT', function () {
  log('interrupt');
  process.exit(2);
});

//utils
function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}