#!/usr/bin/env node

const clc = require('cli-color');
const utils = require('../lib/utils.js');
const argv = require('optimist').argv;

// what does this do?
const parse = require('../');

const input = argv._[0];
var infile = argv.in||argv.infile;

const analyzer = require('../lib/badgeObjectAnalyzer.js');

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
  console.log(report.toString());
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
     
      // HERE'S THE EXCITING PART!
      analyzer.analyze(data, print_report);

    }
  }); 
}



process.on('SIGINT', function () {
  log('interrupt');
  process.exit(2);
});