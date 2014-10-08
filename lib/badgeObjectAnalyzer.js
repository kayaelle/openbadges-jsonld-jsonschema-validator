/* A module to examine what is in a JSON representation of a Badge Object
// (an Assertion, Badge Class or Issuer), and return a report (string) about 
// its structures and validation
*/
const _ = require('lodash');
const pointdexter = require('jsonpointer.js'); // consider switch to https://www.npmjs.org/package/json-pointer for set method.
const clc = require('cli-color');
const async = require('async');
//const utils = require('../lib/utils.js');

const schemaLoader = require('./schemaLoader.js');
const JaySchema = require('jayschema');
const jay = new JaySchema(schemaLoader);
const jaynorm = require('jayschema-error-messages');

const contexts = require('./contexts.js');
const fetch = require('./badgeObjectFetcher.js');


function BadgeObject (originalData){
  this.data = originalData; // unmodified JSON of the badge object passed in to the analyzer
  this.full = {}; // start with original, then modify to include @context, @type, and any fetched linked children badge objects (& maybe @id)
  this.expanded = []; // JSON-LD expanded view of this.data or this.full (TODO: clarify)?
  this.errors = []; // An array of Errors that are show-stopping.
  this.warnings = []; // An array of warnings that something might not be quite right with this badge.
  this.type = null; // IRI, which will indicate version and (assertion | badgeclass | issuer | extension)
  this.id = null; // an IRI corresponding to this very badge object. If this is a hosted assertion, this would be equivalent to verify.url. (It may not be known.)
}
BadgeObject.prototype.toString = function () {
  return "YOU ARE VIEWING A BADGE OBJECT. WHAT DO YOU WANT TO SEE?";
}

// A low grade error that should not interrupt execution flow, but would be interesting to report back.
function Warning (message){
  this.message = message;
  this.toString = function () {
    return this.message;
  };
}




