/* A module to fetch hosted badge assertions & components of badges over HTTP */
const http = require('http');
const https = require('https');
const request = require('request');

const utils = require('./utils.js');


//callback signature is (err, JSON)
function load_object_remote(url, callback) {
  var options = {
    url: url,
    timeout: 3000
  };
   
  request(options, function(err,res,body) {
    if (err || res.statusCode != 200) {
      callback(new Error("Remote URL " + url + " could not be reached"), null);
    }
      
    //success:
    if (utils.isJson(body)){
      var badgeObject = JSON.parse(body);
      callback(null, badgeObject);
    }
    //such fail:
    else {
      console.log('Fetched badge object is not valid JSON');
      callback(new Error("Fetched badge object retrieved wasn't JSON"), body);
    }     
  });
}

module.exports = load_object_remote;