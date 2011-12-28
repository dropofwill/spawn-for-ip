var testCase = require('nodeunit').testCase
var nploy = require('../lib/nploy')
var request = require('request')
var spawn = require('child_process').spawn
var common = require('./lib/common')

var TEST_PORT = 4000

if (!common.hostsExistSync(['a.localhost', 'b.localhost'])) return

exports.cli = testCase({
  setUp: function(cb) {
    this.child = spawn(process.execPath, ['../bin/nploy', '-p', TEST_PORT], { cwd: __dirname })
    setTimeout(cb, 500)
  }

, tearDown: function(cb) {
    this.child.on('exit', function() { cb() })
    this.child.kill()
  }

, makeRequestA: function(test) {
    assertResponse('http://a.localhost:' + TEST_PORT, 'A: Hello', function (err, body) {
      test.ok(!err, err)
      test.ok(body, "got response from A")
      test.done()
    })
  }

, makeRequestB: function(test) {
    assertResponse('http://b.localhost:' + TEST_PORT, 'B: Hello', function (err, body) {
      test.ok(!err, err)
      test.ok(body)
      test.done()
    })
  }
})

function assertResponse (url, data, callback) {
  request.get(url, function (err, res, body) {
    if (err) return callback(err)
    if (body == data) {
      callback(null, body)
    } else {
      callback(new Error('Not equal'))
    }
  })
}
