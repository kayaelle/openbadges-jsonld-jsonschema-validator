/* A module to examine what is in a JSON representation of a Badge Object
// (an Assertion, Badge Class or Issuer), and return a report (string) about 
// its structures and validation
*/
const _ = require('lodash');
const pointdexter = require('jsonpointer.js');
const clc = require('cli-color');
//const utils = require('../lib/utils.js');

const schemaLoader = require('../lib/schemaLoader.js');
const JaySchema = require('jayschema');
const jay = new JaySchema(schemaLoader);
const jaynorm = require('jayschema-error-messages');

//const jsonld = require('jsonld');
const contexts = require('../lib/contexts.js');
//jsonld.documentLoader = contexts;




// accepts JSON-schema of a badge object (currently 1.1draft+ of Assertions only)
// Presently, it only validates the complete object against the schema declared in the OBI assertion context file.
function analyzeBadgeObject (data, callback){ 

  /* info returns an object that we'll end up handing around a lot:
  // info = {
  //   data: {},
  //   expanded: {},
  //   errors: [],
  //   warnings: [],
  //   type: "IRI", (or null)
  //   id: "IRI" (or null)
  // }
  */
  determineType(data, function (err, info){
    if (err){ 
      console.log("Error analyzing badge object to determine type: " + err);
    }
    else{
      var report = "";

      /* build a manifest of validation structures, and process them when it's ready.
      // structures is an array of objects { pointer, context, schemaRef }
      */
      analyzeBadgeObjectForValidation(info, function (err, fullInfoObject){
        structures = fullInfoObject.structures;
        if(err){
          console.log("Error analyzing badge object: " + err);
          process.exit(1);
        }

        var validatedCount = 0;

        var structure, testObj;
        for (var i=0; i<structures.length; i++){
          structure = structures[i];
          testObj = pointdexter.get(data,structure.pointer);
          validateOnestructure(testObj, structure, function (result){
            report += result;
            validatedOne();
          });
        }
      
        function validatedOne(){
          validatedCount++;
          if (validatedCount === structures.length)
            callback(report);
        }

      });

    }

  }); 

}

