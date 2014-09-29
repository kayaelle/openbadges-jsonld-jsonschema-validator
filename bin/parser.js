#!/usr/bin/env node

const http = require('http');
const https = require('https');
const request = require('request');
const fs = require('fs');
const argv = require('optimist').argv;
const parse = require('../');
const input = argv._[0];
var infile = argv.in||argv.infile;

const JaySchema = require('jayschema');
const jay = new JaySchema();
const jaynorm = require('jayschema-error-messages');
//const bs = require('../badgeSchema.js');

const jsonld = require('jsonld');
const contexts = require('../contexts.js');
jsonld.documentLoader = contexts;

function openBadgesValidator(validationUrl,data){ 
   
  if (typeof validationUrl != 'string'){ 
    validationUrl = "https://app.achievery.com/tmp/test-OBI-schema.json";
  }
    
  var options = {
    url: validationUrl,
    timeout: 3000
  };
   
  request(options, function(err,res,body) {
    if (err || res.statusCode != 200) {
      console.log('Schema Url could not be reached.');
      process.exit(1);
    }
      
    if (isJson(body)){
      schema = JSON.parse(body);
      validateSchema(data,schema);
    }
    else {
      console.log('Schema is not valid JSON');
      process.exit(1);
    }     
  });
  
  function validateSchema(data,schema){

    jay.validate(data, schema, function(validationErrs){
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
            console.log("Successfully retrieved the validation URL. It is: " + validationUrl);
            
            // Not really sure I get this part. Is this if there is no validation url?
            stillMissingSchema = jay.register(fs.readFileSync('files/test-OBI-schema.json'),validationUrl);
            if (stillMissingSchema.length === 0){
              console.log('validationUrl '+ validationUrl);
              openBadgesValidator(validationUrl,data);
            }
            else {
              // is this where extensions come in?
            }
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

process.on('SIGINT', function () {
  log('interrupt');
  process.exit(2);
});

//utils
function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}