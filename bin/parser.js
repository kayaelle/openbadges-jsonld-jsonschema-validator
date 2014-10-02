#!/usr/bin/env node
const _ = require('lodash');
const pointdexter = require('jsonpointer.js');
const clc = require('cli-color');
const utils = require('../lib/utils.js');

const path = require('path');
const argv = require('optimist').argv;

// what does this do?
const parse = require('../');

const input = argv._[0];
var infile = argv.in||argv.infile;

const schemaLoader = require('../lib/schemaLoader.js');
const JaySchema = require('jayschema');
const jay = new JaySchema(schemaLoader);
const jaynorm = require('jayschema-error-messages');

const jsonld = require('jsonld');
const contexts = require('../lib/contexts.js');
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

function print_report(report){
  console.log(report);
}



// Presently, it only validates the complete object against the schema declared in the OBI assertion context file.
function openBadgesValidator(data, callback){ 
  var report = "";

  /* build a list of validation directives, and process them when it's ready.
  // directives is an array of objects { pointer, context, schemaRef }
  */
  analyzeBadgeObjectForValidation(data, function (err, directives){
    if(err){
      console.log("Error analyzing badge object: " + err);
      process.exit(1);
    }

    var validatedCount = 0;

    var directive, testObj;
    for (var i=0; i<directives.length; i++){
      directive = directives[i];
      testObj = pointdexter.get(data,directive.pointer);
      validateOneDirective(testObj, directive, function (result){
        report += result;
        validatedOne();
      });
    }
  
    function validatedOne(){
      validatedCount++;
      if (validatedCount === directives.length)
        callback(report);
    }

  });

}

function validateOneDirective(testObj, directive, remitResult){
  jay.validate(testObj, directive.schemaRef, function(validationErrs){
    var result= "";
    // print the object
    // console.log("============================= " + directive.pointer + " =============================\n"
    //    + JSON.stringify(testObj, null, "  "));
    if (directive.pointer === '') directive.pointer = 'root';
    result += "============================= " + directive.pointer + " =============================\n" 
      + "Schema applied: " + directive.schemaRef;

    if (validationErrs){
      result += "\nSchema validation errors follow:\n";
      result += clc.yellow(JSON.stringify(jaynorm(validationErrs)))+ "\n\n";
    } 
    else{
      result += clc.green("\nGREATEST SUCCESS OF THE PEOPLE: VALIDATION OF THIS OBJECT AGAINST ITS SCHEMA PASSSED WITH NO ERRORS.\n\n");
    }
    remitResult(result);
  });
}


/* Analyze a badge object in order to validate it
//
// We expect one of two cases for the contents of the context property:
// 
// The first, for un-extended badges, is that @context will be a simple string URL to the context definition for the version of the OBI used.
//
// The second, is that @context will be an array, with the OBI context URL as string first element
// ... and an object as the second element with keys indicating the extended property name and values of a URI with information about the extension.
// .. extensions @context objects are referenced within the extended object itself in order to properly scope mappings.
// 
// callback readyToValidate has signature (err, directives)
*/
function analyzeBadgeObjectForValidation(data, readyToValidate){
  var mainContextBlock = data['@context'];

  // An array of objects describing validations to run on the Badge Object (data)
  // each: { 'pointer', 'contextRef', 'schemaRef' }
  var results = [];

  //quick counter of results processed (pass or fail) to evaluate doneness of array-parsing
  var possibleDirectives = 0;
  var processed = 0;

  //basic OBI assertion with no extensions just needs a single step:
  if (typeof mainContextBlock === 'string'){
    
    getSchemaForContext(mainContextBlock, function(err, schemaRef){
      if (err) console.log("Couldn't get schema reference for context doc: " + curContext);
      else{
        addRow('',mainContextBlock, schemaRef);
        readyToValidate(null, results);
      }
    });
  }

  //Or the extended format, which needs a few passes.
  else if (Array.isArray(mainContextBlock)) {
    
    for (var i=0; i<mainContextBlock.length; i++){
      var curContext = mainContextBlock[i];

      // for the basic OBI schema &/or any other schema that applies to top level document
      if (typeof curContext === 'string') {
        possibleDirectives++;
        getSchemaForContext(curContext, function(err, schemaRef){
          if (err) console.log("Couldn't get schema reference for context doc: " + curContext);
          else{
            addRow('', curContext, schemaRef);
            processedOne();
          }
        });
        
      }

      // for key:IRI mappings declaring badge object extensions
      else if (typeof curContext === 'object' && !Array.isArray(curContext)){
        for (key in curContext){
          
          // We expect a key for the property name of the extended object; it's value doesn't matter right now as long as it's probably an IRI.
          if (typeof curContext[key] === 'string'){
            possibleDirectives++;

            // suppose we see "someProp": "http://definitions.com/someProp". 
            // The next step is to find where in the badge the "someProp" property lives and build a validation directive from that info.
            getInfoForProp(data, key, function(err, pointer, contextRef, schemaRef){
              if(err) console.log("Warning: Couldn't find pointer for " + key);
              else
                addRow(pointer, contextRef, schemaRef);
              processedOne();
            });
          }
        }
      }
    }
  }
  

  function addRow(pointer, contextRef, schemaRef){
    results.push({
      pointer: pointer,
      contextRef: contextRef,
      schemaRef: schemaRef
    });        
  }

  function processedOne(){
    processed++;
    if (processed === possibleDirectives){
      readyToValidate(null, results);
    }
  }
}





