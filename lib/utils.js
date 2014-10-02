/* Utilities oft used in analyzing badges */

// isJson: Determine if a string is JSON or not.
function isJson(str) {
  try { JSON.parse(str); return true }
  catch(e) { return false }
}
module.exports.isJson = isJson;