function validateOnestructure (testObj, structure, remitResult){
  jay.validate(testObj, structure.schemaRef, function (validationErrs){
    var result= "";
    // print the object
    // console.log("============================= " + structure.pointer + " =============================\n"
    //    + JSON.stringify(testObj, null, "  "));
    if (structure.pointer === '') structure.pointer = 'root';
    result += "============================= " + structure.pointer + " =============================\n" 
      + "Schema applied: " + structure.schemaRef;

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


/* Determine whether this is a Badge Object and if so, what type it is.
// Input data has already been parsed from JSON and is now a native JS object.
//
// callback has signature (err,{originalData, JSON-LD expanded, str})
*/
function determineType (data, callback){
  
  // test if document claims to be JSON-LD:
  if (_.has(data,'@context')){
    jsonld.expand(data, function(err, expanded) {

      // Not valid JSONLD. Return error and exit.
      if (err) {
        callback(new Error("Could not expand JSON to JSON-LD. (JSON-LD Error): " + err),data);
      }

      // Not mapped JSONLD.
      if (expanded.length == 0) {
        callback(new Error("Context malfunction: empty expanded JSON-LD--Seems like the context didn't match the document contents."),data);
      }

      // OK: this is JSON-LD, ready to start determining if it's a badge
      else {

        //TODO: remove this printout
        console.log(
          "================== Expanded JSON-LD of the assertion: ==================\n" +
          clc.yellow(JSON.stringify(expanded,null,"  ")) +
          "\n==========================================================================\n"
        );

        // start building metadata object to describe this Badge Object
        var result = {
            data: data,
            expanded: expanded,
            warnings: [],
            errors: []
        };

        // build it up with additional relevant properties
        // if the item declares its type, cool. if it includes a badgeclass, assume it's an assertion
        if (_.has(expanded[0],"@type"))
           result.type = expanded[0]["@type"][0];
        else if (_.has(expanded[0],getLinked('badgeclass') ) )
          result.type = getLinked('assertion');
        else
          result.type = null;

        if (_.has(expanded[0],"@id"))
          result.id = expanded[0]["@id"][0];
        else if (_.has(expanded[0], getLinked('verify') ) && data.verify.type === 'hosted' )
          result.id = data.verify.url;
        else
          result.id = null;


        // Send it up for processing against schema
        callback( null, result );

      }
    });
  }

  // If not JSON-LD, send back an error for now.
  // TO DO: Integrate further testing with badge-schemer to determine if this is just an older badge (1.0 or 0.5)
  else { 
    callback(new Error("The JSON didn't have a @context, so it couldn't be expanded into JSON-LD"), data);
  }


  
  
}


function getLinked (term, context){
  // default
  if (!context) 
    context = "http://openbadges.org/standard/1.1/context"

  //TODO: replace with an actual jsonld query that is quick.
  if (term = 'assertion')
    return "http://openbadges.org/standard/1.1/OBI/standard#Assertion";
  else if (term = 'badgeclass')
    return "http://openbadges.org/standard/1.1/OBI/standard#BadgeClass";
  else if (term = 'verify')
    return "http://openbadges.org/standard/1.1/OBI/standard#AssertionVerificationObject";
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
// TODO: what if it's an assertion with a linked badgeClass, and the extension is in the linked data?
// (Are we going to enforce full embedded baked badges all the time now?)
//
// parameter fullInfoObject is an object with properties { data: {originalData}, expanded: {jsonld}, warnings: [], errors: [] } 
//
// callback readyToValidate has signature (err, structures)
*/
function analyzeBadgeObjectForValidation (fullInfoObject, readyToValidate){

  var data = fullInfoObject.data; // original assertion
  var typeOfObject = fullInfoObject.type; // will either be an IRI or null

  var mainContextBlock = data['@context'];

  // An array of objects describing validations to run on the Badge Object (data)
  // each: { 'pointer', 'contextRef', 'schemaRef' }
  var results = [];

  //quick counter of results processed (pass or fail) to evaluate doneness of array-parsing
  var possiblestructures = 0;
  var processed = 0;

  // Case 1: basic OBI assertion with no extensions just needs a single step:
  if (typeof mainContextBlock === 'string'){
    
    getSchemaForContext(mainContextBlock, typeOfObject, function (err, schemaRef){
      if (err) console.log("Couldn't get schema reference for context doc: " + curContext);
      else{
        addRow('',mainContextBlock, schemaRef);
        readyToValidate(null, results);
      }
    });
  }

  // Case 2: the extended format, which needs a few passes.
  else if (Array.isArray(mainContextBlock)) {
    
    for (var i=0; i<mainContextBlock.length; i++){
      var curContext = mainContextBlock[i];

      // for the basic OBI schema &/or any other schema that applies to top level document
      if (typeof curContext === 'string') {
        possiblestructures++;

        getSchemaForContext(curContext, typeOfObject, function (err, schemaRef){
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
            possiblestructures++;

            // suppose we see "someProp": "http://definitions.com/someProp". 
            // The next step is to find where in the badge the "someProp" property lives and build a validation structure from that info.
            getInfoForProp(data, key, function (err, pointer, contextRef, schemaRef){
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
  
  // pointer is a JSON pointer from the root of the original assertion, e.g. where '' is the root, and '/example/0' refers to the first item of the root property 'example', which is an array
  function addRow (pointer, contextRef, schemaRef){
    results.push({
      pointer: pointer,
      contextRef: contextRef,
      schemaRef: schemaRef
    });        
  }

  function processedOne(){
    processed++;
    if (processed === possiblestructures){
      fullInfoObject.structures = results;
      readyToValidate(null, fullInfoObject);
    }
  }
}

// A function to determine the @type of the current badge object?
// TODO: Implement this.
function getIriForBadgeObject (object){
	return "http://openbadges.org/standard/1.1/OBI/Assertion.json#";
}


// calls back with a schema reference (URL) to apply to a certain type of object, under a specified context.
// FUTURE TODO: Would this fail if we're sending it an embedded context (like for a badgeclass but the schema is actually defined above in the main object context?)
function getSchemaForContext (contextRef, type, callback){
  console.log("Now I'm going to get Schema for Context: " + contextRef + " & type: " + type);
  contexts(contextRef, function (err, contextResult){
    
    // for cases where we know a type to look for in a dictionary of validations for different types:
    if (type && typeof contextResult.document['validation'][type] === 'string')
      callback(null, contextResult.document['validation'][type]);
    else if (type && typeof contextResult.document['validation'][type] === 'undefined' && typeof contextResult.document['validation']['default'] === 'string')
      callback(null, contextResult.document['validation']['default']);

    // otherwise, we expect a string URL of the validator. If that's not the case:
    else if (err || typeof contextResult.document['validation'] != 'string') 
      callback(err || new Error("Error: " + contextRef + " -- The context file's validation property wasn't a string or have the right validator registered when we expected it man, maaan."), null);
    
    // otherwise, there's only one validator in the context, and it's properly a string (URL?):
    else
      callback(null, contextResult.document['validation']);
  });
}


// callback has signature (err, pointer, contextRef, schemaRef)
function getInfoForProp (data, property, callback){

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
  var typeOfObject = null;
  getSchemaForContext(contextRef,null, function (err, typeOfObject, schemaRef){
    if(err)
      console.log("Error getting schema for contextRef " + contextRef + " -- Not adding to validation list.");
    else if (typeof contextRef === 'string')
      callback(null, pointer, contextRef, schemaRef);
  });
  


  function nab_context (prop){
    if (typeof prop['@context'] === 'string')
      return prop['@context'];
    return null;
  }

  function return_result (){
    if (contextRef)
      callback(null, pointer, contextRef);
  }
}




 module.exports.analyze = analyzeBadgeObject;