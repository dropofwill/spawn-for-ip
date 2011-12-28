var fs = require('fs')
var os = require('os')
var windows = os.platform() === 'win32' ? true : false

exports.apitest = function(test, obj, functions, props) {
  functions.forEach(function(f) {
    test.ok(obj[f], f + " not found")
    test.equal(typeof obj[f], "function", f + " is not a function")
  })

  props.forEach(function(p) { 
    test.ok(obj[p] !== null && obj[p] !== undefined)
  })
}

exports.hostsExistSync = function(expected) {
	var file = windows ? path.join(process.env.SystemRoot, "System32", "drivers", "etc", "hosts") : "/etc/hosts"
	var data = fs.readFileSync(file)
	var lines = data.toString().split('\n')

	function _defined(lines, hostname) {
		var found = false
		lines.forEach(function(line) { if (line.indexOf(hostname) !== -1) found = true })
		return found
	}

	var notFound = []
	expected.forEach(function(host) { 
		if (!_defined(lines, host)) {
			console.error('host "%s" is not defined in %s', host, file)
			notFound.push(host)  
		}
	})
	return notFound.length === 0
}