function getSchemaForContext(contextRef, callback){
  contexts(contextRef, function(err, contextResult){
    if (err || typeof contextResult.document['validation'] != 'string') 
      callback(err || new Error("Error: " + contextRef + " -- The context file's validation property wasn't a string, maaan."), null);
    else
      callback(null, contextResult.document['validation']);
  });
}


// callback has signature (err, pointer, contextRef, schemaRef)
function getInfoForProp(data, property, callback){

  var pointer, contextRef;

  //check if it's a top level property
  if (_.has(data,property)){
    pointer = '/' + property;
    contextRef = nab_context(data[property]);
  }
  else if (typeof data.badge === 'object' && _.has(data.badge,property)) {
    pointer = '/badge/' + property;
    contextRef = nab_context(data.badge[property]);
  }
  else if (typeof data.badge.issuer === 'object' && _.has(data.badge.issuer,property)) {
    pointer = '/badge/issuer/' + property;
    contextRef = nab_context(data.badge.issuer[property]);
  }

  getSchemaForContext(contextRef,function(err, schemaRef){
    if(err)
      console.log("Error getting schema for contextRef " + contextRef + " -- Not adding to validation list.");
    else if (typeof contextRef === 'string')
      callback(null, pointer, contextRef, schemaRef);
  });
  


  function nab_context(prop){
    if (typeof prop['@context'] === 'string')
      return prop['@context'];
    return null;
  }

  function return_result(){
    if (contextRef)
      callback(null, pointer, contextRef);
  }
}






function readAssertion(infile) {
  fs.readFile(infile, 'utf8', function(err, data) {
    if (err) {
      throw err;
    }

    console.log('OK: read file ' + infile);
    
    // Fail: assertion didn't parse as JSON
    if(!utils.isJson(data)){
      console.log("Invalid: File data is not JSON.");
      process.exit(1);
    }
    // Success: JSON Parsable.
    else {      
      console.log('File successfully read as JSON.');
      data = JSON.parse(data);
     
      jsonld.expand(data, function(err, expanded) {

        // Not valid JSONLD. Return error and exit.
        if (err) {
          console.log("Could not expand JSON to JSON-LD. (JSON-LD Error): " + err);
          process.exit(1);
        }

        // Not mapped JSONLD.
        if (expanded.length == 0) {
          console.log('Context malfunction: empty expanded JSON-LD--no terms were mapped to IRIs maybe?');
          // TODO: use alternate method of matching assertion to schema when schema isn't declared: https://github.com/ottonomy/badge-schemer
        }

        // ready to start validating against schema
        else
          openBadgesValidator(data, print_report);

      });
    }
  }); 
}



process.on('SIGINT', function () {
  log('interrupt');
  process.exit(2);
});