// accepts JSON-schema of a badge object (currently 1.1draft+ of Assertions only)
// Presently, it only validates the complete object against the schema declared in the OBI assertion context file.
// This is the only function allowed to modify badgeObject.
function analyzeBadgeObject (data, callback){ 

  var badgeObject = new BadgeObject(data);

  expandLD(badgeObject, function (err, expanded){
    if (err instanceof Error){
      badgeObject.errors.push(err);
      // console.log("Error expanding JSON-LD: " + err);
      callback(badgeObject);
      return;
    }
    else if (err instanceof Warning){
      badgeObject.warnings.push(err);
      // console.log("Warning expanding JSON-LD: " + err);
      // This means it doesn't have a context object, and we need to send it to badge-schemer. For now, kill the operation.
      callback(badgeObject);
      return;
    }

    // Otherwise, we successfully expanded JSON-LD. Next: determine type (Assertion, BadgeClass, Issuer).
    else {
      badgeObject.expanded = expanded;
      determineType(badgeObject, function (err, type){
        if (err){ 
          // console.log("Error analyzing badge object to determine type: " + err);
          badgeObject.errors.push(err);
        }
        else {
          badgeObject.type = type;
          
          // determine JSON-LD @id of this object if possible.
          var get_ID = determineID(badgeObject);
          if (get_ID instanceof Warning) 
            badgeObject.warnings.push(get_ID);
          else {
            badgeObject.id = get_ID;
            badgeObject.full['@id'] = get_ID;
          }

          // TODO: Replace text reporting with just sending back the completely analyzed badgeObject w/ populated .warnings and .errors as arrays of Warning and Error objects.
          var report = "";

          /* build a manifest of validation structures, and process them when it's ready.
          // structures is an array of objects { pointer, context, schemaRef }
          */
          analyzeBadgeObjectForValidation(badgeObject, function (err, badgeInfoObject){
            var structures = badgeInfoObject.structures;

            // console.log(clc.cyan(JSON.stringify(badgeInfoObject.full,null,'  ')));
            
            if(err){
              console.log("Error analyzing badge object: " + err);
              process.exit(1);
            }

            var validatedCount = 0;

            var structure, testObj;
            for (var i=0; i<structures.length; i++){
              structure = structures[i];
              testObj = pointdexter.get(badgeInfoObject.full,structure.pointer);

              validateOneStructure(testObj, structure, function (result){
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
  });

 

}

function validateOneStructure (testObj, structure, remitResult){
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
      // result += clc.yellow(JSON.stringify(validationErrs))+ "\n\n";
      result += clc.yellow(JSON.stringify(jaynorm(validationErrs)))+ "\n\n";
    } 

    else{
      result += clc.green("\nGREATEST SUCCESS OF THE PEOPLE: VALIDATION OF THIS OBJECT AGAINST ITS SCHEMA PASSSED WITH NO ERRORS.\n\n");
    }
    remitResult(result);
  });
}


function expandLD(badgeObject, callback){
  var data = badgeObject.data;

  // test if document claims to be JSON-LD:
  if (_.has(data,'@context')){
    jsonld.expand(data, function(err, expanded) {

      // Not valid JSONLD. Return error and exit.
      if (err) {
        callback(new Error("Could not expand JSON to JSON-LD. (JSON-LD Error): " + err), null);
        return;
      }

      // Not mapped JSONLD.
      if (expanded.length == 0) {
        callback(new Error("Context malfunction: empty expanded JSON-LD--Seems like the context didn't match the document contents."), expanded);
        return;
      }

      // OK: this is JSON-LD, ready to start determining if it's a badge
      else {

        callback(err, expanded);
      }
    });
  }

  // If not JSON-LD, send back an error for now.
  // TO DO: Integrate further testing with badge-schemer to determine if this is just an older badge (1.0 or 0.5)
  else { 
    callback(new Warning("The JSON didn't have a @context, so it couldn't be expanded into JSON-LD"), null);
  }
}

/* Determine whether this is a Badge Object and if so, what type it is.
// Input data has already been parsed from JSON and is now a native JS object.
//
// callback has signature (err,{originalData, JSON-LD expanded, str})
*/
function determineType (badgeObject, callback){
  var data = badgeObject.data;
  var expanded = badgeObject.expanded;

  var type = null;
  var id = null;

  // build it up with additional relevant properties
  // if the item declares its type, cool. if it includes a badgeclass, assume it's an assertion, etc.
  if (_.has(expanded[0],"@type"))
    type = expanded[0]["@type"][0];

  //maybe these should all be delegated to badge-schemer in addition to non-LD badges...
  else if (_.has(expanded[0],getLinked('badgeclass') ) )
    type = getLinked('assertion');
  else if (_.has(expanded[0],getLinked('issuer') ) )
    type = getLinked('issuerorg');
  // if type is still null, we have a problem.
  if (type === null)
    callback(new Error("Could not determine type"), null);

  

  // Send it up for processing against schema
  callback(null, type);
  
}

function determineID (badgeObject, callback){
  var data = badgeObject.data;
  var expanded = badgeObject.expanded;
  var id = null;

  if (_.has(expanded[0],"@id"))
    id = expanded[0]["@id"][0];
  else if (_.has(expanded[0], getLinked('verify') ) && data.verify.type === 'hosted' )
    id = data.verify.url;
  else 
    id = new Warning("Could not determine JSON-LD @id of object.");

  // id will either be a Warning or an IRI string.
  return id;
}


function getLinked (term, context){
  // default context
  if (!context) 
    context = "http://openbadges.org/standard/1.1/context"

  //TODO: replace with an actual jsonld context query that is quick. (Get full IRI mapped to main-obi-context property for shorthand `term`)
  if (term === 'assertion')
    return "http://openbadges.org/standard/1.1/OBI/standard#Assertion";
  else if (term === 'badgeclass')
    return "http://openbadges.org/standard/1.1/OBI/standard#BadgeClass";
  else if (term === 'issuerorg')
    return "http://openbadges.org/standard/1.1/OBI/standard#Issuer";
  else if (term === 'verify')
    return "http://openbadges.org/standard/1.1/OBI/standard#AssertionVerificationObject";
}



/* Analyze a badge object in order to validate it
//
// We expect one of two cases for the contents of the badge object's '@context' property:
// 
// The first, for un-extended badges, is that @context will be a simple string URL to the context definition for the version of the OBI used.
// "@context": "http://openbadges.org/standard/1.1/context"
//
// The second, is that @context will be an array, with the OBI context URL as string first element
// ... and an object as the second element with keys indicating the extended property name and values of a URI with information about the extension.
// .. extensions @context objects are referenced within the extended object itself in order to properly scope mappings.
// "@context": [ "http://openbadges.org/standard/1.1/context", { "propName": "http://contextlink.com" } ]
// 
// TODO: what if it's an assertion with a linked badgeClass, and the extension is in the linked data?
// (Are we going to enforce full embedded baked badges all the time now?)
//
// TODO: What if the object we're passing in is a badgeclass to begin with, not an assertion? This almost works.
//
// parameter badgeObject is an object with properties { data: {originalData}, expanded: {jsonld}, warnings: [], errors: [] } 
//
// callback readyToValidate has signature (err, structures)
*/
function analyzeBadgeObjectForValidation (badgeObject, readyToValidate){
  
  // We'll build up an object to pass back to analyzeBadgeObject() to add to badgeObject. It'll contain the full badge representation,
  // and the list of validations needed to run.
  var infoBlock = {};

  // An array of objects describing validations to run on the Badge Object (data)
  // each: { 'pointer', 'contextRef', 'schemaRef' }
  infoBlock.structures = [];
  infoBlock.warnings = [];


  var data = badgeObject.data; // original assertion
  var typeOfObject = badgeObject.type; // will be an IRI
  var contextBlocks = [];

  
  if (typeOfObject.match(/assertion/i))
    infoBlock.full = data;
  else if (typeOfObject.match(/badgeclass/i))
    infoBlock.full = { badge: data };
  else if (typeOfObject.match(/issuer/i))
    infoBlock.full = { badge: { issuer: data } };



  // identify any missing badge objects that need fetching.

  //utility grabber
  function fetchBadgeObject(url, callback) {
    // fetch returns error or parsed JSON:
    fetch(url, function (err, fetchedObject) {
      if (err){
        callback(err, null);
      }
      else {
        fetchedObject['_location'] = url;
        callback(null, fetchedObject);
      }
    });
  }


  //fetch linked Badge Objects and re-expand JSONLD
  async.waterfall([

    function (callback){
      if (typeOfObject.match(/assertion/i) && typeof data.badge === 'string') {
        infoBlock.warnings.push(new Warning("The BadgeClass was linked from a remote resource and not embedded in the verified assertion. There's a slight possibility that the BadgeClass may have been modified from its original version."));
        fetchBadgeObject(data.badge, function (err, fetchedObject){
          if (err) callback (err);
          else {
            infoBlock.full.badge = fetchedObject;
            callback(null);
          }
        });
      }
      else {
        // either this wasn't an assertion or badge was already an object
        callback(null);
      }
    },

    // fetch linked issuer from within badgeclass
    function (callback){
      // Rarely, this app might be used to analyze a badgeclass itself as input rather than an assertion
      if(typeOfObject.match(/badgeclass/i) && typeof data.issuer === "string"){
        fetchBadgeObject(data.issuer, function (err, fetchedObject){
          if (err) callback (err);
          else {
            infoBlock.full.badge.issuer = fetchedObject;
            callback(null);
          }
        });
      }
      // or the more standard case that we're analyzing an assertion and have now fetched the badgeclass
      else if (typeof infoBlock.full.badge.issuer === 'string') {
        badgeObject.warnings.push(new Warning("The Issuer file was linked from a remote resource and not embedded in the verified assertion. There's a slight possibility that the Issuer may have been modified from its original version."));
        fetchBadgeObject(infoBlock.full.badge.issuer, function (err, fetchedObject){
          if (err) callback (err);
          else {
            infoBlock.full.badge.issuer = fetchedObject;
            callback(null);
          }
        });
      }
      else {
        //either this wasn't a badgeclass or issuer was already an object
        callback(null);
      }
    },

    // expand JSON-LD again, on the full object
    function (callback){
      jsonld.expand(infoBlock.full, function (err, expanded){
        if (err) {
          callback(err); 
          return;
        }
        if (expanded.length === 0){
          err = new Warning("Failed to expand JSON-LD of full badge object.")
          infoBlock.warnings.push(err);
          callback (err);
        }

        // else, expansion worked:
        else {
          infoBlock.fullExpanded = expanded;
          callback (null);
        }
      });
    }
  ], 
  // result function:
  function (err) {
    if (err){ 
      readyToValidate(err);
      return;
    }

    // TODO: generate types from JSON-LD and put them into this block.
    if (infoBlock.full['@context'])
      contextBlocks.push({ pointer: '', type: 'http://openbadges.org/standard/1.1/OBI/standard#Assertion', context: infoBlock.full['@context'] });

    if (infoBlock.full.badge['@context'])
      contextBlocks.push({ pointer: '/badge', type: 'http://openbadges.org/standard/1.1/OBI/standard#BadgeClass', context: infoBlock.full.badge['@context'] });

    if (infoBlock.full.badge.issuer && infoBlock.full.badge.issuer['@context'])
      contextBlocks.push({ pointer: '/badge/issuer', type: 'http://openbadges.org/standard/1.1/OBI/standard#Issuer', context: infoBlock.full.badge.issuer['@context'] });

    // now, set to analyzin' them blocks.
    async.map(contextBlocks,analyzeContextBlock,function (err, results){
      if (err) {
        readyToValidate(err,null);
        return;
      }
      else{
        infoBlock.structures = infoBlock.structures.concat(_.flatten(results));
      }
      // to do: pass back full object with warnings, etc.
      readyToValidate(null, infoBlock);
    });

  });


  // Now, process to determine core schema validation rules to apply:
  function analyzeContextBlock(block, nextBlock){

    // Case 1: basic OBI object with no extensions just needs a single step:
    if (typeof block.context === 'string'){
      getSchemaForContext(block.context, block.type, function (err, schemaRef){
        if (err) {
          infoBlock.warnings.push(new Warning("Couldn't get schema reference for context doc: " + block.context));
          nextBlock(null, null);
        }
        else{
          nextBlock(null, { pointer: block.pointer, contextRef: block.context, schemaRef: schemaRef });
        }

      });
      return;
    }

    // Case 2: the extended format needs a few passes.
    else if (Array.isArray(block.context)) {
      
      // We need to build validation structures for the core OBI and for extensions. There are two possible types of element in this array (string or object).
      async.map(
        block.context, 
        function (curContext, nextElement){
          // 2A: for the basic OBI schema &/or any other schema that applies to top level of the pointer
          if (typeof curContext === 'string') {
            getSchemaForContext(curContext, block.type, function (err, schemaRef){
              if (err) {
                infoBlock.warnings.push(new Warning("Couldn't get schema reference for context doc: " + block.context));
                nextElement(null, null);
              }
              else{
                nextElement(null, { pointer: block.pointer, contextRef: curContext, schemaRef: schemaRef });
              }
            });
          }
          // 2B: for an object of key:iri mappings declaring badge object extensions
          else if (typeof curContext === 'object' && !Array.isArray(curContext)) {
            // for each key in the object, try to make a validation structure.
            async.map(
              Object.keys(curContext),
              function (item, nextKey){
                if (typeof curContext[item] === 'string')
                  getInfoForProp(pointdexter.get(infoBlock.full, block.pointer), item, function (propErr, propPointer, propContextRef, propSchemaRef){
                    if (propErr)
                      nextKey(propErr,null);
                    else
                      nextKey(null, { pointer: block.pointer + propPointer, contextRef: propContextRef, schemaRef: propSchemaRef })
                  });
                else
                  nextKey(new Warning("Malformed context entry at '" + pointer + item + "': " + curContext[item]), null);
              }, 
              function (propResultsError, propResultsArray){
                if (propResultsError)
                  nextElement(propResultsError);
                else
                  nextElement(null, propResultsArray);
              }
            );
          }
        },
        function (err, results){
          if (err) {
            nextBlock(err);
          }
          else{
            nextBlock(null,results);
          }
        }
      );
    }
  }
  
  

}


// calls back with a schema reference (URL) to apply to a certain type of object, under a specified context.
// FUTURE TODO: Would this fail if we're sending it an embedded context (like for a badgeclass but the schema is actually defined above in the main object context?)
function getSchemaForContext (contextRef, type, callback){
  contexts(contextRef, function (err, contextResult){

    // for cases where we know a type to look for in a dictionary of validations for different types:
    if (type && typeof contextResult.document['validation'][type] === 'string'){
      // console.log("CASE 1 " + contextRef);
      callback(null, contextResult.document['validation'][type]);
    }
    else if (type && typeof contextResult.document['validation'][type] === 'undefined' && typeof contextResult.document['validation']['default'] === 'string'){
      // console.log("CASE 2 " + contextRef);
      callback(null, contextResult.document['validation']['default']);
    }

    // otherwise, we expect a string URL of the validator. If that's not the case:
    else if (err || typeof contextResult.document['validation'] != 'string') {
      // console.log("CASE 3: " + contextRef);
      callback(err || new Error("Error: " + contextRef + " -- The context file's validation property wasn't a string or have the right validator registered when we expected it man, maaan."), null);
    }
    
    // otherwise, there's only one validator in the context, and it's properly a string (URL?):
    else{
      // console.log("CASE 4 " + contextRef + " &v: " + contextResult.document['validation']);
      callback(null, contextResult.document['validation']);
    }
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
  getSchemaForContext(contextRef,null, function (err, schemaRef){
    if(err){
      // TODO: Pass this as a regular warning back?
      console.log("Error identifying schema for contextRef " + contextRef + " -- Not adding to validation list.");
    }
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